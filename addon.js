// addon.js
const fetch            = require('node-fetch');
const { addonBuilder } = require('stremio-addon-sdk');

// Javna CSV lista
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTe-SkouXuRu5EX8ApUjUe2mCbjHrd3OR4HJ46OH3ai2wLHwkWR5_1dIp3BDjQpq4wHgsi1_pDEeuSi/pub?output=csv';

// Round‑robin API baze (možeš dodati koliko god želiš)
const STREAM_APIS = [
  'https://plex-media-yt-usluga.hf.space',
  'https://ger-user1-test-pl-dl.hf.space',
  'https://ger-user2-test-pl-dl.hf.space'
];
let rrIndex = 0;
function getNextApi() {
  const api = STREAM_APIS[rrIndex];
  rrIndex = (rrIndex + 1) % STREAM_APIS.length;
  return api;
}

// Izvlači YouTube ID iz bilo kog YouTube URL‑a
function extractId(rawUrl) {
  const clean = rawUrl.split(/[?&]/)[0];
  const m = clean.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

// Učita CSV, parsira timestamp, title i sortira po timestamp‑u opadajuće
async function fetchList() {
  const res = await fetch(CSV_URL, { headers: { 'Cache-Control': 'no-cache' } });
  const txt = await res.text();
  return txt
    .trim()
    .split('\n').slice(1)
    .map(line => {
      const [ts, url, ...rest] = line.split(',');
      const id    = extractId(url);
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
    .sort((a, b) => b.ts - a.ts);
}

const manifest = require('./manifest.json');
const builder  = new addonBuilder(manifest);

// === Catalog handler ===
// Svaki put čita iz CSV i odmah vraća najnoviji sadržaj
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
    cacheMaxAge: 0
  };
});

// === Meta handler ===
// Prikazuje title iz CSV umesto samog ID‑ja
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
    }
  };
});

// === Stream handler ===
// Svaki korisnik prvo dobije stream sa getNextApi() (round‑robin),
// URL se gradi kao BASE/stream/ID
builder.defineStreamHandler(async ({ type, id }) => {
  if (type !== 'channel') {
    return { streams: [], cacheMaxAge: 0 };
  }
  const base      = getNextApi();
  const streamUrl = `${base}/stream/${id}`;
  return {
    streams: [{
      title:  'YouTube 1080p',
      url:    streamUrl,
      isLive: false
    }],
    cacheMaxAge: 0
  };
});

module.exports = builder.getInterface();
