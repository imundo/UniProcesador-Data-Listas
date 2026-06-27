import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse/lib/pdf-parse.js');
import { execSync } from 'child_process';
import OpenAI from 'openai';
import db from './db.js';

const MODEL = "gpt-4o-mini";
const PROMPT = `Vas a actuar como un experto extraedor de datos médicos.
A continuación te proporcionaré texto pre-procesado, una imagen o fotogramas de un video que contienen una lista de pacientes, personas, ingresos médicos u hospitalizados.
Tu objetivo es transcribir estrictamente todos los pacientes a los campos requeridos.

Reglas obligatorias:
1. Extrae únicamente: Nombres, Apellidos, Cédula (solo números, elimina V- o E-. IMPORTANTE: Las cédulas venezolanas pueden llegar hasta los 40 millones y tener 8 dígitos, NO CORTES ni elimines ningún número de la cédula), Centro de Salud / Hospital, Edad y Sector / Zona.
2. Si un dato NO está en la imagen o texto, DEBES rellenar los campos faltantes con un string vacío "". ¡No los dejes nulos ni escribas N/D!`;

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

            if (ext === '.pdf') {
                const data = await pdfParse(buffer);
                const cleanedText = cleanPdfText(data.text);
                const lines = cleanedText.split('\n');
                const chunkSize = 800; // Drastically increased to allow AI to see full columns if pdf-parse reads vertically
                
                for (let i = 0; i < lines.length; i += chunkSize) {
                    const chunk = lines.slice(i, i + chunkSize).join('\n');
                    if (chunk.trim().length > 0) {
                        openAiTasks.push([{
                            type: "text",
                            text: `Contenido PDF:\n\n${chunk}`
                        }]);
                    }
                }
            } else {
                let filesToProcess = [];
                if (ext === '.mp4') {
                    const frameBaseName = `frame_${Date.now()}`;
                    const outputPathPattern = path.join(tempDir, `${frameBaseName}_%d.jpg`);
                    try {
                        const ffmpegCmd = process.platform === 'win32' ? '..\\ffmpeg.exe' : 'ffmpeg';
                        execSync(`${ffmpegCmd} -i "${filePath}" -vf "fps=1" -vframes 3 "${outputPathPattern}" -y`, { stdio: 'pipe' });
                        for (let i = 1; i <= 3; i++) {
                            const framePath = path.join(tempDir, `${frameBaseName}_${i}.jpg`);
                            if (fs.existsSync(framePath)) filesToProcess.push(framePath);
                        }
                    } catch (e) {
                        console.error("Error ffmpeg:", e.message);
                    }
                } else {
                    filesToProcess = [filePath];
                }

                let imageMessages = [];
                for (const frameFile of filesToProcess) {
                    let mimeType = frameFile.endsWith('.png') ? 'image/png' : 'image/jpeg';
                    const base64Image = fs.readFileSync(frameFile).toString('base64');
                    imageMessages.push({
                        type: "image_url",
                        image_url: { url: `data:${mimeType};base64,${base64Image}` }
                    });
                }
                
                if (imageMessages.length > 0) {
                    openAiTasks.push(imageMessages);
                }
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

            // DB Insertion Transaction
            const insertMany = db.transaction((allPacientes) => {
                for (const paciente of allPacientes) {
                    const { nombre, apellido, cedula, centro, edad_sector } = paciente;
                    
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
                        insertPaciente.run(safeN, safeA, safeC, safeCen, safeE, batchId);
                        totalNuevos++;
                        
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

    fs.writeFileSync(processedFilesPath, JSON.stringify(processedFiles, null, 2), 'utf8');

    let history = [];
    if (fs.existsSync(historyFile)) {
        history = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
    }
    history.unshift({
        id: batchId,
        date: new Date().toISOString(),
        filesUploaded: files.length,
        newPatients: totalNuevos,
        duplicatesIgnored: totalDuplicados,
        filesSkippedByHash: archivosSaltados
    });
    fs.writeFileSync(historyFile, JSON.stringify(history, null, 2), 'utf8');

    return { success: true, batchId, totalNuevos, totalDuplicados, archivosSaltados, nuevosPacientes: pacientesExtraidos };
}
