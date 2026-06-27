import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET() {
    const dataDir = path.join(process.cwd(), 'data');
    const historyFile = path.join(dataDir, 'history.json');

    try {
        if (!fs.existsSync(historyFile)) {
            return NextResponse.json([]);
        }
        const history = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
        return NextResponse.json(history);
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
