import fs from 'fs';
import path from 'path';
const pdfParse = require('pdf-parse/lib/pdf-parse.js');

async function run() {
    const filePath = "c:\\Users\\imund\\OneDrive\\Documentos\\Proyectos DEV\\unificar\\procesar\\Ingresos por sismo en Hospitales consolidado (1).pdf";
    console.log("Reading:", filePath);
    const buffer = fs.readFileSync(filePath);
    console.log("Parsing PDF...");
    const data = await pdfParse(buffer);
    console.log("Text Length:", data.text.length);
    console.log("Sample text:");
    console.log(data.text.substring(0, 500));
}

run().catch(console.error);
