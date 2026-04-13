// ── CONSTANTS ─────────────────────────────────────────────────────────────
const AKA = { 'Gomez': 'AlmonteJ', 'DeBoer': 'SimonsK' };
const POS_COLS = ['pos_P','pos_C','pos_1B','pos_2B','pos_3B','pos_SS','pos_LF','pos_LC','pos_RC','pos_RF','pos_DH'];
const POS_LABELS = { pos_P:'P',pos_C:'C',pos_1B:'1B',pos_2B:'2B',pos_3B:'3B',pos_SS:'SS',pos_LF:'LF',pos_LC:'LC',pos_RC:'RC',pos_RF:'RF',pos_DH:'DH' };
const LIVE_STATS_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTvDmE9OZGe0w29idwwnbmdCfYOCqdRwajBQPrUvJZ-KZ1gahycABbrOzBW9B_S-5-heCWpOCOnXwgv/pub?gid=633884296&single=true&output=csv';
const LIVE_BOX_URL   = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTvDmE9OZGe0w29idwwnbmdCfYOCqdRwajBQPrUvJZ-KZ1gahycABbrOzBW9B_S-5-heCWpOCOnXwgv/pub?gid=2094714956&single=true&output=csv';
const SCHEDULE_URL   = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTvDmE9OZGe0w29idwwnbmdCfYOCqdRwajBQPrUvJZ-KZ1gahycABbrOzBW9B_S-5-heCWpOCOnXwgv/pub?gid=0&single=true&output=csv';
const STANDINGS_URL  = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTvDmE9OZGe0w29idwwnbmdCfYOCqdRwajBQPrUvJZ-KZ1gahycABbrOzBW9B_S-5-heCWpOCOnXwgv/pub?gid=1569850367&single=true&output=csv';
const LIVE_SEASON    = 2026.1;
const LIVE_LABEL     = 'Spring 2026';
const DATA = { players: [], stats: [], logs: [] };

// ── DATA LOADING ──────────────────────────────────────────────────────────
async function loadData() {
  const [p, s, l] = await Promise.all([
    fetch('data/players.json').then(r => r.json()),
    fetch('data/season_stats.json').then(r => r.json()),
    fetch('data/game_logs.json').then(r => r.json()),
  ]);
  DATA.players = p; DATA.stats = s; DATA.logs = l;
  try {
    const [liveStats, liveBox, schedText] = await Promise.all([
      fetch(LIVE_STATS_URL).then(r => r.text()),
      fetch(LIVE_BOX_URL).then(r => r.text()),
      fetch(SCHEDULE_URL).then(r => r.text()),
    ]);
    mergeLiveStats(liveStats);
    mergeLiveBox(liveBox);
    cacheSchedule(schedText);
  } catch(e) { console.warn('Live data unavailable:', e); }
  DATA.maxSeason = Math.max(...DATA.stats.map(r => r.season_sort));
  DATA.pitchers = new Set(DATA.stats.filter(r => r.pit_G && r.pit_G > 0).map(r => r.player_id));
}

// ── CSV PARSING ───────────────────────────────────────────────────────────
function parseLine(line) {
  const vals = []; let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQ = !inQ; }
    else if (ch === ',' && !inQ) { vals.push(cur.trim()); cur = ''; }
    else { cur += ch; }
  }
  vals.push(cur.trim());
  return vals.map(v => v.replace(/^"|"$/g, '').trim());
}

function dedupeHeaders(headers) {
  const seen = {};
  return headers.map(h => {
    if (seen[h] !== undefined) { seen[h]++; return h + '_' + seen[h]; }
    seen[h] = 0; return h;
  });
}

function parseCSV(text, skipRows = 0) {
  const lines = text.trim().replace(/\r/g, '').split('\n');
  const headers = dedupeHeaders(parseLine(lines[skipRows]));
  return lines.slice(skipRows + 1).map(line => {
    const vals = parseLine(line);
    const obj = {};
    headers.forEach((h, i) => obj[h] = vals[i] || '');
    return obj;
  }).filter(r => Object.values(r).some(v => v !== ''));
}

function mergeLiveStats(text) {
  DATA.stats = DATA.stats.filter(s => s.season_sort !== LIVE_SEASON);
  const rows = parseCSV(text, 1); // skip row 0 (section labels), row 1 = headers
  rows.forEach(r => {
    if (!r['Name'] || r['Name'].trim() === '' || r['Name'].trim().toLowerCase() === 'total') return;
    const n = v => { const x = parseFloat(v); return isNaN(x) ? null : x; };
    DATA.stats.push({
      season_sort: LIVE_SEASON, season_label: LIVE_LABEL,
      season_year: 2026, season_half: 'Spring',
      player_id: r['Name'].trim(),
      G: n(r['G']), AB: n(r['AB']), R: n(r['R']), H: n(r['H']),
      RBI: n(r['RBI']), dbl: n(r['2B']), trp: n(r['3B']),
      HR: n(r['HR']), BB: n(r['BB']),
      BA: n(r['BA']), OBP: n(r['OBP']), SLG: n(r['SLG']), OPS: n(r['OPS']),
      MVP: n(r['MVP']), RV: n(r['RV']),
      pos_P: n(r['P']), pos_C: n(r['C']), pos_1B: n(r['1B']),
      pos_2B: n(r['2B_1']), pos_3B: n(r['3B_1']),
      pos_SS: n(r['SS']), pos_LF: n(r['LF']), pos_LC: n(r['LC']),
      pos_RC: n(r['RC']), pos_RF: n(r['RF']), pos_DH: n(r['DH']),
      pit_G: n(r['GP']), pit_GS: n(r['GS']), pit_IP: n(r['IP']),
      pit_RA: n(r['R_1']), pit_W: n(r['W']), pit_L: n(r['L']),
      RIP: n(r['RIP']), pit_S: null,
    });
  });
  console.log('Live stats merged:', rows.length, 'rows');
}

function mergeLiveBox(text) {
  DATA.logs = DATA.logs.filter(l => !l.live);
  const rows = parseCSV(text, 0);
  const order = {};
  rows.forEach(r => {
    if (!r['Player'] || r['Player'].trim() === '') return;
    const n = v => { const x = parseFloat(v); return isNaN(x) ? null : x; };
    const key = (r['Game #'] || '') + '||' + (r['Date'] || '');
    if (!order[key]) order[key] = 0;
    order[key]++;
    DATA.logs.push({
      live: true,
      player_id: r['Player'].trim(),
      game_num: n(r['Game #']),
      date: fmtLiveDate(r['Date'] || ''),
      opponent: r['OPP'] || '',
      batting_order: order[key],
      AB: n(r['AB']), R: n(r['R']), H: n(r['H']),
      RBI: n(r['RBI']), dbl: n(r['2B']), trp: n(r['3B']),
      HR: n(r['HR']), BB: n(r['BB']), RV: null,
      pos_P: n(r['PP']), pos_C: n(r['PC']), pos_1B: n(r['P1']),
      pos_2B: n(r['P2']), pos_3B: n(r['P3']), pos_SS: n(r['PSS']),
      pos_LF: n(r['PLF']), pos_LC: n(r['PLC']), pos_RC: n(r['PRC']),
      pos_RF: n(r['PRF']), pos_DH: n(r['PDH']),
      pit_G: n(r['GP']), pit_GS: n(r['GS']), pit_IP: n(r['IP']),
      pit_RA: n(r['RA']), pit_W: n(r['W']), pit_L: n(r['L']), pit_S: n(r['S']),
    });
  });
  console.log('Live box merged:', rows.length, 'rows');
}

