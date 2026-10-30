const SPEED_HOST = 'https://speed.cloudflare.com';
const DOWNLOAD_BYTES = 10_000_000; 
const UPLOAD_BYTES = 2_000_000;    

const $speed = (id) => document.getElementById(id);

function setSpeedStatus(text) {
  $speed('speedStatus').textContent = text;
}

function showSpeedResult({ ping, down, up, time }) {
  $speed('speedPing').textContent = `${ping} ms`;
  $speed('speedDown').textContent = `${down.toFixed(1)} Mbps`;
  $speed('speedUp').textContent = `${up.toFixed(1)} Mbps`;
  const when = new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  setSpeedStatus(`Last test at ${when}`);
}


async function measurePing() {
  const times = [];
  for (let i = 0; i < 3; i++) {
    const start = performance.now();
    await fetch(`${SPEED_HOST}/__down?bytes=0&r=${Math.random()}`, { cache: 'no-store' });
    times.push(performance.now() - start);
  }
  return Math.round(Math.min(...times));
}


async function measureDownload() {
  const start = performance.now();
  const res = await fetch(`${SPEED_HOST}/__down?bytes=${DOWNLOAD_BYTES}&r=${Math.random()}`, { cache: 'no-store' });
  const buffer = await res.arrayBuffer();
  const secs = (performance.now() - start) / 1000;
  return (buffer.byteLength * 8) / secs / 1_000_000;
}


async function measureUpload() {
  const data = new Uint8Array(UPLOAD_BYTES);
  const start = performance.now();
  await fetch(`${SPEED_HOST}/__up`, { method: 'POST', body: data, cache: 'no-store' });
  const secs = (performance.now() - start) / 1000;
  return (UPLOAD_BYTES * 8) / secs / 1_000_000;
}

async function runSpeedTest() {
  const btn = $speed('speedBtn');
  btn.disabled = true;
  btn.textContent = 'Testing…';

  try {
    setSpeedStatus('Checking ping…');
    const ping = await measurePing();

    setSpeedStatus('Testing download…');
    const down = await measureDownload();

    setSpeedStatus('Testing upload…');
    const up = await measureUpload();

    const result = { ping, down, up, time: Date.now() };
    showSpeedResult(result);
    await chrome.storage.local.set({ lastSpeed: result });
  } catch (err) {
    console.error('Speed test failed:', err);
    setSpeedStatus('Test failed. Check your internet connection and try again.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Run test';
  }
}

$speed('speedBtn').addEventListener('click', runSpeedTest);


chrome.storage.local.get('lastSpeed').then(({ lastSpeed }) => {
  if (lastSpeed) showSpeedResult(lastSpeed);
});