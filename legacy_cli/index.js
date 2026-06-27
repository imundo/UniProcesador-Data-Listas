const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const OpenAI = require('openai');
require('dotenv').config();

// ============================================================================
// CONFIGURACIÓN E INICIALIZACIÓN
// ============================================================================

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
    console.error("ERROR: No se encontró OPENAI_API_KEY en el archivo .env");
    process.exit(1);
}

const openai = new OpenAI({ apiKey });
const MODEL = "gpt-4o-mini"; // Usando gpt-4o-mini para ahorrar costos al máximo como pediste

const PROMPT = `
Eres un asistente experto en extracción de datos de salud y pacientes.
Extrae los nombres, apellidos, cédula, centro médico y edad/sector de los pacientes que aparecen en las imágenes proporcionadas.
Devuélvelo ESTRICTAMENTE en formato CSV, sin markdown, sin bloques de código, solo texto plano usando exactamente estas cabeceras:
nombre,apellido,cedula,centro,edad_sector
Si un dato no existe para un paciente, déjalo en blanco.
Si la imagen no contiene pacientes, devuelve solo las cabeceras.
Ejemplo de salida correcta:
José Antonio,Pérez García,V-12345678,Hospital Universitario de Caracas,40 años · Petare
`;

const pdfParse = require('pdf-parse');

const crypto = require('crypto');

// ============================================================================
// FUNCIONES AUXILIARES
// ============================================================================

function getFileHash(filePath) {
    const fileBuffer = fs.readFileSync(filePath);
    const hashSum = crypto.createHash('md5');
    hashSum.update(fileBuffer);
    return hashSum.digest('hex');
}

function fileToBase64(filePath) {
    return fs.readFileSync(filePath).toString('base64');
}

/**
 * Extrae fotogramas clave de un video usando ffmpeg
 */
function extractFrames(videoPath, tempDir) {
    const frameBaseName = path.basename(videoPath, path.extname(videoPath)) + '_frame';
    const outputPathPattern = path.join(tempDir, `${frameBaseName}_%d.jpg`);
    
    console.log(`Extrayendo fotogramas del video con ffmpeg...`);
    try {
        execSync(`ffmpeg.exe -i "${videoPath}" -vf "fps=1" -vframes 3 "${outputPathPattern}" -y`, { stdio: 'pipe' });
        
        const extractedFrames = [];
        for (let i = 1; i <= 3; i++) {
            const framePath = path.join(tempDir, `${frameBaseName}_${i}.jpg`);
            if (fs.existsSync(framePath)) {
                extractedFrames.push(framePath);
            }
        }
        return extractedFrames;
    } catch (e) {
        console.error(`Error extrayendo fotogramas: ${e.message}`);
        return [];
    }
}

// ============================================================================
// FUNCIONES PRINCIPALES
// ============================================================================

async function processWithOpenAI(filePath) {
    try {
        const ext = path.extname(filePath).toLowerCase();
        let contentMessages = [{ type: "text", text: PROMPT }];
        
        let filesToProcess = [];
        const tempDir = path.dirname(filePath);

        // Si es PDF, extraemos el texto y se lo pasamos directamente como prompt de texto
        if (ext === '.pdf') {
            console.log(`Extrayendo texto del PDF...`);
            const dataBuffer = fs.readFileSync(filePath);
            const data = await pdfParse(dataBuffer);
            contentMessages.push({
                type: "text",
                text: `Aquí tienes el contenido del PDF:\n\n${data.text}`
            });
            console.log(`Procesando texto del PDF con IA (OpenAI ${MODEL})...`);
        } else if (ext === '.mp4') {
            const frames = extractFrames(filePath, tempDir);
            if (frames.length === 0) {
                console.error("No se pudieron extraer fotogramas del video.");
                return null;
            }
            filesToProcess = frames;
        } else {
            filesToProcess = [filePath];
        }

        if (ext !== '.pdf') {
            console.log(`Procesando ${filesToProcess.length} archivo(s) de imagen/video con IA (OpenAI ${MODEL})...`);
            for (const file of filesToProcess) {
                let mimeType = 'image/jpeg';
                if (file.endsWith('.png')) mimeType = 'image/png';
                
                const base64Image = fileToBase64(file);
                contentMessages.push({
                    type: "image_url",
                    image_url: {
                        url: `data:${mimeType};base64,${base64Image}`
                    }
                });
            }
        }

        const response = await openai.chat.completions.create({
            model: MODEL,
            messages: [
                {
                    role: "user",
                    content: contentMessages
                }
            ],
            max_tokens: 2000, // Aumentado para acomodar listas largas en PDFs
        });

        let text = response.choices[0].message.content;
        text = text.replace(/```csv/g, '').replace(/```/g, '').trim();
        return text;
    } catch (e) {
        console.error(`\n[ERROR DE OPENAI]: ${e.message}`);
        return null;
    }
}

