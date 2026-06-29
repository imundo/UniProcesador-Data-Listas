import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse/lib/pdf-parse.js');
const xlsx = require('xlsx');
const mammoth = require('mammoth');
import { execSync } from 'child_process';
import OpenAI from 'openai';
import db from './db.js';
import sharp from 'sharp';
import Fuse from 'fuse.js';

const MODEL = "gpt-4o";
const PROMPT = `Vas a actuar como un experto extraedor de datos médicos.
A continuación te proporcionaré texto pre-procesado, una imagen o fotogramas de un video que contienen una lista de pacientes, personas, ingresos médicos u hospitalizados.
Tu objetivo es transcribir estrictamente todos los pacientes a los campos requeridos.

¡MUY IMPORTANTE! Si el documento es una imagen de una tabla densa (como Excel):
- Realiza un barrido exhaustivo de izquierda a derecha, fila por fila.
- ES CRÍTICO que NO omitas NINGUNA fila. Cada fila que ves es una persona diferente que debe ser extraída obligatoriamente.
- No te detengas hasta llegar al final de la tabla/documento.
- PRECAUCIÓN: Podrías estar viendo un recorte (slice) de la tabla original, por lo que quizás no veas los encabezados de las columnas.
- GUÍA DE COLUMNAS: Por lo general, los textos largos son Nombres y Apellidos. Los números largos (más de 6 dígitos) son Cédulas. Los números cortos (1, 2 o 3 dígitos) son SIEMPRE la Edad. NO mezcles la Cédula con la Edad.

Reglas obligatorias:
1. Extrae únicamente: Nombres, Apellidos, Cédula, Centro de Salud, Edad y Sector.
2. Cédula: Puede aparecer bajo sinónimos como "C.I", "ID", "Identificación". Corrige errores obvios de OCR (ej: O u o por 0, l o I por 1). Mantén el prefijo V- o E-. La cédula debe tener entre 6 y 11 dígitos. SI VES UN NÚMERO LARGO O UN RUT, ES CÉDULA, NUNCA EDAD.
3. Edad: DEBE SER UN NÚMERO ENTRE 1 Y 120. Ignora fechas como 12.12.311 o números exagerados como 900. Extrae solo el número (ej: si dice "17 años", extrae "17").
4. Orden de Nombres y Apellidos: Si la lista invierte el orden (Apellido, Nombre), colócalos correctamente en sus campos.
5. Si un dato NO está en la imagen, DEBES rellenar el campo con un string vacío "". ¡No los dejes nulos ni escribas N/D!

EJEMPLOS DE EXTRACCIÓN:
- Input sucio: "Maria del Carmen perez de lopez, ci: V- 12.3O4.567 (nota: usó una letra O mayúscula y puntos), Hosp. central."
- Salida Esperada: {"nombre": "Maria del Carmen", "apellido": "Perez de Lopez", "cedula": "V-12304567", "centro": "Hospital Central", "edad": "", "sector": ""}
- Input sucio: "Rodriguez Gomez, Juan Carlos, Identificación: E- 84.456, 45 Años, Pctare"
- Salida Esperada: {"nombre": "Juan Carlos", "apellido": "Rodriguez Gomez", "cedula": "E-84456", "centro": "", "edad": "45", "sector": "Pctare"}
- Input sucio: "Gomez Suarez Pedro Luis, Hospital JM de los Rios, ID l4.567.89O, 17 años"
- Salida Esperada: {"nombre": "Pedro Luis", "apellido": "Gomez Suarez", "cedula": "14567890", "centro": "Hospital JM de los Rios", "edad": "17", "sector": ""}
- Input sucio: "Jose Fernandez, Doc 1543O686, Caracas, 12.12.311 edad 41 años"
- Salida Esperada: {"nombre": "Jose", "apellido": "Fernandez", "cedula": "15430686", "centro": "Caracas", "edad": "41", "sector": ""}`;

