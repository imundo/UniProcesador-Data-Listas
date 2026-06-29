import { NextResponse } from 'next/server';
import db from '@/lib/db.js';

export const dynamic = 'force-dynamic';

export async function GET(req) {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '100');
    
    try {
        const events = db.prepare(`
            SELECT * FROM historial_estados 
            ORDER BY fecha DESC 
            LIMIT ?
        `).all(limit);
        
        return NextResponse.json(events);
    } catch (e) {
        console.error("State History GET error:", e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
