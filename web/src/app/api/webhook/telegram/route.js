import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { performSearch } from '@/app/api/search/route.js';

let openai = null;

const SYSTEM_PROMPT_MESSAGING = `Eres el "Asistente Amigo", un bot diseñado para ayudar a personas que están buscando a sus seres queridos desaparecidos o pacientes en hospitales de Venezuela a través de Telegram o WhatsApp.
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

async function sendTelegramMessage(chatId, text) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return;

    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: chatId,
            text: text,
            parse_mode: 'Markdown'
        })
    });
}

export async function POST(req) {
    try {
        if (!openai) {
            openai = new OpenAI({
                apiKey: process.env.OPENAI_API_KEY || 'dummy'
            });
        }

        const body = await req.json();
        
        // Estructura de Telegram: body.message
        if (!body.message || !body.message.text) {
            return NextResponse.json({ status: "ignored" });
        }

        const chatId = body.message.chat.id;
        const userText = body.message.text;

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

            await sendTelegramMessage(chatId, secondResponse.choices[0].message.content);
        } else {
            await sendTelegramMessage(chatId, responseMessage.content);
        }

        return NextResponse.json({ status: "ok" });
    } catch (e) {
        console.error("Telegram webhook error", e);
        return NextResponse.json({ error: "error" }, { status: 500 });
    }
}