function cacheSchedule(text) {
  try {
    const lines = text.trim().replace(/\r/g, '').split('\n');
    const headers = dedupeHeaders(parseLine(lines[0]));
    window._scheduleRows = lines.slice(1).map(line => {
      const vals = parseLine(line);
      const obj = {};
      headers.forEach((h, i) => obj[h] = vals[i] || '');
      return obj;
    }).filter(r => Object.values(r).some(v => v !== ''));
    console.log('Schedule cached:', window._scheduleRows.length, 'rows');
  } catch(e) { console.warn('Schedule parse error:', e); }
}

function fmtLiveDate(d) {
  const p = d.split('/');
  if (p.length === 3) return p[2] + '-' + p[0].padStart(2,'0') + '-' + p[1].padStart(2,'0');
  return d;
}

function schedDateToISO(d) {
  const p = d.split('/');
  if (p.length === 3) return p[2] + '-' + p[0].padStart(2,'0') + '-' + p[1].padStart(2,'0');
  return d;
}

// ── HELPERS ───────────────────────────────────────────────────────────────
function getPlayer(id) { return DATA.players.find(p => p.id === id); }
function displayName(id) { const p = getPlayer(id); return p ? p.first + ' ' + p.last : id; }

function fmtBox(v) { return (v === null || v === undefined) ? '0' : Number(v).toFixed(0); }
function fmtStat(v, d = 0) { return (v === null || v === undefined) ? '—' : Number(v).toFixed(d); }
function fmtBA(v) { return (v === null || v === undefined) ? '—' : Number(v).toFixed(3).replace(/^0\./, '.'); }
function fmtRV(v, d = 1) { return (v === null || v === undefined) ? '—' : Number(v).toFixed(d); }
function fmtTime(t) { if (!t) return ''; const n = parseInt(t); return isNaN(n) ? t : n + 'pm'; }

function seasonLabel(s) {
  const y = Math.floor(s);
  return (Math.round((s - y) * 10) === 1 ? 'Spring ' : 'Fall ') + y;
}
function seasonShort(s) {
  const y = Math.floor(s);
  return (Math.round((s - y) * 10) === 1 ? 'Sp' : 'Fa') + String(y).slice(2);
}

function primaryPos(row) {
  const entries = POS_COLS.map(k => [k, row[k] || 0]).filter(([,v]) => v > 0);
  if (!entries.length) return '';
  entries.sort((a, b) => b[1] - a[1]);
  const max = entries[0][1];
  const tied = entries.filter(([,v]) => v === max);
  if (tied.length >= 3) {
    // pick most recent -- can't easily do per-row, just take top 2
    return tied.slice(0,2).map(([k]) => POS_LABELS[k]).join('/');
  }
  return tied.map(([k]) => POS_LABELS[k]).join('/');
}

function careerPosDisplay(playerStats) {
  const totals = {};
  POS_COLS.forEach(k => { totals[k] = 0; });
  playerStats.forEach(s => POS_COLS.forEach(k => { totals[k] += s[k] || 0; }));
  const sorted = Object.entries(totals).filter(([,v]) => v > 0).sort((a, b) => b[1] - a[1]);
  if (!sorted.length) return '';
  const primary = sorted[0][0];
  const result = [primary];
  const second = sorted.slice(1).filter(([,v]) => v >= 10);
  if (second.length) {
    second.sort((a, b) => {
      const rA = Math.max(...playerStats.filter(s => (s[a[0]] || 0) > 0).map(s => s.season_sort), 0);
      const rB = Math.max(...playerStats.filter(s => (s[b[0]] || 0) > 0).map(s => s.season_sort), 0);
      return rB - rA;
    });
    result.push(second[0][0]);
  }
  return result.map(k => POS_LABELS[k]).join('/');
}

function avatarImg(id) {
  return '<img src="img/players/' + id + '.jpg" alt=""' +
    ' style="width:100%;height:100%;object-fit:cover;border-radius:50%"' +
    ' onerror="if(!this.dataset.t)this.dataset.t=0;this.dataset.t++;' +
    'var t=+this.dataset.t;' +
    'if(t==1){this.src=\'img/players/' + id + '.jpeg\';}' +
    'else if(t==2){this.src=\'img/players/' + id.toLowerCase() + '.jpg\';}' +
    'else if(t==3){this.src=\'img/players/' + id.toLowerCase() + '.jpeg\';}' +
    'else{this.parentElement.innerHTML=\'🦑\';}">';
}

function computeCareerTotals(stats) {
  const t = { G:0,AB:0,H:0,HR:0,RBI:0,R:0,dbl:0,trp:0,BB:0,RV:0,pit_W:0,pit_L:0,pit_S:0,pit_IP:0,pit_RA:0,pit_G:0,pit_GS:0 };
  POS_COLS.forEach(k => { t['p_' + k] = 0; });
  stats.forEach(s => {
    t.G+=s.G||0; t.AB+=s.AB||0; t.H+=s.H||0; t.HR+=s.HR||0; t.RBI+=s.RBI||0;
    t.R+=s.R||0; t.dbl+=s.dbl||0; t.trp+=s.trp||0; t.BB+=s.BB||0; t.RV+=s.RV||0;
    t.pit_W+=s.pit_W||0; t.pit_L+=s.pit_L||0; t.pit_S+=s.pit_S||0;
    t.pit_IP+=s.pit_IP||0; t.pit_RA+=s.pit_RA||0; t.pit_G+=s.pit_G||0; t.pit_GS+=s.pit_GS||0;
    POS_COLS.forEach(k => { t['p_' + k] += s[k] || 0; });
  });
  t.BA   = t.AB > 0 ? t.H / t.AB : null;
  t.OBP  = (t.AB + t.BB) > 0 ? (t.H + t.BB) / (t.AB + t.BB) : null;
  const sg = t.H - t.dbl - t.trp - t.HR;
  t.SLG  = t.AB > 0 ? (sg + 2*t.dbl + 3*t.trp + 4*t.HR) / t.AB : null;
  t.OPS  = (t.OBP != null && t.SLG != null) ? t.OBP + t.SLG : null;
  return t;
}

function computeAllCareerTotals() {
  const tots = {};
  DATA.stats.forEach(s => {
    if (!tots[s.player_id]) tots[s.player_id] = {
      G:0,AB:0,H:0,HR:0,RBI:0,R:0,dbl:0,trp:0,BB:0,RV:0,
      seasons:0,pit_W:0,pit_IP:0,pit_RA:0,pit_L:0,MVP_sum:0
    };
    const t = tots[s.player_id];
    t.G+=s.G||0; t.AB+=s.AB||0; t.H+=s.H||0; t.HR+=s.HR||0; t.RBI+=s.RBI||0;
    t.R+=s.R||0; t.dbl+=s.dbl||0; t.trp+=s.trp||0; t.BB+=s.BB||0; t.RV+=s.RV||0;
    t.seasons+=1; t.pit_W+=s.pit_W||0; t.pit_IP+=s.pit_IP||0;
    t.pit_RA+=s.pit_RA||0; t.pit_L+=s.pit_L||0; t.MVP_sum+=s.MVP||0;
  });
  return tots;
}

// ── ROUTING ───────────────────────────────────────────────────────────────
function navigate(route, param) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('nav a[data-route]').forEach(a => a.classList.toggle('active', a.dataset.route === route));
  window.scrollTo(0, 0);
  const handlers = {
    home: showHome, players: showPlayers, seasons: showSeasons,
    gamelogs: showGameLogs, records: showRecords,
    schedule: showSchedule, standings: showStandings
  };
  if (route === 'profile' && param) showProfile(param);
  else if (handlers[route]) handlers[route]();
}

