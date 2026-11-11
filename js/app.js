// ── CONSTANTS ─────────────────────────────────────────────────────────────
var AKA = { 'Gomez': 'AlmonteJ', 'DeBoer': 'SimonsK' };
var POS_COLS = ['pos_P','pos_C','pos_1B','pos_2B','pos_3B','pos_SS','pos_LF','pos_LC','pos_RC','pos_RF','pos_DH'];
var POS_LABELS = { pos_P:'P',pos_C:'C',pos_1B:'1B',pos_2B:'2B',pos_3B:'3B',pos_SS:'SS',pos_LF:'LF',pos_LC:'LC',pos_RC:'RC',pos_RF:'RF',pos_DH:'DH' };
var LIVE_STATS_URL = '';  // Blank until Spring 2027 sheet is ready -- update with new sheet URL in April
var LIVE_BOX_URL   = '';  // Blank until Spring 2027 sheet is ready -- update with new sheet URL in April
var SCHEDULE_URL   = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTImdxXoTOYFuX1X9iFtSpG-BjD85FJXCDPxETuaJWfQlrNR7j0y7XWadoefmuWRRrqt3Lz3nlOYNAi/pub?gid=0&single=true&output=csv';
var NEWS_URL       = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTImdxXoTOYFuX1X9iFtSpG-BjD85FJXCDPxETuaJWfQlrNR7j0y7XWadoefmuWRRrqt3Lz3nlOYNAi/pub?gid=1865025073&single=true&output=csv';
var NEWS_URL       = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTImdxXoTOYFuX1X9iFtSpG-BjD85FJXCDPxETuaJWfQlrNR7j0y7XWadoefmuWRRrqt3Lz3nlOYNAi/pub?gid=1865025073&single=true&output=csv';
var STANDINGS_URL  = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTImdxXoTOYFuX1X9iFtSpG-BjD85FJXCDPxETuaJWfQlrNR7j0y7XWadoefmuWRRrqt3Lz3nlOYNAi/pub?gid=1569850367&single=true&output=csv';
var LIVE_SEASON    = 2027.1;  // Spring 2027 -- update Sheet URLs when season starts
var LIVE_LABEL     = 'Spring 2027';
var DATA = { players: [], stats: [], logs: [], schedules: [] };
var SEASON_RECORDS = [];
function seaCreature(id){
  // Return initials avatar HTML - dark navy bg, sky blue text
  var p=getPlayer(id);
  var initials=p?(p.first.charAt(0)+p.last.charAt(0)).toUpperCase():id.slice(0,2).toUpperCase();
  return '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#0c2340;color:#38bdf8;font-family:var(--font-display);font-weight:700;font-size:0.85em;border-radius:50%;line-height:1">'+initials+'</div>';
}
// ── DATA LOADING ──────────────────────────────────────────────────────────
async function loadData() {
  var res = await Promise.all([
    fetch('data/players.json').then(function(r){return r.json();}),
    fetch('data/season_stats.json').then(function(r){return r.json();}),
    fetch('data/game_logs.json').then(function(r){return r.json();}),
    fetch('data/schedules.json').then(function(r){return r.json();}).catch(function(){return [];}),
  ]);
  DATA.players = res[0]; DATA.schedules = res[3];
  // Normalize archived stat rows: rename '2B'/'3B' keys to dbl/trp to match live rows
  DATA.stats = res[1].map(function(s) {
    if (s.dbl === undefined && s['2B'] !== undefined) s.dbl = s['2B'];
    if (s.trp === undefined && s['3B'] !== undefined) s.trp = s['3B'];
    return s;
  });
  // Normalize archived log rows: rename dbl/trp if stored as 2B/3B
  DATA.logs = res[2].map(function(l) {
    if (l.dbl === undefined && l['2B'] !== undefined) l.dbl = l['2B'];
    if (l.trp === undefined && l['3B'] !== undefined) l.trp = l['3B'];
    return l;
  });
  // Set maxSeason from static data first so site works even if live fetch fails
  DATA.maxSeason = Math.max.apply(null, DATA.stats.map(function(r){return parseFloat(r.season_sort||r.season||0);}));
  DATA.pitchers = new Set(DATA.stats.filter(function(r){return r.pit_G && r.pit_G > 0;}).map(function(r){return r.player_id;}));
  try {
    var live = await Promise.all([
      LIVE_STATS_URL ? fetch(LIVE_STATS_URL).then(function(r){return r.text();}) : Promise.resolve(''),
      LIVE_BOX_URL   ? fetch(LIVE_BOX_URL).then(function(r){return r.text();})   : Promise.resolve(''),
      fetch(SCHEDULE_URL).then(function(r){return r.text();}),
    ]);
    if (LIVE_STATS_URL) mergeLiveStats(live[0]);
    if (LIVE_BOX_URL)   mergeLiveBox(live[1]);
    cacheSchedule(live[2]);
    updateDerivedData();
    loadNews();
    // Re-render active page if it depends on live data
    if(document.getElementById('page-home').classList.contains('active')){
      renderSeasonLeaders();
      renderHomeGames();
    }
    if(document.getElementById('page-players').classList.contains('active')){
      renderRoster();
    }
    if(document.getElementById('page-seasons').classList.contains('active')){
      renderStats();
    }
    // Also re-render if home is already showing (handles delayed schedule load)
    setTimeout(function(){
      if(document.getElementById('page-home').classList.contains('active')){
        renderHomeGames();
      }
    }, 500);
  } catch(e) { console.warn('Live data unavailable:', e); }
  DATA.maxSeason = Math.max.apply(null, DATA.stats.map(function(r){return r.season_sort;}));
  DATA.pitchers = new Set(DATA.stats.filter(function(r){return r.pit_G && r.pit_G > 0;}).map(function(r){return r.player_id;}));
}

function updateDerivedData() {
  // Always use LIVE_SEASON as max once live data has loaded
  DATA.maxSeason = Math.max(LIVE_SEASON, Math.max.apply(null, DATA.stats.map(function(r){return r.season_sort||0;})));
  DATA.pitchers = new Set(DATA.stats.filter(function(r){return r.pit_G && r.pit_G > 0;}).map(function(r){return r.player_id;}));
}

async function loadSeasonRecords() {
  try {
    SEASON_RECORDS = await fetch('data/season_records.json').then(function(r){return r.json();});
  } catch(e) { SEASON_RECORDS = []; }
}

// ── CSV PARSING ───────────────────────────────────────────────────────────
function parseLine(line) {
  var vals = [], cur = '', inQ = false;
  for (var i = 0; i < line.length; i++) {
    var ch = line[i];
    if (ch === '"') { inQ = !inQ; }
    else if (ch === ',' && !inQ) { vals.push(cur.trim()); cur = ''; }
    else { cur += ch; }
  }
  vals.push(cur.trim());
  return vals.map(function(v){return v.replace(/^"|"$/g,'').trim();});
}

function dedupeHeaders(headers) {
  var seen = {};
  return headers.map(function(h) {
    if (seen[h] !== undefined) { seen[h]++; return h + '_' + seen[h]; }
    seen[h] = 0; return h;
  });
}

function mergeLiveStats(text) {
  // Strip only previously-pushed live rows (tagged live_stat:true).
  // Do NOT strip by season_sort value — that risks removing archived rows
  // (e.g. Spring 2026 = 2026.1) if floating-point comparison ever misfires.
  DATA.stats = DATA.stats.filter(function(s){return !s.live_stat && s.season_sort !== LIVE_SEASON;});
  var lines = text.trim().replace(/\r/g,'').split('\n');
  if (lines.length < 3) return;
  var headers = dedupeHeaders(parseLine(lines[1]));
  lines.slice(2).forEach(function(line) {
    var vals = parseLine(line), obj = {};
    headers.forEach(function(h,i){obj[h]=vals[i]||'';});
    var nm = (obj['Name']||'').trim();
    if (!nm || nm.toLowerCase() === 'total') return;
    var n = function(v){ var x=parseFloat(v); return isNaN(x)?null:x; };
    DATA.stats.push({
      live_stat:true, season_sort:LIVE_SEASON, season_label:LIVE_LABEL, season_year:2026, season_half:'Fall',
      player_id:nm,
      G:n(obj['G']),AB:n(obj['AB']),R:n(obj['R']),H:n(obj['H']),RBI:n(obj['RBI']),
      dbl:n(obj['2B']),trp:n(obj['3B']),HR:n(obj['HR']),BB:n(obj['BB']),
      BA:n(obj['BA']),OBP:n(obj['OBP']),SLG:n(obj['SLG']),OPS:n(obj['OPS']),
      RV:n(obj['RV']),
      pos_P:n(obj['P']),pos_C:n(obj['C']),pos_1B:n(obj['1B']),
      pos_2B:n(obj['2B_1']),pos_3B:n(obj['3B_1']),
      pos_SS:n(obj['SS']),pos_LF:n(obj['LF']),pos_LC:n(obj['LC']),
      pos_RC:n(obj['RC']),pos_RF:n(obj['RF']),pos_DH:n(obj['DH']),
      pit_G:n(obj['GP']),pit_GS:n(obj['GS']),pit_IP:n(obj['IP']),
      pit_RA:n(obj['R_1']),pit_W:n(obj['W']),pit_L:n(obj['L']),RIP:n(obj['RIP']),pit_S:null,
    });
  });
}

function mergeLiveBox(text) {
  var lines = text.trim().replace(/\r/g,'').split('\n');
  if (lines.length < 2) return;
  var headers = dedupeHeaders(parseLine(lines[0]));
  // Collect all season_sort|game_num keys present in the live feed
  // so we can strip archived duplicates by game identity, not date
  // (dates can differ between schedule and box score tabs for rescheduled games)
  var liveKeys = {};
  lines.slice(1).forEach(function(line){
    var vals = parseLine(line), obj = {};
    headers.forEach(function(h,i){obj[h]=vals[i]||'';});
    var gnum = (obj['Game #']||'').trim();
    if (gnum) liveKeys[LIVE_SEASON + '|' + gnum] = true;
  });
  // Remove flagged-live rows AND archived rows for the same season+game
  DATA.logs = DATA.logs.filter(function(l){
    if (l.live) return false;
    if (l.season_sort === LIVE_SEASON && l.game_num != null &&
        liveKeys[LIVE_SEASON + '|' + l.game_num]) return false;
    return true;
  });
  var order = {};
  lines.slice(1).forEach(function(line) {
    var vals = parseLine(line), obj = {};
    headers.forEach(function(h,i){obj[h]=vals[i]||'';});
    var pid = (obj['Player']||'').trim();
    if (!pid) return;
    var n = function(v){var x=parseFloat(v);return isNaN(x)?null:x;};
    var key = (obj['Game #']||'')+'||'+(obj['Date']||'');
    order[key] = (order[key]||0)+1;
    DATA.logs.push({
      live:true, season_sort:LIVE_SEASON, player_id:pid, game_num:n(obj['Game #']),
      date:fmtLiveDate(obj['Date']||''), opponent:obj['OPP']||'',
      batting_order:order[key],
      AB:n(obj['AB']),R:n(obj['R']),H:n(obj['H']),RBI:n(obj['RBI']),
      dbl:n(obj['2B']),trp:n(obj['3B']),HR:n(obj['HR']),BB:n(obj['BB']),RV:n(obj['RV']),
      pos_P:n(obj['PP']),pos_C:n(obj['PC']),pos_1B:n(obj['P1']),
      pos_2B:n(obj['P2']),pos_3B:n(obj['P3']),pos_SS:n(obj['PSS']),
      pos_LF:n(obj['PLF']),pos_LC:n(obj['PLC']),pos_RC:n(obj['PRC']),
      pos_RF:n(obj['PRF']),pos_DH:n(obj['PDH']),
      pit_G:n(obj['GP']),pit_GS:n(obj['GS']),pit_IP:n(obj['IP']),
      pit_RA:n(obj['RA']),pit_W:n(obj['W']),pit_L:n(obj['L']),pit_S:n(obj['S']),
    });
  });
}

function cacheSchedule(text) {
  var lines = text.trim().replace(/\r/g,'').split('\n');
  var headers = dedupeHeaders(parseLine(lines[0]));
  window._scheduleRows = lines.slice(1).map(function(line){
    var vals=parseLine(line), obj={};
    headers.forEach(function(h,i){obj[h]=vals[i]||'';});
    return obj;
  }).filter(function(r){return Object.values(r).some(function(v){return v!=='';});});
}

function fmtLiveDate(d) {
  var p=d.split('/');
  if(p.length===3) return p[2]+'-'+p[0].padStart(2,'0')+'-'+p[1].padStart(2,'0');
  return d;
}
function schedDateToISO(d) {
  var p=d.split('/');
  if(p.length===3) return p[2]+'-'+p[0].padStart(2,'0')+'-'+p[1].padStart(2,'0');
  if(p.length===2) {
    // M/D with no year -- assume current year
    var yr = new Date().getFullYear();
    return yr+'-'+p[0].padStart(2,'0')+'-'+p[1].padStart(2,'0');
  }
  return d;
}

// ── HELPERS ───────────────────────────────────────────────────────────────
function getPlayer(id) { return DATA.players.find(function(p){return p.id===id;}); }
function displayName(id) { var p=getPlayer(id); return p?p.first+' '+p.last:id; }
function fmtBox(v) { return (v===null||v===undefined)?'0':Number(v).toFixed(0); }
function fmtStat(v,d) { d=d||0; return (v===null||v===undefined)?'&mdash;':Number(v).toFixed(d); }
function fmtCount(v) { return (v===null||v===undefined)?'0':Number(v).toFixed(0); }
function fmtBA(v) { return (v===null||v===undefined)?'&mdash;':Number(v).toFixed(3).replace(/^0\./,'.'); }
function fmtRV(v,d) { d=d||1; return (v===null||v===undefined)?'&mdash;':Number(v).toFixed(d); }
function fmtTime(t) { if(!t) return ''; var n=parseInt(t); return isNaN(n)?t:n+'pm'; }
function seasonLabel(s) { var y=Math.floor(s); return (Math.round((s-y)*10)===1?'Spring ':'Fall ')+y; }
function seasonShort(s) { var y=Math.floor(s); return (Math.round((s-y)*10)===1?'Sp':'Fa')+String(y).slice(2); }
function seasonYear(s) { return Math.floor(s); }
function seasonSortToKey(s) { var y=Math.floor(s); var h=Math.round((s-y)*10); return String(y).slice(2)+'.'+h; }

function primaryPos(row) {
  var entries=POS_COLS.map(function(k){return [k,row[k]||0];}).filter(function(e){return e[1]>0;});
  if(!entries.length) return '';
  entries.sort(function(a,b){return b[1]-a[1];});
  var max=entries[0][1];
  var tied=entries.filter(function(e){return e[1]===max;});
  if(tied.length>=3) return tied.slice(0,2).map(function(e){return POS_LABELS[e[0]];}).join('/');
  return tied.map(function(e){return POS_LABELS[e[0]];}).join('/');
}

function careerPosDisplay(playerStats) {
  var totals={};
  POS_COLS.forEach(function(k){totals[k]=0;});
  playerStats.forEach(function(s){POS_COLS.forEach(function(k){totals[k]+=(s[k]||0);});});
  var sorted=Object.entries(totals).filter(function(e){return e[1]>0;}).sort(function(a,b){return b[1]-a[1];});
  if(!sorted.length) return '';
  var primary=sorted[0][0];
  var result=[primary];
  var second=sorted.slice(1).filter(function(e){return e[1]>=10;});
  if(second.length){
    second.sort(function(a,b){
      var rA=Math.max.apply(null,playerStats.filter(function(s){return (s[a[0]]||0)>0;}).map(function(s){return s.season_sort;}).concat([0]));
      var rB=Math.max.apply(null,playerStats.filter(function(s){return (s[b[0]]||0)>0;}).map(function(s){return s.season_sort;}).concat([0]));
      return rB-rA;
    });
    result.push(second[0][0]);
  }
  return result.map(function(k){return POS_LABELS[k];}).join('/');
}

function imgError(el, id, size) {
  if(!el._t) el._t=0;
  el._t++;
  var lo = id.toLowerCase();
  if(el._t === 1) { el.src = 'img/players/' + lo + '.jpeg'; return; }
  if(el._t === 2) { el.src = 'img/players/' + lo + '.jpg'; return; }
  el.onerror = null;
  var p = getPlayer(id);
  var ini = (p ? (p.first.charAt(0)+p.last.charAt(0)) : id.slice(0,2)).toUpperCase();
  if(size === 'leader') {
    el.src = 'img/logo.png'; el.style.objectFit='contain'; el.style.background='white'; el.style.padding='3px';
  } else if(size === 'inline') {
    el.style.display = 'none';
    var s = document.createElement('span');
    s.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:#0c2340;color:#38bdf8;font-weight:700;font-size:8px;vertical-align:middle;margin-right:3px;flex-shrink:0';
    s.textContent = ini;
    el.parentNode.insertBefore(s, el.nextSibling);
  } else {
    el.style.display = 'none';
    var d = document.createElement('div');
    d.style.cssText = 'width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#0c2340;color:#38bdf8;font-weight:700;font-size:1.1em;border-radius:50%';
    d.textContent = ini;
    el.parentNode.appendChild(d);
  }
}

function makeAvatarImg(id) {
  var lo=id.toLowerCase();
  return '<img src="img/players/'+lo+'" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block" onerror="imgError(this,\''+id+'\',\'avatar\')" alt="">';
}

function makeLeaderPhoto(id) {
  var lo=id.toLowerCase();
  return '<img src="img/players/'+lo+'" style="width:30px;height:30px;object-fit:cover;border-radius:50%;border:1px solid var(--border-bright)" onerror="imgError(this,\''+id+'\',\'leader\')" alt="">';
}

function computeCareerTotals(stats) {
  var t={G:0,AB:0,H:0,HR:0,RBI:0,R:0,dbl:0,trp:0,BB:0,RV:0,PA:0,pit_W:0,pit_L:0,pit_S:0,pit_IP:0,pit_RA:0,pit_G:0,pit_GS:0};
  POS_COLS.forEach(function(k){t['p_'+k]=0;});
  stats.forEach(function(s){
    t.G+=s.G||0;t.AB+=s.AB||0;t.H+=s.H||0;t.HR+=s.HR||0;t.RBI+=s.RBI||0;
    t.R+=s.R||0;t.dbl+=s.dbl||0;t.trp+=s.trp||0;t.BB+=s.BB||0;
    t.PA+=(s.AB||0)+(s.BB||0);
    t.pit_W+=s.pit_W||0;t.pit_L+=s.pit_L||0;t.pit_S+=s.pit_S||0;
    t.pit_IP+=s.pit_IP||0;t.pit_RA+=s.pit_RA||0;t.pit_G+=s.pit_G||0;t.pit_GS+=s.pit_GS||0;
    POS_COLS.forEach(function(k){t['p_'+k]+=(s[k]||0);});
  });
  t.BA=(t.AB>0)?t.H/t.AB:null;
  t.OBP=((t.AB+t.BB)>0)?(t.H+t.BB)/(t.AB+t.BB):null;
  var sg=t.H-t.dbl-t.trp-t.HR;
  t.SLG=(t.AB>0)?(sg+2*t.dbl+3*t.trp+4*t.HR)/t.AB:null;
  t.OPS=(t.OBP!=null&&t.SLG!=null)?t.OBP+t.SLG:null;
  t.RV=calcRV(t);
  return t;
}

function computeAllCareerTotals() {
  var tots={};
  DATA.stats.forEach(function(s){
    if(!tots[s.player_id]) tots[s.player_id]={G:0,AB:0,H:0,HR:0,RBI:0,R:0,dbl:0,trp:0,BB:0,seasons:0,pit_W:0,pit_IP:0,pit_RA:0,pit_L:0};
    var t=tots[s.player_id];
    t.G+=s.G||0;t.AB+=s.AB||0;t.H+=s.H||0;t.HR+=s.HR||0;t.RBI+=s.RBI||0;
    t.R+=s.R||0;t.dbl+=s.dbl||0;t.trp+=s.trp||0;t.BB+=s.BB||0;
    t.seasons+=1;t.pit_W+=s.pit_W||0;t.pit_IP+=s.pit_IP||0;t.pit_RA+=s.pit_RA||0;t.pit_L+=s.pit_L||0;
  });
  // Compute RV from raw totals for each player
  Object.values(tots).forEach(function(t){ t.RV=calcRV(t)||0; });
  return tots;
}

