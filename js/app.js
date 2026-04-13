// ── DATA ──────────────────────────────────────────────────────────────────
const DATA = { players: [], stats: [], logs: [] };
const AKA = { 'Gomez': 'AlmonteJ', 'DeBoer': 'SimonsK' };

async function loadData() {
  const [p, s, l] = await Promise.all([
    fetch('data/players.json').then(r => r.json()),
    fetch('data/season_stats.json').then(r => r.json()),
    fetch('data/game_logs.json').then(r => r.json()),
  ]);
  DATA.players = p;
  DATA.stats = s;
  DATA.logs = l;
}

function getPlayer(id) {
  return DATA.players.find(p => p.id === id);
}

function displayName(id) {
  const p = getPlayer(id);
  return p ? `${p.first} ${p.last}` : id;
}

function fmtStat(val, decimals = 0, isAvg = false) {
  if (val === null || val === undefined) return '—';
  if (isAvg) return Number(val).toFixed(3).replace(/^0/, '');
  return Number(val).toFixed(decimals);
}

function fmtBA(val) {
  if (val === null || val === undefined) return '—';
  return Number(val).toFixed(3).replace(/^0\./, '.');
}

// ── ROUTING ───────────────────────────────────────────────────────────────
const ROUTES = {
  home: showHome,
  players: showPlayers,
  seasons: showSeasons,
  gamelogs: showGameLogs,
  records: showRecords,
};

let currentRoute = 'home';
let currentPlayer = null;

function navigate(route, param = null) {
  currentRoute = route;
  currentPlayer = param;

  // Hide all pages
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  // Update nav
  document.querySelectorAll('nav a[data-route]').forEach(a => {
    a.classList.toggle('active', a.dataset.route === route);
  });

  if (route === 'profile' && param) {
    showProfile(param);
  } else if (ROUTES[route]) {
    ROUTES[route]();
  }

  window.scrollTo(0, 0);
}

