// addon.js
const fetch            = require('node-fetch');
const { addonBuilder } = require('stremio-addon-sdk');

// Javna CSV lista
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTe-SkouXuRu5EX8ApUjUe2mCbjHrd3OR4HJ46OH3ai2wLHwkWR5_1dIp3BDjQpq4wHgsi1_pDEeuSi/pub?output=csv';

// Round‑robin API baze
const STREAM_APIS = [
  'https://haxwitcher-yt-plex.hf.space',
  'https://haxwitcher-yt2-plex.hf.space',
  'https://haxwitcher-yt3-plex.hf.space'
];
let rrIndex = 0;
function getNextApi() {
  const api = STREAM_APIS[rrIndex];
  rrIndex = (rrIndex + 1) % STREAM_APIS.length;
  return api;
}

// Izvlači YouTube ID iz URL‑a (podržava i youtu.be linkove)
function extractId(url) {
  // uklanja sve posle videa (?si=... itd)
  const clean = url.split(/[?&]/)[0];
  const m = clean.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

// Učita CSV, parsira timestamp, title i sortira po timestamp‑u opadajuće
async function fetchList() {
  // cache‑buster kako bi uvek dohvatili najnoviji CSV
  const url = `${CSV_URL}&_=${Date.now()}`;
  const res = await fetch(url, {
    headers: { 'Cache-Control': 'no-cache' }
  });
  const txt = await res.text();
  return txt
    .trim()
    .split('\n')
    .slice(1)
    .map(line => {
      const [ts, rawUrl, ...rest] = line.split(',');
      const id    = extractId(rawUrl.trim());
      if (!id) return null;
      const title = rest.join(',').trim() || id;
      return {
        id,
        name:   title,
        poster: `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
        ts:     new Date(ts),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.ts - a.ts);  // najnoviji prvi
}

const manifest = require('./manifest.json');
const builder  = new addonBuilder(manifest);

// === Catalog handler ===
builder.defineCatalogHandler(async ({ id }) => {
  if (id !== 'yt-sheet') {
    return { metas: [] };
  }
  const list = await fetchList();
  return {
    metas: list.map(v => ({
      id:     v.id,
      type:   'channel',
      name:   v.name,
      poster: v.poster,
    }))
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
      runtime:     0,
    }
  };
});

// === Stream handler ===
builder.defineStreamHandler(async ({ type, id }) => {
  if (type !== 'channel') {
    return { streams: [] };
  }
  const youtubeUrl = `https://www.youtube.com/watch?v=${id}`;
  const base       = getNextApi();
  const apiUrl     = `${base}/stream/?url=${encodeURIComponent(youtubeUrl)}&resolution=1080`;

  return {
    streams: [{
      title:  `YouTube stream (${id})`,
      url:    apiUrl,
      isLive: false
    }]
  };
});

module.exports = builder.getInterface();
