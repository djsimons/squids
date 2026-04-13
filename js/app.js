// ── DATA ──────────────────────────────────────────────────────────────────
const DATA = { players: [], stats: [], logs: [] };
const AKA = { 'Gomez': 'AlmonteJ', 'DeBoer': 'SimonsK' };
const POS_COLS = ['pos_P','pos_C','pos_1B','pos_2B','pos_3B','pos_SS','pos_LF','pos_LC','pos_RC','pos_RF','pos_DH'];
const POS_LABELS = { pos_P:'P', pos_C:'C', pos_1B:'1B', pos_2B:'2B', pos_3B:'3B', pos_SS:'SS', pos_LF:'LF', pos_LC:'LC', pos_RC:'RC', pos_RF:'RF', pos_DH:'DH' };

async function loadData() {
  const [p, s, l] = await Promise.all([
    fetch('data/players.json').then(r => r.json()),
    fetch('data/season_stats.json').then(r => r.json()),
    fetch('data/game_logs.json').then(r => r.json()),
  ]);
  DATA.players = p;
  DATA.stats = s;
  DATA.logs = l;
  DATA.maxSeason = Math.max(...s.map(r => r.season_sort));
}

function getPlayer(id) { return DATA.players.find(p => p.id === id); }
function displayName(id) {
  const p = getPlayer(id);
  return p ? `${p.first} ${p.last}` : id;
}

// Box score nulls -> 0 (counting stats only; ratios keep '—')
function fmtBox(val) {
  if (val === null || val === undefined) return '0';
  return Number(val).toFixed(0);
}
function fmtStat(val, decimals = 0) {
  if (val === null || val === undefined) return '—';
  return Number(val).toFixed(decimals);
}
function fmtBA(val) {
  if (val === null || val === undefined) return '—';
  return Number(val).toFixed(3).replace(/^0\./, '.');
}
function fmtRV(val, d = 1) {
  if (val === null || val === undefined) return '—';
  return Number(val).toFixed(d);
}
function seasonLabel(sort) {
  const year = Math.floor(sort);
  return (Math.round((sort - year) * 10) === 1 ? 'Spring ' : 'Fall ') + year;
}
function seasonShort(sort) {
  const year = Math.floor(sort);
  const yy = String(year).slice(2);
  return (Math.round((sort - year) * 10) === 1 ? 'Sp' : 'Fa') + yy;
}

// ── ROUTING ───────────────────────────────────────────────────────────────
function navigate(route, param = null) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('nav a[data-route]').forEach(a => a.classList.toggle('active', a.dataset.route === route));
  window.scrollTo(0, 0);
  const h = { home: showHome, players: showPlayers, seasons: showSeasons, gamelogs: showGameLogs, records: showRecords, current: showCurrent };
  if (route === 'profile' && param) showProfile(param);
  else if (h[route]) h[route]();
}

// ── HOME ──────────────────────────────────────────────────────────────────
function showHome() {
  document.getElementById('page-home').classList.add('active');
  const totals = computeAllCareerTotals();
  const entries = Object.entries(totals);
  const qual = entries.filter(([,t]) => t.AB >= 50);
  const byHR  = [...entries].sort((a,b)=>b[1].HR-a[1].HR)[0];
  const byRBI = [...entries].sort((a,b)=>b[1].RBI-a[1].RBI)[0];
  const byBA  = [...qual].sort((a,b)=>(b[1].H/b[1].AB)-(a[1].H/a[1].AB))[0];
  const byRV  = [...entries].sort((a,b)=>b[1].RV-a[1].RV)[0];
  document.getElementById('home-leaders').innerHTML = [
    ['Career HR Leader', byHR[0], byHR[1].HR],
    ['Career RBI Leader', byRBI[0], byRBI[1].RBI],
    ['Career BA Leader', byBA[0], fmtBA(byBA[1].H/byBA[1].AB)],
    ['Career RV Leader', byRV[0], fmtRV(byRV[1].RV)],
  ].map(([stat,id,val]) => `
    <div class="card" onclick="navigate('profile','${id}')" style="cursor:pointer">
      <div class="card-title">${stat}</div>
      <div style="font-family:var(--font-blade);font-size:1.5rem;color:var(--sky)">${val}</div>
      <div style="font-size:0.85rem;color:var(--text-dim);margin-top:0.2rem">${displayName(id)}</div>
    </div>`).join('');

  const latest = [...DATA.logs].sort((a,b) => b.date.localeCompare(a.date)||b.game_num-a.game_num)[0];
  if (latest) {
    const rows = DATA.logs.filter(l=>l.date===latest.date&&l.game_num===latest.game_num).sort((a,b)=>a.batting_order-b.batting_order);
    document.getElementById('home-recent').innerHTML =
      `<div class="section-title">Most Recent Game — ${latest.date} vs ${latest.opponent}</div>${buildBoxTable(rows,false)}`;
  }
}

