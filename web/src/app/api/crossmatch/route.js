import { NextResponse } from 'next/server';
import db from '@/lib/db.js';
import { performSearch } from '@/app/api/search/route.js';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes max for serverless

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
    // If it's just a number at the start
    const numMatch = edadSector.match(/^(\d{1,3})\b/);
    if (numMatch && parseInt(numMatch[1]) < 130) return parseInt(numMatch[1]);
    return null;
}

function getNameTokens(nombre, apellido) {
    const full = normalizeText(`${nombre || ''} ${apellido || ''}`);
    return full.split(/\s+/).filter(t => t.length > 1);
}

/**
 * Calculate match score between a local patient and an external result.
 * Returns 0-100.
 */
function calculateMatchScore(local, external) {
    let score = 0;

    // === NAME MATCH (20%) ===
    const localTokens = getNameTokens(local.nombre, local.apellido);
    const extTokens = getNameTokens(external.nombre, external.apellido);
    
    if (localTokens.length > 0 && extTokens.length > 0) {
        const matchedTokens = localTokens.filter(t => extTokens.some(et => et === t || (t.length > 3 && et.startsWith(t)) || (et.length > 3 && t.startsWith(et))));
        const nameRatio = matchedTokens.length / Math.max(localTokens.length, extTokens.length);
        if (nameRatio >= 0.5) {
            score += 20 * nameRatio;
        }
    }

    // === APELLIDO MATCH (20%) ===
    const localApellido = normalizeText(local.apellido || '');
    const extApellido = normalizeText(external.apellido || '');
    if (localApellido && extApellido) {
        if (localApellido === extApellido) {
            score += 20;
        } else {
            // Partial: first 3 chars match
            if (localApellido.length >= 3 && extApellido.length >= 3 && localApellido.substring(0, 3) === extApellido.substring(0, 3)) {
                score += 12;
            }
        }
    }

    // === CEDULA MATCH (20%) ===
    const localCedula = cleanCedula(local.cedula);
    const extCedula = cleanCedula(external.cedula);
    if (localCedula && extCedula && localCedula.length >= 5 && extCedula.length >= 5) {
        if (localCedula === extCedula) {
            score += 20;
        }
    }

    // === EDAD MATCH (20%) ===
    const localAge = extractAge(local.edad_sector);
    const extAge = extractAge(external.edad_sector || external.edad_externo);
    if (localAge && extAge) {
        if (localAge === extAge) {
            score += 20;
        } else if (Math.abs(localAge - extAge) <= 2) {
            score += 12; // Close enough (OCR errors)
        }
    }

    // === CENTRO/UBICACIÓN MATCH (20%) ===
    const localCentro = normalizeText(local.centro || '');
    const extCentro = normalizeText(external.centro || '');
    if (localCentro && extCentro && localCentro.length > 2 && extCentro.length > 2) {
        const localCTokens = localCentro.split(/\s+/).filter(t => t.length > 2);
        const extCTokens = extCentro.split(/\s+/).filter(t => t.length > 2);
        const commonTokens = localCTokens.filter(t => extCTokens.includes(t));
        if (commonTokens.length > 0) {
            score += 20 * (commonTokens.length / Math.max(localCTokens.length, extCTokens.length));
        }
    }

    return Math.round(score);
}

// In-memory state for the background job progress
let crossMatchJobState = {
    status: 'idle', // 'idle', 'running', 'completed'
    progress: 0,
    total: 0,
    matchesFound: 0,
    startedAt: null,
    completedAt: null,
    abortRequested: false
};

