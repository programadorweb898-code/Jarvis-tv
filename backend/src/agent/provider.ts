import { AgentDecision } from './types';
import { TOOLS, findTool } from './tools';
import { ToolDef } from './types';

export interface AgentImage {
  dataUrl: string;
  width: number;
  height: number;
}

export interface AgentProvider {
  readonly name: string;
  decide(text: string, sessionContext: string[], image?: AgentImage | null): Promise<AgentDecision>;
}

export interface ProviderContext {
  language: string;
}

export function createProvider(ctx: ProviderContext): AgentProvider {
  const provider = process.env.LLM_PROVIDER || 'mock';
  switch (provider) {
    case 'mock':
      return new MockProvider(ctx);
    case 'openai-compatible':
      return new OpenAICompatibleProvider(ctx);
    default:
      throw new Error(`Proveedor LLM no soportado: ${provider}`);
  }
}

function toDecision(tool: string, params: Record<string, unknown>): AgentDecision {
  return { kind: 'tool', tool, params };
}

function toolToOpenAIFunction(tool: ToolDef) {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const param of tool.params) {
    properties[param.name] = { type: param.type, description: param.description };
    if (param.required) required.push(param.name);
  }
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: 'object',
        properties,
        ...(required.length ? { required } : {}),
      },
    },
  };
}

/**
 * Provider OpenAI-compatible (chat completions) configurable por env:
 *   LLM_API_URL      -> base URL (ej. https://api.openai.com/v1, http://localhost:1234/v1, https://openrouter.ai/api/v1)
 *   LLM_API_KEY      -> API key (opcional para servidores locales sin auth)
 *   LLM_MODEL        -> id del modelo multimodal (usado cuando hay imagen, p. ej. seeScreen)
 *   LLM_TEXT_MODEL   -> id del modelo de texto sin visión (usado en pasos sin imagen; default: LLM_MODEL)
 * Sirve para OpenAI, llama.cpp, vLLM, OpenRouter, etc.
 */
class OpenAICompatibleProvider implements AgentProvider {
  readonly name = 'openai-compatible';

  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly textModel: string;

  constructor(private readonly ctx: ProviderContext) {
    this.baseUrl = (process.env.LLM_API_URL || '').replace(/\/$/, '');
    this.apiKey = process.env.LLM_API_KEY || '';
    this.model = process.env.LLM_MODEL || '';
    this.textModel = process.env.LLM_TEXT_MODEL || this.model;
    if (!this.baseUrl || !this.model) {
      throw new Error(
        'openai-compatible requiere LLM_API_URL y LLM_MODEL (LLM_API_KEY si requiere auth)',
      );
    }
  }