function nameWithFace(id) {
  var lo=id.toLowerCase();
  return '<img src="img/players/'+lo+'" style="width:18px;height:18px;object-fit:cover;border-radius:50%;vertical-align:middle;margin-right:3px;border:1px solid var(--border-bright);flex-shrink:0" onerror="imgError(this,\''+id+'\',\'inline\')" alt="">'+displayName(id);
}
// ── ROUTING ───────────────────────────────────────────────────────────────
function navigate(route, param) {
  document.querySelectorAll('.page').forEach(function(p){p.classList.remove('active');});
  document.querySelectorAll('nav a[data-route]').forEach(function(a){a.classList.toggle('active',a.dataset.route===route);});
  // Also update mobile nav active state
  document.querySelectorAll('.nav-mobile a[data-route]').forEach(function(a){a.classList.toggle('active',a.dataset.route===route);});
  window.scrollTo(0,0);
  // Update URL hash for shareable links
  var hash = '#' + route + (param ? '/' + param : '');
  if(window.location.hash !== hash) history.pushState(null, '', hash);
  var h={home:showHome,players:showPlayers,gamelogs:showGameLogs,records:showRecords,schedule:showSchedule,standings:showStandings};
  if(route==='profile'&&param) showProfile(param);
  else if(route==='seasons') {
    var opts = window._pendingSeasonsOpts || undefined;
    window._pendingSeasonsOpts = null;
    showSeasons(opts);
  }
  else if(h[route]) h[route]();
}

function navigateFromHash() {
  var hash = window.location.hash.slice(1); // remove #
  if(!hash) { navigate('home'); return; }
  var parts = hash.split('/');
  var route = parts[0];
  var param = parts.slice(1).join('/');
  navigate(route, param || undefined);
}

window.addEventListener('popstate', navigateFromHash);

function goToSeasonStats(season_sort) {
  // Pass season and scope as opts so showSeasons() doesn't overwrite them
  window._pendingSeasonsOpts = { season_sort: season_sort, scope: 'season-player' };
  navigate('seasons');
}

// ── BOX TABLES ────────────────────────────────────────────────────────────
function calcRV(l) {
  var ab=l.AB||0, h=l.H||0, d=l.dbl||0, t=l.trp||0, hr=l.HR||0, bb=l.BB||0;
  if(ab===0 && h===0 && bb===0) return null;
  return Math.round((-0.28*(ab-h) + 0.65*(h-d-t-hr) + 0.96*d + 1.07*t + 1.57*hr + 0.88*bb)*100)/100;
}


function buildBoxTable(rows, showDateOpp) {
  var nameCol=showDateOpp
    ?'<th style="text-align:left">Date</th><th style="text-align:left">Opp</th>'
    :'<th style="text-align:left">Player</th>';
  var body=rows.map(function(l){
    var fc=showDateOpp
      ?'<td style="text-align:left">'+l.date+'</td><td style="text-align:left">'+(l.opponent||'&mdash;')+'</td>'
      :'<td style="text-align:left"><a onclick="navigate(\'profile\',\''+l.player_id+'\')">'+nameWithFace(l.player_id)+'</a></td>';
    return '<tr>'+fc+'<td>'+fmtBox(l.AB)+'</td><td>'+fmtBox(l.R)+'</td><td>'+fmtBox(l.H)+'</td>'+
      '<td>'+fmtBox(l.RBI)+'</td><td>'+fmtBox(l.dbl)+'</td><td>'+fmtBox(l.trp)+'</td>'+
      '<td>'+fmtBox(l.HR)+'</td><td>'+fmtBox(l.BB)+'</td><td>'+fmtRV(calcRV(l),1)+'</td></tr>';
  }).join('');
  return '<div class="table-wrap"><table>'+
    '<thead><tr>'+nameCol+'<th>AB</th><th>R</th><th>H</th><th>RBI</th><th>2B</th><th>3B</th><th>HR</th><th>BB</th><th>RV</th></tr></thead>'+
    '<tbody>'+body+'</tbody></table></div>';
}

function buildBoxTableWithPos(rows, showDateOpp) {
  // Find top RV per gender for squid emoji
  // Skip if forfeit (everyone has 0 AB, H, BB)
  var totalAB=rows.reduce(function(s,l){return s+(l.AB||0);},0);
  var totalH=rows.reduce(function(s,l){return s+(l.H||0);},0);
  var totalBB=rows.reduce(function(s,l){return s+(l.BB||0);},0);
  var isForfeit = totalAB===0&&totalH===0&&totalBB===0;
  var genderRV = {M: null, F: null};
  if(!isForfeit){
    rows.forEach(function(l){
      var rv = calcRV(l);
      if(rv === null) return;
      var p = getPlayer(l.player_id);
      var g = p ? p.gender : null;
      if(g && (genderRV[g] === null || rv > genderRV[g])) genderRV[g] = rv;
    });
  }
  var anyRV = genderRV.M !== null || genderRV.F !== null;

  var nameCol=showDateOpp
    ?'<th style="text-align:left">Date</th><th style="text-align:left">Opp</th>'
    :'<th style="text-align:left">Player</th>';
  var body=rows.map(function(l){
    var posStr=POS_COLS.filter(function(k){return l[k]&&l[k]>0;}).map(function(k){return POS_LABELS[k];}).join('/')||'&mdash;';
    // Squid for top RV per gender
    var squid = '';
    if(anyRV){
      var rv = calcRV(l);
      var p2 = getPlayer(l.player_id);
      var g2 = p2 ? p2.gender : null;
      if(rv !== null && g2 && genderRV[g2] !== null && Math.abs(rv - genderRV[g2]) < 0.001) squid = ' &#129425;';
    }
    var fc=showDateOpp
      ?'<td style="text-align:left">'+l.date+'</td><td style="text-align:left">'+(l.opponent||'&mdash;')+'</td>'
      :'<td style="text-align:left"><a onclick="navigate(\'profile\',\''+l.player_id+'\')">'+nameWithFace(l.player_id)+'</a>'+squid+'</td>';
    return '<tr>'+fc+'<td style="text-align:left;color:var(--sky-light)">'+posStr+'</td>'+
      '<td>'+fmtBox(l.AB)+'</td><td>'+fmtBox(l.R)+'</td><td>'+fmtBox(l.H)+'</td>'+
      '<td>'+fmtBox(l.RBI)+'</td><td>'+fmtBox(l.dbl)+'</td><td>'+fmtBox(l.trp)+'</td>'+
      '<td>'+fmtBox(l.HR)+'</td><td>'+fmtBox(l.BB)+'</td>'+
      '<td>'+fmtRV(calcRV(l),1)+'</td></tr>';
  }).join('');
  return '<div class="table-wrap"><table>'+
    '<thead><tr>'+nameCol+'<th style="text-align:left">Pos</th><th>AB</th><th>R</th><th>H</th><th>RBI</th><th>2B</th><th>3B</th><th>HR</th><th>BB</th><th>RV</th></tr></thead>'+
    '<tbody>'+body+'</tbody></table></div>';
}

async function loadNews() {
  try {
    var text = await fetch(NEWS_URL).then(function(r){return r.text();});
    var lines = text.trim().replace(/\r/g,'').split('\n');
    var headers = dedupeHeaders(parseLine(lines[0]));
    window._newsRows = lines.slice(1).map(function(line){
      var vals=parseLine(line),obj={};
      headers.forEach(function(h,i){obj[h]=vals[i]||'';});
      return obj;
    }).filter(function(r){return r['Title']&&r['Title'].trim();});
    renderNews();
  } catch(e) { console.warn('News unavailable:', e); }
}

function renderNews() {
  var el = document.getElementById('home-news');
  if(!el||!window._newsRows||!window._newsRows.length) return;
  el.innerHTML = window._newsRows.slice(0,5).map(function(r){
    return '<div class="news-item">'+
      '<div class="news-date">'+(r['Date']||'')+'</div>'+
      '<div class="news-title">'+(r['Title']||'')+'</div>'+
      (r['Body']?'<div class="news-body">'+(r['Body']||'')+'</div>':'')+
    '</div>';
  }).join('');
}

// ── WEATHER ───────────────────────────────────────────────────────────────
var _weatherCache = {};

async function fetchWeather(dateStr) {
  if (_weatherCache[dateStr]) return _weatherCache[dateStr];
  var todayStr = new Date().toLocaleDateString('en-CA');
  console.log('[wx] fetching', dateStr, 'today=', todayStr);
  if (dateStr < todayStr) { console.log('[wx] skipping past date'); return null; }
  var todayMs = new Date(todayStr + 'T00:00:00').getTime();
  var gameMs  = new Date(dateStr  + 'T00:00:00').getTime();
  var diffDays = Math.round((gameMs - todayMs) / 86400000);
  if (diffDays > 15) { console.log('[wx] too far out:', diffDays, 'days'); return null; }
  try {
    var url = 'https://api.open-meteo.com/v1/forecast' +
      '?latitude=35.91&longitude=-79.07' +
      '&hourly=temperature_2m,precipitation_probability,relative_humidity_2m' +
      '&temperature_unit=fahrenheit' +
      '&timezone=America%2FNew_York' +
      '&start_date=' + dateStr + '&end_date=' + dateStr;
    console.log('[wx] url:', url);
    var data = await fetch(url).then(function(r){return r.json();});
    console.log('[wx] got data, times[0]:', data.hourly && data.hourly.time && data.hourly.time[0]);
    var times = data.hourly.time;
    var idx = times.indexOf(dateStr + 'T19:00');
    if (idx === -1) idx = times.indexOf(dateStr + 'T18:00');
    if (idx === -1) idx = times.indexOf(dateStr + 'T17:00');
    if (idx === -1) idx = 19; // fallback to slot 19 (7pm)
    var wx = {
      temp: Math.round(data.hourly.temperature_2m[idx]),
      precip: data.hourly.precipitation_probability[idx],
      humidity: data.hourly.relative_humidity_2m[idx],
    };
    console.log('[wx] result:', wx);
    _weatherCache[dateStr] = wx;
    return wx;
  } catch(e) { console.warn('[wx] error:', e); return null; }
}

function comfortEmoji(wx) {
  if (wx.precip > 50) return '&#127783;';          // rain likely
  if (wx.temp > 85 && wx.humidity > 70) return '&#129397;'; // heat index danger
  if (wx.temp > 85) return '&#128531;';            // just hot
  if (wx.temp >= 65) return '&#128513;';           // perfect
  if (wx.temp >= 55) return '&#128578;';           // nice/cool
  if (wx.temp >= 45) return '&#128560;';           // chilly
  return '&#129398;';                              // cold
}

function weatherHTML(wx) {
  if (!wx) return '';
  var precipColor = wx.precip > 50 ? 'var(--red)' : wx.precip > 25 ? 'var(--gold)' : 'var(--green)';
  return '<div style="display:flex;align-items:center;gap:0.4rem;margin-top:0.4rem;flex-wrap:nowrap;white-space:nowrap">' +
    '<span style="font-size:1rem">' + comfortEmoji(wx) + '</span>' +
    '<span style="font-size:0.72rem;font-family:var(--font-display);color:var(--sky)">&#127777;' + wx.temp + '&deg;</span>' +
    '<span style="font-size:0.72rem;font-family:var(--font-display);color:' + precipColor + '">&#9928;' + wx.precip + '%</span>' +
    '<span style="font-size:0.72rem;font-family:var(--font-display);color:var(--text-muted)">&#128167;' + wx.humidity + '%</span>' +
  '</div>';
}


// ── HOME ──────────────────────────────────────────────────────────────────
function showHome() {
  document.getElementById('page-home').classList.add('active');
  renderSeasonLeaders();
  renderHomeGames();
}

function renderSeasonLeaders() {
  var curRows=DATA.stats.filter(function(s){return s.season_sort===DATA.maxSeason;});
  var maxG=curRows.reduce(function(mx,r){return Math.max(mx,r.G||0);},0);
  var minAB=Math.max(1,Math.floor(maxG*1.5));

  function leaderCard(stat,valFn,fmtFn,qualifier) {
    var withVal=curRows
      .filter(function(r){return (r.G||0)>=1&&(qualifier?qualifier(r):true);})
      .map(function(r){return {id:r.player_id,val:valFn(r)};})
      .filter(function(r){return r.val!==null&&r.val!==undefined&&!isNaN(r.val);})
      .sort(function(a,b){return b.val-a.val;});
    if(!withVal.length) return '';
    var top=withVal[0].val;
    var leaders=withVal.filter(function(r){return r.val===top;});
    var nameStr=leaders.length>=3?(leaders.length+' tied'):leaders.length===2?'2 tied':displayName(leaders[0].id);
    var photoHTML;
    if(leaders.length>=3){
      photoHTML='<img src="img/logo.png" style="width:30px;height:30px;object-fit:contain;border-radius:50%;background:white;padding:3px" alt="">';
    } else {
      photoHTML=leaders.map(function(l){return makeLeaderPhoto(l.id);}).join('');
    }
    var clickAttr=leaders.length===1?' onclick="navigate(\'profile\',\''+leaders[0].id+'\')" style="cursor:pointer"':'';
    // Photos in 2-wide grid
    var photoGrid='<div style="display:flex;flex-wrap:wrap;justify-content:center;gap:3px;margin:0.2rem auto;width:100%">';
    if(leaders.length<=3){
      leaders.forEach(function(l){ photoGrid+=makeLeaderPhoto(l.id); });
    } else {
      photoGrid+='<img src="img/logo.png" style="width:30px;height:30px;object-fit:contain;border-radius:50%;background:white;padding:3px" alt="">';
    }
    photoGrid+='</div>';
    // Names: list up to 3, otherwise show count
    var nameLines;
    if(leaders.length===1){
      nameLines=displayName(leaders[0].id);
    } else if(leaders.length<=3){
      nameLines=leaders.map(function(l){return '<div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%">'+displayName(l.id)+'</div>';}).join('');
    } else {
      nameLines='<div style="font-size:0.75rem;color:var(--text-muted)">'+leaders.length+' tied</div>';
    }
    return '<div class="card"'+clickAttr+' style="text-align:center;display:flex;flex-direction:column;align-items:center;min-width:0;box-sizing:border-box">'+
      '<div style="font-family:var(--font-display);font-size:0.6rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:var(--text-muted)">'+stat+'</div>'+
      '<div style="font-size:1.2rem;font-weight:700;color:var(--text);line-height:1.2;margin:0.1rem 0">'+fmtFn(top)+'</div>'+
      photoGrid+
      '<div style="font-size:0.65rem;color:var(--text-dim);margin-top:0.1rem;line-height:1.3;text-align:center;width:100%">'+nameLines+'</div>'+
    '</div>';
  }

  document.getElementById('home-leaders').innerHTML=
    leaderCard('Games',   function(r){return r.G||0;},  function(v){return v;})+
    leaderCard('Times on Base',function(r){return (r.H||0)+(r.BB||0);},function(v){return v;})+
    leaderCard('Runs',    function(r){return r.R||0;},  function(v){return v;})+
    leaderCard('RBI',     function(r){return r.RBI||0;},function(v){return v;})+
    leaderCard('Home Runs',function(r){return r.HR||0;},function(v){return v;})+
    leaderCard('OBP (min '+(maxG*1.5)+' PA)',function(r){return ((r.AB||0)+(r.BB||0))>=(maxG*1.5)?r.OBP:null;},fmtBA);
}

function renderHomeGames() {
  var today=new Date().toISOString().slice(0,10);
  var sched=window._scheduleRows||[];

  var wins=0,losses=0;
  sched.forEach(function(r){
    var res=(r['W/L']||'').trim().toUpperCase();
    if(res==='W') wins++; else if(res==='L') losses++;
  });
  var wlBlock='';
  if(wins+losses>0){
    wlBlock='<div style="text-align:right">'+
      '<div style="font-size:0.65rem;font-family:var(--font-display);letter-spacing:0.1em;text-transform:uppercase;color:var(--text-muted)">'+seasonLabel(DATA.maxSeason)+' Record</div>'+
      '<div style="font-family:var(--font-blade);font-size:2rem;text-transform:lowercase;color:var(--sky);line-height:1.1">'+wins+'-'+losses+'</div>'+
    '</div>';
  }
  document.getElementById('home-wl').innerHTML=wlBlock;
  wlBlock=''; // Don't show in upcoming section

  var upcomingGames=sched.filter(function(r){
    return schedDateToISO(r['Date']||'')>=today&&!(r['W/L']||'').trim();
  }).slice(0,2);

  function buildUpcomingHTML(weatherMap) {
    var cards=upcomingGames.map(function(r){
      var ha=(r['H/A']||'').trim()==='H'?'vs':'@';
      var iso=schedDateToISO(r['Date']||'');
      var wx=(weatherMap&&weatherMap.hasOwnProperty(iso))?weatherMap[iso]:null;
      return '<div class="card" style="flex:1;min-width:180px;padding:0.7rem 1rem">'+
        '<div style="display:flex;justify-content:space-between;align-items:flex-start">'+
          '<div style="min-width:0">'+
            '<div style="font-family:var(--font-display);font-weight:700;font-size:0.95rem;color:var(--text)">'+(r['Day']||'')+' '+(r['Date']||'')+'</div>'+
            '<div style="color:var(--text-dim);font-size:0.85rem;margin-top:0.1rem">'+ha+' '+(r['Opponent']||'')+'</div>'+
          '</div>'+
          '<div style="font-family:var(--font-display);font-weight:700;color:var(--sky);font-size:0.95rem;margin-left:0.5rem;flex-shrink:0">'+fmtTime(r['Time']||'')+'</div>'+
        '</div>'+
        (wx?weatherHTML(wx):'<div style="font-size:0.72rem;color:var(--text-muted);margin-top:0.4rem">&#x1F321; loading...</div>')+
      '</div>';
    }).join('');

    if(!cards) return '';
    return '<div class="section-title">Upcoming</div>'+
      '<div style="display:flex;gap:0.75rem;flex-wrap:wrap">'+cards+'</div>';
  }

  // Render immediately without weather
  document.getElementById('home-upcoming').innerHTML=buildUpcomingHTML(null);

  // Fetch weather for each upcoming game, then re-render
  if(upcomingGames.length){
    Promise.all(upcomingGames.map(function(r){
      var iso=schedDateToISO(r['Date']||'');
      return fetchWeather(iso).then(function(wx){return {iso:iso,wx:wx};});
    })).then(function(results){
      var map={};
      results.forEach(function(x){if(x.wx)map[x.iso]=x.wx;});
      document.getElementById('home-upcoming').innerHTML=buildUpcomingHTML(map);
    }).catch(function(e){console.warn('Weather fetch failed:',e);});
  }

  // Last game result
  var sortedLogs=DATA.logs.slice().sort(function(a,b){
    if(b.date!==a.date) return b.date.localeCompare(a.date);
    return b.game_num-a.game_num;
  });
  var latest=sortedLogs[0];
  var recentHTML='';
  if(latest){
    var rows=DATA.logs.filter(function(l){return l.season_sort===latest.season_sort&&l.date===latest.date&&l.game_num===latest.game_num;});
    rows.sort(function(a,b){
      var ao = a.batting_order != null ? a.batting_order : 1000 + rows.indexOf(a);
      var bo = b.batting_order != null ? b.batting_order : 1000 + rows.indexOf(b);
      return ao - bo;
    });
    var schedResult=sched.find(function(r){return schedDateToISO(r['Date']||'')===latest.date;});
    var gameLabel='Last Game';
    if(schedResult){
      var wlStr=(schedResult['W/L']||'').trim().toUpperCase();
      var rs2=schedResult['RS']||'',ra2=schedResult['RA']||'';
      var opp2=schedResult['Opponent']||latest.opponent||'';
      var dp3=latest.date.split('-');
      var fd=parseInt(dp3[1])+'-'+parseInt(dp3[2])+'-'+dp3[0].slice(2);
      var scoreStr2=(rs2&&ra2)?', '+rs2+'–'+ra2:'';
      var wlColor2=wlStr==='W'?'var(--green)':wlStr==='L'?'var(--red)':'var(--text-dim)';
      gameLabel=fd+' vs '+opp2+
        (wlStr?' <span style="color:'+wlColor2+';font-weight:700">('+wlStr+scoreStr2+')</span>':'');
    }
    recentHTML='<div style="margin-top:1.25rem;margin-bottom:0.5rem">'+
      '<span class="section-title" style="display:inline">Last game:</span> '+
      '<span style="font-size:0.95rem;color:var(--text)">'+gameLabel+'</span>'+
      '</div>'+
      buildBoxTableWithPos(rows,false);
  }
  if(recentHTML) recentHTML+='<div style="font-size:0.72rem;color:var(--text-muted);font-family:var(--font-display);margin-top:0.4rem">&#129425; Squid of the Game (top RV per gender)</div>';
  document.getElementById('home-recent').innerHTML=recentHTML;
}


