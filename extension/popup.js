const DEFAULT_SERVER = 'http://localhost:8787';
const $ = (sel) => document.querySelector(sel);

let server = DEFAULT_SERVER;
let room = '';
let timer = null;
const seen = new Set();

function makeCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; 
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

function fmtSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function setConn(online) {
  const pill = $('#conn');
  pill.textContent = online ? 'Connected' : 'Offline';
  pill.className = 'pill ' + (online ? 'online' : 'offline');
}

function applyPairing() {
  $('#code').textContent = room;
  $('#phoneLink').href = `${server}/?room=${room}`;
  $('#server').value = server;
}

async function init() {
  const saved = await chrome.storage.local.get(['server', 'room']);
  server = saved.server || DEFAULT_SERVER;
  room = saved.room || makeCode();
  await chrome.storage.local.set({ server, room });
  applyPairing();
  startPolling();
}

function startPolling() {
  clearInterval(timer);
  refresh();
  timer = setInterval(refresh, 2500);
}

async function refresh() {
  try {
    const res = await fetch(`${server}/api/files?room=${room}&dir=to-pc`);
    if (!res.ok) throw new Error(res.status);
    renderList(await res.json());
    setConn(true);
  } catch {
    setConn(false);
  }
}

function renderList(items) {
  const list = $('#list');
  list.innerHTML = '';
  $('#count').textContent = items.length;
  $('#empty').classList.toggle('hidden', items.length > 0);

  for (const item of items.slice().reverse()) {
    const li = document.createElement('li');

    const info = document.createElement('div');
    info.className = 'item-info';
    info.innerHTML = `<div class="item-name"></div><div class="item-meta"></div>`;
    info.querySelector('.item-name').textContent = item.name;
    info.querySelector('.item-meta').textContent = `${fmtSize(item.size)} · ${fmtTime(item.time)}`;

    const actions = document.createElement('div');
    actions.className = 'item-actions';

    const save = document.createElement('button');
    save.textContent = 'Save';
    save.addEventListener('click', () => downloadItem(item));

    const del = document.createElement('button');
    del.className = 'del';
    del.textContent = '✕';
    del.title = 'Remove from server';
    del.addEventListener('click', () => deleteItem(item));

    actions.append(save, del);
    li.append(info, actions);
    list.appendChild(li);
  }
}

async function downloadItem(item) {

  const url = `${server}/api/file?room=${room}&id=${item.id}`;
  await chrome.downloads.download({ url, filename: item.name, saveAs: false }).catch(() => {
    window.open(url, '_blank');
  });
}

async function deleteItem(item) {
  await fetch(`${server}/api/file?room=${room}&id=${item.id}`, { method: 'DELETE' });
  refresh();
}


async function uploadFiles(files) {
  const bar = $('#bar');
  const text = $('#progressText');
  $('#progress').classList.remove('hidden');

  let done = 0;
  for (const file of files) {
    text.textContent = `Sending ${file.name} (${done + 1}/${files.length})`;
    bar.style.width = `${(done / files.length) * 100}%`;
    try {
      const res = await fetch(`${server}/api/upload?room=${room}&dir=to-phone`, {
        method: 'POST',
        headers: {
          'X-Filename': encodeURIComponent(file.name),
          'Content-Type': file.type || 'application/octet-stream',
        },
        body: file,
      });
      if (!res.ok) throw new Error(await res.text());
    } catch (err) {
      text.textContent = `Failed: ${file.name}`;
      bar.style.background = '#ef4444';
      return;
    }
    done++;
  }
  bar.style.width = '100%';
  text.textContent = `Sent ${done} file${done === 1 ? '' : 's'} to phone ✓`;
  bar.style.background = '';
  setTimeout(() => $('#progress').classList.add('hidden'), 2500);
}

function bindDrop() {
  const drop = $('#drop');
  const input = $('#file');

  drop.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    uploadFiles([...input.files]);
    input.value = '';
  });

  ['dragenter', 'dragover'].forEach((ev) =>
    drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); })
  );
  ['dragleave', 'drop'].forEach((ev) =>
    drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); })
  );
  drop.addEventListener('drop', (e) => {
    const files = [...e.dataTransfer.files];
    if (files.length) uploadFiles(files);
  });
}


$('#copy').addEventListener('click', async () => {
  await navigator.clipboard.writeText(room);
  $('#copy').textContent = 'Copied';
  setTimeout(() => ($('#copy').textContent = 'Copy'), 1200);
});

$('#saveServer').addEventListener('click', async () => {
  server = $('#server').value.trim().replace(/\/+$/, '') || DEFAULT_SERVER;
  await chrome.storage.local.set({ server });
  applyPairing();
  startPolling();
});

bindDrop();
init();
