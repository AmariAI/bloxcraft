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
    let body = data;
    if (requested === 'index.html') {
      body = Buffer.from(data.toString('utf8').replace('</body>', '<script src="/bot-controls.js" defer></script></body>'));
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
    res.end(body);
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
const tiers = [
  { name: 'Wood', color: '#a76b35' }, { name: 'Leather', color: '#9a6242' },
  { name: 'Iron', color: '#c4ccd0' }, { name: 'Diamond', color: '#4bd8ca' },
  { name: 'Netherite', color: '#65516a' }
];
function botMessage(world, bot, text) { broadcast(world, { type: 'chat', name: `${bot.name} · ${bot.tier.name}`, text }); }
function spawnBot(world, requestedName) {
  if (world.bots.size >= 8) return null;
  const tier = tiers[Math.floor(Math.random() * tiers.length)];
  const id = `bot-${Math.random().toString(36).slice(2, 9)}`;
  const name = (requestedName || `BlockBot${world.bots.size + 1}`).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 14) || 'BlockBot';
  const bot = { id, name, tier, position: [(Math.random() - .5) * 8, 8, (Math.random() - .5) * 8], rotation: 0, target: null, nextAction: Date.now() + 1800 + Math.random() * 2000, lastAttack: 0, inventory: 0 };
  world.bots.set(id, bot);
  broadcast(world, { type: 'join', id, name: `${name} [${tier.name}]`, position: bot.position, bot: true, tier: tier.name, armorColor: tier.color });
  botMessage(world, bot, `joined wearing ${tier.name} gear and is ready to explore.`);
  return bot;
}
function nearestPlayer(world, bot) {
  let nearest = null, distance = Infinity;
  for (const client of world.clients) {
    if (!client.position) continue;
    const d = Math.hypot(client.position[0] - bot.position[0], client.position[2] - bot.position[2]);
    if (d < distance) { nearest = client; distance = d; }
  }
  return { player: nearest, distance };
}
function stepWorld(world, dt) {
  const now = Date.now();
  for (const bot of world.bots.values()) {
    if (!bot.target || Math.hypot(bot.target[0] - bot.position[0], bot.target[2] - bot.position[2]) < 1) {
      bot.target = [(Math.random() - .5) * 26, 4 + Math.random() * 4, (Math.random() - .5) * 26];
    }
    const dx = bot.target[0] - bot.position[0], dz = bot.target[2] - bot.position[2];
    const length = Math.hypot(dx, dz) || 1;
    const speed = .8 + Math.random() * .35;
    bot.position[0] += dx / length * speed * dt;
    bot.position[2] += dz / length * speed * dt;
    bot.rotation = Math.atan2(-dx, -dz);
    if (now >= bot.nextAction) {
      bot.nextAction = now + 5500 + Math.random() * 6500;
      const nearbyBlocks = Object.entries(world.blocks).map(([key, kind]) => ({ key, kind, xyz: key.split(',').map(Number) })).filter(b => Math.hypot(b.xyz[0] - bot.position[0], b.xyz[2] - bot.position[2]) < 5 && b.xyz[1] > -1);
      if (nearbyBlocks.length && Math.random() < .35) {
        const block = nearbyBlocks[Math.floor(Math.random() * nearbyBlocks.length)];
        delete world.blocks[block.key];
        const [x, y, z] = block.xyz;
        broadcast(world, { type: 'block', x, y, z, kind: null });
        bot.inventory++;
        botMessage(world, bot, `mined ${block.kind || 'stone'}${/ore/.test(block.kind || '') ? ' ore' : ''}.`);
      } else if (Math.random() < .55) {
        const x = Math.round(bot.position[0] + (Math.random() * 2 - 1));
        const z = Math.round(bot.position[2] + (Math.random() * 2 - 1));
        const y = Math.max(2, Math.round(bot.position[1] - 3));
        const key = `${x},${y},${z}`;
        if (!world.blocks[key]) {
          const kind = ['wood', 'stone', 'dirt'][Math.floor(Math.random() * 3)];
          world.blocks[key] = kind;
          broadcast(world, { type: 'block', x, y, z, kind });
          botMessage(world, bot, `built with ${kind}.`);
        }
      } else {
        const { player, distance } = nearestPlayer(world, bot);
        if (world.mode !== 'peaceful' && player && distance < 3 && now - bot.lastAttack > 7000) {
          bot.lastAttack = now;
          botMessage(world, bot, `swung at ${player.playerName} in a sparring scuffle!`);
        } else if (world.mode !== 'peaceful') botMessage(world, bot, 'is exploring and looking for mobs and ores.');
      }
    }
    broadcast(world, { type: 'position', id: bot.id, position: bot.position.map(n => Math.round(n * 100) / 100), rotation: bot.rotation });
  }
}
setInterval(() => { for (const world of worlds.values()) if (world.bots.size) stepWorld(world, .5); }, 500);
wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const roomId = (url.searchParams.get('room') || 'public').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32) || 'public';
  const name = (url.searchParams.get('name') || 'Player').replace(/[<>\n\r]/g, '').slice(0, 18) || 'Player';
  let world = worlds.get(roomId);
  if (!world) { world = { clients: new Set(), blocks: {}, mode: 'survival', bots: new Map() }; worlds.set(roomId, world); }
  ws.roomId = roomId; ws.playerId = Math.random().toString(36).slice(2, 10); ws.playerName = name;
  world.clients.add(ws);
  const players = [...world.clients].filter(c => c !== ws).map(c => ({ id: c.playerId, name: c.playerName, position: c.position || [0, 8, 0], rotation: c.rotation || 0 }));
  for (const bot of world.bots.values()) players.push({ id: bot.id, name: `${bot.name} [${bot.tier.name}]`, position: bot.position, bot: true, tier: bot.tier.name, armorColor: bot.tier.color });
  send(ws, { type: 'welcome', id: ws.playerId, room: roomId, blocks: world.blocks, mode: world.mode, players });
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
    } else if (msg.type === 'bot_add') {
      const count = Math.max(1, Math.min(5, Number.isInteger(msg.count) ? msg.count : 1));
      for (let i = 0; i < count; i++) spawnBot(world, typeof msg.name === 'string' && count === 1 ? msg.name : null);
    } else if (msg.type === 'chat' && typeof msg.text === 'string') {
      const text = msg.text.replace(/[<>\r]/g, '').trim().slice(0, 180);
      if (text) broadcast(world, { type: 'chat', name: ws.playerName, text });
    }
  });
  ws.on('close', () => { world.clients.delete(ws); broadcast(world, { type: 'leave', id: ws.playerId, name: ws.playerName }); if (!world.clients.size && !world.bots.size) worlds.delete(roomId); });
});
server.listen(PORT, '0.0.0.0', () => console.log(`Bloxcraft is running at http://localhost:${PORT}`));
