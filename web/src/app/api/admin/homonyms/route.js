import { NextResponse } from 'next/server';
import db from '@/lib/db.js';

export const dynamic = 'force-dynamic';

export async function GET(request) {
    try {
        const homonimosPac = db.prepare(`SELECT id, 'pacientes' as source_table, nombre, apellido, centro, metadata FROM pacientes WHERE cne_validado = 5`).all();
        const homonimosExt = db.prepare(`SELECT id, 'registros_externos' as source_table, nombre, apellido, centro, metadata FROM registros_externos WHERE cne_validado = 5`).all();
        
        let allHomonimos = [...homonimosPac, ...homonimosExt].map(row => {
            let meta = {};
            try { if (row.metadata) meta = JSON.parse(row.metadata); } catch(e) {}
            return {
                id: row.id,
                table: row.source_table,
                nombre: row.nombre,
                apellido: row.apellido,
                centro: row.centro,
                opciones: meta.cne_homonimos || []
            };
        });
        
        return NextResponse.json({ homonimos: allHomonimos });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const body = await request.json();
        const { id, table, cedula } = body;
        
        if (!id || !table || !cedula) {
            return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 });
        }
        
        if (table !== 'pacientes' && table !== 'registros_externos') {
            return NextResponse.json({ error: 'Tabla inválida' }, { status: 400 });
        }
        
        db.prepare(`UPDATE ${table} SET cedula = ?, cne_validado = 1 WHERE id = ?`).run(cedula, id);
        
        return NextResponse.json({ status: 'ok', message: 'Homónimo resuelto exitosamente.' });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