// ── PLAYERS ───────────────────────────────────────────────────────────────
function showPlayers() {
  document.getElementById('page-players').classList.add('active');
  renderRoster();
}

function renderRoster(filter='', gender='all') {
  let players = [...DATA.players];
  if (filter) {
    const q = filter.toLowerCase();
    players = players.filter(p => (p.first+' '+p.last+p.id).toLowerCase().includes(q));
  }
  if (gender !== 'all') players = players.filter(p => p.gender === gender);
  players.sort((a,b) => a.last.localeCompare(b.last));

  const active = new Set(DATA.stats.filter(s=>s.season_sort===DATA.maxSeason).map(s=>s.player_id));
  const sums = {};
  DATA.stats.forEach(s => {
    if (!sums[s.player_id]) sums[s.player_id] = {AB:0,H:0,HR:0,RBI:0,seasons:[]};
    const sm = sums[s.player_id];
    sm.AB+=s.AB||0; sm.H+=s.H||0; sm.HR+=s.HR||0; sm.RBI+=s.RBI||0;
    sm.seasons.push(s.season_sort);
  });

  document.getElementById('roster-grid').innerHTML = players.map(p => {
    const sm = sums[p.id];
    const isActive = active.has(p.id);
    let rangeStr='', statsStr='';
    if (sm && sm.seasons.length>0) {
      const lo=Math.min(...sm.seasons), hi=Math.max(...sm.seasons);
      rangeStr = lo===hi ? seasonShort(lo) : `${seasonShort(lo)}–${seasonShort(hi)}`;
      const ba = sm.AB>=10 ? fmtBA(sm.H/sm.AB) : '—';
      statsStr = `H:${sm.H} · HR:${sm.HR} · RBI:${sm.RBI} · BA:${ba}`;
    }
    return `<div class="roster-card" onclick="navigate('profile','${p.id}')">
      <div class="roster-avatar">🦑</div>
      <div style="min-width:0">
        <div class="roster-name">${p.first} ${p.last}</div>
        <div class="roster-sub">
          ${isActive?'<span class="badge badge-current">Active</span> ':''}
          <span class="badge badge-${p.gender.toLowerCase()}">${p.gender}</span>
          ${rangeStr?`<span style="color:var(--text-muted);font-size:0.72rem;margin-left:0.3rem">${rangeStr}</span>`:''}
          ${statsStr?`<div style="font-size:0.72rem;color:var(--text-muted);margin-top:0.15rem">${statsStr}</div>`:'<div style="font-size:0.72rem;color:var(--text-muted);margin-top:0.15rem">No stats yet</div>'}
        </div>
      </div>
    </div>`;
  }).join('') || '<div class="empty-state">No players found</div>';
}

