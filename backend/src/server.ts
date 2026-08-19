import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';

const wss = new WebSocketServer({ port: 8080 });

console.log('WebSocket server started on port 8080');

// Estructura según docs/protocol.md
function sendCommand(ws: WebSocket, action: string, params: object) {
  const command = {
    id: uuidv4(),
    type: 'command',
    payload: {
      action: action,
      params: params
    },
    timestamp: new Date().toISOString()
  };
  ws.send(JSON.stringify(command));
  console.log('Sent command:', command);
}

wss.on('connection', (ws: WebSocket) => {
  console.log('Client connected');

  ws.on('message', (message: Buffer) => {
    try {
      const msgString = message.toString();
      const msg = JSON.parse(msgString);
      console.log('Received type:', msg.type);

      switch (msg.type) {
        case 'audio_stream':
          // Lógica para procesar audio con LLM
          console.log('Processing audio stream...');
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
