// ── DATA ──────────────────────────────────────────────────────────────────
const DATA = { players: [], stats: [], logs: [] };
const AKA = { 'Gomez': 'AlmonteJ', 'DeBoer': 'SimonsK' };
const POS_COLS = ['pos_P','pos_C','pos_1B','pos_2B','pos_3B','pos_SS','pos_LF','pos_LC','pos_RC','pos_RF','pos_DH'];
const POS_LABELS = { pos_P:'P',pos_C:'C',pos_1B:'1B',pos_2B:'2B',pos_3B:'3B',pos_SS:'SS',pos_LF:'LF',pos_LC:'LC',pos_RC:'RC',pos_RF:'RF',pos_DH:'DH' };

async function loadData() {
  const [p,s,l] = await Promise.all([
    fetch('data/players.json').then(r=>r.json()),
    fetch('data/season_stats.json').then(r=>r.json()),
    fetch('data/game_logs.json').then(r=>r.json()),
  ]);
  DATA.players = p; DATA.stats = s; DATA.logs = l;

  // Fetch live 2026 data and schedule in parallel
  try {
    const [liveStats, liveBox, schedText] = await Promise.all([
      fetch(LIVE_STATS_URL).then(r=>r.text()),
      fetch(LIVE_BOX_URL).then(r=>r.text()),
      fetch(SCHEDULE_URL).then(r=>r.text()),
    ]);
    mergeLiveStats(liveStats);
    mergeLiveBox(liveBox);
    // Cache schedule rows for home page upcoming games
    try {
      const schedLines = schedText.trim().replace(/\r/g,'').split('\n');
      const schedHeaders = parseLine(schedLines[0]);
      const seen = {};
      const dedupHeaders = schedHeaders.map(h => {
        if(seen[h]!==undefined){seen[h]++;return h+'_'+seen[h];}
        seen[h]=0;return h;
      });
      window._scheduleRows = schedLines.slice(1).map(line => {
        const vals = parseLine(line);
        const obj = {};
        dedupHeaders.forEach((h,i) => obj[h] = vals[i]||'');
        return obj;
      }).filter(r => Object.values(r).some(v=>v!==''));
    } catch(e2) { console.warn('Schedule parse error:', e2); }
  } catch(e) {
    console.warn('Live data unavailable:', e);
  }

  DATA.maxSeason = Math.max(...DATA.stats.map(r=>r.season_sort));
  DATA.pitchers = new Set(DATA.stats.filter(r=>r.pit_G&&r.pit_G>0).map(r=>r.player_id));
}

function parseLiveStats(text) {
  // Row 0: section labels, Row 1: actual headers, Row 2+: data
  const lines = text.trim().replace(/\r/g,'').split('\n');
  if(lines.length < 3) return [];
  const rawHeaders = parseLine(lines[1]);
  const seen = {};
  const headers = rawHeaders.map(h => {
    if(seen[h]!==undefined){seen[h]++;return h+'_'+seen[h];}
    seen[h]=0;return h;
  });
  return lines.slice(2).map(line => {
    const vals = parseLine(line);
    const obj = {};
    headers.forEach((h,i) => obj[h] = vals[i]||'');
    return obj;
  }).filter(r => r['Name'] && r['Name'].trim() !== '' && r['Name'].trim().toLowerCase() !== 'total');
}

function parseLiveBox(text) {
  // Row 0: headers (skip 'ONE' column), data from row 1
  const lines = text.trim().replace(/\r/g,'').split('\n');
  if(lines.length < 2) return [];
  const rawHeaders = parseLine(lines[0]);
  const seen = {};
  const headers = rawHeaders.map(h => {
    if(seen[h]!==undefined){seen[h]++;return h+'_'+seen[h];}
    seen[h]=0;return h;
  });
  return lines.slice(1).map(line => {
    const vals = parseLine(line);
    const obj = {};
    headers.forEach((h,i) => obj[h] = vals[i]||'');
    return obj;
  }).filter(r => r['Player'] && r['Player'].trim() !== '');
}

function mergeLiveStats(text) {
  const rows = parseLiveStats(text);
  // Remove any existing 2026.1 rows (in case of reload)
  DATA.stats = DATA.stats.filter(s => s.season_sort !== LIVE_SEASON);
  rows.forEach(r => {
    const n = v => { const x=parseFloat(v); return isNaN(x)?null:x; };
    DATA.stats.push({
      season_sort:  LIVE_SEASON,
      season_label: LIVE_LABEL,
      season_year:  2026,
      season_half:  'Spring',
      player_id:    r['Name'].trim(),
      G:    n(r['G']),    AB:   n(r['AB']),  R:    n(r['R']),
      H:    n(r['H']),    RBI:  n(r['RBI']), dbl:  n(r['2B']),
      trp:  n(r['3B']),   HR:   n(r['HR']),  BB:   n(r['BB']),
      BA:   n(r['BA']),   OBP:  n(r['OBP']), SLG:  n(r['SLG']),
      OPS:  n(r['OPS']),  MVP:  n(r['MVP']), RV:   n(r['RV']),
      pos_P:  n(r['P']),  pos_C:  n(r['C']),   pos_1B: n(r['1B']),
      // After dedup: batting 2B=2B, fielding 2B=2B_1; batting 3B=3B, fielding 3B=3B_1; pitching R=R_1
      pos_2B: n(r['2B_1']), pos_3B: n(r['3B_1']),
      pos_SS: n(r['SS']),   pos_LF: n(r['LF']),   pos_LC: n(r['LC']),
      pos_RC: n(r['RC']),   pos_RF: n(r['RF']),   pos_DH: n(r['DH']),
      pit_G:  n(r['GP']),   pit_GS: n(r['GS']),   pit_IP: n(r['IP']),
      pit_RA: n(r['R_1']),  pit_W:  n(r['W']),    pit_L:  n(r['L']),
      RIP:    n(r['RIP']), pit_S: null,
    });
  });
  console.log('Live stats merged:', rows.length, 'players');
}

