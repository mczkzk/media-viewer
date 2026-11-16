// Runs the frontend in a normal browser without Tauri, for UI checks and e2e-verify.
// Serves public/ plus the non-Tauri /api endpoints with synthetic media data, so no real photos are needed.
// Usage: npm run dev:web  (PORT env to change the port)
const http = require('http');
const fs = require('fs');
const path = require('path');

const PUBLIC = path.join(__dirname, '..', 'public');
const PORT = Number(process.env.PORT) || 4178;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

// YEAR/EVENT structure mirroring what scanner.rs produces
// Fictional event names only; never mirror real folder names here
const events = {
  '2026': ['20260921_Autumn_Camp', '20260606_Beach_Day', '20260214_Snow_Trip', '2026_Daily'],
  '2025': ['20251108_Hiking', '20250412_Cherry_Blossoms', '2025_Daily'],
  '2024': ['20240803_Fireworks', '2024_Daily'],
};
const items = [];
for (const [year, evs] of Object.entries(events)) {
  evs.forEach((ev, ei) => {
    const n = 4 + ei * 3;
    for (let i = 0; i < n; i++) {
      const isVideo = i % 7 === 6;
      const filename = `IMG_${year}${String(ei).padStart(2, '0')}${String(i).padStart(2, '0')}.${isVideo ? 'mp4' : 'jpg'}`;
      items.push({
        path: `${year}/${ev}/${filename}`, year, event: ev, filename,
        type: isVideo ? 'video' : 'image',
        mtime: Date.UTC(+year, (12 - ei) % 12, 1 + i),
      });
    }
  });
}
// The scanner also returns files placed directly under a year folder
items.push({ path: '2025/loose_photo.jpg', year: '2025', event: '2025', filename: 'loose_photo.jpg', type: 'image', mtime: Date.UTC(2025, 6, 1) });

// Thumbnails are generated on the fly: a colored square with the filename, so nothing is stored on disk
const colors = ['#4a90d9', '#d94a6a', '#4ad98a', '#d9a84a', '#8a4ad9', '#4ad9d0'];
function placeholder(p) {
  const label = p.split('/').pop();
  const c = colors[[...p].reduce((a, ch) => a + ch.charCodeAt(0), 0) % colors.length];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="${c}"/><text x="150" y="155" font-size="22" text-anchor="middle" fill="#fff" font-family="sans-serif">${label}</text></svg>`;
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api/media') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(items));
  }
  if (url.pathname === '/api/thumbnail' || url.pathname === '/api/image') {
    res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
    return res.end(placeholder(url.searchParams.get('path') || ''));
  }
  const file = path.join(PUBLIC, url.pathname === '/' ? 'index.html' : url.pathname);
  if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404);
    return res.end();
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, '127.0.0.1', () => console.log(`mock server: http://127.0.0.1:${PORT} (${items.length} items)`));
