import { NextResponse } from 'next/server';
import db from '@/lib/db.js';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const rows = db.prepare(`
            SELECT p.centro 
            FROM pacientes p
            LEFT JOIN hospital_locations hl ON p.centro = hl.centro
            WHERE p.centro IS NOT NULL AND p.centro != '' AND p.centro != 'N/D' 
              AND (hl.lat IS NOT NULL OR hl.centro IS NULL)
            GROUP BY p.centro 
            HAVING COUNT(*) > 5 
            ORDER BY COUNT(*) DESC, p.centro ASC
        `).all();
        const hospitals = rows.map(r => r.centro);
        return NextResponse.json(hospitals);
    } catch (error) {
        console.error("API Error (Hospitals):", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