// ── PROFILE ───────────────────────────────────────────────────────────────
function showProfile(id) {
  const page = document.getElementById('page-profile');
  page.classList.add('active');
  const player = getPlayer(id);
  if (!player) { page.innerHTML='<div class="container"><p>Player not found.</p></div>'; return; }

  const pStats = DATA.stats.filter(s=>s.player_id===id).sort((a,b)=>a.season_sort-b.season_sort);
  const pLogs  = DATA.logs.filter(l=>l.player_id===id).sort((a,b)=>b.date.localeCompare(a.date)||b.game_num-a.game_num);
  const career = computeCareerTotals(pStats);
  const hasPit = pStats.some(s=>s.pit_IP&&s.pit_IP>0);
  const akaStr = AKA[id] ? `Also appeared as: ${AKA[id]}` : '';

  // Positions
  const posGames = {};
  POS_COLS.forEach(pos => {
    const n = pStats.reduce((s,r)=>s+(r[pos]||0),0);
    if (n>0) posGames[pos]=n;
  });
  const sortedPos = Object.entries(posGames).sort((a,b)=>b[1]-a[1]);
  const primary = sortedPos[0]?.[0];
  const posDisplay = sortedPos.filter(([pos,n])=>pos===primary||n>=10).map(([pos])=>POS_LABELS[pos]).join('/');

  // Season range
  const nS = pStats.length;
  let rangeStr = '';
  if (nS>0) {
    const lo=pStats[0].season_sort, hi=pStats[nS-1].season_sort;
    rangeStr = lo===hi ? seasonLabel(lo) : `${seasonShort(lo)}–${seasonShort(hi)}`;
  }
  const isActive = pStats.some(s=>s.season_sort===DATA.maxSeason);

  page.innerHTML = `
    <div class="profile-header">
      <a class="back-btn" onclick="navigate('players')">← All Players</a>
    </div>
    <div class="profile-header" style="padding-top:0.5rem;gap:1.5rem;align-items:center">
      <div class="profile-photo">🦑</div>
      <div class="profile-info">
        <h2 class="blade-name">${player.first} ${player.last}</h2>
        ${akaStr?`<div class="aka">${akaStr}</div>`:''}
        <div class="profile-meta" style="margin-top:0.5rem;gap:0.75rem;flex-wrap:wrap;align-items:center">
          ${isActive?'<span class="badge badge-current">Active</span>':''}
          <span style="color:var(--text-dim);font-size:0.85rem">${player.gender} · Bats ${player.bat} · Throws ${player.throw}</span>
          ${posDisplay?`<span style="color:var(--sky);font-family:var(--font-display);font-weight:700;letter-spacing:0.08em">${posDisplay}</span>`:''}
          ${nS>0?`<span style="color:var(--text-dim);font-size:0.85rem"><strong style="color:var(--text)">${nS}</strong> season${nS!==1?'s':''} · ${rangeStr}</span>`:''}
        </div>
      </div>
    </div>
    <div class="container">
      ${pStats.length===0 ? `<div class="empty-state">No official stats yet — Spring 2026 in progress!</div>` : `
        <div class="tabs">
          <button class="tab-btn active" onclick="switchTab(this,'tab-seasons')">By Season</button>
          ${pLogs.length>0?`<button class="tab-btn" onclick="switchTab(this,'tab-gamelogs')">Game Log</button>`:''}
        </div>
        <div id="tab-seasons" class="tab-panel active">
          <div class="table-wrap"><table>
            <thead><tr>
              <th style="text-align:left">Season</th>
              <th>G</th><th>AB</th><th>H</th><th>HR</th><th>RBI</th><th>R</th>
              <th>2B</th><th>3B</th><th>BB</th>
              <th>BA</th><th>OBP</th><th>SLG</th><th>OPS</th>
              <th>RV</th><th>MVP</th>
              ${hasPit?'<th>IP</th><th>W</th><th>L</th><th>RIP</th>':''}
            </tr></thead>
            <tbody>
              ${pStats.map(s=>`<tr>
                <td style="text-align:left;white-space:nowrap">${s.season_label}</td>
                <td>${fmtStat(s.G)}</td><td>${fmtStat(s.AB)}</td><td>${fmtStat(s.H)}</td>
                <td>${fmtStat(s.HR)}</td><td>${fmtStat(s.RBI)}</td><td>${fmtStat(s.R)}</td>
                <td>${fmtStat(s.dbl)}</td><td>${fmtStat(s.trp)}</td><td>${fmtStat(s.BB)}</td>
                <td>${fmtBA(s.BA)}</td><td>${fmtBA(s.OBP)}</td><td>${fmtBA(s.SLG)}</td><td>${fmtBA(s.OPS)}</td>
                <td>${fmtRV(s.RV)}</td>
                <td>${s.MVP!=null?Number(s.MVP).toFixed(1):'—'}</td>
                ${hasPit?`<td>${fmtStat(s.pit_IP,1)}</td><td>${fmtStat(s.pit_W)}</td><td>${fmtStat(s.pit_L)}</td><td>${s.RIP!=null?Number(s.RIP).toFixed(2):'—'}</td>`:''}
              </tr>`).join('')}
              <tr style="border-top:2px solid var(--border-bright);background:var(--surface)">
                <td style="text-align:left;color:var(--sky);font-family:var(--font-display);font-weight:700;letter-spacing:0.06em">CAREER</td>
                <td>${career.G}</td><td>${career.AB}</td><td>${career.H}</td>
                <td>${career.HR}</td><td>${career.RBI}</td><td>${career.R}</td>
                <td>${career.dbl}</td><td>${career.trp}</td><td>${career.BB}</td>
                <td>${fmtBA(career.BA)}</td><td>${fmtBA(career.OBP)}</td><td>${fmtBA(career.SLG)}</td><td>${fmtBA(career.OPS)}</td>
                <td>${fmtRV(career.RV)}</td><td>—</td>
                ${hasPit?`<td>${fmtStat(career.pit_IP,1)}</td><td>${career.pit_W}</td><td>${career.pit_L}</td><td>${career.pit_IP>0?Number(career.pit_RA/career.pit_IP).toFixed(2):'—'}</td>`:''}
              </tr>
            </tbody>
          </table></div>
        </div>
        ${pLogs.length>0?`<div id="tab-gamelogs" class="tab-panel">${buildBoxTable(pLogs,true)}</div>`:''}
      `}
    </div>`;
}

