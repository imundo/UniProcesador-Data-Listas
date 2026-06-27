import { NextResponse } from 'next/server';
import db from '@/lib/db.js';

export async function GET(req) {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q');

    if (!q || q.trim().length < 3) {
        return NextResponse.json([]);
    }

    const searchTerm = `%${q.trim()}%`;

    try {
        const stmt = db.prepare(`
            SELECT * FROM pacientes 
            WHERE nombre LIKE ? OR apellido LIKE ? OR cedula LIKE ?
            LIMIT 15
        `);
        const results = stmt.all(searchTerm, searchTerm, searchTerm);
        return NextResponse.json(results);
    } catch (e) {
        console.error("Error searching patients:", e);
        return NextResponse.json({ error: "Search failed" }, { status: 500 });
    }
}
