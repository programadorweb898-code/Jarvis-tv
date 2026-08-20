export type AgentDecision =
  | { kind: 'tool'; tool: string; params: Record<string, unknown> }
  | { kind: 'reply'; text: string }
  | { kind: 'error'; message: string };

export interface ToolParam {
  name: string;
  type: 'string' | 'number' | 'boolean';
  description: string;
  required?: boolean;
}

export interface ToolDef {
  name: string;
  description: string;
  params: ToolParam[];
}

export interface ExecutionResult {
  status: 'success' | 'failed';
  message: string;
}