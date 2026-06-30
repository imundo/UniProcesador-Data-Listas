import { NextResponse } from 'next/server';
import db from '@/lib/db.js';

export const dynamic = 'force-dynamic';

export async function POST(request) {
    try {
        const stmtPac = db.prepare(`UPDATE pacientes SET cne_validado = 0 WHERE cne_validado = 4`);
        const infoPac = stmtPac.run();
        
        const stmtExt = db.prepare(`UPDATE registros_externos SET cne_validado = 0 WHERE cne_validado = 4`);
        const infoExt = stmtExt.run();

        return NextResponse.json({
            status: 'ok',
            message: `Se han restaurado ${infoPac.changes} pacientes y ${infoExt.changes} registros externos omitidos para que vuelvan a procesarse.`
        });
        
    } catch (error) {
        console.error("Reset API Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
