"use server";

import { getAiSettings } from './db';
import { logError, logWarn, logInfo } from './logger';

export async function getAiHelp(
  flowContext: string,
  userMessage: string
): Promise<string | null> {
  try {
    const settings = await getAiSettings();
    if (!settings || settings.aiEnabled === 0) {
      return null;
    }

    const provider = settings.provider;
    const systemPrompt = settings.systemPrompt || 'Eres un asistente experto en usabilidad. Tu objetivo es guiar al usuario a completar el flujo del bot.';
    
    const prompt = `
Contexto de la pantalla/bot actual:
${flowContext}

Entrada inválida o confusa del usuario:
"${userMessage}"

Por favor, genera una respuesta muy amable, concisa y directa al usuario en español, indicándole qué es lo que el bot le está pidiendo y cómo completarlo. Si hay botones o menús en la UI según el contexto, explícaselo brevemente. Mantén la respuesta amigable, corta (máximo 3 frases) y útil.

IMPORTANTE: Si consideras apropiado o si el usuario parece estar perdido, sugiérele tocar o escribir uno o varios comandos directos (comenzando con "/") según el contexto de pantalla provisto, por ejemplo:
- Para ir al Menú Principal: /menu o /cancelar
- Si el contexto es de Transportes/Entregas: /entrega (para Registrar Entregas), /recolecta (para Registrar Recolectas), /combustible (para Registrar Combustible), /averia (para Reportar Averías).
- Si el contexto es de Flota/Taller: /tickets (para Mis Tickets Abiertos), /combustible, /averia.
- Si el contexto es de entrega activa o menú de entregas: /entrega, /finalizar, /menu.
- Si el contexto es de recolecta activa o menú de recolectas: /recolecta, /finalizar, /menu.

Asegúrate de escribir el comando exacto con el prefijo "/" (ej. /entrega, /recolecta, /menu) para que el usuario de Telegram pueda presionarlo directamente en su pantalla de chat.
`;

    if (provider === 'ollama') {
      const host = settings.ollamaHost.replace(/\/$/, '');
      const url = `${host}/api/chat`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: settings.ollamaModel || 'llama3.2:3b',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt }
          ],
          stream: false,
          options: { temperature: 0.2 }
        }),
        // Add a safety timeout (e.g. 5 seconds) so the bot doesn't get blocked
        signal: AbortSignal.timeout(5000)
      });

      if (!response.ok) {
        throw new Error(`Ollama HTTP Error: ${response.status}`);
      }

      const data = await response.json() as any;
      return data.message?.content || null;

    } else if (provider === 'gemini') {
      const apiKey = settings.geminiApiKey;
      if (!apiKey) {
        logWarn('AI Assistant: Gemini API Key is missing.');
        return null;
      }
      
      const model = settings.geminiModel || 'gemini-1.5-flash';
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemPrompt }]
          },
          contents: [
            {
              role: 'user',
              parts: [{ text: prompt }]
            }
          ],
          generationConfig: {
            temperature: 0.2
          }
        }),
        signal: AbortSignal.timeout(5000)
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Gemini HTTP Error: ${response.status} - ${errText}`);
      }

      const data = await response.json() as any;
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      return text || null;

    } else if (provider === 'deepseek') {
      const apiKey = settings.deepseekApiKey;
      if (!apiKey) {
        logWarn('AI Assistant: DeepSeek API Key is missing.');
        return null;
      }

      const url = 'https://api.deepseek.com/chat/completions';
      const model = settings.deepseekModel || 'deepseek-v4-flash';

      const bodyPayload: any = {
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        stream: false,
        temperature: 0.2
      };

      // If pro model is selected, enable thinking logic
      if (model === 'deepseek-v4-pro') {
        bodyPayload.thinking = { type: 'enabled' };
        bodyPayload.reasoning_effort = 'high';
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(bodyPayload),
        signal: AbortSignal.timeout(8000) // DeepSeek reasoning might take a bit longer
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`DeepSeek HTTP Error: ${response.status} - ${errText}`);
      }

      const data = await response.json() as any;
      return data.choices?.[0]?.message?.content || null;
    }

    return null;
  } catch (error: any) {
    // Graceful fallback to offline/disabled mode: log error and return null
    logError('AI Assistant Error (Fallback activated):', { 
      message: error.message,
      error: error
    });
    return null;
  }
}

/**
 * Checks connection status for the configured provider.
 */
export async function testAiConnection(
  provider: 'ollama' | 'gemini' | 'deepseek',
  config: {
    ollamaHost?: string;
    ollamaModel?: string;
    geminiApiKey?: string;
    geminiModel?: string;
    deepseekApiKey?: string;
    deepseekModel?: string;
  }
): Promise<{ success: boolean; message: string }> {
  try {
    if (provider === 'ollama') {
      const host = (config.ollamaHost || 'http://localhost:11434').replace(/\/$/, '');
      const response = await fetch(`${host}/api/tags`, { signal: AbortSignal.timeout(3000) });
      if (!response.ok) {
        return { success: false, message: `Ollama respondió con error: ${response.status}` };
      }
      return { success: true, message: 'Conexión a Ollama exitosa.' };
    } else if (provider === 'gemini') {
      const apiKey = config.geminiApiKey;
      if (!apiKey) return { success: false, message: 'Falta la API Key de Gemini.' };
      const model = config.geminiModel || 'gemini-1.5-flash';
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'Respond ONLY with OK' }] }]
        }),
        signal: AbortSignal.timeout(4000)
      });
      if (!response.ok) {
        return { success: false, message: `Gemini respondió con error: ${response.status}` };
      }
      return { success: true, message: 'Conexión a Gemini exitosa.' };
    } else if (provider === 'deepseek') {
      const apiKey = config.deepseekApiKey;
      if (!apiKey) return { success: false, message: 'Falta la API Key de DeepSeek.' };
      const model = config.deepseekModel || 'deepseek-v4-flash';
      const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: model,
          messages: [{ role: 'user', content: 'Respond ONLY with OK' }],
          max_tokens: 5
        }),
        signal: AbortSignal.timeout(4000)
      });
      if (!response.ok) {
        return { success: false, message: `DeepSeek respondió con error: ${response.status}` };
      }
      return { success: true, message: 'Conexión a DeepSeek exitosa.' };
    }
    return { success: false, message: 'Proveedor no válido.' };
  } catch (error: any) {
    return { success: false, message: `Error de conexión: ${error.message}` };
  }
}
