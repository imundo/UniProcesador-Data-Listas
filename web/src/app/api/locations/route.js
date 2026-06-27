import { NextResponse } from 'next/server';
import db from '@/lib/db.js';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const rows = db.prepare(`
            SELECT centro, COUNT(*) as count 
            FROM pacientes 
            WHERE centro IS NOT NULL AND centro != '' AND centro != 'N/D' 
            GROUP BY centro 
            HAVING COUNT(*) > 5 
            ORDER BY count DESC
        `).all();
        
        const results = [];
        
        for (const row of rows) {
            const centro = row.centro;
            
            // Check cache
            const cache = db.prepare('SELECT * FROM hospital_locations WHERE centro = ?').get(centro);
            if (cache && (cache.lat !== null || cache.last_checked)) {
                // If we have valid coords or we already checked and found nothing, use cache
                if (cache.lat !== null) {
                    results.push({ centro, count: row.count, lat: cache.lat, lon: cache.lon });
                }
                continue;
            }
            
            // Geocode
            // Add 'Venezuela' to help nominatim find it specifically in the country
            const query = encodeURIComponent(`${centro}, Venezuela`);
            const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`;
            
            try {
                // Nominatim strictly requires a custom user agent for free usage
                const res = await fetch(url, { headers: { 'User-Agent': 'UnificarDataApp/1.0 (contacto@hospitalesenvenezuela.com)' }});
                
                if (res.ok) {
                    const data = await res.json();
                    
                    if (data && data.length > 0) {
                        const lat = parseFloat(data[0].lat);
                        const lon = parseFloat(data[0].lon);
                        
                        db.prepare('INSERT OR REPLACE INTO hospital_locations (centro, lat, lon) VALUES (?, ?, ?)').run(centro, lat, lon);
                        results.push({ centro, count: row.count, lat, lon });
                    } else {
                        // Not found, cache as null so we don't query again
                        db.prepare('INSERT OR REPLACE INTO hospital_locations (centro, lat, lon) VALUES (?, NULL, NULL)').run(centro);
                    }
                    
                    // Be polite to Nominatim rate limits (max 1 req/sec)
                    await new Promise(resolve => setTimeout(resolve, 1500));
                } else {
                    console.error("Nominatim API Error:", res.status);
                }
            } catch (err) {
                console.error("Geocoding error for", centro, err);
            }
        }
        
        return NextResponse.json(results);
    } catch (error) {
        console.error("Locations API Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