  async decide(text: string, sessionContext: string[], image?: AgentImage | null): Promise<AgentDecision> {
    const useImage = Boolean(image);
    const model = useImage ? this.model : this.textModel;
    const userContent: unknown[] = [{ type: 'text', text }];
    if (image) {
      userContent.push({
        type: 'image_url',
        image_url: { url: image.dataUrl },
      });
      userContent.push({
        type: 'text',
        text: `(Esta es la pantalla actual de la TV: ${image.width}x${image.height}). Usala para decidir cómo navegar.`,
      });
    }

    const messages = [
      {
        role: 'system',
        content: `Sos el agente de Jarvis TV. Respondé en ${this.ctx.language === 'es' ? 'español' : this.ctx.language}. Usá las tools para ejecutar acciones en la Android TV. Si la intención no requiere tool, respondé con texto.

Ver la pantalla:
- Camino principal para ubicar o tocar un elemento visible (perfil, botón, menú): getScreenElements (lista lo que hay) → clickElement(text del elemento). No asumas qué app está abierta.
- Si getScreenElements viene vacío ("No se detectaron elementos") O clickElement no encuentra el elemento: llamá seeScreen, identificá el elemento en la imagen y llamá tapAt(x, y) con sus coordenadas. No navegues con dpad a ciegas.
- Después de un tapAt, si la pantalla cambió y todavía no llegaste al objetivo final del pedido (por ejemplo seleccionar un perfil después de haber tocado "cambiar de cuenta"), volvé a llamar seeScreen para ver el nuevo estado y seguí tocando con tapAt hasta completar la tarea o quedarte sin pasos. No asumas que un solo tap resuelve pedidos que requieren varias pantallas (cambiar de perfil, navegar menús anidados).
- Las coordenadas de tapAt van en el sistema de coordenadas de la imagen que viste con seeScreen (el ancho y alto se te informan al capturar), NO en la resolución real de la TV: el backend las escala automáticamente.
- navigate (dpad) queda reservado para pedidos genéricos sin un elemento visual puntual (p. ej. "andá para arriba", "movete a la derecha"), no como mecanismo de búsqueda de elementos.
- Para cambiar de cuenta/perfil dentro de una app abierta: listá los elementos con getScreenElements y tocá "Cambiar de cuenta" o el perfil con clickElement; si el listado viene vacío, seeScreen una vez y tapAt sobre el perfil que veas en la imagen.`,
      },
      ...sessionContext.map((c) => ({ role: 'user', content: c })),
      { role: 'user', content: userContent },
    ];

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model,
        messages,
        tools: TOOLS.map(toolToOpenAIFunction),
        tool_choice: 'auto',
        max_tokens: 1024,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      return {
        kind: 'error',
        message: `LLM API error ${res.status}: ${body.slice(0, 300)}`,
      };
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string | null; tool_calls?: unknown[] } }>;
    };
    const message = data.choices?.[0]?.message;
    const toolCall = Array.isArray(message?.tool_calls) && message!.tool_calls[0]
      ? (message!.tool_calls[0] as { function?: { name?: string; arguments?: string } })
      : null;

    if (toolCall?.function?.name) {
      const tool = findTool(toolCall.function.name);
      if (!tool) {
        return {
          kind: 'error',
          message: `Tool no soportada por el agente: ${toolCall.function.name}`,
        };
      }
      let params: Record<string, unknown> = {};
      if (toolCall.function.arguments) {
        try {
          params = JSON.parse(toolCall.function.arguments);
        } catch {
          params = {};
        }
      }
      return { kind: 'tool', tool: tool.name, params };
    }

    return { kind: 'reply', text: message?.content?.trim() || 'Sin respuesta del modelo.' };
  }
}

/**
 * Provider de demostración basado en reglas (sin API key).
 * Reemplazar por un provider real (OpenAI/Anthropic/otro) implementando AgentProvider.
 */
class MockProvider implements AgentProvider {
  readonly name = 'mock';

  constructor(private readonly ctx: ProviderContext) {}

  async decide(text: string, _sessionContext: string[], _image?: AgentImage | null): Promise<AgentDecision> {
    const t = text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    if (/(subi|aumenta|mas (alto|volumen)|volumen (arriba|mas))/.test(t)) {
      return toDecision('volumeUp', {});
    }
    if (/(baja|reduci|menos (alto|volumen)|volumen (abajo|menos))/.test(t)) {
      return toDecision('volumeDown', {});
    }
    if (/(silenc|mutear|mute)/.test(t)) {
      return toDecision('mute', {});
    }
    if (/(pause|pausa|detene|para el video|para la reproduccion)/.test(t)) {
      return toDecision('pause', {});
    }
    if (/(reproduc(i|e|ir)|dale play|poni play|pone play|hace play)/.test(t)) {
      return toDecision('play', {});
    }
    if (/(pantalla de inicio|al inicio|al home)/.test(t)) {
      return toDecision('home', {});
    }
    if (/(atras|retroced|volve (para )?atras)/.test(t)) {
      return toDecision('back', {});
    }
    if (/(que (estaba|estuve) viendo|que vi (ayer|anoche|hoy)|ultima(s)? (app|aplicacion)|aplicaciones recientes|historial)/.test(t)) {
      return toDecision('viewingHistory', {});
    }
    if (/(a que hora|que dia|cuando (juega|es)|resultado|noticias?|clima|informacion)/.test(t)) {
      return toDecision('webSearch', { query: text });
    }
    const appMatch = t.match(/abri( (la|el))? ([a-z ]+)$/);
    if (appMatch) {
      return toDecision('openApp', { app: appMatch[3] });
    }
    const dirMatch = t.match(/navega (a la |al |a |hacia )?(arriba|abajo|izquierda|derecha)/);
    if (dirMatch) {
      const dir = { arriba: 'up', abajo: 'down', izquierda: 'left', derecha: 'right' }[
        dirMatch[dirMatch.length - 1]
      ];
      return toDecision('navigate', { direction: dir });
    }

    return {
      kind: 'reply',
      text: `No tengo una herramienta para esa petición. Podés pedirme: ${TOOLS.map(
        (tool) => tool.name,
      ).join(', ')}.`,
    };
  }
}