// ── PLAYERS ───────────────────────────────────────────────────────────────
function showPlayers() {
  document.getElementById('page-players').classList.add('active');
  document.getElementById('player-search').value='';
  document.getElementById('gender-filter').value='all';
  document.getElementById('pos-filter').value='all';
  // Populate season dropdown

  var rsel=document.getElementById('roster-season');
  if(rsel&&rsel.options.length<=1){
    var seasons=Array.from(new Set(DATA.stats.map(function(s){return s.season_sort;}))).sort(function(a,b){return b-a;});
    seasons.forEach(function(s){
      var o=document.createElement('option');
      o.value=s.toFixed(1); o.textContent=seasonLabel(s);
      rsel.appendChild(o);
    });
  }
  // Default to most recent season
  if(rsel) rsel.value=DATA.maxSeason.toFixed(1);
  renderRoster();
}

function applyRosterFilters() {
  var seasonVal=(document.getElementById('roster-season')||{}).value||'all';
  renderRoster(
    document.getElementById('player-search').value,
    document.getElementById('gender-filter').value,
    document.getElementById('pos-filter').value,
    seasonVal
  );
}

function renderRoster(filter,gender,posFilter,rosterSeason) {
  filter=filter||'';gender=gender||'all';posFilter=posFilter||'all';
  rosterSeason=rosterSeason||DATA.maxSeason.toFixed(1);
  var players=DATA.players.slice();
  if(filter){var q=filter.toLowerCase();players=players.filter(function(p){return (p.first+' '+p.last+p.id).toLowerCase().includes(q);});}
  if(gender!=='all') players=players.filter(function(p){return p.gender===gender;});
  // Season filter
  var seasonNum = rosterSeason!=='all' ? parseFloat(rosterSeason) : null;
  var seasonSet=new Set(DATA.stats.filter(function(s){
    return s.season_sort===(seasonNum!=null ? seasonNum : DATA.maxSeason);
  }).map(function(s){return s.player_id;}));
  if(seasonNum!=null){
    players=players.filter(function(p){return seasonSet.has(p.id);});
  }
  if(posFilter!=='all'){
    var posKey='pos_'+posFilter;
    var posStats=seasonNum!=null ? DATA.stats.filter(function(s){return s.season_sort===seasonNum;}) : DATA.stats;
    var posPlayers=new Set(posStats.filter(function(s){return (s[posKey]||0)>0;}).map(function(s){return s.player_id;}));
    players=players.filter(function(p){return posPlayers.has(p.id);});
  }
  players.sort(function(a,b){return a.last.localeCompare(b.last);});

  // Update page subtitle
  var ph=document.querySelector('#page-players .page-header p');
  if(ph){
    if(seasonNum!=null) ph.textContent=players.length+' players · '+seasonLabel(seasonNum);
    else ph.textContent=players.length+' players · all seasons';
  }

  var sums={};
  DATA.stats.forEach(function(s){
    if(!sums[s.player_id]) sums[s.player_id]={AB:0,H:0,HR:0,RBI:0,seasons:[]};
    var sm=sums[s.player_id];
    sm.AB+=s.AB||0;sm.H+=s.H||0;sm.HR+=s.HR||0;sm.RBI+=s.RBI||0;sm.seasons.push(s.season_sort);
  });

  // "Active" means played in the most recent season specifically
  var trueActive=new Set(DATA.stats.filter(function(s){return s.season_sort===DATA.maxSeason;}).map(function(s){return s.player_id;}));
  document.getElementById('roster-grid').innerHTML=players.map(function(p){
    var sm=sums[p.id],isActive=trueActive.has(p.id);
    var pStats4=DATA.stats.filter(function(s){return s.player_id===p.id;});
    // Primary position only for roster card
    var mainPos='';
    if(pStats4.length){
      var totals4={};
      POS_COLS.forEach(function(k){totals4[k]=0;});
      pStats4.forEach(function(s){POS_COLS.forEach(function(k){totals4[k]+=(s[k]||0);});});
      var sorted4=Object.entries(totals4).filter(function(e){return e[1]>0;}).sort(function(a,b){return b[1]-a[1];});
      mainPos=sorted4.length?POS_LABELS[sorted4[0][0]]:'';
    }
    var rangeStr='',statsStr='';
    if(sm&&sm.seasons.length>0){
      var lo=Math.min.apply(null,sm.seasons),hi=Math.max.apply(null,sm.seasons);
      var loY=seasonYear(lo),hiY=seasonYear(hi);
      rangeStr=loY===hiY?String(loY):String(loY)+'\u2013'+String(hiY).slice(2);
      var ba=sm.AB>=10?fmtBA(sm.H/sm.AB):'&mdash;';
      statsStr='H:'+sm.H+' &middot; HR:'+sm.HR+' &middot; RBI:'+sm.RBI+' &middot; BA:'+ba;
    }
    return '<div class="roster-card" onclick="navigate(\'profile\',\''+p.id+'\')">'+
      '<div style="position:relative;display:inline-block">'+
        '<div class="roster-avatar">'+makeAvatarImg(p.id)+'</div>'+
        (isActive?'<span style="position:absolute;top:0;right:0;width:16px;height:16px;border-radius:50%;background:#22c55e;color:#0c2340;font-size:9px;font-weight:800;font-family:var(--font-display);display:flex;align-items:center;justify-content:center;border:1px solid var(--surface-card)">A</span>':'')+
      '</div>'+
      '<div style="display:flex;align-items:center;justify-content:center;gap:0.3rem;flex-wrap:nowrap;margin-top:0.2rem">'+
        '<div class="roster-name" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+p.first+' '+p.last+'</div>'+
        (mainPos?'<span style="font-size:0.6rem;font-family:var(--font-display);font-weight:700;color:var(--sky);flex-shrink:0">'+mainPos+'</span>':'')+
      '</div>'+
    '</div>';
  }).join('')||'<div class="empty-state">No players found</div>';
}

// ── PROFILE ───────────────────────────────────────────────────────────────
function showProfile(id) {
  var page=document.getElementById('page-profile');
  page.classList.add('active');
  var player=getPlayer(id);
  if(!player){page.innerHTML='<div class="container"><p>Player not found.</p></div>';return;}

  var pStats=DATA.stats.filter(function(s){return s.player_id===id;}).sort(function(a,b){return b.season_sort-a.season_sort;});
  var pLogs=DATA.logs.filter(function(l){return l.player_id===id;}).sort(function(a,b){return b.date.localeCompare(a.date)||b.game_num-a.game_num;});
  var career=computeCareerTotals(pStats);
  var isPitcher=DATA.pitchers.has(id);
  var akaStr=AKA[id]?'Also appeared as: '+AKA[id]:'';
  var posDisplay=careerPosDisplay(pStats);
  var nS=pStats.length;
  var rangeStr='';
  if(nS>0){
    var lo=pStats[nS-1].season_sort,hi=pStats[0].season_sort;
    var loY=seasonYear(lo),hiY=seasonYear(hi);
    rangeStr=loY===hiY?String(loY):String(loY)+'\u2013'+String(hiY).slice(2);
  }
  var isActive=pStats.some(function(s){return s.season_sort===DATA.maxSeason;});

  // Career milestones
  var milestones=[];
  var thresholds={H:[50,100,150,200,250,300,400,500],R:[50,100,150,200,300],RBI:[50,100,150,200,300],BB:[50,100,150],G:[50,100,150,200]};
  Object.keys(thresholds).forEach(function(stat){
    thresholds[stat].forEach(function(n){
      var val=career[stat]||0;
      if(val>=n&&val<n+10) milestones.push('&#127881; Just hit '+n+' career '+stat+'!');
      else if(val>=n-10&&val<n) milestones.push('&#9889; '+(n-val)+' '+stat+' from '+n+' career '+stat);
    });
  });

  function batRow(s) {
    var pos=primaryPos(s);
    var hasPit=s.pit_G&&s.pit_G>0;
    var pitCells='';
    if(isPitcher){
      pitCells='<td>'+(hasPit?fmtStat(s.pit_G):'')+'</td>'+
        '<td>'+(hasPit?fmtStat(s.pit_GS):'')+'</td>'+
        '<td>'+(hasPit?fmtStat(s.pit_IP,1):'')+'</td>'+
        '<td>'+(hasPit?fmtStat(s.pit_RA):'')+'</td>'+
        '<td>'+(hasPit?fmtStat(s.pit_W)+'-'+fmtStat(s.pit_L):'')+'</td>'+
        '<td>'+(hasPit&&s.pit_IP>0?Number(s.pit_RA/s.pit_IP).toFixed(2):'')+'</td>';
    }
    var posCells=POS_COLS.map(function(k){return '<td>'+((s[k]!=null&&s[k]>0)?s[k]:'')+'</td>';}).join('');
    var pa=(s.AB||0)+(s.BB||0);
    return '<tr>'+
      '<td style="text-align:left;white-space:nowrap"><a style="cursor:pointer;color:inherit;text-decoration:underline;text-decoration-color:var(--sky)" onclick="switchProfileTab(document.querySelector(\'.tab-btn[onclick*=tab-gamelogs]\'),\'tab-gamelogs\');setTimeout(function(){var el=document.getElementById(\'gl-season-\'+String('+s.season_sort+').replace(\'.\',\'-\'));if(el)el.scrollIntoView({behavior:\'smooth\',block:\'start\'});},150)">'+s.season_label+'</a></td>'+
      '<td style="text-align:left;color:var(--sky-light);font-weight:600">'+pos+'</td>'+
      '<td>'+fmtStat(s.G)+'</td><td>'+pa+'</td><td>'+fmtStat(s.AB)+'</td><td>'+fmtStat(s.R)+'</td>'+
      '<td>'+fmtStat(s.H)+'</td><td>'+fmtStat(s.RBI)+'</td>'+
      '<td>'+fmtCount(s.dbl)+'</td><td>'+fmtCount(s.trp)+'</td>'+
      '<td>'+fmtCount(s.HR)+'</td><td>'+fmtCount(s.BB)+'</td>'+
      '<td>'+fmtBA(s.BA)+'</td><td>'+fmtBA(s.OBP)+'</td>'+
      '<td>'+fmtBA(s.SLG)+'</td><td>'+fmtBA(s.OPS)+'</td>'+
      '<td>'+fmtRV(calcRV(s))+'</td>'+
      posCells+pitCells+'</tr>';
  }

  function careerRow() {
    var pitCells='';
    if(isPitcher){
      pitCells='<td>'+(career.pit_G||'')+'</td><td>'+(career.pit_GS||'')+'</td>'+
        '<td>'+(career.pit_IP?fmtStat(career.pit_IP,1):'')+'</td><td>'+(career.pit_RA||'')+'</td>'+
        '<td>'+((career.pit_W||0)+'-'+(career.pit_L||0))+'</td>'+
        '<td>'+(career.pit_IP>0?Number(career.pit_RA/career.pit_IP).toFixed(2):'&mdash;')+'</td>';
    }
    var posCells=POS_COLS.map(function(k){return '<td>'+(career['p_'+k]||'')+'</td>';}).join('');
    return '<tr class="career-row">'+
      '<td>career</td><td></td>'+
      '<td>'+career.G+'</td><td>'+career.PA+'</td><td>'+career.AB+'</td><td>'+career.R+'</td>'+
      '<td>'+career.H+'</td><td>'+career.RBI+'</td>'+
      '<td>'+career.dbl+'</td><td>'+career.trp+'</td>'+
      '<td>'+career.HR+'</td><td>'+career.BB+'</td>'+
      '<td>'+fmtBA(career.BA)+'</td><td>'+fmtBA(career.OBP)+'</td>'+
      '<td>'+fmtBA(career.SLG)+'</td><td>'+fmtBA(career.OPS)+'</td>'+
      '<td>'+fmtRV(career.RV)+'</td>'+posCells+pitCells+'</tr>';
  }

  // Store season rows globally so sortPlayerStats() can re-render them
  // pStats is already sorted newest-first (desc by season_sort)
  window._playerStatRows = pStats.slice();
  window._playerStatRowFn = batRow;
  window._playerCareerRow = careerRow;
  window._playerStatDefaultCol = 'season_sort'; // track so we can mark the header on render

  var pitHeaders=isPitcher?'<th onclick="sortPlayerStats(this)" data-col="pit_G">GP</th><th onclick="sortPlayerStats(this)" data-col="pit_GS">GS</th><th onclick="sortPlayerStats(this)" data-col="pit_IP">IP</th><th onclick="sortPlayerStats(this)" data-col="pit_RA">RA</th><th onclick="sortPlayerStats(this)" data-col="pit_W">W-L</th><th onclick="sortPlayerStats(this)" data-col="pit_RIP">RIP</th>':'';
  var thead='<th style="text-align:left" onclick="sortPlayerStats(this)" data-col="season_sort">Season</th><th style="text-align:left">Pos</th>'+
    '<th onclick="sortPlayerStats(this)" data-col="G">G</th>'+
    '<th onclick="sortPlayerStats(this)" data-col="PA">PA</th>'+
    '<th onclick="sortPlayerStats(this)" data-col="AB">AB</th>'+
    '<th onclick="sortPlayerStats(this)" data-col="R">R</th>'+
    '<th onclick="sortPlayerStats(this)" data-col="H">H</th>'+
    '<th onclick="sortPlayerStats(this)" data-col="RBI">RBI</th>'+
    '<th onclick="sortPlayerStats(this)" data-col="dbl">2B</th>'+
    '<th onclick="sortPlayerStats(this)" data-col="trp">3B</th>'+
    '<th onclick="sortPlayerStats(this)" data-col="HR">HR</th>'+
    '<th onclick="sortPlayerStats(this)" data-col="BB">BB</th>'+
    '<th onclick="sortPlayerStats(this)" data-col="BA">BA</th>'+
    '<th onclick="sortPlayerStats(this)" data-col="OBP">OBP</th>'+
    '<th onclick="sortPlayerStats(this)" data-col="SLG">SLG</th>'+
    '<th onclick="sortPlayerStats(this)" data-col="OPS">OPS</th>'+
    '<th onclick="sortPlayerStats(this)" data-col="RV">RV</th>'+
    '<th onclick="sortPlayerStats(this)" data-col="pos_P">P</th>'+
    '<th onclick="sortPlayerStats(this)" data-col="pos_C">C</th>'+
    '<th onclick="sortPlayerStats(this)" data-col="pos_1B">1B</th>'+
    '<th onclick="sortPlayerStats(this)" data-col="pos_2B">2B</th>'+
    '<th onclick="sortPlayerStats(this)" data-col="pos_3B">3B</th>'+
    '<th onclick="sortPlayerStats(this)" data-col="pos_SS">SS</th>'+
    '<th onclick="sortPlayerStats(this)" data-col="pos_LF">LF</th>'+
    '<th onclick="sortPlayerStats(this)" data-col="pos_LC">LC</th>'+
    '<th onclick="sortPlayerStats(this)" data-col="pos_RC">RC</th>'+
    '<th onclick="sortPlayerStats(this)" data-col="pos_RF">RF</th>'+
    '<th onclick="sortPlayerStats(this)" data-col="pos_DH">DH</th>'+
    pitHeaders;

  var logsTab=pLogs.length>0?'<button class="tab-btn" onclick="switchProfileTab(this,\'tab-gamelogs\')">Game Log</button>':'';
  // Build game log with season separators, totals, and squids
  var logsPanel='';
  if(pLogs.length>0){
    var logHTML='<div id="tab-gamelogs" class="tab-panel">';
    logHTML+='<div style="font-size:0.75rem;color:var(--text-muted);font-family:var(--font-display);margin-bottom:0.5rem">&#129425; Squid of the Game (top RV per gender in that game)</div>';
    // Group by season
    var seasonGroups={};
    var seasonOrder=[];
    pLogs.forEach(function(l){
      var ss=l.season_sort;
      var seas=ss!=null?seasonLabel(ss):(function(){var yr=l.date.slice(0,4);var mo=parseInt(l.date.slice(5,7));return yr+(mo<=6?' Spring':' Fall');})();
      if(!seasonGroups[seas]){seasonGroups[seas]=[];seasonOrder.push(seas);}
      seasonGroups[seas].push(l);
    });
    seasonOrder.forEach(function(seas,i){
      var rows=seasonGroups[seas];
      // Season totals
      var tot={AB:0,R:0,H:0,RBI:0,dbl:0,trp:0,HR:0,BB:0,RV:0};
      rows.forEach(function(l){
        tot.AB+=l.AB||0;tot.R+=l.R||0;tot.H+=l.H||0;tot.RBI+=l.RBI||0;
        tot.dbl+=l.dbl||0;tot.trp+=l.trp||0;tot.HR+=l.HR||0;tot.BB+=l.BB||0;
        tot.RV+=calcRV(l)||0;
      });
      var ba=tot.AB>0?fmtBA(tot.H/tot.AB):'&mdash;';
      var obp=(tot.AB+tot.BB)>0?fmtBA((tot.H+tot.BB)/(tot.AB+tot.BB)):'&mdash;';
      // Season anchor id: e.g. gl-season-2026-2
      var seasAnchor='gl-season-'+String(rows[0].season_sort||'').replace('.','-');
      // Season header
      logHTML+='<div id="'+seasAnchor+'" style="font-family:var(--font-blade);text-transform:lowercase;color:var(--sky);font-size:0.8rem;letter-spacing:0.08em;padding:'+(i>0?'0.8rem':0)+' 0 0.2rem;'+(i>0?'border-top:1px solid var(--border-bright)':'')+'">';
      logHTML+=seas+' Game Logs</div>';
      // Season totals row styled like career row
      logHTML+='<div class="table-wrap profile-log-table" style="margin-bottom:0.25rem"><table>';
      logHTML+='<thead><tr><th style="text-align:left;cursor:pointer" onclick="sortProfileLog(this,\'date\')">Date &#8597;</th><th style="text-align:left">Opp</th><th style="text-align:left">Pos</th><th>PA</th><th>AB</th><th>R</th><th>H</th><th>RBI</th><th>2B</th><th>3B</th><th>HR</th><th>BB</th><th>RV</th></tr></thead>';
      logHTML+='<tbody><tr class="career-row"><td colspan="3" style="text-align:left">'+seas+' totals</td>';
      logHTML+='<td>'+(tot.AB+tot.BB)+'</td><td>'+tot.AB+'</td><td>'+tot.R+'</td><td>'+tot.H+'</td><td>'+tot.RBI+'</td>';
      logHTML+='<td>'+tot.dbl+'</td><td>'+tot.trp+'</td><td>'+tot.HR+'</td><td>'+tot.BB+'</td>';
      logHTML+='<td>'+fmtRV(tot.RV)+'</td></tr>';
      // Build table rows with squid
      // For each game this player appeared in, check if they're squid
      // We need all players in that game to determine top RV per gender
      var gameSquids={};
      var gameDates=Array.from(new Set(rows.map(function(l){return l.date+'||'+(l.game_num||'');})));
      gameDates.forEach(function(key){
        var dp=key.split('||');
        var gdate=dp[0],gnum=dp[1];
        // Get all players in this game from DATA.logs
        var gameRows=DATA.logs.filter(function(l){return l.date===gdate&&String(l.game_num||'')==String(gnum);});
        // Check if forfeit (everyone has 0 stats)
        var totalAB=gameRows.reduce(function(s,l){return s+(l.AB||0);},0);
        var totalH=gameRows.reduce(function(s,l){return s+(l.H||0);},0);
        var totalBB=gameRows.reduce(function(s,l){return s+(l.BB||0);},0);
        if(totalAB===0&&totalH===0&&totalBB===0){gameSquids[key]={};return;} // forfeit
        var genderTop={M:null,F:null};
        gameRows.forEach(function(l){
          var rv=calcRV(l); if(rv===null) return;
          var p=getPlayer(l.player_id);
          var g=p?p.gender:null;
          if(g&&(genderTop[g]===null||rv>genderTop[g]))genderTop[g]=rv;
        });
        var squids={};
        gameRows.forEach(function(l){
          var rv=calcRV(l); if(rv===null) return;
          var p=getPlayer(l.player_id);
          var g=p?p.gender:null;
          if(g&&genderTop[g]!==null&&Math.abs(rv-genderTop[g])<0.001)squids[l.player_id]=true;
        });
        gameSquids[key]=squids;
      });
      // Game rows (continuing same table opened with totals row)
      rows.forEach(function(l){
        var key=l.date+'||'+(l.game_num||'');
        var isSquid=gameSquids[key]&&gameSquids[key][l.player_id];
        var posStr=POS_COLS.filter(function(k){return l[k]&&l[k]>0;}).map(function(k){return POS_LABELS[k];}).join('/')||'&mdash;';
        var lpa=(l.AB||0)+(l.BB||0);
        var dateLink='<a style="cursor:pointer;color:inherit;text-decoration:underline;text-decoration-color:var(--sky)" onclick="window._glTargetGame={season_sort:'+l.season_sort+',game_num:\''+l.game_num+'\'};navigate(\'gamelogs\')">'+l.date+'</a>';
        logHTML+='<tr>'+
          '<td style="text-align:left;white-space:nowrap">'+dateLink+(isSquid?' &#129425;':'')+'</td>'+
          '<td style="text-align:left">'+(l.opponent||'&mdash;')+'</td>'+
          '<td style="text-align:left;color:var(--sky-light)">'+posStr+'</td>'+
          '<td>'+lpa+'</td>'+
          '<td>'+fmtBox(l.AB)+'</td><td>'+fmtBox(l.R)+'</td><td>'+fmtBox(l.H)+'</td>'+
          '<td>'+fmtBox(l.RBI)+'</td><td>'+fmtBox(l.dbl)+'</td><td>'+fmtBox(l.trp)+'</td>'+
          '<td>'+fmtBox(l.HR)+'</td><td>'+fmtBox(l.BB)+'</td>'+
          '<td>'+fmtRV(calcRV(l),1)+'</td></tr>';
      });
      logHTML+='</tbody></table></div>';
    });
    logHTML+='</div>';
    logsPanel=logHTML;
  }
  var statsContent=pStats.length===0
    ?'<div class="empty-state">No official stats yet &mdash; '+LIVE_LABEL+' in progress!</div>'
    :'<div class="tabs">'+
        '<button class="tab-btn active" onclick="switchProfileTab(this,\'tab-seasons\')">By Season</button>'+
        logsTab+'</div>'+
      '<div id="tab-seasons" class="tab-panel active">'+
        '<div class="table-wrap"><table>'+
          '<thead id="player-stat-thead"><tr>'+thead+'</tr></thead>'+
          '<tbody id="player-stat-tbody">'+careerRow()+pStats.map(batRow).join('')+'</tbody>'+
        '</table></div></div>'+logsPanel;

  page.innerHTML=
    '<div class="profile-header" style="padding-top:0.5rem;flex-direction:column;align-items:center;text-align:center">'+
      '<div class="profile-photo">'+makeAvatarImg(id)+'</div>'+
      '<div class="profile-info" style="text-align:center">'+
        '<div class="blade-name">'+player.first+' '+player.last+'</div>'+
        (akaStr?'<div class="aka">'+akaStr+'</div>':'')+
        '<div class="profile-meta" style="justify-content:center">'+
          (player.id==='Wise'?'<span class="badge" style="background:rgba(220,60,60,0.15);color:#f87171;border:1px solid rgba(220,60,60,0.3)">Injured</span>':isActive?'<span class="badge badge-current">Active</span>':'')+
          '<span style="color:var(--text-dim);font-size:0.85rem">Bats '+player.bat+' &middot; Throws '+player.throw+'</span>'+
          (posDisplay?'<span style="color:var(--sky);font-family:var(--font-display);font-weight:700;letter-spacing:0.08em">'+posDisplay+'</span>':'')+
          (nS>0?'<span style="color:var(--text-dim);font-size:0.85rem"><strong style="color:var(--text)">'+nS+'</strong> season'+(nS!==1?'s':'')+' &middot; '+rangeStr+'</span>':'')+
        '</div>'+
        (isActive&&milestones.length?'<div style="margin-top:0.5rem;display:flex;flex-wrap:wrap;gap:0.3rem;justify-content:center">'+
          milestones.map(function(m){return '<span style="background:rgba(240,192,96,0.12);color:var(--gold);border:1px solid rgba(240,192,96,0.3);border-radius:4px;padding:0.15rem 0.6rem;font-size:0.75rem;font-family:var(--font-display);letter-spacing:0.05em">'+m+'</span>';}).join('')+
        '</div>':'')+
      '</div>'+
    '</div>'+
    '<div class="container">'+statsContent+'</div>';
  // Mark Season column as the active sort (desc = newest first, which is the default)
  var seasonTh = document.querySelector('#player-stat-thead th[data-col="season_sort"]');
  if (seasonTh) seasonTh.classList.add('sort-desc');
}

