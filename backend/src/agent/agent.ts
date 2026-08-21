import { AgentProvider, AgentImage } from './provider';
import { Executor } from './tools';
import { AgentDecision, ExecutionResult } from './types';

const STEP_DELAY_MS = parseInt(process.env.AGENT_STEP_DELAY_MS || '2000', 10);

export interface AgentResult {
  decision: AgentDecision;
  execution: ExecutionResult | null;
  response: string;
}

export class Agent {
  readonly providerName: string;

  constructor(
    private readonly provider: AgentProvider,
    private readonly executor: Executor,
    private readonly contextProvider: (() => string[]) | null = null,
  ) {
    this.providerName = provider.name;
  }

  async handle(text: string): Promise<AgentResult> {
    const context = this.contextProvider ? this.contextProvider() : [];
    let image: AgentImage | null = null;
    const stepLog: string[] = [];
    const MAX_STEPS = 10;

    for (let i = 0; i < MAX_STEPS; i++) {
      const decision = await this.provider.decide(text, [...context, ...stepLog], image);
      if (i > 0) await sleep(STEP_DELAY_MS);

      if (decision.kind === 'tool' && decision.tool === 'seeScreen') {
        const screen = await this.executor.execute('seeScreen', {});
        if (screen.status === 'success' && screen.image) {
          image = screen.image;
          stepLog.push('[Vi la pantalla de la TV. Usá la imagen adjunta para decidir el siguiente paso.]');
          continue;
        }
        return { decision, execution: screen, response: `No pude ver la pantalla: ${screen.message}` };
      }

      if (decision.kind === 'tool') {
        const result = await this.apply(decision, image);
        const cont = ['navigate', 'openApp', 'back', 'home', 'getScreenElements', 'clickElement', 'tapAt'].includes(
          decision.tool,
        );
        if (cont) {
          const hint =
            decision.tool === 'tapAt'
              ? ' Si la pantalla cambió y todavía no completaste el pedido, llamá seeScreen de nuevo antes de seguir tocando.'
              : '';
          stepLog.push(`[Acción: ${decision.tool} ${JSON.stringify(decision.params)} → ${result.response}.${hint}]`);
          continue;
        }
        return result;
      }

      return this.apply(decision, image);
    }

    return {
      decision: { kind: 'reply', text: 'Ya ejecuté la acción solicitada.' },
      execution: null,
      response: 'Ya ejecuté la acción solicitada.',
    };
  }

  private async apply(decision: AgentDecision, image?: AgentImage | null): Promise<AgentResult> {
    switch (decision.kind) {
      case 'tool': {
        const execution = await this.executor.execute(decision.tool, decision.params);
        const response =
          decision.tool === 'viewingHistory'
            ? this.describeHistory(execution)
            : decision.tool === 'webSearch'
              ? this.describeSearch(execution)
              : execution.status === 'success'
                ? `Listo, ${decision.tool} ejecutado.`
                : `No pude: ${execution.message}`;
        return { decision, execution, response };
      }
      case 'reply':
        return { decision, execution: null, response: decision.text };
      case 'error':
        return { decision, execution: null, response: decision.message };
    }
  }

  private describeSearch(execution: ExecutionResult): string {
    if (execution.status === 'failed') return `No pude: ${execution.message}`;
    const blocks = execution.message.split('\n\n');
    const first = blocks[0] ?? '';
    const lines = first.split('\n');
    return `Busqué y encontré: ${lines[0]}. Fuente: ${lines[1] ?? ''}`.trim();
  }

  private describeHistory(execution: ExecutionResult): string {
    if (execution.status === 'failed') return `No pude: ${execution.message}`;
    const lines = execution.message.split('\n');
    if (lines.length === 0) return 'No hay apps registradas en la memoria de uso.';
    const apps = lines
      .map((l) => {
        const [ts, ...rest] = l.split(' ');
        const app = rest.join(' ');
        const when = new Date(ts).toLocaleString('es-AR', {
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        });
        return `${app} (${when})`;
      })
      .join(', ');
    return `Según la memoria de uso, recientemente viste: ${apps}.`;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}