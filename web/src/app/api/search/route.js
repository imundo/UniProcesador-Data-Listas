import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import db from '@/lib/db.js';

const dataDir = path.join(process.cwd(), 'data');
const dbFile = path.join(dataDir, 'unified_db.json');

async function searchLocalDb(term) {
    try {
        const searchTerm = `%${term.trim()}%`;
        const stmt = db.prepare(`
            SELECT * FROM pacientes 
            WHERE nombre LIKE ? OR apellido LIKE ? OR cedula LIKE ?
            LIMIT 15
        `);
        const results = stmt.all(searchTerm, searchTerm, searchTerm);
        
        return results.map(p => ({
            ...p,
            source: 'Base de Datos Local',
            sourceUrl: null
        }));
    } catch (e) {
        console.error("Local DB search error:", e);
        return [];
    }
}

function searchUnifiedDb(term) {
    try {
        if (!fs.existsSync(dbFile)) return [];
        
        const fileContent = fs.readFileSync(dbFile, 'utf8');
        const dbData = JSON.parse(fileContent);
        const records = dbData.records || [];
        
        const termLower = term.toLowerCase();
        
        const filtered = records.filter(row => {
            const rowStr = `${row.nombre || ''} ${row.apellido || ''} ${row.cedula || ''}`.toLowerCase();
            return rowStr.includes(termLower);
        });
        
        return filtered;
    } catch (e) {
        console.error("Unified DB search error:", e);
        return [];
    }
}

export async function GET(req) {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q');

    if (!q || q.trim().length < 3) {
        return NextResponse.json([]);
    }

    const term = q.trim();

    try {
        const localData = await searchLocalDb(term);
        const unifiedData = searchUnifiedDb(term);

        // Combinar resultados
        let combinedResults = [...localData, ...unifiedData];
        
        // Limitar a los mejores 50 resultados para no saturar la UI pero mostrar más resultados
        if (combinedResults.length > 50) {
            combinedResults = combinedResults.slice(0, 50);
        }

        return NextResponse.json(combinedResults);
    } catch (e) {
        console.error("Search fatal error:", e);
        return NextResponse.json({ error: "Search failed" }, { status: 500 });
    }
}