function normalizeText(text) {
    if (!text || text === "N/D" || text === "") return "";
    return text.toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, ' ');
}

function cleanPdfText(text) {
    return text
        .replace(/\n+/g, '\n') // Remove multiple newlines
        .replace(/\s{2,}/g, ' ') // Remove multiple spaces
        .trim();
}

// Helper for concurrent batch processing
async function processInBatches(items, batchSize, processItem) {
    let results = [];
    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const batchResults = await Promise.all(batch.map(processItem));
        results.push(...batchResults);
    }
    return results;
}

export async function processFiles(files) {
    const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
    });

    const tempDir = path.join(process.cwd(), 'temp_processing');
    const dataDir = path.join(process.cwd(), 'data');
    const processedFilesPath = path.join(dataDir, 'procesados.json');
    const historyFile = path.join(dataDir, 'history.json');

    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

    let processedFiles = {};
    if (fs.existsSync(processedFilesPath)) {
        processedFiles = JSON.parse(fs.readFileSync(processedFilesPath, 'utf8'));
    }

    let pacientesExtraidos = [];
    let pacientesDuplicados = [];
    let totalNuevos = 0;
    let totalDuplicados = 0;
    let archivosSaltados = 0;

    const existingRecords = db.prepare('SELECT cedula, nombre, apellido, centro FROM pacientes').all();
    const existingCedulas = new Map();
    const existingNombresYCentros = new Map();
    
    for (const rec of existingRecords) {
        const nc = normalizeText(rec.cedula);
        if (nc && nc !== "") existingCedulas.set(nc, rec);
        
        const nn = normalizeText(rec.nombre);
        const na = normalizeText(rec.apellido);
        const ncen = normalizeText(rec.centro);
        if (nn) existingNombresYCentros.set(`${nn}|${na}|${ncen}`, rec);
    }

    const insertPaciente = db.prepare('INSERT INTO pacientes (nombre, apellido, cedula, centro, edad_sector, batch_id) VALUES (?, ?, ?, ?, ?, ?)');
    const batchId = Date.now().toString();

    for (const file of files) {
        try {
            const buffer = Buffer.from(await file.arrayBuffer());
            const ext = path.extname(file.name).toLowerCase();
            const filePath = path.join(tempDir, `${Date.now()}_${file.name}`);
            fs.writeFileSync(filePath, buffer);

            const hashSum = crypto.createHash('md5');
            hashSum.update(buffer);
            const fileHash = hashSum.digest('hex');

            // Removido filtro de performance temporalmente a petición del usuario
            // para permitir procesar el mismo archivo múltiples veces y revisar duplicados visuales.
            // if (processedFiles[fileHash]) {
            //     archivosSaltados++;
            //     continue;
            // }

            let openAiTasks = []; 

            let extractedText = null;

            if (ext === '.pdf') {
                const data = await pdfParse(buffer);
                extractedText = cleanPdfText(data.text);
            } else if (['.xlsx', '.xls', '.csv'].includes(ext)) {
                const workbook = xlsx.read(buffer, { type: 'buffer' });
                extractedText = "";
                for (const sheetName of workbook.SheetNames) {
                    const sheet = workbook.Sheets[sheetName];
                    extractedText += xlsx.utils.sheet_to_csv(sheet) + "\n";
                }
            } else if (['.docx', '.doc'].includes(ext)) {
                const result = await mammoth.extractRawText({ buffer });
                extractedText = result.value;
            }

            if (extractedText !== null) {
                // Filtro Local de Texto: Requerir que haya números o palabras clave. Si no, se descarta.
                const hasNumbers = /\d{2,}/.test(extractedText);
                const hasKeywords = /\b(cedula|paciente|nombre|edad|sector|centro|hospital|clinica|ambulatorio)\b/i.test(extractedText);
                
                if (!hasNumbers && !hasKeywords) {
                    console.log(`Archivo de texto descartado por el pre-filtro (Sin formato médico): ${file.name}`);
                    archivosSaltados++;
                    continue;
                }

                const lines = extractedText.split('\n');
                const chunkSize = 800;
                
                for (let i = 0; i < lines.length; i += chunkSize) {
                    const chunk = lines.slice(i, i + chunkSize).join('\n');
                    if (chunk.trim().length > 0) {
                        openAiTasks.push([{
                            type: "text",
                            text: `Contenido del documento:\n\n${chunk}`
                        }]);
                    }
                }
            } else if (['.jpg', '.jpeg', '.png'].includes(ext)) {
                let mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';
                const fileBuffer = fs.readFileSync(filePath);
                
                try {
                    const metadata = await sharp(fileBuffer).metadata();
                    
                    // Slicing para Tablas densas: Obligatorio incluso para gpt-4o para evitar 
                    // que el modelo reduzca la resolución y omita filas.
                    if (metadata.height && metadata.width && metadata.height > 800 && (metadata.height / metadata.width) > 1.2) {
                        const slices = Math.max(3, Math.ceil(metadata.height / 350)); 
                        console.log(`[Smart Slicing] Imagen alta detectada (${metadata.width}x${metadata.height}). Cortando en ${slices} pedazos para gpt-4o...`);
                        
                        const sliceHeight = Math.ceil(metadata.height / slices);
                        const overlap = 60; // Solapamiento para no cortar texto
                        
                        for (let j = 0; j < slices; j++) {
                            let top = j * sliceHeight - (j > 0 ? overlap : 0);
                            if (top < 0) top = 0;
                            let height = sliceHeight + (j > 0 ? overlap : 0) + (j < slices - 1 ? overlap : 0);
                            if (top + height > metadata.height) {
                                height = metadata.height - top;
                            }
                            
                            const sliceBuffer = await sharp(fileBuffer)
                                .extract({ left: 0, top: Math.floor(top), width: metadata.width, height: Math.floor(height) })
                                .toBuffer();
                                
                            const base64Slice = sliceBuffer.toString('base64');
                            openAiTasks.push([{
                                type: "image_url",
                                image_url: { url: `data:${mimeType};base64,${base64Slice}`, detail: "high" }
                            }]);
                        }
                    } else {
                        const base64Image = fileBuffer.toString('base64');
                        openAiTasks.push([{
                            type: "image_url",
                            image_url: { url: `data:${mimeType};base64,${base64Image}`, detail: "high" }
                        }]);
                    }
                } catch (sharpError) {
                    console.error("Error al procesar imagen con sharp:", sharpError);
                    const base64Image = fileBuffer.toString('base64');
                    openAiTasks.push([{
                        type: "image_url",
                        image_url: { url: `data:${mimeType};base64,${base64Image}`, detail: "high" }
                    }]);
                }
            } else {
                console.log(`Extensión no soportada ignorada: ${ext}`);
                archivosSaltados++;
                continue;
            }

            // Concurrent API Processing (Batches of 5)
            const processChunk = async (taskMessages) => {
                const finalMessages = [{ role: "system", content: PROMPT }, { role: "user", content: taskMessages }];
                try {
                    const response = await openai.chat.completions.create({
                        model: MODEL,
                        messages: finalMessages,
                        response_format: {
                            type: "json_schema",
                            json_schema: {
                                name: "extremos_medicos",
                                strict: true,
                                schema: {
                                    type: "object",
                                    properties: {
                                        pacientes: {
                                            type: "array",
                                            items: {
                                                type: "object",
                                                properties: {
                                                    nombre: { type: "string" },
                                                    apellido: { type: "string" },
                                                    cedula: { type: "string" },
                                                    centro: { type: "string" },
                                                    edad: { type: "string" },
                                                    sector: { type: "string" }
                                                },
                                                required: ["nombre", "apellido", "cedula", "centro", "edad", "sector"],
                                                additionalProperties: false
                                            }
                                        }
                                    },
                                    required: ["pacientes"],
                                    additionalProperties: false
                                }
                            }
                        },
                        max_tokens: 16000,
                    });

                    let parsedResult = JSON.parse(response.choices[0].message.content);
                    return parsedResult.pacientes || [];
                } catch(e) {
                    console.error("Error processing chunk with OpenAI:", e);
                    throw e; // Lanza el error para que falle el lote completo y se muestre en el frontend
                }
            };

            const allExtractedBatches = await processInBatches(openAiTasks, 10, processChunk);

            // Fetch Official Centers for Fuzzy Matching
            let officialCenters = [];
            try {
                const rows = db.prepare("SELECT DISTINCT centro FROM pacientes WHERE centro IS NOT NULL AND centro != ''").all();
                officialCenters = rows.map(r => r.centro);
            } catch (e) {
                console.error("Error loading official centers for Fuse", e);
            }

            const fuse = new Fuse(officialCenters, {
                includeScore: true,
                threshold: 0.3 // Requires 70%+ similarity
            });

            // DB Insertion Transaction (Actually just formatting and caching now)
            const insertMany = db.transaction((allPacientes) => {
                // Intra-batch Deduplication & Merging to remove overlap artifacts
                let uniquePacientes = [];
                for (let p of allPacientes) {
                    let n = normalizeText(p.nombre);
                    let a = normalizeText(p.apellido);
                    let c = normalizeText(p.cedula);
                    
                    if (!n && !a && !c) continue; // Skip completely empty rows
                    
                    let existingIdx = uniquePacientes.findIndex(ep => {
                        let en = normalizeText(ep.nombre);
                        let ea = normalizeText(ep.apellido);
                        let ec = normalizeText(ep.cedula);
                        
                        // Si tienen la misma cédula (y no está vacía), es la misma persona
                        if (c && ec && c === ec) return true;
                        // Si tienen el mismo nombre y apellido (fuzziness básico), es la misma persona
                        if (n && a && en && ea && n === en && a === ea) return true;
                        return false;
                    });

                    if (existingIdx >= 0) {
                        // Merge: conservar los campos que estén vacíos en el registro existente
                        let ep = uniquePacientes[existingIdx];
                        if (!ep.cedula && p.cedula) ep.cedula = p.cedula;
                        if (!ep.edad && p.edad) ep.edad = p.edad;
                        if (!ep.centro && p.centro) ep.centro = p.centro;
                        if (!ep.sector && p.sector) ep.sector = p.sector;
                        if (!ep.nombre && p.nombre) ep.nombre = p.nombre;
                        if (!ep.apellido && p.apellido) ep.apellido = p.apellido;
                    } else {
                        uniquePacientes.push(p);
                    }
                }
                allPacientes = uniquePacientes;

                for (const paciente of allPacientes) {
                    const { nombre, apellido, cedula, edad, sector } = paciente;
                    let { centro } = paciente;
                    
                    if (centro && centro.trim() !== '') {
                        const match = fuse.search(centro.trim());
                        if (match.length > 0) {
                            centro = match[0].item;
                        }
                    }
                    
                    // Post-Validación Heurística:
                    // 1. Nombres y Apellidos NO deben contener números (limpiarlos automáticamente)
                    const safeN = (nombre || "").replace(/[0-9]/g, '').trim();
                    const safeA = (apellido || "").replace(/[0-9]/g, '').trim();
                    
                    // 2. Cédula: Solo números, pero validar su longitud (flexibilizado para no borrar pasaportes o números con ruido)
                    let safeC = (cedula || "").replace(/\D/g, ''); 
                    if (safeC && (safeC.length < 5 || safeC.length > 11)) {
                        safeC = ""; // Si no tiene sentido como cédula (ej. teléfono o basura OCR extrema), se descarta
                    }

                    const safeCen = (centro || "").trim();
                    const safeE = (edad || "").trim();
                    const safeS = (sector || "").trim();
                    const combinedEdadSector = `${safeE} ${safeS !== '' ? '- ' + safeS : ''}`.trim().replace(/-$/, '').trim();
                    
                    const hasName = safeN !== "" || safeA !== "";
                    const hasCedula = safeC !== "";
                    const hasExtra = safeCen !== "" || combinedEdadSector !== "";
                    
                    // QUALITY FILTER:
                    // - Name + Cedula is VALID
                    // - Name + Extra (Centro/Edad) is VALID
                    // - Cedula + Extra is VALID
                    // - ONLY Name is INVALID
                    // - ONLY Cedula is INVALID
                    // - ONLY Extra is INVALID
                    const isValidData = (hasName && hasCedula) || (hasName && hasExtra) || (hasCedula && hasExtra);
                    const isPartialData = hasName || hasCedula; // Al menos debe tener un nombre o una cedula para ser guardado
                    
                    if (!isPartialData) continue;
                    const estatus = isValidData ? 'Válido' : 'Incompleto';
                    
                    const normN = normalizeText(safeN);
                    const normA = normalizeText(safeA);
                    const normC = safeC ? normalizeText(safeC) : "";

                    const normCen = safeCen ? normalizeText(safeCen) : "";

                    let isDuplicate = false;
                    let existingMatch = null;
                    
                    if (normC && normC !== "") {
                        if (existingCedulas.has(normC)) {
                            isDuplicate = true;
                            existingMatch = existingCedulas.get(normC);
                        }
                    } else if (normN) {
                        const key = `${normN}|${normA}|${normCen}`;
                        if (existingNombresYCentros.has(key)) {
                            isDuplicate = true;
                            existingMatch = existingNombresYCentros.get(key);
                        }
                    }

                    const nuevoPaciente = {
                        nombre: safeN,
                        apellido: safeA,
                        cedula: safeC,
                        centro: safeCen,
                        edad: safeE,
                        sector: safeS,
                        edad_sector: combinedEdadSector, // Mantenemos por compatibilidad DB
                        estatus: estatus
                    };

                    if (!isDuplicate) {
                        totalNuevos++;
                        
                        // Guardar en el set TEMPORAL en memoria para no duplicarlos dentro del mismo lote
                        if (normC && normC !== "") existingCedulas.set(normC, nuevoPaciente);
                        if (normN) existingNombresYCentros.set(`${normN}|${normA}|${normCen}`, nuevoPaciente);
                        
                        pacientesExtraidos.push(nuevoPaciente);
                    } else {
                        // Auto-Merge check: Does the new record just fill empty fields without conflicting?
                        const existingCen = normalizeText(existingMatch.centro || "");
                        const newCen = normCen;
                        const isConflictCentro = newCen && existingCen && newCen !== existingCen;
                        
                        const existingE = existingMatch.edad_sector || "";
                        const newE = combinedEdadSector;
                        const isConflictEdadSector = newE && existingE && newE !== existingE;
                        
                        // Validar si solo está agregando información útil
                        const hasNewCentro = newCen && !existingCen;
                        const hasNewEdad = newE && !existingE;
                        const hasNewCedula = normC && !existingMatch.cedula; // Poco probable por la llave primaria, pero posible por nombre

                        if (!isConflictCentro && !isConflictEdadSector && (hasNewCentro || hasNewEdad || hasNewCedula)) {
                            // Es un "Smart Merge"
                            nuevoPaciente.isMerged = true;
                            nuevoPaciente.mergeId = existingMatch.id;
                            
                            // Fusionar datos
                            if (!nuevoPaciente.cedula && existingMatch.cedula) nuevoPaciente.cedula = existingMatch.cedula;
                            if (!nuevoPaciente.centro && existingMatch.centro) nuevoPaciente.centro = existingMatch.centro;
                            if (!nuevoPaciente.edad_sector && existingMatch.edad_sector) nuevoPaciente.edad_sector = existingMatch.edad_sector;
                            
                            totalNuevos++; // Lo contamos como registro actualizado/nuevo en la UI
                            pacientesExtraidos.push(nuevoPaciente);
                        } else {
                            totalDuplicados++;
                            pacientesDuplicados.push({
                                nuevo: nuevoPaciente,
                                existente: existingMatch
                            });
                        }
                    }
                }
            });

            // Flatten all patients extracted from all chunks and insert
            const flattenedPacientes = allExtractedBatches.flat();
            if (flattenedPacientes.length > 0) {
                insertMany(flattenedPacientes);
            }
            processedFiles[fileHash] = true;
        } catch (error) {
            console.error(`Error procesando archivo ${file.name}:`, error);
            throw error; // Propagar error crítico hacia la ruta de la API
        }
    }

    // No guardamos history.json ni procesados.json aquí. Lo haremos en uploadToPortal.
    return { 
        success: true, 
        batchId, 
        totalNuevos, 
        totalDuplicados, 
        archivosSaltados, 
        nuevosPacientes: pacientesExtraidos,
        pacientesDuplicados: pacientesDuplicados,
        // Pasamos también la cantidad de archivos para el history
        filesUploaded: files.length,
        // Pasamos los file hashes para marcarlos como procesados luego
        fileHashes: Object.keys(processedFiles)
    };
}

