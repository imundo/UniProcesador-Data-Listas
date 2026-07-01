import db from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req) {
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.split(' ')[1] !== 'Amazonas=90') {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const history = db.prepare(`
            SELECT h.fecha_cambio, h.estado_anterior, h.nuevo_estado, p.nombre, p.apellido, p.cedula
            FROM historial_estados h
            JOIN pacientes p ON h.paciente_id = p.id
            WHERE h.origen = 'Reencuentro.help'
            ORDER BY h.fecha_cambio DESC
            LIMIT 20
        `).all();

        return Response.json({ success: true, updates: history });
    } catch (e) {
        return Response.json({ error: e.message }, { status: 500 });
    }
}