function mergeLiveBox(text) {
  const rows = parseLiveBox(text);
  // Remove existing live box rows
  DATA.logs = DATA.logs.filter(l => !l.live);
  let order = {};
  rows.forEach((r,i) => {
    const n = v => { const x=parseFloat(v); return isNaN(x)?null:x; };
    const gameKey = (r['Game #']||'') + '||' + (r['Date']||'');
    if(!order[gameKey]) order[gameKey] = 0;
    order[gameKey]++;
    DATA.logs.push({
      live:         true,
      player_id:    r['Player'].trim(),
      game_num:     n(r['Game #']),
      date:         fmtLiveDate(r['Date']||''),
      opponent:     r['OPP']||'',
      batting_order: order[gameKey],
      AB:  n(r['AB']), R:   n(r['R']),  H:   n(r['H']),
      RBI: n(r['RBI']),dbl: n(r['2B']), trp: n(r['3B']),
      HR:  n(r['HR']), BB:  n(r['BB']), RV:  null,
      pos_P:  n(r['PP']),  pos_C:  n(r['PC']),  pos_1B: n(r['P1']),
      pos_2B: n(r['P2']),  pos_3B: n(r['P3']),  pos_SS: n(r['PSS']),
      pos_LF: n(r['PLF']), pos_LC: n(r['PLC']), pos_RC: n(r['PRC']),
      pos_RF: n(r['PRF']), pos_DH: n(r['PDH']),
      pit_G:  n(r['GP']),  pit_GS: n(r['GS']),  pit_IP: n(r['IP']),
      pit_RA: n(r['RA']),  pit_W:  n(r['W']),   pit_L:  n(r['L']),
      pit_S:  n(r['S']),
    });
  });
  console.log('Live box scores merged:', rows.length, 'rows');
}

function fmtLiveDate(d) {
  // Convert M/D/YYYY to YYYY-MM-DD
  if(!d) return '';
  const parts = d.split('/');
  if(parts.length === 3) {
    const [m,day,y] = parts;
    return `${y}-${m.padStart(2,'0')}-${day.padStart(2,'0')}`;
  }
  return d;
}

function getPlayer(id) { return DATA.players.find(p=>p.id===id); }
function displayName(id) { const p=getPlayer(id); return p?`${p.first} ${p.last}`:id; }

// Formatting
function fmtBox(v) { return (v===null||v===undefined)?'0':Number(v).toFixed(0); }
function fmtStat(v,d=0) { return (v===null||v===undefined)?'—':Number(v).toFixed(d); }
function fmtBA(v) { return (v===null||v===undefined)?'—':Number(v).toFixed(3).replace(/^0\./,'.'); }
function fmtRV(v,d=1) { return (v===null||v===undefined)?'—':Number(v).toFixed(d); }
function seasonLabel(s) { const y=Math.floor(s); return (Math.round((s-y)*10)===1?'Spring ':'Fall ')+y; }
function seasonShort(s) { const y=Math.floor(s); return (Math.round((s-y)*10)===1?'Sp':'Fa')+String(y).slice(2); }

// Primary position for a season row
function primaryPos(row) {
  const entries = POS_COLS.map(k=>([k,row[k]||0])).filter(([,v])=>v>0);
  if(!entries.length) return '';
  entries.sort((a,b)=>b[1]-a[1]);
  const max = entries[0][1];
  const tied = entries.filter(([,v])=>v===max);
  return tied.map(([k])=>POS_LABELS[k]).join('/');
}

// Career positions: up to 2 most common (10+ games), tie-break by recency
function careerPosDisplay(playerStats) {
  const totals = {};
  POS_COLS.forEach(k => { totals[k] = 0; });
  playerStats.forEach(s => POS_COLS.forEach(k => { totals[k] += s[k]||0; }));
  const sorted = Object.entries(totals).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]);
  if(!sorted.length) return '';
  const primary = sorted[0];
  const result = [primary[0]];
  // second position: 10+ games, not primary
  const second = sorted.slice(1).filter(([,v])=>v>=10);
  if(second.length) {
    // tie-break by most recent season with that position
    second.sort((a,b) => {
      const recentA = Math.max(...playerStats.filter(s=>s[a[0]]>0).map(s=>s.season_sort), 0);
      const recentB = Math.max(...playerStats.filter(s=>s[b[0]]>0).map(s=>s.season_sort), 0);
      return recentB - recentA;
    });
    result.push(second[0][0]);
  }
  return result.map(k=>POS_LABELS[k]).join('/');
}

// Photo: try player image, fall back to emoji
function avatarImg(id) {
  // Try jpg, jpeg, lowercase variants, then emoji fallback
  const fallback = "if(this.dataset.t==(this.dataset.t||0)+1,this.dataset.t==1){this.src='img/players/'+id+'.jpeg';}else if(this.dataset.t==2){this.src='img/players/'+id.toLowerCase()+'.jpg';}else if(this.dataset.t==3){this.src='img/players/'+id.toLowerCase()+'.jpeg';}else{this.parentElement.innerHTML='🦑';}";
  return '<img src="img/players/' + id + '.jpg" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%" onerror="this.dataset.t=(this.dataset.t||0)+1;if(this.dataset.t==1){this.src=\'img/players/' + id + '.jpeg\';}else if(this.dataset.t==2){this.src=\'img/players/' + id.toLowerCase() + '.jpg\';}else if(this.dataset.t==3){this.src=\'img/players/' + id.toLowerCase() + '.jpeg\';}else{this.parentElement.innerHTML=\'🦑\';}">';
}

// ── ROUTING ───────────────────────────────────────────────────────────────
function navigate(route, param=null) {
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('nav a[data-route]').forEach(a=>a.classList.toggle('active',a.dataset.route===route));
  window.scrollTo(0,0);
  const h={home:showHome,players:showPlayers,seasons:showSeasons,gamelogs:showGameLogs,records:showRecords,current:showCurrent,schedule:showSchedule,standings:showStandings};
  if(route==='profile'&&param) showProfile(param);
  else if(h[route]) h[route]();
}

// ── HOME ──────────────────────────────────────────────────────────────────
function showHome() {
  document.getElementById('page-home').classList.add('active');
  const tots = computeAllCareerTotals();
  const entries = Object.entries(tots);
  const qual = entries.filter(([,t])=>t.AB>=50);
  const byHR  = [...entries].sort((a,b)=>b[1].HR-a[1].HR)[0];
  const byRBI = [...entries].sort((a,b)=>b[1].RBI-a[1].RBI)[0];
  const byBA  = [...qual].sort((a,b)=>(b[1].H/b[1].AB)-(a[1].H/a[1].AB))[0];
  const byRV  = [...entries].sort((a,b)=>b[1].RV-a[1].RV)[0];
  document.getElementById('home-leaders').innerHTML=[
    ['Career HR',byHR[0],byHR[1].HR],
    ['Career RBI',byRBI[0],byRBI[1].RBI],
    ['Career BA',byBA[0],fmtBA(byBA[1].H/byBA[1].AB)],
    ['Career RV',byRV[0],fmtRV(byRV[1].RV)],
  ].map(([stat,id,val])=>`<div class="card" onclick="navigate('profile','${id}')" style="cursor:pointer">
    <div class="card-title">${stat}</div>
    <div style="font-family:var(--font-blade);font-size:1.3rem;color:var(--sky)">${val}</div>
    <div style="font-size:0.82rem;color:var(--text-dim);margin-top:0.15rem">${displayName(id)}</div>
  </div>`).join('');

  renderHomeGames();
}

function fmtTime(t) {
  // Convert "7" or "8" or "7pm" -> "7pm"
  if(!t) return '';
  const n = parseInt(t);
  if(!isNaN(n)) return n + 'pm';
  return t;
}

