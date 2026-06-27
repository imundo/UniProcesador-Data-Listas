import { NextResponse } from 'next/server';
import db from '../../../../lib/db.js';

export async function GET() {
    try {
        const row = db.prepare("SELECT COUNT(*) as count FROM pacientes").get();
        const total = row.count;
        
        if (total === 0) {
            return NextResponse.json({ total: 0, showing: 0, pacientes: [] });
        }

        const MAX_PREVIEW = 100;
        const pacientes = db.prepare('SELECT * FROM pacientes ORDER BY id DESC LIMIT ?').all(MAX_PREVIEW);

        return NextResponse.json({ 
            total, 
            showing: pacientes.length, 
            pacientes 
        });
    } catch (error) {
        console.error("API Global Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
