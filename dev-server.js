const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.PORT || '8080', 10);
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.mp4':  'video/mp4',
  '.mp3':  'audio/mpeg',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
  '.ico':  'image/x-icon',
};

const sseClients = new Set();

function sendEvent(eventName, data) {
  const payload = typeof data === 'string' ? data : JSON.stringify(data || {});
  for (const res of sseClients) {
    try {
      res.write(`event: ${eventName}\ndata: ${payload}\n\n`);
    } catch (_) {
      try { res.end(); } catch (_) {}
      sseClients.delete(res);
    }
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1e6) { req.socket.destroy(); reject(new Error('too large')); }
    });
    req.on('end', () => resolve(body));
  });
}

function serveStatic(req, res) {
  let filePath = path.join(ROOT, req.url.split('?')[0]);
  if (filePath.endsWith('/')) filePath = path.join(filePath, 'index.html');

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    const headers = { 'Content-Type': mime, 'Content-Length': stat.size };

    if (ext === '.mp4' || ext === '.mp3') {
      const range = req.headers.range;
      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${stat.size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': end - start + 1,
          'Content-Type': mime,
        });
        fs.createReadStream(filePath, { start, end }).pipe(res);
        return;
      }
      headers['Accept-Ranges'] = 'bytes';
    }

    res.writeHead(200, headers);
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    return res.end();
  }

  // SSE stream
  if (req.url === '/api/controller/ui/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.write(': connected\n\n');
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    return;
  }

  // Trigger home / scenario control
  if (req.method === 'POST' && req.url === '/api/controller/ui/home') {
    const body = await readBody(req);
    let payload = {};
    try { if (body) payload = JSON.parse(body); } catch (_) {}
    sendEvent('home', typeof payload === 'object' ? payload : {});
    console.log('[SSE] home event sent:', JSON.stringify(payload));
    res.writeHead(204);
    return res.end();
  }

  // AAP launch mock
  const aapMatch = req.url.match(/^\/api\/controller\/aap\/launch\/(\d+)\/?$/);
  if (req.method === 'POST' && aapMatch) {
    console.log(`[AAP mock] Job Template ${aapMatch[1]} launch requested (no-op locally)`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ mock: true, job_template: aapMatch[1] }));
  }

  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`SCUI dev server running at http://localhost:${PORT}`);
  console.log('');
  console.log(`  Main screen:  http://localhost:${PORT}/`);
  console.log(`  Podium:       http://localhost:${PORT}/podium/`);
  console.log('');
  console.log('  SSE endpoint:  /api/controller/ui/events');
  console.log('  Home trigger:  POST /api/controller/ui/home');
  console.log('  AAP mock:      POST /api/controller/aap/launch/{id}/');
});
