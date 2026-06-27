import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { performSearch } from '@/app/api/search/route.js';

let openai = null;

const SYSTEM_PROMPT_MESSAGING = `Eres el "Asistente Amigo", un bot diseñado para ayudar a personas que están buscando a sus seres queridos desaparecidos o pacientes en hospitales de Venezuela a través de WhatsApp.
Tu tono debe ser extremadamente reconfortante, respetuoso y muy humano, entendiendo que el usuario puede estar pasando por un momento de gran angustia.

Tus capacidades:
1. Tienes una herramienta llamada 'buscar_paciente' que DEBES usar cuando el usuario te dé el nombre o la cédula de alguien que está buscando.
2. Si el usuario te pregunta por un paciente, NO inventes respuestas. USA la herramienta 'buscar_paciente'.

Instrucciones cuando uses la herramienta 'buscar_paciente':
- Si la herramienta encuentra coincidencias, debes formatear los resultados de forma CLARA y ORDENADA usando emojis, negritas (*texto*) y saltos de línea (ya que aquí no tenemos interfaz gráfica).
- Lista CADA persona encontrada con este formato:
  👤 *[Nombre]*
  🏥 *Ubicación:* [Centro Médico]
  📝 *Estado:* [Estado si lo hay]
  ℹ️ *Nota:* [Edad/Sector si lo hay]
  🔗 *Fuentes:* [Nombre de las plataformas donde se encontró]
- Si la herramienta NO encuentra a la persona, ofrece palabras de aliento y sugiérele que siga intentando más tarde.`;

async function sendWhatsAppMessage(toPhone, text) {
    const token = process.env.WHATSAPP_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_ID;
    
    if (!token || !phoneId) return;

    await fetch(`https://graph.facebook.com/v17.0/${phoneId}/messages`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: toPhone,
            type: 'text',
            text: { body: text }
        })
    });
}

// Para verificación del Webhook de Meta
export async function GET(req) {
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get("hub.mode");
    const token = searchParams.get("hub.verify_token");
    const challenge = searchParams.get("hub.challenge");

    if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
        return new NextResponse(challenge, { status: 200 });
    } else {
        return NextResponse.json({ error: "Invalid token" }, { status: 403 });
    }
}

export async function POST(req) {
    try {
        if (!openai) {
            openai = new OpenAI({
                apiKey: process.env.OPENAI_API_KEY || 'dummy'
            });
        }

        const body = await req.json();

        // Estructura de webhook de WhatsApp
        if (body.object) {
            if (body.entry && body.entry[0].changes && body.entry[0].changes[0].value.messages && body.entry[0].changes[0].value.messages[0]) {
                const phoneNumber = body.entry[0].changes[0].value.messages[0].from;
                const userText = body.entry[0].changes[0].value.messages[0].text.body;

                const apiMessages = [
                    { role: "system", content: SYSTEM_PROMPT_MESSAGING },
                    { role: "user", content: userText }
                ];

                const tools = [
                    {
                        type: "function",
                        function: {
                            name: "buscar_paciente",
                            description: "Busca a una persona en la base de datos.",
                            parameters: {
                                type: "object",
                                properties: {
                                    query: { type: "string" }
                                },
                                required: ["query"]
                            }
                        }
                    }
                ];

                const response = await openai.chat.completions.create({
                    model: "gpt-4o-mini",
                    messages: apiMessages,
                    tools: tools,
                    tool_choice: "auto",
                    temperature: 0.7,
                });

                const responseMessage = response.choices[0].message;

                if (responseMessage.tool_calls) {
                    apiMessages.push(responseMessage);

                    for (const toolCall of responseMessage.tool_calls) {
                        if (toolCall.function.name === "buscar_paciente") {
                            const args = JSON.parse(toolCall.function.arguments);
                            let searchResults = [];
                            try {
                                searchResults = await performSearch(args.query);
                            } catch (e) {
                                console.error(e);
                            }

                            apiMessages.push({
                                role: "tool",
                                tool_call_id: toolCall.id,
                                name: toolCall.function.name,
                                content: JSON.stringify(searchResults)
                            });
                        }
                    }

                    const secondResponse = await openai.chat.completions.create({
                        model: "gpt-4o-mini",
                        messages: apiMessages,
                    });

                    await sendWhatsAppMessage(phoneNumber, secondResponse.choices[0].message.content);
                } else {
                    await sendWhatsAppMessage(phoneNumber, responseMessage.content);
                }
            }
            return NextResponse.json({ status: "ok" });
        } else {
            return NextResponse.json({ status: "not a whatsapp webhook" }, { status: 404 });
        }
    } catch (e) {
        console.error("WhatsApp webhook error", e);
        return NextResponse.json({ error: "error" }, { status: 500 });
    }
}
