import { NextResponse } from 'next/server';
import db from '@/lib/db.js';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function POST(req) {
    try {
        const reqJson = await req.json();
        const { batchId, global, pacientes, stats } = reqJson;

        let rows = [];
        if (global) {
            rows = db.prepare("SELECT * FROM pacientes ORDER BY id ASC").all();
        } else if (pacientes && pacientes.length > 0) {
            // Guardado diferido: Insertamos en SQLite lo que venía en caché del frontend
            const insertPaciente = db.prepare(`
                INSERT INTO pacientes (nombre, apellido, cedula, centro, edad_sector, batch_id, estatus) 
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `);
            
            db.transaction((pacs) => {
                for (const p of pacs) {
                    insertPaciente.run(p.nombre || "", p.apellido || "", p.cedula || "", p.centro || "", p.edad_sector || "", batchId, p.estatus || 'Válido');
                }
            })(pacientes);
            
            rows = db.prepare("SELECT * FROM pacientes WHERE batch_id = ?").all(batchId);
        } else if (batchId) {
            rows = db.prepare("SELECT * FROM pacientes WHERE batch_id = ?").all(batchId);
        } else {
            return NextResponse.json({ error: "No batchId, global flag, or pacientes provided" }, { status: 400 });
        }

        if (rows.length === 0) {
            return NextResponse.json({ error: "No records found to upload" }, { status: 404 });
        }

        // Filtrar registros válidos que tienen los datos mínimos (nombre, apellido, cedula, centro)
        const validRows = rows.filter(p => {
            const hasNombre = p.nombre && p.nombre.trim() !== '';
            const hasApellido = p.apellido && p.apellido.trim() !== '';
            const hasCedula = p.cedula && p.cedula.trim() !== '';
            const hasCentro = p.centro && p.centro.trim() !== '' && p.centro !== 'N/D';
            return hasNombre && hasApellido && hasCedula && hasCentro;
        });

        // Transform rows to match the required schema
        const p_rows = validRows.map(p => ({
            nombre: `${p.nombre || ''} ${p.apellido || ''}`.trim(),
            cedula: p.cedula,
            centro: p.centro,
            detalle: p.edad_sector || 'N/D'
        }));

        const localInvalidCount = rows.length - validRows.length;
        let combinedData = { success: true, insertados: 0, duplicados: 0, invalidos: localInvalidCount, total: localInvalidCount };
        
        if (p_rows.length > 0) {
            // Lote de 1000 pacientes por petición para evitar saturar Supabase (hospitalesvenezuela.com)
            const CHUNK_SIZE = 1000;
            
            for (let i = 0; i < p_rows.length; i += CHUNK_SIZE) {
                const chunk = p_rows.slice(i, i + CHUNK_SIZE);
                const payload = {
                    p_rows: chunk,
                    p_device: "331b6e9d-0553-4bbf-a0fe-a13d6e9ba9b5"
                };

                const response = await fetch('https://ozuxfepfkvnxkywdsqxy.supabase.co/rest/v1/rpc/cargar_masivo', {
                    method: 'POST',
                    headers: {
                        'accept': '*/*',
                        'accept-language': 'es-ES,es;q=0.9,en;q=0.8',
                        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im96dXhmZXBma3ZueGt5d2RzcXh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0MjI5NTEsImV4cCI6MjA5Nzk5ODk1MX0.YhW0GalGkQZdO2NJTg_01C5XhdMmJ6RbNSNXXC0xG4o',
                        'authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im96dXhmZXBma3ZueGt5d2RzcXh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0MjI5NTEsImV4cCI6MjA5Nzk5ODk1MX0.YhW0GalGkQZdO2NJTg_01C5XhdMmJ6RbNSNXXC0xG4o',
                        'content-type': 'application/json',
                        'origin': 'https://hospitalesenvenezuela.com',
                        'referer': 'https://hospitalesenvenezuela.com/',
                        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36'
                    },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`Supabase API responded with ${response.status} on chunk: ${errorText}`);
                }

                const chunkResult = await response.json().catch(() => ({ success: true, insertados: 0, duplicados: 0, invalidos: 0, total: 0 }));
                combinedData.insertados += (chunkResult.insertados || 0);
                combinedData.duplicados += (chunkResult.duplicados || 0);
                combinedData.invalidos += (chunkResult.invalidos || 0);
                combinedData.total += (chunkResult.total || 0);
            }
        }

        // Guardar historial solo si fue una carga nueva (no global)
        if (!global && stats) {
            const dataDir = path.join(process.cwd(), 'data');
            const processedFilesPath = path.join(dataDir, 'procesados.json');
            const historyFile = path.join(dataDir, 'history.json');
            
            if (stats.fileHashes && stats.fileHashes.length > 0) {
                let processedFiles = {};
                if (fs.existsSync(processedFilesPath)) {
                    processedFiles = JSON.parse(fs.readFileSync(processedFilesPath, 'utf8'));
                }
                stats.fileHashes.forEach(hash => processedFiles[hash] = true);
                fs.writeFileSync(processedFilesPath, JSON.stringify(processedFiles, null, 2), 'utf8');
            }

            let history = [];
            if (fs.existsSync(historyFile)) {
                history = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
            }
            history.unshift({
                id: batchId,
                date: new Date().toISOString(),
                filesUploaded: stats.filesUploaded || 0,
                newPatients: stats.totalNuevos || 0,
                duplicatesIgnored: stats.totalDuplicados || 0,
                filesSkippedByHash: stats.archivosSaltados || 0
            });
            fs.writeFileSync(historyFile, JSON.stringify(history, null, 2), 'utf8');
        }

        return NextResponse.json({ success: true, count: p_rows.length, supabaseResponse: combinedData });

    } catch (error) {
        console.error("API Error (Upload to Portal):", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
