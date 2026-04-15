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
  console.log('Contestants fetched:', d1.data?.boards[0]?.items_page?.items?.length);
  const contestants = d1.data.boards[0].items_page.items;
  const subMap = {};
  const cMap = {};
  for (const c of contestants) {
    const u = c.column_values.find(x => x.id === 'dropdown_mm1zvzx0');
    const rel = c.column_values.find(x => x.id === 'board_relation_mm1ze535');
    cMap[c.id] = { username: u?.text || c.name, total: 0, games: 0, wins: 0, maxSingle: 0 };
    if (rel?.value) {
      try {
        const parsed = JSON.parse(rel.value);
        console.log('Relation sample:', JSON.stringify(parsed).slice(0, 200));
        const linkedIds = parsed.linkedPulseIds || parsed.item_ids || [];
        for (const l of linkedIds) {
          const pid = typeof l === 'object' ? (l.linkedPulseId || l.id) : l;
          if (pid) subMap[String(pid)] = c.id;
        }
      } catch(e) { console.log('Parse error:', e.message); }
    }
  }
