import { NextResponse } from 'next/server';
import OpenAI from 'openai';

// Se instanciará de forma lazy para evitar errores en build time
let openai = null;

const SYSTEM_PROMPT = `Eres un asistente virtual profundamente empático, compasivo y cálido, diseñado para ayudar a personas que están buscando a sus seres queridos desaparecidos o pacientes en hospitales de Venezuela.
Tu tono debe ser reconfortante, respetuoso y muy humano, entendiendo que el usuario puede estar pasando por un momento de gran angustia.

Tus capacidades:
1. Puedes responder preguntas generales sobre cómo funciona la aplicación.
2. Tienes una herramienta llamada 'buscar_paciente' que DEBES usar cuando el usuario te dé el nombre o la cédula de alguien que está buscando.
3. Si el usuario te pregunta por un paciente, NO inventes respuestas. USA la herramienta 'buscar_paciente'.

Instrucciones cuando uses la herramienta 'buscar_paciente':
- Si la herramienta encuentra a la persona, dale la noticia con tacto y de forma clara. Detalla en lenguaje natural toda la información que trae la herramienta: en qué plataformas o páginas (sources) fue encontrada, su estado (estado) si está disponible, su ubicación (centro médico) y notas (edad_sector). Sé muy conversacional.
- Si la herramienta NO encuentra a la persona, ofrece palabras de aliento, sugiérele que siga intentando más tarde ya que las bases de datos se actualizan constantemente, y dale fuerzas.
- NUNCA des diagnósticos médicos falsos. Limítate a los datos proporcionados por la herramienta.`;

export async function POST(req) {
    try {
        if (!openai) {
            openai = new OpenAI({
                apiKey: process.env.OPENAI_API_KEY || 'dummy_key_for_build'
            });
        }

        const body = await req.json();
        const { messages } = body;

        if (!messages || !Array.isArray(messages)) {
            return NextResponse.json({ error: "Invalid messages array" }, { status: 400 });
        }

        // Prep messages for OpenAI
        const apiMessages = [
            { role: "system", content: SYSTEM_PROMPT },
            ...messages.map(m => ({
                role: m.role,
                content: m.content
            }))
        ];

        const tools = [
            {
                type: "function",
                function: {
                    name: "buscar_paciente",
                    description: "Busca a una persona desaparecida o paciente en la base de datos de hospitales y plataformas de ayuda.",
                    parameters: {
                        type: "object",
                        properties: {
                            query: {
                                type: "string",
                                description: "El nombre completo, o nombre y apellido, o número de cédula de la persona a buscar (min 3 caracteres)."
                            }
                        },
                        required: ["query"]
                    }
                }
            }
        ];

        // Call OpenAI
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: apiMessages,
            tools: tools,
            tool_choice: "auto",
            temperature: 0.7, // A bit of creativity for empathy, but not too much to hallucinate data
        });

        const responseMessage = response.choices[0].message;

        // Step 2: Check if model wants to call a function
        if (responseMessage.tool_calls) {
            // Append the assistant's message with tool_calls
            apiMessages.push(responseMessage);

            for (const toolCall of responseMessage.tool_calls) {
                if (toolCall.function.name === "buscar_paciente") {
                    const args = JSON.parse(toolCall.function.arguments);
                    const query = args.query;
                    
                    let searchResults = [];
                    try {
                        const baseUrl = new URL(req.url).origin;
                        const searchRes = await fetch(`${baseUrl}/api/search?q=${encodeURIComponent(query)}`);
                        if (searchRes.ok) {
                            searchResults = await searchRes.json();
                        }
                    } catch (e) {
                        console.error("Internal search failed", e);
                    }

                    // Append the tool response
                    apiMessages.push({
                        role: "tool",
                        tool_call_id: toolCall.id,
                        name: toolCall.function.name,
                        content: JSON.stringify(searchResults)
                    });
                }
            }

            // Step 3: Get the final response from the model
            const secondResponse = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: apiMessages,
            });

            return NextResponse.json({
                role: "assistant",
                content: secondResponse.choices[0].message.content,
                // Pass raw search results to frontend so it can render share buttons
                rawSearchResults: apiMessages.filter(m => m.role === 'tool').map(m => JSON.parse(m.content)).flat()
            });
        }

        // Return regular message
        return NextResponse.json({
            role: "assistant",
            content: responseMessage.content
        });

    } catch (error) {
        console.error("Chat API Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
