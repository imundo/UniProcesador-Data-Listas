const fs = require('fs');
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../data/pacientes.db');
const db = new Database(dbPath);

// Ensure the table exists just in case
db.exec(`
  CREATE TABLE IF NOT EXISTS registros_externos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT,
    apellido TEXT,
    cedula TEXT,
    centro TEXT,
    edad_sector TEXT,
    estado TEXT,
    origen TEXT,
    fuente_url TEXT,
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(nombre, apellido, cedula, origen)
  );
`);

// Old insertStmt removed

const APELLIDOS_COMUNES = [
    "Gonzalez", "Rodriguez", "Gomez", "Fernandez", "Lopez", "Diaz", "Martinez", "Perez", "Garcia", "Sanchez",
    "Romero", "Sosa", "Alvarez", "Torres", "Ruiz", "Ramirez", "Flores", "Benitez", "Acosta", "Medina",
    "Herrera", "Suarez", "Aguilar", "Rojas", "Salinas", "Mendez", "Silva", "Castillo", "Mendoza", "Guzman",
    "Jimenez", "Moreno", "Vargas", "Blanco", "Molina", "Castro", "Ortiz", "Navarro", "Rios", "Delgado",
    "Guerrero", "Cruz", "Cabrera", "Reyes", "Arias", "Paz", "Mora", "Vidal", "Vega", "Santana",
    "Leon", "Valdes", "Mejia", "Cardenas", "Pinto", "Salazar", "Rivas", "Marquez", "Machado", "Pena",
    "Borges", "Suarez", "Colmenares", "Hernandez", "Villalobos", "Pineda", "Gimenez", "Rondon", "Padron", "Vivas",
    "Farias", "Andrade", "Villegas", "Quintero", "Montes", "Aponte", "Escobar", "Palacios", "Ochoa", "Soto",
    "Campos", "Valera", "Avila", "Uzcategui", "Cortes", "Pacheco", "Bravo", "Duarte", "Guevara", "Velasquez",
    "Figueroa", "Miranda", "Parra", "Navas", "Sequera", "Brito", "Perez", "Oropeza", "Guillen", "Bello",
    // Adding some common first names to cross search
    "Jose", "Maria", "Juan", "Luis", "Carlos", "Jesus", "Pedro", "Manuel", "Antonio", "Francisco",
    "Carmen", "Ana", "Rosa", "Margarita", "Teresa", "Elena", "Isabel", "Marta", "Laura", "Sofia",
    "Miguel", "Alejandro", "Daniel", "David", "Gabriel", "Andres", "Fernando", "Jorge", "Ricardo", "Eduardo",
    "Patricia", "Daniela", "Andrea", "Gabriela", "Mariana", "Camila", "Valentina", "Victoria", "Valeria", "Lucia",
    "Diego", "Samuel", "Matias", "Sebastian", "Martin", "Lucas", "Mateo", "Joaquin", "Nicolas", "Tomas"
];

async function searchHospitalesEnVenezuela(term) {
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
        return (Array.isArray(data) ? data : []).map(p => ({
            nombre: (p.nombre || p.nombres || "").trim(),
            apellido: (p.apellido || p.apellidos || "").trim(),
            cedula: (p.cedula || p.ci || "").toString().trim(),
            centro: (p.centro || p.hospital || "").trim(),
            edad_sector: (p.detalle || p.edad_sector || p.sector || "").trim(),
            estado: (p.estado || p.status || "Válido").trim(),
            source: 'HospitalesEnVenezuela.com',
            sourceUrl: 'https://hospitalesenvenezuela.com',
            metadata: p
        }));
    } catch (e) {
        console.error(`Error buscando ${term} en HospitalesEnVenezuela:`, e.message);
        return [];
    }
}

async function searchReencuentroHelp(term) {
    try {
        const queryParams = {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'content-type': 'application/json'
            },
            body: JSON.stringify({ kind: 'missing', q: term, "fuzzy":false, "fuzzy_amount":0.1 })
        };
        
        // Ejecutar las dos llamadas en paralelo
        const [missingRes, foundRes] = await Promise.all([
            fetch('https://rwqhswywmdjqyqnpsxqw.supabase.co/functions/v1/list-records', queryParams),
            fetch('https://rwqhswywmdjqyqnpsxqw.supabase.co/functions/v1/list-records', {
                ...queryParams,
                body: JSON.stringify({ kind: 'found', q: term, "fuzzy":false, "fuzzy_amount":0.1 })
            })
        ]);
        
        let data = [];
        if (missingRes.ok) data = data.concat(await missingRes.json());
        if (foundRes.ok) data = data.concat(await foundRes.json());
        
        const results = Array.isArray(data) ? data : [];
        
        return results.map(p => {
            const estado = p.kind === 'found' ? 'Rescatado' : 'Desaparecido';
            return {
                nombre: (p.first_name || p.name || "").trim(),
                apellido: (p.last_name || "").trim(),
                cedula: (p.id_document || p.cedula || "").toString().trim(),
                centro: (p.last_seen_location || p.location || "").trim(),
                edad_sector: (p.description || "").trim(),
                estado: estado,
                source: 'Reencuentro.help',
                sourceUrl: 'https://reencuentro.help',
                metadata: p
            };
        });
    } catch (e) {
        console.error(`Error buscando ${term} en ReencuentroHelp:`, e.message);
        return [];
    }
}

