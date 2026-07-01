import { NextResponse } from 'next/server';
import db from '@/lib/db.js';

function normalizeText(text) {
    if (!text) return "";
    return text.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function withTimeout(promise, ms = 4000) {
    return Promise.race([
        promise,
        new Promise((_, reject) => 
            setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
        )
    ]);
}

// Cache en memoria para búsquedas repetidas
const cache = new Map();
const CACHE_TTL = 30 * 1000; // 30 segundos (suficiente pararáfagas de tráfico sin entregar datos muy desactualizados)

function getFromCache(key) {
    const item = cache.get(key);
    if (!item) return null;
    if (Date.now() > item.expiry) {
        cache.delete(key);
        return null;
    }
    return item.value;
}

function setToCache(key, value) {
    // Evitar que la memoria crezca infinitamente, limpiamos el caché si hay más de 500 búsquedas distintas
    if (cache.size > 500) cache.clear(); 
    cache.set(key, {
        value,
        expiry: Date.now() + CACHE_TTL
    });
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
            sourceUrl: 'https://desaparecidosterremotovenezuela.com',
            metadata: p
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
            sourceUrl: 'https://redayudavenezuela.com',
            metadata: p
        }));
    } catch (e) {
        console.error("RedAyuda API search error:", e);
        return [];
    }
}

// ========== NUEVAS FUENTES (Fase 1) ==========

async function searchDesaparecidosVzla(term) {
    try {
        const encodedTerm = encodeURIComponent(term);
        const response = await fetch(`https://www.desaparecidosvenezuela.com/buscar?q=${encodedTerm}`, {
            method: 'GET',
            headers: {
                'accept': 'text/html',
                'user-agent': 'Mozilla/5.0 (compatible; UnificadorBot/1.0)'
            }
        });
        
        if (!response.ok) return [];
        
        const html = await response.text();
        const results = [];
        
        // Parse SSR HTML: each person card is an <a> linking to /p/id with name, location, status
        const cardRegex = /class="font-medium text-gray-900[^"]*">([^<]+)<\/p>.*?class="text-sm text-gray-500[^"]*">([^<]*)<\/p>.*?class="text-xs px-2 py-1 rounded-full font-medium shrink-0[^"]*">([^<]+)<\/span>/gs;
        const ageRegex = /class="text-xs text-gray-400">([\d]+)<!-- -->\s*años/;
        
        // Simpler approach: extract names and locations from the structured HTML
        const personBlocks = html.split('class="flex items-center gap-3 bg-white border');
        
        for (let i = 1; i < personBlocks.length && results.length < 30; i++) {
            const block = personBlocks[i];
            
            // Extract name
            const nameMatch = block.match(/class="font-medium text-gray-900[^"]*">([^<]+)</);
            if (!nameMatch) continue;
            
            const fullName = nameMatch[1].trim();
            const nameParts = fullName.split(' ');
            const nombre = nameParts.slice(0, Math.ceil(nameParts.length / 2)).join(' ');
            const apellido = nameParts.slice(Math.ceil(nameParts.length / 2)).join(' ');
            
            // Extract location
            const locMatch = block.match(/class="text-sm text-gray-500[^"]*">([^<]*)</);
            const centro = locMatch ? locMatch[1].trim() : '';
            
            // Extract age
            const ageMatch = block.match(/class="text-xs text-gray-400">(\d+)/);
            const edad = ageMatch ? `${ageMatch[1]} Años` : '';
            
            // Extract status
            const statusMatch = block.match(/class="text-xs px-2 py-1 rounded-full font-medium shrink-0[^"]*">([^<]+)</);
            const estado = statusMatch ? statusMatch[1].trim() : '';
            
            results.push({
                nombre,
                apellido,
                cedula: '',
                centro,
                edad_sector: edad,
                estado,
                source: 'DesaparecidosVenezuela.com',
                sourceUrl: 'https://www.desaparecidosvenezuela.com'
            });
        }
        
        return results;
    } catch (e) {
        console.error("DesaparecidosVzla search error:", e);
        return [];
    }
}

