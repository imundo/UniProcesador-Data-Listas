const cron = require('node-cron');
const https = require('https');

console.log("[CRON] Inicializando planificador automático...");

// Tarea 1: Ejecutar Sincronización del Mega-Script todos los días a las 3:00 AM
cron.schedule('0 3 * * *', () => {
    console.log("[CRON] Ejecutando sincronización de extracción masiva de portales (3:00 AM)...");
    
    // Llamar a nuestra propia API
    https.get('https://uniprocesador-data-listas-production.up.railway.app/api/admin/seed?run=true', (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => console.log("[CRON] Extracción masiva completada con éxito."));
    }).on('error', (err) => {
        console.error("[CRON] Error ejecutando la sincronización de extracción:", err.message);
    });
});

// Tarea 2: Sincronizar RedAyudaVenezuela cada 4 horas
cron.schedule('0 */4 * * *', () => {
    console.log("[CRON] Ejecutando sincronización de RedAyudaVenezuela...");
    const http = require('http');
    
    // Llamamos al localhost ya que este script corre junto a Next.js (npm run dev/start)
    const req = http.request({
        hostname: 'localhost',
        port: process.env.PORT || 8080,
        path: '/api/admin/sync-redayuda',
        method: 'POST'
    }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => console.log("[CRON] RedAyuda sincronizado exitosamente."));
    });
    
    req.on('error', (err) => {
        console.error("[CRON] Error sincronizando RedAyuda:", err.message);
    });
    req.end();
});

console.log("[CRON] Planificador inicializado correctamente. Tareas de RedAyuda configuradas.");
