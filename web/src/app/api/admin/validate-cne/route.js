import { NextResponse } from 'next/server';
import db from '@/lib/db.js';

export const dynamic = 'force-dynamic';

function cleanAndMatchName(localName, verifikName) {
    if (!localName || !verifikName) return false;
    
    // Convert both to lowercase
    const local = localName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    
    // Remove asterisks from Verifik name and trim spaces
    const verifikClean = verifikName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\*/g, '').trim();
    
    if (verifikClean.length < 3) return false; // Too little information to match safely
    
    // Split into parts (in case Verifik returns multiple unmasked words like "LUIS JAVIER")
    const verifikParts = verifikClean.split(/\s+/).filter(p => p.length > 2);
    
    // If we have parts, check if AT LEAST ONE unmasked part exists in the local name
    for (const part of verifikParts) {
        if (local.includes(part)) {
            return true;
        }
    }
    
    return false;
}

export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url);
        const run = searchParams.get('run');
        
        if (run === 'true') {
            // No API key required for Dateas
            // We can just proceed

            // Tomar 20 pacientes locales no validados que tengan cédula válida (solo números)
            const unverifiedPacientes = db.prepare(`
                SELECT id, nombre, apellido, cedula 
                FROM pacientes 
                WHERE cne_validado = 0 
                  AND cedula IS NOT NULL 
                  AND cedula != ''
                LIMIT 20
            `).all();

            // Tomar 20 registros_externos no validados
            const unverifiedExternos = db.prepare(`
                SELECT id, nombre, apellido, cedula 
                FROM registros_externos 
                WHERE cne_validado = 0 
                  AND cedula IS NOT NULL 
                  AND cedula != ''
                LIMIT 20
            `).all();

            const allUnverified = [
                ...unverifiedPacientes.map(p => ({ ...p, table: 'pacientes' })),
                ...unverifiedExternos.map(p => ({ ...p, table: 'registros_externos' }))
            ].slice(0, 20); // Tomar solo 20 en total por ciclo

            // Ejecutar en segundo plano para no saturar el servidor ni bloquear la petición HTTP
            setTimeout(async () => {
                for (const record of allUnverified) {
                const cleanCedula = record.cedula.replace(/[^0-9]/g, '');
                
                if (cleanCedula.length < 5) continue; // Cédula inválida

                try {
                    const url = `https://www.dateas.com/es/consulta_venezuela?name=&cedula=${cleanCedula}`;
                    const res = await fetch(url, {
                        headers: {
                            'accept': 'text/html',
                            'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
                        }
                    });

                    if (res.ok) {
                        const html = await res.text();
                        // Extract name from Dateas table
                        // Format: <td data-label="Nombre"><a href="...">NOMBRE AQUI</a></td>
                        const cleanHtml = html.replace(/\s+/g, ' ');
                        const match = cleanHtml.match(/<td data-label="Nombre">\s*<a[^>]*>([^<]+)<\/a>/i);
                        
                        if (match && match[1]) {
                            const vFullName = match[1].trim();
                            
                            // Check if local name matches the scraped name
                            const nameMatch = cleanAndMatchName(record.nombre, vFullName);
                            const lastMatch = cleanAndMatchName(record.apellido, vFullName);
                            
                            if (nameMatch || lastMatch) {
                                db.prepare(`UPDATE ${record.table} SET cne_validado = 1 WHERE id = ?`).run(record.id);
                                console.log(`[CNE Validation Dateas] ✅ Validado (${record.table}): ${record.nombre} ${record.apellido} (${cleanCedula})`);
                            } else {
                                console.log(`[CNE Validation Dateas] ❌ Rechazado (No coincide fonética): ${record.nombre} vs ${vFullName}`);
                            }
                        } else {
                            console.log(`[CNE Validation Dateas] ⚠️ No se encontró la cédula ${cleanCedula} en Dateas`);
                        }
                    } else if (res.status === 429) {
                        console.log("[CNE Validation Dateas] Límite de peticiones excedido (429). Pausando...");
                        break;
                    } else {
                        console.log(`[CNE Validation Dateas] Error HTTP ${res.status} para CI ${cleanCedula}`);
                    }
                } catch (err) {
                    console.error("[CNE Validation Dateas] Error en petición:", err.message);
                }

                // Pausa de 2 segundos para evitar saturar Dateas y que nos bloqueen la IP
                await new Promise(r => setTimeout(r, 2000));
            }
            console.log("[CNE Validation] Ciclo finalizado.");
            }, 0);
            
            return NextResponse.json({
                status: 'ok',
                message: 'Validación en segundo plano iniciada con Dateas.'
            });
        }
        
        // Get stats for UI
        const validadosPacientes = db.prepare("SELECT COUNT(*) as c FROM pacientes WHERE cne_validado = 1").get().c;
        const validadosExternos = db.prepare("SELECT COUNT(*) as c FROM registros_externos WHERE cne_validado = 1").get().c;
        
        return NextResponse.json({
            status: 'ok',
            total_validados: validadosPacientes + validadosExternos,
            message: 'El endpoint de validación CNE con Verifik está operativo.'
        });
        
    } catch (error) {
        console.error("CNE Validation API Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
