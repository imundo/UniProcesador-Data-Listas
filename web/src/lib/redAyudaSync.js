import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import db from './db.js';


puppeteer.use(StealthPlugin());

function normalizeText(text) {
    if (!text) return "";
    return text.toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, ' ');
}

export async function syncRedAyuda() {
    console.log("[RedAyuda Sync] Inicializando sincronización...");
    let browser;
    try {
        browser = await puppeteer.launch({ 
            headless: 'new',
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        
        // Evadir bloqueos comunes
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36');
        
        console.log("[RedAyuda Sync] Obteniendo datos desde la API pública protegida...");
        await page.goto('https://redayudavenezuela.com/api/data', { waitUntil: 'domcontentloaded', timeout: 45000 });
        
        // El navegador mostrará el JSON crudo en el body
        const jsonText = await page.evaluate(() => document.body.innerText);
        
        let payload;
        try {
            payload = JSON.parse(jsonText);
        } catch (err) {
            throw new Error("No se pudo parsear el JSON de RedAyuda. ¿Posible bloqueo de Cloudflare?");
        }
        
        if (!payload.ok || !payload.data) {
            throw new Error("Formato de API inválido.");
        }
        
        const data = payload.data;
        console.log(`[RedAyuda Sync] Extraídos ${data.length} registros exitosamente.`);
        
        let insertedCount = 0;
        let updatedCount = 0;
        
        // Comenzar transacción
        const insertStmt = db.prepare(`
            INSERT OR IGNORE INTO registros_externos 
            (nombre, apellido, cedula, centro, edad_sector, estado, origen, fuente_url, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        const updateStmt = db.prepare(`
            UPDATE registros_externos 
            SET estado = ?, centro = ?, metadata = ?
            WHERE nombre = ? AND apellido = ? AND origen = ?
        `);
        
        db.exec('BEGIN TRANSACTION');
        
        for (const item of data) {
            // item.name suele tener "Nombre Apellido, Edad" o "Nombre Apellido"
            let nameParts = (item.name || item.title || "").split(',');
            let rawFullName = nameParts[0].trim();
            
            // Separar Nombres y Apellidos burdamente (primer mitad nombres, segunda apellidos)
            let words = rawFullName.split(' ');
            let nombre = words.slice(0, Math.ceil(words.length / 2)).join(' ');
            let apellido = words.slice(Math.ceil(words.length / 2)).join(' ');
            
            let edad = item.age || (nameParts[1] ? nameParts[1].trim() : "");
            
            let estado = item.status === 'active' ? 'Desaparecido' : 
                         (item.category === 'ingresado' ? 'Hospitalizado' : item.status);
            
            let centro = item.kind === 'hospital' ? item.title : (item.last_seen || "");
            
            // Construir metadata rica
            const meta = {
                id_redayuda: item.id,
                descripcion: item.description,
                foto: item.photo_url,
                ultima_vez_visto: item.last_seen,
                kind: item.kind,
                category: item.category
            };
            
            const metaStr = JSON.stringify(meta);
            
            const origen = 'RedAyudaVenezuela';
            const fuenteUrl = item.kind === 'hospital' ? 'https://redayudavenezuela.com/hospitales' : 'https://redayudavenezuela.com/desaparecidos';
            
            // Insertar o actualizar
            const res = insertStmt.run(nombre, apellido, "", centro, edad.toString(), estado, origen, fuenteUrl, metaStr);
            if (res.changes > 0) {
                insertedCount++;
            } else {
                updateStmt.run(estado, centro, metaStr, nombre, apellido, origen);
                updatedCount++;
            }
        }
        
        db.exec('COMMIT');
        
        console.log(`[RedAyuda Sync] Sincronización finalizada. Insertados: ${insertedCount}, Actualizados: ${updatedCount}`);
        
        return { success: true, inserted: insertedCount, updated: updatedCount };
        
    } catch (error) {
        console.error("[RedAyuda Sync] Error:", error.message);
        if (db.inTransaction) db.exec('ROLLBACK');
        return { success: false, error: error.message };
    } finally {
        if (browser) await browser.close();
    }
}