function switchProfileTab(btn,panelId) {
  var page=document.getElementById('page-profile');
  page.querySelectorAll('.tab-btn').forEach(function(b){b.classList.remove('active');});
  page.querySelectorAll('.tab-panel').forEach(function(p){p.classList.remove('active');});
  btn.classList.add('active');
  var el=document.getElementById(panelId);
  if(el) el.classList.add('active');
}


function getGameLogs() {
  // Combine static logs + live logs
  return DATA.logs;
}

function calcGameTeamRows() {
  // Aggregate all player lines per game into team totals (batting + pitching)
  var games = {};
  getGameLogs().forEach(function(l){
    var key = l.date + '||' + (l.game_num||'');
    if(!games[key]){
      games[key] = {date:l.date, game_num:l.game_num, season_sort:l.season_sort, opponent:l.opponent,
        AB:0,R:0,H:0,RBI:0,dbl:0,trp:0,HR:0,BB:0,RV:0,
        pit_IP:0,pit_RA:0,pit_W:0,pit_L:0,pit_S:0,pit_G:0};
    }
    var g = games[key];
    g.AB+=l.AB||0; g.R+=l.R||0; g.H+=l.H||0; g.RBI+=l.RBI||0;
    g.dbl+=l.dbl||0; g.trp+=l.trp||0; g.HR+=l.HR||0; g.BB+=l.BB||0;
    g.RV+=calcRV(l)||0;
    // pitching from game logs uses pit_IP/pit_RA/pit_W/pit_L/pit_S fields
    if(l.pit_IP){ g.pit_IP+=parseFloat(l.pit_IP)||0; g.pit_RA+=l.pit_RA||0; g.pit_G+=1;
      if(l.pit_W&&l.pit_W!=0) g.pit_W+=1; if(l.pit_L&&l.pit_L!=0) g.pit_L+=1; if(l.pit_S&&l.pit_S!=0) g.pit_S+=1; }
  });
  return Object.values(games).sort(function(a,b){return b.date.localeCompare(a.date);});
}

// ── SEASON RECORDS ────────────────────────────────────────────────────────
// Returns an inline HTML snippet (W-L + trophy/runner emoji) for use next to the season label.
// Called from renderStats after the season-label is set.
function renderSeasonRecap(selSeason, mode) {
  var el=document.getElementById('season-recap');
  if(el) el.innerHTML=''; // recap area no longer used for display

  if(!SEASON_RECORDS.length) return;
  var squidsChamps=SEASON_RECORDS.filter(function(s){return s.champ==='Squids';});
  var squidsRunners=SEASON_RECORDS.filter(function(s){return s.runner==='Squids';});

  var labelEl=document.getElementById('season-label');
  if(!labelEl) return;

  var chips='';

  if(mode==='career') {
    var totW=0,totL=0;
    SEASON_RECORDS.forEach(function(s){if(s.w!=null)totW+=s.w;if(s.l!=null)totL+=s.l;});
    chips=
      '<span style="font-family:var(--font-blade);font-size:1.1rem;text-transform:lowercase;color:var(--text);margin-left:1rem">'+totW+'-'+totL+'</span>'+
      (squidsChamps.length?'<span style="margin-left:0.75rem" title="Championships">'+squidsChamps.map(function(){return '&#127942;';}).join('')+'</span>':'')+
      (squidsRunners.length?'<span style="margin-left:0.5rem" title="Runner-ups">'+squidsRunners.map(function(){return '&#129352;';}).join('')+'</span>':'');
  } else if(mode==='all') {
    chips=
      (squidsChamps.length?'<span style="margin-left:0.75rem" title="Championships">'+squidsChamps.map(function(){return '&#127942;';}).join('')+'</span>':'')+
      (squidsRunners.length?'<span style="margin-left:0.5rem" title="Runner-ups">'+squidsRunners.map(function(){return '&#129352;';}).join('')+'</span>':'');
  } else if(selSeason) {
    var key=seasonSortToKey(selSeason);
    var rec=SEASON_RECORDS.find(function(s){return s.s===key;});
    var wl='', isChamp=false, isRunner=false;
    if(rec){
      isChamp=rec.champ==='Squids'; isRunner=rec.runner==='Squids';
      if(rec.w!=null&&rec.l!=null) wl=rec.w+'-'+rec.l;
    }
    // For current/live season, pull W-L from schedule
    if(Math.abs(selSeason-LIVE_SEASON)<0.001&&window._scheduleRows&&window._scheduleRows.length){
      var liveW=0,liveL=0;
      window._scheduleRows.forEach(function(r){
        var res=(r['W/L']||'').trim().toUpperCase();
        if(res==='W')liveW++;else if(res==='L')liveL++;
      });
      if(liveW+liveL>0) wl=liveW+'-'+liveL;
    }
    var wlColor=isChamp?'var(--gold)':isRunner?'var(--sky)':'var(--text-dim)';
    chips=
      (wl?'<span style="font-family:var(--font-blade);font-size:1.1rem;text-transform:lowercase;color:'+wlColor+';margin-left:1rem">'+wl+'</span>':'')+
      (isChamp?' <span title="Champions">&#127942;</span>':'')+
      (isRunner?' <span title="Runner-up">&#129352;</span>':'');
  }

  // Append chips inline to whatever text is already in season-label
  if(chips){
    labelEl.innerHTML=labelEl.textContent+chips;
  }
}

// Build the season history block for the Records page
function renderSeasonHistory() {
  var el=document.getElementById('records-season-history');
  if(!el||!SEASON_RECORDS.length) return;
  var squidsChamps=SEASON_RECORDS.filter(function(s){return s.champ==='Squids';});
  var squidsRunners=SEASON_RECORDS.filter(function(s){return s.runner==='Squids';});
  var totW=0,totL=0;
  SEASON_RECORDS.forEach(function(s){if(s.w!=null)totW+=s.w;if(s.l!=null)totL+=s.l;});

  var pennants=squidsChamps.map(function(s){
    return '<div style="display:flex;flex-direction:column;align-items:center;gap:0.2rem;cursor:pointer" onclick="goToSeasonStats('+parseFloat('20'+s.s)+')">'+
      '<div style="font-size:1.6rem">&#127942;</div>'+
      '<div style="font-family:var(--font-blade);font-size:0.65rem;text-transform:lowercase;color:var(--gold)">'+seasonLabel(parseFloat('20'+s.s))+'</div>'+
    '</div>';
  }).join('')+squidsRunners.map(function(s){
    return '<div style="display:flex;flex-direction:column;align-items:center;gap:0.2rem;cursor:pointer" onclick="goToSeasonStats('+parseFloat('20'+s.s)+')">'+
      '<div style="font-size:1.6rem">&#129352;</div>'+
      '<div style="font-family:var(--font-blade);font-size:0.65rem;text-transform:lowercase;color:var(--sky-light)">'+seasonLabel(parseFloat('20'+s.s))+'</div>'+
    '</div>';
  }).join('');

  el.innerHTML=
    '<div class="section-title" style="margin-bottom:0.75rem">Season History</div>'+
    '<div style="display:flex;align-items:flex-start;gap:2rem;flex-wrap:wrap">'+
      '<div>'+
        '<div class="filter-label">All-Time Record</div>'+
        '<div style="font-family:var(--font-blade);font-size:1.6rem;text-transform:lowercase;color:var(--text)">'+totW+'-'+totL+'</div>'+
      '</div>'+
      '<div>'+
        '<div class="filter-label" style="margin-bottom:0.5rem">Championships &amp; Runner-ups</div>'+
        '<div style="display:flex;gap:1rem;flex-wrap:wrap;align-items:flex-end">'+pennants+'</div>'+
      '</div>'+
    '</div>';
}


function showSeasons(opts) {
  // opts: { season_sort, scope } — if provided, use them instead of defaults
  opts = opts || {};
  document.getElementById('page-seasons').classList.add('active');
  var seasons = Array.from(new Set(DATA.stats.map(function(s){return s.season_sort;}))).sort(function(a,b){return b-a;});

  // Populate season dropdown
  var sel = document.getElementById('stats-season');
  if (sel) {
    sel.innerHTML = '<option value="all">All Seasons</option>' +
      seasons.map(function(s){
        var v = s.toFixed(1);
        return '<option value="'+v+'">'+seasonLabel(s)+'</option>';
      }).join('');
    // Use pre-set value if provided, otherwise default to most recent season
    sel.value = opts.season_sort ? Number(opts.season_sort).toFixed(1) : seasons[0].toFixed(1);
  }
  // Also keep season-select in sync for recap
  var sel2 = document.getElementById('season-select');
  if (sel2) {
    sel2.innerHTML = seasons.map(function(s){return '<option value="'+s+'">'+seasonLabel(s)+'</option>';}).join('');
  }

  // Set scope: use pre-set value if provided, otherwise default to season-player
  var scopeEl = document.getElementById('stats-scope');
  if (scopeEl && opts.scope) {
    scopeEl.value = opts.scope;
  } else if (scopeEl && !opts.scope) {
    scopeEl.value = 'season-player';
  }

  // Sync season field enabled/disabled state to current scope
  onScopeChange();

  renderStats();
  renderSeasonRecap(opts.season_sort ? Number(opts.season_sort) : seasons[0]);
}

function onScopeChange() {
  var scope = (document.getElementById('stats-scope')||{}).value || '';
  var seasonEl = document.getElementById('stats-season');
  if (!seasonEl) return;
  var isCareer = scope === 'career-player' || scope === 'career-team';
  if (isCareer) {
    seasonEl.value = 'all';
    seasonEl.disabled = true;
    seasonEl.style.opacity = '0.4';
    seasonEl.style.cursor = 'not-allowed';
  } else {
    seasonEl.disabled = false;
    seasonEl.style.opacity = '';
    seasonEl.style.cursor = '';
  }
  renderStats();
}

