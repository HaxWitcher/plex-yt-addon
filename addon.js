// addon.js
const fetch            = require('node-fetch');
const { addonBuilder } = require('stremio-addon-sdk');
const manifest         = require('./manifest.json');

// 1) Google Sheets CSV
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTe-SkouXuRu5EX8ApUjUe2mCbjHrd3OR4HJ46OH3ai2wLHwkWR5_1dIp3BDjQpq4wHgsi1_pDEeuSi/pub?output=csv';

// 2) Više HF space-ova za round‑robin
const STREAM_APIS = [
  'https://plex-media-yt-usluga.hf.space'
];
let rrIndex = 0;
function getNextApi() {
  const api = STREAM_APIS[rrIndex];
  rrIndex = (rrIndex + 1) % STREAM_APIS.length;
  return api;
}

// 3) Učitavanje i parsiranje CSV u listu videa
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

const builder = new addonBuilder(manifest);

// === Catalog handler ===
builder.defineCatalogHandler(async ({ id }) => {
  if (id !== 'yt-sheet') {
    return { metas: [], cacheMaxAge: 0 };
  }
  const list = await fetchList();
  return {
    metas:       list.map(v => ({
      id:     v.id,
      type:   'channel',
      name:   v.name,
      poster: v.poster,
    })),
    cacheMaxAge: 0    // svaki put novi fetch
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
    cacheMaxAge: 0    // svaki put novi fetch
  };
});

// === Stream handler ===
builder.defineStreamHandler(({ type, id }) => {
  if (type !== 'channel') {
    return { streams: [], cacheMaxAge: 0 };
  }

  const base      = getNextApi();
  const streamUrl = `${base}/stream/${id}`;  // tačno ovakav format

  return {
    streams: [{
      title:  'YouTube 1080p',
      url:    streamUrl,
      isLive: false
    }],
    cacheMaxAge: 0    // svaki put novi poziv
  };
});

module.exports = builder.getInterface();
