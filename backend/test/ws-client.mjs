import WebSocket from 'ws';

const ws = new WebSocket('ws://localhost:8080');

ws.on('open', () => {
  const intent = process.argv[2] ?? 'qué estaba viendo ayer?';
  ws.send(JSON.stringify({ type: 'intent', payload: { text: intent } }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  console.log(`[${msg.type}]`, JSON.stringify(msg.payload ?? msg));
  if (msg.type === 'agent_response') {
    ws.close();
    process.exit(0);
  }
});

ws.on('error', (e) => {
  console.error(e.message);
  process.exit(1);
});

setTimeout(() => {
  console.error('timeout');
  process.exit(2);
}, 20000);