import { NextResponse } from 'next/server';
import db from '@/lib/db.js';
import { performSearch } from '@/app/api/search/route.js';

export const dynamic = 'force-dynamic';

// Fuentes a EXCLUIR del cruce (misma data que la nuestra)
const EXCLUDED_SOURCES = ['Base de Datos Local', 'HospitalesEnVenezuela.com'];

function normalizeText(text) {
    if (!text) return "";
    return text.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function cleanCedula(cedula) {
    if (!cedula) return "";
    return cedula.toString().replace(/[^0-9]/g, "").trim();
}

function extractAge(edadSector) {
    if (!edadSector) return null;
    const match = edadSector.match(/(\d{1,3})\s*(años|a[ñn]os|a\b)/i);
    if (match) return parseInt(match[1]);
    const numMatch = edadSector.match(/^(\d{1,3})\b/);
    if (numMatch && parseInt(numMatch[1]) < 130) return parseInt(numMatch[1]);
    return null;
}

function getNameTokens(nombre, apellido) {
    const full = normalizeText(`${nombre || ''} ${apellido || ''}`);
    return full.split(/\s+/).filter(t => t.length > 1);
}

function calculateMatchScore(local, external) {
    let score = 0;

    const localTokens = getNameTokens(local.nombre, local.apellido);
    const extTokens = getNameTokens(external.nombre, external.apellido);
    
    if (localTokens.length > 0 && extTokens.length > 0) {
        const matchedTokens = localTokens.filter(t => extTokens.some(et => et === t || (t.length > 3 && et.startsWith(t)) || (et.length > 3 && t.startsWith(et))));
        const nameRatio = matchedTokens.length / Math.max(localTokens.length, extTokens.length);
        if (nameRatio >= 0.5) score += 20 * nameRatio;
    }

    const localApellido = normalizeText(local.apellido || '');
    const extApellido = normalizeText(external.apellido || '');
    if (localApellido && extApellido) {
        if (localApellido === extApellido) score += 20;
        else if (localApellido.length >= 3 && extApellido.length >= 3 && localApellido.substring(0, 3) === extApellido.substring(0, 3)) score += 12;
    }

    const localCedula = cleanCedula(local.cedula);
    const extCedula = cleanCedula(external.cedula);
    if (localCedula && extCedula && localCedula.length >= 5 && extCedula.length >= 5) {
        if (localCedula === extCedula) score += 20;
    }

    const localAge = extractAge(local.edad_sector);
    const extAge = extractAge(external.edad_sector || external.edad_externo);
    if (localAge && extAge) {
        if (localAge === extAge) score += 20;
        else if (Math.abs(localAge - extAge) <= 2) score += 12;
    }

    const localCentro = normalizeText(local.centro || '');
    const extCentro = normalizeText(external.centro || '');
    if (localCentro && extCentro && localCentro.length > 2 && extCentro.length > 2) {
        const localCTokens = localCentro.split(/\s+/).filter(t => t.length > 2);
        const extCTokens = extCentro.split(/\s+/).filter(t => t.length > 2);
        const commonTokens = localCTokens.filter(t => extCTokens.includes(t));
        if (commonTokens.length > 0) score += 20 * (commonTokens.length / Math.max(localCTokens.length, extCTokens.length));
    }

    return Math.round(score);
}

// ============ AUTO-SCHEDULER ============
let crossMatchJobState = {
    status: 'idle',
    progress: 0,
    total: 0,
    matchesFound: 0,
    startedAt: null,
    completedAt: null,
};

const THREE_HOURS_MS = 3 * 60 * 60 * 1000;
let schedulerStarted = false;

async function runCrossMatch() {
    if (crossMatchJobState.status === 'running') {
        console.log('[CrossMatch] Already running, skipping...');
        return;
    }

    console.log('[CrossMatch] Starting cross-match sync...');
    const pacientes = db.prepare("SELECT * FROM pacientes WHERE estatus = 'Válido' OR estatus IS NULL").all();
    
    crossMatchJobState = {
        status: 'running',
        progress: 0,
        total: pacientes.length,
        matchesFound: 0,
        startedAt: new Date().toISOString(),
        completedAt: null,
    };

    try {
        db.prepare("DELETE FROM cross_match_status").run();
        db.prepare("INSERT INTO cross_match_status (id, status, progress, total, matches_found, started_at) VALUES (1, 'running', 0, ?, 0, ?)").run(pacientes.length, crossMatchJobState.startedAt);
    } catch(e) { /* first run */ }

    const currentSyncId = Date.now();

    const insertMatch = db.prepare(`
        INSERT INTO cross_matches (paciente_id, nombre_local, apellido_local, cedula_local, nombre_externo, apellido_externo, cedula_externo, centro_externo, edad_externo, estado_externo, match_score, sources, status, last_sync)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
    `);

    // Check if this match already exists (either pending or recognized)
    const checkExisting = db.prepare(
        "SELECT id, status FROM cross_matches WHERE paciente_id = ? AND nombre_externo = ? AND apellido_externo = ? LIMIT 1"
    );
    const updateSync = db.prepare("UPDATE cross_matches SET last_sync = ? WHERE id = ?");

    const BATCH_SIZE = 5;
    const DELAY_MS = 1500;
    let totalMatchesFound = 0;

    for (let i = 0; i < pacientes.length; i += BATCH_SIZE) {
        const batch = pacientes.slice(i, i + BATCH_SIZE);

        const batchPromises = batch.map(async (paciente) => {
            try {
                const searchQuery = (paciente.cedula && paciente.cedula.trim().length >= 5) 
                    ? paciente.cedula.trim() 
                    : `${paciente.nombre || ''} ${paciente.apellido || ''}`.trim();

                if (!searchQuery || searchQuery.length < 3) return [];

                const results = await performSearch(searchQuery);
                
                // Filter out excluded sources
                const externalResults = results.filter(r => {
                    const sources = r.sources || [{name: r.source}];
                    return !sources.every(s => EXCLUDED_SOURCES.includes(s.name));
                });

                const matches = [];
                for (const ext of externalResults) {
                    const score = calculateMatchScore(paciente, ext);
                    if (score >= 40) {
                        const sources = (ext.sources || [{name: ext.source, url: ext.sourceUrl}])
                            .filter(s => !EXCLUDED_SOURCES.includes(s.name));
                        
                        if (sources.length === 0) continue;

                        matches.push({
                            paciente,
                            external: ext,
                            score,
                            sources
                        });
                    }
                }
                return matches;
            } catch (e) {
                console.error(`[CrossMatch] Error for paciente ${paciente.id}:`, e.message);
                return [];
            }
        });

        const batchResults = await Promise.all(batchPromises);
        const flatResults = batchResults.flat();
        
        if (flatResults.length > 0) {
            db.transaction((results) => {
                for (const m of results) {
                    // Skip if already exists, just update sync timestamp so it doesn't get deleted
                    const existing = checkExisting.get(m.paciente.id, m.external.nombre || '', m.external.apellido || '');
                    if (existing) {
                        if (existing.status === 'pending') {
                            updateSync.run(currentSyncId, existing.id);
                        }
                        continue;
                    }

                    insertMatch.run(
                        m.paciente.id,
                        m.paciente.nombre || '',
                        m.paciente.apellido || '',
                        m.paciente.cedula || '',
                        m.external.nombre || '',
                        m.external.apellido || '',
                        m.external.cedula || '',
                        m.external.centro || '',
                        m.external.edad_sector || '',
                        m.external.estado || '',
                        m.score,
                        JSON.stringify(m.sources.map(s => ({ name: s.name, url: s.url || '#' }))),
                        currentSyncId
                    );
                }
            })(flatResults);
            totalMatchesFound += flatResults.length;
        }

        crossMatchJobState.progress = Math.min(i + BATCH_SIZE, pacientes.length);
        crossMatchJobState.matchesFound = totalMatchesFound;

        if ((i / BATCH_SIZE) % 5 === 0 || i + BATCH_SIZE >= pacientes.length) {
            db.prepare("UPDATE cross_match_status SET progress = ?, matches_found = ? WHERE id = 1")
                .run(crossMatchJobState.progress, totalMatchesFound);
        }

        if (i + BATCH_SIZE < pacientes.length) {
            await new Promise(resolve => setTimeout(resolve, DELAY_MS));
        }
    }

    // Delete matches that were not found in this sync run (removed from external APIs)
    db.prepare("DELETE FROM cross_matches WHERE status = 'pending' AND last_sync != ?").run(currentSyncId);

    crossMatchJobState.status = 'completed';
    crossMatchJobState.completedAt = new Date().toISOString();
    
    db.prepare("UPDATE cross_match_status SET status = 'completed', progress = ?, matches_found = ?, completed_at = ? WHERE id = 1")
        .run(crossMatchJobState.progress, totalMatchesFound, crossMatchJobState.completedAt);

    console.log(`[CrossMatch] Completed. ${totalMatchesFound} matches found out of ${pacientes.length} patients.`);
}

function startScheduler() {
    if (schedulerStarted) return;
    schedulerStarted = true;

    console.log('[CrossMatch] Scheduler initialized. Will run every 3 hours.');

    // Check if we should run immediately (first time or last run > 3 hours ago)
    const statusRow = db.prepare("SELECT * FROM cross_match_status WHERE id = 1").get();
    const shouldRunNow = !statusRow || !statusRow.completed_at || 
        (Date.now() - new Date(statusRow.completed_at).getTime() > THREE_HOURS_MS);

    if (shouldRunNow) {
        console.log('[CrossMatch] No recent sync found. Starting initial cross-match...');
        // Delay 10 seconds to let the server fully start
        setTimeout(() => {
            runCrossMatch().catch(e => {
                console.error('[CrossMatch] Auto-run error:', e);
                crossMatchJobState.status = 'idle';
            });
        }, 10000);
    }

    // Schedule every 3 hours
    setInterval(() => {
        console.log('[CrossMatch] Scheduled sync triggered.');
        runCrossMatch().catch(e => {
            console.error('[CrossMatch] Scheduled run error:', e);
            crossMatchJobState.status = 'idle';
        });
    }, THREE_HOURS_MS);
}

// Start scheduler when this module loads
startScheduler();

// ============ API HANDLERS ============

// POST: Manual trigger or recognize a match
export async function POST(req) {
    try {
        const body = await req.json().catch(() => ({}));

        // === RECOGNIZE A MATCH ===
        if (body.action === 'recognize' && body.matchId) {
            const { matchId, nombre, email, telefono } = body;

            if (!nombre || !email) {
                return NextResponse.json({ error: 'Nombre y correo son requeridos' }, { status: 400 });
            }

            db.prepare(`
                UPDATE cross_matches 
                SET status = 'recognized', 
                    recognized_by_name = ?, 
                    recognized_by_email = ?, 
                    recognized_by_phone = ?, 
                    recognized_at = ?
                WHERE id = ?
            `).run(nombre, email, telefono || '', new Date().toISOString(), matchId);

            return NextResponse.json({ success: true, message: 'Marcado como reconocido' });
        }

        // === MANUAL TRIGGER ===
        if (crossMatchJobState.status === 'running') {
            return NextResponse.json({ error: 'Ya hay un cruce en ejecución', progress: crossMatchJobState }, { status: 409 });
        }

        runCrossMatch().catch(e => {
            console.error("[CrossMatch] Manual trigger error:", e);
            crossMatchJobState.status = 'idle';
        });

        return NextResponse.json({ success: true, message: 'Cruce iniciado' });
    } catch (e) {
        console.error("CrossMatch POST error:", e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

// GET: Results and progress
export async function GET(req) {
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get('mode') || 'results';
    const minScore = parseInt(searchParams.get('minScore') || '40');

    try {
        if (mode === 'progress') {
            return NextResponse.json({
                status: crossMatchJobState.status,
                progress: crossMatchJobState.progress,
                total: crossMatchJobState.total,
                matchesFound: crossMatchJobState.matchesFound,
                startedAt: crossMatchJobState.startedAt,
                completedAt: crossMatchJobState.completedAt,
                percentage: crossMatchJobState.total > 0 ? Math.round((crossMatchJobState.progress / crossMatchJobState.total) * 100) : 0
            });
        }

        // Only return PENDING matches (not recognized ones)
        const matches = db.prepare(
            "SELECT * FROM cross_matches WHERE match_score >= ? AND status = 'pending' ORDER BY match_score DESC LIMIT 500"
        ).all(minScore);

        const parsed = matches.map(m => ({
            ...m,
            sources: JSON.parse(m.sources || '[]')
        }));

        const statusRow = db.prepare("SELECT * FROM cross_match_status WHERE id = 1").get();

        // Also count recognized
        const recognizedCount = db.prepare("SELECT COUNT(*) as count FROM cross_matches WHERE status = 'recognized'").get();

        return NextResponse.json({
            matches: parsed,
            totalMatches: parsed.length,
            recognizedCount: recognizedCount?.count || 0,
            status: statusRow || { status: 'idle', progress: 0, total: 0, matches_found: 0 }
        });
    } catch (e) {
        console.error("CrossMatch GET error:", e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
