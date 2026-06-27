import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const dataDir = path.join(process.cwd(), 'data');
const dbFile = path.join(dataDir, 'unified_db.json');

export async function GET() {
    try {
        if (!fs.existsSync(dbFile)) {
            return NextResponse.json({ total: 0, lastUpdated: null });
        }
        const fileContent = fs.readFileSync(dbFile, 'utf8');
        const dbData = JSON.parse(fileContent);
        
        return NextResponse.json({
            total: dbData.total || 0,
            lastUpdated: dbData.lastUpdated || null
        });
    } catch (e) {
        return NextResponse.json({ total: 0, error: e.message });
    }
}
