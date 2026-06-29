import { NextResponse } from 'next/server';
import db from '@/lib/db.js';

export const dynamic = 'force-dynamic';

export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url);
        const page = parseInt(searchParams.get('page') || '1');
        const limit = 50;
        const offset = (page - 1) * limit;

        // Get total counts
        const totalValidadosPac = db.prepare("SELECT COUNT(*) as c FROM pacientes WHERE cne_validado IN (1, 2)").get().c;
        const totalValidadosExt = db.prepare("SELECT COUNT(*) as c FROM registros_externos WHERE cne_validado IN (1, 2)").get().c;
        
        const totalRechazadosPac = db.prepare("SELECT COUNT(*) as c FROM pacientes WHERE cne_validado = 3").get().c;
        const totalRechazadosExt = db.prepare("SELECT COUNT(*) as c FROM registros_externos WHERE cne_validado = 3").get().c;

        const validadosPac = db.prepare(`SELECT id, nombre, apellido, cedula, cne_validado, 'pacientes' as source FROM pacientes WHERE cne_validado IN (1, 2) ORDER BY id DESC LIMIT ${limit} OFFSET ${offset}`).all();
        const validadosExt = db.prepare(`SELECT id, nombre, apellido, cedula, cne_validado, 'registros_externos' as source FROM registros_externos WHERE cne_validado IN (1, 2) ORDER BY id DESC LIMIT ${limit} OFFSET ${offset}`).all();
        
        const rechazadosPac = db.prepare(`SELECT id, nombre, apellido, cedula, cne_validado, 'pacientes' as source FROM pacientes WHERE cne_validado = 3 ORDER BY id DESC LIMIT ${limit} OFFSET ${offset}`).all();
        const rechazadosExt = db.prepare(`SELECT id, nombre, apellido, cedula, cne_validado, 'registros_externos' as source FROM registros_externos WHERE cne_validado = 3 ORDER BY id DESC LIMIT ${limit} OFFSET ${offset}`).all();

        return NextResponse.json({
            status: 'ok',
            validados: [...validadosPac, ...validadosExt],
            rechazados: [...rechazadosPac, ...rechazadosExt],
            pagination: {
                page,
                limit,
                totalValidados: totalValidadosPac + totalValidadosExt,
                totalRechazados: totalRechazadosPac + totalRechazadosExt
            }
        });
    } catch (error) {
        console.error("CNE Details API Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
