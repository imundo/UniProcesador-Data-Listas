export function runInPlaceDeduplication(db) {
    console.log("[Deduplication] Starting in-place deduplication of registros_externos...");
    
    const records = db.prepare("SELECT * FROM registros_externos").all();
    
    // Group records by unique key (nombre, apellido, cedula)
    const groups = new Map();
    for (const r of records) {
        const key = `${(r.nombre || '').toLowerCase().trim()}|${(r.apellido || '').toLowerCase().trim()}|${(r.cedula || '').trim()}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(r);
    }
    
    let deletedCount = 0;
    let updatedCount = 0;
    
    const updateStmt = db.prepare(`UPDATE registros_externos SET origenes_json = ?, centro = ?, cne_validado = ? WHERE id = ?`);
    const deleteStmt = db.prepare(`DELETE FROM registros_externos WHERE id = ?`);
    
    db.transaction(() => {
        for (const [key, group] of groups.entries()) {
            if (group.length <= 1) continue; // No duplicates
            
            // Sort by id to keep the oldest as master
            group.sort((a, b) => a.id - b.id);
            const master = group[0];
            const duplicates = group.slice(1);
            
            let masterOrigenes = [];
            try { masterOrigenes = JSON.parse(master.origenes_json || '[]'); } catch(e){}
            if (masterOrigenes.length === 0 && master.origen) masterOrigenes = [master.origen];
            
            let changed = false;
            let currentCentro = master.centro;
            let currentCne = master.cne_validado;
            
            for (const dup of duplicates) {
                // Gather origenes
                let dupOrigenes = [];
                try { dupOrigenes = JSON.parse(dup.origenes_json || '[]'); } catch(e){}
                if (dupOrigenes.length === 0 && dup.origen) dupOrigenes = [dup.origen];
                
                for (const o of dupOrigenes) {
                    if (o && !masterOrigenes.includes(o)) {
                        masterOrigenes.push(o);
                        changed = true;
                    }
                }
                
                if (!currentCentro && dup.centro) {
                    currentCentro = dup.centro;
                    changed = true;
                }
                
                if (!currentCne && dup.cne_validado) {
                    currentCne = 1;
                    changed = true;
                }
                
                // Delete the duplicate
                deleteStmt.run(dup.id);
                deletedCount++;
            }
            
            if (changed) {
                updateStmt.run(JSON.stringify(masterOrigenes), currentCentro || '', currentCne ? 1 : 0, master.id);
                updatedCount++;
            }
        }
    })();
    
    console.log(`[Deduplication] Finished registros_externos. Deleted ${deletedCount} duplicates, updated ${updatedCount} master records.`);
}

export function runPacientesDeduplication(db) {
    console.log("[Deduplication] Starting in-place deduplication of pacientes...");
    const records = db.prepare("SELECT * FROM pacientes").all();
    
    const groups = new Map();
    for (const r of records) {
        const key = `${(r.nombre || '').toLowerCase().trim()}|${(r.apellido || '').toLowerCase().trim()}|${(r.cedula || '').trim()}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(r);
    }
    
    let deletedCount = 0;
    let updatedCount = 0;
    const deleteStmt = db.prepare(`DELETE FROM pacientes WHERE id = ?`);
    const updateStmt = db.prepare(`UPDATE pacientes SET centro = ?, edad_sector = ? WHERE id = ?`);
    
    db.transaction(() => {
        for (const [key, group] of groups.entries()) {
            if (group.length <= 1) continue;
            group.sort((a, b) => a.id - b.id);
            const master = group[0];
            const duplicates = group.slice(1);
            
            let changed = false;
            let centro = master.centro;
            let edad = master.edad_sector;
            
            for (const dup of duplicates) {
                if (!centro && dup.centro) { centro = dup.centro; changed = true; }
                if (!edad && dup.edad_sector) { edad = dup.edad_sector; changed = true; }
                deleteStmt.run(dup.id);
                deletedCount++;
            }
            if (changed) {
                updateStmt.run(centro || '', edad || '', master.id);
                updatedCount++;
            }
        }
    })();
    console.log(`[Deduplication] Finished pacientes. Deleted ${deletedCount} duplicate pacientes, updated ${updatedCount} master records.`);
}
