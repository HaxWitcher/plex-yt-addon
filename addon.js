// addon.js
const fetch            = require('node-fetch');
const { addonBuilder } = require('stremio-addon-sdk');

// Javna CSV lista
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTe-SkouXuRu5EX8ApUjUe2mCbjHrd3OR4HJ46OH3ai2wLHwkWR5_1dIp3BDjQpq4wHgsi1_pDEeuSi/pub?output=csv';

// Lista HF space-ova za round‑robin
const STREAM_APIS = [
  'https://plex-media-yt-usluga.hf.space',
  'https://ger-user1-test-pl-dl.hf.space'
];
let rrIndex = 0;
function getNextApi() {
  const api = STREAM_APIS[rrIndex];
  rrIndex = (rrIndex + 1) % STREAM_APIS.length;
  return api;
}

// Parsira CSV, izvlači ID, title, poster i sortira po timestamp‑u
async function fetchList() {
  const res = await fetch(CSV_URL, { headers: { 'Cache-Control': 'no-cache' } });
  const txt = await res.text();

  return txt
    .trim()
    .split('\n').slice(1)
    .map(line => {
      const [ts, url, ...rest] = line.split(',');
      const clean = url.split(/[?&]/)[0];
      const m = clean.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
      if (!m) return null;

      return {
        id:     m[1],
        name:   (rest.join(',').trim() || m[1]),
        poster: `https://img.youtube.com/vi/${m[1]}/hqdefault.jpg`,
        ts:     new Date(ts),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.ts - a.ts);
}

const manifest = require('./manifest.json');
const builder  = new addonBuilder(manifest);

// === Catalog handler ===
builder.defineCatalogHandler(async ({ id }) => {
  if (id !== 'yt-sheet') {
    return { metas: [], cacheMaxAge: 0 };
  }
  const list = await fetchList();
  const metas = list.map(v => ({
    id:     v.id,
    type:   'channel',
    name:   v.name,
    poster: v.poster,
  }));

  return {
    metas,
    cacheMaxAge: 0    // svaki put čitaj iz CSV
  };
});

// === Meta handler ===
builder.defineMetaHandler(async ({ id, type }) => {
  const list  = await fetchList();
  const entry = list.find(v => v.id === id) || {};

  return {
    meta: {
      id,
      type,
      name:        entry.name   || id,
      poster:      entry.poster || `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
      description: '',
      runtime:     0
    },
    cacheMaxAge: 0    // svaki put čitaj iz CSV
  };
});

// === Stream handler ===
builder.defineStreamHandler(async ({ type, id }) => {
  if (type !== 'channel') {
    return { streams: [] };
  }

  // Round‑robin API + random query da Stremio ne kešira
  const apiBase   = getNextApi();
  const apiStream = `${apiBase}/stream/${id}?r=${Date.now()}`;
  let   streamUrl = apiStream;

  try {
    const res = await fetch(apiStream, { method: 'GET', redirect: 'manual' });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (loc) streamUrl = loc;
    }
  }
  catch (err) {
    console.warn('Stream fetch error, vraćam osnovni URL', err);
  }

  return {
    streams: [{
      title:  'YouTube 1080p',
      url:    streamUrl,
      isLive: false
    }],
    cacheMaxAge: 0    // svaki put novi poziv za load‑balancing
  };
});

module.exports = builder.getInterface();