// ── HOME ──────────────────────────────────────────────────────────────────
function showHome() {
  const page = document.getElementById('page-home');
  page.classList.add('active');

  // Career leaders snapshot
  const leaders = getCareerLeaders();
  document.getElementById('home-leaders').innerHTML = leaders.map(([stat, player, val, fmt]) => `
    <div class="card">
      <div class="card-title">${stat}</div>
      <div style="font-family:var(--font-display);font-size:1.4rem;font-weight:700;color:var(--sky)">${fmt}</div>
      <div style="font-size:0.85rem;color:var(--text-dim);margin-top:0.2rem;cursor:pointer" onclick="navigate('profile','${player}')">${displayName(player)}</div>
    </div>
  `).join('');

  // Recent game logs
  const recent = [...DATA.logs]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);
  const recentGame = recent[0];

  if (recentGame) {
    const gamePlayers = DATA.logs.filter(l => l.date === recentGame.date && l.game_num === recentGame.game_num);
    document.getElementById('home-recent').innerHTML = `
      <div class="section-title">Most Recent Game — ${recentGame.date} vs ${recentGame.opponent}</div>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Player</th><th>AB</th><th>R</th><th>H</th><th>RBI</th><th>2B</th><th>3B</th><th>HR</th><th>BB</th><th>RV</th>
          </tr></thead>
          <tbody>
            ${gamePlayers.map(p => `<tr>
              <td><a onclick="navigate('profile','${p.player_id}')" style="cursor:pointer">${displayName(p.player_id)}</a></td>
              <td>${fmtStat(p.AB)}</td><td>${fmtStat(p.R)}</td><td>${fmtStat(p.H)}</td>
              <td>${fmtStat(p.RBI)}</td><td>${fmtStat(p.dbl)}</td><td>${fmtStat(p.trp)}</td>
              <td>${fmtStat(p.HR)}</td><td>${fmtStat(p.BB)}</td>
              <td>${p.RV !== null && p.RV !== undefined ? Number(p.RV).toFixed(2) : '—'}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    `;
  }
}

function getCareerLeaders() {
  // Aggregate career stats
  const totals = {};
  DATA.stats.forEach(s => {
    if (!totals[s.player_id]) totals[s.player_id] = { AB: 0, H: 0, HR: 0, RBI: 0, R: 0, BB: 0, RV: 0, IP: 0 };
    const t = totals[s.player_id];
    t.AB += s.AB || 0;
    t.H += s.H || 0;
    t.HR += s.HR || 0;
    t.RBI += s.RBI || 0;
    t.R += s.R || 0;
    t.BB += s.BB || 0;
    t.RV += s.RV || 0;
    t.IP += s.pit_IP || 0;
  });

  const qualified = Object.entries(totals).filter(([, t]) => t.AB >= 50);

  const byHR = [...Object.entries(totals)].sort((a, b) => b[1].HR - a[1].HR)[0];
  const byRBI = [...Object.entries(totals)].sort((a, b) => b[1].RBI - a[1].RBI)[0];
  const byBA = qualified.map(([id, t]) => [id, t.H / t.AB]).sort((a, b) => b[1] - a[1])[0];
  const byRV = [...Object.entries(totals)].sort((a, b) => b[1].RV - a[1].RV)[0];

  return [
    ['Career HR Leader', byHR[0], byHR[1].HR, byHR[1].HR],
    ['Career RBI Leader', byRBI[0], byRBI[1].RBI, byRBI[1].RBI],
    ['Career BA Leader', byBA[0], byBA[1], fmtBA(byBA[1])],
    ['Career RV Leader', byRV[0], byRV[1].RV, Number(byRV[1].RV).toFixed(1)],
  ];
}

// ── PLAYERS ───────────────────────────────────────────────────────────────
function showPlayers() {
  const page = document.getElementById('page-players');
  page.classList.add('active');
  renderRoster();
}

function renderRoster(filter = '', genderFilter = 'all') {
  const container = document.getElementById('roster-grid');
  let players = DATA.players;

  if (filter) {
    const q = filter.toLowerCase();
    players = players.filter(p =>
      p.first.toLowerCase().includes(q) ||
      p.last.toLowerCase().includes(q) ||
      p.id.toLowerCase().includes(q)
    );
  }

  if (genderFilter !== 'all') {
    players = players.filter(p => p.gender === genderFilter);
  }

  players = players.sort((a, b) => a.last.localeCompare(b.last));

  // Tag active (has stats in 2024 or 2025)
  const recentPlayers = new Set(
    DATA.stats.filter(s => s.season_year >= 2024).map(s => s.player_id)
  );

  container.innerHTML = players.map(p => {
    const isRecent = recentPlayers.has(p.id);
    const seasons = DATA.stats.filter(s => s.player_id === p.id).length;
    return `
      <div class="roster-card" onclick="navigate('profile','${p.id}')">
        <div class="roster-avatar">🦑</div>
        <div>
          <div class="roster-name">${p.first} ${p.last}</div>
          <div class="roster-sub">
            ${isRecent ? '<span class="badge badge-current">Active</span> ' : ''}
            <span class="badge badge-${p.gender.toLowerCase()}">${p.gender}</span>
            ${seasons > 0 ? `<br>${seasons} season${seasons !== 1 ? 's' : ''}` : '<br>No stats yet'}
          </div>
        </div>
      </div>
    `;
  }).join('');

  if (!players.length) {
    container.innerHTML = '<div class="empty-state">No players found</div>';
  }
}

// ── PROFILE ───────────────────────────────────────────────────────────────
function showProfile(id) {
  const page = document.getElementById('page-profile');
  page.classList.add('active');

  const player = getPlayer(id);
  if (!player) {
    page.innerHTML = '<div class="container"><p>Player not found.</p></div>';
    return;
  }

  const playerStats = DATA.stats
    .filter(s => s.player_id === id)
    .sort((a, b) => b.season_sort - a.season_sort);

  const playerLogs = DATA.logs
    .filter(l => l.player_id === id)
    .sort((a, b) => b.date.localeCompare(a.date));

  // Career totals
  const career = computeCareerTotals(playerStats);
  const hasPitching = playerStats.some(s => s.pit_IP && s.pit_IP > 0);
  const akaName = AKA[id] ? `Also appears as: ${AKA[id]}` : '';

  // Positions played across career
  const posCols = ['pos_P','pos_C','pos_1B','pos_2B','pos_3B','pos_SS','pos_LF','pos_LC','pos_RC','pos_RF','pos_DH'];
  const posLabels = { pos_P:'P', pos_C:'C', pos_1B:'1B', pos_2B:'2B', pos_3B:'3B', pos_SS:'SS', pos_LF:'LF', pos_LC:'LC', pos_RC:'RC', pos_RF:'RF', pos_DH:'DH' };
  const posAppearances = {};
  posCols.forEach(pos => {
    const total = playerStats.reduce((sum, s) => sum + (s[pos] || 0), 0);
    if (total > 0) posAppearances[pos] = total;
  });

  page.innerHTML = `
    <div class="profile-header">
      <div>
        <a class="back-btn" onclick="navigate('players')">← All Players</a>
      </div>
    </div>
    <div class="profile-header" style="padding-top:0.5rem">
      <div class="profile-photo">🦑</div>
      <div class="profile-info">
        <h2>${player.first} ${player.last}</h2>
        ${akaName ? `<div class="aka">${akaName}</div>` : ''}
        <div class="profile-meta">
          <span><strong>${player.gender}</strong> · Bats ${player.bat} · Throws ${player.throw}</span>
          ${playerStats.length > 0 ? `<span><strong>${playerStats.length}</strong> seasons</span>` : ''}
          ${Object.keys(posAppearances).length > 0 ? `<span>Positions: ${Object.keys(posAppearances).map(p => `<span class="pill">${posLabels[p]}</span>`).join(' ')}</span>` : ''}
        </div>
      </div>
    </div>

    <div class="container">
      ${playerStats.length === 0 ? `
        <div class="empty-state">No official stats recorded yet — Spring 2026 in progress!</div>
      ` : `
        <!-- Career Summary -->
        <div class="section-title">Career Batting</div>
        <div class="stat-grid mb1">
          <div class="stat-box"><div class="val">${career.G}</div><div class="lbl">G</div></div>
          <div class="stat-box"><div class="val">${career.AB}</div><div class="lbl">AB</div></div>
          <div class="stat-box"><div class="val">${career.H}</div><div class="lbl">H</div></div>
          <div class="stat-box"><div class="val">${career.HR}</div><div class="lbl">HR</div></div>
          <div class="stat-box"><div class="val">${career.RBI}</div><div class="lbl">RBI</div></div>
          <div class="stat-box"><div class="val">${career.R}</div><div class="lbl">R</div></div>
          <div class="stat-box"><div class="val">${career.dbl}</div><div class="lbl">2B</div></div>
          <div class="stat-box"><div class="val">${career.trp}</div><div class="lbl">3B</div></div>
          <div class="stat-box"><div class="val">${career.BB}</div><div class="lbl">BB</div></div>
          <div class="stat-box"><div class="val">${fmtBA(career.BA)}</div><div class="lbl">BA</div></div>
          <div class="stat-box"><div class="val">${fmtBA(career.OBP)}</div><div class="lbl">OBP</div></div>
          <div class="stat-box"><div class="val">${fmtBA(career.SLG)}</div><div class="lbl">SLG</div></div>
          <div class="stat-box"><div class="val">${fmtBA(career.OPS)}</div><div class="lbl">OPS</div></div>
          <div class="stat-box"><div class="val">${Number(career.RV).toFixed(1)}</div><div class="lbl">Career RV</div></div>
        </div>

        ${hasPitching ? `
          <div class="section-title mt2">Career Pitching</div>
          <div class="stat-grid mb1">
            ${['pit_G','pit_GS','pit_IP','pit_RA','pit_W','pit_L','RIP'].map(k => {
              const total = playerStats.reduce((sum, s) => sum + (s[k] || 0), 0);
              const label = { pit_G:'G', pit_GS:'GS', pit_IP:'IP', pit_RA:'RA', pit_W:'W', pit_L:'L', RIP:'RIP' }[k];
              const val = k === 'RIP'
                ? (playerStats.reduce((sum,s)=>sum+(s.pit_IP||0),0) > 0
                    ? fmtStat(playerStats.reduce((sum,s)=>sum+(s.pit_RA||0),0) / playerStats.reduce((sum,s)=>sum+(s.pit_IP||0),0), 2)
                    : '—')
                : fmtStat(total, k === 'pit_IP' ? 1 : 0);
              return `<div class="stat-box"><div class="val">${val}</div><div class="lbl">${label}</div></div>`;
            }).join('')}
          </div>
        ` : ''}

        <!-- Tabs -->
        <div class="tabs mt2">
          <button class="tab-btn active" onclick="switchTab(this,'tab-seasons')">By Season</button>
          ${playerLogs.length > 0 ? `<button class="tab-btn" onclick="switchTab(this,'tab-gamelogs')">Game Log</button>` : ''}
        </div>

        <div id="tab-seasons" class="tab-panel active">
          <div class="table-wrap">
            <table>
              <thead><tr>
                <th>Season</th><th>G</th><th>AB</th><th>H</th><th>HR</th><th>RBI</th><th>R</th>
                <th>2B</th><th>3B</th><th>BB</th><th>BA</th><th>OBP</th><th>SLG</th><th>OPS</th><th>RV</th><th>MVP</th>
                ${hasPitching ? '<th>IP</th><th>W</th><th>L</th><th>RIP</th>' : ''}
              </tr></thead>
              <tbody>
                ${playerStats.map(s => `<tr>
                  <td style="text-align:left;white-space:nowrap">${s.season_label}</td>
                  <td>${fmtStat(s.G)}</td><td>${fmtStat(s.AB)}</td><td>${fmtStat(s.H)}</td>
                  <td>${fmtStat(s.HR)}</td><td>${fmtStat(s.RBI)}</td><td>${fmtStat(s.R)}</td>
                  <td>${fmtStat(s.dbl)}</td><td>${fmtStat(s.trp)}</td><td>${fmtStat(s.BB)}</td>
                  <td>${fmtBA(s.BA)}</td><td>${fmtBA(s.OBP)}</td><td>${fmtBA(s.SLG)}</td><td>${fmtBA(s.OPS)}</td>
                  <td>${s.RV !== null && s.RV !== undefined ? Number(s.RV).toFixed(1) : '—'}</td>
                  <td>${s.MVP !== null && s.MVP !== undefined ? Number(s.MVP).toFixed(1) : '—'}</td>
                  ${hasPitching ? `<td>${fmtStat(s.pit_IP,1)}</td><td>${fmtStat(s.pit_W)}</td><td>${fmtStat(s.pit_L)}</td><td>${s.RIP !== null && s.RIP !== undefined ? Number(s.RIP).toFixed(2) : '—'}</td>` : ''}
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>

        ${playerLogs.length > 0 ? `
          <div id="tab-gamelogs" class="tab-panel">
            <div class="table-wrap">
              <table>
                <thead><tr>
                  <th>Date</th><th>Opp</th><th>AB</th><th>R</th><th>H</th><th>RBI</th>
                  <th>2B</th><th>3B</th><th>HR</th><th>BB</th><th>RV</th>
                </tr></thead>
                <tbody>
                  ${playerLogs.map(l => `<tr>
                    <td style="text-align:left">${l.date}</td>
                    <td style="text-align:left">${l.opponent || '—'}</td>
                    <td>${fmtStat(l.AB)}</td><td>${fmtStat(l.R)}</td><td>${fmtStat(l.H)}</td>
                    <td>${fmtStat(l.RBI)}</td><td>${fmtStat(l.dbl)}</td><td>${fmtStat(l.trp)}</td>
                    <td>${fmtStat(l.HR)}</td><td>${fmtStat(l.BB)}</td>
                    <td>${l.RV !== null && l.RV !== undefined ? Number(l.RV).toFixed(2) : '—'}</td>
                  </tr>`).join('')}
                </tbody>
              </table>
            </div>
          </div>
        ` : ''}
      `}
    </div>
  `;
}

function computeCareerTotals(stats) {
  const t = { G:0, AB:0, H:0, HR:0, RBI:0, R:0, dbl:0, trp:0, BB:0, RV:0 };
  stats.forEach(s => {
    t.G += s.G || 0;
    t.AB += s.AB || 0;
    t.H += s.H || 0;
    t.HR += s.HR || 0;
    t.RBI += s.RBI || 0;
    t.R += s.R || 0;
    t.dbl += s.dbl || 0;
    t.trp += s.trp || 0;
    t.BB += s.BB || 0;
    t.RV += s.RV || 0;
  });
  t.BA = t.AB > 0 ? t.H / t.AB : null;
  t.OBP = (t.AB + t.BB) > 0 ? (t.H + t.BB) / (t.AB + t.BB) : null;
  const singles = t.H - t.dbl - t.trp - t.HR;
  t.SLG = t.AB > 0 ? (singles + 2*t.dbl + 3*t.trp + 4*t.HR) / t.AB : null;
  t.OPS = (t.OBP !== null && t.SLG !== null) ? t.OBP + t.SLG : null;
  return t;
}

// ── SEASONS ───────────────────────────────────────────────────────────────
function showSeasons() {
  const page = document.getElementById('page-seasons');
  page.classList.add('active');

  const seasons = [...new Set(DATA.stats.map(s => s.season_sort))].sort((a, b) => b - a);

  document.getElementById('season-select').innerHTML =
    seasons.map(s => {
      const label = DATA.stats.find(r => r.season_sort === s)?.season_label || s;
      return `<option value="${s}">${label}</option>`;
    }).join('');

  renderSeasonStats();
}

function renderSeasonStats() {
  const season = parseFloat(document.getElementById('season-select').value);
  const statType = document.getElementById('stat-type').value;
  const rows = DATA.stats.filter(s => s.season_sort === season);
  const label = rows[0]?.season_label || season;

  document.getElementById('season-label').textContent = label;

  const tbody = document.getElementById('season-tbody');
  const hasPitching = statType === 'pitching';

  if (!hasPitching) {
    const sorted = [...rows].sort((a, b) => (b.OPS || 0) - (a.OPS || 0));
    document.getElementById('season-thead').innerHTML = `<tr>
      <th onclick="sortTable('season-tbody',0,true)">Player</th>
      <th onclick="sortTable('season-tbody',1)">G</th>
      <th onclick="sortTable('season-tbody',2)">AB</th>
      <th onclick="sortTable('season-tbody',3)">H</th>
      <th onclick="sortTable('season-tbody',4)">HR</th>
      <th onclick="sortTable('season-tbody',5)">RBI</th>
      <th onclick="sortTable('season-tbody',6)">R</th>
      <th onclick="sortTable('season-tbody',7)">2B</th>
      <th onclick="sortTable('season-tbody',8)">3B</th>
      <th onclick="sortTable('season-tbody',9)">BB</th>
      <th onclick="sortTable('season-tbody',10)">BA</th>
      <th onclick="sortTable('season-tbody',11)">OBP</th>
      <th onclick="sortTable('season-tbody',12)">SLG</th>
      <th onclick="sortTable('season-tbody',13)">OPS</th>
      <th onclick="sortTable('season-tbody',14)">RV</th>
      <th onclick="sortTable('season-tbody',15)">MVP</th>
    </tr>`;
    tbody.innerHTML = sorted.map(s => `<tr>
      <td><a onclick="navigate('profile','${s.player_id}')" style="cursor:pointer">${displayName(s.player_id)}</a></td>
      <td>${fmtStat(s.G)}</td><td>${fmtStat(s.AB)}</td><td>${fmtStat(s.H)}</td>
      <td>${fmtStat(s.HR)}</td><td>${fmtStat(s.RBI)}</td><td>${fmtStat(s.R)}</td>
      <td>${fmtStat(s.dbl)}</td><td>${fmtStat(s.trp)}</td><td>${fmtStat(s.BB)}</td>
      <td>${fmtBA(s.BA)}</td><td>${fmtBA(s.OBP)}</td><td>${fmtBA(s.SLG)}</td><td>${fmtBA(s.OPS)}</td>
      <td>${s.RV !== null && s.RV !== undefined ? Number(s.RV).toFixed(1) : '—'}</td>
      <td>${s.MVP !== null && s.MVP !== undefined ? Number(s.MVP).toFixed(1) : '—'}</td>
    </tr>`).join('');
  } else {
    const pitchers = rows.filter(s => s.pit_IP && s.pit_IP > 0).sort((a, b) => (b.pit_IP || 0) - (a.pit_IP || 0));
    document.getElementById('season-thead').innerHTML = `<tr>
      <th>Player</th><th>G</th><th>GS</th><th>IP</th><th>RA</th><th>W</th><th>L</th><th>S</th><th>RIP</th>
    </tr>`;
    if (pitchers.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--text-muted);padding:2rem">No pitching data for this season</td></tr>';
    } else {
      tbody.innerHTML = pitchers.map(s => `<tr>
        <td><a onclick="navigate('profile','${s.player_id}')" style="cursor:pointer">${displayName(s.player_id)}</a></td>
        <td>${fmtStat(s.pit_G)}</td><td>${fmtStat(s.pit_GS)}</td><td>${fmtStat(s.pit_IP,1)}</td>
        <td>${fmtStat(s.pit_RA)}</td><td>${fmtStat(s.pit_W)}</td><td>${fmtStat(s.pit_L)}</td>
        <td>${fmtStat(s.pit_S)}</td>
        <td>${s.RIP !== null && s.RIP !== undefined ? Number(s.RIP).toFixed(2) : '—'}</td>
      </tr>`).join('');
    }
  }
}

