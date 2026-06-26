const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { GoogleAIFileManager } = require('@google/generative-ai/server');
require('dotenv').config();

// ============================================================================
// CONFIGURACIÓN E INICIALIZACIÓN
// ============================================================================

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
    console.error("ERROR: No se encontró GEMINI_API_KEY en el archivo .env");
    process.exit(1);
}

// Se instancian las herramientas principales de la API de Google Gemini
const genAI = new GoogleGenerativeAI(apiKey);
const fileManager = new GoogleAIFileManager(apiKey);
// Usamos gemini-1.5-pro, optimizado para razonamiento multimodal
const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

// ============================================================================
// PROMPTS Y REGLAS DE IA
// ============================================================================

/**
 * Prompt estricto que dicta el comportamiento del modelo de Inteligencia Artificial.
 * Garantiza que la respuesta sea un formato CSV puro para parseo fácil.
 */
const PROMPT = `
Eres un asistente experto en extracción de datos de salud y pacientes.
Extrae los nombres, apellidos, cédula, centro médico y edad/sector de los pacientes que aparecen en este documento, imagen o video.
Devuélvelo ESTRICTAMENTE en formato CSV, sin markdown, sin bloques de código, solo texto plano usando exactamente estas cabeceras:
nombre,apellido,cedula,centro,edad_sector
Si un dato no existe para un paciente, déjalo en blanco.
Si la imagen/video no contiene pacientes, devuelve solo las cabeceras.
Ejemplo de salida correcta:
José Antonio,Pérez García,V-12345678,Hospital Universitario de Caracas,40 años · Petare
`;

// ============================================================================
// FUNCIONES PRINCIPALES
// ============================================================================

/**
 * Sube un archivo a la infraestructura de Google Gemini para ser procesado.
 * Es un requisito para poder mandar archivos pesados (videos) o imágenes complejas.
 * 
 * @param {string} filePath - La ruta local del archivo a subir.
 * @param {string} mimeType - El tipo MIME del archivo (ej. image/jpeg).
 * @returns {Object} El objeto representativo del archivo devuelto por Gemini.
 */
async function uploadFileToGemini(filePath, mimeType) {
    console.log(`Subiendo archivo a Gemini: ${filePath}`);
    const uploadResult = await fileManager.uploadFile(filePath, {
        mimeType: mimeType,
        displayName: path.basename(filePath),
    });
    console.log(`Archivo subido con URI: ${uploadResult.file.uri}`);
    return uploadResult.file;
}

/**
 * Procesa un archivo (subiéndolo primero si es necesario) y le pide a la IA 
 * que extraiga la información solicitada en el prompt.
 * 
 * @param {string} filePath - La ruta local del archivo a analizar.
 * @returns {string|null} El texto en formato CSV generado por Gemini, o null si falla.
 */
async function processWithGemini(filePath) {
    try {
        const ext = path.extname(filePath).toLowerCase();
        let mimeType = 'text/plain';
        if (['.jpg', '.jpeg'].includes(ext)) mimeType = 'image/jpeg';
        else if (ext === '.png') mimeType = 'image/png';
        else if (ext === '.pdf') mimeType = 'application/pdf';
        else if (ext === '.mp4') mimeType = 'video/mp4';
        else if (ext === '.csv') mimeType = 'text/csv';

        // 1. Subir a Gemini File Manager
        const geminiFile = await uploadFileToGemini(filePath, mimeType);

        console.log(`Procesando con IA...`);
        // 2. Ejecutar generación de contenido
        const result = await model.generateContent([
            geminiFile,
            { text: PROMPT }
        ]);

        let text = result.response.text();
        
        // Limpiar posible formato markdown que a veces el LLM ignora no poner
        text = text.replace(/```csv/g, '').replace(/```/g, '').trim();
        return text;
    } catch (e) {
        console.error(`Error procesando archivo con Gemini: ${e.message}`);
        return null;
    }
}