// ── BOX TABLES ────────────────────────────────────────────────────────────
function buildBoxTable(rows, showDateOpp) {
  var nameCol = showDateOpp
    ? '<th style="text-align:left">Date</th><th style="text-align:left">Opp</th>'
    : '<th style="text-align:left">Player</th>';
  var bodyRows = rows.map(function(l) {
    var firstCols = showDateOpp
      ? '<td style="text-align:left">' + l.date + '</td><td style="text-align:left">' + (l.opponent||'—') + '</td>'
      : '<td style="text-align:left"><a onclick="navigate(\'profile\',\'' + l.player_id + '\')">' + displayName(l.player_id) + '</a></td>';
    return '<tr>' + firstCols +
      '<td>' + fmtBox(l.AB) + '</td><td>' + fmtBox(l.R) + '</td><td>' + fmtBox(l.H) + '</td>' +
      '<td>' + fmtBox(l.RBI) + '</td><td>' + fmtBox(l.dbl) + '</td><td>' + fmtBox(l.trp) + '</td>' +
      '<td>' + fmtBox(l.HR) + '</td><td>' + fmtBox(l.BB) + '</td>' +
      '<td>' + fmtRV(l.RV, 2) + '</td></tr>';
  }).join('');
  return '<div class="table-wrap"><table>' +
    '<thead><tr>' + nameCol + '<th>AB</th><th>R</th><th>H</th><th>RBI</th><th>2B</th><th>3B</th><th>HR</th><th>BB</th><th>RV</th></tr></thead>' +
    '<tbody>' + bodyRows + '</tbody></table></div>';
}

function buildBoxTableWithPos(rows, showDateOpp) {
  var nameCol = showDateOpp
    ? '<th style="text-align:left">Date</th><th style="text-align:left">Opp</th>'
    : '<th style="text-align:left">Player</th>';
  var bodyRows = rows.map(function(l) {
    var posEntries = POS_COLS.filter(k => l[k] && l[k] > 0).map(k => POS_LABELS[k]);
    var posStr = posEntries.join('/') || '—';
    var firstCols = showDateOpp
      ? '<td style="text-align:left">' + l.date + '</td><td style="text-align:left">' + (l.opponent||'—') + '</td>'
      : '<td style="text-align:left"><a onclick="navigate(\'profile\',\'' + l.player_id + '\')">' + displayName(l.player_id) + '</a></td>';
    return '<tr>' + firstCols +
      '<td style="text-align:left;color:var(--sky-light)">' + posStr + '</td>' +
      '<td>' + fmtBox(l.AB) + '</td><td>' + fmtBox(l.R) + '</td><td>' + fmtBox(l.H) + '</td>' +
      '<td>' + fmtBox(l.RBI) + '</td><td>' + fmtBox(l.dbl) + '</td><td>' + fmtBox(l.trp) + '</td>' +
      '<td>' + fmtBox(l.HR) + '</td><td>' + fmtBox(l.BB) + '</td>' +
      '<td>' + fmtRV(l.RV, 2) + '</td></tr>';
  }).join('');
  return '<div class="table-wrap"><table>' +
    '<thead><tr>' + nameCol + '<th style="text-align:left">Pos</th><th>AB</th><th>R</th><th>H</th><th>RBI</th><th>2B</th><th>3B</th><th>HR</th><th>BB</th><th>RV</th></tr></thead>' +
    '<tbody>' + bodyRows + '</tbody></table></div>';
}

// ── HOME ──────────────────────────────────────────────────────────────────
function showHome() {
  document.getElementById('page-home').classList.add('active');
  renderSeasonLeaders();
  renderHomeGames();
}

function renderSeasonLeaders() {
  var curRows = DATA.stats.filter(function(s) { return s.season_sort === DATA.maxSeason; });
  function leaderCard(stat, rows, valFn, fmtFn, minG) {
    minG = minG || 1;
    var withVal = rows
      .filter(function(r) { return (r.G || 0) >= minG; })
      .map(function(r) { return { id: r.player_id, val: valFn(r) }; })
      .filter(function(r) { return r.val !== null && r.val !== undefined && !isNaN(r.val); })
      .sort(function(a, b) { return b.val - a.val; });
    if (!withVal.length) return '';
    var top = withVal[0].val;
    var leaders = withVal.filter(function(r) { return r.val === top; });
    var nameStr = leaders.length >= 3 ? (leaders.length + ' tied') : leaders.map(function(l) { return displayName(l.id); }).join(' / ');
    var clickAttr = leaders.length === 1 ? ' onclick="navigate(\'profile\',\'' + leaders[0].id + '\')" style="cursor:pointer"' : '';
    return '<div class="card"' + clickAttr + '>' +
      '<div class="card-title">' + stat + '</div>' +
      '<div style="font-family:var(--font-blade);font-size:1.3rem;color:var(--sky)">' + fmtFn(top) + '</div>' +
      '<div style="font-size:0.82rem;color:var(--text-dim);margin-top:0.15rem">' + nameStr + '</div>' +
      '</div>';
  }
  document.getElementById('home-leaders').innerHTML =
    leaderCard('G Played',  curRows, function(r) { return r.G||0; },   function(v) { return v; }) +
    leaderCard('OBP',       curRows, function(r) { return r.OBP; },    fmtBA, 5) +
    leaderCard('Hits',      curRows, function(r) { return r.H||0; },   function(v) { return v; }) +
    leaderCard('Home Runs', curRows, function(r) { return r.HR||0; },  function(v) { return v; });
}

function renderHomeGames() {
  var today = new Date().toISOString().slice(0, 10);

  // Upcoming games
  var upcomingHTML = '';
  if (window._scheduleRows && window._scheduleRows.length) {
    var upcoming = window._scheduleRows.filter(function(r) {
      var d = schedDateToISO(r['Date'] || '');
      return d >= today && !(r['W/L'] || '').trim();
    }).slice(0, 2);
    if (upcoming.length) {
      var cards = upcoming.map(function(r) {
        var ha = (r['H/A'] || '').trim() === 'H' ? 'vs' : '@';
        return '<div class="card" style="flex:1;min-width:180px;display:flex;justify-content:space-between;align-items:center;padding:0.7rem 1rem">' +
          '<div>' +
          '<div style="font-family:var(--font-display);font-weight:700;font-size:0.95rem;color:var(--text)">' + (r['Day']||'') + ' ' + (r['Date']||'') + '</div>' +
          '<div style="color:var(--text-dim);font-size:0.85rem;margin-top:0.1rem">' + ha + ' ' + (r['Opponent']||'') + '</div>' +
          '</div>' +
          '<div style="font-family:var(--font-blade);color:var(--sky);font-size:0.95rem">' + fmtTime(r['Time']||'') + '</div>' +
          '</div>';
      }).join('');
      upcomingHTML = '<div class="section-title">Upcoming</div>' +
        '<div style="display:flex;gap:0.75rem;flex-wrap:wrap">' + cards + '</div>';
    }
  }
  document.getElementById('home-upcoming').innerHTML = upcomingHTML;

  // Last game
  var sortedLogs = DATA.logs.slice().sort(function(a, b) {
    if (b.date !== a.date) return b.date.localeCompare(a.date);
    return b.game_num - a.game_num;
  });
  var latest = sortedLogs[0];
  var recentHTML = '';
  if (latest) {
    var rows = DATA.logs.filter(function(l) {
      return l.date === latest.date && l.game_num === latest.game_num;
    }).sort(function(a, b) { return a.batting_order - b.batting_order; });

    var resultBadge = '';
    if (window._scheduleRows) {
      var sched = window._scheduleRows.find(function(r) {
        return schedDateToISO(r['Date'] || '') === latest.date;
      });
      if (sched && (sched['W/L'] || '').trim()) {
        var wl = sched['W/L'].trim().toUpperCase();
        var rs = sched['RS'] || '', ra = sched['RA'] || '';
        var color = wl === 'W' ? 'var(--green)' : 'var(--red)';
        var score = rs && ra ? ', ' + rs + '–' + ra : '';
        resultBadge = ' <span style="font-family:var(--font-blade);color:' + color + ';font-size:0.95rem">' + wl + score + '</span>';
      }
    }
    recentHTML = '<div class="section-title" style="margin-top:1.25rem">Last Game — ' + latest.date + ' vs ' + latest.opponent + resultBadge + '</div>' +
      buildBoxTableWithPos(rows, false);
  }
  document.getElementById('home-recent').innerHTML = recentHTML;
}

