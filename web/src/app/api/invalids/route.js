import { NextResponse } from 'next/server';
import db from '@/lib/db.js';

export const dynamic = 'force-dynamic';

export async function GET(req) {
    try {
        const rows = db.prepare(`
            SELECT * FROM pacientes 
            WHERE 
                (nombre IS NULL OR trim(nombre) = '') OR 
                (apellido IS NULL OR trim(apellido) = '') OR 
                (cedula IS NULL OR trim(cedula) = '') OR 
                (centro IS NULL OR trim(centro) = '' OR trim(centro) = 'N/D')
            ORDER BY id DESC
        `).all();
        
        return NextResponse.json({
            pacientes: rows,
            total: rows.length
        });
    } catch (error) {
        console.error("API Error (Invalids):", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
