// Minimal SSE server for UI control
const http = require('http');

/** @type {Set<import('http').ServerResponse>} */
const sseClients = new Set();

function sendEvent(eventName, data) {
  const payload = typeof data === 'string' ? data : JSON.stringify(data || {});
  for (const res of sseClients) {
    try {
      res.write(`event: ${eventName}\n`);
      res.write(`data: ${payload}\n\n`);
    } catch (e) {
      // drop broken client
      try { res.end(); } catch {}
      sseClients.delete(res);
    }
  }
}

const server = http.createServer((req, res) => {
  if (req.url === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    res.write(': connected\n\n');
    sseClients.add(res);
    req.on('close', () => {
      sseClients.delete(res);
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/home') {
    // Parse optional JSON body to forward scenario
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 1e6) req.socket.destroy(); });
    req.on('end', () => {
      let payload = {};
      try { if (body) payload = JSON.parse(body); } catch {}
      sendEvent('home', payload && typeof payload === 'object' ? payload : {});
      res.writeHead(204);
      res.end();
    });
    return;
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(3000, '127.0.0.1', () => {
  console.log('UI SSE server listening on http://127.0.0.1:3000');
});


