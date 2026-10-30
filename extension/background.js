const TICK_ALARM = 'screen-time-tick';
const KEEP_DAYS = 30;
const IDLE_SECONDS = 60;

const dayKey = (date = new Date()) => date.toLocaleDateString('en-CA');

function domainOf(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}


async function currentDomain() {
  if ((await chrome.idle.queryState(IDLE_SECONDS)) !== 'active') return null;
  const win = await chrome.windows.getLastFocused();
  if (!win.focused) return null;
  const [tab] = await chrome.tabs.query({ active: true, windowId: win.id });
  return tab ? domainOf(tab.url || '') : null;
}


async function flush(now, nextDomain, discard) {
  const { current, screenTime = {} } = await chrome.storage.local.get(['current', 'screenTime']);

  if (!discard && current?.domain) {
    const secs = Math.floor((now - current.since) / 1000);
    if (secs > 0) {
      const day = (screenTime[dayKey()] ??= {});
      day[current.domain] = (day[current.domain] || 0) + secs;
    }
  }

  
  const cutoff = dayKey(new Date(now - KEEP_DAYS * 86400000));
  for (const key of Object.keys(screenTime)) {
    if (key < cutoff) delete screenTime[key];
  }

  await chrome.storage.local.set({
    screenTime,
    current: nextDomain ? { domain: nextDomain, since: now } : null,
  });
  return screenTime;
}

function fmtShort(secs) {
  if (secs < 60) return '<1m';
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  return `${Math.floor(secs / 3600)}h`;
}

async function setBadge(domain, screenTime) {
  if (!domain) {
    await chrome.action.setBadgeText({ text: '' });
    return;
  }
  const secs = screenTime[dayKey()]?.[domain] || 0;
  await chrome.action.setBadgeBackgroundColor({ color: '#6366f1' });
  await chrome.action.setBadgeText({ text: fmtShort(secs) });
}


let chain = Promise.resolve();
function sync({ discard = false } = {}) {
  chain = chain
    .then(async () => {
      const now = Date.now();
      let domain = null;
      try { domain = await currentDomain(); } catch {  }
      const screenTime = await flush(now, domain, discard);
      await setBadge(domain, screenTime);
    })
    .catch(console.error);
  return chain;
}

function startUp(discard) {
  chrome.alarms.create(TICK_ALARM, { periodInMinutes: 1 });
  chrome.idle.setDetectionInterval(IDLE_SECONDS);
  sync({ discard });
}

chrome.runtime.onInstalled.addListener(() => startUp(true));
chrome.runtime.onStartup.addListener(() => startUp(true));

chrome.tabs.onActivated.addListener(() => sync());
chrome.tabs.onUpdated.addListener((_id, info) => {
  if (info.url || info.status === 'complete') sync();
});
chrome.windows.onFocusChanged.addListener(() => sync());
chrome.idle.onStateChanged.addListener(() => sync());
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === TICK_ALARM) sync();
});