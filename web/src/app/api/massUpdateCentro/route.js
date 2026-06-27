import { NextResponse } from 'next/server';
import db from '@/lib/db.js';

export const dynamic = 'force-dynamic';

export async function POST(req) {
    try {
        const { batchId, type = "centro", value } = await req.json();

        if (!batchId) {
            return NextResponse.json({ error: "Batch ID is required" }, { status: 400 });
        }

        if (value === undefined || value === null) {
            return NextResponse.json({ error: "Value is required" }, { status: 400 });
        }

        const safeValue = value.trim();
        let result;

        if (type === "sector") {
            const updateStmt = db.prepare(`
                UPDATE pacientes 
                SET edad_sector = ? 
                WHERE batch_id = ?
            `);
            result = updateStmt.run(safeValue, batchId);
        } else {
            const updateStmt = db.prepare(`
                UPDATE pacientes 
                SET centro = ? 
                WHERE batch_id = ?
            `);
            result = updateStmt.run(safeValue, batchId);
        }

        return NextResponse.json({ 
            success: true, 
            changes: result.changes,
            message: `Actualizados ${result.changes} pacientes con ${type}: ${safeValue}` 
        });

    } catch (error) {
        console.error("Mass Update Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
