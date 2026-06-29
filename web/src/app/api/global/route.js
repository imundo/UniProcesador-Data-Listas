import { NextResponse } from 'next/server';
import db from '@/lib/db.js';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export async function GET() {
    try {
        const row = db.prepare("SELECT COUNT(*) as count FROM pacientes").get();
        const total = row.count;
        
        let externalCount = 0;
        try {
            const extRow = db.prepare("SELECT COUNT(*) as count FROM registros_externos").get();
            externalCount = extRow.count;
        } catch (e) {
            // Table might not exist yet if running very first time
        }
        
        let crossesFound = 0;
        try {
            const cmRow = db.prepare("SELECT COUNT(*) as count FROM cross_matches").get();
            crossesFound = cmRow.count;
        } catch(e) {}
        
        let localDuplicatesRemoved = 0;
        let externalDuplicatesRemoved = 0;
        try {
            const statLocal = db.prepare("SELECT value FROM system_stats WHERE key = 'local_duplicates_removed'").get();
            if (statLocal) localDuplicatesRemoved = statLocal.value;
            const statExt = db.prepare("SELECT value FROM system_stats WHERE key = 'external_duplicates_removed'").get();
            if (statExt) externalDuplicatesRemoved = statExt.value;
        } catch(e) {}
        
        if (total === 0 && externalCount === 0) {
            return NextResponse.json({ total: 0, externalCount: 0, crossesFound: 0, showing: 0, pacientes: [], localDuplicatesRemoved, externalDuplicatesRemoved });
        }

        const pacientes = db.prepare('SELECT * FROM pacientes ORDER BY id DESC').all();
        let externos = [];
        try {
            externos = db.prepare('SELECT id, nombre, apellido, cedula, centro, edad_sector, estado as estatus, origen FROM registros_externos ORDER BY id DESC').all();
        } catch (e) {}

        const combined = [
            ...pacientes.map(p => ({ ...p, isExternal: false })),
            ...externos.map(e => ({ ...e, isExternal: true }))
        ];

        return NextResponse.json({ 
            total, 
            externalCount,
            crossesFound,
            localDuplicatesRemoved,
            externalDuplicatesRemoved,
            showing: combined.length, 
            pacientes: combined 
        });
    } catch (error) {
        console.error("API Global Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