// ── PLAYERS ───────────────────────────────────────────────────────────────
function showPlayers() {
  document.getElementById('page-players').classList.add('active');
  renderRoster();
}

function applyRosterFilters() {
  renderRoster(
    document.getElementById('player-search').value,
    document.getElementById('gender-filter').value,
    document.getElementById('pos-filter').value,
    document.getElementById('active-only').checked
  );
}

function renderRoster(filter, gender, posFilter, activeOnly) {
  filter = filter || ''; gender = gender || 'all';
  posFilter = posFilter || 'all'; activeOnly = !!activeOnly;

  var players = DATA.players.slice();
  if (filter) {
    var q = filter.toLowerCase();
    players = players.filter(function(p) {
      return (p.first + ' ' + p.last + p.id).toLowerCase().includes(q);
    });
  }
  if (gender !== 'all') players = players.filter(function(p) { return p.gender === gender; });

  var active = new Set(DATA.stats.filter(function(s) { return s.season_sort === DATA.maxSeason; }).map(function(s) { return s.player_id; }));
  if (activeOnly) players = players.filter(function(p) { return active.has(p.id); });

  if (posFilter !== 'all') {
    var posKey = 'pos_' + posFilter;
    var posPlayers = new Set(DATA.stats.filter(function(s) { return (s[posKey] || 0) > 0; }).map(function(s) { return s.player_id; }));
    players = players.filter(function(p) { return posPlayers.has(p.id); });
  }

  players.sort(function(a, b) { return a.last.localeCompare(b.last); });

  var sums = {};
  DATA.stats.forEach(function(s) {
    if (!sums[s.player_id]) sums[s.player_id] = { AB:0,H:0,HR:0,RBI:0,seasons:[] };
    var sm = sums[s.player_id];
    sm.AB+=s.AB||0; sm.H+=s.H||0; sm.HR+=s.HR||0; sm.RBI+=s.RBI||0; sm.seasons.push(s.season_sort);
  });

  document.getElementById('roster-grid').innerHTML = players.map(function(p) {
    var sm = sums[p.id], isActive = active.has(p.id);
    var rangeStr = '', statsStr = '';
    if (sm && sm.seasons.length > 0) {
      var lo = Math.min.apply(null, sm.seasons), hi = Math.max.apply(null, sm.seasons);
      rangeStr = lo === hi ? seasonShort(lo) : seasonShort(lo) + '–' + seasonShort(hi);
      var ba = sm.AB >= 10 ? fmtBA(sm.H / sm.AB) : '—';
      statsStr = 'H:' + sm.H + ' · HR:' + sm.HR + ' · RBI:' + sm.RBI + ' · BA:' + ba;
    }
    return '<div class="roster-card" onclick="navigate(\'profile\',\'' + p.id + '\')">' +
      '<div class="roster-avatar">' + avatarImg(p.id) + '</div>' +
      '<div style="min-width:0">' +
      '<div class="roster-name">' + p.first + ' ' + p.last + '</div>' +
      '<div class="roster-sub">' +
      (isActive ? '<span class="badge badge-current">Active</span> ' : '') +
      '<span class="badge badge-' + p.gender.toLowerCase() + '">' + p.gender + '</span>' +
      (rangeStr ? '<span style="color:var(--text-muted);font-size:0.7rem;margin-left:0.3rem">' + rangeStr + '</span>' : '') +
      (statsStr ? '<div style="font-size:0.7rem;color:var(--text-muted);margin-top:0.1rem">' + statsStr + '</div>' : '<div style="font-size:0.7rem;color:var(--text-muted);margin-top:0.1rem">No stats yet</div>') +
      '</div></div></div>';
  }).join('') || '<div class="empty-state">No players found</div>';
}

