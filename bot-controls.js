(() => {
  const style = document.createElement('style');
  style.textContent = `#botControls{position:fixed;z-index:6;left:14px;top:64px;width:210px;padding:12px;background:#10222ddd;color:#f7fbff;border:1px solid #ffffff2c;border-radius:12px;box-shadow:0 12px 40px #07131d55;font:13px system-ui;backdrop-filter:blur(10px)}#botControls strong{display:block;margin-bottom:8px}#botControls button{width:100%;margin:4px 0;padding:8px;border:0;border-radius:7px;background:#78d894;color:#10271a;font-weight:700;cursor:pointer}#botControls button:last-of-type{background:#ffffff18;color:white;border:1px solid #ffffff2b}#botRoster{max-height:92px;overflow:auto;color:#d4e4ea;font-size:11px;line-height:1.55;margin-top:6px}#botTip{font-size:10px;color:#a8bdc6;margin-top:6px}`;
  document.head.append(style);
  const panel = document.createElement('aside'); panel.id = 'botControls'; panel.innerHTML = '<strong>🤖 Server bots</strong><button id="addBot">Add a bot</button><button id="addBotSquad">Add 3 bots</button><div id="botRoster">Connect to a world to add bots.</div><div id="botTip">Bots roam, build, mine blocks and spar with nearby players. Maximum 8 per world.</div>';
  document.body.append(panel);
  let socket;
  function sync() {
    if (socket?.readyState === WebSocket.OPEN) return;
    const status = document.querySelector('#worldStatus');
    if (!status || status.textContent.includes('Loading')) return;
    const roomInput = document.querySelector('#roomName');
    const nameInput = document.querySelector('#playerName');
    const room = (roomInput?.value || new URLSearchParams(location.search).get('room') || 'my-world').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32) || 'public';
    const name = (nameInput?.value || 'Builder').trim().slice(0, 18) || 'Builder';
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    socket = new WebSocket(`${proto}//${location.host}/multiplayer?room=${encodeURIComponent(room)}&name=${encodeURIComponent(name + ' bot-control')}`);
    socket.onopen = () => { document.querySelector('#botRoster').textContent = 'Connected to ' + room + '. Add bots below.'; };
    socket.onclose = () => { document.querySelector('#botRoster').textContent = 'Bot control disconnected; reload the page to reconnect.'; };
  }
  function addBots(count) {
    sync();
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'bot_add', count }));
    else document.querySelector('#botRoster').textContent = 'Join a world first, then try again.';
  }
  document.querySelector('#addBot').onclick = () => addBots(1);
  document.querySelector('#addBotSquad').onclick = () => addBots(3);
  document.querySelector('#playBtn')?.addEventListener('click', () => setTimeout(sync, 500));
  window.addEventListener('keydown', e => { if (e.code === 'Escape') setTimeout(sync, 300); });
})();