function renderStats() {
  // If lineup view is active, re-render it instead of stats table
  if (_lineupActive) { renderLineup(); return; }
  var scopeEl   = document.getElementById('stats-scope');
  var seasonEl  = document.getElementById('stats-season');
  var viewEl    = document.getElementById('stats-view');
  var genderEl  = document.getElementById('stats-gender');
  var activeEl  = document.getElementById('stats-active');
  var minABEl   = document.getElementById('stats-minab');
  if (!scopeEl) return;

  var scope    = scopeEl.value;
  // Normalize legacy scope names
  if (scope === 'season') scope = 'season-player';
  if (scope === 'career') scope = 'career-player';
  // Season filter is available in all scopes
  if(seasonEl){ seasonEl.disabled = false; seasonEl.style.opacity = '1'; }
  var season   = seasonEl ? seasonEl.value : 'all';
  var view     = viewEl ? viewEl.value : 'batting';
  var gender   = genderEl ? genderEl.value : 'all';
  var activeOnly = activeEl ? activeEl.checked : false;
  var minAB    = minABEl ? (parseInt(minABEl.value)||0) : 0;

  var activeSet = new Set(DATA.stats.filter(function(s){return s.season_sort===DATA.maxSeason;}).map(function(s){return s.player_id;}));

  function gok(id) {
    if (gender !== 'all') { var p=getPlayer(id); if(!p||p.gender!==gender) return false; }
    if (activeOnly && !activeSet.has(id)) return false;
    return true;
  }

  var isCareerMode = scope === 'career-player' || scope === 'career-team';

  // Set season label text FIRST, then append recap chips inline
  var labelEl = document.getElementById('season-label');
  if (labelEl) {
    if (isCareerMode && season === 'all') labelEl.textContent = 'Career';
    else if (season === 'all') labelEl.textContent = 'All Seasons — every player-season';
    else labelEl.textContent = seasonLabel(parseFloat(season));
  }

  // Append W-L + trophy chips inline to the label
  if (isCareerMode && season === 'all') {
    renderSeasonRecap(null, 'career');
  } else if (season === 'all') {
    renderSeasonRecap(null, 'all');
  } else {
    renderSeasonRecap(parseFloat(season), 'season');
  }

  var thead = document.getElementById('season-thead');
  var tbody = document.getElementById('season-tbody');
  thead.innerHTML = ''; tbody.innerHTML = '';
  // Always reset game mode - prevents bleed between scope switches
  window._statsGameMode = undefined;
  window._statsShowSeason = false;

  // ── GAME MODES ──
  if (scope === 'game-player') { renderGamePlayerRows(gender, activeOnly, activeSet, minAB, view, season); return; }
  if (scope === 'game-team')   { renderGameTeamRows(view, season); return; }
  // ── TEAM AGGREGATE MODES ──
  if (scope === 'season-team') { renderSeasonTeamRows(season, view); return; }
  if (scope === 'career-team') { renderCareerTeamRow(view, season); return; }

  // ── BATTING (player scopes) ──
  if (view === 'batting') {
    var rows = [];
    if (scope === 'season-player') {
      // Single season or best in any season
      var pool = DATA.stats.filter(function(s){
        if (season !== 'all' && s.season_sort.toFixed(1) !== season) return false;
        if (!gok(s.player_id)) return false;
        if ((s.G||0) === 0) return false;
        if (minAB > 0 && ((s.AB||0)+(s.BB||0)) < minAB) return false;
        return true;
      });
      rows = pool.sort(function(a,b){return (b.G||0)-(a.G||0)||(b.AB||0)-(a.AB||0);}).map(function(s){
        var r={pid:s.player_id, seasonStr:s.season_label, season_sort:s.season_sort,
          G:s.G,PA:(s.AB||0)+(s.BB||0),AB:s.AB,R:s.R,H:s.H,RBI:s.RBI,dbl:s.dbl,trp:s.trp,HR:s.HR,BB:s.BB,
          BA:s.BA,OBP:s.OBP,SLG:s.SLG,OPS:s.OPS,RV:calcRV(s)};
        POS_COLS.forEach(function(k){r[k]=s[k]||0;});
        return r;
      });
    } else {
      // Career totals (optionally filtered to a single season)
      var tots = {};
      DATA.stats.forEach(function(s){
        if (season !== 'all' && s.season_sort.toFixed(1) !== season) return;
        if (!gok(s.player_id)) return;
        if (!tots[s.player_id]) { tots[s.player_id]={G:0,AB:0,H:0,HR:0,RBI:0,R:0,dbl:0,trp:0,BB:0}; POS_COLS.forEach(function(k){tots[s.player_id][k]=0;}); }
        var t=tots[s.player_id];
        t.G+=s.G||0;t.AB+=s.AB||0;t.H+=s.H||0;t.HR+=s.HR||0;t.RBI+=s.RBI||0;
        t.R+=s.R||0;t.dbl+=s.dbl||0;t.trp+=s.trp||0;t.BB+=s.BB||0;
        POS_COLS.forEach(function(k){t[k]+=(s[k]||0);});
      });
      rows = Object.entries(tots)
        .filter(function(e){return e[1].G>0&&(minAB===0||e[1].AB>=minAB);})
        .map(function(e){
          var id=e[0],t=e[1];
          var sg=t.H-t.dbl-t.trp-t.HR;
          var ba=t.AB>0?t.H/t.AB:null;
          var obp=(t.AB+t.BB)>0?(t.H+t.BB)/(t.AB+t.BB):null;
          var slg=t.AB>0?(sg+2*t.dbl+3*t.trp+4*t.HR)/t.AB:null;
          var r={pid:id, seasonStr:season!=='all'?seasonLabel(parseFloat(season)):'Career',
            G:t.G,PA:t.AB+t.BB,AB:t.AB,R:t.R,H:t.H,RBI:t.RBI,dbl:t.dbl,trp:t.trp,HR:t.HR,BB:t.BB,
            BA:ba,OBP:obp,SLG:slg,OPS:(obp!=null&&slg!=null)?obp+slg:null,RV:calcRV(t)};
          POS_COLS.forEach(function(k){r[k]=t[k]||0;});
          return r;
        })
        .sort(function(a,b){return (b.G||0)-(a.G||0)||(b.AB||0)-(a.AB||0);});
    }

    var showSeasonCol = (scope==='season-player' && season==='all');
    thead.innerHTML = '<tr>'+
      '<th style="text-align:left">Player</th>'+
      (showSeasonCol?'<th style="text-align:left">Season</th>':'')+
      '<th onclick="sortStats(this)" data-col="G">G</th>'+
      '<th onclick="sortStats(this)" data-col="PA">PA</th>'+
      '<th onclick="sortStats(this)" data-col="AB">AB</th>'+
      '<th onclick="sortStats(this)" data-col="R">R</th>'+
      '<th onclick="sortStats(this)" data-col="H">H</th>'+
      '<th onclick="sortStats(this)" data-col="RBI">RBI</th>'+
      '<th onclick="sortStats(this)" data-col="dbl">2B</th>'+
      '<th onclick="sortStats(this)" data-col="trp">3B</th>'+
      '<th onclick="sortStats(this)" data-col="HR">HR</th>'+
      '<th onclick="sortStats(this)" data-col="BB">BB</th>'+
      '<th onclick="sortStats(this)" data-col="BA">BA</th>'+
      '<th onclick="sortStats(this)" data-col="OBP">OBP</th>'+
      '<th onclick="sortStats(this)" data-col="SLG">SLG</th>'+
      '<th onclick="sortStats(this)" data-col="OPS">OPS</th>'+
      '<th onclick="sortStats(this)" data-col="RV">RV</th>'+
      POS_COLS.map(function(k){return '<th onclick="sortStats(this)" data-col="'+k+'">'+POS_LABELS[k]+'</th>';}).join('')+
    '</tr>';

    window._statsRows = rows;
    window._statsShowSeason = showSeasonCol;
    renderStatsRows();

  // ── PITCHING (player scopes) ──
  } else {
    var prows = [];
    if (scope === 'season-player') {
      var pool2 = DATA.stats.filter(function(s){
        if (season !== 'all' && s.season_sort.toFixed(1) !== season) return false;
        if (!gok(s.player_id)) return false;
        if (!s.pit_G || s.pit_G <= 0) return false;
        return true;
      });
      prows = pool2.sort(function(a,b){return (b.pit_IP||0)-(a.pit_IP||0);}).map(function(s){
        return {pid:s.player_id,seasonStr:s.season_label,season_sort:s.season_sort,
          pit_G:s.pit_G,pit_GS:s.pit_GS,pit_IP:s.pit_IP,pit_RA:s.pit_RA,
          pit_W:s.pit_W,pit_L:s.pit_L,pit_S:s.pit_S,
          RIP:s.pit_IP>0?s.pit_RA/s.pit_IP:null};
      });
    } else {
      var ptots = {};
      DATA.stats.forEach(function(s){
        if (!gok(s.player_id)) return;
        if (!s.pit_G||s.pit_G<=0) return;
        if (!ptots[s.player_id]) ptots[s.player_id]={pit_G:0,pit_GS:0,pit_IP:0,pit_RA:0,pit_W:0,pit_L:0,pit_S:0};
        var t=ptots[s.player_id];
        t.pit_G+=s.pit_G||0;t.pit_GS+=s.pit_GS||0;t.pit_IP+=s.pit_IP||0;
        t.pit_RA+=s.pit_RA||0;t.pit_W+=s.pit_W||0;t.pit_L+=s.pit_L||0;t.pit_S+=s.pit_S||0;
      });
      prows = Object.values(ptots).filter(function(t){return t.pit_G>0;})
        .map(function(t,i){
          var id=Object.keys(ptots)[i];
          return {pid:id,seasonStr:'Career',
            pit_G:t.pit_G,pit_GS:t.pit_GS,pit_IP:t.pit_IP,pit_RA:t.pit_RA,
            pit_W:t.pit_W,pit_L:t.pit_L,pit_S:t.pit_S,
            RIP:t.pit_IP>0?t.pit_RA/t.pit_IP:null};
        })
        .sort(function(a,b){return (b.pit_IP||0)-(a.pit_IP||0);});
    }

    var showSeasonCol2 = (scope==='season-player' && season==='all');
    thead.innerHTML = '<tr>'+
      '<th style="text-align:left">Player</th>'+
      (showSeasonCol2?'<th style="text-align:left">Season</th>':'')+
      '<th onclick="sortStats(this)" data-col="pit_G">G</th>'+
      '<th onclick="sortStats(this)" data-col="pit_GS">GS</th>'+
      '<th onclick="sortStats(this)" data-col="pit_IP">IP</th>'+
      '<th onclick="sortStats(this)" data-col="pit_RA">RA</th>'+
      '<th onclick="sortStats(this)" data-col="pit_W">W-L</th>'+
      '<th onclick="sortStats(this)" data-col="RIP">RIP</th>'+
    '</tr>';

    window._statsRows = prows;
    window._statsShowSeason = showSeasonCol2;
    window._statsPitching = true;
    renderStatsRows();
    return;
  }
  window._statsPitching = false;
}

function renderGamePlayerRows(gender, activeOnly, activeSet, minAB, view, season) {
  var isPit = view === 'pitching';
  var logs = getGameLogs().filter(function(l){
    if(season && season !== 'all' && (l.season_sort==null || l.season_sort.toFixed(1) !== season)) return false;
    if(gender !== 'all'){ var p=getPlayer(l.player_id); if(!p||p.gender!==gender) return false; }
    if(activeOnly && !activeSet.has(l.player_id)) return false;
    if(isPit) return !!(l.pit_G);
    if(minAB > 0 && ((l.AB||0)+(l.BB||0)) < minAB) return false;
    return true;
  });
  var rows;
  if (isPit) {
    rows = logs.map(function(l){
      return {pid:l.player_id, date:l.date, opponent:l.opponent||'',
        season_sort:l.season_sort, game_num:l.game_num,
        pit_G:1, pit_IP:parseFloat(l.pit_IP)||0, pit_RA:l.pit_RA||0,
        pit_W:(l.pit_W&&l.pit_W!=0)?1:0, pit_L:(l.pit_L&&l.pit_L!=0)?1:0, pit_S:(l.pit_S&&l.pit_S!=0)?1:0,
        RIP:parseFloat(l.pit_IP)>0?(l.pit_RA||0)/parseFloat(l.pit_IP):null};
    });
    rows.sort(function(a,b){return (b.pit_IP||0)-(a.pit_IP||0);});
  } else {
    rows = logs.map(function(l){
      return {pid:l.player_id, date:l.date, opponent:l.opponent||'',
        season_sort:l.season_sort, game_num:l.game_num,
        G:1, PA:(l.AB||0)+(l.BB||0), AB:l.AB||0, R:l.R||0, H:l.H||0, RBI:l.RBI||0,
        dbl:l.dbl||0, trp:l.trp||0, HR:l.HR||0, BB:l.BB||0,
        BA:(l.AB||0)>0?(l.H||0)/(l.AB||0):null,
        OBP:((l.AB||0)+(l.BB||0))>0?((l.H||0)+(l.BB||0))/((l.AB||0)+(l.BB||0)):null,
        RV:calcRV(l)};
    });
    rows.sort(function(a,b){return (b.AB||0)-(a.AB||0);});
  }
  window._statsRows = rows;
  window._statsShowSeason = true; // show date+opp columns
  window._statsPitching = isPit;
  window._statsGameMode = 'player';

  var thead = document.getElementById('season-thead');
  var labelEl = document.getElementById('season-label');
  var gSeasonSuffix = (season && season !== 'all') ? (' — '+seasonLabel(parseFloat(season))) : '';
  if(labelEl) labelEl.textContent = isPit ? ('Individual Pitching — Game Lines'+gSeasonSuffix) : ('Individual Batting — Game Lines'+gSeasonSuffix);
  if (isPit) {
    thead.innerHTML = '<tr>'+
      '<th style="text-align:left">Player</th>'+
      '<th onclick="sortStats(this)" data-col="date" style="text-align:left">Date</th>'+
      '<th onclick="sortStats(this)" data-col="opponent" style="text-align:left">Opp</th>'+
      '<th onclick="sortStats(this)" data-col="pit_IP">IP</th>'+
      '<th onclick="sortStats(this)" data-col="pit_RA">RA</th>'+
      '<th onclick="sortStats(this)" data-col="pit_W">W-L</th>'+
      '<th onclick="sortStats(this)" data-col="RIP">RIP</th>'+
    '</tr>';
  } else {
    thead.innerHTML = '<tr>'+
      '<th style="text-align:left">Player</th>'+
      '<th onclick="sortStats(this)" data-col="date" style="text-align:left">Date</th>'+
      '<th onclick="sortStats(this)" data-col="opponent" style="text-align:left">Opp</th>'+
      '<th onclick="sortStats(this)" data-col="PA">PA</th>'+
      '<th onclick="sortStats(this)" data-col="AB">AB</th>'+
      '<th onclick="sortStats(this)" data-col="R">R</th>'+
      '<th onclick="sortStats(this)" data-col="H">H</th>'+
      '<th onclick="sortStats(this)" data-col="RBI">RBI</th>'+
      '<th onclick="sortStats(this)" data-col="dbl">2B</th>'+
      '<th onclick="sortStats(this)" data-col="trp">3B</th>'+
      '<th onclick="sortStats(this)" data-col="HR">HR</th>'+
      '<th onclick="sortStats(this)" data-col="BB">BB</th>'+
      '<th onclick="sortStats(this)" data-col="BA">BA</th>'+
      '<th onclick="sortStats(this)" data-col="OBP">OBP</th>'+
      '<th onclick="sortStats(this)" data-col="RV">RV</th>'+
    '</tr>';
  }
  renderStatsRows();
}

function renderGameTeamRows(view, season) {
  var isPit = view === 'pitching';
  var gameData = calcGameTeamRows();
  if (season && season !== 'all') {
    gameData = gameData.filter(function(g){ return g.season_sort!=null && g.season_sort.toFixed(1) === season; });
  }
  var rows = gameData.map(function(g){
    return {pid:null, date:g.date, opponent:g.opponent,
      season_sort:g.season_sort, game_num:g.game_num,
      PA:g.AB+g.BB, AB:g.AB, R:g.R, H:g.H, RBI:g.RBI,
      dbl:g.dbl, trp:g.trp, HR:g.HR, BB:g.BB,
      BA:g.AB>0?g.H/g.AB:null,
      OBP:(g.AB+g.BB)>0?(g.H+g.BB)/(g.AB+g.BB):null,
      RV:g.RV,
      pit_G:g.pit_G, pit_IP:g.pit_IP, pit_RA:g.pit_RA,
      pit_W:g.pit_W, pit_L:g.pit_L, pit_S:g.pit_S,
      RIP:g.pit_IP>0?g.pit_RA/g.pit_IP:null};
  });
  if (isPit) {
    rows = rows.filter(function(r){return r.pit_G>0;});
    rows.sort(function(a,b){return (b.pit_IP||0)-(a.pit_IP||0);});
  } else {
    rows.sort(function(a,b){return (b.RV||0)-(a.RV||0);});
  }
  window._statsRows = rows;
  window._statsShowSeason = false;
  window._statsPitching = isPit;
  window._statsGameMode = 'team';

  var thead = document.getElementById('season-thead');
  var labelEl = document.getElementById('season-label');
  var gtSeasonSuffix = (season && season !== 'all') ? (' — '+seasonLabel(parseFloat(season))) : '';
  if(labelEl) labelEl.textContent = isPit ? ('Team Pitching — Game Totals'+gtSeasonSuffix) : ('Team Batting — Game Totals'+gtSeasonSuffix);
  if (isPit) {
    thead.innerHTML = '<tr>'+
      '<th onclick="sortStats(this)" data-col="date" style="text-align:left">Date</th>'+
      '<th onclick="sortStats(this)" data-col="opponent" style="text-align:left">Opponent</th>'+
      '<th onclick="sortStats(this)" data-col="pit_IP">IP</th>'+
      '<th onclick="sortStats(this)" data-col="pit_RA">RA</th>'+
      '<th onclick="sortStats(this)" data-col="pit_W">W-L</th>'+
      '<th onclick="sortStats(this)" data-col="RIP">RIP</th>'+
    '</tr>';
  } else {
    thead.innerHTML = '<tr>'+
      '<th onclick="sortStats(this)" data-col="date" style="text-align:left">Date</th>'+
      '<th onclick="sortStats(this)" data-col="opponent" style="text-align:left">Opponent</th>'+
      '<th onclick="sortStats(this)" data-col="PA">PA</th>'+
      '<th onclick="sortStats(this)" data-col="AB">AB</th>'+
      '<th onclick="sortStats(this)" data-col="R">R</th>'+
      '<th onclick="sortStats(this)" data-col="H">H</th>'+
      '<th onclick="sortStats(this)" data-col="RBI">RBI</th>'+
      '<th onclick="sortStats(this)" data-col="dbl">2B</th>'+
      '<th onclick="sortStats(this)" data-col="trp">3B</th>'+
      '<th onclick="sortStats(this)" data-col="HR">HR</th>'+
      '<th onclick="sortStats(this)" data-col="BB">BB</th>'+
      '<th onclick="sortStats(this)" data-col="BA">BA</th>'+
      '<th onclick="sortStats(this)" data-col="OBP">OBP</th>'+
      '<th onclick="sortStats(this)" data-col="RV">RV</th>'+
    '</tr>';
  }
  renderStatsRows();
}

function renderSeasonTeamRows(season, view) {
  // One row per season aggregating all player stats for that season
  var isPit = view === 'pitching';
  var byseason = {};
  DATA.stats.forEach(function(s){
    var key = s.season_sort ? s.season_sort.toFixed(1) : '0';
    if (season !== 'all' && key !== season) return;
    if (!byseason[key]) byseason[key] = {
      season_sort: s.season_sort, season_label: s.season_label||seasonLabel(s.season_sort),
      G:0,AB:0,H:0,HR:0,RBI:0,R:0,dbl:0,trp:0,BB:0,RV:0,
      pit_G:0,pit_IP:0,pit_RA:0,pit_W:0,pit_L:0,pit_S:0
    };
    var t = byseason[key];
    t.G  = Math.max(t.G, s.G||0); // GP for the team = max player games (not sum)
    t.AB+=s.AB||0; t.H+=s.H||0; t.HR+=s.HR||0; t.RBI+=s.RBI||0;
    t.R+=s.R||0; t.dbl+=s.dbl||0; t.trp+=s.trp||0; t.BB+=s.BB||0;
    t.pit_G+=s.pit_G||0; t.pit_IP+=s.pit_IP||0; t.pit_RA+=s.pit_RA||0;
    t.pit_W+=s.pit_W||0; t.pit_L+=s.pit_L||0; t.pit_S+=s.pit_S||0;
  });
  var rows = Object.values(byseason).sort(function(a,b){return b.season_sort-a.season_sort;}).map(function(t){
    var sg=t.H-t.dbl-t.trp-t.HR;
    var ba=t.AB>0?t.H/t.AB:null;
    var obp=(t.AB+t.BB)>0?(t.H+t.BB)/(t.AB+t.BB):null;
    var slg=t.AB>0?(sg+2*t.dbl+3*t.trp+4*t.HR)/t.AB:null;
    return {pid:null, seasonStr:t.season_label, season_sort:t.season_sort,
      G:t.G, PA:t.AB+t.BB, AB:t.AB, R:t.R, H:t.H, RBI:t.RBI,
      dbl:t.dbl, trp:t.trp, HR:t.HR, BB:t.BB,
      BA:ba, OBP:obp, SLG:slg, OPS:(obp&&slg)?obp+slg:null, RV:calcRV(t),
      pit_G:t.pit_G, pit_IP:t.pit_IP, pit_RA:t.pit_RA,
      pit_W:t.pit_W, pit_L:t.pit_L, pit_S:t.pit_S,
      RIP:t.pit_IP>0?t.pit_RA/t.pit_IP:null};
  });
  if (isPit) rows = rows.filter(function(r){return r.pit_G>0;});

  window._statsRows = rows;
  window._statsShowSeason = (season === 'all');
  window._statsPitching = isPit;
  window._statsGameMode = 'season-team';

  var thead = document.getElementById('season-thead');
  var labelEl = document.getElementById('season-label');
  if(labelEl) labelEl.textContent = isPit ? 'Team Pitching by Season' : 'Team Batting by Season';
  if (isPit) {
    thead.innerHTML = '<tr>'+
      '<th onclick="sortStats(this)" data-col="season_sort" style="text-align:left">Season</th>'+
      '<th onclick="sortStats(this)" data-col="pit_G">G</th>'+
      '<th onclick="sortStats(this)" data-col="pit_IP">IP</th>'+
      '<th onclick="sortStats(this)" data-col="pit_RA">RA</th>'+
      '<th onclick="sortStats(this)" data-col="pit_W">W-L</th>'+
      '<th onclick="sortStats(this)" data-col="RIP">RIP</th>'+
    '</tr>';
  } else {
    thead.innerHTML = '<tr>'+
      '<th onclick="sortStats(this)" data-col="season_sort" style="text-align:left">Season</th>'+
      '<th onclick="sortStats(this)" data-col="G">G</th>'+
      '<th onclick="sortStats(this)" data-col="PA">PA</th>'+
      '<th onclick="sortStats(this)" data-col="AB">AB</th>'+
      '<th onclick="sortStats(this)" data-col="R">R</th>'+
      '<th onclick="sortStats(this)" data-col="H">H</th>'+
      '<th onclick="sortStats(this)" data-col="RBI">RBI</th>'+
      '<th onclick="sortStats(this)" data-col="dbl">2B</th>'+
      '<th onclick="sortStats(this)" data-col="trp">3B</th>'+
      '<th onclick="sortStats(this)" data-col="HR">HR</th>'+
      '<th onclick="sortStats(this)" data-col="BB">BB</th>'+
      '<th onclick="sortStats(this)" data-col="BA">BA</th>'+
      '<th onclick="sortStats(this)" data-col="OBP">OBP</th>'+
      '<th onclick="sortStats(this)" data-col="SLG">SLG</th>'+
      '<th onclick="sortStats(this)" data-col="OPS">OPS</th>'+
      '<th onclick="sortStats(this)" data-col="RV">RV</th>'+
    '</tr>';
  }
  renderStatsRows();
}