function buildBoxTable(rows, showDateOpp=true) {
  return `<div class="table-wrap"><table>
    <thead><tr>
      ${showDateOpp
        ? '<th style="text-align:left">Date</th><th style="text-align:left">Opp</th>'
        : '<th style="text-align:left">Player</th>'}
      <th>AB</th><th>R</th><th>H</th><th>RBI</th><th>2B</th><th>3B</th><th>HR</th><th>BB</th><th>RV</th>
    </tr></thead>
    <tbody>
      ${rows.map(l=>`<tr>
        ${showDateOpp
          ? `<td style="text-align:left">${l.date}</td><td style="text-align:left">${l.opponent||'—'}</td>`
          : `<td style="text-align:left"><a onclick="navigate('profile','${l.player_id}')" style="cursor:pointer">${displayName(l.player_id)}</a></td>`}
        <td>${fmtBox(l.AB)}</td><td>${fmtBox(l.R)}</td><td>${fmtBox(l.H)}</td>
        <td>${fmtBox(l.RBI)}</td><td>${fmtBox(l.dbl)}</td><td>${fmtBox(l.trp)}</td>
        <td>${fmtBox(l.HR)}</td><td>${fmtBox(l.BB)}</td>
        <td>${fmtRV(l.RV,2)}</td>
      </tr>`).join('')}
    </tbody>
  </table></div>`;
}

function computeCareerTotals(stats) {
  const t={G:0,AB:0,H:0,HR:0,RBI:0,R:0,dbl:0,trp:0,BB:0,RV:0,pit_W:0,pit_L:0,pit_IP:0,pit_RA:0};
  stats.forEach(s=>{
    t.G+=s.G||0; t.AB+=s.AB||0; t.H+=s.H||0; t.HR+=s.HR||0; t.RBI+=s.RBI||0;
    t.R+=s.R||0; t.dbl+=s.dbl||0; t.trp+=s.trp||0; t.BB+=s.BB||0; t.RV+=s.RV||0;
    t.pit_W+=s.pit_W||0; t.pit_L+=s.pit_L||0; t.pit_IP+=s.pit_IP||0; t.pit_RA+=s.pit_RA||0;
  });
  t.BA   = t.AB>0 ? t.H/t.AB : null;
  t.OBP  = (t.AB+t.BB)>0 ? (t.H+t.BB)/(t.AB+t.BB) : null;
  const sg = t.H-t.dbl-t.trp-t.HR;
  t.SLG  = t.AB>0 ? (sg+2*t.dbl+3*t.trp+4*t.HR)/t.AB : null;
  t.OPS  = (t.OBP!=null&&t.SLG!=null) ? t.OBP+t.SLG : null;
  return t;
}

function computeAllCareerTotals() {
  const totals={};
  DATA.stats.forEach(s=>{
    if(!totals[s.player_id]) totals[s.player_id]={G:0,AB:0,H:0,HR:0,RBI:0,R:0,dbl:0,trp:0,BB:0,RV:0,seasons:0,pit_W:0,pit_IP:0,pit_RA:0,pit_L:0,MVP_sum:0};
    const t=totals[s.player_id];
    t.G+=s.G||0; t.AB+=s.AB||0; t.H+=s.H||0; t.HR+=s.HR||0; t.RBI+=s.RBI||0;
    t.R+=s.R||0; t.dbl+=s.dbl||0; t.trp+=s.trp||0; t.BB+=s.BB||0; t.RV+=s.RV||0;
    t.seasons+=1; t.pit_W+=s.pit_W||0; t.pit_IP+=s.pit_IP||0;
    t.pit_RA+=s.pit_RA||0; t.pit_L+=s.pit_L||0; t.MVP_sum+=s.MVP||0;
  });
  return totals;
}

