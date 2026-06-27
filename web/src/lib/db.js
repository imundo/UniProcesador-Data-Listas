import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

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
    fecha_ingreso DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

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

export default db;
