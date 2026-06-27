import { NextResponse } from 'next/server';
import db from '@/lib/db.js';

function normalizeText(text) {
    if (!text) return "";
    return text.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}


async function searchSupabase(term) {
    try {
        const response = await fetch('https://ozuxfepfkvnxkywdsqxy.supabase.co/rest/v1/rpc/buscar_paciente', {
            method: 'POST',
            headers: {
                'accept': '*/*',
                'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im96dXhmZXBma3ZueGt5d2RzcXh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0MjI5NTEsImV4cCI6MjA5Nzk5ODk1MX0.YhW0GalGkQZdO2NJTg_01C5XhdMmJ6RbNSNXXC0xG4o',
                'authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im96dXhmZXBma3ZueGt5d2RzcXh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0MjI5NTEsImV4cCI6MjA5Nzk5ODk1MX0.YhW0GalGkQZdO2NJTg_01C5XhdMmJ6RbNSNXXC0xG4o',
                'content-type': 'application/json',
                'origin': 'https://hospitalesenvenezuela.com',
                'referer': 'https://hospitalesenvenezuela.com/'
            },
            body: JSON.stringify({ p_term: term })
        });
        
        if (!response.ok) return [];
        
        const data = await response.json();
        // Asumimos que data es un array de pacientes. Mapear a nuestro formato estándar
        return (data || []).map(p => ({
            nombre: (p.nombre || p.nombres || "").trim(),
            apellido: (p.apellido || p.apellidos || "").trim(),
            cedula: (p.cedula || p.ci || "").toString().trim(),
            centro: (p.centro || p.hospital || "").trim(),
            edad_sector: (p.detalle || p.edad_sector || p.sector || "").trim(),
            estado: (p.estado || p.status || "").trim(),
            source: 'HospitalesEnVenezuela.com',
            sourceUrl: 'https://hospitalesenvenezuela.com'
        }));
    } catch (e) {
        console.error("Supabase search error:", e);
        return [];
    }
}

async function searchGoogleSheets(term) {
    try {
        const response = await fetch('https://sheets.googleapis.com/v4/spreadsheets/1FlFw-guJpiQED_EsR_YJyUhzANy_1HU84_loZqH4_CY/values/Pacientes!A:H?key=AIzaSyCtG3uppOIps8UGNETdMa5ZCNEt7ffYUFQ', {
            method: 'GET',
            headers: {
                'accept': '*/*',
                'origin': 'https://www.redsolidariavenezuela.com',
                'referer': 'https://www.redsolidariavenezuela.com/'
            }
        });
        
        if (!response.ok) return [];
        
        const data = await response.json();
        const rows = data.values || [];
        
        // Remove headers
        if (rows.length > 0) rows.shift();
        
        const termLower = term.toLowerCase();
        
        // Filtrar localmente ya que Sheets devuelve todo
        const filtered = rows.filter(row => {
            const rowStr = row.join(" ").toLowerCase();
            return rowStr.includes(termLower);
        });
        
        return filtered.map(row => ({
            // Asumiendo formato común: A=Nombre, B=Apellido, C=Cédula, D=Centro, E=Status/Sector
            nombre: row[0] || "",
            apellido: row[1] || "",
            cedula: row[2] || "",
            centro: row[3] || "",
            edad_sector: (row[4] || "") + (row[5] ? ` - ${row[5]}` : ""),
            estado: (row[6] || "").trim(),
            source: 'RedSolidariaVenezuela.com',
            sourceUrl: 'https://www.redsolidariavenezuela.com'
        }));
    } catch (e) {
        console.error("Google Sheets search error:", e);
        return [];
    }
}
async function searchDesaparecidosAPI(term) {
    try {
        const encodedTerm = encodeURIComponent(term);
        const response = await fetch(`https://desaparecidos-terremoto-api.theempire.tech/api/personas?page=1&pageSize=20&q=${encodedTerm}`, {
            method: 'GET',
            headers: {
                'accept': '*/*',
                'origin': 'https://desaparecidosterremotovenezuela.com',
                'referer': 'https://desaparecidosterremotovenezuela.com/'
                // Note: omitting x-recaptcha-token as it might expire. If required by the server, it will fail gracefully.
            }
        });
        
        if (!response.ok) return [];
        
        const data = await response.json();
        // Assuming data is an array or has a property containing results. Commonly `data.data` or `data.results` or `data` directly
        const results = Array.isArray(data) ? data : (data.data || data.results || data.personas || []);
        
        return results.map(p => ({
            nombre: (p.nombre || p.nombres || "").trim(),
            apellido: (p.apellido || p.apellidos || "").trim(),
            cedula: (p.cedula || p.ci || "").toString().trim(),
            centro: (p.centro || p.hospital || p.ubicacion || "").trim(),
            edad_sector: (p.detalle || p.edad_sector || p.sector || "").trim(),
            estado: (p.estado || p.status || "").trim(),
            source: 'DesaparecidosTerremotoVenezuela.com',
            sourceUrl: 'https://desaparecidosterremotovenezuela.com'
        }));
    } catch (e) {
        console.error("Desaparecidos API search error:", e);
        return [];
    }
}