const extendedNamesPath = path.join(__dirname, 'nombres_extendidos.json');
let SEARCH_TERMS = [...APELLIDOS_COMUNES];

if (fs.existsSync(extendedNamesPath)) {
    try {
        const jsonContent = JSON.parse(fs.readFileSync(extendedNamesPath, 'utf8'));
        // Extract both "nombre" and "apellido_paterno" to use as search terms
        const extendedSet = new Set();
        
        // Handle both raw arrays and object with personas array
        const listToParse = Array.isArray(jsonContent) ? jsonContent : (jsonContent.personas || []);
        
        listToParse.forEach(item => {
            if (item.nombre) extendedSet.add(item.nombre.split(' ')[0]);
            if (item.apellido_paterno) extendedSet.add(item.apellido_paterno);
            if (item.apellido_materno) extendedSet.add(item.apellido_materno);
        });
        SEARCH_TERMS = Array.from(extendedSet);
        console.log(`Cargados ${SEARCH_TERMS.length} términos de búsqueda extendidos.`);
    } catch(e) {
        console.error("Error leyendo nombres_extendidos.json:", e.message);
    }
}

async function seed() {
    let totalInserted = 0;
    
    for (const term of SEARCH_TERMS) {
        console.log(`Buscando término: ${term}...`);
        
        const [hospResults, reenResults] = await Promise.all([
            searchHospitalesEnVenezuela(term),
            searchReencuentroHelp(term)
        ]);
        
        const allResults = [...hospResults, ...reenResults];
        
        if (allResults.length > 0) {
            const getStmt = db.prepare("SELECT id, origenes_json FROM registros_externos WHERE nombre=? AND apellido=? AND cedula=?");
            
            const insertStmt = db.prepare(`
                INSERT INTO registros_externos (nombre, apellido, cedula, centro, edad_sector, estado, origen, origenes_json, fuente_url, metadata)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            
            const updateStmt = db.prepare(`
                UPDATE registros_externos SET 
                    centro = COALESCE(NULLIF(?, ''), centro),
                    estado = COALESCE(NULLIF(?, ''), estado),
                    edad_sector = COALESCE(NULLIF(?, ''), edad_sector),
                    fuente_url = COALESCE(NULLIF(?, ''), fuente_url),
                    origenes_json = ?,
                    metadata = ?,
                    creado_en = CURRENT_TIMESTAMP
                WHERE id = ?
            `);

            const insertMany = db.transaction((records) => {
                let insertedCount = 0;
                for (const r of records) {
                    try {
                        const nombre = (r.nombre || '').trim();
                        const apellido = (r.apellido || '').trim();
                        const cedula = (r.cedula || '').trim();
                        const origen = (r.source || 'Desconocido').trim();
                        const metadataJson = JSON.stringify(r.metadata || {});

                        const existing = getStmt.get(nombre, apellido, cedula);

                        if (existing) {
                            let origenes = [];
                            try { origenes = JSON.parse(existing.origenes_json || '[]'); } catch(e){}
                            
                            if (!origenes.includes(origen)) {
                                origenes.push(origen);
                            }
                            
                            updateStmt.run(
                                (r.centro || '').trim(),
                                (r.estado || '').trim(),
                                (r.edad_sector || '').trim(),
                                (r.sourceUrl || '').trim(),
                                JSON.stringify(origenes),
                                metadataJson,
                                existing.id
                            );
                        } else {
                            insertStmt.run(
                                nombre,
                                apellido,
                                cedula,
                                (r.centro || '').trim(),
                                (r.edad_sector || '').trim(),
                                (r.estado || '').trim(),
                                origen,
                                JSON.stringify([origen]),
                                (r.sourceUrl || '').trim(),
                                metadataJson
                            );
                            insertedCount++;
                        }
                    } catch(e) {
                        // ignore duplicates error
                    }
                }
                return insertedCount;
            });
            
            const count = insertMany(allResults);
            totalInserted += count;
            console.log(` > ${count} registros insertados. Total hasta ahora: ${totalInserted}`);
        } else {
            console.log(` > 0 coincidencias.`);
        }
        
        // Rate limiting to avoid blocking
        await new Promise(r => setTimeout(r, 1500));
    }
    
    console.log(`\n¡Extracción finalizada! Se insertaron/actualizaron ${totalInserted} registros en total.`);
}

seed().catch(console.error);
