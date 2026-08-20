import { AgentDecision } from './types';
import { TOOLS } from './tools';

export interface AgentProvider {
  readonly name: string;
  decide(text: string, sessionContext: string[]): Promise<AgentDecision>;
}

export interface ProviderContext {
  language: string;
}

export function createProvider(ctx: ProviderContext): AgentProvider {
  const provider = process.env.LLM_PROVIDER || 'mock';
  switch (provider) {
    case 'mock':
      return new MockProvider(ctx);
    default:
      throw new Error(`Proveedor LLM no soportado: ${provider}`);
  }
}

function toDecision(tool: string, params: Record<string, unknown>): AgentDecision {
  return { kind: 'tool', tool, params };
}

/**
 * Provider de demostración basado en reglas (sin API key).
 * Reemplazar por un provider real (OpenAI/Anthropic/otro) implementando AgentProvider.
 */
class MockProvider implements AgentProvider {
  readonly name = 'mock';

  constructor(private readonly ctx: ProviderContext) {}

  async decide(text: string): Promise<AgentDecision> {
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