// ── SEASONS ───────────────────────────────────────────────────────────────
function showSeasons() {
  document.getElementById('page-seasons').classList.add('active');
  const seasons=[...new Set(DATA.stats.map(s=>s.season_sort))].sort((a,b)=>b-a);
  document.getElementById('season-select').innerHTML=seasons.map(s=>`<option value="${s}">${seasonLabel(s)}</option>`).join('');
  renderSeasonStats();
}

function renderSeasonStats() {
  const season=parseFloat(document.getElementById('season-select').value);
  const type=document.getElementById('stat-type').value;
  const rows=DATA.stats.filter(s=>s.season_sort===season);
  document.getElementById('season-label').textContent=seasonLabel(season);
  const tbody=document.getElementById('season-tbody');
  const thead=document.getElementById('season-thead');

  if(type==='batting') {
    const sorted=[...rows].sort((a,b)=>(b.G||0)-(a.G||0)||(b.AB||0)-(a.AB||0));
    thead.innerHTML=`<tr>
      <th onclick="sortSeason(0,true)" style="text-align:left">Player</th>
      <th onclick="sortSeason(1)">G</th><th onclick="sortSeason(2)">AB</th>
      <th onclick="sortSeason(3)">H</th><th onclick="sortSeason(4)">HR</th>
      <th onclick="sortSeason(5)">RBI</th><th onclick="sortSeason(6)">R</th>
      <th onclick="sortSeason(7)">2B</th><th onclick="sortSeason(8)">3B</th>
      <th onclick="sortSeason(9)">BB</th><th onclick="sortSeason(10)">BA</th>
      <th onclick="sortSeason(11)">OBP</th><th onclick="sortSeason(12)">SLG</th>
      <th onclick="sortSeason(13)">OPS</th><th onclick="sortSeason(14)">RV</th>
      <th onclick="sortSeason(15)">MVP</th>
    </tr>`;
    tbody.innerHTML=sorted.map(s=>`<tr>
      <td style="text-align:left"><a onclick="navigate('profile','${s.player_id}')" style="cursor:pointer">${displayName(s.player_id)}</a></td>
      <td>${fmtStat(s.G)}</td><td>${fmtStat(s.AB)}</td><td>${fmtStat(s.H)}</td>
      <td>${fmtStat(s.HR)}</td><td>${fmtStat(s.RBI)}</td><td>${fmtStat(s.R)}</td>
      <td>${fmtStat(s.dbl)}</td><td>${fmtStat(s.trp)}</td><td>${fmtStat(s.BB)}</td>
      <td>${fmtBA(s.BA)}</td><td>${fmtBA(s.OBP)}</td><td>${fmtBA(s.SLG)}</td><td>${fmtBA(s.OPS)}</td>
      <td>${fmtRV(s.RV)}</td><td>${s.MVP!=null?Number(s.MVP).toFixed(1):'—'}</td>
    </tr>`).join('');
  } else {
    const pit=rows.filter(s=>s.pit_IP&&s.pit_IP>0).sort((a,b)=>(b.pit_IP||0)-(a.pit_IP||0));
    thead.innerHTML=`<tr><th style="text-align:left">Player</th><th>G</th><th>GS</th><th>IP</th><th>RA</th><th>W</th><th>L</th><th>S</th><th>RIP</th></tr>`;
    tbody.innerHTML=pit.length===0
      ?'<tr><td colspan="9" style="text-align:center;color:var(--text-muted);padding:2rem">No pitching data for this season</td></tr>'
      :pit.map(s=>`<tr>
        <td style="text-align:left"><a onclick="navigate('profile','${s.player_id}')" style="cursor:pointer">${displayName(s.player_id)}</a></td>
        <td>${fmtStat(s.pit_G)}</td><td>${fmtStat(s.pit_GS)}</td><td>${fmtStat(s.pit_IP,1)}</td>
        <td>${fmtStat(s.pit_RA)}</td><td>${fmtStat(s.pit_W)}</td><td>${fmtStat(s.pit_L)}</td>
        <td>${fmtStat(s.pit_S)}</td><td>${s.RIP!=null?Number(s.RIP).toFixed(2):'—'}</td>
      </tr>`).join('');
  }
}

