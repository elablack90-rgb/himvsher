const express = require('express');
const fetch = require('node-fetch');
const app = express();

app.use(express.static('public'));

let cache = null;
let cacheTime = null;
const CACHE_MINUTES = 10;

async function fetchLeaderboard() {
  const MONDAY_TOKEN = process.env.MONDAY_TOKEN;

  const contestantsRes = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': MONDAY_TOKEN, 'API-Version': '2024-01' },
    body: JSON.stringify({ query: `query { boards(ids: [18406512090]) { items_page(limit: 200) { items { id name column_values(ids: ["dropdown_mm1zvzx0","board_relation_mm1ze535"]) { id text value } } } } }` })
  });
  const contestantsData = await contestantsRes.json();
  const contestants = contestantsData.data.boards[0].items_page.items;

  const subitemToContestant = {};
  const contestantMap = {};

  for (const c of contestants) {
    const usernameCol = c.column_values.find(cv => cv.id === 'dropdown_mm1zvzx0');
    const relationCol = c.column_values.find(cv => cv.id === 'board_relation_mm1ze535');
    const username = usernameCol?.text || c.name;
    contestantMap[c.id] = { username, total: 0, games: 0, wins: 0, maxSingle: 0 };
    if (relationCol?.value) {
      try {
        const parsed = JSON.parse(relationCol.value);
        for (const link of (parsed.linkedPulseIds || [])) {
          subitemToContestant[String(link.linkedPulseId)] = c.id;
        }
      } catch(e) {}
    }
  }

  const allSubitemIds = Object.keys(subitemToContestant);
  const BATCH = 50;
  const batches = [];
  for (let i = 0; i < allSubitemIds.length; i += BATCH) {
    batches.push(allSubitemIds.slice(i, i + BATCH));
  }

  await Promise.all(batches.map(async (batch) => {
    const subRes = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': MONDAY_TOKEN, 'API-Version': '2024-01' },
      body: JSON.stringify({ query: `query { items(ids: [${batch.join(',')}]) { id column_values(ids: ["numeric_mm1h1bcz","color_mm1h1nk
