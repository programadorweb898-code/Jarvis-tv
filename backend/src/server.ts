import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import http from 'http';
import fs from 'fs';
import { TvRemote, loadTvRemoteConfig, resolveKeyCode } from './remote';
import { createProvider } from './agent/provider';
import { Executor } from './agent/tools';
import { Agent } from './agent/agent';
import { MemoryStore } from './memory/store';
import { createSearchProvider } from './search/search';
import { transcribeAudio } from './stt';
import path from 'path';

const memory = new MemoryStore(path.join(__dirname, '..', 'data', 'usage.json'));

const tvRemote = new TvRemote(
  loadTvRemoteConfig(),
  (ready) => {
    console.log(`[tv-remote] estado: ${ready ? 'LISTO' : 'caído'}`);
    broadcastState();
  },
  (app) => {
    memory.record('app_active', app);
  },
);

const searchProvider = createSearchProvider();

const agent = new Agent(
  createProvider({ language: 'es' }),
  new Executor(tvRemote, memory, searchProvider),
  () => {
    const opens = memory.recentAppOpens(10);
    if (opens.length === 0) return [];
    return [
      `Memoria de uso de la TV (apps abiertas con fecha/hora, más reciente al final):\n${opens
        .map((e) => `${e.timestamp} ${e.app}`)
        .join('\n')}`,
    ];
  },
);

const server = http.createServer((req, res) => {
  const url = (req.url ?? '/').split('?')[0];
  if (url === '/' || url === '/voice' || url === '/voice.html') {
    const file = path.join(__dirname, '..', 'public', 'voice.html');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    fs.createReadStream(file).pipe(res);
    return;
  }
  res.writeHead(404);
  res.end('Not found');
});

const wss = new WebSocketServer({ server });

server.listen(8080, () => {
  console.log('Server HTTP+WS escuchando en http://192.168.1.87:8080/voice');
});
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

async function handleAudioStream(ws: WebSocket, payload: Record<string, unknown>) {
  const data = payload.data as string | undefined;
  if (!data) {
    sendExecutionResult(ws, 'audio_stream', 'failed', 'audio_stream requiere data base64');
    return;
  }
  try {
    const audio = Buffer.from(data, 'base64');
    const format = (payload.format as string) || 'audio/wav';
    console.log(`Transcribiendo audio (${audio.length} bytes, ${format})...`);
    const text = await transcribeAudio(audio, format);
    console.log('Transcripción:', text);
    if (!text) {
      sendAgentResponse(ws, 'No te escuché bien, ¿podés repetirlo?');
      return;
    }
    await handleIntent(ws, text);
  } catch (err) {
    console.error('Error transcribiendo:', err);
    sendExecutionResult(ws, 'audio_stream', 'failed', (err as Error).message);
  }
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
          handleAudioStream(ws, msg.payload ?? {});
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