async function searchReencuentroHelp(term) {
    try {
        const queryParams = {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'content-type': 'application/json',
                'origin': 'https://reencuentro.help',
                'referer': 'https://reencuentro.help/'
            }
        };

        const fetchList = async (kind) => {
            try {
                const res = await fetch('https://rwqhswywmdjqyqnpsxqw.supabase.co/functions/v1/list-records', {
                    ...queryParams,
                    body: JSON.stringify({ kind, q: term, page: 1 })
                });
                if (!res.ok) return [];
                const data = await res.json();
                return data.records || [];
            } catch (e) {
                return [];
            }
        };

        const [missingRecords, foundRecords] = await Promise.all([
            fetchList('missing'),
            fetchList('found')
        ]);

        const allRecords = [...missingRecords, ...foundRecords];
        
        return allRecords.map(p => {
            const fullName = p.display_name || "";
            const parts = fullName.split(' ');
            return {
                nombre: parts.slice(0, Math.ceil(parts.length / 2)).join(' ').trim(),
                apellido: parts.slice(Math.ceil(parts.length / 2)).join(' ').trim(),
                cedula: (p.cedula || '').trim(),
                centro: (p.location_detail || '').trim(),
                edad_sector: p.age_min ? `${p.age_min} Años` : '',
                estado: p.kind === 'missing' ? 'Desaparecido' : 'Rescatado',
                source: 'Reencuentro.help',
                sourceUrl: 'https://reencuentro.help'
            };
        });
    } catch (e) {
        console.error("Reencuentro.help search error:", e);
        return [];
    }
}

async function searchSOSVenezuela(term) {
    try {
        const encodedTerm = encodeURIComponent(term);
        const response = await fetch(`https://sosvenezuela2026.com/buscar?q=${encodedTerm}`, {
            method: 'GET',
            headers: {
                'accept': 'text/html',
                'user-agent': 'Mozilla/5.0 (compatible; UnificadorBot/1.0)'
            }
        });
        
        if (!response.ok) return [];
        
        const html = await response.text();
        const results = [];
        
        // SOS Venezuela uses SSR Next.js. Look for person data in the RSC payload.
        // Person names appear in JSON-like structures within __next_f script blocks
        const nameRegex = /"nombre"\s*:\s*"([^"]+)"/g;
        const apellidoRegex = /"apellido"\s*:\s*"([^"]+)"/g;
        const estadoRegex = /"estado_text"\s*:\s*"([^"]+)"/g;
        const zonaRegex = /"zona"\s*:\s*"([^"]+)"/g;
        
        let nameMatch;
        const names = [];
        while ((nameMatch = nameRegex.exec(html)) !== null && names.length < 30) {
            names.push(nameMatch[1]);
        }
        
        // Also try extracting from alt tags on images or visible text
        const altRegex = /alt="Foto de ([^"]+)"/g;
        let altMatch;
        while ((altMatch = altRegex.exec(html)) !== null && names.length < 30) {
            if (!names.includes(altMatch[1])) names.push(altMatch[1]);
        }
        
        // Also try card-based extraction similar to desaparecidosvenezuela
        const cardBlocks = html.split('font-semibold');
        for (let i = 1; i < cardBlocks.length && results.length < 30; i++) {
            const block = cardBlocks[i];
            // Try to find a name that contains the search term
            const textMatch = block.match(/>([^<]{3,50})</)
            if (!textMatch) continue;
            const text = textMatch[1].trim();
            if (text.toLowerCase().includes(term.toLowerCase()) && text.match(/[A-ZÁ-Ú]/)) {
                const parts = text.split(' ');
                if (parts.length >= 1 && !results.find(r => r.nombre === parts[0])) {
                    results.push({
                        nombre: parts.slice(0, Math.ceil(parts.length / 2)).join(' '),
                        apellido: parts.slice(Math.ceil(parts.length / 2)).join(' '),
                        cedula: '',
                        centro: '',
                        edad_sector: '',
                        estado: 'Desaparecido',
                        source: 'SOSVenezuela2026.com',
                        sourceUrl: 'https://sosvenezuela2026.com'
                    });
                }
            }
        }
        
        // Dedupe by adding extracted names not already in results
        for (const fullName of names) {
            if (results.length >= 30) break;
            if (results.find(r => (r.nombre + ' ' + r.apellido).trim() === fullName)) continue;
            const parts = fullName.split(' ');
            results.push({
                nombre: parts.slice(0, Math.ceil(parts.length / 2)).join(' '),
                apellido: parts.slice(Math.ceil(parts.length / 2)).join(' '),
                cedula: '',
                centro: '',
                edad_sector: '',
                estado: 'Desaparecido',
                source: 'SOSVenezuela2026.com',
                sourceUrl: 'https://sosvenezuela2026.com'
            });
        }
        
        return results;
    } catch (e) {
        console.error("SOSVenezuela search error:", e);
        return [];
    }
}

