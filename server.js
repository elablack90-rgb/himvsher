const express = require('express');
const fetch = require('node-fetch');
const app = express();
app.use(express.static('public'));
let cache = null;
let cacheTime = null;

async function fetchData() {
  const MONDAY_TOKEN = process.env.MONDAY_TOKEN;
  const r1 = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': MONDAY_TOKEN, 'API-Version': '2024-01' },
    body: JSON.stringify({ query: 'query { boards(ids: [18406512090]) { items_page(limit: 200) { items { id name column_values(ids: ["dropdown_mm1zvzx0","board_relation_mm1ze535"]) { id text value } } } } }' })
  });
  const d1 = await r1.json();
  const contestants = d1.data.boards[0].items_page.items;
  console.log('Contestants fetched:', contestants.length);
  const subMap = {};
  const cMap = {};
  for (const c of contestants) {
    const u = c.column_values.find(function(x) { return x.id === 'dropdown_mm1zvzx0'; });
    const rel = c.column_values.find(function(x) { return x.id === 'board_relation_mm1ze535'; });
    cMap[c.id] = { username: u && u.text ? u.text : c.name, total: 0, games: 0, wins: 0, maxSingle: 0 };
    if (rel && rel.value) {
      try {
        const parsed = JSON.parse(rel.value);
        const linkedIds = Array.isArray(parsed) ? parsed : (parsed.linkedPulseIds || []);
        for (const l of linkedIds) {
          const pid = typeof l === 'object' ? (l.linkedPulseId || l.id) : l;
          if (pid) subMap[String(pid)] = c.id;
        }
      } catch(e) { console.log('Parse error:', e.message); }
    }
  }
  console.log('Subitems mapped:', Object.keys(subMap).length);
  const ids = Object.keys(subMap);
  const batches = [];
  for (let i = 0; i < ids.length; i += 50) { batches.push(ids.slice(i, i + 50)); }
  await Promise.all(batches.map(async function(batch) {
    const r2 = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': MONDAY_TOKEN, 'API-Version': '2024-01' },
      body: JSON.stringify({ query: 'query { items(ids: [' + batch.join(',') + ']) { id column_values(ids: ["numeric_mm1h1bcz","color_mm1h1nkp"]) { id text } } }' })
    });
    const d2 = await r2.json();
    const items = d2.data && d2.data.items ? d2.data.items : [];
    for (const item of items) {
      const cId = subMap[item.id];
      if (!cId || !cMap[cId]) continue;
      const ptsCol = item.column_values.find(function(x) { return x.id === 'numeric_mm1h1bcz'; });
      const winCol = item.column_values.find(function(x) { return x.id === 'color_mm1h1nkp'; });
      const pts = parseFloat(ptsCol && ptsCol.text ? ptsCol.text : 0) || 0;
      const win = winCol && winCol.text === 'Winner';
      cMap[cId].total += pts;
      cMap[cId].games += 1;
      if (win) cMap[cId].wins += 1;
      if (pts > cMap[cId].maxSingle) cMap[cId].maxSingle = pts;
    }
  }));
  return Object.values(cMap).sort(function(a, b) { return b.total - a.total; });
}

app.get('/api/leaderboard', async function(req, res) {
  try {
    const now = Date.now();
    if (!cache || !cacheTime || (now - cacheTime) > 10 * 60 * 1000) {
      console.log('Fetching from monday...');
      cache = await fetchData();
      cacheTime = now;
      console.log('Done! Total contestants:', cache.length);
    } else {
      console.log('Serving from cache');
    }
    res.json({ success: true, data: cache, updatedAt: new Date(cacheTime).toISOString() });
  } catch(err) {
    console.error('Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(process.env.PORT || 3000, function() { console.log('Running!'); });