// ── GAME LOGS ─────────────────────────────────────────────────────────────
function showGameLogs() {
  const page = document.getElementById('page-gamelogs');
  page.classList.add('active');

  // Build game list (unique date + game_num combos)
  const games = {};
  DATA.logs.forEach(l => {
    const key = `${l.date}-${l.game_num}`;
    if (!games[key]) games[key] = { date: l.date, game_num: l.game_num, opponent: l.opponent, rows: [] };
    games[key].rows.push(l);
  });

  const gameList = Object.values(games).sort((a, b) => b.date.localeCompare(a.date));
  const years = [...new Set(gameList.map(g => g.date.slice(0,4)))].sort().reverse();

  document.getElementById('log-year-select').innerHTML =
    `<option value="all">All Years</option>` +
    years.map(y => `<option value="${y}">${y}</option>`).join('');

  window._gameList = gameList;
  renderGameList();
}

function renderGameList() {
  const year = document.getElementById('log-year-select').value;
  const games = window._gameList.filter(g => year === 'all' || g.date.startsWith(year));
  const container = document.getElementById('game-list');

  container.innerHTML = games.map(g => `
    <div class="card mb1" style="cursor:pointer" onclick="toggleGameDetail(this, '${g.date}-${g.game_num}')">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <span style="font-family:var(--font-display);font-weight:700;font-size:1.05rem">${g.date}</span>
          <span style="color:var(--text-muted);margin-left:0.75rem;font-size:0.9rem">vs ${g.opponent}</span>
        </div>
        <span style="color:var(--text-muted);font-size:0.85rem">${g.rows.length} players ▼</span>
      </div>
      <div class="game-detail" style="display:none;margin-top:1rem">
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th>Player</th><th>AB</th><th>R</th><th>H</th><th>RBI</th><th>2B</th><th>3B</th><th>HR</th><th>BB</th><th>RV</th>
            </tr></thead>
            <tbody>
              ${g.rows.sort((a,b)=>displayName(a.player_id).localeCompare(displayName(b.player_id))).map(l => `<tr>
                <td><a onclick="event.stopPropagation();navigate('profile','${l.player_id}')" style="cursor:pointer">${displayName(l.player_id)}</a></td>
                <td>${fmtStat(l.AB)}</td><td>${fmtStat(l.R)}</td><td>${fmtStat(l.H)}</td>
                <td>${fmtStat(l.RBI)}</td><td>${fmtStat(l.dbl)}</td><td>${fmtStat(l.trp)}</td>
                <td>${fmtStat(l.HR)}</td><td>${fmtStat(l.BB)}</td>
                <td>${l.RV !== null && l.RV !== undefined ? Number(l.RV).toFixed(2) : '—'}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `).join('');
}

function toggleGameDetail(el, key) {
  const detail = el.querySelector('.game-detail');
  detail.style.display = detail.style.display === 'none' ? 'block' : 'none';
}

// ── RECORDS ───────────────────────────────────────────────────────────────
function showRecords() {
  const page = document.getElementById('page-records');
  page.classList.add('active');

  // Career totals per player
  const totals = {};
  DATA.stats.forEach(s => {
    if (!totals[s.player_id]) totals[s.player_id] = {
      AB:0, H:0, HR:0, RBI:0, R:0, dbl:0, trp:0, BB:0, RV:0, G:0, seasons:0,
      pit_W:0, pit_IP:0, pit_RA:0
    };
    const t = totals[s.player_id];
    t.AB += s.AB || 0; t.H += s.H || 0; t.HR += s.HR || 0;
    t.RBI += s.RBI || 0; t.R += s.R || 0; t.dbl += s.dbl || 0;
    t.trp += s.trp || 0; t.BB += s.BB || 0; t.RV += s.RV || 0;
    t.G += s.G || 0; t.seasons += 1;
    t.pit_W += s.pit_W || 0; t.pit_IP += s.pit_IP || 0; t.pit_RA += s.pit_RA || 0;
  });

  // Single season bests
  const singleSeasonHR = [...DATA.stats].sort((a,b) => (b.HR||0)-(a.HR||0))[0];
  const singleSeasonRBI = [...DATA.stats].sort((a,b) => (b.RBI||0)-(a.RBI||0))[0];
  const singleSeasonBA = [...DATA.stats].filter(s => s.AB >= 15).sort((a,b) => (b.BA||0)-(a.BA||0))[0];
  const singleSeasonRV = [...DATA.stats].sort((a,b) => (b.RV||0)-(a.RV||0))[0];
  const singleSeasonMVP = [...DATA.stats].sort((a,b) => (b.MVP||0)-(a.MVP||0))[0];

  const qualified = Object.entries(totals).filter(([,t]) => t.AB >= 50);
  const careerBA = qualified.sort((a,b) => (b[1].H/b[1].AB)-(a[1].H/a[1].AB))[0];

  const leaderboard = (entries, key, fmt = v => v) => {
    return entries.slice(0,10).map(([id, t], i) => `
      <tr>
        <td style="text-align:left;color:var(--text-muted);width:2rem">${i+1}</td>
        <td><a onclick="navigate('profile','${id}')" style="cursor:pointer">${displayName(id)}</a></td>
        <td>${fmt(t[key])}</td>
      </tr>
    `).join('');
  };

  const makeLeader = (title, entries) => `
    <div class="card">
      <div class="section-title">${title}</div>
      <div class="table-wrap"><table><tbody>${entries}</tbody></table></div>
    </div>
  `;

  const byHR = Object.entries(totals).sort((a,b)=>b[1].HR-a[1].HR);
  const byRBI = Object.entries(totals).sort((a,b)=>b[1].RBI-a[1].RBI);
  const byR = Object.entries(totals).sort((a,b)=>b[1].R-a[1].R);
  const byH = Object.entries(totals).sort((a,b)=>b[1].H-a[1].H);
  const byRV = Object.entries(totals).sort((a,b)=>b[1].RV-a[1].RV);
  const byBA = [...qualified].sort((a,b)=>(b[1].H/b[1].AB)-(a[1].H/a[1].AB));
  const byW = Object.entries(totals).sort((a,b)=>b[1].pit_W-a[1].pit_W);

  document.getElementById('records-content').innerHTML = `
    <div class="section-title">Single Season Records</div>
    <div class="grid-2 mb1">
      <div class="card">
        <div class="card-title">Single Season HR</div>
        <div style="font-family:var(--font-display);font-size:2rem;font-weight:900;color:var(--sky)">${singleSeasonHR.HR}</div>
        <div style="color:var(--text-dim);font-size:0.9rem;cursor:pointer" onclick="navigate('profile','${singleSeasonHR.player_id}')">${displayName(singleSeasonHR.player_id)} — ${singleSeasonHR.season_label}</div>
      </div>
      <div class="card">
        <div class="card-title">Single Season RBI</div>
        <div style="font-family:var(--font-display);font-size:2rem;font-weight:900;color:var(--sky)">${singleSeasonRBI.RBI}</div>
        <div style="color:var(--text-dim);font-size:0.9rem;cursor:pointer" onclick="navigate('profile','${singleSeasonRBI.player_id}')">${displayName(singleSeasonRBI.player_id)} — ${singleSeasonRBI.season_label}</div>
      </div>
      <div class="card">
        <div class="card-title">Single Season BA (min 15 AB)</div>
        <div style="font-family:var(--font-display);font-size:2rem;font-weight:900;color:var(--sky)">${fmtBA(singleSeasonBA.BA)}</div>
        <div style="color:var(--text-dim);font-size:0.9rem;cursor:pointer" onclick="navigate('profile','${singleSeasonBA.player_id}')">${displayName(singleSeasonBA.player_id)} — ${singleSeasonBA.season_label}</div>
      </div>
      <div class="card">
        <div class="card-title">Single Season RV</div>
        <div style="font-family:var(--font-display);font-size:2rem;font-weight:900;color:var(--sky)">${Number(singleSeasonRV.RV).toFixed(1)}</div>
        <div style="color:var(--text-dim);font-size:0.9rem;cursor:pointer" onclick="navigate('profile','${singleSeasonRV.player_id}')">${displayName(singleSeasonRV.player_id)} — ${singleSeasonRV.season_label}</div>
      </div>
      <div class="card">
        <div class="card-title">Single Season MVP Score</div>
        <div style="font-family:var(--font-display);font-size:2rem;font-weight:900;color:var(--gold)">${Number(singleSeasonMVP.MVP).toFixed(1)}</div>
        <div style="color:var(--text-dim);font-size:0.9rem;cursor:pointer" onclick="navigate('profile','${singleSeasonMVP.player_id}')">${displayName(singleSeasonMVP.player_id)} — ${singleSeasonMVP.season_label}</div>
      </div>
    </div>

    <div class="section-title mt2">Career Leaderboards</div>
    <div class="grid-2">
      ${makeLeader('Career Home Runs', leaderboard(byHR, 'HR'))}
      ${makeLeader('Career RBI', leaderboard(byRBI, 'RBI'))}
      ${makeLeader('Career Runs', leaderboard(byR, 'R'))}
      ${makeLeader('Career Hits', leaderboard(byH, 'H'))}
      ${makeLeader('Career RV', leaderboard(byRV, 'RV', v => Number(v).toFixed(1)))}
      ${makeLeader('Career BA (min 50 AB)', leaderboard(byBA, null, (v) => fmtBA(byBA[byBA.findIndex(e=>e[0]===v)])))}
      ${makeLeader('Career Pitching Wins', leaderboard(byW, 'pit_W'))}
    </div>
  `;

  // Fix career BA leaderboard - redo it properly
  const careeBARows = byBA.slice(0,10).map(([id, t], i) => `
    <tr>
      <td style="text-align:left;color:var(--text-muted);width:2rem">${i+1}</td>
      <td><a onclick="navigate('profile','${id}')" style="cursor:pointer">${displayName(id)}</a></td>
      <td>${fmtBA(t.H/t.AB)}</td>
    </tr>
  `).join('');
  // Replace the broken one with fixed
  const cards = document.querySelectorAll('#records-content .card .section-title');
  cards.forEach(c => {
    if (c.textContent === 'Career BA (min 50 AB)') {
      c.closest('.card').querySelector('tbody').innerHTML = careeBARows;
    }
  });
}

// ── TABLE SORT ─────────────────────────────────────────────────────────────
function sortTable(tbodyId, colIdx, isText = false) {
  const tbody = document.getElementById(tbodyId);
  const rows = [...tbody.querySelectorAll('tr')];
  let asc = tbody.dataset.sortCol == colIdx && tbody.dataset.sortDir === 'asc';
  tbody.dataset.sortCol = colIdx;
  tbody.dataset.sortDir = asc ? 'desc' : 'asc';

  rows.sort((a, b) => {
    const aVal = a.cells[colIdx]?.textContent.trim() || '';
    const bVal = b.cells[colIdx]?.textContent.trim() || '';
    if (isText) return asc ? bVal.localeCompare(aVal) : aVal.localeCompare(bVal);
    const aNum = parseFloat(aVal) || -Infinity;
    const bNum = parseFloat(bVal) || -Infinity;
    return asc ? aNum - bNum : bNum - aNum;
  });

  rows.forEach(r => tbody.appendChild(r));
}

// ── TABS ──────────────────────────────────────────────────────────────────
function switchTab(btn, panelId) {
  const container = btn.closest('.container') || document.getElementById('page-profile');
  container.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  container.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById(panelId)?.classList.add('active');
}

// ── INIT ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadData();
  navigate('home');
});
