import { AgentProvider } from './provider';
import { Executor } from './tools';
import { AgentDecision, ExecutionResult } from './types';

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
  ) {
    this.providerName = provider.name;
  }

  async handle(text: string): Promise<AgentResult> {
    const decision = await this.provider.decide(text, []);
    return this.apply(decision);
  }

  private apply(decision: AgentDecision): AgentResult {
    switch (decision.kind) {
      case 'tool': {
        const execution = this.executor.execute(decision.tool, decision.params);
        const response =
          execution.status === 'success'
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
}