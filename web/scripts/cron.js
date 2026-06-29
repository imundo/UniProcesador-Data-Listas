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

console.log("[CRON] Planificador inicializado correctamente. Sincronización de registros externos configurada a las 3:00 AM.");
