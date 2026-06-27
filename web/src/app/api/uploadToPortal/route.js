import { NextResponse } from 'next/server';
import db from '@/lib/db.js';

export const dynamic = 'force-dynamic';

export async function POST(req) {
    try {
        const { batchId, global, pacientes } = await req.json();

        let rows = [];
        if (global) {
            rows = db.prepare("SELECT * FROM pacientes ORDER BY id ASC").all();
        } else if (pacientes && pacientes.length > 0) {
            // Guardado diferido: Insertamos en SQLite lo que venía en caché del frontend
            const insertPaciente = db.prepare(`
                INSERT INTO pacientes (nombre, apellido, cedula, centro, edad_sector, batch_id) 
                VALUES (?, ?, ?, ?, ?, ?)
            `);
            
            db.transaction((pacs) => {
                for (const p of pacs) {
                    insertPaciente.run(p.nombre || "", p.apellido || "", p.cedula || "", p.centro || "", p.edad_sector || "", batchId);
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

        // Transform rows to match the required schema
        const p_rows = rows.map(p => ({
            nombre: `${p.nombre || ''} ${p.apellido || ''}`.trim() || 'N/D',
            cedula: p.cedula || 'N/D',
            centro: p.centro || 'N/D',
            detalle: p.edad_sector || 'N/D'
        }));

        const payload = {
            p_rows,
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
            throw new Error(`Supabase API responded with ${response.status}: ${errorText}`);
        }

        const data = await response.json().catch(() => ({ success: true }));

        return NextResponse.json({ success: true, count: p_rows.length, supabaseResponse: data });

    } catch (error) {
        console.error("API Error (Upload to Portal):", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