async function runCrossMatch() {
    // Get all valid patients
    const pacientes = db.prepare("SELECT * FROM pacientes WHERE estatus = 'Válido' OR estatus IS NULL").all();
    
    crossMatchJobState = {
        status: 'running',
        progress: 0,
        total: pacientes.length,
        matchesFound: 0,
        startedAt: new Date().toISOString(),
        completedAt: null,
        abortRequested: false
    };

    // Initialize status in DB
    try {
        db.prepare("DELETE FROM cross_match_status").run();
        db.prepare("INSERT INTO cross_match_status (id, status, progress, total, matches_found, started_at) VALUES (1, 'running', 0, ?, 0, ?)").run(pacientes.length, crossMatchJobState.startedAt);
    } catch(e) { /* first run */ }

    // Clear previous results
    db.prepare("DELETE FROM cross_matches").run();

    const insertMatch = db.prepare(`
        INSERT INTO cross_matches (paciente_id, nombre_local, apellido_local, cedula_local, nombre_externo, apellido_externo, cedula_externo, centro_externo, edad_externo, estado_externo, match_score, sources)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const BATCH_SIZE = 5;
    const DELAY_BETWEEN_BATCHES_MS = 1500;
    let totalMatchesFound = 0;

    for (let i = 0; i < pacientes.length; i += BATCH_SIZE) {
        if (crossMatchJobState.abortRequested) break;

        const batch = pacientes.slice(i, i + BATCH_SIZE);

        // Process batch in parallel
        const batchPromises = batch.map(async (paciente) => {
            try {
                // Build search query: use cedula if available, otherwise name
                const searchQuery = (paciente.cedula && paciente.cedula.trim().length >= 5) 
                    ? paciente.cedula.trim() 
                    : `${paciente.nombre || ''} ${paciente.apellido || ''}`.trim();

                if (!searchQuery || searchQuery.length < 3) return [];

                const results = await performSearch(searchQuery);
                
                // Filter out local DB results (source: 'Base de Datos Local') since that's ourselves
                const externalResults = results.filter(r => {
                    const sources = r.sources || [{name: r.source}];
                    return !sources.every(s => s.name === 'Base de Datos Local');
                });

                const matches = [];
                for (const ext of externalResults) {
                    const score = calculateMatchScore(paciente, ext);
                    if (score >= 40) {
                        const sources = ext.sources || [{name: ext.source, url: ext.sourceUrl}];
                        matches.push({
                            paciente,
                            external: ext,
                            score,
                            sources: sources.filter(s => s.name !== 'Base de Datos Local')
                        });
                    }
                }
                return matches;
            } catch (e) {
                console.error(`Error cross-matching paciente ${paciente.id}:`, e.message);
                return [];
            }
        });

        const batchResults = await Promise.all(batchPromises);

        // Persist results
        const flatResults = batchResults.flat();
        if (flatResults.length > 0) {
            db.transaction((results) => {
                for (const m of results) {
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
                        JSON.stringify(m.sources.map(s => s.name))
                    );
                }
            })(flatResults);
            totalMatchesFound += flatResults.length;
        }

        // Update progress
        crossMatchJobState.progress = Math.min(i + BATCH_SIZE, pacientes.length);
        crossMatchJobState.matchesFound = totalMatchesFound;

        // Update DB status periodically (every 5 batches)
        if ((i / BATCH_SIZE) % 5 === 0 || i + BATCH_SIZE >= pacientes.length) {
            db.prepare("UPDATE cross_match_status SET progress = ?, matches_found = ? WHERE id = 1")
                .run(crossMatchJobState.progress, totalMatchesFound);
        }

        // Delay between batches to avoid rate limiting
        if (i + BATCH_SIZE < pacientes.length) {
            await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES_MS));
        }
    }

    // Mark as completed
    crossMatchJobState.status = 'completed';
    crossMatchJobState.completedAt = new Date().toISOString();
    
    db.prepare("UPDATE cross_match_status SET status = 'completed', progress = ?, matches_found = ?, completed_at = ? WHERE id = 1")
        .run(crossMatchJobState.progress, totalMatchesFound, crossMatchJobState.completedAt);
}

// POST: Start cross-match job
export async function POST(req) {
    try {
        const body = await req.json().catch(() => ({}));

        if (body.action === 'abort') {
            crossMatchJobState.abortRequested = true;
            return NextResponse.json({ success: true, message: 'Abort requested' });
        }

        if (crossMatchJobState.status === 'running') {
            return NextResponse.json({ error: 'Cross-match already running', progress: crossMatchJobState }, { status: 409 });
        }

        // Fire and forget - start the job in the background
        runCrossMatch().catch(e => {
            console.error("Cross-match fatal error:", e);
            crossMatchJobState.status = 'completed';
            crossMatchJobState.completedAt = new Date().toISOString();
            try {
                db.prepare("UPDATE cross_match_status SET status = 'error', completed_at = ? WHERE id = 1").run(crossMatchJobState.completedAt);
            } catch(dbErr) { /* ignore */ }
        });

        return NextResponse.json({ success: true, message: 'Cross-match started', total: crossMatchJobState.total });
    } catch (e) {
        console.error("CrossMatch POST error:", e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

// GET: Get cross-match results and progress
export async function GET(req) {
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get('mode') || 'results'; // 'results' | 'progress'
    const minScore = parseInt(searchParams.get('minScore') || '40');

    try {
        if (mode === 'progress') {
            // Return in-memory state (more up-to-date than DB)
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

        // Return results
        const matches = db.prepare(
            "SELECT * FROM cross_matches WHERE match_score >= ? ORDER BY match_score DESC LIMIT 500"
        ).all(minScore);

        // Parse sources JSON
        const parsed = matches.map(m => ({
            ...m,
            sources: JSON.parse(m.sources || '[]')
        }));

        // Also get status
        const statusRow = db.prepare("SELECT * FROM cross_match_status WHERE id = 1").get();

        return NextResponse.json({
            matches: parsed,
            totalMatches: parsed.length,
            status: statusRow || { status: 'idle', progress: 0, total: 0, matches_found: 0 }
        });
    } catch (e) {
        console.error("CrossMatch GET error:", e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
