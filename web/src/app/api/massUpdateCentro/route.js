import { NextResponse } from 'next/server';
import db from '@/lib/db.js';

export const dynamic = 'force-dynamic';

export async function POST(req) {
    try {
        const { batchId, centro } = await req.json();

        if (!batchId) {
            return NextResponse.json({ error: "Batch ID is required" }, { status: 400 });
        }

        if (centro === undefined || centro === null) {
            return NextResponse.json({ error: "Centro is required" }, { status: 400 });
        }

        const safeCentro = centro.trim();

        const updateStmt = db.prepare(`
            UPDATE pacientes 
            SET centro = ? 
            WHERE batch_id = ?
        `);
        
        const result = updateStmt.run(safeCentro, batchId);

        return NextResponse.json({ 
            success: true, 
            changes: result.changes,
            message: `Actualizados ${result.changes} pacientes con el centro: ${safeCentro}` 
        });

    } catch (error) {
        console.error("Mass Update Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
