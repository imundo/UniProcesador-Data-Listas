import { NextResponse } from 'next/server';
import db from '@/lib/db.js';

const ADMIN_PASS = 'Amazonas=90';

function isAuthenticated(req) {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) return false;
    // Soporta tanto "Bearer Amazonas=90" como enviar el string directamente
    return authHeader.replace('Bearer ', '').trim() === ADMIN_PASS;
}

export async function GET(req) {
    if (!isAuthenticated(req)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const stats = db.prepare(`
            SELECT 
                status, 
                COUNT(*) as count 
            FROM extraction_queue 
            GROUP BY status
        `).all();

        const result = {
            pending: 0,
            processing: 0,
            completed: 0,
            error: 0,
            total: 0
        };

        stats.forEach(s => {
            if (result[s.status] !== undefined) {
                result[s.status] = s.count;
                result.total += s.count;
            }
        });

        return NextResponse.json(result);
    } catch (e) {
        console.error("Extractor API GET Error:", e);
        return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
    }
}

export async function POST(req) {
    if (!isAuthenticated(req)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await req.json();
        const names = body.names; // Espera un array de strings

        if (!Array.isArray(names) || names.length === 0) {
            return NextResponse.json({ error: "Invalid array of names" }, { status: 400 });
        }

        const insertStmt = db.prepare("INSERT OR IGNORE INTO extraction_queue (term) VALUES (?)");
        
        let insertedCount = 0;
        const insertMany = db.transaction((terms) => {
            for (const t of terms) {
                if (t && typeof t === 'string' && t.trim().length > 2) {
                    const info = insertStmt.run(t.trim());
                    if (info.changes > 0) insertedCount++;
                }
            }
        });
        
        insertMany(names);

        return NextResponse.json({ 
            success: true, 
            message: `Agregados ${insertedCount} términos nuevos a la cola de extracción.` 
        });

    } catch (e) {
        console.error("Extractor API POST Error:", e);
        return NextResponse.json({ error: "Failed to insert names" }, { status: 500 });
    }
}
