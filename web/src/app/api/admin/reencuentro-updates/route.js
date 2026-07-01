import db from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req) {
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.split(' ')[1] !== 'Amazonas=90') {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const history = db.prepare(`
            SELECT h.fecha AS fecha_cambio, h.estado_anterior, h.estado_nuevo AS nuevo_estado, p.nombre, p.apellido, p.cedula
            FROM historial_estados h
            JOIN pacientes p ON h.registro_id = p.id AND h.tipo_registro = 'local'
            WHERE h.origen_nombre = 'Reencuentro.help'
            ORDER BY h.fecha DESC
            LIMIT 20
        `).all();

        return Response.json({ success: true, updates: history });
    } catch (e) {
        return Response.json({ error: e.message }, { status: 500 });
    }
}