// ── PROFILE ───────────────────────────────────────────────────────────────
function showProfile(id) {
  var page = document.getElementById('page-profile');
  page.classList.add('active');
  var player = getPlayer(id);
  if (!player) { page.innerHTML = '<div class="container"><p>Player not found.</p></div>'; return; }

  var pStats = DATA.stats.filter(function(s) { return s.player_id === id; })
    .sort(function(a, b) { return b.season_sort - a.season_sort; }); // descending
  var pLogs = DATA.logs.filter(function(l) { return l.player_id === id; })
    .sort(function(a, b) { return b.date.localeCompare(a.date) || b.game_num - a.game_num; });

  var career = computeCareerTotals(pStats);
  var isPitcher = DATA.pitchers.has(id);
  var akaStr = AKA[id] ? 'Also appeared as: ' + AKA[id] : '';
  var posDisplay = careerPosDisplay(pStats);
  var nS = pStats.length;
  var rangeStr = '';
  if (nS > 0) {
    var lo = pStats[nS-1].season_sort, hi = pStats[0].season_sort;
    rangeStr = lo === hi ? seasonLabel(lo) : seasonShort(lo) + '–' + seasonShort(hi);
  }
  var isActive = pStats.some(function(s) { return s.season_sort === DATA.maxSeason; });

  // Build season rows (descending) then career at top
  function batRow(s) {
    var pos = primaryPos(s);
    var pitCells = '';
    if (isPitcher) {
      var hasPit = s.pit_G && s.pit_G > 0;
      pitCells = '<td>' + (hasPit ? fmtStat(s.pit_G) : '—') + '</td>' +
        '<td>' + (hasPit ? fmtStat(s.pit_GS) : '—') + '</td>' +
        '<td>' + (hasPit ? fmtStat(s.pit_IP, 1) : '—') + '</td>' +
        '<td>' + (hasPit ? fmtStat(s.pit_RA) : '—') + '</td>' +
        '<td>' + (hasPit ? fmtStat(s.pit_W) : '—') + '</td>' +
        '<td>' + (hasPit ? fmtStat(s.pit_L) : '—') + '</td>' +
        '<td>' + (hasPit ? fmtStat(s.pit_S) : '—') + '</td>' +
        '<td>' + (hasPit && s.pit_IP > 0 ? Number(s.pit_RA / s.pit_IP).toFixed(2) : '—') + '</td>';
    }
    var posCells = POS_COLS.map(function(k) {
      return '<td>' + ((s[k] != null && s[k] > 0) ? s[k] : '—') + '</td>';
    }).join('');
    return '<tr>' +
      '<td style="text-align:left;white-space:nowrap">' + s.season_label + '</td>' +
      '<td style="text-align:left;color:var(--sky-light);font-weight:600">' + pos + '</td>' +
      '<td>' + fmtStat(s.G) + '</td><td>' + fmtStat(s.AB) + '</td><td>' + fmtStat(s.R) + '</td>' +
      '<td>' + fmtStat(s.H) + '</td><td>' + fmtStat(s.RBI) + '</td>' +
      '<td>' + fmtStat(s.dbl) + '</td><td>' + fmtStat(s.trp) + '</td>' +
      '<td>' + fmtStat(s.HR) + '</td><td>' + fmtStat(s.BB) + '</td>' +
      '<td>' + fmtBA(s.BA) + '</td><td>' + fmtBA(s.OBP) + '</td>' +
      '<td>' + fmtBA(s.SLG) + '</td><td>' + fmtBA(s.OPS) + '</td>' +
      posCells +
      '<td>' + (s.MVP != null ? Number(s.MVP).toFixed(1) : '—') + '</td>' +
      '<td>' + fmtRV(s.RV) + '</td>' +
      pitCells + '</tr>';
  }

  function careerRow() {
    var pitCells = '';
    if (isPitcher) {
      pitCells = '<td>' + (career.pit_G||0) + '</td><td>' + (career.pit_GS||0) + '</td>' +
        '<td>' + fmtStat(career.pit_IP, 1) + '</td><td>' + (career.pit_RA||0) + '</td>' +
        '<td>' + (career.pit_W||0) + '</td><td>' + (career.pit_L||0) + '</td>' +
        '<td>' + (career.pit_S||0) + '</td>' +
        '<td>' + (career.pit_IP > 0 ? Number(career.pit_RA / career.pit_IP).toFixed(2) : '—') + '</td>';
    }
    var posCells = POS_COLS.map(function(k) { return '<td>' + (career['p_' + k] || 0) + '</td>'; }).join('');
    return '<tr class="career-row">' +
      '<td>CAREER</td><td>—</td>' +
      '<td>' + career.G + '</td><td>' + career.AB + '</td><td>' + career.R + '</td>' +
      '<td>' + career.H + '</td><td>' + career.RBI + '</td>' +
      '<td>' + career.dbl + '</td><td>' + career.trp + '</td>' +
      '<td>' + career.HR + '</td><td>' + career.BB + '</td>' +
      '<td>' + fmtBA(career.BA) + '</td><td>' + fmtBA(career.OBP) + '</td>' +
      '<td>' + fmtBA(career.SLG) + '</td><td>' + fmtBA(career.OPS) + '</td>' +
      posCells +
      '<td>—</td><td>' + fmtRV(career.RV) + '</td>' +
      pitCells + '</tr>';
  }

  var pitHeaders = isPitcher ? '<th>GP</th><th>GS</th><th>IP</th><th>RA</th><th>W</th><th>L</th><th>S</th><th>RIP</th>' : '';
  var thead = '<th style="text-align:left">Season</th><th style="text-align:left">Pos</th>' +
    '<th>G</th><th>AB</th><th>R</th><th>H</th><th>RBI</th><th>2B</th><th>3B</th><th>HR</th><th>BB</th>' +
    '<th>BA</th><th>OBP</th><th>SLG</th><th>OPS</th>' +
    '<th>P</th><th>C</th><th>1B</th><th>2B</th><th>3B</th><th>SS</th><th>LF</th><th>LC</th><th>RC</th><th>RF</th><th>DH</th>' +
    '<th>MVP</th><th>RV</th>' + pitHeaders;

  var logsTab = pLogs.length > 0
    ? '<button class="tab-btn" onclick="switchProfileTab(this,\'tab-gamelogs\')">Game Log</button>'
    : '';
  var logsPanel = pLogs.length > 0
    ? '<div id="tab-gamelogs" class="tab-panel">' + buildBoxTableWithPos(pLogs, true) + '</div>'
    : '';

  var statsContent = pStats.length === 0
    ? '<div class="empty-state">No official stats yet — Spring 2026 in progress!</div>'
    : '<div class="tabs">' +
        '<button class="tab-btn active" onclick="switchProfileTab(this,\'tab-seasons\')">By Season</button>' +
        logsTab +
      '</div>' +
      '<div id="tab-seasons" class="tab-panel active">' +
        '<div class="table-wrap"><table>' +
          '<thead><tr>' + thead + '</tr></thead>' +
          '<tbody>' + careerRow() + pStats.map(batRow).join('') + '</tbody>' +
        '</table></div>' +
      '</div>' +
      logsPanel;

  page.innerHTML =
    '<div class="profile-header"><a class="back-btn" onclick="navigate(\'players\')">← All Players</a></div>' +
    '<div class="profile-header" style="padding-top:0.5rem;flex-direction:column;align-items:center;text-align:center">' +
      '<div class="profile-photo">' + avatarImg(id) + '</div>' +
      '<div class="profile-info" style="text-align:center">' +
        '<div class="blade-name">' + player.first + ' ' + player.last + '</div>' +
        (akaStr ? '<div class="aka">' + akaStr + '</div>' : '') +
        '<div class="profile-meta" style="justify-content:center">' +
          (isActive ? '<span class="badge badge-current">Active</span>' : '') +
          '<span style="color:var(--text-dim);font-size:0.85rem">' + player.gender + ' · Bats ' + player.bat + ' · Throws ' + player.throw + '</span>' +
          (posDisplay ? '<span style="color:var(--sky);font-family:var(--font-display);font-weight:700;letter-spacing:0.08em">' + posDisplay + '</span>' : '') +
          (nS > 0 ? '<span style="color:var(--text-dim);font-size:0.85rem"><strong style="color:var(--text)">' + nS + '</strong> season' + (nS !== 1 ? 's' : '') + ' · ' + rangeStr + '</span>' : '') +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="container">' + statsContent + '</div>';
}

function switchProfileTab(btn, panelId) {
  var page = document.getElementById('page-profile');
  page.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
  page.querySelectorAll('.tab-panel').forEach(function(p) { p.classList.remove('active'); });
  btn.classList.add('active');
  var el = document.getElementById(panelId);
  if (el) el.classList.add('active');
}

// ── SEASONS / STATS ───────────────────────────────────────────────────────
function showSeasons() {
  document.getElementById('page-seasons').classList.add('active');
  var seasons = Array.from(new Set(DATA.stats.map(function(s) { return s.season_sort; }))).sort(function(a, b) { return b - a; });
  document.getElementById('season-select').innerHTML = seasons.map(function(s) {
    return '<option value="' + s + '">' + seasonLabel(s) + '</option>';
  }).join('');
  renderSeasonStats();
}

