import db from '@/lib/db';
export const dynamic = 'force-dynamic';

export async function GET(req) {
    const authHeader = req.headers.get('authorization');

    // Extract Bearer token or check URL params if testing from browser
    const url = new URL(req.url);
    const token = url.searchParams.get('token') || (authHeader ? authHeader.split(' ')[1] : null);

    if (token !== 'Amazonas=90') {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // Obtenemos todos los pacientes validados y limpios
        const rows = db.prepare(`
            SELECT id, nombre, apellido, cedula, centro, edad_sector, estatus, cne_validado, fecha_ingreso
            FROM pacientes
            ORDER BY id ASC
        `).all();

        // Convertimos a JSON
        const jsonString = JSON.stringify(rows, null, 2);

        // Preparamos los headers para forzar la descarga como un archivo
        return new Response(jsonString, {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Content-Disposition': 'attachment; filename="base_datos_limpia.json"'
            }
        });
    } catch (e) {
        console.error("Error al exportar base de datos:", e);
        return Response.json({ success: false, error: e.message }, { status: 500 });
    }
}