function renderCareerTeamRow(view, season) {
  // Single row: all-time (or single-season) team totals
  var isPit = view === 'pitching';
  var t = {G:0,AB:0,H:0,HR:0,RBI:0,R:0,dbl:0,trp:0,BB:0,RV:0,
    pit_G:0,pit_IP:0,pit_RA:0,pit_W:0,pit_L:0,pit_S:0,seasons:0};
  var seenSeasons = {};
  // Track max G per season, then sum across seasons for total games played
  var gBySeasons = {};
  DATA.stats.forEach(function(s){
    if (season && season !== 'all' && s.season_sort.toFixed(1) !== season) return;
    if (!seenSeasons[s.season_sort]) { seenSeasons[s.season_sort]=1; t.seasons++; gBySeasons[s.season_sort]=0; }
    gBySeasons[s.season_sort] = Math.max(gBySeasons[s.season_sort], s.G||0);
    t.AB+=s.AB||0; t.H+=s.H||0; t.HR+=s.HR||0; t.RBI+=s.RBI||0;
    t.R+=s.R||0; t.dbl+=s.dbl||0; t.trp+=s.trp||0; t.BB+=s.BB||0;
    t.pit_G+=s.pit_G||0; t.pit_IP+=s.pit_IP||0; t.pit_RA+=s.pit_RA||0;
    t.pit_W+=s.pit_W||0; t.pit_L+=s.pit_L||0; t.pit_S+=s.pit_S||0;
  });
  // Sum max-G per season to get total games played across all seasons
  Object.values(gBySeasons).forEach(function(g){ t.G+=g; });
  var sg=t.H-t.dbl-t.trp-t.HR;
  var ba=t.AB>0?t.H/t.AB:null;
  var obp=(t.AB+t.BB)>0?(t.H+t.BB)/(t.AB+t.BB):null;
  var slg=t.AB>0?(sg+2*t.dbl+3*t.trp+4*t.HR)/t.AB:null;
  var periodLabel = (season && season !== 'all') ? seasonLabel(parseFloat(season)) : 'All-Time';
  var row = {pid:null, seasonStr:periodLabel,
    G:t.G, PA:t.AB+t.BB, AB:t.AB, R:t.R, H:t.H, RBI:t.RBI,
    dbl:t.dbl, trp:t.trp, HR:t.HR, BB:t.BB,
    BA:ba, OBP:obp, SLG:slg, OPS:(obp&&slg)?obp+slg:null, RV:calcRV(t),
    pit_G:t.pit_G, pit_IP:t.pit_IP, pit_RA:t.pit_RA,
    pit_W:t.pit_W, pit_L:t.pit_L, pit_S:t.pit_S,
    RIP:t.pit_IP>0?t.pit_RA/t.pit_IP:null};

  window._statsRows = [row];
  window._statsShowSeason = false;
  window._statsPitching = isPit;
  window._statsGameMode = 'career-team';

  var thead = document.getElementById('season-thead');
  var labelEl = document.getElementById('season-label');
  if(labelEl) labelEl.textContent = isPit ? ('Team Pitching — '+periodLabel) : ('Team Batting — '+periodLabel);
  if (isPit) {
    thead.innerHTML = '<tr>'+
      '<th style="text-align:left">Period</th>'+
      '<th onclick="sortStats(this)" data-col="pit_G">G</th>'+
      '<th onclick="sortStats(this)" data-col="pit_IP">IP</th>'+
      '<th onclick="sortStats(this)" data-col="pit_RA">RA</th>'+
      '<th onclick="sortStats(this)" data-col="pit_W">W-L</th>'+
      '<th onclick="sortStats(this)" data-col="RIP">RIP</th>'+
    '</tr>';
  } else {
    thead.innerHTML = '<tr>'+
      '<th style="text-align:left">Period</th>'+
      '<th onclick="sortStats(this)" data-col="G">G</th>'+
      '<th onclick="sortStats(this)" data-col="PA">PA</th>'+
      '<th onclick="sortStats(this)" data-col="AB">AB</th>'+
      '<th onclick="sortStats(this)" data-col="R">R</th>'+
      '<th onclick="sortStats(this)" data-col="H">H</th>'+
      '<th onclick="sortStats(this)" data-col="RBI">RBI</th>'+
      '<th onclick="sortStats(this)" data-col="dbl">2B</th>'+
      '<th onclick="sortStats(this)" data-col="trp">3B</th>'+
      '<th onclick="sortStats(this)" data-col="HR">HR</th>'+
      '<th onclick="sortStats(this)" data-col="BB">BB</th>'+
      '<th onclick="sortStats(this)" data-col="BA">BA</th>'+
      '<th onclick="sortStats(this)" data-col="OBP">OBP</th>'+
      '<th onclick="sortStats(this)" data-col="SLG">SLG</th>'+
      '<th onclick="sortStats(this)" data-col="OPS">OPS</th>'+
      '<th onclick="sortStats(this)" data-col="RV">RV</th>'+
    '</tr>';
  }
  renderStatsRows();
}

function renderStatsTotalsRow(rows) {
  var tfoot = document.getElementById('season-tfoot');
  if (!tfoot) return;
  var isPitching = window._statsPitching;
  var gameMode = window._statsGameMode;
  // Always clear tfoot (no longer used for totals)
  tfoot.innerHTML = '';
  // Always total over the full row set
  rows = window._statsRows || rows;
  // Skip if 0 or 1 row
  if (!rows || rows.length <= 1) {
    window._statsTotalsHTML = '';
    return;
  }
  var showSeasonCol = window._statsShowSeason;
  var isTeamMode = (gameMode === 'season-team' || gameMode === 'career-team');
  var isGameMode = (gameMode === 'player' || gameMode === 'team');

  var totalsHTML;
  if (isPitching) {
    var t = {pit_G:0,pit_GS:0,pit_IP:0,pit_RA:0,pit_W:0,pit_L:0,pit_S:0};
    rows.forEach(function(r){
      t.pit_G+=r.pit_G||0; t.pit_GS+=r.pit_GS||0; t.pit_IP+=r.pit_IP||0;
      t.pit_RA+=r.pit_RA||0; t.pit_W+=r.pit_W||0; t.pit_L+=r.pit_L||0; t.pit_S+=r.pit_S||0;
    });
    // game-player pitching has no G/GS columns; season/career views do
    var gsCells = isGameMode ? '' : '<td>'+t.pit_G+'</td><td>'+t.pit_GS+'</td>';
    var cells = (!isTeamMode && !isGameMode && showSeasonCol ? '<td></td>' : '')+
      gsCells+
      '<td>'+Number(t.pit_IP).toFixed(1)+'</td><td>'+t.pit_RA+'</td>'+
      '<td>'+t.pit_W+'-'+t.pit_L+'</td>'+
      '<td>'+(t.pit_IP>0?Number(t.pit_RA/t.pit_IP).toFixed(2):'&mdash;')+'</td>';
    // game-player: "Total | (blank Date) | (blank Opp) | ...stats..."
    // game-team:   "Total | (blank Opponent) | ...stats..."
    var prefix = (gameMode === 'player') ? '<td></td><td></td>' : (gameMode === 'team' ? '<td></td>' : '');
    totalsHTML = '<tr class="totals-row career-row"><td style="text-align:left;font-family:var(--font-blade);text-transform:lowercase;letter-spacing:0.06em">total</td>'+prefix+cells+'</tr>';
  } else {
    var t = {G:0,AB:0,R:0,H:0,RBI:0,dbl:0,trp:0,HR:0,BB:0};
    rows.forEach(function(r){
      t.G+=r.G||0; t.AB+=r.AB||0; t.R+=r.R||0; t.H+=r.H||0; t.RBI+=r.RBI||0;
      t.dbl+=r.dbl||0; t.trp+=r.trp||0; t.HR+=r.HR||0; t.BB+=r.BB||0;
    });
    var sg=t.H-t.dbl-t.trp-t.HR;
    var ba=t.AB>0?t.H/t.AB:null;
    var obp=(t.AB+t.BB)>0?(t.H+t.BB)/(t.AB+t.BB):null;
    var slg=t.AB>0?(sg+2*t.dbl+3*t.trp+4*t.HR)/t.AB:null;
    var ops=(obp!=null&&slg!=null)?obp+slg:null;
    var cells;
    if (isGameMode) {
      // game-player/game-team batting: PA | AB | R | H | RBI | 2B | 3B | HR | BB | BA | OBP | RV  (no G, no SLG/OPS)
      cells = '<td>'+(t.AB+t.BB)+'</td><td>'+t.AB+'</td><td>'+t.R+'</td>'+
        '<td>'+t.H+'</td><td>'+t.RBI+'</td>'+
        '<td>'+t.dbl+'</td><td>'+t.trp+'</td>'+
        '<td>'+t.HR+'</td><td>'+t.BB+'</td>'+
        '<td>'+fmtBA(ba)+'</td><td>'+fmtBA(obp)+'</td>'+
        '<td>'+fmtRV(calcRV(t))+'</td>';
    } else {
      // season/career batting: (opt season blank) | G | PA | AB | R | H | RBI | 2B | 3B | HR | BB | BA | OBP | SLG | OPS | RV (+ pos cols for player)
      cells = (!isTeamMode && showSeasonCol ? '<td></td>' : '')+
        '<td>'+t.G+'</td><td>'+(t.AB+t.BB)+'</td><td>'+t.AB+'</td><td>'+t.R+'</td>'+
        '<td>'+t.H+'</td><td>'+t.RBI+'</td>'+
        '<td>'+t.dbl+'</td><td>'+t.trp+'</td>'+
        '<td>'+t.HR+'</td><td>'+t.BB+'</td>'+
        '<td>'+fmtBA(ba)+'</td><td>'+fmtBA(obp)+'</td>'+
        '<td>'+fmtBA(slg)+'</td><td>'+fmtBA(ops)+'</td>'+
        '<td>'+fmtRV(calcRV(t))+'</td>'+
        (!isTeamMode ? POS_COLS.map(function(){return '<td></td>';}).join('') : '');
    }
    // game-player: "Total | (blank Date) | (blank Opp) | ...stats..."
    // game-team:   "Total | (blank Opponent) | ...stats..."
    var prefix = (gameMode === 'player') ? '<td></td><td></td>' : (gameMode === 'team' ? '<td></td>' : '');
    totalsHTML = '<tr class="totals-row career-row"><td style="text-align:left;font-family:var(--font-blade);text-transform:lowercase;letter-spacing:0.06em">total</td>'+prefix+cells+'</tr>';
  }

  // Store for tbody prepend (renderStatsRows will insert after populating tbody)
  window._statsTotalsHTML = totalsHTML;
}

function renderStatsRows() {
  // Reset scroll hint and position on new render
  var wrap = document.getElementById('stats-table-wrap');
  if (wrap) { wrap.scrollLeft = 0; wrap.classList.add('scroll-hint'); }
  var rows = window._statsRows || [];
  var showSeasonCol = window._statsShowSeason;
  var isPitching = window._statsPitching;
  var gameMode = window._statsGameMode; // 'player', 'team', or undefined
  var tbody = document.getElementById('season-tbody');

  renderStatsTotalsRow(rows);
  var totalsHTML = window._statsTotalsHTML || '';
  tbody.innerHTML = rows.slice(0,200).map(function(r){
    var cells = '';
    if (gameMode === 'team') {
      // Team game row: date, opp, then stats (batting or pitching)
      var dateTd = r.season_sort!=null&&r.game_num!=null
        ? '<td style="text-align:left;white-space:nowrap"><a style="cursor:pointer;color:inherit;text-decoration:underline;text-decoration-color:var(--sky)" onclick="window._glTargetGame={season_sort:'+r.season_sort+',game_num:\''+r.game_num+'\'};navigate(\'gamelogs\')">'+r.date+'</a></td>'
        : '<td style="text-align:left;white-space:nowrap">'+r.date+'</td>';
      if (isPitching) {
        return '<tr>'+
          dateTd+
          '<td style="text-align:left">'+r.opponent+'</td>'+
          '<td>'+fmtStat(r.pit_IP,1)+'</td><td>'+fmtStat(r.pit_RA)+'</td>'+
          '<td>'+fmtStat(r.pit_W)+'-'+fmtStat(r.pit_L)+'</td>'+
          '<td>'+(r.RIP!=null?Number(r.RIP).toFixed(2):'&mdash;')+'</td>'+
        '</tr>';
      }
      return '<tr>'+
        dateTd+
        '<td style="text-align:left">'+r.opponent+'</td>'+
        '<td>'+fmtStat(r.PA)+'</td>'+
        '<td>'+fmtStat(r.AB)+'</td><td>'+fmtStat(r.R)+'</td><td>'+fmtStat(r.H)+'</td>'+
        '<td>'+fmtStat(r.RBI)+'</td><td>'+fmtCount(r.dbl)+'</td><td>'+fmtCount(r.trp)+'</td>'+
        '<td>'+fmtCount(r.HR)+'</td><td>'+fmtCount(r.BB)+'</td>'+
        '<td>'+fmtBA(r.BA)+'</td><td>'+fmtBA(r.OBP)+'</td>'+
        '<td>'+fmtRV(r.RV)+'</td>'+
      '</tr>';
    } else if (gameMode === 'player') {
      // Player game row: player, date, opp, stats (batting or pitching)
      var pdateTd = r.season_sort!=null&&r.game_num!=null
        ? '<td style="text-align:left;white-space:nowrap"><a style="cursor:pointer;color:inherit;text-decoration:underline;text-decoration-color:var(--sky)" onclick="window._glTargetGame={season_sort:'+r.season_sort+',game_num:\''+r.game_num+'\'};navigate(\'gamelogs\')">'+r.date+'</a></td>'
        : '<td style="text-align:left;white-space:nowrap">'+r.date+'</td>';
      if (isPitching) {
        return '<tr>'+
          '<td style="text-align:left"><a onclick="navigate(\'profile\',\''+r.pid+'\')">'+nameWithFace(r.pid)+'</a></td>'+
          pdateTd+
          '<td style="text-align:left">'+r.opponent+'</td>'+
          '<td>'+fmtStat(r.pit_IP,1)+'</td><td>'+fmtStat(r.pit_RA)+'</td>'+
          '<td>'+fmtStat(r.pit_W)+'-'+fmtStat(r.pit_L)+'</td>'+
          '<td>'+(r.RIP!=null?Number(r.RIP).toFixed(2):'&mdash;')+'</td>'+
        '</tr>';
      }
      return '<tr>'+
        '<td style="text-align:left"><a onclick="navigate(\'profile\',\''+r.pid+'\')">'+nameWithFace(r.pid)+'</a></td>'+
        pdateTd+
        '<td style="text-align:left">'+r.opponent+'</td>'+
        '<td>'+(r.PA!=null?r.PA:'&mdash;')+'</td>'+
        '<td>'+fmtStat(r.AB)+'</td><td>'+fmtStat(r.R)+'</td><td>'+fmtStat(r.H)+'</td>'+
        '<td>'+fmtStat(r.RBI)+'</td><td>'+fmtCount(r.dbl)+'</td><td>'+fmtCount(r.trp)+'</td>'+
        '<td>'+fmtCount(r.HR)+'</td><td>'+fmtCount(r.BB)+'</td>'+
        '<td>'+fmtBA(r.BA)+'</td><td>'+fmtBA(r.OBP)+'</td>'+
        '<td>'+fmtRV(r.RV)+'</td>'+
      '</tr>';
    } else if (gameMode === 'season-team' || gameMode === 'career-team') {
      // Team season/career row: first col is always season label
      var label = r.seasonStr || 'All-Time';
      var labelCell = r.season_sort!=null
        ? '<td style="text-align:left"><a style="cursor:pointer;color:inherit;text-decoration:underline;text-decoration-color:var(--sky)" onclick="goToSeasonStats('+r.season_sort+')">'+label+'</a></td>'
        : '<td style="text-align:left">'+label+'</td>';
      if (isPitching) {
        cells = labelCell+
          '<td>'+fmtStat(r.pit_G)+'</td>'+
          '<td>'+fmtStat(r.pit_IP,1)+'</td><td>'+fmtStat(r.pit_RA)+'</td>'+
          '<td>'+fmtStat(r.pit_W)+'-'+fmtStat(r.pit_L)+'</td>'+
          '<td>'+(r.RIP!=null?Number(r.RIP).toFixed(2):'&mdash;')+'</td>';
      } else {
        cells = labelCell+
          '<td>'+fmtStat(r.G)+'</td><td>'+(r.PA!=null?r.PA:'&mdash;')+'</td><td>'+fmtStat(r.AB)+'</td><td>'+fmtStat(r.R)+'</td>'+
          '<td>'+fmtStat(r.H)+'</td><td>'+fmtStat(r.RBI)+'</td>'+
          '<td>'+fmtCount(r.dbl)+'</td><td>'+fmtCount(r.trp)+'</td>'+
          '<td>'+fmtCount(r.HR)+'</td><td>'+fmtCount(r.BB)+'</td>'+
          '<td>'+fmtBA(r.BA)+'</td><td>'+fmtBA(r.OBP)+'</td>'+
          '<td>'+fmtBA(r.SLG)+'</td><td>'+fmtBA(r.OPS)+'</td>'+
          '<td>'+fmtRV(r.RV)+'</td>';
      }
      return '<tr>'+cells+'</tr>';
    } else if (isPitching) {
      if (showSeasonCol) {
        var sLink = r.season_sort!=null
          ? '<a style="cursor:pointer;color:inherit;text-decoration:underline;text-decoration-color:var(--sky)" onclick="goToSeasonStats('+r.season_sort+')">'+r.seasonStr+'</a>'
          : r.seasonStr;
        cells += '<td style="text-align:left;color:var(--text-dim);font-size:0.8rem">'+sLink+'</td>';
      }
      cells += '<td>'+fmtStat(r.pit_G)+'</td><td>'+fmtStat(r.pit_GS)+'</td>'+
        '<td>'+fmtStat(r.pit_IP,1)+'</td><td>'+fmtStat(r.pit_RA)+'</td>'+
        '<td>'+fmtStat(r.pit_W)+'-'+fmtStat(r.pit_L)+'</td>'+
        '<td>'+(r.RIP!=null?Number(r.RIP).toFixed(2):'&mdash;')+'</td>';
      return '<tr>'+
        '<td style="text-align:left"><a onclick="navigate(\'profile\',\''+r.pid+'\')">'+nameWithFace(r.pid)+'</a></td>'+
        cells+'</tr>';
    } else {
      if (showSeasonCol) {
        var sLink = r.season_sort!=null
          ? '<a style="cursor:pointer;color:inherit;text-decoration:underline;text-decoration-color:var(--sky)" onclick="goToSeasonStats('+r.season_sort+')">'+r.seasonStr+'</a>'
          : r.seasonStr;
        cells += '<td style="text-align:left;color:var(--text-dim);font-size:0.8rem">'+sLink+'</td>';
      }
      cells += '<td>'+fmtStat(r.G)+'</td><td>'+(r.PA!=null?r.PA:'&mdash;')+'</td><td>'+fmtStat(r.AB)+'</td><td>'+fmtStat(r.R)+'</td>'+
        '<td>'+fmtStat(r.H)+'</td><td>'+fmtStat(r.RBI)+'</td>'+
        '<td>'+fmtCount(r.dbl)+'</td><td>'+fmtCount(r.trp)+'</td>'+
        '<td>'+fmtCount(r.HR)+'</td><td>'+fmtCount(r.BB)+'</td>'+
        '<td>'+fmtBA(r.BA)+'</td><td>'+fmtBA(r.OBP)+'</td>'+
        '<td>'+fmtBA(r.SLG)+'</td><td>'+fmtBA(r.OPS)+'</td>'+
        '<td>'+fmtRV(r.RV)+'</td>'+
        POS_COLS.map(function(k){return '<td>'+((r[k]&&r[k]>0)?r[k]:'')+'</td>';}).join('');
      return '<tr>'+
        '<td style="text-align:left"><a onclick="navigate(\'profile\',\''+r.pid+'\')">'+nameWithFace(r.pid)+'</a></td>'+
        cells+'</tr>';
    }
  }).join('');
  if (totalsHTML) {
    tbody.insertAdjacentHTML('afterbegin', totalsHTML);
    // Set sticky top offset = thead height so totals row pins just below column headers
    var thead = document.getElementById('season-thead');
    var totalsRow = tbody.querySelector('.totals-row');
    if (thead && totalsRow) {
      var topPx = thead.offsetHeight + 'px';
      Array.from(totalsRow.cells).forEach(function(td){ td.style.top = topPx; });
    }
  }
}

function sortStats(th) {
  var col = th.dataset.col;
  var tbody = document.getElementById('season-tbody');
  var asc = th.classList.contains('sort-asc');
  document.querySelectorAll('#season-thead th').forEach(function(t){t.classList.remove('sort-asc','sort-desc');});
  th.classList.add(asc ? 'sort-desc' : 'sort-asc');
  var rows = (window._statsRows||[]).slice();
  rows.sort(function(a,b){
    var av=a[col],bv=b[col];
    if(av==null&&bv==null) return 0;
    if(av==null) return 1; if(bv==null) return -1;
    if(typeof av==='string'||typeof bv==='string')
      return asc ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    return asc ? av-bv : bv-av;
  });
  window._statsRows = rows;
  renderStatsRows();
}

