import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
const pdfParse = require('pdf-parse/lib/pdf-parse.js');
import { execSync } from 'child_process';
import OpenAI from 'openai';

const MODEL = "gpt-4o-mini";
const PROMPT = `Vas a actuar como un experto extraedor de datos médicos.
A continuación te proporcionaré texto, una imagen o fotogramas de un video que contienen una lista de pacientes, personas, ingresos médicos u hospitalizados.
Tu objetivo es transcribir estrictamente todos los pacientes a un formato CSV.

Reglas obligatorias:
1. Extrae únicamente: Nombres, Apellidos, Cédula (solo números, elimina V- o E-), Centro de Salud / Hospital, Edad y Sector / Zona.
2. Si un dato no está en la imagen, déjalo en blanco.
3. El formato de salida debe ser exclusivamente CSV sin cabeceras.
4. Cada línea debe tener el formato: Nombre,Apellido,Cedula,CentroMedico,Edad_Sector
5. NO incluyas ninguna explicación, texto adicional, formato Markdown ni comillas. Solo los datos crudos separados por comas.`;

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
    const existingLines = new Set(existingContent.split('\n').map(l => l.trim()).filter(l => l.length > 0));

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
                    max_tokens: 2000,
                });

                let textResult = response.choices[0].message.content;
                textResult = textResult.replace(/```csv/g, '').replace(/```/g, '').trim();

                const csvLines = textResult.split('\n');
                let validLines = [];

                for (let i = 0; i < csvLines.length; i++) {
                    const csvLine = csvLines[i].trim();
                    if (csvLine.toLowerCase().includes('nombre,apellido,cedula')) continue;
                    if (csvLine.length > 5) {
                        if (!existingLines.has(csvLine)) {
                            validLines.push(csvLine);
                            existingLines.add(csvLine);
                        } else {
                            totalDuplicados++;
                        }
                    }
                }

                if (validLines.length > 0) {
                    fs.appendFileSync(outputFile, validLines.join('\n') + '\n', 'utf8');
                    totalNuevos += validLines.length;
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

    return { success: true, totalNuevos, totalDuplicados, archivosSaltados };
}
