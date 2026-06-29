import { NextResponse } from 'next/server';
import db from '@/lib/db.js';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        // 1. Obtener conteo agrupado de ambas tablas (pacientes locales + externos)
        const rows = db.prepare(`
            SELECT centro, SUM(count) as count FROM (
                SELECT centro, COUNT(*) as count 
                FROM pacientes 
                WHERE centro IS NOT NULL AND centro != '' AND centro != 'N/D' 
                GROUP BY centro 
                
                UNION ALL
                
                SELECT centro, COUNT(*) as count 
                FROM registros_externos 
                WHERE centro IS NOT NULL AND centro != '' AND centro != 'N/D' 
                GROUP BY centro
            ) 
            GROUP BY centro
            HAVING count > 2 -- Solo mostrar si hay más de 2 para no llenar el mapa de ruido
            ORDER BY count DESC
        `).all();
        
        const results = [];
        const missingCentros = [];
        
        for (const row of rows) {
            const centro = row.centro;
            
            // Check cache
            const cache = db.prepare('SELECT * FROM hospital_locations WHERE centro = ?').get(centro);
            if (cache && (cache.lat !== null || cache.last_checked)) {
                // If we have valid coords
                if (cache.lat !== null) {
                    results.push({ centro, count: row.count, lat: cache.lat, lon: cache.lon });
                }
            } else {
                // We need to geocode this location
                missingCentros.push(centro);
            }
        }
        
        // Ejecutar geocodificación en background sin bloquear la respuesta de la API
        if (missingCentros.length > 0) {
            // Tomamos un máximo de 10 por llamada para no colapsar la API y respetar los límites
            const toProcess = missingCentros.slice(0, 10);
            geocodeAsync(toProcess).catch(err => console.error("Async geocode error:", err));
        }
        
        return NextResponse.json(results);
    } catch (error) {
        console.error("Locations API Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

async function geocodeAsync(centros) {
    console.log(`[Geocoding] Procesando en background ${centros.length} centros...`);
    for (const centro of centros) {
        const query = encodeURIComponent(`${centro}, Venezuela`);
        const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`;
        
        try {
            const res = await fetch(url, { headers: { 'User-Agent': 'UnificarDataApp/1.0 (contacto@hospitalesenvenezuela.com)' }});
            
            if (res.ok) {
                const data = await res.json();
                if (data && data.length > 0) {
                    const lat = parseFloat(data[0].lat);
                    const lon = parseFloat(data[0].lon);
                    db.prepare('INSERT OR REPLACE INTO hospital_locations (centro, lat, lon) VALUES (?, ?, ?)').run(centro, lat, lon);
                } else {
                    db.prepare('INSERT OR REPLACE INTO hospital_locations (centro, lat, lon) VALUES (?, NULL, NULL)').run(centro);
                }
            }
            // Delay 1.5s to respect Nominatim limits
            await new Promise(resolve => setTimeout(resolve, 1500));
        } catch (err) {
            console.error("[Geocoding] Failed for", centro, err.message);
        }
    }
    console.log(`[Geocoding] Completado.`);
}
