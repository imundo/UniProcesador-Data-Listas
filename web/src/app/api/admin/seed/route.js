import { NextResponse } from 'next/server';
import db from '@/lib/db.js';
import path from 'path';

export const dynamic = 'force-dynamic';

let extractionProcess = null;
let lastExitCode = null;
let lastError = null;

export async function GET(req) {
    const { searchParams } = new URL(req.url);
    const run = searchParams.get('run');
    const stop = searchParams.get('stop');

    try {
        // Stop process if requested
        if (stop && extractionProcess) {
            extractionProcess.kill();
            extractionProcess = null;
            return NextResponse.json({ message: 'Extracción detenida.' });
        }

        // Start process if requested
        if (run) {
            if (extractionProcess) {
                return NextResponse.json({ message: 'La extracción ya está en ejecución.', status: 'running' });
            }

            const cp = require('child_process');
            
            extractionProcess = cp.exec('node scripts/seed_extraccion.js', {
                cwd: process.cwd()
            });
            
            lastExitCode = null;
            lastError = null;

            extractionProcess.stdout.on('data', (data) => console.log('[SEED]', data.toString()));
            
            let stderrOutput = '';
            extractionProcess.stderr.on('data', (data) => {
                console.error('[SEED ERROR]', data.toString());
                stderrOutput += data.toString();
            });

            extractionProcess.unref(); // Allow the parent process to exit independently

            extractionProcess.on('exit', (code) => {
                console.log('[SEED] Process exited with code', code);
                lastExitCode = code;
                if (code !== 0) {
                    lastError = stderrOutput;
                }
                extractionProcess = null;
            });

            return NextResponse.json({ message: 'Extracción masiva iniciada en segundo plano.', status: 'started' });
        }

        // Return statistics
        let totalRow = { count: 0 };
        let origins = [];
        try {
            totalRow = db.prepare("SELECT COUNT(*) as count FROM registros_externos").get();
            origins = db.prepare(`
                SELECT origen, COUNT(*) as count, MAX(creado_en) as ultimo_registro
                FROM registros_externos 
                GROUP BY origen
                ORDER BY count DESC
            `).all();
        } catch(e) {}

        return NextResponse.json({
            status: extractionProcess ? 'running' : 'idle',
            last_exit_code: lastExitCode,
            last_error: lastError,
            total_extraido: totalRow.count,
            por_origen: origins
        });

    } catch (error) {
        console.error("API Seed Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