function renderHomeGames() {
  const today = new Date().toISOString().slice(0,10);

  // ── Upcoming games (top, full width) ──
  let upcomingHTML = '';
  if(window._scheduleRows && window._scheduleRows.length) {
    const upcoming = window._scheduleRows
      .filter(r => {
        const d = schedDateToISO(r['Date']||'');
        return d >= today && !(r['W/L']||'').trim();
      })
      .slice(0,2);
    if(upcoming.length) {
      upcomingHTML = `
        <div class="section-title">Upcoming</div>
        <div style="display:flex;gap:0.75rem;flex-wrap:wrap">
          ${upcoming.map(r=>`
            <div class="card" style="flex:1;min-width:200px;display:flex;justify-content:space-between;align-items:center;padding:0.7rem 1rem">
              <div>
                <div style="font-family:var(--font-display);font-weight:700;font-size:1rem;color:var(--text)">${r['Day']||''} ${r['Date']||''}</div>
                <div style="color:var(--text-dim);font-size:0.85rem;margin-top:0.1rem">${(r['H/A']||'').trim()==='H'?'vs':'@'} ${r['Opponent']||''}</div>
              </div>
              <div style="font-family:var(--font-blade);color:var(--sky);font-size:1rem;white-space:nowrap">${fmtTime(r['Time']||'')}</div>
            </div>`).join('')}
        </div>`;
    }
  }
  document.getElementById('home-upcoming').innerHTML = upcomingHTML;

  // ── Last game box score ──
  const latest = [...DATA.logs].sort((a,b)=>b.date.localeCompare(a.date)||b.game_num-a.game_num)[0];
  let recentHTML = '';
  if(latest) {
    const rows = DATA.logs
      .filter(l=>l.date===latest.date&&l.game_num===latest.game_num)
      .sort((a,b)=>a.batting_order-b.batting_order);

    // Try to find game result from schedule
    let resultBadge = '';
    if(window._scheduleRows) {
      const latestISO = latest.date; // already YYYY-MM-DD
      const sched = window._scheduleRows.find(r => schedDateToISO(r['Date']||'') === latestISO);
      if(sched && (sched['W/L']||'').trim()) {
        const wl = sched['W/L'].trim().toUpperCase();
        const rs = sched['RS']||'';
        const ra = sched['RA']||'';
        const color = wl==='W'?'var(--green)':'var(--red)';
        const score = rs&&ra ? `, ${rs}–${ra}` : '';
        resultBadge = `<span style="font-family:var(--font-blade);color:${color};margin-left:0.75rem;font-size:1rem">${wl}${score}</span>`;
      }
    }

    recentHTML = `
      <div class="section-title" style="display:flex;align-items:center;gap:0.5rem">
        Last Game — ${latest.date} vs ${latest.opponent}${resultBadge}
      </div>
      ${buildBoxTableWithPos(rows,false)}`;
  }
  document.getElementById('home-recent').innerHTML = recentHTML;
}

function schedDateToISO(d) {
  // M/D/YYYY -> YYYY-MM-DD
  const p = d.split('/');
  if(p.length===3) return `${p[2]}-${p[0].padStart(2,'0')}-${p[1].padStart(2,'0')}`;
  return d;
}

// ── PLAYERS ───────────────────────────────────────────────────────────────
function showPlayers() {
  document.getElementById('page-players').classList.add('active');
  renderRoster();
}
function applyRosterFilters() {
  const filter     = document.getElementById('player-search').value;
  const gender     = document.getElementById('gender-filter').value;
  const posFilter  = document.getElementById('pos-filter').value;
  const activeOnly = document.getElementById('active-only').checked;
  renderRoster(filter, gender, posFilter, activeOnly);
}

function renderRoster(filter='', gender='all', posFilter='all', activeOnly=false) {
  let players=[...DATA.players];
  if(filter){const q=filter.toLowerCase();players=players.filter(p=>(p.first+' '+p.last+p.id).toLowerCase().includes(q));}
  if(gender!=='all') players=players.filter(p=>p.gender===gender);

  const active=new Set(DATA.stats.filter(s=>s.season_sort===DATA.maxSeason).map(s=>s.player_id));

  if(activeOnly) players=players.filter(p=>active.has(p.id));

  if(posFilter!=='all') {
    const posKey='pos_'+posFilter;
    const posPlayers=new Set(DATA.stats.filter(s=>(s[posKey]||0)>0).map(s=>s.player_id));
    players=players.filter(p=>posPlayers.has(p.id));
  }

  players.sort((a,b)=>a.last.localeCompare(b.last));
  const sums={};
  DATA.stats.forEach(s=>{
    if(!sums[s.player_id]) sums[s.player_id]={AB:0,H:0,HR:0,RBI:0,seasons:[]};
    const sm=sums[s.player_id];
    sm.AB+=s.AB||0;sm.H+=s.H||0;sm.HR+=s.HR||0;sm.RBI+=s.RBI||0;sm.seasons.push(s.season_sort);
  });
  document.getElementById('roster-grid').innerHTML=players.map(p=>{
    const sm=sums[p.id],isActive=active.has(p.id);
    let rangeStr='',statsStr='';
    if(sm&&sm.seasons.length>0){
      const lo=Math.min(...sm.seasons),hi=Math.max(...sm.seasons);
      rangeStr=lo===hi?seasonShort(lo):`${seasonShort(lo)}–${seasonShort(hi)}`;
      const ba=sm.AB>=10?fmtBA(sm.H/sm.AB):'—';
      statsStr=`H:${sm.H} · HR:${sm.HR} · RBI:${sm.RBI} · BA:${ba}`;
    }
    return `<div class="roster-card" onclick="navigate('profile','${p.id}')">
      <div class="roster-avatar">${avatarImg(p.id)}</div>
      <div style="min-width:0">
        <div class="roster-name">${p.first} ${p.last}</div>
        <div class="roster-sub">
          ${isActive?'<span class="badge badge-current">Active</span> ':''}
          <span class="badge badge-${p.gender.toLowerCase()}">${p.gender}</span>
          ${rangeStr?`<span style="color:var(--text-muted);font-size:0.7rem;margin-left:0.3rem">${rangeStr}</span>`:''}
          ${statsStr?`<div style="font-size:0.7rem;color:var(--text-muted);margin-top:0.1rem">${statsStr}</div>`:'<div style="font-size:0.7rem;color:var(--text-muted);margin-top:0.1rem">No stats yet</div>'}
        </div>
      </div>
    </div>`;
  }).join('')||'<div class="empty-state">No players found</div>';
}