// Sort the season-by-season table on a player profile page
function sortPlayerStats(th) {
  var col = th.dataset.col;
  var tbody = document.getElementById('player-stat-tbody');
  if (!tbody) return;
  var asc = th.classList.contains('sort-asc');
  document.querySelectorAll('#player-stat-thead th').forEach(function(t){t.classList.remove('sort-asc','sort-desc');});
  th.classList.add(asc ? 'sort-desc' : 'sort-asc');
  var rows = (window._playerStatRows || []).slice();
  rows.sort(function(a,b){
    var av = col==='PA'?(a.AB||0)+(a.BB||0) : col==='RV'?calcRV(a) : a[col];
    var bv = col==='PA'?(b.AB||0)+(b.BB||0) : col==='RV'?calcRV(b) : b[col];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return asc ? av - bv : bv - av;
  });
  window._playerStatRows = rows;
  // Career row stays pinned at top; re-render season rows below it
  var careerHTML = window._playerCareerRow ? window._playerCareerRow() : '';
  tbody.innerHTML = careerHTML + rows.map(window._playerStatRowFn).join('');
}

// Sort individual player game log by date
function sortProfileLog(th, col) {
  var table = th.closest('table');
  if (!table) return;
  var tbody = table.querySelector('tbody');
  if (!tbody) return;
  // First row is the season totals (career-row) -- keep it pinned
  var rows = Array.from(tbody.querySelectorAll('tr'));
  if (rows.length < 2) return;
  var pinned = rows[0]; // totals row always first
  var dataRows = rows.slice(1);
  var asc = th.classList.contains('sort-asc');
  // Clear sort classes from all ths in this thead
  Array.from(table.querySelectorAll('thead th')).forEach(function(t){t.classList.remove('sort-asc','sort-desc');});
  th.classList.add(asc ? 'sort-desc' : 'sort-asc');
  dataRows.sort(function(a, b) {
    var aCell = a.querySelector('td');
    var bCell = b.querySelector('td');
    // Date is in the first cell (a link); grab text content
    var av = aCell ? aCell.textContent.trim() : '';
    var bv = bCell ? bCell.textContent.trim() : '';
    if (av < bv) return asc ? 1 : -1;
    if (av > bv) return asc ? -1 : 1;
    return 0;
  });
  // Re-insert: totals row first, then sorted data rows
  tbody.innerHTML = '';
  tbody.appendChild(pinned);
  dataRows.forEach(function(r){ tbody.appendChild(r); });
}

// Stub for old calls
function renderSeasonStats() { renderStats(); }
function renderStatsLeaderboard() { renderStats(); }


// ── GAME LOGS ─────────────────────────────────────────────────────────────
function showGameLogs() {
  document.getElementById('page-gamelogs').classList.add('active');

  // Build a box-score lookup: key = season_sort + '|' + game_num
  // Using season_sort instead of date handles rescheduled games correctly
  var boxMap = {};
  DATA.logs.forEach(function(l) {
    if (l.season_sort == null || l.game_num == null) return;
    var key = l.season_sort + '|' + (l.game_num != null ? l.game_num : '');
    if (!boxMap[key]) boxMap[key] = [];
    boxMap[key].push(l);
  });
  window._glBoxMap = boxMap;

  // Collect unique years from schedules for filter buttons
  var years = Array.from(new Set(DATA.schedules.map(function(r){ return Math.floor(r.season_sort); })))
    .sort(function(a,b){return b-a;});
  window._glYearFilter = 'all';

  // Build filter: dropdown on mobile, buttons on desktop
  var isMobile = window.innerWidth < 640;
  var filterHTML;
  if (isMobile) {
    filterHTML = '<select class="gl-year-select" onchange="glSetYear(this.value===\'all\'?\'all\':parseInt(this.value),null)">' +
      '<option value="all">All Years</option>';
    years.forEach(function(y) { filterHTML += '<option value="'+y+'">'+y+'</option>'; });
    filterHTML += '</select>';
  } else {
    filterHTML = '<button class="gl-filter-btn active" onclick="glSetYear(\'all\',this)">All</button>';
    years.forEach(function(y) {
      filterHTML += '<button class="gl-filter-btn" onclick="glSetYear('+y+',this)">'+y+'</button>';
    });
  }
  document.getElementById('gl-filter-row').innerHTML = filterHTML;

  renderGameList();
}

