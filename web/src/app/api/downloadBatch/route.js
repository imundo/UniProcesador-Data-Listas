import { NextResponse } from 'next/server';
import db from '@/lib/db.js';

export const dynamic = 'force-dynamic';

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const batchId = searchParams.get('id');

    if (!batchId) {
        return new NextResponse('Falta el ID del lote', { status: 400 });
    }

    try {
        const pacientes = db.prepare('SELECT nombre, apellido, cedula, centro, edad_sector FROM pacientes WHERE batch_id = ? ORDER BY id ASC').all(batchId);
        
        let csvContent = "nombre,apellido,cedula,centro,edad_sector\n";
        pacientes.forEach(p => {
            const safeN = (p.nombre || "").replace(/,/g, '');
            const safeA = (p.apellido || "").replace(/,/g, '');
            let safeC = (p.cedula || "").replace(/,/g, '').trim().toUpperCase();
            
            if (safeC && !safeC.match(/^[VE]-/)) {
                safeC = "V-" + safeC.replace(/[^0-9]/g, '');
            }

            const safeCen = (p.centro || "").replace(/,/g, '');
            const safeE = (p.edad_sector || "").replace(/,/g, '');

            const row = [safeN, safeA, safeC, safeCen, safeE].join(",");
            csvContent += row + "\n";
        });

        return new NextResponse(csvContent, {
            status: 200,
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': `attachment; filename="lote_${batchId}.csv"`,
            }
        });
    } catch (error) {
        console.error("API Error (Download Batch):", error);
        return new NextResponse(error.message, { status: 500 });
    }
}