function renderSeasonStats() {
  var season = parseFloat(document.getElementById('season-select').value);
  var type = document.getElementById('stat-type').value;
  var rows = DATA.stats.filter(function(s) { return s.season_sort === season; });
  document.getElementById('season-label').textContent = seasonLabel(season);
  var tbody = document.getElementById('season-tbody');
  var thead = document.getElementById('season-thead');

  if (type === 'batting') {
    var sorted = rows.filter(function(s) { return (s.G || 0) > 0; })
      .sort(function(a, b) { return (b.G||0) - (a.G||0) || (b.AB||0) - (a.AB||0); });
    thead.innerHTML = '<tr>' +
      '<th onclick="sortSeason(0,true)" style="text-align:left">Player</th>' +
      '<th onclick="sortSeason(1)" style="text-align:left">Pos</th>' +
      '<th onclick="sortSeason(2)">G</th><th onclick="sortSeason(3)">AB</th>' +
      '<th onclick="sortSeason(4)">R</th><th onclick="sortSeason(5)">H</th>' +
      '<th onclick="sortSeason(6)">RBI</th><th onclick="sortSeason(7)">2B</th>' +
      '<th onclick="sortSeason(8)">3B</th><th onclick="sortSeason(9)">HR</th>' +
      '<th onclick="sortSeason(10)">BB</th><th onclick="sortSeason(11)">BA</th>' +
      '<th onclick="sortSeason(12)">OBP</th><th onclick="sortSeason(13)">SLG</th>' +
      '<th onclick="sortSeason(14)">OPS</th><th onclick="sortSeason(15)">MVP</th>' +
      '<th onclick="sortSeason(16)">RV</th></tr>';
    tbody.innerHTML = sorted.map(function(s) {
      return '<tr>' +
        '<td style="text-align:left"><a onclick="navigate(\'profile\',\'' + s.player_id + '\')">' + displayName(s.player_id) + '</a></td>' +
        '<td style="text-align:left;color:var(--sky-light)">' + primaryPos(s) + '</td>' +
        '<td>' + fmtStat(s.G) + '</td><td>' + fmtStat(s.AB) + '</td><td>' + fmtStat(s.R) + '</td>' +
        '<td>' + fmtStat(s.H) + '</td><td>' + fmtStat(s.RBI) + '</td>' +
        '<td>' + fmtStat(s.dbl) + '</td><td>' + fmtStat(s.trp) + '</td>' +
        '<td>' + fmtStat(s.HR) + '</td><td>' + fmtStat(s.BB) + '</td>' +
        '<td>' + fmtBA(s.BA) + '</td><td>' + fmtBA(s.OBP) + '</td>' +
        '<td>' + fmtBA(s.SLG) + '</td><td>' + fmtBA(s.OPS) + '</td>' +
        '<td>' + (s.MVP != null ? Number(s.MVP).toFixed(1) : '—') + '</td>' +
        '<td>' + fmtRV(s.RV) + '</td></tr>';
    }).join('');
  } else {
    var pit = rows.filter(function(s) { return s.pit_IP && s.pit_IP > 0; })
      .sort(function(a, b) { return (b.pit_IP||0) - (a.pit_IP||0); });
    thead.innerHTML = '<tr><th style="text-align:left">Player</th><th>G</th><th>GS</th><th>IP</th><th>RA</th><th>W</th><th>L</th><th>S</th><th>RIP</th></tr>';
    tbody.innerHTML = pit.length === 0
      ? '<tr><td colspan="9" style="text-align:center;color:var(--text-muted);padding:2rem">No pitching data for this season</td></tr>'
      : pit.map(function(s) {
          return '<tr>' +
            '<td style="text-align:left"><a onclick="navigate(\'profile\',\'' + s.player_id + '\')">' + displayName(s.player_id) + '</a></td>' +
            '<td>' + fmtStat(s.pit_G) + '</td><td>' + fmtStat(s.pit_GS) + '</td>' +
            '<td>' + fmtStat(s.pit_IP, 1) + '</td><td>' + fmtStat(s.pit_RA) + '</td>' +
            '<td>' + fmtStat(s.pit_W) + '</td><td>' + fmtStat(s.pit_L) + '</td>' +
            '<td>' + fmtStat(s.pit_S) + '</td>' +
            '<td>' + (s.RIP != null ? Number(s.RIP).toFixed(2) : '—') + '</td></tr>';
        }).join('');
  }
}

function sortSeason(col, isText) {
  var tbody = document.getElementById('season-tbody');
  var rows = Array.from(tbody.querySelectorAll('tr'));
  var asc = tbody.dataset.sortCol == col && tbody.dataset.sortDir === 'asc';
  tbody.dataset.sortCol = col; tbody.dataset.sortDir = asc ? 'desc' : 'asc';
  rows.sort(function(a, b) {
    var av = (a.cells[col] ? a.cells[col].textContent.trim() : '');
    var bv = (b.cells[col] ? b.cells[col].textContent.trim() : '');
    if (isText) return asc ? bv.localeCompare(av) : av.localeCompare(bv);
    return asc ? (parseFloat(av)||-Infinity) - (parseFloat(bv)||-Infinity) : (parseFloat(bv)||-Infinity) - (parseFloat(av)||-Infinity);
  });
  rows.forEach(function(r) { tbody.appendChild(r); });
  document.querySelectorAll('#season-thead th').forEach(function(th, i) {
    th.classList.remove('sort-asc','sort-desc');
    if (i === col) th.classList.add(asc ? 'sort-desc' : 'sort-asc');
  });
}

// ── GAME LOGS ─────────────────────────────────────────────────────────────
function showGameLogs() {
  document.getElementById('page-gamelogs').classList.add('active');
  var games = {};
  DATA.logs.forEach(function(l) {
    var key = l.date + '||' + l.game_num;
    if (!games[key]) games[key] = { date: l.date, game_num: l.game_num, opponent: l.opponent, rows: [] };
    games[key].rows.push(l);
  });
  var list = Object.values(games).sort(function(a, b) {
    return b.date.localeCompare(a.date) || b.game_num - a.game_num;
  });
  var years = Array.from(new Set(list.map(function(g) { return g.date.slice(0,4); }))).sort().reverse();
  document.getElementById('log-year-select').innerHTML =
    '<option value="all">All Years</option>' + years.map(function(y) { return '<option value="' + y + '">' + y + '</option>'; }).join('');
  window._gameList = list;
  renderGameList();
}

function renderGameList() {
  var year = document.getElementById('log-year-select').value;
  var games = window._gameList.filter(function(g) { return year === 'all' || g.date.startsWith(year); });
  document.getElementById('game-list').innerHTML = games.map(function(g) {
    var inner = buildBoxTableWithPos(g.rows.slice().sort(function(a, b) { return a.batting_order - b.batting_order; }), false);
    return '<div class="card mb1" style="cursor:pointer" onclick="toggleDetail(this)">' +
      '<div style="display:flex;justify-content:space-between;align-items:center">' +
        '<div>' +
          '<span style="font-family:var(--font-display);font-weight:700;font-size:1.05rem">' + g.date + '</span>' +
          '<span style="color:var(--text-muted);margin-left:0.75rem;font-size:0.9rem">vs ' + g.opponent + '</span>' +
        '</div>' +
        '<span style="color:var(--text-muted);font-size:0.85rem">' + g.rows.length + ' players ▼</span>' +
      '</div>' +
      '<div class="game-detail" style="display:none;margin-top:1rem">' + inner + '</div>' +
    '</div>';
  }).join('');
}

function toggleDetail(el) {
  var d = el.querySelector('.game-detail');
  d.style.display = d.style.display === 'none' ? 'block' : 'none';
}

// ── RECORDS ───────────────────────────────────────────────────────────────
function showRecords() {
  document.getElementById('page-records').classList.add('active');
  renderCareerLeaderboards();
  renderCustomLeaderboard();
}

