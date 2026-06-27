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

const MODEL = "gpt-4o-mini";
const PROMPT = `Vas a actuar como un experto extraedor de datos médicos.
A continuación te proporcionaré texto pre-procesado, una imagen o fotogramas de un video que contienen una lista de pacientes, personas, ingresos médicos u hospitalizados.
Tu objetivo es transcribir estrictamente todos los pacientes a los campos requeridos.

Reglas obligatorias:
1. Extrae únicamente: Nombres, Apellidos, Cédula (solo números, elimina V- o E-. IMPORTANTE: Las cédulas venezolanas pueden llegar hasta los 40 millones y tener 8 dígitos, NO CORTES ni elimines ningún número de la cédula), Centro de Salud / Hospital, Edad y Sector / Zona.
2. Si un dato NO está en la imagen o texto, DEBES rellenar los campos faltantes con un string vacío "". ¡No los dejes nulos ni escribas N/D!

EJEMPLOS DE EXTRACCIÓN (FEW-SHOT TRAINING):
- Input sucio: "Maria perez, ci: V- 12.3O4.567 (nota: usó una letra O mayúscula y puntos), Hosp. central."
- Salida Esperada: {"nombre": "Maria", "apellido": "Perez", "cedula": "12304567", "centro": "Hospital Central", "edad_sector": ""}
- Input sucio: "Juan, CI E- 84.456, 45 Años, Pctare"
- Salida Esperada: {"nombre": "Juan", "apellido": "", "cedula": "84456", "centro": "", "edad_sector": "45 Años - Pctare"}
- Input sucio: "Pedro Gomez, Hospital JM de los Rios, C.I 4.567.890"
- Salida Esperada: {"nombre": "Pedro", "apellido": "Gomez", "cedula": "4567890", "centro": "Hospital JM de los Rios", "edad_sector": ""}`;

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
    let totalNuevos = 0;
    let totalDuplicados = 0;
    let archivosSaltados = 0;

    const existingRecords = db.prepare('SELECT cedula, nombre, apellido FROM pacientes').all();
    const existingCedulas = new Set();
    const existingNombres = new Set();
    
    for (const rec of existingRecords) {
        const nc = normalizeText(rec.cedula);
        if (nc && nc !== "") existingCedulas.add(nc);
        
        const nn = normalizeText(rec.nombre);
        const na = normalizeText(rec.apellido);
        if (nn) existingNombres.add(`${nn}|${na}`);
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

            if (processedFiles[fileHash]) {
                archivosSaltados++;
                continue;
            }

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
                
                // Pre-procesamiento fotográfico avanzado con Sharp para maximizar el OCR
                const enhancedBuffer = await sharp(fileBuffer)
                    .grayscale()         // Elimina ruido de color y sombras amarillentas
                    .normalize()         // Maximiza el contraste (blanco puro, letras negras fuertes)
                    .sharpen({ sigma: 1, m1: 1, m2: 2 }) // Endurece bordes borrosos
                    .toBuffer();

                const base64Image = enhancedBuffer.toString('base64');
                
                // Se envía directamente al modelo con detail: "high" para forzar 
                // una lectura segmentada en máxima resolución y sin pérdida de calidad.
                openAiTasks.push([{
                    type: "image_url",
                    image_url: { url: `data:${mimeType};base64,${base64Image}`, detail: "high" }
                }]);
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
                                                    edad_sector: { type: "string" }
                                                },
                                                required: ["nombre", "apellido", "cedula", "centro", "edad_sector"],
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
                    return [];
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
                for (const paciente of allPacientes) {
                    const { nombre, apellido, cedula, edad_sector } = paciente;
                    let { centro } = paciente;
                    
                    if (centro && centro.trim() !== '') {
                        const match = fuse.search(centro.trim());
                        if (match.length > 0) {
                            centro = match[0].item;
                        }
                    }
                    
                    const safeN = (nombre || "").trim();
                    const safeA = (apellido || "").trim();
                    const safeC = (cedula || "").replace(/\D/g, ''); 
                    const safeCen = (centro || "").trim();
                    const safeE = (edad_sector || "").trim();
                    
                    const hasName = safeN !== "" || safeA !== "";
                    const hasCedula = safeC !== "";
                    const hasExtra = safeCen !== "" || safeE !== "";
                    
                    // QUALITY FILTER:
                    // - Name + Cedula is VALID
                    // - Name + Extra (Centro/Edad) is VALID
                    // - Cedula + Extra is VALID
                    // - ONLY Name is INVALID
                    // - ONLY Cedula is INVALID
                    // - ONLY Extra is INVALID
                    const isValidData = (hasName && hasCedula) || (hasName && hasExtra) || (hasCedula && hasExtra);
                    
                    if (!isValidData) continue;
                    const normN = normalizeText(safeN);
                    const normA = normalizeText(safeA);
                    const normC = safeC ? normalizeText(safeC) : "";

                    let isDuplicate = false;
                    
                    if (normC && normC !== "") {
                        isDuplicate = existingCedulas.has(normC);
                    } else if (normN) {
                        isDuplicate = existingNombres.has(`${normN}|${normA}`);
                    }

                    if (!isDuplicate) {
                        totalNuevos++;
                        
                        // Guardar en el set TEMPORAL en memoria para no duplicarlos dentro del mismo lote
                        if (normC && normC !== "") existingCedulas.add(normC);
                        if (normN) existingNombres.add(`${normN}|${normA}`);
                        
                        pacientesExtraidos.push({
                            nombre: safeN,
                            apellido: safeA,
                            cedula: safeC,
                            centro: safeCen,
                            edad_sector: safeE
                        });
                    } else {
                        totalDuplicados++;
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
        // Pasamos también la cantidad de archivos para el history
        filesUploaded: files.length,
        // Pasamos los file hashes para marcarlos como procesados luego
        fileHashes: Object.keys(processedFiles)
    };
}
