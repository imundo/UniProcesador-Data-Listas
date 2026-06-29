import { NextResponse } from 'next/server';
import db from '@/lib/db.js';

export const dynamic = 'force-dynamic';

export async function GET(req) {
    try {
        const validadosPac = db.prepare("SELECT id, nombre, apellido, cedula, cne_validado, 'pacientes' as source FROM pacientes WHERE cne_validado IN (1, 2) ORDER BY id DESC LIMIT 50").all();
        const validadosExt = db.prepare("SELECT id, nombre, apellido, cedula, cne_validado, 'registros_externos' as source FROM registros_externos WHERE cne_validado IN (1, 2) ORDER BY id DESC LIMIT 50").all();
        
        const rechazadosPac = db.prepare("SELECT id, nombre, apellido, cedula, cne_validado, 'pacientes' as source FROM pacientes WHERE cne_validado = 3 ORDER BY id DESC LIMIT 50").all();
        const rechazadosExt = db.prepare("SELECT id, nombre, apellido, cedula, cne_validado, 'registros_externos' as source FROM registros_externos WHERE cne_validado = 3 ORDER BY id DESC LIMIT 50").all();

        return NextResponse.json({
            status: 'ok',
            validados: [...validadosPac, ...validadosExt],
            rechazados: [...rechazadosPac, ...rechazadosExt]
        });
    } catch (error) {
        console.error("CNE Details API Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