async function searchNodoAyuda(term) {
    try {
        const url = `https://kciubdfrwsbdiyrihtzx.supabase.co/rest/v1/personas?select=id,tipo,nombre,edad,visto_lugar,descripcion,contacto,estado,lat,lng,creado_en,foto_url,origen,fuente_url&or=(nombre.ilike.*${encodeURIComponent(term)}*,visto_lugar.ilike.*${encodeURIComponent(term)}*)&limit=30&order=creado_en.desc`;
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'apikey': 'sb_publishable_ipLQ2B5eSzvhprKHz4XT-A_jWUq9AZt',
                'authorization': 'Bearer sb_publishable_ipLQ2B5eSzvhprKHz4XT-A_jWUq9AZt',
                'accept': 'application/json'
            }
        });
        
        if (!response.ok) return [];
        
        const data = await response.json();
        const results = Array.isArray(data) ? data : [];
        
        return results.map(p => {
            // Translate the "tipo" to "Desaparecido" or "Rescatado" or matching status
            let estado = p.tipo === 'encontrado' ? 'Rescatado' : (p.tipo === 'desaparecido' ? 'Desaparecido' : p.tipo);
            return {
                nombre: (p.nombre || "").trim(),
                apellido: "", // Usually Full Name is in nombre for NodoAyuda
                cedula: "",
                centro: (p.visto_lugar || "").trim(),
                edad_sector: (p.descripcion || "").trim(),
                estado: estado,
                source: 'NodoAyuda.com',
                sourceUrl: 'https://www.nodoayuda.com',
                metadata: p
            };
        });
    } catch (e) {
        console.error("NodoAyuda search error:", e);
        return [];
    }
}

async function searchLocalDb(term) {
    try {
        const tokens = normalizeText(term).split(/\s+/).filter(t => t.length > 0);
        if (tokens.length === 0) return [];
        
        let queryPacientes = "SELECT * FROM pacientes WHERE 1=1";
        let queryExternos = "SELECT * FROM registros_externos WHERE 1=1";
        const params = [];
        
        for (const t of tokens) {
            // Si el token parece una cédula con prefijo (v, e, j, r) + números, extraemos solo los números
            let cleanT = t;
            const cedulaMatch = t.match(/^[vejr]-?(\d{5,10})$/i);
            if (cedulaMatch) {
                cleanT = cedulaMatch[1];
            }

            queryPacientes += " AND (nombre LIKE ? OR apellido LIKE ? OR cedula LIKE ?)";
            queryExternos += " AND (nombre LIKE ? OR apellido LIKE ? OR cedula LIKE ?)";
            
            const likeTerm = `%${t}%`;
            const likeCleanTerm = `%${cleanT}%`;
            // Pasamos likeTerm para nombres, y likeCleanTerm para la cédula (por si buscaron v27027712)
            params.push(likeTerm, likeTerm, likeCleanTerm);
        }
        queryPacientes += " LIMIT 200";
        queryExternos += " LIMIT 200";
        
        const stmtPacientes = db.prepare(queryPacientes);
        const resultsPacientes = stmtPacientes.all(...params);
        
        // Ejecutar los mismos parámetros para externos (duplicamos params ya que se usan 3 veces por query)
        const stmtExternos = db.prepare(queryExternos);
        const resultsExternos = stmtExternos.all(...params);
        
        const parsedPacientes = resultsPacientes.map(p => ({
            ...p,
            estado: p.estatus === 'Incompleto' ? 'Incompleto' : (p.estatus || ''),
            source: 'Base de Datos Local',
            sourceUrl: null,
            metadata: p.metadata ? (typeof p.metadata === 'string' ? JSON.parse(p.metadata) : p.metadata) : null
        }));

        const parsedExternos = resultsExternos.map(e => ({
            nombre: e.nombre || '',
            apellido: e.apellido || '',
            cedula: e.cedula || '',
            centro: e.centro || '',
            edad_sector: e.edad_sector || '',
            estado: e.estado || '',
            source: e.origen || 'Base de Datos Local (Buffer)',
            sourceUrl: e.fuente_url || null,
            metadata: e.metadata ? (typeof e.metadata === 'string' ? JSON.parse(e.metadata) : e.metadata) : null
        }));

        return [...parsedPacientes, ...parsedExternos];
    } catch (e) {
        console.error("Local DB search error:", e);
        return [];
    }
}

