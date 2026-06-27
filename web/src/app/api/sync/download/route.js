import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const dataDir = path.join(process.cwd(), 'data');
const dbFile = path.join(dataDir, 'unified_db.json');

export async function GET() {
    try {
        if (!fs.existsSync(dbFile)) {
            return new NextResponse("Base de datos no encontrada. Ejecuta la sincronización primero.", { status: 404 });
        }
        const fileContent = fs.readFileSync(dbFile, 'utf8');
        const dbData = JSON.parse(fileContent);
        const records = dbData.records || [];

        // Convert to CSV
        const headers = ["Nombre", "Apellido", "Cedula", "Centro_Ubicacion", "Observacion_Sector", "Origen", "URL_Origen"];
        
        const escapeCSV = (str) => {
            if (!str) return '""';
            const escaped = String(str).replace(/"/g, '""');
            return `"${escaped}"`;
        };

        const csvRows = records.map(p => {
            return [
                escapeCSV(p.nombre),
                escapeCSV(p.apellido),
                escapeCSV(p.cedula),
                escapeCSV(p.centro),
                escapeCSV(p.edad_sector),
                escapeCSV(p.source),
                escapeCSV(p.sourceUrl)
            ].join(',');
        });

        const csvString = [headers.join(','), ...csvRows].join('\n');

        // Include BOM for Excel UTF-8 support
        const bom = '\uFEFF';

        return new NextResponse(bom + csvString, {
            status: 200,
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': 'attachment; filename="base_unificada_multiorigen.csv"'
            }
        });
    } catch (e) {
        return new NextResponse("Error generando CSV: " + e.message, { status: 500 });
    }
}
