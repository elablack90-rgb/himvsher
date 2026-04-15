const express = require('express');
const fetch = require('node-fetch');
const app = express();
app.use(express.static('public'));
let cache = null;
let cacheTime = null;

async function fetchData() {
  const TOKEN = process.env.MONDAY_TOKEN;
  const res = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': TOKEN, 'API-Version': '2024-01' },
    body: JSON.stringify({ query: 'query { boards(ids: [18404350365]) { items_page(limit: 500) { items { id name column_values(ids: ["numeric_mm1h1bcz","color_mm1h1nkp"]) { id text } } } } }' })
  });
  const json = await res.json();
  const items = json.data.boards[0].items_page.items;
  console.log('Items fetched:', items.length);
  const cMap = {};
  for (const item of items) {
    const name = item.name;
    const pts = parseFloat((item.column_values.find(function(x){return x.id==='numeric_mm1h1bcz';})||{}).text)||0;
    const win = ((item.column_values.find(function(x){return x.id==='color_mm1h1nkp';})||{}).text)==='Winner';
    if (!cMap[name]) cMap[name] = { username: name, total: 0, games: 0, wins: 0, maxSingle: 0 };
    cMap[name].total += pts;
    cMap[name].games += 1;
    if (win) cMap[name].wins += 1;
    if (pts > cMap[name].maxSingle) cMap[name].maxSingle = pts;
  }
  console.log('Contestants:', Object.keys(cMap).length);
  return Object.values(cMap).sort(function(a,b){return b.total-a.total;});
}

app.get('/api/leaderboard', async function(req, res) {
  try {
    const now = Date.now();
    if (!cache || !cacheTime || (now - cacheTime) > 10 * 60 * 1000) {
      console.log('Fetching...');
      cache = await fetchData();
      cacheTime = now;
      console.log('Cached:', cache.length);
    } else { console.log('From cache'); }
    res.json({ success: true, data: cache, updatedAt: new Date(cacheTime).toISOString() });
  } catch(err) {
    console.error('Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(process.env.PORT || 3000, function() { console.log('Running!'); });