function renderCareerLeaderboards() {
  var tots = computeAllCareerTotals();
  var entries = Object.entries(tots);
  var qual = entries.filter(function(e) { return e[1].AB >= 50; });
  var mIds = new Set(DATA.players.filter(function(p) { return p.gender === 'M'; }).map(function(p) { return p.id; }));
  var fIds = new Set(DATA.players.filter(function(p) { return p.gender === 'F'; }).map(function(p) { return p.id; }));

  function lrows(sorted, vfn, n) {
    return sorted.slice(0, n||10).map(function(e, i) {
      return '<tr>' +
        '<td style="text-align:left;color:var(--text-muted);width:1.5rem">' + (i+1) + '</td>' +
        '<td style="text-align:left"><a onclick="navigate(\'profile\',\'' + e[0] + '\')">' + displayName(e[0]) + '</a></td>' +
        '<td>' + vfn(e[1]) + '</td></tr>';
    }).join('');
  }

  function splitCard(title, sorted, vfn) {
    var mRows = sorted.filter(function(e) { return mIds.has(e[0]); });
    var fRows = sorted.filter(function(e) { return fIds.has(e[0]); });
    return '<div style="margin-bottom:1.25rem">' +
      '<div class="section-title">' + title + '</div>' +
      '<div class="split-tables">' +
        '<div><div class="split-label split-label-m">Men</div>' +
          '<div class="table-wrap"><table><tbody>' + lrows(mRows, vfn) + '</tbody></table></div></div>' +
        '<div><div class="split-label split-label-f">Women</div>' +
          '<div class="table-wrap"><table><tbody>' + lrows(fRows, vfn) + '</tbody></table></div></div>' +
      '</div></div>';
  }

  var byG   = entries.slice().sort(function(a,b){return b[1].G-a[1].G;});
  var byH   = entries.slice().sort(function(a,b){return b[1].H-a[1].H;});
  var byRBI = entries.slice().sort(function(a,b){return b[1].RBI-a[1].RBI;});
  var byHR  = entries.slice().sort(function(a,b){return b[1].HR-a[1].HR;});
  var byBA  = qual.slice().sort(function(a,b){return (b[1].H/b[1].AB)-(a[1].H/a[1].AB);});
  var byRV  = entries.slice().sort(function(a,b){return b[1].RV-a[1].RV;});
  var byW   = entries.slice().sort(function(a,b){return b[1].pit_W-a[1].pit_W;});

  document.getElementById('records-static').innerHTML =
    splitCard('Career Games Played', byG,  function(t){return t.G;}) +
    splitCard('Career Hits',         byH,  function(t){return t.H;}) +
    splitCard('Career RBI',          byRBI,function(t){return t.RBI;}) +
    splitCard('Career Home Runs',    byHR, function(t){return t.HR;}) +
    splitCard('Career BA (min 50 AB)',byBA,function(t){return fmtBA(t.H/t.AB);}) +
    splitCard('Career RV',           byRV, function(t){return fmtRV(t.RV);}) +
    splitCard('Career Pitching Wins',byW,  function(t){return t.pit_W;});
}

function renderCustomLeaderboard() {
  var season  = document.getElementById('lb-season').value;
  var gender  = document.getElementById('lb-gender').value;
  var minAB   = parseInt(document.getElementById('lb-minab').value) || 0;
  var scope   = document.getElementById('lb-scope').value;

  function genderOk(id) {
    if (gender === 'all') return true;
    var p = getPlayer(id); return p && p.gender === gender;
  }

  var rows = [];
  if (scope === 'season') {
    rows = DATA.stats.filter(function(s) {
      if (season !== 'all' && String(s.season_sort) !== season) return false;
      if (!genderOk(s.player_id)) return false;
      if (minAB > 0 && (s.AB||0) < minAB) return false;
      if ((s.G||0) === 0) return false;
      return true;
    }).map(function(s) {
      return {
        name: displayName(s.player_id), pid: s.player_id, season: s.season_label,
        G:s.G||0, AB:s.AB||0, R:s.R||0, H:s.H||0, RBI:s.RBI||0,
        dbl:s.dbl||0, trp:s.trp||0, HR:s.HR||0, BB:s.BB||0,
        BA:s.BA, OBP:s.OBP, SLG:s.SLG, OPS:s.OPS,
        MVP:s.MVP, RV:s.RV, pit_W:s.pit_W||0, pit_IP:s.pit_IP||0,
        RIP: s.pit_IP>0 ? s.pit_RA/s.pit_IP : null,
      };
    });
  } else {
    var tots = {};
    DATA.stats.forEach(function(s) {
      if (!genderOk(s.player_id)) return;
      if (season !== 'all' && String(s.season_sort) !== season) return;
      if (!tots[s.player_id]) tots[s.player_id]={G:0,AB:0,H:0,HR:0,RBI:0,R:0,dbl:0,trp:0,BB:0,RV:0,pit_W:0,pit_IP:0,pit_RA:0,MVP_sum:0};
      var t=tots[s.player_id];
      t.G+=s.G||0;t.AB+=s.AB||0;t.H+=s.H||0;t.HR+=s.HR||0;t.RBI+=s.RBI||0;
      t.R+=s.R||0;t.dbl+=s.dbl||0;t.trp+=s.trp||0;t.BB+=s.BB||0;t.RV+=s.RV||0;
      t.pit_W+=s.pit_W||0;t.pit_IP+=s.pit_IP||0;t.pit_RA+=s.pit_RA||0;t.MVP_sum+=s.MVP||0;
    });
    rows = Object.entries(tots).filter(function(e) { return (minAB===0||e[1].AB>=minAB) && e[1].G>0; })
      .map(function(e) {
        var id=e[0], t=e[1];
        var sg=t.H-t.dbl-t.trp-t.HR;
        var ba=t.AB>0?t.H/t.AB:null;
        var obp=(t.AB+t.BB)>0?(t.H+t.BB)/(t.AB+t.BB):null;
        var slg=t.AB>0?(sg+2*t.dbl+3*t.trp+4*t.HR)/t.AB:null;
        return {
          name:displayName(id), pid:id, season:'Career',
          G:t.G,AB:t.AB,R:t.R,H:t.H,RBI:t.RBI,dbl:t.dbl,trp:t.trp,HR:t.HR,BB:t.BB,
          BA:ba, OBP:obp, SLG:slg, OPS:(obp!=null&&slg!=null)?obp+slg:null,
          MVP:t.MVP_sum, RV:t.RV, pit_W:t.pit_W, pit_IP:t.pit_IP,
          RIP:t.pit_IP>0?t.pit_RA/t.pit_IP:null,
        };
      });
  }

  rows.sort(function(a,b){return (b.G||0)-(a.G||0);});
  window._lbRows = rows;
  window._lbSortCol = 'G';
  window._lbSortAsc = false;
  renderLbTable();
}

