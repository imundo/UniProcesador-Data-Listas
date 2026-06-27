import { NextResponse } from 'next/server';
import db from '@/lib/db.js';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const pacientes = db.prepare('SELECT nombre, apellido, cedula, centro, edad_sector FROM pacientes ORDER BY id ASC').all();
        
        let csvContent = "nombre,apellido,cedula,centro,edad_sector\n";
        
        for (const p of pacientes) {
            // Reemplazar comas dentro de los campos para no romper el formato CSV simple
            const safeN = (p.nombre || "").replace(/,/g, '');
            const safeA = (p.apellido || "").replace(/,/g, '');
            const safeC = (p.cedula || "").replace(/,/g, '');
            const safeCen = (p.centro || "").replace(/,/g, '');
            const safeE = (p.edad_sector || "").replace(/,/g, '');
            
            csvContent += `${safeN},${safeA},${safeC},${safeCen},${safeE}\n`;
        }

        const headers = new Headers();
        headers.set('Content-Type', 'text/csv; charset=utf-8');
        headers.set('Content-Disposition', `attachment; filename="plantilla_pacientes.csv"`);

        return new NextResponse(csvContent, {
            status: 200,
            headers,
        });
    } catch (error) {
        console.error("API Download Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
