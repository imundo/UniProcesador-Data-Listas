import fs from 'fs';
import OpenAI from 'openai';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const fileBuffer = fs.readFileSync('../procesar/procesar_V2/WhatsApp Image 2026-06-27 at 2.52.31 PM (1).jpeg');
const base64Image = fileBuffer.toString('base64');

const PROMPT = `Extrae los pacientes. Las columnas suelen ser: Nombre, Apellido, Cédula, Edad. 
Si ves un número largo es la cédula. Si ves un número corto (1-100) es la edad.`;

async function test(model) {
    console.log(`\nProbando modelo: ${model}`);
    const response = await openai.chat.completions.create({
        model: model,
        messages: [
            { role: "system", content: PROMPT },
            { role: "user", content: [{ type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Image}`, detail: "high" } }] }
        ],
        response_format: {
            type: "json_schema",
            json_schema: {
                name: "pacientes",
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
                                    edad: { type: "string" }
                                },
                                required: ["nombre", "apellido", "cedula", "edad"],
                                additionalProperties: false
                            }
                        }
                    },
                    required: ["pacientes"],
                    additionalProperties: false
                }
            }
        }
    });
    console.log(JSON.stringify(JSON.parse(response.choices[0].message.content), null, 2));
}

async function main() {
    await test("gpt-4o-mini");
    await test("gpt-4o");
}
main();
