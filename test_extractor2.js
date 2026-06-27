import fs from 'fs';
import path from 'path';
import 'dotenv/config'; // Make sure to load env vars
import { processFiles } from './web/src/lib/extractor.js';

// Polyfill File for Node.js
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
    const filePath = "c:\\Users\\imund\\OneDrive\\Documentos\\Proyectos DEV\\unificar\\procesar\\IMG-20260625-WA0732.jpg";
    const buffer = fs.readFileSync(filePath);
    const file = new FakeFile(buffer, path.basename(filePath));
    
    console.log("Processing:", file.name);
    try {
        const result = await processFiles([file]);
        console.log("Result:", result);
    } catch (e) {
        console.error("Error:", e);
    }
}

run();
