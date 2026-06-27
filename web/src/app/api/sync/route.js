import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const dataDir = path.join(process.cwd(), 'data');
const dbFile = path.join(dataDir, 'unified_db.json');

async function pullSupabase() {
    let allResults = [];
    try {
        const terms = ["a", "e", "i", "o", "u"];
        const headers = {
            'accept': '*/*',
            'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im96dXhmZXBma3ZueGt5d2RzcXh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0MjI5NTEsImV4cCI6MjA5Nzk5ODk1MX0.YhW0GalGkQZdO2NJTg_01C5XhdMmJ6RbNSNXXC0xG4o',
            'authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im96dXhmZXBma3ZueGt5d2RzcXh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0MjI5NTEsImV4cCI6MjA5Nzk5ODk1MX0.YhW0GalGkQZdO2NJTg_01C5XhdMmJ6RbNSNXXC0xG4o',
            'content-type': 'application/json'
        };

        for (const term of terms) {
            const response = await fetch('https://ozuxfepfkvnxkywdsqxy.supabase.co/rest/v1/rpc/buscar_paciente', {
                method: 'POST',
                headers,
                body: JSON.stringify({ p_term: term })
            });
            if (response.ok) {
                const data = await response.json();
                const mapped = (data || []).map(p => ({
                    nombre: (p.nombre || p.nombres || "").trim(),
                    apellido: (p.apellido || p.apellidos || "").trim(),
                    cedula: (p.cedula || p.ci || "").toString().trim(),
                    centro: (p.centro || p.hospital || "").trim(),
                    edad_sector: (p.detalle || p.edad_sector || p.sector || "").trim(),
                    source: 'HospitalesEnVenezuela.com',
                    sourceUrl: 'https://hospitalesenvenezuela.com'
                }));
                allResults = allResults.concat(mapped);
            }
        }
        // Deduplicate by cedula + nombre
        const unique = Array.from(new Map(allResults.map(item => [item.cedula + item.nombre, item])).values());
        return unique;
    } catch (e) {
        console.error("Supabase pull error:", e);
        return [];
    }
}

async function pullGoogleSheets() {
    try {
        const response = await fetch('https://sheets.googleapis.com/v4/spreadsheets/1FlFw-guJpiQED_EsR_YJyUhzANy_1HU84_loZqH4_CY/values/Pacientes!A:H?key=AIzaSyCtG3uppOIps8UGNETdMa5ZCNEt7ffYUFQ');
        if (!response.ok) return [];
        const data = await response.json();
        const rows = data.values || [];
        if (rows.length > 0) rows.shift(); 
        return rows.map(row => ({
            nombre: row[0] || "",
            apellido: row[1] || "",
            cedula: row[2] || "",
            centro: row[3] || "",
            edad_sector: (row[4] || "") + (row[5] ? ` - ${row[5]}` : ""),
            source: 'RedSolidariaVenezuela.com',
            sourceUrl: 'https://www.redsolidariavenezuela.com'
        }));
    } catch (e) {
        console.error("Google Sheets pull error:", e);
        return [];
    }
}

async function pullDesaparecidosAPI() {
    let allResults = [];
    let page = 1;
    let hasMore = true;
    try {
        while(hasMore) {
            const response = await fetch(`https://desaparecidos-terremoto-api.theempire.tech/api/personas?page=${page}&pageSize=100`);
            if (!response.ok) break;
            const data = await response.json();
            const results = Array.isArray(data) ? data : (data.data || data.results || data.personas || []);
            
            if (results.length === 0) {
                hasMore = false;
            } else {
                const mapped = results.map(p => ({
                    nombre: (p.nombre || p.nombres || "").trim(),
                    apellido: (p.apellido || p.apellidos || "").trim(),
                    cedula: (p.cedula || p.ci || "").toString().trim(),
                    centro: (p.centro || p.hospital || p.ubicacion || "").trim(),
                    edad_sector: (p.detalle || p.edad_sector || p.sector || p.estado || "").trim(),
                    source: 'DesaparecidosTerremotoVenezuela.com',
                    sourceUrl: 'https://desaparecidosterremotovenezuela.com'
                }));
                allResults = allResults.concat(mapped);
                page++;
                if (page > 50) hasMore = false;
            }
        }
    } catch (e) {
        console.error("Desaparecidos API pull error:", e);
    }
    return allResults;
}

async function pullRedAyudaAPI() {
    let allResults = [];
    let offset = 0;
    const limit = 1000;
    let hasMore = true;
    try {
        while(hasMore) {
            const response = await fetch(`https://cpavwkdonvkvrwygfzfo.supabase.co/rest/v1/missing_persons?select=*&status=eq.active&order=ext_created.desc&offset=${offset}&limit=${limit}`, {
                headers: {
                    'accept': '*/*',
                    'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwYXZ3a2RvbnZrdnJ3eWdmemZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzNjAyODMsImV4cCI6MjA5NzkzNjI4M30.-_FAsA2csTrB9qt267pBfjJkczMP7pcaUi4plMv3kv4',
                    'authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwYXZ3a2RvbnZrdnJ3eWdmemZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzNjAyODMsImV4cCI6MjA5NzkzNjI4M30.-_FAsA2csTrB9qt267pBfjJkczMP7pcaUi4plMv3kv4'
                }
            });
            if (!response.ok) break;
            const data = await response.json();
            const results = data || [];
            
            if (results.length === 0) {
                hasMore = false;
            } else {
                const mapped = results.map(p => ({
                    nombre: (p.name || p.nombres || "").trim(),
                    apellido: (p.last_name || p.apellidos || "").trim(),
                    cedula: (p.id_document || p.cedula || p.ci || "").toString().trim(),
                    centro: (p.last_seen_location || p.location || p.hospital || "").trim(),
                    edad_sector: (p.description || p.notes || p.status || "").trim(),
                    source: 'RedAyudaVenezuela.com',
                    sourceUrl: 'https://redayudavenezuela.com'
                }));
                allResults = allResults.concat(mapped);
                offset += limit;
                if (results.length < limit) hasMore = false;
            }
        }
    } catch (e) {
        console.error("RedAyuda pull error:", e);
    }
    return allResults;
}

export async function GET(req) {
    try {
        const [supabaseData, sheetsData, desaparecidosData, redAyudaData] = await Promise.allSettled([
            pullSupabase(),
            pullGoogleSheets(),
            pullDesaparecidosAPI(),
            pullRedAyudaAPI()
        ]);

        const externalResults = [
            ...(supabaseData.status === 'fulfilled' ? supabaseData.value : []),
            ...(sheetsData.status === 'fulfilled' ? sheetsData.value : []),
            ...(desaparecidosData.status === 'fulfilled' ? desaparecidosData.value : []),
            ...(redAyudaData.status === 'fulfilled' ? redAyudaData.value : [])
        ];

        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        fs.writeFileSync(dbFile, JSON.stringify({
            lastUpdated: new Date().toISOString(),
            total: externalResults.length,
            records: externalResults
        }, null, 2));

        return NextResponse.json({
            success: true,
            totalSynced: externalResults.length,
            sources: {
                supabase: supabaseData.status === 'fulfilled' ? supabaseData.value.length : 0,
                sheets: sheetsData.status === 'fulfilled' ? sheetsData.value.length : 0,
                desaparecidos: desaparecidosData.status === 'fulfilled' ? desaparecidosData.value.length : 0,
                redAyuda: redAyudaData.status === 'fulfilled' ? redAyudaData.value.length : 0
            }
        });
    } catch (e) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