export async function performSearch(term) {
    if (!term || term.trim().length < 3) {
        return [];
    }

    // Ejecutar las 9 búsquedas en paralelo (Búsqueda Federada Multi-Origen)
    // Se usa un timeout de 4.5 segundos para cada petición para evitar que una API lenta bloquee todas
    const [localRes, supabaseRes, sheetsRes, desaparecidosRes, redAyudaRes, desapVzlaRes, reencuentroRes, sosRes, nodoAyudaRes] = await Promise.allSettled([
        withTimeout(searchLocalDb(term), 1000), // BD Local es rápida
        withTimeout(searchSupabase(term), 4500),
        withTimeout(searchGoogleSheets(term), 4500),
        withTimeout(searchDesaparecidosAPI(term), 4500),
        withTimeout(searchRedAyudaAPI(term), 4500),
        withTimeout(searchDesaparecidosVzla(term), 4500),
        withTimeout(searchReencuentroHelp(term), 4500),
        withTimeout(searchSOSVenezuela(term), 4500),
        withTimeout(searchNodoAyuda(term), 4500)
    ]);

    const localData = localRes.status === 'fulfilled' ? localRes.value : [];
    const supabaseData = supabaseRes.status === 'fulfilled' ? supabaseRes.value : [];
    const sheetsData = sheetsRes.status === 'fulfilled' ? sheetsRes.value : [];
    const desaparecidosData = desaparecidosRes.status === 'fulfilled' ? desaparecidosRes.value : [];
    const redAyudaData = redAyudaRes.status === 'fulfilled' ? redAyudaRes.value : [];
    const desapVzlaData = desapVzlaRes.status === 'fulfilled' ? desapVzlaRes.value : [];
    const reencuentroData = reencuentroRes.status === 'fulfilled' ? reencuentroRes.value : [];
    const sosData = sosRes.status === 'fulfilled' ? sosRes.value : [];
    const nodoAyudaData = nodoAyudaRes.status === 'fulfilled' ? nodoAyudaRes.value : [];

    // Combinar resultados de todas las fuentes
    let combinedResults = [...localData, ...supabaseData, ...sheetsData, ...desaparecidosData, ...redAyudaData, ...desapVzlaData, ...reencuentroData, ...sosData, ...nodoAyudaData];
    
    // --- PASSIVE SCRAPING (Base de Datos Sombra) ---
    // Guardar los resultados externos asíncronamente en nuestra BD para alimentar el portal
    const externalResults = [...supabaseData, ...sheetsData, ...desaparecidosData, ...redAyudaData, ...desapVzlaData, ...reencuentroData, ...sosData, ...nodoAyudaData];
    if (externalResults.length > 0) {
        // Ejecutar de forma no bloqueante (no usar await)
        setTimeout(() => {
            try {
                const insertStmt = db.prepare(`
                    INSERT INTO registros_externos (nombre, apellido, cedula, centro, edad_sector, estado, origen, fuente_url, metadata)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(nombre, apellido, cedula, origen) DO UPDATE SET
                    centro=excluded.centro,
                    estado=excluded.estado,
                    edad_sector=excluded.edad_sector,
                    fuente_url=excluded.fuente_url,
                    metadata=excluded.metadata,
                    creado_en=CURRENT_TIMESTAMP
                `);
                
                const insertMany = db.transaction((records) => {
                    for (const r of records) {
                        const metaStr = r.metadata ? JSON.stringify(r.metadata) : null;
                        insertStmt.run(
                            r.nombre || '', 
                            r.apellido || '', 
                            r.cedula || '', 
                            r.centro || '', 
                            r.edad_sector || '', 
                            r.estado || '', 
                            r.source || 'Desconocido', 
                            r.sourceUrl || '',
                            metaStr
                        );
                    }
                });
                insertMany(externalResults);
            } catch(e) {
                console.error("Passive Scraping Error:", e);
            }
        }, 0);
    }
    // -----------------------------------------------
    
    // Agrupar por similitud (cédula o tokens de nombre)
    let groupedResults = [];
    
    const getTokens = (nombre, apellido) => {
        const full = normalizeText(`${nombre || ''} ${apellido || ''}`).toLowerCase().trim();
        return full.split(/\s+/).filter(w => w.length > 2);
    };

    const isSamePerson = (p1, p2) => {
        if (p1.cedula && p2.cedula && p1.cedula === p2.cedula) return true;
        
        const tokens1 = getTokens(p1.nombre, p1.apellido);
        const tokens2 = getTokens(p2.nombre, p2.apellido);
        
        const full1 = tokens1.join(' ');
        const full2 = tokens2.join(' ');
        
        if (full1 === full2 && full1.length > 0) return true;
        
        if (tokens1.length >= 2 && tokens1.every(t => tokens2.includes(t))) return true;
        if (tokens2.length >= 2 && tokens2.every(t => tokens1.includes(t))) return true;
        
        return false;
    };

    for (const p of combinedResults) {
        let foundMatch = false;
        
        // Asignar sources initial si no existe
        if (!p.sources) p.sources = [{ name: p.source, url: p.sourceUrl }];
        
        for (const existing of groupedResults) {
            if (isSamePerson(existing, p)) {
                foundMatch = true;
                
                // Conservar el nombre más largo/completo
                const lenExisting = `${existing.nombre} ${existing.apellido}`.length;
                const lenP = `${p.nombre} ${p.apellido}`.length;
                if (lenP > lenExisting) {
                    existing.nombre = p.nombre;
                    existing.apellido = p.apellido;
                }
                
                // Añadir source si no existe
                if (!existing.sources.find(s => s.name === p.source)) {
                    existing.sources.push({ name: p.source, url: p.sourceUrl });
                }
                
                // Mezclar metadata
                if (p.metadata) {
                    existing.metadata = { ...(existing.metadata || {}), ...p.metadata };
                }
                
                // Priorizar estados que aporten valor real sobre los genéricos locales
                const genericStates = ['active', 'válido', 'valido', 'incompleto', 'pendiente', ''];
                const extState = (existing.estado || '').toLowerCase().trim();
                const newpState = (p.estado || '').toLowerCase().trim();

                if (!existing.estado || 
                    (genericStates.includes(extState) && p.estado && !genericStates.includes(newpState)) ||
                    (newpState === 'rescatado' || newpState === 'encontrado' || newpState === 'localizado' || newpState === 'reencontrado')) {
                    existing.estado = p.estado;
                }
                
                // Conservar la validación CNE si alguno la tiene
                if (p.cne_validado && (!existing.cne_validado || p.cne_validado < existing.cne_validado)) {
                    // Si el nuevo tiene 1 (Exacto) o 2 (Parcial) prevalece. 
                    // En realidad, para no complicarnos, tomamos el valor mínimo si ambos son > 0 (1 es mejor que 2),
                    // o tomamos el que sea > 0.
                    if (!existing.cne_validado || (p.cne_validado === 1)) {
                        existing.cne_validado = p.cne_validado;
                    } else if (p.cne_validado === 2 && existing.cne_validado !== 1) {
                        existing.cne_validado = p.cne_validado;
                    }
                }
                break;
            }
        }
        
        if (!foundMatch) {
            groupedResults.push(p);
        }
    }

    // --- RANKING INTELIGENTE ---
    const termLower = normalizeText(term);
    const termTokens = termLower.split(/\s+/).filter(t => t.length > 0);
    
    for (const r of groupedResults) {
        let score = 0;
        const rName = normalizeText(r.nombre + ' ' + r.apellido);
        const rCedula = normalizeText(r.cedula);
        
        if (termLower.length > 4 && rCedula.includes(termLower)) {
            score += 100;
        }
        
        const rTokens = rName.split(/\s+/).filter(t => t.length > 0);
        
        for (const t of termTokens) {
            if (rTokens.includes(t)) {
                score += 50; // Palabra exacta ("yvis" -> "yvis")
            } else if (rTokens.some(rt => rt.startsWith(t))) {
                score += 20; // Comienza con ("yvis" -> "yvismary")
            } else if (rName.includes(t)) {
                score += 5;  // Contiene en el medio ("yvis" -> "mayvis")
            }
        }
        
        if (r.sources && r.sources.length > 1) {
            score += (r.sources.length * 2);
        }
        
        r.score = score;
    }
    
    groupedResults.sort((a, b) => b.score - a.score);

    // Limitar a los mejores 15 resultados para no saturar la UI
    if (groupedResults.length > 15) {
        groupedResults = groupedResults.slice(0, 15);
    }

    return groupedResults;
}