function sortSeason(col, isText=false) {
  const tbody=document.getElementById('season-tbody');
  const rows=[...tbody.querySelectorAll('tr')];
  const asc=tbody.dataset.sortCol==col&&tbody.dataset.sortDir==='asc';
  tbody.dataset.sortCol=col; tbody.dataset.sortDir=asc?'desc':'asc';
  rows.sort((a,b)=>{
    const av=a.cells[col]?.textContent.trim()||'';
    const bv=b.cells[col]?.textContent.trim()||'';
    if(isText) return asc?bv.localeCompare(av):av.localeCompare(bv);
    return asc?(parseFloat(av)||-Infinity)-(parseFloat(bv)||-Infinity):(parseFloat(bv)||-Infinity)-(parseFloat(av)||-Infinity);
  });
  rows.forEach(r=>tbody.appendChild(r));
  document.querySelectorAll('#season-thead th').forEach((th,i)=>{
    th.classList.remove('sort-asc','sort-desc');
    if(i===col) th.classList.add(asc?'sort-desc':'sort-asc');
  });
}

// ── GAME LOGS ─────────────────────────────────────────────────────────────
function showGameLogs() {
  document.getElementById('page-gamelogs').classList.add('active');
  const games={};
  DATA.logs.forEach(l=>{
    const key=`${l.date}||${l.game_num}`;
    if(!games[key]) games[key]={date:l.date,game_num:l.game_num,opponent:l.opponent,rows:[]};
    games[key].rows.push(l);
  });
  const list=Object.values(games).sort((a,b)=>b.date.localeCompare(a.date)||b.game_num-a.game_num);
  const years=[...new Set(list.map(g=>g.date.slice(0,4)))].sort().reverse();
  document.getElementById('log-year-select').innerHTML=`<option value="all">All Years</option>`+years.map(y=>`<option value="${y}">${y}</option>`).join('');
  window._gameList=list;
  renderGameList();
}

function renderGameList() {
  const year=document.getElementById('log-year-select').value;
  const games=window._gameList.filter(g=>year==='all'||g.date.startsWith(year));
  document.getElementById('game-list').innerHTML=games.map(g=>`
    <div class="card mb1" style="cursor:pointer" onclick="toggleDetail(this)">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <span style="font-family:var(--font-display);font-weight:700;font-size:1.05rem">${g.date}</span>
          <span style="color:var(--text-muted);margin-left:0.75rem;font-size:0.9rem">vs ${g.opponent}</span>
        </div>
        <span style="color:var(--text-muted);font-size:0.85rem">${g.rows.length} players ▼</span>
      </div>
      <div class="game-detail" style="display:none;margin-top:1rem">
        ${buildBoxTable(g.rows.sort((a,b)=>a.batting_order-b.batting_order),false)}
      </div>
    </div>`).join('');
}

function toggleDetail(el) {
  const d=el.querySelector('.game-detail');
  d.style.display=d.style.display==='none'?'block':'none';
}

