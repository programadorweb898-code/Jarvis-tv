import WebSocket from 'ws';

const url = process.env.WS_URL || 'ws://localhost:8080';
const action = process.env.ACTION || 'volumeUp';
const ws = new WebSocket(url);

ws.on('open', () => {
  console.log('[test] conectado, enviando command:', action);
  ws.send(JSON.stringify({ id: 'test-1', type: 'command', payload: { action } }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  console.log('[test] recibido:', JSON.stringify(msg));
  if (msg.type === 'execution_result') {
    ws.close();
    process.exit(0);
  }
});

ws.on('error', (err) => {
  console.error('[test] error:', err.message);
  process.exit(1);
});

setTimeout(() => {
  console.error('[test] timeout');
  process.exit(2);
}, 15000);