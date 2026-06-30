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

                let processedCount = 0;
                for (const record of allUnverified) {
                    processedCount++;
                    const cleanCedula = record.cedula.replace(/[^0-9]/g, '');
                    
                    if (cleanCedula.length < 5) {
                        db.prepare(`UPDATE ${record.table} SET cne_validado = 4 WHERE id = ?`).run(record.id);
                        console.log(`[CNE Validation Dateas] ⏩ Omitido (Cédula inválida): ${record.cedula}`);
                        continue;
                    }
                    
                    const numCedula = parseInt(cleanCedula, 10);
                    if (numCedula > 22000000) {
                        db.prepare(`UPDATE ${record.table} SET cne_validado = 4 WHERE id = ?`).run(record.id);
                        console.log(`[CNE Validation Dateas] ⏩ Omitido (> 22M): ${cleanCedula}`);
                        continue;
                    }

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
                            const cleanHtml = html.replace(/\s+/g, ' ');
                            const match = cleanHtml.match(/<td data-label="Nombre">\s*<a[^>]*>([^<]+)<\/a>/i);
                            
                            if (match && match[1]) {
                                const vFullName = match[1].trim();
                                const matchLevel = getMatchLevel(record.nombre, record.apellido, vFullName);
                                
                                if (matchLevel === 1 || matchLevel === 2) {
                                    db.prepare(`UPDATE ${record.table} SET cne_validado = ? WHERE id = ?`).run(matchLevel, record.id);
                                    console.log(`[CNE Validation Dateas] ${matchLevel === 1 ? '✅ Exacto' : '⚠️ Parcial'} (${record.table}): ${record.nombre} ${record.apellido} (${cleanCedula})`);
                                } else {
                                    db.prepare(`UPDATE ${record.table} SET cne_validado = 3 WHERE id = ?`).run(record.id);
                                    console.log(`[CNE Validation Dateas] ❌ Rechazado (No coincide): ${record.nombre} vs ${vFullName}`);
                                }
                            } else {
                                db.prepare(`UPDATE ${record.table} SET cne_validado = 3 WHERE id = ?`).run(record.id);
                                console.log(`[CNE Validation Dateas] ❌ No se encontró la cédula ${cleanCedula} en Dateas`);
                            }
                        } else if (res.status === 429) {
                            console.log("[CNE Validation Dateas] Límite de peticiones excedido (429).");
                            return NextResponse.json({
                                status: 'rate_limit',
                                message: 'Límite excedido. El frontend debe pausar un momento.'
                            });
                        }
                    } catch (err) {
                        console.error("[CNE Validation Dateas] Error en petición:", err.message);
                    }

                    // Pausa de 1.5s entre peticiones del mismo lote
                    if (processedCount < allUnverified.length) {
                        await new Promise(r => setTimeout(r, 1500));
                    }
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