// ── RECORDS ───────────────────────────────────────────────────────────────
function showRecords() {
  document.getElementById('page-records').classList.add('active');
  const totals=computeAllCareerTotals();
  const entries=Object.entries(totals);
  const qual=entries.filter(([,t])=>t.AB>=50);
  const ss=DATA.stats;

  const sHR  = [...ss].sort((a,b)=>(b.HR||0)-(a.HR||0))[0];
  const sRBI = [...ss].sort((a,b)=>(b.RBI||0)-(a.RBI||0))[0];
  const sBA  = [...ss].filter(s=>s.AB>=15).sort((a,b)=>(b.BA||0)-(a.BA||0))[0];
  const sRV  = [...ss].sort((a,b)=>(b.RV||0)-(a.RV||0))[0];
  const sMVP = [...ss].sort((a,b)=>(b.MVP||0)-(a.MVP||0))[0];

  const rc=(title,val,id,sub,color='var(--sky)')=>`
    <div class="card" onclick="navigate('profile','${id}')" style="cursor:pointer">
      <div class="card-title">${title}</div>
      <div style="font-family:var(--font-blade);font-size:2rem;color:${color}">${val}</div>
      <div style="color:var(--text-dim);font-size:0.85rem;margin-top:0.2rem">${displayName(id)} — ${sub}</div>
    </div>`;

  const lrows=(sorted,vfn,n=10)=>sorted.slice(0,n).map(([id,t],i)=>`<tr>
    <td style="text-align:left;color:var(--text-muted);width:1.5rem">${i+1}</td>
    <td style="text-align:left"><a onclick="navigate('profile','${id}')" style="cursor:pointer">${displayName(id)}</a></td>
    <td>${vfn(t)}</td></tr>`).join('');

  const lcard=(title,sorted,vfn)=>`<div class="card">
    <div class="section-title">${title}</div>
    <div class="table-wrap"><table><tbody>${lrows(sorted,vfn)}</tbody></table></div>
  </div>`;

  const byG   = [...entries].sort((a,b)=>b[1].G-a[1].G);
  const byHR  = [...entries].sort((a,b)=>b[1].HR-a[1].HR);
  const byRBI = [...entries].sort((a,b)=>b[1].RBI-a[1].RBI);
  const byR   = [...entries].sort((a,b)=>b[1].R-a[1].R);
  const byH   = [...entries].sort((a,b)=>b[1].H-a[1].H);
  const byRV  = [...entries].sort((a,b)=>b[1].RV-a[1].RV);
  const byBA  = [...qual].sort((a,b)=>(b[1].H/b[1].AB)-(a[1].H/a[1].AB));
  const byW   = [...entries].sort((a,b)=>b[1].pit_W-a[1].pit_W);

  document.getElementById('records-static').innerHTML=`
    <div class="section-title">Single Season Records</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:1rem;margin-bottom:2rem">
      ${rc('Single Season HR',sHR.HR,sHR.player_id,sHR.season_label)}
      ${rc('Single Season RBI',sRBI.RBI,sRBI.player_id,sRBI.season_label)}
      ${rc('Single Season BA',fmtBA(sBA.BA),sBA.player_id,sBA.season_label+' (min 15 AB)')}
      ${rc('Single Season RV',fmtRV(sRV.RV),sRV.player_id,sRV.season_label)}
      ${rc('Single Season MVP',Number(sMVP.MVP).toFixed(1),sMVP.player_id,sMVP.season_label,'var(--gold)')}
    </div>
    <div class="section-title mt2">Career Leaderboards</div>
    <div class="grid-2">
      ${lcard('Career Games Played',byG,t=>t.G)}
      ${lcard('Career Home Runs',byHR,t=>t.HR)}
      ${lcard('Career RBI',byRBI,t=>t.RBI)}
      ${lcard('Career Runs',byR,t=>t.R)}
      ${lcard('Career Hits',byH,t=>t.H)}
      ${lcard('Career RV',byRV,t=>fmtRV(t.RV))}
      ${lcard('Career BA (min 50 AB)',byBA,t=>fmtBA(t.H/t.AB))}
      ${lcard('Career Pitching Wins',byW,t=>t.pit_W)}
    </div>`;
}

