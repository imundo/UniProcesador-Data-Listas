const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../data/pacientes.db');
const db = new Database(dbPath);

console.log("Iniciando migración de deduplicación cruzada...");

// 1. Crear nueva tabla con la restricción UNIQUE(nombre, apellido, cedula) 
// y el nuevo campo origenes_json
db.exec(`
  CREATE TABLE IF NOT EXISTS registros_externos_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT,
    apellido TEXT,
    cedula TEXT,
    centro TEXT,
    edad_sector TEXT,
    estado TEXT,
    origen TEXT,
    origenes_json TEXT DEFAULT '[]',
    fuente_url TEXT,
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    cne_validado BOOLEAN DEFAULT 0
  );
  -- IMPORTANTE: UNIQUE incluye COALESCE para tratar nulos como iguales o simplemente no 
  -- usar nulos. SQLite trata los NULL en UNIQUE como distintos. 
  CREATE UNIQUE INDEX idx_unique_paciente ON registros_externos_new(
    COALESCE(nombre, ''), 
    COALESCE(apellido, ''), 
    COALESCE(cedula, '')
  );
`);

// 2. Extraer todos los registros externos actuales y agruparlos
const records = db.prepare("SELECT * FROM registros_externos").all();
console.log(`Leídos ${records.length} registros externos.`);

const masterProfiles = new Map();

for (const r of records) {
    const key = `${(r.nombre || '').toLowerCase().trim()}|${(r.apellido || '').toLowerCase().trim()}|${(r.cedula || '').trim()}`;
    
    if (!masterProfiles.has(key)) {
        masterProfiles.set(key, {
            nombre: r.nombre,
            apellido: r.apellido,
            cedula: r.cedula,
            centro: r.centro,
            edad_sector: r.edad_sector,
            estado: r.estado,
            origen: r.origen, // Primary origin
            origenes: [r.origen], // Array of origins
            fuente_url: r.fuente_url,
            creado_en: r.creado_en,
            cne_validado: r.cne_validado
        });
    } else {
        const master = masterProfiles.get(key);
        // Add new origin to the array if not exists
        if (!master.origenes.includes(r.origen)) {
            master.origenes.push(r.origen);
        }
        // Update validado
        if (r.cne_validado) master.cne_validado = 1;
        // Si el centro maestro estaba vacio, llenarlo
        if (!master.centro && r.centro) master.centro = r.centro;
    }
}

console.log(`Se generaron ${masterProfiles.size} Perfiles Maestros (eliminados ${records.length - masterProfiles.size} duplicados).`);

// 3. Insertar los Perfiles Maestros en la nueva tabla
const insertStmt = db.prepare(`
    INSERT INTO registros_externos_new 
    (nombre, apellido, cedula, centro, edad_sector, estado, origen, origenes_json, fuente_url, creado_en, cne_validado)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

db.transaction(() => {
    for (const master of masterProfiles.values()) {
        insertStmt.run(
            master.nombre || '',
            master.apellido || '',
            master.cedula || '',
            master.centro || '',
            master.edad_sector || '',
            master.estado || '',
            master.origen || '',
            JSON.stringify(master.origenes),
            master.fuente_url || '',
            master.creado_en,
            master.cne_validado ? 1 : 0
        );
    }
})();

// 4. Reemplazar la tabla vieja por la nueva
db.exec(`
    DROP TABLE registros_externos;
    ALTER TABLE registros_externos_new RENAME TO registros_externos;
`);

console.log("¡Migración completada exitosamente!");
