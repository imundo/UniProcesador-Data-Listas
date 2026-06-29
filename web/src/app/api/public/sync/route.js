import { NextResponse } from 'next/server';
import db from '@/lib/db.js';

export const dynamic = 'force-dynamic';

export async function POST(req) {
    try {
        const authHeader = req.headers.get('authorization');
        const expectedToken = process.env.UNIFICAR_SYNC_TOKEN;

        // Si no hay token configurado en el servidor, bloqueamos por seguridad
        if (!expectedToken) {
            return NextResponse.json({ error: "El servidor no tiene configurado UNIFICAR_SYNC_TOKEN" }, { status: 500 });
        }

        // Verificamos el token (Formato esperado: "Bearer mY_SeCrEt_ToKeN")
        if (!authHeader || authHeader.replace('Bearer ', '').trim() !== expectedToken) {
            return NextResponse.json({ error: "No autorizado. Token inválido o ausente." }, { status: 401 });
        }

        const body = await req.json();
        const records = Array.isArray(body) ? body : [body];

        if (records.length === 0) {
            return NextResponse.json({ error: "No se enviaron registros" }, { status: 400 });
        }

        let insertedCount = 0;
        let updatedCount = 0;
        let errorCount = 0;

        const insertStmt = db.prepare(`
            INSERT INTO registros_externos (nombre, apellido, cedula, centro, edad_sector, estado, origen, fuente_url, cne_validado)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(nombre, apellido, cedula, origen) DO UPDATE SET
            centro=excluded.centro,
            estado=excluded.estado,
            edad_sector=excluded.edad_sector,
            fuente_url=excluded.fuente_url,
            creado_en=CURRENT_TIMESTAMP
        `);

        // Usar una transacción para insertar masivamente
        const insertMany = db.transaction((recs) => {
            for (const r of recs) {
                try {
                    // Validar campos requeridos
                    if (!r.origen || (!r.nombre && !r.apellido)) {
                        errorCount++;
                        continue;
                    }

                    const res = insertStmt.run(
                        (r.nombre || '').trim(),
                        (r.apellido || '').trim(),
                        (r.cedula || '').toString().trim(),
                        (r.centro || '').trim(),
                        (r.edad_sector || '').trim(),
                        (r.estado || 'Desconocido').trim(),
                        (r.origen || 'API Externa').trim(),
                        (r.fuente_url || '').trim(),
                        r.cne_validado ? 1 : 0
                    );

                    // changes = 1 significa INSERT nuevo, changes = 2 significa UPDATE (upsert behavior in sqlite)
                    if (res.changes === 1) insertedCount++;
                    else if (res.changes > 1) updatedCount++;
                } catch (e) {
                    errorCount++;
                    console.error("Error insertando registro desde API pública:", e);
                }
            }
        });

        insertMany(records);

        return NextResponse.json({
            status: "success",
            message: "Sincronización completada",
            stats: {
                recibidos: records.length,
                nuevos_insertados: insertedCount,
                actualizados: updatedCount,
                errores: errorCount
            }
        }, { status: 200 });

    } catch (error) {
        console.error("Public Sync API Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