import { performSearch } from '../app/api/search/route.js';

let workerStarted = false;
const CHUNK_SIZE = 3; // Nombres a procesar por ciclo
const INTERVAL_MS = 2 * 60 * 1000; // 2 minutos

async function processNextChunk() {
    try {
        // Buscar 3 terminos pendientes
        const pendingTerms = db.prepare(`
            SELECT id, term FROM extraction_queue 
            WHERE status = 'pending' 
            ORDER BY created_at ASC 
            LIMIT ?
        `).all(CHUNK_SIZE);

        if (pendingTerms.length === 0) {
            return; // Nada que hacer, dormirse.
        }

        console.log(`[Extractor Worker] Procesando lote de ${pendingTerms.length} términos...`);

        // Marcar como procesando
        const updateProcessing = db.prepare("UPDATE extraction_queue SET status = 'processing', last_attempt = CURRENT_TIMESTAMP WHERE id = ?");
        for (const pt of pendingTerms) {
            updateProcessing.run(pt.id);
        }

        // Procesar uno por uno con una pequeña pausa para no saturar las APIs (ni la propia db local)
        for (const pt of pendingTerms) {
            try {
                console.log(`[Extractor Worker] Buscando: ${pt.term}`);
                
                // performSearch realiza búsquedas en vivo y guarda automáticamente en registros_externos vía Passive Scraping
                await performSearch(pt.term);

                // Marcar completado
                db.prepare("UPDATE extraction_queue SET status = 'completed' WHERE id = ?").run(pt.id);
                
                // Pausa artificial de 2 segundos entre términos
                await new Promise(r => setTimeout(r, 2000));
            } catch (err) {
                console.error(`[Extractor Worker] Error con término ${pt.term}:`, err.message);
                db.prepare("UPDATE extraction_queue SET status = 'error' WHERE id = ?").run(pt.id);
            }
        }
        console.log(`[Extractor Worker] Lote procesado con éxito.`);
    } catch (e) {
        console.error("[Extractor Worker] Error crítico en el ciclo:", e);
    }
}

export function startExtractorWorker() {
    if (workerStarted) return;
    workerStarted = true;

    console.log(`[Extractor Worker] Inicializado. Correrá cada ${INTERVAL_MS / 1000 / 60} minutos.`);
    
    // Ejecutar inmediatamente (con un pequeño delay para que levante el server)
    setTimeout(() => {
        processNextChunk();
    }, 5000);

    // Configurar ciclo continuo
    setInterval(() => {
        processNextChunk();
    }, INTERVAL_MS);
}