function glSetYear(yr, btn) {
  window._glYearFilter = yr;
  document.querySelectorAll('.gl-filter-btn').forEach(function(b){ b.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  renderGameList();
}

function renderGameList() {
  var yr = window._glYearFilter || 'all';
  var boxMap = window._glBoxMap || {};

  // Filter schedules by year
  var games = DATA.schedules.filter(function(r) {
    return yr === 'all' || Math.floor(r.season_sort) === parseInt(yr);
  });

  if (!games.length) {
    document.getElementById('game-list').innerHTML = '<div class="empty-state">No games found</div>';
    return;
  }

  // Group by season_sort
  var seasons = [];
  var seasonMap = {};
  games.forEach(function(r) {
    var k = r.season_sort;
    if (!seasonMap[k]) { seasonMap[k] = []; seasons.push(k); }
    seasonMap[k].push(r);
  });
  // seasons already sorted newest-first from schedules.json sort order; dedupe
  seasons = Array.from(new Set(seasons)).sort(function(a,b){return b-a;});

  var html = '';
  seasons.forEach(function(ss) {
    var rows = seasonMap[ss].slice().sort(function(a,b){ return (a.game_num||0)-(b.game_num||0); });
    var label = rows[0].season_label || seasonLabel(ss);
    var wins = rows.filter(function(r){return r.wl==='W';}).length;
    var losses = rows.filter(function(r){return r.wl==='L';}).length;
    var record = wins + '-' + losses;

    html += '<div class="gl-season-block">';
    html += '<div class="gl-season-label">' + label.toLowerCase() +
            ' <span class="gl-season-record">' + record + '</span></div>';

    rows.forEach(function(r) {
      // Schedule rows don't have season_sort; derive it from the date
      var rSeasonSort = r.season_sort;
      if (rSeasonSort == null && r.date) {
        var dp = r.date.split('-');
        var yr = parseInt(dp[0],10), mo = parseInt(dp[1],10);
        rSeasonSort = yr + (mo <= 6 ? 0.1 : 0.2);
      }
      var boxKey = rSeasonSort + '|' + r.game_num;
      var boxRows = boxMap[boxKey] || [];
      var hasBox = boxRows.length > 0;

      var scoreColor = r.wl === 'W' ? 'var(--win,#4ade80)' :
                       r.wl === 'L' ? 'var(--loss,#f87171)' : 'var(--text-muted)';
      var scoreStr = (r.rs !== null && r.ra !== null) ? r.rs + '-' + r.ra :
                     r.forfeit ? (r.wl === 'W' ? 'FFW' : 'FFL') : '';
      var haClass = r.home_away === 'H' ? 'gl-ha-badge home' : 'gl-ha-badge';

      html += '<div class="gl-game-row' + (hasBox ? '' : ' no-box') + '"' +
              (hasBox ? ' onclick="glToggleBox(this)"' : '') + '>'+
        '<span class="gl-game-num">' + (r.game_num || '') + '</span>'+
        '<span class="gl-game-date">' + (r.date || '') + '</span>'+
        '<span class="' + haClass + '">' + (r.home_away || '') + '</span>'+
        '<span class="gl-opponent">' + (r.opponent || '') + '</span>'+
        '<span class="gl-score" style="color:' + scoreColor + '">' + scoreStr + '</span>'+
        (r.wl ? '<span class="gl-wl-badge ' + r.wl + '">' + r.wl + '</span>' : '<span></span>')+
        '<span class="gl-expand-arrow">&#9660;</span>'+
      '</div>';

      // Box panel (always emitted; hidden by default)
      html += '<div class="gl-box-panel">';
      if (hasBox) {
        var sorted = boxRows.slice().sort(function(a,b){
          var ao = a.batting_order != null ? a.batting_order : 1000 + boxRows.indexOf(a);
          var bo = b.batting_order != null ? b.batting_order : 1000 + boxRows.indexOf(b);
          return ao - bo;
        });
        html += glBuildBoxTable(sorted);
      } else {
        html += '<div class="gl-no-box-msg">Box score not available for this game.</div>';
      }
      html += '</div>';
    });

    html += '</div>'; // season-block
  });

  document.getElementById('game-list').innerHTML = html ||
    '<div class="empty-state">No games found</div>';

  // If navigated here from a player game log date link, scroll to and highlight that game
  if (window._glTargetGame) {
    var tg = window._glTargetGame;
    window._glTargetGame = null;
    // Filter to the target year so game_num is unambiguous
    var targetYear = Math.floor(tg.season_sort);
    window._glYearFilter = targetYear;
    // Update filter button UI
    document.querySelectorAll('.gl-filter-btn').forEach(function(b){ b.classList.remove('active'); });
    var matchBtn = Array.from(document.querySelectorAll('.gl-filter-btn')).find(function(b){
      return b.textContent.trim() === String(targetYear);
    });
    if (matchBtn) matchBtn.classList.add('active');
    var sel = document.querySelector('.gl-year-select');
    if (sel) sel.value = String(targetYear);
    renderGameList();
    // After re-render, scroll to the target game
    setTimeout(function() {
      var allRows = document.querySelectorAll('.gl-game-row');
      for (var i = 0; i < allRows.length; i++) {
        var row = allRows[i];
        var numEl = row.querySelector('.gl-game-num');
        if (!numEl) continue;
        var gn = numEl.textContent.trim();
        if (String(gn) === String(tg.game_num)) {
          if (!row.classList.contains('no-box')) {
            glToggleBox(row);
          }
          row.scrollIntoView({behavior:'smooth', block:'center'});
          row.style.transition = 'background 0.3s';
          row.style.background = 'rgba(56,189,248,0.15)';
          setTimeout(function(r){return function(){r.style.background='';}}(row), 2000);
          break;
        }
      }
    }, 150);
  }
}

function glToggleBox(rowEl) {
  // Close any other open row
  var currentOpen = document.querySelector('.gl-game-row.expanded');
  if (currentOpen && currentOpen !== rowEl) {
    currentOpen.classList.remove('expanded');
    var prev = currentOpen.nextElementSibling;
    if (prev && prev.classList.contains('gl-box-panel')) prev.classList.remove('open');
  }
  // Toggle this row
  var panel = rowEl.nextElementSibling;
  var wasOpen = rowEl.classList.contains('expanded');
  rowEl.classList.toggle('expanded', !wasOpen);
  if (panel && panel.classList.contains('gl-box-panel')) panel.classList.toggle('open', !wasOpen);
}

function glBuildBoxTable(rows) {
  // Determine who the squid(s) are: top RV per gender (computed from raw stats)
  var mBest = null, fBest = null;
  rows.forEach(function(r) {
    var p = getPlayer(r.player_id);
    var rv = calcRV(r);
    if (rv === null) return;
    if (!p) return;
    if (p.gender === 'M' && (mBest === null || rv > mBest.rv)) mBest = {id: r.player_id, rv: rv};
    if (p.gender === 'F' && (fBest === null || rv > fBest.rv)) fBest = {id: r.player_id, rv: rv};
  });
  var squids = new Set();
  if (mBest && mBest.rv > 0) squids.add(mBest.id);
  if (fBest && fBest.rv > 0) squids.add(fBest.id);

  var html = '<table><thead><tr>'+
    '<th style="text-align:left">Player</th><th style="text-align:left">Pos</th>'+
    '<th>AB</th><th>R</th><th>H</th><th>RBI</th>'+
    '<th>2B</th><th>3B</th><th>HR</th><th>BB</th><th>RV</th>'+
    '</tr></thead><tbody>';

  rows.forEach(function(r) {
    // Derive position from pos_* fields (same as primaryPos helper)
    var pos = primaryPos(r);
    var rv = calcRV(r);
    var rvStr = rv !== null ? (rv >= 0 ? '+' : '') + rv.toFixed(1) : '';
    var isSquid = squids.has(r.player_id);
    var nameCell = '<td style="text-align:left"><a onclick="navigate(\'profile\',\''+r.player_id+'\')">'+nameWithFace(r.player_id)+'</a>'+(isSquid?' &#129425;':'')+'</td>';
    var rvCell = isSquid ? '<td class="gl-squid">'+rvStr+'</td>' : '<td>'+rvStr+'</td>';
    html += '<tr>'+
      nameCell+
      '<td style="text-align:left;color:var(--sky-light);font-weight:600">' + pos + '</td>'+
      '<td>' + fmtBox(r.AB) + '</td>'+
      '<td>' + fmtBox(r.R) + '</td>'+
      '<td>' + fmtBox(r.H) + '</td>'+
      '<td>' + fmtBox(r.RBI) + '</td>'+
      '<td>' + fmtBox(r.dbl) + '</td>'+
      '<td>' + fmtBox(r.trp) + '</td>'+
      '<td>' + fmtBox(r.HR) + '</td>'+
      '<td>' + fmtBox(r.BB) + '</td>'+
      rvCell +
    '</tr>';
  });

  html += '</tbody></table>';
  return html;
}

// ── RECORDS ───────────────────────────────────────────────────────────────
function showRecords() {
  document.getElementById('page-records').classList.add('active');
  renderSeasonHistory();
  renderCareerLeaderboards();
}

function renderCareerLeaderboards() {
  var tots=computeAllCareerTotals();
  var entries=Object.entries(tots);
  var qual=entries.filter(function(e){return e[1].AB>=50;});
  var mIds=new Set(DATA.players.filter(function(p){return p.gender==='M';}).map(function(p){return p.id;}));
  var fIds=new Set(DATA.players.filter(function(p){return p.gender==='F';}).map(function(p){return p.id;}));

  function lrows(sorted,vfn){
    return sorted.slice(0,10).map(function(e,i){
      return '<tr>'+
        '<td style="text-align:left;color:var(--text-muted);width:1.5rem">'+(i+1)+'</td>'+
        '<td style="text-align:left"><a onclick="navigate(\'profile\',\''+e[0]+'\')">'+nameWithFace(e[0])+'</a></td>'+
        '<td>'+vfn(e[1])+'</td></tr>';
    }).join('');
  }
  function splitCard(title,sorted,vfn){
    var mRows=sorted.filter(function(e){return mIds.has(e[0]);});
    var fRows=sorted.filter(function(e){return fIds.has(e[0]);});
    return '<div style="margin-bottom:1.25rem">'+
      '<div class="section-title">'+title+'</div>'+
      '<div class="split-tables">'+
        '<div><div class="split-label split-label-m">Men</div>'+
          '<div class="table-wrap"><table><tbody>'+lrows(mRows,vfn)+'</tbody></table></div></div>'+
        '<div><div class="split-label split-label-f">Women</div>'+
          '<div class="table-wrap"><table><tbody>'+lrows(fRows,vfn)+'</tbody></table></div></div>'+
      '</div></div>';
  }

  var byG  =entries.slice().sort(function(a,b){return b[1].G-a[1].G;});
  var byH  =entries.slice().sort(function(a,b){return b[1].H-a[1].H;});
  var byRBI=entries.slice().sort(function(a,b){return b[1].RBI-a[1].RBI;});
  var byHR =entries.slice().sort(function(a,b){return b[1].HR-a[1].HR;});
  var byBA =qual.slice().sort(function(a,b){return (b[1].H/b[1].AB)-(a[1].H/a[1].AB);});
  var byRV =entries.slice().sort(function(a,b){return b[1].RV-a[1].RV;});
  var byW  =entries.slice().sort(function(a,b){return b[1].pit_W-a[1].pit_W;});

  document.getElementById('records-static').innerHTML=
    splitCard('Career Games Played',byG,function(t){return t.G;})+
    splitCard('Career Hits',byH,function(t){return t.H;})+
    splitCard('Career RBI',byRBI,function(t){return t.RBI;})+
    splitCard('Career Home Runs',byHR,function(t){return t.HR;})+
    splitCard('Career BA (min 50 AB)',byBA,function(t){return fmtBA(t.H/t.AB);})+
    splitCard('Career RV',byRV,function(t){return fmtRV(t.RV);})+
    splitCard('Career Pitching Wins',byW,function(t){return t.pit_W;});
}

function renderCustomLeaderboard() {
  var season=document.getElementById('lb-season').value;
  var gender=document.getElementById('lb-gender').value;
  var minAB=parseInt(document.getElementById('lb-minab').value)||0;
  var scope=document.getElementById('lb-scope').value;
  function gok(id){if(gender==='all')return true;var p=getPlayer(id);return p&&p.gender===gender;}

  var rows=[];
  if(scope==='season'){
    rows=DATA.stats.filter(function(s){
      if(season!=='all'&&String(s.season_sort)!==season) return false;
      if(!gok(s.player_id)) return false;
      if(minAB>0&&(s.AB||0)<minAB) return false;
      if((s.G||0)===0) return false;
      return true;
    }).map(function(s){
      return {name:displayName(s.player_id),pid:s.player_id,season:s.season_label,
        G:s.G||0,AB:s.AB||0,R:s.R||0,H:s.H||0,RBI:s.RBI||0,
        dbl:s.dbl||0,trp:s.trp||0,HR:s.HR||0,BB:s.BB||0,
        BA:s.BA,OBP:s.OBP,SLG:s.SLG,OPS:s.OPS,
        RV:calcRV(s),pit_W:s.pit_W||0,pit_IP:s.pit_IP||0,
        RIP:s.pit_IP>0?s.pit_RA/s.pit_IP:null};
    });
  } else {
    var tots={};
    DATA.stats.forEach(function(s){
      if(!gok(s.player_id)) return;
      if(season!=='all'&&String(s.season_sort)!==season) return;
      if(!tots[s.player_id]) tots[s.player_id]={G:0,AB:0,H:0,HR:0,RBI:0,R:0,dbl:0,trp:0,BB:0,pit_W:0,pit_IP:0,pit_RA:0};
      var t=tots[s.player_id];
      t.G+=s.G||0;t.AB+=s.AB||0;t.H+=s.H||0;t.HR+=s.HR||0;t.RBI+=s.RBI||0;
      t.R+=s.R||0;t.dbl+=s.dbl||0;t.trp+=s.trp||0;t.BB+=s.BB||0;
      t.pit_W+=s.pit_W||0;t.pit_IP+=s.pit_IP||0;t.pit_RA+=s.pit_RA||0;
    });
    rows=Object.entries(tots).filter(function(e){return (minAB===0||e[1].AB>=minAB)&&e[1].G>0;})
      .map(function(e){
        var id=e[0],t=e[1];
        var sg=t.H-t.dbl-t.trp-t.HR;
        var ba=t.AB>0?t.H/t.AB:null;
        var obp=(t.AB+t.BB)>0?(t.H+t.BB)/(t.AB+t.BB):null;
        var slg=t.AB>0?(sg+2*t.dbl+3*t.trp+4*t.HR)/t.AB:null;
        return {name:displayName(id),pid:id,season:'Career',
          G:t.G,AB:t.AB,R:t.R,H:t.H,RBI:t.RBI,dbl:t.dbl,trp:t.trp,HR:t.HR,BB:t.BB,
          BA:ba,OBP:obp,SLG:slg,OPS:(obp!=null&&slg!=null)?obp+slg:null,
          RV:calcRV(t),pit_W:t.pit_W,pit_IP:t.pit_IP,
          RIP:t.pit_IP>0?t.pit_RA/t.pit_IP:null};
      });
  }

  rows.sort(function(a,b){return (b.G||0)-(a.G||0);});
  window._lbRows=rows;window._lbSortCol='G';window._lbSortAsc=false;
  renderLbTable();
}

function renderLbTable() {
  var rows=window._lbRows||[];
  var sortCol=window._lbSortCol||'G';
  var asc=window._lbSortAsc;
  var showSeason=document.getElementById('lb-scope').value==='season'&&document.getElementById('lb-season').value==='all';
  var sorted=rows.slice().sort(function(a,b){
    var av=a[sortCol],bv=b[sortCol];
    if(av==null&&bv==null) return 0;
    if(av==null) return 1;if(bv==null) return -1;
    if(typeof av==='string') return asc?av.localeCompare(bv):bv.localeCompare(av);
    return asc?av-bv:bv-av;
  });
  var cols=[{k:'name',label:'Player',fmt:function(v){return v;},left:true,text:true}];
  if(showSeason) cols.push({k:'season',label:'Season',fmt:function(v){return v;},left:true,text:true});
  cols=cols.concat([
    {k:'G',label:'G',fmt:function(v){return v==null?'&mdash;':v;}},
    {k:'AB',label:'AB',fmt:function(v){return v==null?'&mdash;':v;}},
    {k:'R',label:'R',fmt:function(v){return v==null?'&mdash;':v;}},
    {k:'H',label:'H',fmt:function(v){return v==null?'&mdash;':v;}},
    {k:'RBI',label:'RBI',fmt:function(v){return v==null?'&mdash;':v;}},
    {k:'dbl',label:'2B',fmt:function(v){return v==null?'0':v;}},
    {k:'trp',label:'3B',fmt:function(v){return v==null?'0':v;}},
    {k:'HR',label:'HR',fmt:function(v){return v==null?'0':v;}},
    {k:'BB',label:'BB',fmt:function(v){return v==null?'0':v;}},
    {k:'BA',label:'BA',fmt:fmtBA},
    {k:'OBP',label:'OBP',fmt:fmtBA},
    {k:'SLG',label:'SLG',fmt:fmtBA},
    {k:'OPS',label:'OPS',fmt:fmtBA},
    {k:'RV',label:'RV',fmt:function(v){return fmtRV(v);}},
    {k:'pit_W',label:'W',fmt:function(v){return v==null?'&mdash;':v;}},
    {k:'pit_IP',label:'IP',fmt:function(v){return v!=null?Number(v).toFixed(1):'&mdash;';}},
    {k:'RIP',label:'RIP',fmt:function(v){return v!=null?Number(v).toFixed(2):'&mdash;';}},
  ]);
  var thCells=cols.map(function(c){
    var active=sortCol===c.k;
    var style=(c.left?'text-align:left;':'')+(active?'color:var(--gold)':'');
    var arrow=active?(asc?' &#9650;':' &#9660;'):'';
    return '<th onclick="lbSort(\''+c.k+'\')" style="'+style+'">'+c.label+arrow+'</th>';
  }).join('');
  var tbRows=sorted.slice(0,50).map(function(r){
    var tds=cols.map(function(c){
      var style=c.left?'text-align:left':'';
      var extra=c.k==='name'?' onclick="navigate(\'profile\',\''+r.pid+'\')" style="'+style+';cursor:pointer"':' style="'+style+'"';
      var cellVal = c.k==='name' ? nameWithFace(r.pid) : c.fmt(r[c.k]);
      return '<td'+extra+'>'+(c.k==='name'?nameWithFace(r.pid):c.fmt(r[c.k]))+'</td>';
    }).join('');
    return '<tr>'+tds+'</tr>';
  }).join('');
  document.getElementById('lb-results').innerHTML=
    '<div class="table-wrap"><table><thead><tr>'+thCells+'</tr></thead><tbody>'+tbRows+'</tbody></table></div>';
}

function lbSort(key){
  if(window._lbSortCol===key) window._lbSortAsc=!window._lbSortAsc;
  else{window._lbSortCol=key;window._lbSortAsc=false;}
  renderLbTable();
}

// ── SCHEDULE ──────────────────────────────────────────────────────────────
function showSchedule(){
  document.getElementById('page-schedule').classList.add('active');
  var sl=document.getElementById('schedule-season-label');
  if(sl) sl.textContent=LIVE_LABEL;
  var tbody=document.getElementById('schedule-tbody');
  tbody.innerHTML='<tr><td colspan="10" style="text-align:center;color:var(--text-muted);padding:2rem">Loading...</td></tr>';
  fetch(SCHEDULE_URL).then(function(r){return r.text();}).then(function(text){
    var lines=text.trim().replace(/\r/g,'').split('\n');
    var headers=dedupeHeaders(parseLine(lines[0]));
    var rows=lines.slice(1).map(function(line){
      var vals=parseLine(line),obj={};
      headers.forEach(function(h,i){obj[h]=vals[i]||'';});
      return obj;
    }).filter(function(r){return Object.values(r).some(function(v){return v!=='';});});
    window._scheduleRows=rows;
    if(!rows.length){tbody.innerHTML='<tr><td colspan="10" style="text-align:center;color:var(--text-muted);padding:2rem">No games yet</td></tr>';return;}
    var w=0,l=0;
    tbody.innerHTML=rows.map(function(r){
      var result=(r['W/L']||'').trim().toUpperCase();
      if(result==='W') w++;else if(result==='L') l++;
      var hasResult=result==='W'||result==='L';
      var color=result==='W'?'var(--green)':result==='L'?'var(--red)':'var(--text)';
      var rec=hasResult?(w+'-'+l):'';
      return '<tr>'+
        '<td style="text-align:left">'+(r['G#']||'')+'</td>'+
        '<td style="text-align:left">'+(r['Day']||'')+'</td>'+
        '<td style="text-align:left;white-space:nowrap">'+(r['Date']||'')+'</td>'+
        '<td>'+fmtTime(r['Time']||'')+'</td>'+
        '<td>'+(r['H/A']||'')+'</td>'+
        '<td style="text-align:left">'+(r['Opponent']||'')+'</td>'+
        '<td style="color:'+color+';font-weight:600">'+result+'</td>'+
        '<td>'+(r['RS']||'')+'</td><td>'+(r['RA']||'')+'</td>'+
        '<td style="text-align:left">'+(r['Rec']||rec)+'</td></tr>';
    }).join('');
  }).catch(function(){
    tbody.innerHTML='<tr><td colspan="10" style="text-align:center;color:var(--red);padding:2rem">Failed to load schedule</td></tr>';
  });
  setTimeout(updateScheduleHint, 400);
}

// ── STANDINGS ─────────────────────────────────────────────────────────────
function showStandings(){
  document.getElementById('page-standings').classList.add('active');
  var sl=document.getElementById('standings-season-label');
  if(sl) sl.textContent=LIVE_LABEL;
  var tbody=document.getElementById('standings-tbody');
  tbody.innerHTML='<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:2rem">Loading...</td></tr>';
  fetch(STANDINGS_URL).then(function(r){return r.text();}).then(function(text){
    var lines=text.trim().replace(/\r/g,'').split('\n');
    var headers=dedupeHeaders(parseLine(lines[0]));
    var rows=lines.slice(1).map(function(line){
      var vals=parseLine(line),obj={};
      headers.forEach(function(h,i){obj[h]=vals[i]||'';});
      return obj;
    }).filter(function(r){return Object.values(r).some(function(v){return v!=='';});});
    if(!rows.length){tbody.innerHTML='<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:2rem">No standings data yet</td></tr>';return;}
    var keys=Object.keys(rows[0]);
    var teamKey=keys.find(function(k){return /team/i.test(k);})||keys[0];
    var wKey=keys.find(function(k){return /^w$/i.test(k.trim());})||keys[1];
    var lKey=keys.find(function(k){return /^l$/i.test(k.trim());})||keys[2];
    var pctKey=keys.find(function(k){return /win|pct|%/i.test(k);})||keys[3];
    rows.sort(function(a,b){return Number(b[pctKey]||0)-Number(a[pctKey]||0);});
    tbody.innerHTML=rows.map(function(r){
      var team=r[teamKey]||'';
      var pct=r[pctKey]?Number(r[pctKey]).toFixed(3).replace(/^0\./,'.'):'' ;
      var isUs=/squid/i.test(team);
      return '<tr'+(isUs?' style="background:var(--surface-raised);border-left:3px solid var(--sky)"':'')+'>'+
        '<td style="text-align:left;font-weight:'+(isUs?'700':'400')+';color:'+(isUs?'var(--sky)':'var(--text)')+'">'+team+'</td>'+
        '<td style="width:2.5rem">'+(r[wKey]||'')+'</td>'+
        '<td style="width:2.5rem">'+(r[lKey]||'')+'</td>'+
        '<td style="width:3.5rem">'+pct+'</td></tr>';
    }).join('');
  }).catch(function(){
    tbody.innerHTML='<tr><td colspan="4" style="text-align:center;color:var(--red);padding:2rem">Failed to load standings</td></tr>';
  });
}


// ── SCROLL HINT ───────────────────────────────────────────────────────────
function updateScheduleHint() {
  var el = document.getElementById('schedule-wrap');
  if (!el) return;
  var overflows = el.scrollWidth > el.clientWidth + 4;
  if (overflows) {
    el.classList.add('has-overflow');
    if (el.scrollLeft > 20) el.classList.add('no-hint');
    else el.classList.remove('no-hint');
  } else {
    el.classList.remove('has-overflow');
    el.classList.remove('no-hint');
  }
}

document.addEventListener('scroll', function(e) {
  var el = e.target;
  if (el && el.id === 'schedule-wrap') {
    updateScheduleHint();
  }
  if (el && el.classList && el.classList.contains('table-wrap')) {
    if (el.scrollLeft > 20) el.classList.add('scrolled-right');
    else el.classList.remove('scrolled-right');
  }
}, true);

// Schedule hint updated inside showSchedule directly

// ── LINEUP VIEW ───────────────────────────────────────────────────────────
var _lineupActive = false;

function toggleLineup() {
  _lineupActive = !_lineupActive;
  var btn = document.getElementById('lineup-toggle-btn');
  var view = document.getElementById('lineup-view');
  var wrap = document.getElementById('stats-table-wrap');
  var lbl  = document.getElementById('season-label');
  if (_lineupActive) {
    if (btn) { btn.textContent = '✕ Lineup'; btn.style.background = 'var(--deep-mid)'; }
    if (wrap) wrap.style.display = 'none';
    if (lbl)  lbl.style.display  = 'none';
    renderLineup();
  } else {
    if (btn) { btn.textContent = '⚾ Lineup'; btn.style.background = 'var(--sky-dim)'; }
    if (view) view.style.display = 'none';
    if (wrap) wrap.style.display = '';
    if (lbl)  lbl.style.display  = '';
  }
}

function renderLineup() {
  var seasonVal = document.getElementById('stats-season').value;
  var logs = DATA.logs || [];
  var seasonNum = seasonVal === 'all' ? null : parseFloat(seasonVal);
  var seasonLogs = seasonNum == null ? logs : logs.filter(function(l){ return l.season_sort === seasonNum; });
  var lineupSeasonLabel = seasonNum == null ? 'All Seasons' : seasonLabel(seasonNum);

  var POSITIONS = ['P','C','1B','2B','3B','SS','LF','LC','RC','RF'];
  var posKeys = {P:'pos_P',C:'pos_C','1B':'pos_1B','2B':'pos_2B','3B':'pos_3B',SS:'pos_SS',LF:'pos_LF',LC:'pos_LC',RC:'pos_RC',RF:'pos_RF'};

  var playerStats = {};
  seasonLogs.forEach(function(l) {
    var pid = l.player_id;
    if (!pid) return;
    if (!playerStats[pid]) {
      var pl = getPlayer(pid);
      playerStats[pid] = {pos:{}, totalG:0, totalPA:0, name: (pl && pl.display_name) || pid};
    }
    var ps = playerStats[pid];
    POSITIONS.forEach(function(pos) {
      var v = Number(l[posKeys[pos]])||0;
      if (v > 0) ps.pos[pos] = (ps.pos[pos]||0) + v;
    });
    ps.totalG++;
    ps.totalPA += (Number(l.AB||0) + Number(l.BB||0));
  });

  // Assign starters greedily: each player can only occupy ONE position.
  // Sort positions by most-games-played-at-that-position descending so the
  // "strongest" assignments happen first.
  var assigned = new Set();
  var starters = {};

  // Build a flat list of [pos, pid, gamesAtPos] for every (pos, player) pair
  var allCandidates = [];
  POSITIONS.forEach(function(pos) {
    Object.keys(playerStats).forEach(function(pid) {
      var g = playerStats[pid].pos[pos]||0;
      if (g > 0) allCandidates.push({pos:pos, pid:pid, gAtPos:g});
    });
  });
  // Sort by gAtPos desc, then totalG desc, then totalPA desc, then alpha
  allCandidates.sort(function(a,b) {
    if (b.gAtPos !== a.gAtPos) return b.gAtPos - a.gAtPos;
    var pa=playerStats[a.pid], pb=playerStats[b.pid];
    if (pb.totalG !== pa.totalG) return pb.totalG - pa.totalG;
    if (pb.totalPA !== pa.totalPA) return pb.totalPA - pa.totalPA;
    return pa.name.localeCompare(pb.name);
  });
  // Greedily assign: first valid (pos not filled, player not assigned) wins
  allCandidates.forEach(function(c) {
    if (!starters[c.pos] && !assigned.has(c.pid)) {
      starters[c.pos] = c.pid;
      assigned.add(c.pid);
    }
  });
  // For any position still unfilled, pick best unassigned player by gAtPos
  POSITIONS.forEach(function(pos) {
    if (starters[pos]) return;
    var cands = Object.keys(playerStats).filter(function(pid){
      return !assigned.has(pid) && (playerStats[pid].pos[pos]||0) > 0;
    });
    if (!cands.length) return;
    cands.sort(function(a,b) {
      var ga=playerStats[a].pos[pos]||0, gb=playerStats[b].pos[pos]||0;
      if (gb !== ga) return gb - ga;
      if (playerStats[b].totalG !== playerStats[a].totalG) return playerStats[b].totalG - playerStats[a].totalG;
      return playerStats[a].name.localeCompare(playerStats[b].name);
    });
    starters[pos] = cands[0];
    assigned.add(cands[0]);
  });

  var starterSet = new Set(Object.values(starters));

  var BENCH_MIN = 6;
  var bench = Object.keys(playerStats).filter(function(pid) {
    return !starterSet.has(pid) && playerStats[pid].totalG >= BENCH_MIN;
  }).sort(function(a,b){
    var pa=playerStats[a],pb=playerStats[b];
    if(pb.totalG!==pa.totalG) return pb.totalG-pa.totalG;
    if(pb.totalPA!==pa.totalPA) return pb.totalPA-pa.totalPA;
    return pa.name.localeCompare(pb.name);
  });

  function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function lastName(name) { var p=name.split(' '); return p.length>1 ? p.slice(1).join(' ') : p[0]; }

  // SVG dimensions. D=80 keeps everything in a 360-wide canvas.
  // Home plate at bottom-center. Arc connects flush with infield corners.
  var W=360, H=400, hx=180, hy=368, D=80;
  var fx=hx+D, fy=hy-D;   // 1B
  var sx=hx,   sy=hy-D*2; // 2B  
  var tx=hx-D, ty=hy-D;   // 3B
  // Arc starts at 3B and ends at 1B so outfield grass meets infield exactly
  var arcR = D*2.9;

  // chip: foreignObject with photo (36px) + centered name below
  // fw=56 gives enough room; text-align:center on the outer div
  function chip(pos, cx, cy) {
    var pid = starters[pos];
    var name = pid ? playerStats[pid].name : null;
    var lo   = pid ? pid.toLowerCase() : '';
    var lname = name ? lastName(name) : '';
    var click = pid ? ' onclick="navigate(\'profile\',\''+pid+'\')" style="cursor:pointer"' : '';
    var fw=56, fh=64;
    return '<foreignObject x="'+(cx-fw/2)+'" y="'+(cy-fh/2)+'" width="'+fw+'" height="'+fh+'" overflow="visible">'+
      '<div xmlns="http://www.w3.org/1999/xhtml"'+click+' style="width:'+fw+'px;text-align:center">'+
        (pid
          ? '<img src="img/players/'+lo+'" width="36" height="36" style="border-radius:50%;border:2px solid var(--sky-dim);object-fit:cover;display:block;margin:0 auto 2px" onerror="imgError(this,\''+pid+'\',\'leader\')">'
          : '<div style="width:36px;height:36px;border-radius:50%;border:1px solid var(--border);background:var(--deep-mid);margin:0 auto 2px"></div>')+
        '<div style="font-size:9px;font-weight:700;color:#e2f0ff;text-align:center;text-shadow:0 1px 4px rgba(0,0,0,0.85);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;width:'+fw+'px;line-height:1.2">'+esc(lname)+'</div>'+
      '</div>'+
    '</foreignObject>';
  }

  // Position coords
  var posCoords = {
    'P':  [hx,          hy-D*1.0],
    'C':  [hx,          hy+24],
    '1B': [hx+D,        hy-D],
    '2B': [hx+D*0.52,   hy-D*2.05],
    '3B': [hx-D,        hy-D],
    'SS': [hx-D*0.52,   hy-D*2.05],
    'LF': [hx-D*1.5,    hy-D*2.18],
    'LC': [hx-D*0.56,   hy-D*2.88],
    'RC': [hx+D*0.56,   hy-D*2.88],
    'RF': [hx+D*1.5,    hy-D*2.18],
  };

  var fieldSvg =
    '<svg viewBox="0 0 '+W+' '+H+'" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:400px;display:block;margin:0 auto">'+
    // Outfield grass: arc from 3B to 1B going through deep center
    '<path d="M'+tx+','+ty+' A'+arcR+','+arcR+' 0 0,1 '+fx+','+fy+' L'+hx+','+hy+' Z" fill="rgba(34,120,40,0.35)" stroke="rgba(56,189,248,0.22)" stroke-width="1.2"/>'+
    // Infield dirt: diamond
    '<polygon points="'+hx+','+hy+' '+fx+','+fy+' '+sx+','+sy+' '+tx+','+ty+'" fill="rgba(160,100,40,0.35)" stroke="rgba(200,140,60,0.4)" stroke-width="1"/>'+
    // Basepaths
    '<polyline points="'+fx+','+fy+' '+sx+','+sy+' '+tx+','+ty+' '+hx+','+hy+' '+fx+','+fy+'" fill="none" stroke="rgba(240,192,96,0.5)" stroke-width="1.5" stroke-dasharray="5,4"/>'+
    // Pitcher mound
    '<circle cx="'+hx+'" cy="'+(hy-D)+'" r="8" fill="rgba(160,100,40,0.5)" stroke="rgba(200,140,60,0.4)" stroke-width="1"/>'+
    // Home plate
    '<circle cx="'+hx+'" cy="'+hy+'" r="5" fill="rgba(240,220,180,0.3)" stroke="rgba(240,192,96,0.5)" stroke-width="1.2"/>'+
    // Bases
    [[fx,fy],[sx,sy],[tx,ty]].map(function(b){
      return '<rect x="'+(b[0]-5)+'" y="'+(b[1]-5)+'" width="10" height="10" fill="rgba(240,220,180,0.4)" stroke="rgba(240,192,96,0.5)" stroke-width="1" transform="rotate(45 '+b[0]+' '+b[1]+')"/>';
    }).join('')+
    // Player chips
    POSITIONS.map(function(pos){
      var c=posCoords[pos]; return chip(pos,c[0],c[1]);
    }).join('')+
    '</svg>';

  // Bench chips — centered row, same style
  var benchHtml = '';
  if (bench.length) {
    benchHtml = '<div style="border-top:1px solid var(--border);padding-top:0.6rem;margin-top:0.25rem;text-align:center">'+
      '<div style="font-family:var(--font-display);font-size:0.68rem;letter-spacing:0.08em;color:var(--text-dim);margin-bottom:0.45rem">ALSO PLAYED &ge;'+BENCH_MIN+' GAMES</div>'+
      '<div style="display:flex;flex-wrap:wrap;gap:0.4rem 0.5rem;justify-content:center">'+
      bench.map(function(pid) {
        var ps = playerStats[pid];
        var lo = pid.toLowerCase();
        var lname = lastName(ps.name);
        return '<div onclick="navigate(\'profile\',\''+pid+'\')" style="display:flex;flex-direction:column;align-items:center;width:56px;cursor:pointer">'+
          '<img src="img/players/'+lo+'" width="36" height="36" style="border-radius:50%;border:2px solid var(--border-bright);object-fit:cover;display:block;margin-bottom:2px" onerror="imgError(this,\''+pid+'\',\'leader\')">'+
          '<div style="font-size:9px;font-weight:600;color:var(--text-dim);text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;width:56px">'+esc(lname)+'</div>'+
        '</div>';
      }).join('')+
      '</div></div>';
  }

  var view = document.getElementById('lineup-view');
  view.style.display = 'block';
  view.innerHTML =
    '<div style="font-family:var(--font-display);font-size:0.9rem;letter-spacing:0.06em;color:var(--sky);margin-bottom:0.5rem;text-align:center">'+esc(lineupSeasonLabel)+' Starting Lineup</div>'+
    fieldSvg+
    benchHtml;
}


// ── INIT ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async function(){
  await Promise.all([loadData(), loadSeasonRecords()]);
  navigateFromHash();
});
