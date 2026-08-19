"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ws_1 = require("ws");
const wss = new ws_1.WebSocketServer({ port: 8080 });
console.log('WebSocket server started on port 8080');
wss.on('connection', (ws) => {
    console.log('Client connected');
    ws.on('message', (message) => {
        const msgString = message.toString();
        console.log('Received: %s', msgString);
        if (msgString === 'PING') {
            ws.send('PONG');
        }
    });
});