export async function GET(req) {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q');

    if (!q || q.trim().length < 3) {
        return NextResponse.json([]);
    }

    const normalizedQuery = q.toLowerCase().trim();

    // 1. Intentar servir desde Caché
    const cachedData = getFromCache(normalizedQuery);
    if (cachedData) {
        // Añadimos un pequeño header o console log para depurar
        return NextResponse.json(cachedData, {
            headers: { 'X-Cache': 'HIT' }
        });
    }

    try {
        // 2. Si no hay caché, buscar en vivo
        const groupedResults = await performSearch(q);
        
        // 3. Guardar en caché el resultado (incluso si está vacío, para evitar saturación por búsquedas inútiles)
        setToCache(normalizedQuery, groupedResults);
        
        return NextResponse.json(groupedResults, {
            headers: { 'X-Cache': 'MISS' }
        });
    } catch (e) {
        console.error("Federated search fatal error:", e);
        return NextResponse.json({ error: "Search failed" }, { status: 500 });
    }
}

export async function syncGlobalSources() {
    console.log("[GlobalSync] Starting bulk extraction from external sources (Buffer Mode)...");
    
    // Ejecutar todas las consultas en paralelo con un timeout generoso
    const resultsSettled = await Promise.allSettled([
        withTimeout(searchSupabase(""), 8000),
        withTimeout(searchGoogleSheets(""), 8000),
        withTimeout(searchDesaparecidosAPI(""), 8000),
        withTimeout(searchRedAyudaAPI(""), 8000),
        withTimeout(searchDesaparecidosVzla(""), 8000),
        withTimeout(searchReencuentroHelp(""), 8000),
        withTimeout(searchSOSVenezuela(""), 8000),
        withTimeout(searchNodoAyuda(""), 8000)
    ]);

    let allExtracted = [];
    for (const res of resultsSettled) {
        if (res.status === 'fulfilled' && res.value && res.value.length > 0) {
            allExtracted.push(...res.value);
        }
    }

    console.log(`[GlobalSync] Fetched ${allExtracted.length} total records from external APIs.`);

    if (allExtracted.length === 0) return 0;

    const upsertStmt = db.prepare(`
        INSERT INTO registros_externos (nombre, apellido, cedula, centro, edad_sector, estado, origen, fuente_url, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(nombre, apellido, cedula, origen) DO UPDATE SET
            centro = excluded.centro,
            edad_sector = excluded.edad_sector,
            estado = excluded.estado,
            metadata = excluded.metadata,
            fuente_url = excluded.fuente_url
        WHERE estado != excluded.estado OR centro != excluded.centro OR edad_sector != excluded.edad_sector OR metadata != excluded.metadata
    `);

    let upsertCount = 0;
    db.transaction((records) => {
        for (const p of records) {
            try {
                // Limpieza básica antes de insertar
                const n = (p.nombre || '').trim();
                const a = (p.apellido || '').trim();
                const c = (p.cedula || '').trim();
                const o = (p.source || '').trim();

                // Ignorar registros vacíos
                if (!n && !a && !c) continue;

                upsertStmt.run(
                    n,
                    a,
                    c,
                    p.centro || '',
                    p.edad_sector || '',
                    p.estado || '',
                    o,
                    p.sourceUrl || '',
                    p.metadata ? JSON.stringify(p.metadata) : null
                );
                upsertCount++;
            } catch (e) {
                // Ignore silent failures on specific records
            }
        }
    })(allExtracted);

    console.log(`[GlobalSync] Successfully upserted ${upsertCount} records into local buffer.`);
    return upsertCount;
}
