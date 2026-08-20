import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { TvRemote, loadTvRemoteConfig, resolveKeyCode } from './remote';
import { createProvider } from './agent/provider';
import { Executor } from './agent/tools';
import { Agent } from './agent/agent';

const tvRemote = new TvRemote(loadTvRemoteConfig(), (ready) => {
  console.log(`[tv-remote] estado: ${ready ? 'LISTO' : 'caído'}`);
  broadcastState();
});

const agent = new Agent(createProvider({ language: 'es' }), new Executor(tvRemote));

const wss = new WebSocketServer({ port: 8080 });

console.log('WebSocket server started on port 8080');
console.log(`[agent] proveedor: ${agent.providerName}`);
tvRemote.start();

function broadcastState() {
  const state = {
    id: uuidv4(),
    type: 'tv_state',
    payload: { remoteReady: tvRemote.isReady() },
    timestamp: new Date().toISOString(),
  };
  const text = JSON.stringify(state);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(text);
    }
  }
}

function sendExecutionResult(ws: WebSocket, action: string, status: string, message: string) {
  const result = {
    id: uuidv4(),
    type: 'execution_result',
    payload: { action, status, message },
    timestamp: new Date().toISOString(),
  };
  ws.send(JSON.stringify(result));
  console.log('Execution result:', result.payload);
}

function sendAgentResponse(ws: WebSocket, text: string) {
  const msg = {
    id: uuidv4(),
    type: 'agent_response',
    payload: { text },
    timestamp: new Date().toISOString(),
  };
  ws.send(JSON.stringify(msg));
  console.log('Agent response:', text);
}

async function handleIntent(ws: WebSocket, text: string) {
  console.log('Procesando intención:', text);
  const result = await agent.handle(text);
  if (result.decision.kind === 'tool' && result.execution) {
    sendExecutionResult(ws, result.decision.tool, result.execution.status, result.execution.message);
  }
  sendAgentResponse(ws, result.response);
}

function executeAction(ws: WebSocket, action: string): void {
  const keyCode = resolveKeyCode(action);
  if (keyCode === null) {
    sendExecutionResult(ws, action, 'failed', `Acción no soportada: ${action}`);
    return;
  }
  if (!tvRemote.isReady()) {
    sendExecutionResult(ws, action, 'failed', 'TV remoto no disponible');
    return;
  }
  const sent = tvRemote.sendKey(keyCode);
  sendExecutionResult(
    ws,
    action,
    sent ? 'success' : 'failed',
    sent ? `Tecla enviada (keyCode=${keyCode})` : 'Fallo al enviar la tecla',
  );
}

wss.on('connection', (ws: WebSocket) => {
  console.log('Client connected');
  ws.send(
    JSON.stringify({
      id: uuidv4(),
      type: 'tv_state',
      payload: { remoteReady: tvRemote.isReady() },
      timestamp: new Date().toISOString(),
    }),
  );

  ws.on('message', (message: Buffer) => {
    try {
      const msgString = message.toString();
      const msg = JSON.parse(msgString);
      console.log('Received type:', msg.type);

      switch (msg.type) {
        case 'audio_stream':
          console.log('Processing audio stream...');
          break;
        case 'intent':
          handleIntent(ws, String(msg.payload?.text ?? ''));
          break;
        case 'command':
          console.log('Ejecutando comando:', msg.payload?.action);
          executeAction(ws, msg.payload?.action);
          break;
        case 'execution_result':
          console.log('Execution result:', msg.payload);
          break;
        default:
          console.log('Unknown message type:', msg.type);
      }
    } catch (e) {
      console.error('Error parsing message:', e);
    }
  });
});