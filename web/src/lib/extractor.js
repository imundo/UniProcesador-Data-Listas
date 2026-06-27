import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
const pdfParse = require('pdf-parse/lib/pdf-parse.js');
import { execSync } from 'child_process';
import OpenAI from 'openai';

const MODEL = "gpt-4o-mini";
const PROMPT = `Vas a actuar como un experto extraedor de datos médicos.
A continuación te proporcionaré texto, una imagen o fotogramas de un video que contienen una lista de pacientes, personas, ingresos médicos u hospitalizados.
Tu objetivo es transcribir estrictamente todos los pacientes a un formato JSON.

Reglas obligatorias:
1. Extrae únicamente: Nombres, Apellidos, Cédula (solo números, elimina V- o E-), Centro de Salud / Hospital, Edad y Sector / Zona.
2. Si un dato no está en la imagen o texto, déjalo como string vacío "".
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
    if (!text) return "";
    return text.toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, ' ');
}

export async function processFiles(files) {
    const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
    });

    // Crear carpetas necesarias
    const tempDir = path.join(process.cwd(), 'temp_processing');
    const dataDir = path.join(process.cwd(), 'data');
    const outputFile = path.join(dataDir, 'plantilla_pacientes.csv');
    const processedFilesPath = path.join(dataDir, 'procesados.json');
    const historyFile = path.join(dataDir, 'history.json');

    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    if (!fs.existsSync(outputFile)) {
        fs.writeFileSync(outputFile, "nombre,apellido,cedula,centro,edad_sector\n", 'utf8');
    }

    let processedFiles = {};
    if (fs.existsSync(processedFilesPath)) {
        processedFiles = JSON.parse(fs.readFileSync(processedFilesPath, 'utf8'));
    }

    const existingContent = fs.readFileSync(outputFile, 'utf8');
    const existingLinesRaw = existingContent.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const existingPatients = existingLinesRaw.slice(1).map(line => {
        const parts = line.split(',');
        return {
            nombre: normalizeText(parts[0] || ""),
            apellido: normalizeText(parts[1] || ""),
            cedula: normalizeText(parts[2] || ""),
            rawLine: line
        };
    });

    let pacientesExtraidos = [];

    let totalNuevos = 0;
    let totalDuplicados = 0;
    let archivosSaltados = 0;

    for (const file of files) {
        try {
            // Guardar temporalmente el archivo subido
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

            let contentMessages = [{ type: "text", text: PROMPT }];
            let filesToProcess = [];

            if (ext === '.pdf') {
                const data = await pdfParse(buffer);
                contentMessages.push({
                    type: "text",
                    text: `Aquí tienes el contenido del PDF:\n\n${data.text}`
                });
            } else if (ext === '.mp4') {
                const frameBaseName = `frame_${Date.now()}`;
                const outputPathPattern = path.join(tempDir, `${frameBaseName}_%d.jpg`);
                try {
                    // Usa 'ffmpeg' de Linux/Railway en vez de 'ffmpeg.exe'
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

            if (ext !== '.pdf') {
                for (const frameFile of filesToProcess) {
                    let mimeType = frameFile.endsWith('.png') ? 'image/png' : 'image/jpeg';
                    const base64Image = fs.readFileSync(frameFile).toString('base64');
                    contentMessages.push({
                        type: "image_url",
                        image_url: { url: `data:${mimeType};base64,${base64Image}` }
                    });
                }
            }

            if (contentMessages.length > 1) { // Asegurarse de que hay contenido además del prompt
                const response = await openai.chat.completions.create({
                    model: MODEL,
                    messages: [{ role: "user", content: contentMessages }],
                    response_format: { type: "json_object" },
                    max_tokens: 2000,
                });

                let textResult = response.choices[0].message.content;
                
                let parsedResult;
                try {
                    parsedResult = JSON.parse(textResult);
                } catch(e) {
                    console.error("Error parsing JSON de OpenAI:", e);
                    continue;
                }

                if (parsedResult && Array.isArray(parsedResult.pacientes)) {
                    let validLines = [];

                    for (const paciente of parsedResult.pacientes) {
                        const { nombre, apellido, cedula, centro, edad_sector } = paciente;
                        
                        // Validar campos que contengan comas y quitarlas para no romper el CSV simple
                        const safeN = (nombre || "").replace(/,/g, '');
                        const safeA = (apellido || "").replace(/,/g, '');
                        const safeC = (cedula || "").replace(/,/g, '').replace(/\D/g, '');
                        const safeCen = (centro || "").replace(/,/g, '');
                        const safeE = (edad_sector || "").replace(/,/g, '');
                        
                        if (!safeN && !safeC) continue; // Paciente vacío

                        const normN = normalizeText(safeN);
                        const normA = normalizeText(safeA);
                        const normC = normalizeText(safeC);

                        // Lógica de Deduplicación Fuzzy
                        const isDuplicate = existingPatients.some(ep => {
                            if (normC && ep.cedula === normC) return true; // Cédula exacta
                            if (!normC && !ep.cedula) {
                                // Sin cédula: Coincidencia por nombre y apellido
                                if (normN && normA && ep.nombre === normN && ep.apellido === normA) return true;
                            }
                            return false;
                        });

                        if (!isDuplicate) {
                            const csvLine = `${safeN},${safeA},${safeC},${safeCen},${safeE}`;
                            validLines.push(csvLine);
                            
                            // Añadir a nuestra DB en memoria para este lote
                            existingPatients.push({
                                nombre: normN,
                                apellido: normA,
                                cedula: normC,
                                rawLine: csvLine
                            });

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

                    if (validLines.length > 0) {
                        fs.appendFileSync(outputFile, validLines.join('\n') + '\n', 'utf8');
                        totalNuevos += validLines.length;
                    }
                }

                processedFiles[fileHash] = true;
                fs.writeFileSync(processedFilesPath, JSON.stringify(processedFiles, null, 2), 'utf8');
            }
        } catch (error) {
            console.error("Error procesando archivo:", error);
        }
    }

    // Limpiar temp_processing
    try {
        const tempFiles = fs.readdirSync(tempDir);
        for (const file of tempFiles) {
            fs.unlinkSync(path.join(tempDir, file));
        }
    } catch(e) {}

    // Registrar en el Histórico
    let history = [];
    if (fs.existsSync(historyFile)) {
        history = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
    }
    history.unshift({
        id: Date.now(),
        date: new Date().toISOString(),
        filesUploaded: files.length,
        newPatients: totalNuevos,
        duplicatesIgnored: totalDuplicados,
        filesSkippedByHash: archivosSaltados
    });
    fs.writeFileSync(historyFile, JSON.stringify(history, null, 2), 'utf8');

    return { success: true, totalNuevos, totalDuplicados, archivosSaltados, nuevosPacientes: pacientesExtraidos };
}
