import { NextResponse } from 'next/server';
import db from '@/lib/db.js';

export const dynamic = 'force-dynamic';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const run = searchParams.get('run');
        
        if (run === 'true') {
            try {
                // Seleccionamos registros donde cedula está vacía o nula y cne_validado = 0
                const unverifiedPacientes = db.prepare(`
                    SELECT id, nombre, apellido, cedula 
                    FROM pacientes 
                    WHERE cne_validado = 0 
                      AND (cedula IS NULL OR cedula = '')
                    LIMIT 5
                `).all();

                const unverifiedExternos = db.prepare(`
                    SELECT id, nombre, apellido, cedula 
                    FROM registros_externos 
                    WHERE cne_validado = 0 
                      AND (cedula IS NULL OR cedula = '')
                    LIMIT 5
                `).all();

                const allUnverified = [
                    ...unverifiedPacientes.map(p => ({ ...p, table: 'pacientes' })),
                    ...unverifiedExternos.map(p => ({ ...p, table: 'registros_externos' }))
                ].slice(0, 5);

                if (allUnverified.length === 0) {
                    return NextResponse.json({
                        status: 'ok',
                        finished: true,
                        message: 'No hay más registros pendientes para búsqueda inversa.'
                    });
                }

                let processedCount = 0;

                for (const record of allUnverified) {
                    processedCount++;
                    const cleanName = encodeURIComponent(`${record.nombre} ${record.apellido}`.trim());
                    
                    try {
                        const url = `https://www.dateas.com/es/consulta_venezuela?name=${cleanName}&cedula=`;
                        const res = await fetch(url, {
                            headers: {
                                'accept': 'text/html',
                                'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
                            }
                        });

                        if (res.ok) {
                            const html = await res.text();
                            const cleanHtml = html.replace(/\s+/g, ' ');
                            
                            // Dateas devuelve filas en una tabla: <td>...</td>
                            const matches = [...cleanHtml.matchAll(/<td data-label="Nombre">\s*<a[^>]*>([^<]+)<\/a>\s*<\/td>\s*<td data-label="Cédula">\s*<a[^>]*>([^<]+)<\/a>\s*<\/td>/gi)];
                            
                            if (matches.length === 1) {
                                // 1 match exacto
                                const dateasName = matches[0][1].trim();
                                const dateasCedula = matches[0][2].trim();
                                
                                db.prepare(`UPDATE ${record.table} SET cne_validado = 1, cedula = ? WHERE id = ?`).run(dateasCedula, record.id);
                                console.log(`[Reverse CNE] ✅ Exacto (${record.table}): ${record.nombre} ${record.apellido} -> ${dateasCedula}`);
                            } else if (matches.length > 1) {
                                // Homónimo
                                const options = matches.map(m => ({ nombre: m[1].trim(), cedula: m[2].trim() }));
                                
                                // Retrieve existing metadata to update it safely
                                const existingRow = db.prepare(`SELECT metadata FROM ${record.table} WHERE id = ?`).get(record.id);
                                let metaObj = {};
                                if (existingRow && existingRow.metadata) {
                                    try { metaObj = JSON.parse(existingRow.metadata); } catch(e) {}
                                }
                                metaObj.cne_homonimos = options;
                                
                                db.prepare(`UPDATE ${record.table} SET cne_validado = 5, metadata = ? WHERE id = ?`).run(JSON.stringify(metaObj), record.id);
                                console.log(`[Reverse CNE] ⚠️ Homónimos encontrados para ${record.nombre} ${record.apellido}: ${matches.length} opciones`);
                            } else {
                                // 0 matches
                                db.prepare(`UPDATE ${record.table} SET cne_validado = 6 WHERE id = ?`).run(record.id);
                                console.log(`[Reverse CNE] ❌ No encontrado: ${record.nombre} ${record.apellido}`);
                            }
                        } else if (res.status === 429) {
                            console.log("[Reverse CNE] Límite de peticiones excedido (429).");
                            return NextResponse.json({
                                status: 'rate_limit',
                                message: 'Límite excedido. El frontend debe pausar un momento.'
                            });
                        }
                    } catch (err) {
                        console.error("[Reverse CNE] Error en petición:", err.message);
                    }

                    if (processedCount < allUnverified.length) {
                        await new Promise(r => setTimeout(r, 1500));
                    }
                }
                
                return NextResponse.json({
                    status: 'ok',
                    finished: false,
                    message: `Lote inverso de ${allUnverified.length} registros procesado exitosamente.`
                });
                
            } catch (err) {
                console.error("[Reverse CNE] Error en batch:", err);
                return NextResponse.json({ error: err.message }, { status: 500 });
            }
        }
        
        // Get stats for UI
        const procesadosPac = db.prepare("SELECT COUNT(*) as c FROM pacientes WHERE cne_validado IN (1, 5, 6) AND (cedula IS NULL OR cedula = '')").get().c;
        const procesadosExt = db.prepare("SELECT COUNT(*) as c FROM registros_externos WHERE cne_validado IN (1, 5, 6) AND (cedula IS NULL OR cedula = '')").get().c;
        
        const resueltosPac = db.prepare("SELECT COUNT(*) as c FROM pacientes WHERE cne_validado = 1 AND (cedula IS NOT NULL AND cedula != '')").get().c;
        const resueltosExt = db.prepare("SELECT COUNT(*) as c FROM registros_externos WHERE cne_validado = 1 AND (cedula IS NOT NULL AND cedula != '')").get().c;

        const homonimosPac = db.prepare("SELECT COUNT(*) as c FROM pacientes WHERE cne_validado = 5").get().c;
        const homonimosExt = db.prepare("SELECT COUNT(*) as c FROM registros_externos WHERE cne_validado = 5").get().c;
        
        return NextResponse.json({
            status: 'ok',
            total_procesados: procesadosPac + procesadosExt,
            total_resueltos: resueltosPac + resueltosExt,
            total_homonimos: homonimosPac + homonimosExt,
            message: 'El endpoint de búsqueda inversa está operativo.'
        });
        
    } catch (error) {
        console.error("Reverse CNE API Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
