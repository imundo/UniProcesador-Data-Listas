import db from '@/lib/db';

let isSyncing = false;
let syncStats = {
    totalProcesados: 0,
    totalActualizados: 0,
    totalErrores: 0,
    ultimoProcesado: null
};

// Mapa de traducción de 'kind' de Reencuentro a nuestros 'estatus'
const KIND_TO_STATUS = {
    'missing': 'desaparecido',
    'found': 'rescatado',
    'reunited': 'reencontrado',
    'safe': 'localizado' // por si acaso
};

// Función principal del Worker
async function runReencuentroSync() {
    isSyncing = true;
    syncStats = {
        totalProcesados: 0,
        totalActualizados: 0,
        totalErrores: 0,
        ultimoProcesado: null
    };

    try {
        // Obtener pacientes priorizando los que nunca se han sincronizado o los más antiguos
        const pacientes = db.prepare(`
            SELECT * FROM pacientes 
            ORDER BY last_reencuentro_sync ASC NULLS FIRST 
        `).all();

        for (const pac of pacientes) {
            if (!isSyncing) break; // Check for stop signal
            
            try {
                // 1. Crear query: Si tiene cédula, usamos la cédula. Si no, Nombre + Apellido.
                let query = '';
                if (pac.cedula && pac.cedula.trim() !== '') {
                    query = `C.I. ${pac.cedula}`;
                } else {
                    query = `${pac.nombre} ${pac.apellido}`.trim();
                }

                if (!query) continue;

                // 2. Fetch a Reencuentro Chat API
                const reqBody = {
                    messages: [{ role: 'user', content: query }],
                    visitor_id: 'rv_sync_bot',
                    country: 'VE'
                };

                const res = await fetch('https://rwqhswywmdjqyqnpsxqw.supabase.co/functions/v1/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(reqBody)
                });

                if (!res.ok) {
                    throw new Error(`HTTP Error ${res.status}`);
                }

                const data = await res.json();
                const candidates = data.candidates || [];

                let matchedCandidate = null;

                // 3. Evaluar coincidencias
                if (pac.cedula && pac.cedula.trim() !== '') {
                    // Match estricto por cédula si usamos cédula
                    matchedCandidate = candidates.find(c => c.cedula && c.cedula.replace(/\D/g,'') === pac.cedula.replace(/\D/g,''));
                } else {
                    // Match por nombre
                    const qName = query.toLowerCase();
                    matchedCandidate = candidates.find(c => c.display_name && c.display_name.toLowerCase().includes(qName));
                }

                // 4. Si hay match y el estado cambió
                if (matchedCandidate && matchedCandidate.kind) {
                    const newStatus = KIND_TO_STATUS[matchedCandidate.kind];
                    if (newStatus && newStatus !== pac.estatus.toLowerCase()) {
                        
                        db.transaction(() => {
                            // Actualizar estatus
                            db.prepare(`
                                UPDATE pacientes 
                                SET estatus = ?, last_reencuentro_sync = CURRENT_TIMESTAMP 
                                WHERE id = ?
                            `).run(newStatus, pac.id);
                            
                            // Insertar en historial
                            db.prepare(`
                                INSERT INTO historial_estados (paciente_id, estado_anterior, nuevo_estado, origen)
                                VALUES (?, ?, ?, ?)
                            `).run(pac.id, pac.estatus, newStatus, 'Reencuentro.help');
                        })();
                        
                        syncStats.totalActualizados++;
                    } else {
                        // Solo actualizar la fecha de ultima sincronización
                        db.prepare(`UPDATE pacientes SET last_reencuentro_sync = CURRENT_TIMESTAMP WHERE id = ?`).run(pac.id);
                    }
                } else {
                    // Actualizar timestamp para no re-procesarlo de inmediato
                    db.prepare(`UPDATE pacientes SET last_reencuentro_sync = CURRENT_TIMESTAMP WHERE id = ?`).run(pac.id);
                }

                syncStats.totalProcesados++;
                syncStats.ultimoProcesado = query;

                // Rate limiting (evitar baneos). 1 peticion cada 1.5 segundos.
                await new Promise(r => setTimeout(r, 1500));

            } catch (err) {
                console.error("Reencuentro Sync Error for", pac.id, err.message);
                syncStats.totalErrores++;
                // Wait longer if we hit an error (rate limit backoff)
                await new Promise(r => setTimeout(r, 5000));
            }
        }
    } catch (globalErr) {
        console.error("Reencuentro Sync Global Error:", globalErr);
    } finally {
        isSyncing = false;
    }
}

export const dynamic = 'force-dynamic';

export async function GET(req) {
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.split(' ')[1] !== 'Amazonas=90') {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(req.url);
    const start = url.searchParams.get('start') === 'true';
    const stop = url.searchParams.get('stop') === 'true';

    if (start && !isSyncing) {
        runReencuentroSync(); // run in background
        return Response.json({ success: true, message: 'Sincronización iniciada', stats: syncStats });
    }

    if (stop && isSyncing) {
        isSyncing = false;
        return Response.json({ success: true, message: 'Sincronización detenida', stats: syncStats });
    }

    return Response.json({
        isSyncing,
        stats: syncStats
    });
}
