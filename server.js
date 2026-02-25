const WebServer = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;

const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml'
};

const server = WebServer.createServer((req, res) => {
    let filePath = '.' + req.url;
    if (filePath === './') filePath = './index.html';

    const extname = String(path.extname(filePath)).toLowerCase();
    const contentType = MIME_TYPES[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                res.writeHead(404);
                res.end('File not found');
            } else {
                res.writeHead(500);
                res.end('Server error: ' + error.code);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

const wss = new WebSocket.Server({ server });

const clients = new Map();

wss.on('connection', (ws, req) => {
    const id = Math.random().toString(36).substr(2, 9);
    const ip = req.socket.remoteAddress;

    clients.set(ws, { id, ip });
    console.log(`Client connected: ${id} (${ip})`);

    ws.send(JSON.stringify({ type: 'init', id: id }));
    broadcastDeviceList();

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            if (data.targetId) relayMessage(ws, data);
        } catch (e) {
            console.error('Error handling message:', e);
        }
    });

    ws.on('close', () => {
        clients.delete(ws);
        broadcastDeviceList();
        console.log(`Client disconnected: ${id}`);
    });
});

function broadcastDeviceList() {
    const deviceList = Array.from(clients.values()).map(c => ({ id: c.id, name: `Device ${c.id.substr(0, 4)}` }));
    const msg = JSON.stringify({ type: 'devices', devices: deviceList });
    for (const client of clients.keys()) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(msg);
        }
    }
}

function relayMessage(ws, data) {
    const sender = clients.get(ws);
    for (const [client, info] of clients.entries()) {
        if (info.id === data.targetId && client.readyState === WebSocket.OPEN) {
            data.senderId = sender.id;
            client.send(JSON.stringify(data));
            break;
        }
    }
}

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
