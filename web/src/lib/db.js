import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

let dbInstance = null;

function getDb() {
    if (dbInstance) return dbInstance;

    // Asegurar que el directorio de datos existe
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }

    const dbPath = path.join(dataDir, 'pacientes.db');
    const db = new Database(dbPath, { timeout: 8000 });

    db.pragma('journal_mode = WAL'); // Mejor rendimiento y concurrencia

    // Inicializar tabla si no existe
    db.exec(`
      CREATE TABLE IF NOT EXISTS pacientes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT,
        apellido TEXT,
        cedula TEXT,
        centro TEXT,
        edad_sector TEXT,
        estatus TEXT DEFAULT 'Válido',
        fecha_ingreso DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS hospital_locations (
        centro TEXT PRIMARY KEY,
        lat REAL,
        lon REAL,
        last_checked DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS cross_matches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        paciente_id INTEGER,
        nombre_local TEXT,
        apellido_local TEXT,
        cedula_local TEXT,
        nombre_externo TEXT,
        apellido_externo TEXT,
        cedula_externo TEXT,
        centro_externo TEXT,
        edad_externo TEXT,
        estado_externo TEXT,
        match_score REAL,
        sources TEXT,
        status TEXT DEFAULT 'pending',
        recognized_by_name TEXT,
        recognized_by_email TEXT,
        recognized_by_phone TEXT,
        recognized_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (paciente_id) REFERENCES pacientes(id)
      );

      CREATE TABLE IF NOT EXISTS cross_match_status (
        id INTEGER PRIMARY KEY DEFAULT 1,
        status TEXT DEFAULT 'idle',
        progress INTEGER DEFAULT 0,
        total INTEGER DEFAULT 0,
        matches_found INTEGER DEFAULT 0,
        started_at DATETIME,
        completed_at DATETIME
      );

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

    // Migración: añadir batch_id y estatus si no existen
    try {
        const tableInfo = db.pragma("table_info(pacientes)");
        const hasBatchId = tableInfo.some(col => col.name === 'batch_id');
        if (!hasBatchId) {
            db.exec("ALTER TABLE pacientes ADD COLUMN batch_id TEXT");
        }
        const hasEstatus = tableInfo.some(col => col.name === 'estatus');
        if (!hasEstatus) {
            db.exec("ALTER TABLE pacientes ADD COLUMN estatus TEXT DEFAULT 'Válido'");
        }
    } catch(e) {
        console.error("Migration error:", e);
    }

    // Migración: añadir campos de reconocimiento a cross_matches si no existen
    try {
        const cmInfo = db.pragma("table_info(cross_matches)");
        if (cmInfo.length > 0) {
            const hasStatus = cmInfo.some(col => col.name === 'status');
            if (!hasStatus) db.exec("ALTER TABLE cross_matches ADD COLUMN status TEXT DEFAULT 'pending'");
            const hasRecName = cmInfo.some(col => col.name === 'recognized_by_name');
            if (!hasRecName) {
                db.exec("ALTER TABLE cross_matches ADD COLUMN recognized_by_name TEXT");
                db.exec("ALTER TABLE cross_matches ADD COLUMN recognized_by_email TEXT");
                db.exec("ALTER TABLE cross_matches ADD COLUMN recognized_by_phone TEXT");
                db.exec("ALTER TABLE cross_matches ADD COLUMN recognized_at DATETIME");
            }
        }
    } catch(e) {
        console.error("Cross-match migration error:", e);
    }

    // Migrar desde CSV si existe y la DB está vacía
    const row = db.prepare("SELECT COUNT(*) as count FROM pacientes").get();
    if (row.count === 0) {
        const csvPath = path.join(dataDir, 'plantilla_pacientes.csv');
        if (fs.existsSync(csvPath)) {
            console.log("Migrando datos desde CSV a SQLite...");
            const content = fs.readFileSync(csvPath, 'utf8');
            const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
            
            if (lines.length > 1) {
                const dataLines = lines.slice(1);
                const insert = db.prepare('INSERT INTO pacientes (nombre, apellido, cedula, centro, edad_sector) VALUES (?, ?, ?, ?, ?)');
                
                const migrate = db.transaction((lines) => {
                    for (const line of lines) {
                        const parts = line.split(',');
                        insert.run(
                            parts[0] || '',
                            parts[1] || '',
                            parts[2] || '',
                            parts[3] || '',
                            parts[4] || ''
                        );
                    }
                });
                migrate(dataLines);
                console.log(`Migración exitosa: ${dataLines.length} registros insertados.`);
            }
        }
    }

    dbInstance = db;
    return dbInstance;
}

// Exportamos un Proxy para que la conexión a la base de datos sea perezosa (Lazy Initialization).
// Esto previene que Next.js bloquee la base de datos ('SQLITE_BUSY') durante la fase de 'next build'
// cuando múltiples workers intentan evaluar este módulo simultáneamente.
const dbProxy = new Proxy({}, {
    get(target, prop) {
        const db = getDb();
        const value = db[prop];
        if (typeof value === 'function') {
            return value.bind(db);
        }
        return value;
    }
});

export default dbProxy;
