// addon.js
const fetch            = require('node-fetch');
const { addonBuilder } = require('stremio-addon-sdk');

// Javna CSV lista
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTe-SkouXuRu5EX8ApUjUe2mCbjHrd3OR4HJ46OH3ai2wLHwkWR5_1dIp3BDjQpq4wHgsi1_pDEeuSi/pub?output=csv';

// Round‑robin API baze
const STREAM_APIS = [
  'https://plex-yt-dl-plex-yt.hf.space'
];
let rrIndex = 0;
function getNextApi() {
  const api = STREAM_APIS[rrIndex];
  rrIndex = (rrIndex + 1) % STREAM_APIS.length;
  return api;
}

// Izvlači YouTube ID iz URL-a
function extractId(rawUrl) {
  const clean = rawUrl.split(/[?&]/)[0];
  const m = clean.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

// Učita CSV, parsira i sortira
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

  // GET zahtev bez automatskog redirectovanja
  let streamUrl = apiUrl;
  try {
    const res = await fetch(apiUrl, {
      method:   'GET',
      redirect: 'manual'
    });
    // uhvati 3xx redirect i uzmi pravi GoogleVideo URL
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (loc) {
        streamUrl = loc;
      }
    }
  }
  catch (err) {
    console.warn('Ne mogu dohvatiti redirect, vraćam original API URL', err);
  }

  return {
    streams: [{
      title:  `YouTube 1080p`,
      url:    streamUrl,
      isLive: false
    }]
  };
});

module.exports = builder.getInterface();
