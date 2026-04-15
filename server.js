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
    body: JSON.stringify({ query: `query { boards(ids: [18406512090]) { items_page(limit: 200) { items { id name column_values(ids: ["dropdown_mm1zvzx0","board_relation_mm1ze535"]) { id text value } } } } }` })
  });
  const d1 = await r1.json();
  const contestants = d1.data.boards[0].items_page.items;

  const subMap = {};
  const cMap = {};

  for (const c of contestants) {
    const u = c.column_values.find(x => x.id === 'dropdown_mm1zvzx0');
    const rel = c.column_values.find(x => x.id === 'board_relation_mm1ze535');
    cMap[c.id] = { username: u?.text || c.name, total: 0, games: 0, wins: 0, maxSingle: 0 };
    if (rel?.value) {
      try {
        for (const l of (JSON.parse(rel.value).linkedPulseIds || [])) {
          subMap[String(l.linkedPulseId)] = c.id;
        }
      } catch(e) {}
    }
  }

  const ids = Object.keys(subMap);
  const batches = [];
  for (let i = 0; i < ids.length; i += 50) batches.push(ids.slice(i, i + 50));

  await Promise.all(batches.map(async (batch) => {
    const r2 = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': MONDAY_TOKEN, 'API-Version': '2024-01' },
      body: JSON.stringify({ query: `query { items(ids: [${batch.join(',')}]) { id column_values(ids: ["numeric_mm1h1bcz","color_mm1h1nkp"]) { id text } } }` })
    });
    const d2 = await r2.json();
    for (const item of (d2.data?.items || [])) {
      const cId = subMap[item.id];
      if (!cId || !cMap[cId]) continue;
      const pts = parseFloat(item.column_values.find(x => x.id === 'numeric_mm1h1bcz')?.text) || 0;
      const win = item.column_values.find(x => x.id === 'color_mm1h1nkp')?.text === 'Winner';
      cMap[cId].total += pts;
      cMap[cId].games += 1;
      if (win) cMap[cId].wins += 1;
      if (pts > cMap[cId].maxSingle) cMap[cId].maxSingle = pts;
    }
  }));

  return Object.values(cMap).sort((a, b) => b.total - a.total);
}

app.get('/api/leaderboard', async (req, res) => {
  try {
    const now = Date.now();
    if (!cache || !cacheTime || (now - cacheTime) > 10 * 60 * 1000) {
      console.log('Fetching fresh data from monday...');
      cache = await fetchData();
      cacheTime = now;
      console.log('Data cached!');
    } else {
      console.log('Serving from cache');
    }
    res.json({ success: true, data: cache, updatedAt: new Date(cacheTime).toISOString() });
  } catch (err) {
    console.error('Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(process.env.PORT || 3000, () => console.log('Running!'));