// ── PROFILE ───────────────────────────────────────────────────────────────
function showProfile(id) {
  const page=document.getElementById('page-profile');
  page.classList.add('active');
  const player=getPlayer(id);
  if(!player){page.innerHTML='<div class="container"><p>Player not found.</p></div>';return;}
  const pStats=DATA.stats.filter(s=>s.player_id===id).sort((a,b)=>a.season_sort-b.season_sort);
  const pLogs=DATA.logs.filter(l=>l.player_id===id).sort((a,b)=>b.date.localeCompare(a.date)||b.game_num-a.game_num);
  const career=computeCareerTotals(pStats);
  const isPitcher=DATA.pitchers.has(id);
  const akaStr=AKA[id]?`Also appeared as: ${AKA[id]}`:'';
  const posDisplay=careerPosDisplay(pStats);
  const nS=pStats.length;
  let rangeStr='';
  if(nS>0){const lo=pStats[0].season_sort,hi=pStats[nS-1].season_sort;rangeStr=lo===hi?seasonLabel(lo):`${seasonShort(lo)}–${seasonShort(hi)}`;}
  const isActive=pStats.some(s=>s.season_sort===DATA.maxSeason);

  // Batting stat headers in canonical order
  const batHeaders=`<th style="text-align:left">Season</th><th style="text-align:left">Pos</th>
    <th>G</th><th>AB</th><th>R</th><th>H</th><th>RBI</th><th>2B</th><th>3B</th><th>HR</th><th>BB</th>
    <th>BA</th><th>OBP</th><th>SLG</th><th>OPS</th>
    <th>P</th><th>C</th><th>1B</th><th>2B</th><th>3B</th><th>SS</th><th>LF</th><th>LC</th><th>RC</th><th>RF</th><th>DH</th>
    <th>MVP</th><th>RV</th>
    ${isPitcher?'<th>GP</th><th>GS</th><th>IP</th><th>RA</th><th>W</th><th>L</th><th>S</th><th>RIP</th>':''}`;

  const batRow=(s,isCareer=false)=>{
    if(isCareer){
      const pitCareer=isPitcher?`<td>${career.pit_G||0}</td><td>${career.pit_GS||0}</td><td>${fmtStat(career.pit_IP,1)}</td><td>${career.pit_RA||0}</td><td>${career.pit_W||0}</td><td>${career.pit_L||0}</td><td>${career.pit_S||0}</td><td>${career.pit_IP>0?Number(career.pit_RA/career.pit_IP).toFixed(2):'—'}</td>`:'';
      return `<tr class="career-row">
        <td>CAREER</td><td>—</td>
        <td>${career.G}</td><td>${career.AB}</td><td>${career.R}</td><td>${career.H}</td><td>${career.RBI}</td>
        <td>${career.dbl}</td><td>${career.trp}</td><td>${career.HR}</td><td>${career.BB}</td>
        <td>${fmtBA(career.BA)}</td><td>${fmtBA(career.OBP)}</td><td>${fmtBA(career.SLG)}</td><td>${fmtBA(career.OPS)}</td>
        ${POS_COLS.map(k=>`<td>${career['p_'+k]||0}</td>`).join('')}
        <td>—</td><td>${fmtRV(career.RV)}</td>
        ${pitCareer}
      </tr>`;
    }
    const pos=primaryPos(s);
    const pitCells=isPitcher?`
      <td>${s.pit_G>0?fmtStat(s.pit_G):'—'}</td>
      <td>${s.pit_G>0?fmtStat(s.pit_GS):'—'}</td>
      <td>${s.pit_G>0?fmtStat(s.pit_IP,1):'—'}</td>
      <td>${s.pit_G>0?fmtStat(s.pit_RA):'—'}</td>
      <td>${s.pit_G>0?fmtStat(s.pit_W):'—'}</td>
      <td>${s.pit_G>0?fmtStat(s.pit_L):'—'}</td>
      <td>${s.pit_G>0?fmtStat(s.pit_S):'—'}</td>
      <td>${s.pit_G>0&&s.pit_IP>0?Number(s.pit_RA/s.pit_IP).toFixed(2):'—'}</td>`:'';
    return `<tr>
      <td style="text-align:left;white-space:nowrap">${s.season_label}</td>
      <td style="text-align:left;color:var(--sky-light);font-weight:600">${pos}</td>
      <td>${fmtStat(s.G)}</td><td>${fmtStat(s.AB)}</td><td>${fmtStat(s.R)}</td><td>${fmtStat(s.H)}</td><td>${fmtStat(s.RBI)}</td>
      <td>${fmtStat(s.dbl)}</td><td>${fmtStat(s.trp)}</td><td>${fmtStat(s.HR)}</td><td>${fmtStat(s.BB)}</td>
      <td>${fmtBA(s.BA)}</td><td>${fmtBA(s.OBP)}</td><td>${fmtBA(s.SLG)}</td><td>${fmtBA(s.OPS)}</td>
      ${POS_COLS.map(k=>`<td>${s[k]!=null&&s[k]>0?s[k]:'—'}</td>`).join('')}
      <td>${s.MVP!=null?Number(s.MVP).toFixed(1):'—'}</td><td>${fmtRV(s.RV)}</td>
      ${pitCells}
    </tr>`;
  };

  page.innerHTML=`
    <div class="profile-header"><a class="back-btn" onclick="navigate('players')">← All Players</a></div>
    <div class="profile-header" style="padding-top:0.5rem">
      <div class="profile-photo">${avatarImg(id)}</div>
      <div class="profile-info">
        <div class="blade-name">${player.first} ${player.last}</div>
        ${akaStr?`<div class="aka">${akaStr}</div>`:''}
        <div class="profile-meta">
          ${isActive?'<span class="badge badge-current">Active</span>':''}
          <span style="color:var(--text-dim);font-size:0.85rem">${player.gender} · Bats ${player.bat} · Throws ${player.throw}</span>
          ${posDisplay?`<span style="color:var(--sky);font-family:var(--font-display);font-weight:700;letter-spacing:0.08em">${posDisplay}</span>`:''}
          ${nS>0?`<span style="color:var(--text-dim);font-size:0.85rem"><strong style="color:var(--text)">${nS}</strong> season${nS!==1?'s':''} · ${rangeStr}</span>`:''}
        </div>
      </div>
    </div>
    <div class="container">
      ${pStats.length===0?`<div class="empty-state">No official stats yet — Spring 2026 in progress!</div>`:`
        <div class="tabs">
          <button class="tab-btn active" onclick="switchProfileTab(this,'tab-seasons')">By Season</button>
          ${pLogs.length>0?`<button class="tab-btn" onclick="switchProfileTab(this,'tab-gamelogs')">Game Log</button>`:''}
        </div>
        <div id="tab-seasons" class="tab-panel active">
          <div class="table-wrap"><table>
            <thead><tr>${batHeaders}</tr></thead>
            <tbody>
              ${pStats.map(s=>batRow(s)).join('')}
              ${batRow(null,true)}
            </tbody>
          </table></div>
        </div>
        ${pLogs.length>0?`<div id="tab-gamelogs" class="tab-panel">${buildBoxTableWithPos(pLogs,true)}</div>`:''}
      `}
    </div>`;
}

