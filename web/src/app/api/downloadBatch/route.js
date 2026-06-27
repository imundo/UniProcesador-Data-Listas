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
        
        let csvContent = "Nombres,Apellidos,Cédula,Centro de Salud / Hospital,Edad y Sector / Zona\n";
        pacientes.forEach(p => {
            const row = [
                `"${p.nombre || ''}"`,
                `"${p.apellido || ''}"`,
                `"${p.cedula || ''}"`,
                `"${p.centro || ''}"`,
                `"${p.edad_sector || ''}"`
            ].join(",");
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