async function searchRedAyudaAPI(term) {
    try {
        const encodedTerm = encodeURIComponent(term);
        // Supabase ILIKE search with % wildcards encoded as %25
        const response = await fetch(`https://cpavwkdonvkvrwygfzfo.supabase.co/rest/v1/missing_persons?select=*&status=eq.active&order=ext_created.desc&offset=0&limit=40&name=ilike.%25${encodedTerm}%25`, {
            method: 'GET',
            headers: {
                'accept': '*/*',
                'accept-profile': 'public',
                'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwYXZ3a2RvbnZrdnJ3eWdmemZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzNjAyODMsImV4cCI6MjA5NzkzNjI4M30.-_FAsA2csTrB9qt267pBfjJkczMP7pcaUi4plMv3kv4',
                'authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwYXZ3a2RvbnZrdnJ3eWdmemZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzNjAyODMsImV4cCI6MjA5NzkzNjI4M30.-_FAsA2csTrB9qt267pBfjJkczMP7pcaUi4plMv3kv4',
                'origin': 'https://redayudavenezuela.com',
                'referer': 'https://redayudavenezuela.com/'
            }
        });
        
        if (!response.ok) return [];
        
        const data = await response.json();
        const results = Array.isArray(data) ? data : [];
        
        return results.map(p => ({
            nombre: (p.name || p.nombres || "").trim(),
            apellido: (p.last_name || p.apellidos || "").trim(),
            cedula: (p.id_document || p.cedula || p.ci || "").toString().trim(),
            centro: (p.last_seen_location || p.location || p.hospital || "").trim(),
            edad_sector: (p.description || p.notes || "").trim(),
            estado: (p.status || p.estado || "").trim(),
            source: 'RedAyudaVenezuela.com',
            sourceUrl: 'https://redayudavenezuela.com'
        }));
    } catch (e) {
        console.error("RedAyuda API search error:", e);
        return [];
    }
}

async function searchLocalDb(term) {
    try {
        const tokens = normalizeText(term).split(/\s+/).filter(t => t.length > 0);
        if (tokens.length === 0) return [];
        
        let query = "SELECT * FROM pacientes WHERE 1=1";
        const params = [];
        
        for (const t of tokens) {
            query += " AND (nombre LIKE ? OR apellido LIKE ? OR cedula LIKE ?)";
            const likeTerm = `%${t}%`;
            params.push(likeTerm, likeTerm, likeTerm);
        }
        query += " LIMIT 50";
        
        const stmt = db.prepare(query);
        const results = stmt.all(...params);
        
        return results.map(p => ({
            ...p,
            estado: p.estatus === 'Incompleto' ? 'Incompleto' : '',
            source: 'Base de Datos Local',
            sourceUrl: null
        }));
    } catch (e) {
        console.error("Local DB search error:", e);
        return [];
    }
}

export async function performSearch(term) {
    if (!term || term.trim().length < 3) {
        return [];
    }

    // Ejecutar las 5 búsquedas en paralelo (Búsqueda Federada)
    const [localRes, supabaseRes, sheetsRes, desaparecidosRes, redAyudaRes] = await Promise.allSettled([
        searchLocalDb(term),
        searchSupabase(term),
        searchGoogleSheets(term),
        searchDesaparecidosAPI(term),
        searchRedAyudaAPI(term)
    ]);

    const localData = localRes.status === 'fulfilled' ? localRes.value : [];
    const supabaseData = supabaseRes.status === 'fulfilled' ? supabaseRes.value : [];
    const sheetsData = sheetsRes.status === 'fulfilled' ? sheetsRes.value : [];
    const desaparecidosData = desaparecidosRes.status === 'fulfilled' ? desaparecidosRes.value : [];
    const redAyudaData = redAyudaRes.status === 'fulfilled' ? redAyudaRes.value : [];

    // Combinar resultados
    let combinedResults = [...localData, ...supabaseData, ...sheetsData, ...desaparecidosData, ...redAyudaData];
    
    // Agrupar por similitud (nombre + apellido + cedula normalizados)
    const groupedMap = new Map();
    for (const p of combinedResults) {
        const normNombre = normalizeText(p.nombre);
        const normApellido = normalizeText(p.apellido);
        const normCedula = normalizeText(p.cedula);
        
        const key = `${normNombre}|${normApellido}|${normCedula}`;
        
        if (groupedMap.has(key)) {
            const existing = groupedMap.get(key);
            if (!existing.sources.find(s => s.name === p.source)) {
                existing.sources.push({ name: p.source, url: p.sourceUrl });
            }
            if (!existing.estado && p.estado) {
                existing.estado = p.estado;
            }
        } else {
            p.sources = [{ name: p.source, url: p.sourceUrl }];
            groupedMap.set(key, p);
        }
    }
    
    let groupedResults = Array.from(groupedMap.values());

    // Limitar a los mejores 50 resultados para no saturar la UI
    if (groupedResults.length > 50) {
        groupedResults = groupedResults.slice(0, 50);
    }

    return groupedResults;
}

export async function GET(req) {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q');

    try {
        const groupedResults = await performSearch(q);
        return NextResponse.json(groupedResults);
    } catch (e) {
        console.error("Federated search fatal error:", e);
        return NextResponse.json({ error: "Search failed" }, { status: 500 });
    }
}
