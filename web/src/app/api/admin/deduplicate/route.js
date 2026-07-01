import db from '@/lib/db';
export const dynamic = 'force-dynamic';

export async function POST(req) {
    const authHeader = req.headers.get('authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.split(' ')[1] !== 'Amazonas=90') {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        let deletedPacientes = 0;
        let deletedExternos = 0;

        // Inicia transacción para seguridad
        const runDeduplication = db.transaction(() => {
            // 1. Desduplicación en la tabla Pacientes
            // Agrupamos por cédula y conservamos el ID más antiguo (MIN(id))
            // Solo aplicamos a aquellos que TIENEN cédula.
            const resultPac = db.prepare(`
                DELETE FROM pacientes
                WHERE id NOT IN (
                    SELECT MIN(id)
                    FROM pacientes
                    WHERE cedula IS NOT NULL AND cedula != ''
                    GROUP BY cedula
                )
                AND cedula IS NOT NULL AND cedula != ''
            `).run();
            deletedPacientes += resultPac.changes;

            // 2. Desduplicación en la tabla registros_externos
            const resultExt = db.prepare(`
                DELETE FROM registros_externos
                WHERE id NOT IN (
                    SELECT MIN(id)
                    FROM registros_externos
                    WHERE cedula IS NOT NULL AND cedula != ''
                    GROUP BY cedula, origen
                )
                AND cedula IS NOT NULL AND cedula != ''
            `).run();
            deletedExternos += resultExt.changes;

            // Actualizamos stats del sistema (opcional)
            db.prepare(`UPDATE system_stats SET value = value + ? WHERE key = 'local_duplicates_removed'`).run(deletedPacientes);
            db.prepare(`UPDATE system_stats SET value = value + ? WHERE key = 'external_duplicates_removed'`).run(deletedExternos);
        });

        runDeduplication();

        return Response.json({ 
            success: true, 
            message: `Desduplicación completada. Eliminados: ${deletedPacientes} (Local) y ${deletedExternos} (Externos).`,
            details: {
                deletedPacientes,
                deletedExternos
            }
        });

    } catch (e) {
        console.error("Error en desduplicación:", e);
        return Response.json({ success: false, error: e.message }, { status: 500 });
    }
}
