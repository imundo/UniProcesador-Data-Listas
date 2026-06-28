import { NextResponse } from 'next/server';
import db from '@/lib/db.js';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const row = db.prepare("SELECT COUNT(*) as count FROM pacientes").get();
        const total = row.count;
        
        let externalCount = 0;
        try {
            const extRow = db.prepare("SELECT COUNT(*) as count FROM registros_externos").get();
            externalCount = extRow.count;
        } catch (e) {
            // Table might not exist yet if running very first time
        }
        
        if (total === 0 && externalCount === 0) {
            return NextResponse.json({ total: 0, externalCount: 0, showing: 0, pacientes: [] });
        }

        const pacientes = db.prepare('SELECT * FROM pacientes ORDER BY id DESC').all();

        return NextResponse.json({ 
            total, 
            externalCount,
            showing: pacientes.length, 
            pacientes 
        });
    } catch (error) {
        console.error("API Global Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
