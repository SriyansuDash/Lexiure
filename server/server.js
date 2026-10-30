
const http = require('http');
const { randomUUID } = require('crypto');

const PORT = process.env.PORT || 8787;
const MAX_BYTES = 100 * 1024 * 1024; 
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,X-Filename',
  'Access-Control-Expose-Headers': 'Content-Disposition',
};

const rooms = new Map();
const itemsOf = (room) => {
  if (!rooms.has(room)) rooms.set(room, []);
  return rooms.get(room);
};

const send = (res, code, body, headers = {}) => {
  res.writeHead(code, { ...CORS, ...headers });
  res.end(body);
};
const json = (res, code, obj) =>
  send(res, code, JSON.stringify(obj), { 'Content-Type': 'application/json' });
const meta = (i) => ({ id: i.id, name: i.name, size: i.size, type: i.type, time: i.time, dir: i.dir });

const PHONE_PAGE = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Lexiure</title>
<style>
  :root { color-scheme: light dark; --accent:#6366f1; --bg:#f6f7fb; --card:#fff; --text:#1f2233; --muted:#6b7280; --line:#e5e7eb; }
  @media (prefers-color-scheme: dark) { :root { --bg:#0f1117; --card:#181b26; --text:#e8e9f0; --muted:#9097a8; --line:#2a2f3d; } }
  * { box-sizing: border-box; }
  body { margin:0; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background:var(--bg); color:var(--text); padding:20px 16px 40px; }
  h1 { font-size:20px; margin:0 0 4px; }
  .sub { color:var(--muted); font-size:14px; margin-bottom:20px; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:16px; padding:18px; margin-bottom:16px; }
  label.drop { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px; border:2px dashed var(--accent); border-radius:14px; padding:28px 12px; cursor:pointer; text-align:center; color:var(--muted); }
  label.drop strong { color:var(--accent); font-size:16px; }
  input[type=file] { display:none; }
  button { width:100%; margin-top:12px; padding:14px; border:0; border-radius:12px; background:var(--accent); color:#fff; font-size:16px; font-weight:600; }
  button:disabled { opacity:.5; }
  .status { margin-top:10px; font-size:14px; color:var(--muted); min-height:18px; }
  ul { list-style:none; padding:0; margin:0; }
  li { display:flex; justify-content:space-between; align-items:center; gap:10px; padding:12px 0; border-top:1px solid var(--line); }
  li:first-child { border-top:0; }
  .name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:500; }
  .meta { font-size:12px; color:var(--muted); }
  a.dl { color:#fff; background:var(--accent); padding:8px 14px; border-radius:10px; text-decoration:none; font-size:14px; white-space:nowrap; }
  .empty { color:var(--muted); font-size:14px; text-align:center; padding:12px 0; }
</style></head>
<body>
  <h1>Lexiure</h1>
  <div class="sub">Room <strong id="room"></strong> · files you send appear on your computer</div>

  <div class="card">
    <label class="drop" for="file">
      <strong>Choose files</strong>
      <span>Photos, documents, anything</span>
    </label>
    <input id="file" type="file" multiple>
    <button id="send" disabled>Send to computer</button>
    <div class="status" id="status"></div>
  </div>

  <div class="card">
    <strong>From your computer</strong>
    <ul id="list"><li class="empty">Nothing yet</li></ul>
  </div>

<script>
  var room = (new URLSearchParams(location.search).get('room') || '').toUpperCase();
  var fileInput = document.getElementById('file');
  var sendBtn = document.getElementById('send');
  var statusEl = document.getElementById('status');
  document.getElementById('room').textContent = room || '(missing)';

  function fmt(b) { return b < 1048576 ? (b / 1024).toFixed(1) + ' KB' : (b / 1048576).toFixed(1) + ' MB'; }

  fileInput.addEventListener('change', function () {
    var n = fileInput.files.length;
    sendBtn.disabled = n === 0;
    statusEl.textContent = n ? n + ' file(s) selected' : '';
  });

  sendBtn.addEventListener('click', async function () {
    var files = Array.from(fileInput.files);
    sendBtn.disabled = true;
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      statusEl.textContent = 'Sending ' + (i + 1) + ' of ' + files.length + ': ' + f.name;
      try {
        var r = await fetch('/api/upload?room=' + room + '&dir=to-pc', {
          method: 'POST',
          headers: { 'X-Filename': encodeURIComponent(f.name), 'Content-Type': f.type || 'application/octet-stream' },
          body: f
        });
        if (!r.ok) throw new Error('HTTP ' + r.status);
      } catch (e) {
        statusEl.textContent = 'Failed on ' + f.name + ' (' + e.message + ')';
        sendBtn.disabled = false;
        return;
      }
    }
    statusEl.textContent = 'Sent ' + files.length + ' file(s) ✓';
    fileInput.value = '';
  });

  async function refresh() {
    try {
      var r = await fetch('/api/files?room=' + room + '&dir=to-phone');
      var items = await r.json();
      var ul = document.getElementById('list');
      ul.innerHTML = '';
      if (!items.length) {
        var li = document.createElement('li'); li.className = 'empty'; li.textContent = 'Nothing yet';
        ul.appendChild(li); return;
      }
      items.forEach(function (it) {
        var li = document.createElement('li');
        var info = document.createElement('div'); info.style.minWidth = '0';
        var nm = document.createElement('div'); nm.className = 'name'; nm.textContent = it.name;
        var mt = document.createElement('div'); mt.className = 'meta'; mt.textContent = fmt(it.size);
        info.appendChild(nm); info.appendChild(mt);
        var a = document.createElement('a'); a.className = 'dl'; a.textContent = 'Save';
        a.href = '/api/file?room=' + room + '&id=' + it.id;
        li.appendChild(info); li.appendChild(a); ul.appendChild(li);
      });
    } catch (e) { /* offline; retry on next tick */ }
  }

  if (!room) { statusEl.textContent = 'Open this page from the link in the extension.'; }
  else { refresh(); setInterval(refresh, 3000); }
</script>
</body></html>`;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === 'OPTIONS') return send(res, 204, '');

  if (url.pathname === '/' && req.method === 'GET') {
    return send(res, 200, PHONE_PAGE, { 'Content-Type': 'text/html; charset=utf-8' });
  }

  const room = (url.searchParams.get('room') || '').toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(room)) return json(res, 400, { error: 'invalid room code' });

  // Upload a file. dir=to-pc (phone -> computer) or dir=to-phone (computer -> phone)
  if (url.pathname === '/api/upload' && req.method === 'POST') {
    const dir = url.searchParams.get('dir') === 'to-pc' ? 'to-pc' : 'to-phone';
    const chunks = [];
    let size = 0;
    let tooBig = false;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BYTES) { tooBig = true; return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (tooBig) return json(res, 413, { error: 'file too large (max 100 MB)' });
      const item = {
        id: randomUUID(),
        dir,
        name: decodeURIComponent(req.headers['x-filename'] || 'file'),
        type: req.headers['content-type'] || 'application/octet-stream',
        size,
        time: Date.now(),
        data: Buffer.concat(chunks),
      };
      itemsOf(room).push(item);
      json(res, 201, meta(item));
    });
    return;
  }

  // List files for one direction
  if (url.pathname === '/api/files' && req.method === 'GET') {
    const dir = url.searchParams.get('dir') === 'to-pc' ? 'to-pc' : 'to-phone';
    return json(res, 200, itemsOf(room).filter((i) => i.dir === dir).map(meta));
  }

  // Download one file
  if (url.pathname === '/api/file' && req.method === 'GET') {
    const item = itemsOf(room).find((i) => i.id === url.searchParams.get('id'));
    if (!item) return json(res, 404, { error: 'not found' });
    return send(res, 200, item.data, {
      'Content-Type': item.type,
      'Content-Length': item.data.length,
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(item.name)}`,
    });
  }

  // Delete one file
  if (url.pathname === '/api/file' && req.method === 'DELETE') {
    const list = itemsOf(room);
    const idx = list.findIndex((i) => i.id === url.searchParams.get('id'));
    if (idx === -1) return json(res, 404, { error: 'not found' });
    list.splice(idx, 1);
    return json(res, 200, { ok: true });
  }

  json(res, 404, { error: 'not found' });
});

// Drop expired rooms every 10 minutes (anything older than 24h)
setInterval(() => {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const [room, list] of rooms) {
    const kept = list.filter((i) => i.time > cutoff);
    if (kept.length) rooms.set(room, kept); else rooms.delete(room);
  }
}, 10 * 60 * 1000).unref();

server.listen(PORT, () => console.log(`Bridge Transfer relay on http://localhost:${PORT}`));
