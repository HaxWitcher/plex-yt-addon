// addon.js
const fetch            = require('node-fetch');
const { addonBuilder } = require('stremio-addon-sdk');

// Javna CSV lista
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTe-SkouXuRu5EX8ApUjUe2mCbjHrd3OR4HJ46OH3ai2wLHwkWR5_1dIp3BDjQpq4wHgsi1_pDEeuSi/pub?output=csv';

// Round‑robin API baze (samo jedna baza, možeš dodati više)
const STREAM_APIS = [
  'https://plex-media-yt-usluga.hf.space/stream'
];
let rrIndex = 0;
function getNextApi() {
  const api = STREAM_APIS[rrIndex];
  rrIndex = (rrIndex + 1) % STREAM_APIS.length;
  return api;
}

// Izvlači YouTube ID iz URL-a (podržava i ?si=...)
function extractId(rawUrl) {
  const clean = rawUrl.split(/[?&]/)[0];
  const m = clean.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

// Učita CSV, parsira i sortira po timestamp-u opadajuće
async function fetchList() {
  const res = await fetch(CSV_URL, { headers: { 'Cache-Control': 'no-cache' } });
  const txt = await res.text();
  return txt
    .trim()
    .split('\n')
    .slice(1)
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
builder.defineCatalogHandler(async ({ id }) => {
  if (id !== 'yt-sheet') {
    return { metas: [], cacheMaxAge: 0 };
  }
  const list = await fetchList();
  return {
    metas: list.map(v => ({
      id:     v.id,
      type:   'channel',
      name:   v.name,
      poster: v.poster,
    })),
    cacheMaxAge: 0    // svaki put sveži podaci iz CSV
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

  const base      = getNextApi();         // npr. https://plex-media-yt-usluga.hf.space/stream
  const streamUrl = `${base}/${id}`;      // npr. .../stream/X9WXyeMBYc

  return {
    streams: [{
      title:  `YouTube 1080p`,
      url:    streamUrl,
      isLive: false
    }]
  };
});

module.exports = builder.getInterface();
