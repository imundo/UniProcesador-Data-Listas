import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
    const dataDir = path.join(process.cwd(), 'data');
    const outputFile = path.join(dataDir, 'plantilla_pacientes.csv');

    try {
        if (!fs.existsSync(outputFile)) {
            return NextResponse.json({ error: "CSV no encontrado" }, { status: 404 });
        }
        
        const fileBuffer = fs.readFileSync(outputFile);
        
        return new NextResponse(fileBuffer, {
            headers: {
                'Content-Disposition': 'attachment; filename="plantilla_pacientes.csv"',
                'Content-Type': 'text/csv',
            }
        });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