function renderCustomLeaderboard() {
  const statKey=document.getElementById('lb-stat').value;
  const seasonVal=document.getElementById('lb-season').value;
  const gender=document.getElementById('lb-gender').value;
  const minAB=parseInt(document.getElementById('lb-minab').value)||0;
  const scope=document.getElementById('lb-scope').value;

  const fmtVal=(k,v)=>{
    if(v==null) return '—';
    if(['BA','OBP','SLG','OPS'].includes(k)) return fmtBA(v);
    if(k==='RIP') return Number(v).toFixed(2);
    if(k==='RV') return fmtRV(v);
    if(k==='MVP') return Number(v).toFixed(1);
    if(k==='pit_IP') return Number(v).toFixed(1);
    return String(Math.round(v));
  };

  const statLabels={G:'G',AB:'AB',H:'H',HR:'HR',RBI:'RBI',R:'R',dbl:'2B',trp:'3B',BB:'BB',
    BA:'BA',OBP:'OBP',SLG:'SLG',OPS:'OPS',RV:'RV',MVP:'MVP',pit_W:'W',pit_IP:'IP',RIP:'RIP'};

  const genderOk=id=>{
    if(gender==='all') return true;
    const p=getPlayer(id); return p&&p.gender===gender;
  };

  let results=[];

  if(scope==='season') {
    let rows=DATA.stats.filter(s=>{
      if(seasonVal!=='all'&&String(s.season_sort)!==seasonVal) return false;
      if(!genderOk(s.player_id)) return false;
      if(minAB>0&&(s.AB||0)<minAB) return false;
      return true;
    });
    results=rows.map(s=>{
      let v;
      if(statKey==='RIP') v=(s.pit_IP>0)?s.pit_RA/s.pit_IP:null;
      else v=s[statKey];
      return {player_id:s.player_id,season_label:s.season_label,val:v};
    }).filter(r=>r.val!=null);
    results.sort((a,b)=>statKey==='RIP'?a.val-b.val:b.val-a.val);
    document.getElementById('lb-results').innerHTML=`<div class="table-wrap"><table>
      <thead><tr><th style="text-align:left">#</th><th style="text-align:left">Player</th><th style="text-align:left">Season</th><th>${statLabels[statKey]||statKey}</th></tr></thead>
      <tbody>${results.slice(0,25).map((r,i)=>`<tr>
        <td style="text-align:left;color:var(--text-muted)">${i+1}</td>
        <td style="text-align:left"><a onclick="navigate('profile','${r.player_id}')" style="cursor:pointer">${displayName(r.player_id)}</a></td>
        <td style="text-align:left">${r.season_label}</td>
        <td>${fmtVal(statKey,r.val)}</td>
      </tr>`).join('')}</tbody>
    </table></div>`;
  } else {
    const tots={};
    DATA.stats.forEach(s=>{
      if(!genderOk(s.player_id)) return;
      if(!tots[s.player_id]) tots[s.player_id]={G:0,AB:0,H:0,HR:0,RBI:0,R:0,dbl:0,trp:0,BB:0,RV:0,pit_W:0,pit_IP:0,pit_RA:0,MVP_sum:0};
      const t=tots[s.player_id];
      t.G+=s.G||0; t.AB+=s.AB||0; t.H+=s.H||0; t.HR+=s.HR||0; t.RBI+=s.RBI||0;
      t.R+=s.R||0; t.dbl+=s.dbl||0; t.trp+=s.trp||0; t.BB+=s.BB||0; t.RV+=s.RV||0;
      t.pit_W+=s.pit_W||0; t.pit_IP+=s.pit_IP||0; t.pit_RA+=s.pit_RA||0; t.MVP_sum+=s.MVP||0;
    });
    let entries=Object.entries(tots).filter(([,t])=>minAB===0||t.AB>=minAB);
    entries=entries.map(([id,t])=>{
      let v;
      if(statKey==='BA') v=t.AB>0?t.H/t.AB:null;
      else if(statKey==='OBP') v=(t.AB+t.BB)>0?(t.H+t.BB)/(t.AB+t.BB):null;
      else if(statKey==='SLG'){const sg=t.H-t.dbl-t.trp-t.HR;v=t.AB>0?(sg+2*t.dbl+3*t.trp+4*t.HR)/t.AB:null;}
      else if(statKey==='OPS'){
        const obp=(t.AB+t.BB)>0?(t.H+t.BB)/(t.AB+t.BB):0;
        const sg=t.H-t.dbl-t.trp-t.HR;
        const slg=t.AB>0?(sg+2*t.dbl+3*t.trp+4*t.HR)/t.AB:0;
        v=obp+slg;
      }
      else if(statKey==='RIP') v=t.pit_IP>0?t.pit_RA/t.pit_IP:null;
      else if(statKey==='MVP') v=t.MVP_sum;
      else v=t[statKey];
      return [id,v];
    }).filter(([,v])=>v!=null);
    entries.sort((a,b)=>statKey==='RIP'?a[1]-b[1]:b[1]-a[1]);
    document.getElementById('lb-results').innerHTML=`<div class="table-wrap"><table>
      <thead><tr><th style="text-align:left">#</th><th style="text-align:left">Player</th><th>${statLabels[statKey]||statKey}</th></tr></thead>
      <tbody>${entries.slice(0,25).map(([id,v],i)=>`<tr>
        <td style="text-align:left;color:var(--text-muted)">${i+1}</td>
        <td style="text-align:left"><a onclick="navigate('profile','${id}')" style="cursor:pointer">${displayName(id)}</a></td>
        <td>${fmtVal(statKey,v)}</td>
      </tr>`).join('')}</tbody>
    </table></div>`;
  }
}

// ── CURRENT SEASON ────────────────────────────────────────────────────────
function showCurrent() { document.getElementById('page-current').classList.add('active'); }

// ── TABS ──────────────────────────────────────────────────────────────────
function switchTab(btn, panelId) {
  const profile=document.getElementById('page-profile');
  profile.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
  profile.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById(panelId)?.classList.add('active');
}

// ── INIT ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadData();
  const seasons=[...new Set(DATA.stats.map(s=>s.season_sort))].sort((a,b)=>b-a);
  document.getElementById('lb-season').innerHTML=
    `<option value="all">All Seasons</option>`+seasons.map(s=>`<option value="${s}">${seasonLabel(s)}</option>`).join('');
  navigate('home');
});
