import fs from 'fs';
import path from 'path';
import 'dotenv/config';
import { processFiles } from './web/src/lib/extractor.js';

class FakeFile {
    constructor(buffer, name) {
        this.buffer = buffer;
        this.name = name;
    }
    async arrayBuffer() {
        return this.buffer;
    }
}

async function run() {
    const filesToTest = [
        "1_5040023583598840087 (2).pdf",
        "IMG-20260625-WA0732.jpg",
        "IMG-20260625-WA0763.jpg",
        "IMG-20260625-WA0764.jpg",
        "IMG-20260626-WA0003.jpg",
        "IMG-20260626-WA0004.jpg",
        "IMG-20260626-WA0005.jpg",
        "IMG-20260626-WA0009.jpg",
        "IMG-20260626-WA0473.jpg",
        "IMG-20260626-WA0480.jpg",
        "IMG-20260626-WA0494.jpg",
        "IMG-20260626-WA0496.jpg",
        "Ingresos por sismo en Hospitales consolidado (1).pdf",
        "Ingresos por sismo en Hospitales consolidado 25jun26 2.25pm.pdf",
        "WhatsApp Image 2026-06-26 at 4.08.41 PM.jpeg",
        "WhatsApp Image 2026-06-26 at 4.08.52 PM (1).jpeg",
        "WhatsApp Image 2026-06-26 at 4.08.52 PM.jpeg",
        "WhatsApp Image 2026-06-26 at 4.09.04 PM.jpeg",
        "WhatsApp Image 2026-06-26 at 5.00.15 PM (1).jpeg",
        "WhatsApp Image 2026-06-26 at 5.00.15 PM.jpeg",
        "WhatsApp Image 2026-06-26 at 5.00.16 PM (1).jpeg",
        "WhatsApp Image 2026-06-26 at 5.00.16 PM (2).jpeg",
        "WhatsApp Image 2026-06-26 at 5.00.16 PM (3).jpeg",
        "WhatsApp Image 2026-06-26 at 5.00.16 PM.jpeg",
        "WhatsApp Image 2026-06-26 at 10.16.43 AM (1).jpeg",
        "WhatsApp Image 2026-06-26 at 10.16.43 AM.jpeg",
        "WhatsApp Image 2026-06-26 at 11.16.11 AM (1).jpeg",
        "WhatsApp Image 2026-06-26 at 11.16.11 AM (2).jpeg",
        "WhatsApp Image 2026-06-26 at 11.16.11 AM (3).jpeg",
        "WhatsApp Image 2026-06-26 at 12.03.16 PM (1).jpeg",
        "WhatsApp Image 2026-06-26 at 12.03.16 PM (2).jpeg",
        "WhatsApp Image 2026-06-26 at 12.03.16 PM (3).jpeg",
        "WhatsApp Image 2026-06-26 at 12.03.16 PM.jpeg"
    ];

    const baseDir = "c:\\Users\\imund\\OneDrive\\Documentos\\Proyectos DEV\\unificar\\procesar";
    const fakeFiles = [];

    let found = 0;
    for (const fileName of filesToTest) {
        const filePath = path.join(baseDir, fileName);
        if (fs.existsSync(filePath)) {
            const buffer = fs.readFileSync(filePath);
            fakeFiles.push(new FakeFile(buffer, fileName));
            found++;
        } else {
            console.warn("No encontrado:", fileName);
        }
    }

    console.log(`Iniciando procesamiento de ${found} archivos...`);
    
    // Process in batches of 5 to not overwhelm OpenAI rate limits at once
    const BATCH_SIZE = 5;
    let totalNuevosGlobal = 0;
    let totalDuplicadosGlobal = 0;

    for (let i = 0; i < fakeFiles.length; i += BATCH_SIZE) {
        const currentBatch = fakeFiles.slice(i, i + BATCH_SIZE);
        console.log(`Procesando lote ${i/BATCH_SIZE + 1} de ${Math.ceil(fakeFiles.length / BATCH_SIZE)} (${currentBatch.map(f => f.name).join(', ')})`);
        
        try {
            const result = await processFiles(currentBatch);
            console.log(`✅ Lote completado. Nuevos: ${result.totalNuevos}, Duplicados: ${result.totalDuplicados}`);
            totalNuevosGlobal += result.totalNuevos || 0;
            totalDuplicadosGlobal += result.totalDuplicados || 0;
        } catch (e) {
            console.error("❌ Error en lote:", e);
        }
    }

    console.log("==========================================");
    console.log(`RESUMEN FINAL:`);
    console.log(`Pacientes Nuevos Extraídos: ${totalNuevosGlobal}`);
    console.log(`Pacientes Duplicados Detectados: ${totalDuplicadosGlobal}`);
    console.log("==========================================");
}

run();