function computeCareerTotals(stats) {
  const t={G:0,AB:0,H:0,HR:0,RBI:0,R:0,dbl:0,trp:0,BB:0,RV:0,pit_W:0,pit_L:0,pit_S:0,pit_IP:0,pit_RA:0,pit_G:0,pit_GS:0};
  POS_COLS.forEach(k=>{ t['p_'+k]=0; });
  stats.forEach(s=>{
    t.G+=s.G||0;t.AB+=s.AB||0;t.H+=s.H||0;t.HR+=s.HR||0;t.RBI+=s.RBI||0;
    t.R+=s.R||0;t.dbl+=s.dbl||0;t.trp+=s.trp||0;t.BB+=s.BB||0;t.RV+=s.RV||0;
    t.pit_W+=s.pit_W||0;t.pit_L+=s.pit_L||0;t.pit_S+=s.pit_S||0;
    t.pit_IP+=s.pit_IP||0;t.pit_RA+=s.pit_RA||0;t.pit_G+=s.pit_G||0;t.pit_GS+=s.pit_GS||0;
    POS_COLS.forEach(k=>{ t['p_'+k]+=s[k]||0; });
  });
  t.BA=(t.AB>0)?t.H/t.AB:null;
  t.OBP=((t.AB+t.BB)>0)?(t.H+t.BB)/(t.AB+t.BB):null;
  const sg=t.H-t.dbl-t.trp-t.HR;
  t.SLG=(t.AB>0)?(sg+2*t.dbl+3*t.trp+4*t.HR)/t.AB:null;
  t.OPS=(t.OBP!=null&&t.SLG!=null)?t.OBP+t.SLG:null;
  return t;
}

function computeAllCareerTotals() {
  const tots={};
  DATA.stats.forEach(s=>{
    if(!tots[s.player_id]) tots[s.player_id]={G:0,AB:0,H:0,HR:0,RBI:0,R:0,dbl:0,trp:0,BB:0,RV:0,seasons:0,pit_W:0,pit_IP:0,pit_RA:0,pit_L:0,MVP_sum:0};
    const t=tots[s.player_id];
    t.G+=s.G||0;t.AB+=s.AB||0;t.H+=s.H||0;t.HR+=s.HR||0;t.RBI+=s.RBI||0;
    t.R+=s.R||0;t.dbl+=s.dbl||0;t.trp+=s.trp||0;t.BB+=s.BB||0;t.RV+=s.RV||0;
    t.seasons+=1;t.pit_W+=s.pit_W||0;t.pit_IP+=s.pit_IP||0;t.pit_RA+=s.pit_RA||0;t.pit_L+=s.pit_L||0;t.MVP_sum+=s.MVP||0;
  });
  return tots;
}

// Box table for home/gamelogs (no position column)
function buildBoxTable(rows,showDateOpp=true) {
  return `<div class="table-wrap"><table>
    <thead><tr>
      ${showDateOpp?'<th style="text-align:left">Date</th><th style="text-align:left">Opp</th>':'<th style="text-align:left">Player</th>'}
      <th>AB</th><th>R</th><th>H</th><th>RBI</th><th>2B</th><th>3B</th><th>HR</th><th>BB</th><th>RV</th>
    </tr></thead>
    <tbody>${rows.map(l=>`<tr>
      ${showDateOpp
        ?`<td style="text-align:left">${l.date}</td><td style="text-align:left">${l.opponent||'—'}</td>`
        :`<td><a onclick="navigate('profile','${l.player_id}')">${displayName(l.player_id)}</a></td>`}
      <td>${fmtBox(l.AB)}</td><td>${fmtBox(l.R)}</td><td>${fmtBox(l.H)}</td>
      <td>${fmtBox(l.RBI)}</td><td>${fmtBox(l.dbl)}</td><td>${fmtBox(l.trp)}</td>
      <td>${fmtBox(l.HR)}</td><td>${fmtBox(l.BB)}</td><td>${fmtRV(l.RV,2)}</td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}

