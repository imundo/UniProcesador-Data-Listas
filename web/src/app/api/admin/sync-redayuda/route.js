import { syncRedAyuda } from '@/lib/redAyudaSync';
import { runCrossMatch } from '@/app/api/crossmatch/route';

export const dynamic = 'force-dynamic';

export async function POST(req) {
    return handleSync();
}

export async function GET(req) {
    return handleSync();
}

async function handleSync() {
    try {
        // 1. Ejecutar el scraper de RedAyuda (que extrae data de /api/data)
        const syncResult = await syncRedAyuda();

        if (!syncResult.success) {
            return Response.json({ success: false, error: syncResult.error }, { status: 500 });
        }

        // 2. Ejecutar el motor de Cross-Match para buscar si hay match entre la BD local y lo extraído
        // Esto automáticamente alimentará la tabla `cross_matches`
        console.log("[Sync API] Ejecutando Cross-Match...");
        const matchResult = await runCrossMatch();

        return Response.json({ 
            success: true, 
            message: "Sincronización completada exitosamente.",
            sync: syncResult,
            match: matchResult
        });
        
    } catch (err) {
        return Response.json({ success: false, error: err.message }, { status: 500 });
    }
}
