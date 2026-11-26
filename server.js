const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };
const worlds = new Map();
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname);
  const requested = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const file = path.resolve(ROOT, requested);
  if (!file.startsWith(ROOT + path.sep) && file !== path.join(ROOT, 'index.html')) {
    res.writeHead(403); return res.end('Forbidden');
  }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
    res.end(data);
  });
});
const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
server.on('upgrade', (req, socket, head) => {
  if (new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname !== '/multiplayer') return socket.destroy();
  wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
});
function send(ws, data) { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data)); }
function broadcast(world, data, except) {
  const message = JSON.stringify(data);
  for (const client of world.clients) if (client !== except && client.readyState === WebSocket.OPEN) client.send(message);
}
wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const roomId = (url.searchParams.get('room') || 'public').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32) || 'public';
  const name = (url.searchParams.get('name') || 'Player').replace(/[<>\n\r]/g, '').slice(0, 18) || 'Player';
  let world = worlds.get(roomId);
  if (!world) { world = { clients: new Set(), blocks: {}, mode: 'survival' }; worlds.set(roomId, world); }
  ws.roomId = roomId; ws.playerId = Math.random().toString(36).slice(2, 10); ws.playerName = name;
  world.clients.add(ws);
  send(ws, { type: 'welcome', id: ws.playerId, room: roomId, blocks: world.blocks, mode: world.mode, players: [...world.clients].filter(c => c !== ws).map(c => ({ id: c.playerId, name: c.playerName, position: c.position || [0, 8, 0], rotation: c.rotation || 0 })) });
  broadcast(world, { type: 'join', id: ws.playerId, name, position: [0, 8, 0] }, ws);
  ws.on('message', raw => {
    let msg; try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (!msg || typeof msg.type !== 'string') return;
    if (msg.type === 'position' && Array.isArray(msg.position) && msg.position.length === 3 && msg.position.every(n => Number.isFinite(n) && Math.abs(n) < 10000)) {
      ws.position = msg.position.map(n => Math.round(n * 100) / 100); ws.rotation = Number.isFinite(msg.rotation) ? msg.rotation : 0;
      broadcast(world, { type: 'position', id: ws.playerId, position: ws.position, rotation: ws.rotation }, ws);
    } else if (msg.type === 'block' && Number.isInteger(msg.x) && Number.isInteger(msg.y) && Number.isInteger(msg.z) && Math.abs(msg.x) < 128 && msg.y >= -16 && msg.y < 128 && Math.abs(msg.z) < 128) {
      const key = `${msg.x},${msg.y},${msg.z}`;
      if (msg.remove) delete world.blocks[key]; else if (['grass', 'dirt', 'stone', 'wood', 'leaves', 'sand'].includes(msg.kind)) world.blocks[key] = msg.kind;
      else return;
      broadcast(world, { type: 'block', x: msg.x, y: msg.y, z: msg.z, kind: world.blocks[key] || null });
    } else if (msg.type === 'mode' && ['survival', 'creative', 'peaceful'].includes(msg.mode)) {
      world.mode = msg.mode; broadcast(world, { type: 'mode', mode: world.mode });
    } else if (msg.type === 'chat' && typeof msg.text === 'string') {
      const text = msg.text.replace(/[<>\r]/g, '').trim().slice(0, 180);
      if (text) broadcast(world, { type: 'chat', name: ws.playerName, text });
    }
  });
  ws.on('close', () => { world.clients.delete(ws); broadcast(world, { type: 'leave', id: ws.playerId, name: ws.playerName }); if (!world.clients.size) worlds.delete(roomId); });
});
server.listen(PORT, '0.0.0.0', () => console.log(`Bloxcraft is running at http://localhost:${PORT}`));
