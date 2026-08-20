import WebSocket from 'ws';
import fs from 'fs';

const ws = new WebSocket('ws://localhost:8080');

ws.on('open', () => {
  const audio = fs.readFileSync('tone.wav');
  const base64 = audio.toString('base64');
  ws.send(JSON.stringify({ type: 'audio_stream', payload: { format: 'audio/wav', data: base64 } }));
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
}, 30000);