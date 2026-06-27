import { NextResponse } from 'next/server';
import db from '@/lib/db.js';

export const dynamic = 'force-dynamic';

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const batchId = searchParams.get('id');

    if (!batchId) {
        return NextResponse.json({ error: 'Falta el ID del lote' }, { status: 400 });
    }

    try {
        const pacientes = db.prepare('SELECT nombre, apellido, cedula, centro, edad_sector FROM pacientes WHERE batch_id = ? ORDER BY id ASC').all(batchId);
        
        return NextResponse.json({
            success: true,
            totalNuevos: pacientes.length,
            nuevosPacientes: pacientes
        });
    } catch (error) {
        console.error("API Error (Batch):", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
