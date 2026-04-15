const express = require('express');
const fetch = require('node-fetch');
const app = express();
app.use(express.static('public'));
let cache = null;
let cacheTime = null;

async function fetchData() {
  const TOKEN = process.env.MONDAY_TOKEN;
  const q1 = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': TOKEN, 'API-Version': '2024-01' },
    body: JSON.stringify({ query: 'query { boards(ids: [18404350365]) { items_page(limit: 500) { items { id column_values(ids: ["numeric_mm1h1bcz","color_mm1h1nkp","board_relation_mm1z90kr"]) { id text value } } } } }' })
  });
  const j1 = await q1.json();
  const items = j1.data.boards[0].items_page.items;
  console.log('Subitems fetched:', items.length);
  const cMap = {};
  for (const item of items) {
    const rel = item.column_values.find(function(x) { return x.id === 'board_relation_mm1z90kr'; });
    const pts = parseFloat((item.column_values.find(function(x) { return x.id === 'numeric_mm1h1bcz'; }) || {}).text) || 0;
    const win = ((item.column_values.find(function(x) { return x.id === 'color_mm1h1nkp'; }) || {}).text) === 'Winner';
    if (!rel || !rel.value) continue;
    try {
      const parsed = JSON.parse(rel.value);
      const linked = Array.isArray(parsed) ? parsed : (parsed.linkedPulseIds || []);
      if (!linked.length) continue;
      const pid = typeof linked[0] === 'object' ? String(linked[0].linkedPulseId || linked[0].id) : String(linked[0]);
      const name = ((item.column_values.find(function(x) { return x.id === 'board_relation_mm1z90kr'; }) || {}).text) || pid;
      if (!cMap[pid]) cMap[pid] = { username: name, total: 0, games: 0, wins: 0, maxSingle: 0 };
      cMap[pid].total += pts;
      cMap[pid].games += 1;
      if (win) cMap[pid].wins += 1;
      if (pts > cMap[pid].maxSingle) cMap[pid].maxSingle = pts;
    } catch(e) { console.log('err:', e.message); }
  }
  console.log('Contestants:', Object.keys(cMap).length);
  return Object.values(cMap).sort(function(a,b) { return b.total - a.total; });
}

app.get('/api/leaderboard', async function(req, res) {
  try {
    const now = Date.now();
    if (!cache || !cacheTime || (now - cacheTime) > 10 * 60 * 1000) {
      console.log('Fetching...');
      cache = await fetchData();
      cacheTime = now;
      console.log('Done:', cache.length);
    } else { console.log('Cache hit'); }
    res.json({ success: true, data: cache, updatedAt: new Date(cacheTime).toISOString() });
  } catch(err) {
    console.error('Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(process.env.PORT || 3000, function() { console.log('Running!'); });