function renderLbTable() {
  var rows = window._lbRows || [];
  var sortCol = window._lbSortCol || 'G';
  var asc = window._lbSortAsc;
  var showSeason = document.getElementById('lb-scope').value === 'season' &&
    document.getElementById('lb-season').value === 'all';

  var sorted = rows.slice().sort(function(a,b) {
    var av=a[sortCol], bv=b[sortCol];
    if(av==null&&bv==null) return 0;
    if(av==null) return 1; if(bv==null) return -1;
    if(typeof av==='string') return asc?av.localeCompare(bv):bv.localeCompare(av);
    return asc?av-bv:bv-av;
  });

  var cols = [
    {k:'name',  label:'Player', fmt:function(v){return v;}, left:true, text:true},
  ];
  if (showSeason) cols.push({k:'season', label:'Season', fmt:function(v){return v;}, left:true, text:true});
  cols = cols.concat([
    {k:'G',      label:'G',   fmt:function(v){return v==null?'—':v;}},
    {k:'AB',     label:'AB',  fmt:function(v){return v==null?'—':v;}},
    {k:'R',      label:'R',   fmt:function(v){return v==null?'—':v;}},
    {k:'H',      label:'H',   fmt:function(v){return v==null?'—':v;}},
    {k:'RBI',    label:'RBI', fmt:function(v){return v==null?'—':v;}},
    {k:'dbl',    label:'2B',  fmt:function(v){return v==null?'—':v;}},
    {k:'trp',    label:'3B',  fmt:function(v){return v==null?'—':v;}},
    {k:'HR',     label:'HR',  fmt:function(v){return v==null?'—':v;}},
    {k:'BB',     label:'BB',  fmt:function(v){return v==null?'—':v;}},
    {k:'BA',     label:'BA',  fmt:fmtBA},
    {k:'OBP',    label:'OBP', fmt:fmtBA},
    {k:'SLG',    label:'SLG', fmt:fmtBA},
    {k:'OPS',    label:'OPS', fmt:fmtBA},
    {k:'MVP',    label:'MVP', fmt:function(v){return v!=null?Number(v).toFixed(1):'—';}},
    {k:'RV',     label:'RV',  fmt:function(v){return fmtRV(v);}},
    {k:'pit_W',  label:'W',   fmt:function(v){return v==null?'—':v;}},
    {k:'pit_IP', label:'IP',  fmt:function(v){return v!=null?Number(v).toFixed(1):'—';}},
    {k:'RIP',    label:'RIP', fmt:function(v){return v!=null?Number(v).toFixed(2):'—';}},
  ]);

  var thCells = cols.map(function(c) {
    var active = sortCol === c.k;
    var style = (c.left ? 'text-align:left;' : '') + (active ? 'color:var(--gold)' : '');
    var arrow = active ? (asc ? ' ▲' : ' ▼') : '';
    return '<th onclick="lbSort(\'' + c.k + '\')" style="' + style + '">' + c.label + arrow + '</th>';
  }).join('');

  var tbRows = sorted.slice(0, 50).map(function(r) {
    var tds = cols.map(function(c) {
      var style = c.left ? 'text-align:left' : '';
      var extra = c.k === 'name' ? ' onclick="navigate(\'profile\',\'' + r.pid + '\')" style="' + style + ';cursor:pointer"' : ' style="' + style + '"';
      return '<td' + extra + '>' + c.fmt(r[c.k]) + '</td>';
    }).join('');
    return '<tr>' + tds + '</tr>';
  }).join('');

  document.getElementById('lb-results').innerHTML =
    '<div class="table-wrap"><table>' +
    '<thead><tr>' + thCells + '</tr></thead>' +
    '<tbody>' + tbRows + '</tbody>' +
    '</table></div>';
}

function lbSort(key) {
  if (window._lbSortCol === key) window._lbSortAsc = !window._lbSortAsc;
  else { window._lbSortCol = key; window._lbSortAsc = false; }
  renderLbTable();
}

// ── SCHEDULE ──────────────────────────────────────────────────────────────
function showSchedule() {
  document.getElementById('page-schedule').classList.add('active');
  var tbody = document.getElementById('schedule-tbody');
  tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:var(--text-muted);padding:2rem">Loading...</td></tr>';
  fetch(SCHEDULE_URL).then(function(r) { return r.text(); }).then(function(text) {
    var lines = text.trim().replace(/\r/g,'').split('\n');
    var headers = dedupeHeaders(parseLine(lines[0]));
    var rows = lines.slice(1).map(function(line) {
      var vals = parseLine(line), obj = {};
      headers.forEach(function(h,i) { obj[h] = vals[i]||''; });
      return obj;
    }).filter(function(r) { return Object.values(r).some(function(v){return v!==''}); });
    window._scheduleRows = rows;
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:var(--text-muted);padding:2rem">No games yet</td></tr>';
      return;
    }
    var w=0, l=0;
    tbody.innerHTML = rows.map(function(r) {
      var result = (r['W/L']||'').trim().toUpperCase();
      if(result==='W') w++; else if(result==='L') l++;
      var hasResult = result==='W'||result==='L';
      var color = result==='W'?'var(--green)':result==='L'?'var(--red)':'var(--text)';
      var rec = hasResult ? (w+'-'+l) : '';
      return '<tr>' +
        '<td style="text-align:left">' + (r['G#']||'') + '</td>' +
        '<td style="text-align:left">' + (r['Day']||'') + '</td>' +
        '<td style="text-align:left;white-space:nowrap">' + (r['Date']||'') + '</td>' +
        '<td>' + fmtTime(r['Time']||'') + '</td>' +
        '<td>' + (r['H/A']||'') + '</td>' +
        '<td style="text-align:left">' + (r['Opponent']||'') + '</td>' +
        '<td style="color:' + color + ';font-weight:600">' + result + '</td>' +
        '<td>' + (r['RS']||'') + '</td>' +
        '<td>' + (r['RA']||'') + '</td>' +
        '<td style="text-align:left">' + (r['Rec']||rec) + '</td></tr>';
    }).join('');
  }).catch(function() {
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:var(--red);padding:2rem">Failed to load schedule</td></tr>';
  });
}

// ── STANDINGS ─────────────────────────────────────────────────────────────
function showStandings() {
  document.getElementById('page-standings').classList.add('active');
  var tbody = document.getElementById('standings-tbody');
  tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:2rem">Loading...</td></tr>';
  fetch(STANDINGS_URL).then(function(r) { return r.text(); }).then(function(text) {
    var lines = text.trim().replace(/\r/g,'').split('\n');
    var headers = dedupeHeaders(parseLine(lines[0]));
    var rows = lines.slice(1).map(function(line) {
      var vals = parseLine(line), obj = {};
      headers.forEach(function(h,i) { obj[h] = vals[i]||''; });
      return obj;
    }).filter(function(r) { return Object.values(r).some(function(v){return v!==''}); });
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:2rem">No standings data yet</td></tr>';
      return;
    }
    var keys = Object.keys(rows[0]);
    var teamKey = keys.find(function(k){return /team/i.test(k);})||keys[0];
    var wKey    = keys.find(function(k){return /^w$/i.test(k.trim());})||keys[1];
    var lKey    = keys.find(function(k){return /^l$/i.test(k.trim());})||keys[2];
    var pctKey  = keys.find(function(k){return /win|pct|%/i.test(k);})||keys[3];
    rows.sort(function(a,b){return Number(b[pctKey]||0)-Number(a[pctKey]||0);});
    tbody.innerHTML = rows.map(function(r) {
      var team = r[teamKey]||'';
      var pct = r[pctKey] ? Number(r[pctKey]).toFixed(3).replace(/^0\./,'.') : '';
      var isUs = /squid/i.test(team);
      return '<tr' + (isUs?' style="background:var(--surface-raised);border-left:3px solid var(--sky)"':'') + '>' +
        '<td style="text-align:left;font-weight:' + (isUs?'700':'400') + ';color:' + (isUs?'var(--sky)':'var(--text)') + '">' + team + '</td>' +
        '<td style="width:2.5rem">' + (r[wKey]||'') + '</td>' +
        '<td style="width:2.5rem">' + (r[lKey]||'') + '</td>' +
        '<td style="width:3.5rem">' + pct + '</td></tr>';
    }).join('');
  }).catch(function() {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--red);padding:2rem">Failed to load standings</td></tr>';
  });
}

// ── INIT ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async function() {
  await loadData();
  var seasons = Array.from(new Set(DATA.stats.map(function(s){return s.season_sort;}))).sort(function(a,b){return b-a;});
  document.getElementById('lb-season').innerHTML =
    '<option value="all">All Seasons</option>' +
    seasons.map(function(s){return '<option value="'+s+'">'+seasonLabel(s)+'</option>';}).join('');
  navigate('home');
});
