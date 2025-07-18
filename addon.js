// addon.js
const fetch            = require('node-fetch');
const { addonBuilder } = require('stremio-addon-sdk');

// Javna CSV lista
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTe-SkouXuRu5EX8ApUjUe2mCbjHrd3OR4HJ46OH3ai2wLHwkWR5_1dIp3BDjQpq4wHgsi1_pDEeuSi/pub?output=csv';

// Round‑robin API baze
const STREAM_APIS = [
  'http://91.99.224.143'
  // ... ostali API-ji
];
let rrIndex = 0;
function getNextApi() {
  const api = STREAM_APIS[rrIndex];
  rrIndex = (rrIndex + 1) % STREAM_APIS.length;
  return api;
}

// Izvlači YouTube ID iz URL-a, sada pokriva:
// - https://youtu.be/ID?query
// - https://www.youtube.com/watch?v=ID
// - https://www.youtube.com/shorts/ID
// - https://www.youtube.com/embed/ID
// - https://www.youtube.com/v/ID
function extractId(url) {
  try {
    const u = new URL(url.trim());
    const hostname = u.hostname.replace('www.', '');
    if (hostname === 'youtu.be') {
      return u.pathname.slice(1);
    }
    if (hostname === 'youtube.com' || hostname === 'm.youtube.com' || hostname === 'youtube-nocookie.com') {
      if (u.pathname === '/watch') {
        return u.searchParams.get('v');
      }
      const parts = u.pathname.split('/');
      // /shorts/ID
      if (parts[1] === 'shorts' || parts[1] === 'embed' || parts[1] === 'v') {
        return parts[2];
      }
    }
  } catch (e) {
    // ako URL konstruktor ne uspe, pada na regex
  }
  // fallback: pokuša da izvuče sa regexom
  const m = url.match(/(?:v=|\/embed\/|\.be\/|\/shorts\/|\/v\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

// Učita CSV, parsira timestamp, title i sortira po timestamp‑u opadajuće
async function fetchList() {
  const res = await fetch(CSV_URL);
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
      name:        entry.name || id,
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
      title:  `YouTube stream`,
      url:    apiUrl,
      isLive: false
    }]
  };
});

module.exports = builder.getInterface();
