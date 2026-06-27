import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
    const dataDir = path.join(process.cwd(), 'data');
    const outputFile = path.join(dataDir, 'plantilla_pacientes.csv');

    try {
        if (!fs.existsSync(outputFile)) {
            return NextResponse.json({ total: 0, showing: 0, pacientes: [] });
        }
        
        const content = fs.readFileSync(outputFile, 'utf8');
        const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        
        if (lines.length <= 1) { // Solo cabecera
            return NextResponse.json({ total: 0, showing: 0, pacientes: [] });
        }

        const dataLines = lines.slice(1);
        const total = dataLines.length;
        
        // Mostrar los últimos 100 registros para el preview para evitar sobrecargar el navegador
        const MAX_PREVIEW = 100;
        const showingLines = dataLines.slice(-MAX_PREVIEW).reverse(); // Recientes primero

        const pacientes = showingLines.map(line => {
            const parts = line.split(',');
            return {
                nombre: parts[0] || '',
                apellido: parts[1] || '',
                cedula: parts[2] || '',
                centro: parts[3] || '',
                edad_sector: parts[4] || ''
            };
        });

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
