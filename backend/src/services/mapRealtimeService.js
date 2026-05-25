const clients = new Set();

function send(res, eventName, payload) {
  res.write(`event: ${eventName}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

export function addMapRealtimeClient(req, res) {
  const companyId = String(req.query.companyId || '').trim();
  const safra = String(req.query.safra || '').trim();

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const client = { res, companyId, safra, createdAt: Date.now() };
  clients.add(client);

  send(res, 'connected', { ok: true, companyId, safra, ts: Date.now() });

  const heartbeat = setInterval(() => {
    try {
      send(res, 'ping', { ts: Date.now() });
    } catch {
      clearInterval(heartbeat);
      clients.delete(client);
    }
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(client);
  });
}

export function publishMapRealtimeEvent(event = {}) {
  const payload = {
    ...event,
    ts: Date.now(),
  };

  for (const client of clients) {
    const sameCompany = !client.companyId || !payload.companyId || String(client.companyId) === String(payload.companyId);
    const sameSafra = !client.safra || !payload.safra || String(client.safra) === String(payload.safra);
    if (!sameCompany || !sameSafra) continue;

    try {
      send(client.res, 'map-update', payload);
    } catch {
      clients.delete(client);
    }
  }
}