// Box table with positions column (for game log tab on profile & game log page)
function buildBoxTableWithPos(rows, showDateOpp=true) {
  const posColHeader='<th style="text-align:left">Pos</th>';
  return `<div class="table-wrap"><table>
    <thead><tr>
      ${showDateOpp?'<th style="text-align:left">Date</th><th style="text-align:left">Opp</th>':'<th style="text-align:left">Player</th>'}
      ${posColHeader}
      <th>AB</th><th>R</th><th>H</th><th>RBI</th><th>2B</th><th>3B</th><th>HR</th><th>BB</th><th>RV</th>
    </tr></thead>
    <tbody>${rows.map(l=>{
      const posEntries=POS_COLS.filter(k=>l[k]&&l[k]>0).map(k=>POS_LABELS[k]);
      const posStr=posEntries.join('/') || '—';
      return `<tr>
        ${showDateOpp
          ?`<td style="text-align:left">${l.date}</td><td style="text-align:left">${l.opponent||'—'}</td>`
          :`<td><a onclick="navigate('profile','${l.player_id}')">${displayName(l.player_id)}</a></td>`}
        <td style="text-align:left;color:var(--sky-light);font-size:0.8rem">${posStr}</td>
        <td>${fmtBox(l.AB)}</td><td>${fmtBox(l.R)}</td><td>${fmtBox(l.H)}</td>
        <td>${fmtBox(l.RBI)}</td><td>${fmtBox(l.dbl)}</td><td>${fmtBox(l.trp)}</td>
        <td>${fmtBox(l.HR)}</td><td>${fmtBox(l.BB)}</td><td>${fmtRV(l.RV,2)}</td>
      </tr>`;
    }).join('')}</tbody>
  </table></div>`;
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
  if(type==='batting'){
    const sorted=[...rows].sort((a,b)=>(b.G||0)-(a.G||0)||(b.AB||0)-(a.AB||0));
    thead.innerHTML=`<tr>
      <th onclick="sortSeason(0,true)" style="text-align:left">Player</th>
      <th onclick="sortSeason(1)">G</th><th onclick="sortSeason(2)">AB</th><th onclick="sortSeason(3)">R</th>
      <th onclick="sortSeason(4)">H</th><th onclick="sortSeason(5)">RBI</th>
      <th onclick="sortSeason(6)">2B</th><th onclick="sortSeason(7)">3B</th>
      <th onclick="sortSeason(8)">HR</th><th onclick="sortSeason(9)">BB</th>
      <th onclick="sortSeason(10)">BA</th><th onclick="sortSeason(11)">OBP</th>
      <th onclick="sortSeason(12)">SLG</th><th onclick="sortSeason(13)">OPS</th>
      <th onclick="sortSeason(14)">MVP</th><th onclick="sortSeason(15)">RV</th>
    </tr>`;
    tbody.innerHTML=sorted.map(s=>`<tr>
      <td style="text-align:left"><a onclick="navigate('profile','${s.player_id}')">${displayName(s.player_id)}</a></td>
      <td>${fmtStat(s.G)}</td><td>${fmtStat(s.AB)}</td><td>${fmtStat(s.R)}</td><td>${fmtStat(s.H)}</td>
      <td>${fmtStat(s.RBI)}</td><td>${fmtStat(s.dbl)}</td><td>${fmtStat(s.trp)}</td>
      <td>${fmtStat(s.HR)}</td><td>${fmtStat(s.BB)}</td>
      <td>${fmtBA(s.BA)}</td><td>${fmtBA(s.OBP)}</td><td>${fmtBA(s.SLG)}</td><td>${fmtBA(s.OPS)}</td>
      <td>${s.MVP!=null?Number(s.MVP).toFixed(1):'—'}</td><td>${fmtRV(s.RV)}</td>
    </tr>`).join('');
  } else {
    const pit=rows.filter(s=>s.pit_IP&&s.pit_IP>0).sort((a,b)=>(b.pit_IP||0)-(a.pit_IP||0));
    thead.innerHTML=`<tr><th style="text-align:left">Player</th><th>G</th><th>GS</th><th>IP</th><th>RA</th><th>W</th><th>L</th><th>S</th><th>RIP</th></tr>`;
    tbody.innerHTML=pit.length===0
      ?'<tr><td colspan="9" style="text-align:center;color:var(--text-muted);padding:2rem">No pitching data for this season</td></tr>'
      :pit.map(s=>`<tr>
        <td style="text-align:left"><a onclick="navigate('profile','${s.player_id}')">${displayName(s.player_id)}</a></td>
        <td>${fmtStat(s.pit_G)}</td><td>${fmtStat(s.pit_GS)}</td><td>${fmtStat(s.pit_IP,1)}</td>
        <td>${fmtStat(s.pit_RA)}</td><td>${fmtStat(s.pit_W)}</td><td>${fmtStat(s.pit_L)}</td>
        <td>${fmtStat(s.pit_S)}</td><td>${s.RIP!=null?Number(s.RIP).toFixed(2):'—'}</td>
      </tr>`).join('');
  }
}
function sortSeason(col,isText=false){
  const tbody=document.getElementById('season-tbody');
  const rows=[...tbody.querySelectorAll('tr')];
  const asc=tbody.dataset.sortCol==col&&tbody.dataset.sortDir==='asc';
  tbody.dataset.sortCol=col;tbody.dataset.sortDir=asc?'desc':'asc';
  rows.sort((a,b)=>{
    const av=a.cells[col]?.textContent.trim()||'',bv=b.cells[col]?.textContent.trim()||'';
    if(isText) return asc?bv.localeCompare(av):av.localeCompare(bv);
    return asc?(parseFloat(av)||-Infinity)-(parseFloat(bv)||-Infinity):(parseFloat(bv)||-Infinity)-(parseFloat(av)||-Infinity);
  });
  rows.forEach(r=>tbody.appendChild(r));
  document.querySelectorAll('#season-thead th').forEach((th,i)=>{th.classList.remove('sort-asc','sort-desc');if(i===col)th.classList.add(asc?'sort-desc':'sort-asc');});
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
function renderGameList(){
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
        ${buildBoxTableWithPos(g.rows.sort((a,b)=>a.batting_order-b.batting_order),false)}
      </div>
    </div>`).join('');
}
function toggleDetail(el){const d=el.querySelector('.game-detail');d.style.display=d.style.display==='none'?'block':'none';}

// ── RECORDS ───────────────────────────────────────────────────────────────
function showRecords() {
  document.getElementById('page-records').classList.add('active');
  renderCareerLeaderboards();
  renderCustomLeaderboard();
}

function renderCareerLeaderboards() {
  const tots=computeAllCareerTotals();
  const entries=Object.entries(tots);
  const qual=entries.filter(([,t])=>t.AB>=50);
  const byG  =[...entries].sort((a,b)=>b[1].G-a[1].G);
  const byHR =[...entries].sort((a,b)=>b[1].HR-a[1].HR);
  const byRBI=[...entries].sort((a,b)=>b[1].RBI-a[1].RBI);
  const byR  =[...entries].sort((a,b)=>b[1].R-a[1].R);
  const byH  =[...entries].sort((a,b)=>b[1].H-a[1].H);
  const byRV =[...entries].sort((a,b)=>b[1].RV-a[1].RV);
  const byBA =[...qual].sort((a,b)=>(b[1].H/b[1].AB)-(a[1].H/a[1].AB));
  const byW  =[...entries].sort((a,b)=>b[1].pit_W-a[1].pit_W);

  // Split by gender
  const mPlayers=new Set(DATA.players.filter(p=>p.gender==='M').map(p=>p.id));
  const fPlayers=new Set(DATA.players.filter(p=>p.gender==='F').map(p=>p.id));

  const splitCard=(title,sorted,vfn)=>{
    const mRows=sorted.filter(([id])=>mPlayers.has(id)).slice(0,10);
    const fRows=sorted.filter(([id])=>fPlayers.has(id)).slice(0,10);
    const mkRows=(rows)=>rows.map(([id,t],i)=>`<tr>
      <td style="text-align:left;color:var(--text-muted);width:1.5rem">${i+1}</td>
      <td style="text-align:left"><a onclick="navigate('profile','${id}')">${displayName(id)}</a></td>
      <td>${vfn(t)}</td></tr>`).join('');
    return `<div style="margin-bottom:1.5rem">
      <div class="section-title">${title}</div>
      <div class="split-tables">
        <div>
          <div class="split-label split-label-m">Men</div>
          <div class="table-wrap"><table><tbody>${mkRows(mRows)}</tbody></table></div>
        </div>
        <div>
          <div class="split-label split-label-f">Women</div>
          <div class="table-wrap"><table><tbody>${mkRows(fRows)}</tbody></table></div>
        </div>
      </div>
    </div>`;
  };

  const statOrder=[
    ['Career Games Played',byG,t=>t.G],
    ['Career Hits',byH,t=>t.H],
    ['Career RBI',byRBI,t=>t.RBI],
    ['Career Home Runs',byHR,t=>t.HR],
    ['Career BA (min 50 AB)',byBA,t=>fmtBA(t.H/t.AB)],
    ['Career RV',byRV,t=>fmtRV(t.RV)],
    ['Career Pitching Wins',byW,t=>t.pit_W],
  ];
  document.getElementById('records-static').innerHTML=statOrder.map(([title,sorted,vfn])=>splitCard(title,sorted,vfn)).join('');
}

function renderCustomLeaderboard() {
  const statKey=document.getElementById('lb-stat').value;
  const seasonVal=document.getElementById('lb-season').value;
  const gender=document.getElementById('lb-gender').value;
  const minAB=parseInt(document.getElementById('lb-minab').value)||0;
  const scope=document.getElementById('lb-scope').value;
  const statLabels={G:'G',AB:'AB',H:'H',HR:'HR',RBI:'RBI',R:'R',dbl:'2B',trp:'3B',BB:'BB',BA:'BA',OBP:'OBP',SLG:'SLG',OPS:'OPS',RV:'RV',MVP:'MVP',pit_W:'W',pit_IP:'IP',RIP:'RIP'};
  const fmtVal=(k,v)=>{
    if(v==null) return '—';
    if(['BA','OBP','SLG','OPS'].includes(k)) return fmtBA(v);
    if(k==='RIP') return Number(v).toFixed(2);
    if(k==='RV') return fmtRV(v);
    if(k==='MVP') return Number(v).toFixed(1);
    if(k==='pit_IP') return Number(v).toFixed(1);
    return String(Math.round(v));
  };
  const genderOk=id=>{if(gender==='all')return true;const p=getPlayer(id);return p&&p.gender===gender;};

  let results=[];
  if(scope==='season'){
    let rows=DATA.stats.filter(s=>{
      if(seasonVal!=='all'&&String(s.season_sort)!==seasonVal) return false;
      if(!genderOk(s.player_id)) return false;
      if(minAB>0&&(s.AB||0)<minAB) return false;
      return true;
    });
    results=rows.map(s=>{
      let v=statKey==='RIP'?(s.pit_IP>0?s.pit_RA/s.pit_IP:null):s[statKey];
      return {player_id:s.player_id,season_label:s.season_label,val:v};
    }).filter(r=>r.val!=null);
    results.sort((a,b)=>statKey==='RIP'?a.val-b.val:b.val-a.val);
    document.getElementById('lb-results').innerHTML=`<div class="table-wrap"><table>
      <thead><tr><th style="text-align:left">#</th><th style="text-align:left">Player</th><th style="text-align:left">Season</th><th>${statLabels[statKey]||statKey}</th></tr></thead>
      <tbody>${results.slice(0,25).map((r,i)=>`<tr>
        <td style="text-align:left;color:var(--text-muted)">${i+1}</td>
        <td style="text-align:left"><a onclick="navigate('profile','${r.player_id}')">${displayName(r.player_id)}</a></td>
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
      t.G+=s.G||0;t.AB+=s.AB||0;t.H+=s.H||0;t.HR+=s.HR||0;t.RBI+=s.RBI||0;
      t.R+=s.R||0;t.dbl+=s.dbl||0;t.trp+=s.trp||0;t.BB+=s.BB||0;t.RV+=s.RV||0;
      t.pit_W+=s.pit_W||0;t.pit_IP+=s.pit_IP||0;t.pit_RA+=s.pit_RA||0;t.MVP_sum+=s.MVP||0;
    });
    let ents=Object.entries(tots).filter(([,t])=>minAB===0||t.AB>=minAB).map(([id,t])=>{
      let v;
      if(statKey==='BA') v=t.AB>0?t.H/t.AB:null;
      else if(statKey==='OBP') v=(t.AB+t.BB)>0?(t.H+t.BB)/(t.AB+t.BB):null;
      else if(statKey==='SLG'){const sg=t.H-t.dbl-t.trp-t.HR;v=t.AB>0?(sg+2*t.dbl+3*t.trp+4*t.HR)/t.AB:null;}
      else if(statKey==='OPS'){
        const obp=(t.AB+t.BB)>0?(t.H+t.BB)/(t.AB+t.BB):0;
        const sg=t.H-t.dbl-t.trp-t.HR;const slg=t.AB>0?(sg+2*t.dbl+3*t.trp+4*t.HR)/t.AB:0;v=obp+slg;
      }
      else if(statKey==='RIP') v=t.pit_IP>0?t.pit_RA/t.pit_IP:null;
      else if(statKey==='MVP') v=t.MVP_sum;
      else v=t[statKey];
      return [id,v];
    }).filter(([,v])=>v!=null);
    ents.sort((a,b)=>statKey==='RIP'?a[1]-b[1]:b[1]-a[1]);
    document.getElementById('lb-results').innerHTML=`<div class="table-wrap"><table>
      <thead><tr><th style="text-align:left">#</th><th style="text-align:left">Player</th><th>${statLabels[statKey]||statKey}</th></tr></thead>
      <tbody>${ents.slice(0,25).map(([id,v],i)=>`<tr>
        <td style="text-align:left;color:var(--text-muted)">${i+1}</td>
        <td style="text-align:left"><a onclick="navigate('profile','${id}')">${displayName(id)}</a></td>
        <td>${fmtVal(statKey,v)}</td>
      </tr>`).join('')}</tbody>
    </table></div>`;
  }
}

// ── CURRENT ───────────────────────────────────────────────────────────────
function showCurrent(){
  document.getElementById('page-current').classList.add('active');
  const liveStats = DATA.stats.filter(s=>s.season_sort===LIVE_SEASON);
  const el = document.getElementById('current-content');
  if(!liveStats.length){
    el.innerHTML='<div class="empty-state">No stats yet for Spring 2026</div>';
    return;
  }
  const sorted = [...liveStats].sort((a,b)=>(b.G||0)-(a.G||0)||(b.AB||0)-(a.AB||0));
  el.innerHTML=`
    <div class="section-title">Spring 2026 Batting</div>
    <div class="table-wrap"><table>
      <thead><tr>
        <th style="text-align:left">Player</th>
        <th>G</th><th>AB</th><th>R</th><th>H</th><th>RBI</th>
        <th>2B</th><th>3B</th><th>HR</th><th>BB</th>
        <th>BA</th><th>OBP</th><th>SLG</th><th>OPS</th>
        <th>MVP</th><th>RV</th>
      </tr></thead>
      <tbody>
        ${sorted.map(s=>`<tr>
          <td style="text-align:left"><a onclick="navigate('profile','${s.player_id}')">${displayName(s.player_id)}</a></td>
          <td>${fmtStat(s.G)}</td><td>${fmtStat(s.AB)}</td><td>${fmtStat(s.R)}</td>
          <td>${fmtStat(s.H)}</td><td>${fmtStat(s.RBI)}</td>
          <td>${fmtStat(s.dbl)}</td><td>${fmtStat(s.trp)}</td><td>${fmtStat(s.HR)}</td>
          <td>${fmtStat(s.BB)}</td>
          <td>${fmtBA(s.BA)}</td><td>${fmtBA(s.OBP)}</td><td>${fmtBA(s.SLG)}</td><td>${fmtBA(s.OPS)}</td>
          <td>${s.MVP!=null?Number(s.MVP).toFixed(1):'—'}</td><td>${fmtRV(s.RV)}</td>
        </tr>`).join('')}
      </tbody>
    </table></div>`;
}

// ── SCHEDULE ──────────────────────────────────────────────────────────────
const LIVE_STATS_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTvDmE9OZGe0w29idwwnbmdCfYOCqdRwajBQPrUvJZ-KZ1gahycABbrOzBW9B_S-5-heCWpOCOnXwgv/pub?gid=633884296&single=true&output=csv';
const LIVE_BOX_URL   = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTvDmE9OZGe0w29idwwnbmdCfYOCqdRwajBQPrUvJZ-KZ1gahycABbrOzBW9B_S-5-heCWpOCOnXwgv/pub?gid=2094714956&single=true&output=csv';
const LIVE_SEASON    = 2026.1;
const LIVE_LABEL     = 'Spring 2026';

const SCHEDULE_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTvDmE9OZGe0w29idwwnbmdCfYOCqdRwajBQPrUvJZ-KZ1gahycABbrOzBW9B_S-5-heCWpOCOnXwgv/pub?gid=0&single=true&output=csv';

// Parse a single CSV line respecting quoted fields (global so live data fns can use it)
function parseLine(line) {
  const vals = [];
  let cur = '', inQ = false;
  for(let i=0; i<line.length; i++){
    const ch = line[i];
    if(ch==='"') { inQ=!inQ; }
    else if(ch===',' && !inQ) { vals.push(cur.trim()); cur=''; }
    else { cur+=ch; }
  }
  vals.push(cur.trim());
  return vals.map(v => v.replace(/^"|"$/g,'').trim());
}

function parseCSV(text) {
  // Normalize Windows line endings
  const lines = text.trim().replace(/\r/g,'').split('\n');

  // Use first occurrence of any duplicate header
  const rawHeaders = parseLine(lines[0]);
  const seen = {};
  const headers = rawHeaders.map(h => {
    if(seen[h] !== undefined) { seen[h]++; return h + '_' + seen[h]; }
    seen[h] = 0; return h;
  });
  console.log('Schedule headers:', headers);

  return lines.slice(1).map(line => {
    const vals = parseLine(line);
    const obj = {};
    headers.forEach((h,i) => obj[h] = vals[i]||'');
    return obj;
  }).filter(r => Object.values(r).some(v=>v!==''));
}

async function showSchedule(){
  document.getElementById('page-schedule').classList.add('active');
  const tbody = document.getElementById('schedule-tbody');
  tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:var(--text-muted);padding:2rem">Loading...</td></tr>';
  try {
    const res = await fetch(SCHEDULE_URL);
    const text = await res.text();
    const rows = parseCSV(text);
    if(!rows.length){
      tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:var(--text-muted);padding:2rem">No games scheduled yet</td></tr>';
      return;
    }
    // Compute running record from W/L column
    let w=0, l=0;
    tbody.innerHTML = rows.map(r => {
      const result = (r['W/L']||'').trim().toUpperCase();
      if(result==='W') w++;
      else if(result==='L') l++;
      const hasResult = result==='W'||result==='L';
      const resultColor = result==='W'?'var(--green)':result==='L'?'var(--red)':'var(--text)';
      const rec = hasResult ? `${w}-${l}` : '';
      return `<tr>
        <td style="text-align:left">${r['G#']||''}</td>
        <td style="text-align:left">${r['Day']||''}</td>
        <td style="text-align:left;white-space:nowrap">${r['Date']||''}</td>
        <td>${r['Time']||''}</td>
        <td>${r['H/A']||''}</td>
        <td style="text-align:left">${r['Opponent']||''}</td>
        <td style="color:${resultColor};font-weight:600">${result||''}</td>
        <td>${r['RS']||''}</td>
        <td>${r['RA']||''}</td>
        <td style="text-align:left">${r['Rec']||rec}</td>
      </tr>`;
    }).join('');
  } catch(e) {
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:var(--red);padding:2rem">Failed to load schedule</td></tr>';
  }
}

// ── STANDINGS ─────────────────────────────────────────────────────────────
const STANDINGS_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTvDmE9OZGe0w29idwwnbmdCfYOCqdRwajBQPrUvJZ-KZ1gahycABbrOzBW9B_S-5-heCWpOCOnXwgv/pub?gid=1569850367&single=true&output=csv';

async function showStandings(){
  document.getElementById('page-standings').classList.add('active');
  const tbody = document.getElementById('standings-tbody');
  tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:2rem">Loading...</td></tr>';
  try {
    const res = await fetch(STANDINGS_URL);
    const text = await res.text();
    const rows = parseCSV(text);
    console.log('Standings headers:', Object.keys(rows[0]||{}));
    if(!rows.length){
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:2rem">No standings data yet</td></tr>';
      return;
    }
    // Find the right column keys flexibly
    const sample = rows[0];
    const keys = Object.keys(sample);
    const teamKey = keys.find(k => /team/i.test(k)) || keys[0];
    const wKey    = keys.find(k => /^w$/i.test(k.trim())) || keys[1];
    const lKey    = keys.find(k => /^l$/i.test(k.trim())) || keys[2];
    const pctKey  = keys.find(k => /win|pct|%/i.test(k)) || keys[3];

    // Sort by Win% descending
    rows.sort((a,b) => Number(b[pctKey]||0) - Number(a[pctKey]||0));
    tbody.innerHTML = rows.map((r, i) => {
      const team = r[teamKey]||'';
      const w    = r[wKey]||'';
      const l    = r[lKey]||'';
      const pct  = r[pctKey] ? Number(r[pctKey]).toFixed(3).replace(/^0\./,'.') : '';
      const isSquids = /squid/i.test(team);
      return `<tr ${isSquids?'style="background:var(--surface-raised);border-left:3px solid var(--sky)"':''}>
        <td style="text-align:left;font-weight:${isSquids?'700':'400'};color:${isSquids?'var(--sky)':'var(--text)'};white-space:nowrap">${team}</td>
        <td style="width:2.5rem">${w}</td>
        <td style="width:2.5rem">${l}</td>
        <td style="width:3.5rem">${pct}</td>
      </tr>`;
    }).join('');
  } catch(e) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--red);padding:2rem">Failed to load standings</td></tr>';
  }
}

// ── TABS ──────────────────────────────────────────────────────────────────
function switchProfileTab(btn,panelId){
  const page=document.getElementById('page-profile');
  page.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
  page.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById(panelId)?.classList.add('active');
}

// ── INIT ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded',async()=>{
  await loadData();
  const seasons=[...new Set(DATA.stats.map(s=>s.season_sort))].sort((a,b)=>b-a);
  document.getElementById('lb-season').innerHTML=
    `<option value="all">All Seasons</option>`+seasons.map(s=>`<option value="${s}">${seasonLabel(s)}</option>`).join('');
  navigate('home');
});
