// addon.js
const fetch            = require('node-fetch');
const { addonBuilder } = require('stremio-addon-sdk');

// Javna CSV lista
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTe-SkouXuRu5EX8ApUjUe2mCbjHrd3OR4HJ46OH3ai2wLHwkWR5_1dIp3BDjQpq4wHgsi1_pDEeuSi/pub?output=csv';

// Round‑robin API baze (sada samo jedna, možeš dodati više)
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

// In‑memory keš za stream URL‑ove
const streamCache = new Map();

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
    cacheMaxAge: 0   // uvek osveži pri svakom otvaranju katalog
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
    }
  };
});

// === Stream handler ===
builder.defineStreamHandler(async ({ type, id }) => {
  if (type !== 'channel') {
    return { streams: [] };
  }

  // Ako imamo keširanu URL za ovaj ID, vratimo je odmah
  if (streamCache.has(id)) {
    return {
      streams: [{
        title:  'YouTube 1080p',
        url:    streamCache.get(id),
        isLive: false
      }],
      cacheMaxAge: 3600  // keširaj 1h na strani klijenta
    };
  }

  // Prvi put: generišemo stream URL
  const apiBase   = getNextApi();
  const apiStream = `${apiBase}/stream/${id}`;
  let   streamUrl = apiStream;

  try {
    const res = await fetch(apiStream, { method: 'GET', redirect: 'manual' });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (loc) streamUrl = loc;
    }
  }
  catch (err) {
    console.warn('Stream fetch error, vraćam osnovni API URL', err);
  }

  // Keširaj rezultat za naredne pozive
  streamCache.set(id, streamUrl);

  return {
    streams: [{
      title:  'YouTube 1080p',
      url:    streamUrl,
      isLive: false
    }],
    cacheMaxAge: 3600
  };
});

module.exports = builder.getInterface();
