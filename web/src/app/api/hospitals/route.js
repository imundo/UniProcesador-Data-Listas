import { NextResponse } from 'next/server';
import db from '@/lib/db.js';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const rows = db.prepare(`
            SELECT centro 
            FROM pacientes 
            WHERE centro IS NOT NULL AND centro != '' AND centro != 'N/D' 
            GROUP BY centro 
            HAVING COUNT(*) > 5 
            ORDER BY COUNT(*) DESC, centro ASC
        `).all();
        const hospitals = rows.map(r => r.centro);
        return NextResponse.json(hospitals);
    } catch (error) {
        console.error("API Error (Hospitals):", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
