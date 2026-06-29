function getTokensStr(str) {
    if (!str) return [];
    return str.toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, "").trim().split(/\s+/).filter(w => w.length > 2);
}

function getDedupKeys(record) {
    const keys = [];
    
    // 1. Cédula (Strongest identifier)
    if (record.cedula && record.cedula.length > 4) {
        keys.push('cedula:' + record.cedula.replace(/[^0-9]/g, ''));
    }
    
    let nt = getTokensStr(record.nombre);
    let at = getTokensStr(record.apellido);
    
    // 2. Si el apellido está vacío pero el nombre tiene 2+ palabras, lo partimos a la mitad
    if (at.length === 0 && nt.length >= 2) {
        const half = Math.ceil(nt.length / 2);
        at = nt.slice(half);
        nt = nt.slice(0, half);
    }
    
    // 3. Primer nombre + Primer apellido (El estándar de identificación más común)
    if (nt.length >= 1 && at.length >= 1) {
        keys.push('name:' + nt[0] + '|' + at[0]);
    }
    
    // 4. Fallback por si acaso todo quedó en un solo nombre
    if (nt.length >= 2 && at.length === 0) {
        keys.push('name:' + nt[0] + '|' + nt[1]);
    }
    
    return keys;
}

function getClusters(records) {
    const parent = new Map();
    const find = (i) => {
        if (!parent.has(i)) parent.set(i, i);
        if (parent.get(i) === i) return i;
        const root = find(parent.get(i));
        parent.set(i, root);
        return root;
    };
    const union = (i, j) => {
        const rootI = find(i);
        const rootJ = find(j);
        if (rootI !== rootJ) parent.set(rootI, rootJ);
    };

    const fullMap = new Map();
    for (let i = 0; i < records.length; i++) {
        const keys = getDedupKeys(records[i]);
        for (const key of keys) {
            if (!fullMap.has(key)) fullMap.set(key, []);
            fullMap.get(key).push(i);
        }
    }

    // Union all records that share any dedup key
    for (const matches of fullMap.values()) {
        for (let i = 1; i < matches.length; i++) {
            union(matches[0], matches[i]);
        }
    }

    const clusters = new Map();
    for (let i = 0; i < records.length; i++) {
        const root = find(i);
        if (!clusters.has(root)) clusters.set(root, []);
        clusters.get(root).push(records[i]);
    }
    
    return Array.from(clusters.values());
}

export function runInPlaceDeduplication(db) {
    console.log("[Deduplication] Starting advanced in-place deduplication of registros_externos...");
    
    const records = db.prepare("SELECT * FROM registros_externos").all();
    const clusters = getClusters(records);
    
    let deletedCount = 0;
    let updatedCount = 0;
    
    const updateStmt = db.prepare(`UPDATE registros_externos SET origenes_json = ?, centro = ?, cne_validado = ?, cedula = ?, metadata = ? WHERE id = ?`);
    const deleteStmt = db.prepare(`DELETE FROM registros_externos WHERE id = ?`);
    const statsStmt = db.prepare(`UPDATE system_stats SET value = value + ? WHERE key = 'external_duplicates_removed'`);
    
    db.transaction(() => {
        for (const group of clusters) {
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
            let currentCedula = master.cedula;
            
            let masterMeta = {};
            try { masterMeta = master.metadata ? JSON.parse(master.metadata) : {}; } catch(e){}
            
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
                
                if (!currentCedula && dup.cedula) {
                    currentCedula = dup.cedula;
                    changed = true;
                }
                
                // Merge metadata
                try { 
                    const dMeta = dup.metadata ? JSON.parse(dup.metadata) : {};
                    if (Object.keys(dMeta).length > 0) {
                        masterMeta = { ...dMeta, ...masterMeta }; // master overrides dup keys if exist
                        changed = true;
                    }
                } catch(e){}
                
                // Delete the duplicate
                deleteStmt.run(dup.id);
                deletedCount++;
            }
            
            if (changed) {
                updateStmt.run(
                    JSON.stringify(masterOrigenes), 
                    currentCentro || '', 
                    currentCne ? 1 : 0, 
                    currentCedula || '', 
                    JSON.stringify(masterMeta),
                    master.id
                );
                updatedCount++;
            }
        }
        if (deletedCount > 0) {
            statsStmt.run(deletedCount);
        }
    })();
    
    console.log(`[Deduplication] Finished registros_externos. Deleted ${deletedCount} duplicates, updated ${updatedCount} master records.`);
}

export function runPacientesDeduplication(db) {
    console.log("[Deduplication] Starting advanced in-place deduplication of pacientes...");
    const records = db.prepare("SELECT * FROM pacientes").all();
    const clusters = getClusters(records);
    
    let deletedCount = 0;
    let updatedCount = 0;
    const deleteCrossMatchesStmt = db.prepare(`DELETE FROM cross_matches WHERE paciente_id = ?`);
    const deleteStmt = db.prepare(`DELETE FROM pacientes WHERE id = ?`);
    const updateStmt = db.prepare(`UPDATE pacientes SET centro = ?, edad_sector = ?, cedula = ? WHERE id = ?`);
    const statsStmt = db.prepare(`UPDATE system_stats SET value = value + ? WHERE key = 'local_duplicates_removed'`);
    
    db.transaction(() => {
        for (const group of clusters) {
            if (group.length <= 1) continue;
            group.sort((a, b) => a.id - b.id);
            const master = group[0];
            const duplicates = group.slice(1);
            
            let changed = false;
            let centro = master.centro;
            let edad = master.edad_sector;
            let cedula = master.cedula;
            
            for (const dup of duplicates) {
                if (!centro && dup.centro) { centro = dup.centro; changed = true; }
                if (!edad && dup.edad_sector) { edad = dup.edad_sector; changed = true; }
                if (!cedula && dup.cedula) { cedula = dup.cedula; changed = true; }
                
                // Prevent FOREIGN KEY constraint failure
                deleteCrossMatchesStmt.run(dup.id);
                deleteStmt.run(dup.id);
                deletedCount++;
            }
            if (changed) {
                updateStmt.run(centro || '', edad || '', cedula || '', master.id);
                updatedCount++;
            }
        }
        if (deletedCount > 0) {
            statsStmt.run(deletedCount);
        }
    })();
    console.log(`[Deduplication] Finished pacientes. Deleted ${deletedCount} duplicate pacientes, updated ${updatedCount} master records.`);
}
