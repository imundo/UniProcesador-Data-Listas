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
            console.log("[CNE Validation] Iniciando background job de validación con Verifik...");
            const apiKey = process.env.VERIFIK_API_KEY;
            
            if (!apiKey) {
                console.log("[CNE Validation] ABORTADO: No se encontró la variable de entorno VERIFIK_API_KEY.");
                return NextResponse.json({ error: "Falta VERIFIK_API_KEY" }, { status: 401 });
            }

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

            for (const record of allUnverified) {
                // Extraer solo los números de la cédula (ej. "V-12.345.678" -> "12345678")
                const cleanCedula = record.cedula.replace(/[^0-9]/g, '');
                
                if (cleanCedula.length < 5) continue; // Cédula inválida

                try {
                    const url = \`https://api.verifik.co/v2/ve/cedula?documentType=CCVE&documentNumber=\${cleanCedula}\`;
                    const res = await fetch(url, {
                        headers: {
                            'Authorization': \`jwt \${apiKey}\`
                        }
                    });

                    if (res.ok) {
                        const data = await res.json();
                        const vData = data.data;
                        
                        if (vData) {
                            const vFirstName = vData.firstName || '';
                            const vLastName = vData.lastName || '';
                            
                            // Check first name or last name
                            const nameMatch = cleanAndMatchName(record.nombre, vFirstName);
                            const lastMatch = cleanAndMatchName(record.apellido, vLastName);
                            
                            if (nameMatch || lastMatch) {
                                db.prepare(\`UPDATE \${record.table} SET cne_validado = 1 WHERE id = ?\`).run(record.id);
                                console.log(\`[CNE Validation] ✅ Validado (\${record.table}): \${record.nombre} \${record.apellido} (\${cleanCedula})\`);
                            } else {
                                console.log(\`[CNE Validation] ❌ Rechazado (No coincide fonética): \${record.nombre} vs \${vFirstName}\`);
                            }
                        }
                    } else if (res.status === 429) {
                        console.log("[CNE Validation] Límite de peticiones excedido (429). Pausando...");
                        break;
                    } else {
                        console.log(\`[CNE Validation] Error API Verifik HTTP \${res.status} para CI \${cleanCedula}\`);
                    }
                } catch (err) {
                    console.error("[CNE Validation] Error en petición:", err.message);
                }

                // Pausa de 1 segundo para evitar saturar la API
                await new Promise(r => setTimeout(r, 1000));
            }
            console.log("[CNE Validation] Ciclo finalizado.");
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
