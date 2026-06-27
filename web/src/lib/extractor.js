import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
const pdfParse = require('pdf-parse/lib/pdf-parse.js');
import { execSync } from 'child_process';
import OpenAI from 'openai';
import db from './db.js';

const MODEL = "gpt-4o-mini";
const PROMPT = `Vas a actuar como un experto extraedor de datos médicos.
A continuación te proporcionaré texto, una imagen o fotogramas de un video que contienen una lista de pacientes, personas, ingresos médicos u hospitalizados.
Tu objetivo es transcribir estrictamente todos los pacientes a un formato JSON.

Reglas obligatorias:
1. Extrae únicamente: Nombres, Apellidos, Cédula (solo números, elimina V- o E-), Centro de Salud / Hospital, Edad y Sector / Zona.
2. Si un dato NO está en la imagen o texto (por ejemplo, si la foto SOLO tiene Nombre y Edad), DEBES rellenar los campos faltantes con el valor de referencia "N/D". ¡No los dejes vacíos!
3. El formato de salida debe ser exclusivamente JSON válido.
4. El JSON debe tener esta estructura exacta:
{
  "pacientes": [
    {
      "nombre": "Nombre",
      "apellido": "Apellido",
      "cedula": "12345678",
      "centro": "Hospital X",
      "edad_sector": "45 - Norte"
    }
  ]
}
5. NO incluyas ninguna explicación, texto adicional, ni formato Markdown fuera del JSON.`;

function normalizeText(text) {
    if (!text || text === "N/D") return "";
    return text.toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, ' ');
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

    // Load existing patients for accurate normalized deduplication in memory
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
    
    const batchId = Date.now().toString(); // Use timestamp as batch_id

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

            let openAiTasks = []; // Array of message arrays

            if (ext === '.pdf') {
                const data = await pdfParse(buffer);
                const lines = data.text.split('\n');
                const chunkSize = 50; // Process 50 lines at a time to prevent exceeding output token limit
                
                for (let i = 0; i < lines.length; i += chunkSize) {
                    const chunk = lines.slice(i, i + chunkSize).join('\n');
                    if (chunk.trim().length > 0) {
                        openAiTasks.push([{
                            type: "text",
                            text: `Aquí tienes una parte del contenido del PDF:\n\n${chunk}`
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

            // Process all tasks for this file
            for (const taskMessages of openAiTasks) {
                const finalMessages = [{ type: "text", text: PROMPT }, ...taskMessages];
                
                try {
                    const response = await openai.chat.completions.create({
                        model: MODEL,
                        messages: [{ role: "user", content: finalMessages }],
                        response_format: { type: "json_object" },
                        max_tokens: 4000,
                    });

                    let textResult = response.choices[0].message.content;
                    textResult = textResult.replace(/```json/gi, '').replace(/```/g, '').trim();
                    
                    let parsedResult = JSON.parse(textResult);

                    if (parsedResult && Array.isArray(parsedResult.pacientes)) {
                        const insertMany = db.transaction((pacientes) => {
                            for (const paciente of pacientes) {
                                const { nombre, apellido, cedula, centro, edad_sector } = paciente;
                                
                                const safeN = (nombre || "N/D").trim();
                                const safeA = (apellido || "N/D").trim();
                                const safeC = (cedula || "N/D").replace(/\D/g, ''); 
                                const safeCen = (centro || "N/D").trim();
                                const safeE = (edad_sector || "N/D").trim();
                                
                                if (safeN === "N/D" && safeC === "" && safeA === "N/D") continue;

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
                                    insertPaciente.run(safeN, safeA, safeC || "N/D", safeCen, safeE, batchId);
                                    totalNuevos++;
                                    
                                    if (normC && normC !== "") existingCedulas.add(normC);
                                    if (normN) existingNombres.add(`${normN}|${normA}`);
                                    
                                    pacientesExtraidos.push({
                                        nombre: safeN,
                                        apellido: safeA,
                                        cedula: safeC || "N/D",
                                        centro: safeCen,
                                        edad_sector: safeE
                                    });
                                } else {
                                    totalDuplicados++;
                                }
                            }
                        });

                        insertMany(parsedResult.pacientes);
                    }
                } catch(e) {
                    console.error("Error processing chunk with OpenAI:", e);
                }
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

    return { success: true, totalNuevos, totalDuplicados, archivosSaltados, nuevosPacientes: pacientesExtraidos };
}