/**
 * Ejecuta yt-dlp como proceso hijo para descargar videos o imágenes de URLs 
 * públicas de redes sociales (como Instagram).
 * 
 * @param {string} url - La URL pública del reel o publicación.
 * @param {string} tempDir - La carpeta local donde se guardará la descarga temporal.
 * @returns {string|null} La ruta local del archivo descargado, o null si falla.
 */
function downloadWithYtDlp(url, tempDir) {
    console.log(`Descargando contenido de URL: ${url}`);
    const outputPath = path.join(tempDir, '%(title)s.%(ext)s');
    try {
        // Ejecutamos yt-dlp de forma síncrona
        execSync(`yt-dlp.exe -o "${outputPath}" "${url}"`, { stdio: 'inherit' });
        
        // Buscamos el archivo más reciente (el que acabamos de descargar)
        const files = fs.readdirSync(tempDir).map(name => ({
            name,
            time: fs.statSync(path.join(tempDir, name)).mtime.getTime()
        })).sort((a, b) => b.time - a.time);
        
        if (files.length > 0) {
            return path.join(tempDir, files[0].name);
        }
    } catch (e) {
        console.error(`Error descargando URL con yt-dlp: ${e.message}`);
    }
    return null;
}

// ============================================================================
// FLUJO DE EJECUCIÓN PRINCIPAL
// ============================================================================

/**
 * Función principal que lee el archivo de entrada, determina la fuente 
 * de cada línea (URL o directorio local), procesa el contenido, y ensambla
 * los resultados en un CSV consolidado.
 */
async function main() {
    const linksFile = 'links.txt';
    const outputFile = 'plantilla_pacientes.csv';
    const tempDir = path.join(__dirname, 'temp_processing');

    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir);
    }

    if (!fs.existsSync(linksFile)) {
        fs.writeFileSync(linksFile, '## Pega aquí tus URLs o rutas locales (una por línea)\n');
        console.log("Se ha creado el archivo links.txt. Por favor agrega tus links o rutas y vuelve a ejecutar.");
        return;
    }

    const lines = fs.readFileSync(linksFile, 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('##'));
    
    if (lines.length === 0) {
        console.log("No hay URLs ni archivos por procesar en links.txt.");
        return;
    }

    for (let line of lines) {
        console.log(`\n--- Analizando: ${line} ---`);
        let filesToProcess = [];

        if (line.startsWith('http')) {
            const downloaded = downloadWithYtDlp(line, tempDir);
            if (downloaded) filesToProcess.push(downloaded);
        } else {
            // Es una ruta local
            if (fs.existsSync(line)) {
                const stat = fs.statSync(line);
                if (stat.isDirectory()) {
                    console.log(`Es una carpeta. Leyendo archivos internos...`);
                    const files = fs.readdirSync(line);
                    for (let file of files) {
                        const fullPath = path.join(line, file);
                        if (fs.statSync(fullPath).isFile()) {
                            filesToProcess.push(fullPath);
                        }
                    }
                } else {
                    filesToProcess.push(line);
                }
            } else {
                console.log(`La ruta local no existe: ${line}`);
            }
        }

        for (let filePathToProcess of filesToProcess) {
            console.log(`\nProcesando archivo: ${filePathToProcess}`);
            const csvOutput = await processWithGemini(filePathToProcess);
            if (csvOutput) {
                // Agregar al archivo original omitiendo la cabecera si ya existe
                let lines = csvOutput.split('\n').filter(l => l.trim() !== '');
                if (lines.length > 0 && lines[0].toLowerCase().includes('nombre,apellido')) {
                    lines.shift(); // Quitar cabecera del LLM
                }
                if (lines.length > 0) {
                    const dataToAppend = lines.join('\n') + '\n';
                    fs.appendFileSync(outputFile, dataToAppend);
                    console.log(`Datos extraídos y guardados en ${outputFile}:\n${dataToAppend.trim()}`);
                } else {
                    console.log("No se encontraron pacientes en este archivo.");
                }
            }
        }
    }
    
    console.log("\nProceso finalizado. Revisa plantilla_pacientes.csv");
}

main();
