import { NextResponse } from 'next/server';
import db from '@/lib/db.js';

export const dynamic = 'force-dynamic';

function getMatchLevel(localNombre, localApellido, dateasFullName) {
    if (!dateasFullName) return 0;
    const lNom = (localNombre || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    const lApe = (localApellido || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    const dFull = dateasFullName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    
    // Si nombre y apellido están completos dentro del nombre de Dateas
    if (lNom.length > 0 && lApe.length > 0 && dFull.includes(lNom) && dFull.includes(lApe)) {
        return 1; // 1 = Validado (Exact Match)
    }
    
    // Chequear similitud parcial (al menos una palabra clave coincide)
    const nomParts = lNom.split(/\s+/).filter(p => p.length > 2);
    const apeParts = lApe.split(/\s+/).filter(p => p.length > 2);
    const dParts = dFull.split(/\s+/).filter(p => p.length > 2);
    
    let anyMatch = false;
    for (const p of [...nomParts, ...apeParts]) {
        if (dParts.includes(p) || dFull.includes(p)) anyMatch = true;
    }
    
    if (anyMatch) return 2; // 2 = Validado con observación (Partial Match)
    
    return 3; // 3 = Falso/Rechazado (No coincide fonéticamente)
}

export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url);
        const run = searchParams.get('run');
        
        if (run === 'true') {
            try {
                const unverifiedPacientes = db.prepare(`
                    SELECT id, nombre, apellido, cedula 
                    FROM pacientes 
                    WHERE cne_validado = 0 
                      AND cedula IS NOT NULL 
                      AND cedula != ''
                    LIMIT 5
                `).all();

                const unverifiedExternos = db.prepare(`
                    SELECT id, nombre, apellido, cedula 
                    FROM registros_externos 
                    WHERE cne_validado = 0 
                      AND cedula IS NOT NULL 
                      AND cedula != ''
                    LIMIT 5
                `).all();

                const allUnverified = [
                    ...unverifiedPacientes.map(p => ({ ...p, table: 'pacientes' })),
                    ...unverifiedExternos.map(p => ({ ...p, table: 'registros_externos' }))
                ].slice(0, 5);

                if (allUnverified.length === 0) {
                    console.log("[CNE Validation] No hay más registros por validar.");
                    return NextResponse.json({
                        status: 'ok',
                        finished: true,
                        message: 'No hay más registros pendientes.'
                    });
                }

                let rateLimited = false;

                for (const record of allUnverified) {
                    const cleanCedula = record.cedula.replace(/[^0-9]/g, '');
                    
                    if (cleanCedula.length < 5) {
                        db.prepare(`UPDATE ${record.table} SET cne_validado = 4 WHERE id = ?`).run(record.id);
                        console.log(`[CNE Validation Dateas] ⏩ Omitido (Cédula inválida): ${record.cedula}`);
                        continue;
                    }

                    try {
                        const baseUrl = 'https://www.sistemaspnp.com/cedula/';
                        const postUrl = 'https://www.sistemaspnp.com/cedula/resultado.php';

                        // 1. Fase GET (obtener captcha y cookies)
                        const getRes = await fetch(baseUrl, {
                            headers: {
                                'accept': 'text/html',
                                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                            }
                        });

                        if (!getRes.ok) {
                            if (getRes.status === 429) {
                                console.log("[CNE Validation PNP] Límite de peticiones excedido (429).");
                                rateLimited = true;
                                break;
                            }
                            throw new Error(`GET failed with status ${getRes.status}`);
                        }

                        const getHtml = await getRes.text();
                        const cookies = getRes.headers.get('set-cookie') || '';
                        
                        // 2. Fase Resolución de CAPTCHA
                        const captchaMatch = getHtml.match(/CAPTCHA: ¿Cuánto es (\d+) \+ (\d+)\?/);
                        if (!captchaMatch) {
                            throw new Error("No se encontró el CAPTCHA en la página.");
                        }
                        const answer = parseInt(captchaMatch[1], 10) + parseInt(captchaMatch[2], 10);

                        // 3. Fase POST
                        const isExtranjero = record.cedula.trim().toUpperCase().startsWith('E');
                        const nacionalidad = isExtranjero ? 'E' : 'V';

                        const formData = new URLSearchParams();
                        formData.append('nacionalidad', nacionalidad);
                        formData.append('cedula', cleanCedula);
                        formData.append('captcha', answer);
                        formData.append('jeje', '');

                        const postRes = await fetch(postUrl, {
                            method: 'POST',
                            headers: {
                                'accept': 'text/html',
                                'content-type': 'application/x-www-form-urlencoded',
                                'cookie': cookies,
                                'referer': baseUrl,
                                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                            },
                            body: formData.toString()
                        });

                        if (!postRes.ok) {
                            throw new Error(`POST failed with status ${postRes.status}`);
                        }

                        const postHtml = await postRes.text();
                        const cleanHtml = postHtml.replace(/\s+/g, ' ');

                        // 4. Fase Extracción
                        if (cleanHtml.includes('RECORD_NOT_FOUND')) {
                            db.prepare(`UPDATE ${record.table} SET cne_validado = 3 WHERE id = ?`).run(record.id);
                            console.log(`[CNE Validation PNP] ❌ No se encontró la cédula ${cleanCedula}`);
                        } else if (cleanHtml.includes('CAPTCHA incorrecto')) {
                            console.log(`[CNE Validation PNP] ⚠️ CAPTCHA incorrecto o sesión inválida para ${cleanCedula}`);
                            // No actualizamos estado para que reintente luego
                        } else {
                            // Extraer Nombres, Primer Apellido, Segundo Apellido
                            const matchNombres = cleanHtml.match(/<strong>Nombres:<\/strong>\s*([^<]+)/i);
                            const matchApellido1 = cleanHtml.match(/<strong>Primer Apellido:<\/strong>\s*([^<]+)/i);
                            const matchApellido2 = cleanHtml.match(/<strong>Segundo Apellido:<\/strong>\s*([^<]+)/i);

                            if (matchNombres) {
                                const nombres = matchNombres[1].trim();
                                const ap1 = matchApellido1 ? matchApellido1[1].trim() : '';
                                const ap2 = matchApellido2 ? matchApellido2[1].trim() : '';
                                
                                const pnpFullName = `${nombres} ${ap1} ${ap2}`.replace(/\s+/g, ' ').trim();
                                
                                const matchLevel = getMatchLevel(record.nombre, record.apellido, pnpFullName);
                                
                                if (matchLevel === 1 || matchLevel === 2) {
                                    db.prepare(`UPDATE ${record.table} SET cne_validado = ? WHERE id = ?`).run(matchLevel, record.id);
                                    console.log(`[CNE Validation PNP] ${matchLevel === 1 ? '✅ Exacto' : '⚠️ Parcial'} (${record.table}): ${record.nombre} ${record.apellido} (${cleanCedula})`);
                                } else {
                                    db.prepare(`UPDATE ${record.table} SET cne_validado = 3 WHERE id = ?`).run(record.id);
                                    console.log(`[CNE Validation PNP] ❌ Rechazado (No coincide): ${record.nombre} vs ${pnpFullName}`);
                                }
                            } else {
                                console.log(`[CNE Validation PNP] ⚠️ HTML inesperado para ${cleanCedula}`);
                            }
                        }
                    } catch (err) {
                        console.error("[CNE Validation PNP] Error en petición:", err.message);
                    }
                    
                    // Pausa entre peticiones secuenciales
                    await new Promise(r => setTimeout(r, 800));
                }

                if (rateLimited) {
                    return NextResponse.json({
                        status: 'rate_limit',
                        message: 'Límite excedido. El frontend debe pausar un momento.'
                    });
                }
                
                return NextResponse.json({
                    status: 'ok',
                    finished: false,
                    message: `Lote de ${allUnverified.length} registros procesado exitosamente.`
                });
                
            } catch (err) {
                console.error("[CNE Validation] Error en batch:", err);
                return NextResponse.json({ error: err.message }, { status: 500 });
            }
        }
        
        // Get stats for UI
        const validadosPacientes = db.prepare("SELECT COUNT(*) as c FROM pacientes WHERE cne_validado IN (1, 2)").get().c;
        const validadosExternos = db.prepare("SELECT COUNT(*) as c FROM registros_externos WHERE cne_validado IN (1, 2)").get().c;
        const rechazadosPacientes = db.prepare("SELECT COUNT(*) as c FROM pacientes WHERE cne_validado = 3").get().c;
        const rechazadosExternos = db.prepare("SELECT COUNT(*) as c FROM registros_externos WHERE cne_validado = 3").get().c;
        
        const procesadosPac = db.prepare("SELECT COUNT(*) as c FROM pacientes WHERE cne_validado > 0").get().c;
        const procesadosExt = db.prepare("SELECT COUNT(*) as c FROM registros_externos WHERE cne_validado > 0").get().c;
        
        return NextResponse.json({
            status: 'ok',
            total_validados: validadosPacientes + validadosExternos,
            total_rechazados: rechazadosPacientes + rechazadosExternos,
            total_procesados: procesadosPac + procesadosExt,
            message: 'El endpoint de validación CNE con Dateas está operativo.'
        });
        
    } catch (error) {
        console.error("CNE Validation API Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
