import { WebSocketServer, WebSocket } from 'ws';

const wss = new WebSocketServer({ port: 8080 });

console.log('WebSocket server started on port 8080');

wss.on('connection', (ws: WebSocket) => {
  console.log('Client connected');
  ws.on('message', (message: Buffer) => {
    const msgString = message.toString();
    console.log('Received: %s', msgString);
    if (msgString === 'PING') {
      ws.send('PONG');
    }
  });
});