function downloadWithYtDlp(url, tempDir) {
    console.log(`Descargando contenido de URL: ${url}`);
    const outputPath = path.join(tempDir, '%(title)s_%(autonumber)s.%(ext)s');
    try {
        const startTime = Date.now();
        execSync(`yt-dlp.exe -o "${outputPath}" "${url}"`, { stdio: 'inherit' });
        
        const downloadedFiles = fs.readdirSync(tempDir)
            .map(name => path.join(tempDir, name))
            .filter(filePath => fs.statSync(filePath).mtime.getTime() >= startTime - 1000);
            
        if (downloadedFiles.length > 0) {
            console.log(`yt-dlp descargó ${downloadedFiles.length} archivo(s).`);
            return downloadedFiles;
        }
    } catch (e) {
        console.error(`Error descargando URL con yt-dlp: ${e.message}`);
    }
    return [];
}

// ============================================================================
// FLUJO DE EJECUCIÓN PRINCIPAL
// ============================================================================

async function main() {
    const linksFile = 'links.txt';
    const outputFile = 'plantilla_pacientes.csv';
    const tempDir = path.join(__dirname, 'temp_processing');
    const processedFilesPath = 'procesados.json';

    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir);
    }
    if (!fs.existsSync(outputFile)) {
        fs.writeFileSync(outputFile, "nombre,apellido,cedula,centro,edad_sector\n", 'utf8');
    }
    
    // Historial de archivos procesados (por Hash MD5) para ahorrar tokens
    let processedFiles = {};
    if (fs.existsSync(processedFilesPath)) {
        processedFiles = JSON.parse(fs.readFileSync(processedFilesPath, 'utf8'));
    }
    
    // Cargar pacientes existentes para validación de duplicados en la base de datos
    const existingContent = fs.readFileSync(outputFile, 'utf8');
    const existingLines = new Set(existingContent.split('\n').map(l => l.trim()).filter(l => l.length > 0));

    if (!fs.existsSync(linksFile)) {
        console.log(`No se encontró ${linksFile}. Creando uno vacío.`);
        fs.writeFileSync(linksFile, "", 'utf8');
        return;
    }

    const lines = fs.readFileSync(linksFile, 'utf8').split('\n').filter(l => l.trim() !== '' && !l.startsWith('#') && !l.startsWith('//'));
    
    if (lines.length === 0) {
        console.log("No hay enlaces o rutas en links.txt para procesar.");
        return;
    }

    for (const line of lines) {
        const item = line.trim();
        console.log(`\n--- Analizando: ${item} ---`);

        let filesToProcess = [];

        if (item.startsWith('http://') || item.startsWith('https://')) {
            const downloadedFiles = downloadWithYtDlp(item, tempDir);
            filesToProcess.push(...downloadedFiles);
        } else {
            if (fs.existsSync(item)) {
                const stat = fs.statSync(item);
                if (stat.isDirectory()) {
                    const dirFiles = fs.readdirSync(item).map(f => path.join(item, f));
                    filesToProcess.push(...dirFiles);
                } else {
                    filesToProcess.push(item);
                }
            } else {
                console.log(`La ruta o archivo local no existe: ${item}`);
            }
        }

        for (const filePath of filesToProcess) {
            const ext = path.extname(filePath).toLowerCase();
            if (!['.jpg', '.jpeg', '.png', '.mp4', '.pdf'].includes(ext)) {
                console.log(`Saltando archivo no soportado: ${filePath}`);
                continue;
            }

            // Validar si el archivo ya fue procesado antes (ahorro de tokens de OpenAI)
            const fileHash = getFileHash(filePath);
            if (processedFiles[fileHash]) {
                console.log(`⚡ Saltando archivo ya procesado previamente (Ahorro de Tokens): ${filePath}`);
                continue;
            }

            console.log(`Procesando archivo: ${filePath}`);
            const textResult = await processWithOpenAI(filePath);

            if (textResult) {
                const csvLines = textResult.split('\n');
                let validLines = [];
                let duplicados = 0;
                
                for (let i = 0; i < csvLines.length; i++) {
                    const csvLine = csvLines[i].trim();
                    if (csvLine.toLowerCase().includes('nombre,apellido,cedula,centro,edad_sector')) {
                        continue; 
                    }
                    if (csvLine.length > 5) {
                        // Validación de duplicidad en base de datos
                        if (!existingLines.has(csvLine)) {
                            validLines.push(csvLine);
                            existingLines.add(csvLine);
                        } else {
                            duplicados++;
                        }
                    }
                }

                if (validLines.length > 0) {
                    fs.appendFileSync(outputFile, validLines.join('\n') + '\n', 'utf8');
                    console.log(`✅ Datos extraídos y guardados en ${outputFile} (${validLines.length} nuevos):`);
                    if (duplicados > 0) console.log(`   (Se ignoraron ${duplicados} pacientes duplicados)`);
                } else {
                    if (duplicados > 0) {
                        console.log(`⚠️ Se procesaron datos pero todos (${duplicados}) ya existían en el CSV (Duplicados).`);
                    } else {
                        console.log(`❌ No se detectaron pacientes en: ${filePath}`);
                    }
                }
                
                // Guardar como procesado exitosamente
                processedFiles[fileHash] = true;
                fs.writeFileSync(processedFilesPath, JSON.stringify(processedFiles, null, 2), 'utf8');
            }
        }
    }
    
    console.log(`\nProceso finalizado. Revisa ${outputFile}`);
}

main();
