// ── CONSTANTS ─────────────────────────────────────────────────────────────
var AKA = { 'Gomez': 'AlmonteJ', 'DeBoer': 'SimonsK' };
var POS_COLS = ['pos_P','pos_C','pos_1B','pos_2B','pos_3B','pos_SS','pos_LF','pos_LC','pos_RC','pos_RF','pos_DH'];
var POS_LABELS = { pos_P:'P',pos_C:'C',pos_1B:'1B',pos_2B:'2B',pos_3B:'3B',pos_SS:'SS',pos_LF:'LF',pos_LC:'LC',pos_RC:'RC',pos_RF:'RF',pos_DH:'DH' };
var LIVE_STATS_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTvDmE9OZGe0w29idwwnbmdCfYOCqdRwajBQPrUvJZ-KZ1gahycABbrOzBW9B_S-5-heCWpOCOnXwgv/pub?gid=633884296&single=true&output=csv';
var LIVE_BOX_URL   = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTvDmE9OZGe0w29idwwnbmdCfYOCqdRwajBQPrUvJZ-KZ1gahycABbrOzBW9B_S-5-heCWpOCOnXwgv/pub?gid=2094714956&single=true&output=csv';
var SCHEDULE_URL   = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTvDmE9OZGe0w29idwwnbmdCfYOCqdRwajBQPrUvJZ-KZ1gahycABbrOzBW9B_S-5-heCWpOCOnXwgv/pub?gid=0&single=true&output=csv';
var NEWS_URL       = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTvDmE9OZGe0w29idwwnbmdCfYOCqdRwajBQPrUvJZ-KZ1gahycABbrOzBW9B_S-5-heCWpOCOnXwgv/pub?gid=1865025073&single=true&output=csv';
var NEWS_URL       = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTvDmE9OZGe0w29idwwnbmdCfYOCqdRwajBQPrUvJZ-KZ1gahycABbrOzBW9B_S-5-heCWpOCOnXwgv/pub?gid=1865025073&single=true&output=csv';
var STANDINGS_URL  = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTvDmE9OZGe0w29idwwnbmdCfYOCqdRwajBQPrUvJZ-KZ1gahycABbrOzBW9B_S-5-heCWpOCOnXwgv/pub?gid=1569850367&single=true&output=csv';
var LIVE_SEASON    = 2026.1;
var LIVE_LABEL     = 'Spring 2026';
var DATA = { players: [], stats: [], logs: [] };
var SEASON_RECORDS = [];
var SEA_CREATURES=['&#128025;','&#128026;','&#128031;','&#129416;','&#128032;','&#129408;','&#129425;','&#128033;','&#129424;','&#129438;','&#128044;','&#128051;','&#128011;','&#129453;'];
function seaCreature(id){var sum=0;for(var ci=0;ci<id.length;ci++)sum+=id.charCodeAt(ci);return SEA_CREATURES[sum%SEA_CREATURES.length];}
// ── DATA LOADING ──────────────────────────────────────────────────────────
async function loadData() {
  var res = await Promise.all([
    fetch('data/players.json').then(function(r){return r.json();}),
    fetch('data/season_stats.json').then(function(r){return r.json();}),
    fetch('data/game_logs.json').then(function(r){return r.json();}),
  ]);
  DATA.players = res[0]; DATA.stats = res[1]; DATA.logs = res[2];
  try {
    var live = await Promise.all([
      fetch(LIVE_STATS_URL).then(function(r){return r.text();}),
      fetch(LIVE_BOX_URL).then(function(r){return r.text();}),
      fetch(SCHEDULE_URL).then(function(r){return r.text();}),
    ]);
    mergeLiveStats(live[0]);
    mergeLiveBox(live[1]);
    cacheSchedule(live[2]);
    updateDerivedData();
    loadNews();
    // Re-render home if it's active (schedule/live data now available)
    if(document.getElementById('page-home').classList.contains('active')){
      renderSeasonLeaders();
      renderHomeGames();
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
  DATA.maxSeason = Math.max.apply(null, DATA.stats.map(function(r){return r.season_sort;}));
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
  DATA.stats = DATA.stats.filter(function(s){return s.season_sort !== LIVE_SEASON;});
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
      season_sort:LIVE_SEASON, season_label:LIVE_LABEL, season_year:2026, season_half:'Spring',
      player_id:nm,
      G:n(obj['G']),AB:n(obj['AB']),R:n(obj['R']),H:n(obj['H']),RBI:n(obj['RBI']),
      dbl:n(obj['2B']),trp:n(obj['3B']),HR:n(obj['HR']),BB:n(obj['BB']),
      BA:n(obj['BA']),OBP:n(obj['OBP']),SLG:n(obj['SLG']),OPS:n(obj['OPS']),
      MVP:n(obj['MVP']),RV:n(obj['RV']),
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
  DATA.logs = DATA.logs.filter(function(l){return !l.live;});
  var lines = text.trim().replace(/\r/g,'').split('\n');
  if (lines.length < 2) return;
  var headers = dedupeHeaders(parseLine(lines[0]));
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
      live:true, player_id:pid, game_num:n(obj['Game #']),
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

function makeAvatarImg(id) {
  var lo=id.toLowerCase();
  var err='if(!this.dataset.t)this.dataset.t=0;this.dataset.t=+this.dataset.t+1;var t=+this.dataset.t;'+
    'if(t===1)this.src="img/players/'+lo+'.jpeg";'+
    'else{this.onerror=null;this.parentElement.innerHTML=seaCreature("'+id+'");}';
  return '<img src="img/players/'+lo+'.jpg" style="width:100%;height:100%;object-fit:cover;border-radius:50%" onerror=\''+err+'\' alt="">';
}

function makeLeaderPhoto(id) {
  var lo=id.toLowerCase();
  var err='if(!this.dataset.t)this.dataset.t=0;this.dataset.t=+this.dataset.t+1;var t=+this.dataset.t;'+
    'if(t===1)this.src="img/players/'+lo+'.jpeg";'+
    'else{this.onerror=null;this.src="img/logo.png";this.style.objectFit="contain";this.style.background="white";this.style.padding="3px";}';
  return '<img src="img/players/'+lo+'.jpg" style="width:30px;height:30px;object-fit:cover;border-radius:50%;border:1px solid var(--border-bright)" onerror=\''+err+'\' alt="">';
}

function computeCareerTotals(stats) {
  var t={G:0,AB:0,H:0,HR:0,RBI:0,R:0,dbl:0,trp:0,BB:0,RV:0,pit_W:0,pit_L:0,pit_S:0,pit_IP:0,pit_RA:0,pit_G:0,pit_GS:0};
  POS_COLS.forEach(function(k){t['p_'+k]=0;});
  stats.forEach(function(s){
    t.G+=s.G||0;t.AB+=s.AB||0;t.H+=s.H||0;t.HR+=s.HR||0;t.RBI+=s.RBI||0;
    t.R+=s.R||0;t.dbl+=s.dbl||0;t.trp+=s.trp||0;t.BB+=s.BB||0;t.RV+=s.RV||0;
    t.pit_W+=s.pit_W||0;t.pit_L+=s.pit_L||0;t.pit_S+=s.pit_S||0;
    t.pit_IP+=s.pit_IP||0;t.pit_RA+=s.pit_RA||0;t.pit_G+=s.pit_G||0;t.pit_GS+=s.pit_GS||0;
    POS_COLS.forEach(function(k){t['p_'+k]+=(s[k]||0);});
  });
  t.BA=(t.AB>0)?t.H/t.AB:null;
  t.OBP=((t.AB+t.BB)>0)?(t.H+t.BB)/(t.AB+t.BB):null;
  var sg=t.H-t.dbl-t.trp-t.HR;
  t.SLG=(t.AB>0)?(sg+2*t.dbl+3*t.trp+4*t.HR)/t.AB:null;
  t.OPS=(t.OBP!=null&&t.SLG!=null)?t.OBP+t.SLG:null;
  return t;
}

function computeAllCareerTotals() {
  var tots={};
  DATA.stats.forEach(function(s){
    if(!tots[s.player_id]) tots[s.player_id]={G:0,AB:0,H:0,HR:0,RBI:0,R:0,dbl:0,trp:0,BB:0,RV:0,seasons:0,pit_W:0,pit_IP:0,pit_RA:0,pit_L:0,MVP_sum:0};
    var t=tots[s.player_id];
    t.G+=s.G||0;t.AB+=s.AB||0;t.H+=s.H||0;t.HR+=s.HR||0;t.RBI+=s.RBI||0;
    t.R+=s.R||0;t.dbl+=s.dbl||0;t.trp+=s.trp||0;t.BB+=s.BB||0;t.RV+=s.RV||0;
    t.seasons+=1;t.pit_W+=s.pit_W||0;t.pit_IP+=s.pit_IP||0;t.pit_RA+=s.pit_RA||0;t.pit_L+=s.pit_L||0;t.MVP_sum+=s.MVP||0;
  });
  return tots;
}

function nameWithFace(id) {
  var lo=id.toLowerCase();
  var err='if(!this.dataset.t)this.dataset.t=0;this.dataset.t=+this.dataset.t+1;var t=+this.dataset.t;'+
    'if(t===1)this.src="img/players/'+lo+'.jpeg";'+
    'else{this.onerror=null;this.outerHTML="<span style=font-size:.9rem>"+seaCreature("'+id+'")+"</span>";}';
  return '<img src="img/players/'+lo+'.jpg" '+
    'style="width:18px;height:18px;object-fit:cover;border-radius:50%;vertical-align:middle;margin-right:3px;border:1px solid var(--border-bright)" '+
    'onerror=\''+err+'\' alt="">'+displayName(id);
}
// ── ROUTING ───────────────────────────────────────────────────────────────
function navigate(route, param) {
  document.querySelectorAll('.page').forEach(function(p){p.classList.remove('active');});
  document.querySelectorAll('nav a[data-route]').forEach(function(a){a.classList.toggle('active',a.dataset.route===route);});
  window.scrollTo(0,0);
  var h={home:showHome,players:showPlayers,seasons:showSeasons,gamelogs:showGameLogs,records:showRecords,schedule:showSchedule,standings:showStandings};
  if(route==='profile'&&param) showProfile(param);
  else if(h[route]) h[route]();
}

// ── BOX TABLES ────────────────────────────────────────────────────────────
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
      '<td>'+fmtBox(l.HR)+'</td><td>'+fmtBox(l.BB)+'</td><td>'+fmtRV(l.RV,2)+'</td></tr>';
  }).join('');
  return '<div class="table-wrap"><table>'+
    '<thead><tr>'+nameCol+'<th>AB</th><th>R</th><th>H</th><th>RBI</th><th>2B</th><th>3B</th><th>HR</th><th>BB</th><th>RV</th></tr></thead>'+
    '<tbody>'+body+'</tbody></table></div>';
}

function buildBoxTableWithPos(rows, showDateOpp) {
  var nameCol=showDateOpp
    ?'<th style="text-align:left">Date</th><th style="text-align:left">Opp</th>'
    :'<th style="text-align:left">Player</th>';
  var body=rows.map(function(l){
    var posStr=POS_COLS.filter(function(k){return l[k]&&l[k]>0;}).map(function(k){return POS_LABELS[k];}).join('/')||'&mdash;';
    var fc=showDateOpp
      ?'<td style="text-align:left">'+l.date+'</td><td style="text-align:left">'+(l.opponent||'&mdash;')+'</td>'
      :'<td style="text-align:left"><a onclick="navigate(\'profile\',\''+l.player_id+'\')">'+nameWithFace(l.player_id)+'</a></td>';
    return '<tr>'+fc+'<td style="text-align:left;color:var(--sky-light)">'+posStr+'</td>'+
      '<td>'+fmtBox(l.AB)+'</td><td>'+fmtBox(l.R)+'</td><td>'+fmtBox(l.H)+'</td>'+
      '<td>'+fmtBox(l.RBI)+'</td><td>'+fmtBox(l.dbl)+'</td><td>'+fmtBox(l.trp)+'</td>'+
      '<td>'+fmtBox(l.HR)+'</td><td>'+fmtBox(l.BB)+'</td><td>'+fmtRV(l.RV,2)+'</td></tr>';
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
    var photoGrid='<div style="display:grid;grid-template-columns:1fr 1fr;gap:2px;justify-items:center;max-width:72px;margin:0.2rem auto">';
    leaders.forEach(function(l){ photoGrid+=makeLeaderPhoto(l.id); });
    photoGrid+='</div>';
    // Names stacked
    var nameLines=leaders.length===1
      ?displayName(leaders[0].id)
      :leaders.map(function(l){return '<div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%">'+displayName(l.id)+'</div>';}).join('');
    return '<div class="card"'+clickAttr+' style="flex:1;min-width:calc(50% - 0.5rem);max-width:calc(50% - 0.25rem);text-align:center;box-sizing:border-box">'+
      '<div style="font-family:var(--font-display);font-size:0.6rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:var(--text-muted)">'+stat+'</div>'+
      '<div style="font-size:1.2rem;font-weight:700;color:var(--text);line-height:1.2;margin:0.1rem 0">'+fmtFn(top)+'</div>'+
      photoGrid+
      '<div style="font-size:0.65rem;color:var(--text-dim);margin-top:0.1rem;line-height:1.3;overflow:hidden">'+nameLines+'</div>'+
    '</div>';
  }

  document.getElementById('home-leaders').innerHTML=
    leaderCard('Games',   function(r){return r.G||0;},  function(v){return v;})+
    leaderCard('Hits',    function(r){return r.H||0;},  function(v){return v;})+
    leaderCard('Runs',    function(r){return r.R||0;},  function(v){return v;})+
    leaderCard('RBI',     function(r){return r.RBI||0;},function(v){return v;})+
    leaderCard('Home Runs',function(r){return r.HR||0;},function(v){return v;})+
    leaderCard('OBP (min '+(maxG*1.5)+' PA)',function(r){return ((r.AB||0)+(r.BB||0))>=(maxG*1.5)?r.OBP:null;},fmtBA);
}

function renderHomeGames() {
  var today=new Date().toISOString().slice(0,10);
  var sched=window._scheduleRows||[];

  // W-L record
  var wins=0,losses=0;
  sched.forEach(function(r){
    var res=(r['W/L']||'').trim().toUpperCase();
    if(res==='W') wins++; else if(res==='L') losses++;
  });
  var wlBlock='';
  if(wins+losses>0){
    wlBlock='<div style="margin-right:1.5rem;flex-shrink:0">'+
      '<div class="filter-label">Record</div>'+
      '<div style="font-family:var(--font-blade);font-size:2rem;text-transform:lowercase;color:var(--sky);line-height:1.1">'+wins+'-'+losses+'</div>'+
      '<div style="font-size:0.75rem;color:var(--text-muted);font-family:var(--font-display);letter-spacing:0.1em;text-transform:uppercase;margin-top:0.2rem">'+seasonLabel(DATA.maxSeason)+'</div>'+
    '</div>';
  }
  document.getElementById('home-wl').innerHTML='';

  // Upcoming games
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

    if(!wlBlock&&!cards) return '';
    return '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.5rem">'+
        '<div class="section-title" style="margin:0">Upcoming</div>'+
        wlBlock+
      '</div>'+
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
    var rows=DATA.logs.filter(function(l){return l.date===latest.date&&l.game_num===latest.game_num;})
      .sort(function(a,b){return a.batting_order-b.batting_order;});
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
  document.getElementById('home-recent').innerHTML=recentHTML;
}


// ── PLAYERS ───────────────────────────────────────────────────────────────
function showPlayers() {
  document.getElementById('page-players').classList.add('active');
  document.getElementById('player-search').value='';
  document.getElementById('gender-filter').value='all';
  document.getElementById('pos-filter').value='all';
  document.getElementById('active-only').checked=true;
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

function renderRoster(filter,gender,posFilter,activeOnly) {
  filter=filter||'';gender=gender||'all';posFilter=posFilter||'all';
  // Default to checkbox state if not explicitly passed
  if(activeOnly===undefined){
    var cb=document.getElementById('active-only');
    activeOnly=cb?cb.checked:true;
  } else {
    activeOnly=!!activeOnly;
  }
  var players=DATA.players.slice();
  if(filter){var q=filter.toLowerCase();players=players.filter(function(p){return (p.first+' '+p.last+p.id).toLowerCase().includes(q);});}
  if(gender!=='all') players=players.filter(function(p){return p.gender===gender;});
  var active=new Set(DATA.stats.filter(function(s){return s.season_sort===DATA.maxSeason;}).map(function(s){return s.player_id;}));
  if(activeOnly) players=players.filter(function(p){return active.has(p.id);});
  if(posFilter!=='all'){
    var posKey='pos_'+posFilter;
    var posPlayers=new Set(DATA.stats.filter(function(s){return (s[posKey]||0)>0;}).map(function(s){return s.player_id;}));
    players=players.filter(function(p){return posPlayers.has(p.id);});
  }
  players.sort(function(a,b){return a.last.localeCompare(b.last);});

  var sums={};
  DATA.stats.forEach(function(s){
    if(!sums[s.player_id]) sums[s.player_id]={AB:0,H:0,HR:0,RBI:0,seasons:[]};
    var sm=sums[s.player_id];
    sm.AB+=s.AB||0;sm.H+=s.H||0;sm.HR+=s.HR||0;sm.RBI+=s.RBI||0;sm.seasons.push(s.season_sort);
  });

  document.getElementById('roster-grid').innerHTML=players.map(function(p){
    var sm=sums[p.id],isActive=active.has(p.id);
    var pStats4=DATA.stats.filter(function(s){return s.player_id===p.id;});
    var mainPos=pStats4.length?careerPosDisplay(pStats4):'';
    var rangeStr='',statsStr='';
    if(sm&&sm.seasons.length>0){
      var lo=Math.min.apply(null,sm.seasons),hi=Math.max.apply(null,sm.seasons);
      var loY=seasonYear(lo),hiY=seasonYear(hi);
      rangeStr=loY===hiY?String(loY):String(loY)+'\u2013'+String(hiY).slice(2);
      var ba=sm.AB>=10?fmtBA(sm.H/sm.AB):'&mdash;';
      statsStr='H:'+sm.H+' &middot; HR:'+sm.HR+' &middot; RBI:'+sm.RBI+' &middot; BA:'+ba;
    }
    return '<div class="roster-card" onclick="navigate(\'profile\',\''+p.id+'\')">'+
      '<div class="roster-avatar">'+makeAvatarImg(p.id)+'</div>'+
      '<div style="min-width:0">'+
        '<div class="roster-name">'+p.first+' '+p.last+'</div>'+
        '<div class="roster-sub">'+
          (isActive?'<span class="badge badge-current">Active</span> ':'')+
          (mainPos?'<span class="badge" style="background:rgba(56,189,248,0.12);color:var(--sky)">'+mainPos+'</span>':'')+
          (rangeStr?'<span style="color:var(--text-muted);font-size:0.7rem;margin-left:0.3rem">'+rangeStr+'</span>':'')+
          (statsStr?'<div style="font-size:0.7rem;color:var(--text-muted);margin-top:0.1rem">'+statsStr+'</div>':
            '<div style="font-size:0.7rem;color:var(--text-muted);margin-top:0.1rem">No stats yet</div>')+
        '</div></div></div>';
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
        '<td>'+(hasPit?fmtStat(s.pit_W):'')+'</td>'+
        '<td>'+(hasPit?fmtStat(s.pit_L):'')+'</td>'+
        '<td>'+(hasPit?fmtStat(s.pit_S):'')+'</td>'+
        '<td>'+(hasPit&&s.pit_IP>0?Number(s.pit_RA/s.pit_IP).toFixed(2):'')+'</td>';
    }
    var posCells=POS_COLS.map(function(k){return '<td>'+((s[k]!=null&&s[k]>0)?s[k]:'')+'</td>';}).join('');
    return '<tr>'+
      '<td style="text-align:left;white-space:nowrap">'+s.season_label+'</td>'+
      '<td style="text-align:left;color:var(--sky-light);font-weight:600">'+pos+'</td>'+
      '<td>'+fmtStat(s.G)+'</td><td>'+fmtStat(s.AB)+'</td><td>'+fmtStat(s.R)+'</td>'+
      '<td>'+fmtStat(s.H)+'</td><td>'+fmtStat(s.RBI)+'</td>'+
      '<td>'+fmtStat(s.dbl)+'</td><td>'+fmtStat(s.trp)+'</td>'+
      '<td>'+fmtStat(s.HR)+'</td><td>'+fmtStat(s.BB)+'</td>'+
      '<td>'+fmtBA(s.BA)+'</td><td>'+fmtBA(s.OBP)+'</td>'+
      '<td>'+fmtBA(s.SLG)+'</td><td>'+fmtBA(s.OPS)+'</td>'+
      posCells+
      '<td>'+(s.MVP!=null?Number(s.MVP).toFixed(1):'&mdash;')+'</td>'+
      '<td>'+fmtRV(s.RV)+'</td>'+pitCells+'</tr>';
  }

  function careerRow() {
    var pitCells='';
    if(isPitcher){
      pitCells='<td>'+(career.pit_G||'')+'</td><td>'+(career.pit_GS||'')+'</td>'+
        '<td>'+(career.pit_IP?fmtStat(career.pit_IP,1):'')+'</td><td>'+(career.pit_RA||'')+'</td>'+
        '<td>'+(career.pit_W||'')+'</td><td>'+(career.pit_L||'')+'</td>'+
        '<td>'+(career.pit_S||'')+'</td>'+
        '<td>'+(career.pit_IP>0?Number(career.pit_RA/career.pit_IP).toFixed(2):'&mdash;')+'</td>';
    }
    var posCells=POS_COLS.map(function(k){return '<td>'+(career['p_'+k]||'')+'</td>';}).join('');
    return '<tr class="career-row">'+
      '<td>career</td><td></td>'+
      '<td>'+career.G+'</td><td>'+career.AB+'</td><td>'+career.R+'</td>'+
      '<td>'+career.H+'</td><td>'+career.RBI+'</td>'+
      '<td>'+career.dbl+'</td><td>'+career.trp+'</td>'+
      '<td>'+career.HR+'</td><td>'+career.BB+'</td>'+
      '<td>'+fmtBA(career.BA)+'</td><td>'+fmtBA(career.OBP)+'</td>'+
      '<td>'+fmtBA(career.SLG)+'</td><td>'+fmtBA(career.OPS)+'</td>'+
      posCells+'<td>&mdash;</td><td>'+fmtRV(career.RV)+'</td>'+pitCells+'</tr>';
  }

  var pitHeaders=isPitcher?'<th>GP</th><th>GS</th><th>IP</th><th>RA</th><th>W</th><th>L</th><th>S</th><th>RIP</th>':'';
  var thead='<th style="text-align:left">Season</th><th style="text-align:left">Pos</th>'+
    '<th>G</th><th>AB</th><th>R</th><th>H</th><th>RBI</th><th>2B</th><th>3B</th><th>HR</th><th>BB</th>'+
    '<th>BA</th><th>OBP</th><th>SLG</th><th>OPS</th>'+
    '<th>P</th><th>C</th><th>1B</th><th>2B</th><th>3B</th><th>SS</th><th>LF</th><th>LC</th><th>RC</th><th>RF</th><th>DH</th>'+
    '<th>MVP</th><th>RV</th>'+pitHeaders;

  var logsTab=pLogs.length>0?'<button class="tab-btn" onclick="switchProfileTab(this,\'tab-gamelogs\')">Game Log</button>':'';
  var logsPanel=pLogs.length>0?'<div id="tab-gamelogs" class="tab-panel">'+buildBoxTableWithPos(pLogs,true)+'</div>':'';
  var statsContent=pStats.length===0
    ?'<div class="empty-state">No official stats yet &mdash; Spring 2026 in progress!</div>'
    :'<div class="tabs">'+
        '<button class="tab-btn active" onclick="switchProfileTab(this,\'tab-seasons\')">By Season</button>'+
        logsTab+'</div>'+
      '<div id="tab-seasons" class="tab-panel active">'+
        '<div class="table-wrap"><table>'+
          '<thead><tr>'+thead+'</tr></thead>'+
          '<tbody>'+careerRow()+pStats.map(batRow).join('')+'</tbody>'+
        '</table></div></div>'+logsPanel;

  page.innerHTML=
    '<div class="profile-header" style="padding-top:0.5rem;flex-direction:column;align-items:center;text-align:center">'+
      '<div class="profile-photo">'+makeAvatarImg(id)+'</div>'+
      '<div class="profile-info" style="text-align:center">'+
        '<div class="blade-name">'+player.first+' '+player.last+'</div>'+
        (akaStr?'<div class="aka">'+akaStr+'</div>':'')+
        '<div class="profile-meta" style="justify-content:center">'+
          (isActive?'<span class="badge badge-current">Active</span>':'')+
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
}

function switchProfileTab(btn,panelId) {
  var page=document.getElementById('page-profile');
  page.querySelectorAll('.tab-btn').forEach(function(b){b.classList.remove('active');});
  page.querySelectorAll('.tab-panel').forEach(function(p){p.classList.remove('active');});
  btn.classList.add('active');
  var el=document.getElementById(panelId);
  if(el) el.classList.add('active');
}

// ── SEASON RECORDS ────────────────────────────────────────────────────────
function renderSeasonRecap(selSeason, mode) {
  // mode: 'season', 'career', 'all'
  var el=document.getElementById('season-recap');
  if(!el||!SEASON_RECORDS.length) return;

  var squidsChamps=SEASON_RECORDS.filter(function(s){return s.champ==='Squids';});
  var squidsRunners=SEASON_RECORDS.filter(function(s){return s.runner==='Squids';});

  // Always show pennants
  var pennants=squidsChamps.map(function(s){
    return '<div style="display:flex;flex-direction:column;align-items:center;gap:0.15rem">'+
      '<div style="font-size:1.4rem">&#127942;</div>'+
      '<div style="font-family:var(--font-blade);font-size:0.6rem;text-transform:lowercase;color:var(--gold)">'+seasonLabel(parseFloat('20'+s.s))+'</div>'+
    '</div>';
  }).join('')+squidsRunners.map(function(s){
    return '<div style="display:flex;flex-direction:column;align-items:center;gap:0.15rem">'+
      '<div style="font-size:1.4rem">&#129352;</div>'+
      '<div style="font-family:var(--font-blade);font-size:0.6rem;text-transform:lowercase;color:var(--sky-light)">'+seasonLabel(parseFloat('20'+s.s))+'</div>'+
    '</div>';
  }).join('');

  var recapHTML='';

  if(mode==='career') {
    // All-time record
    var totW=0,totL=0;
    SEASON_RECORDS.forEach(function(s){if(s.w!=null)totW+=s.w;if(s.l!=null)totL+=s.l;});
    recapHTML=
      '<div style="display:flex;align-items:center;gap:1.5rem;flex-wrap:wrap">'+
        '<div><div class="filter-label">All-Time Record</div>'+
          '<div style="font-family:var(--font-blade);font-size:1.4rem;text-transform:lowercase;color:var(--text)">'+totW+'-'+totL+'</div></div>'+
        '<div><div class="filter-label">Championships</div>'+
          '<div style="font-size:1.1rem">'+squidsChamps.map(function(){return '&#127942;';}).join('')+'</div></div>'+
        '<div><div class="filter-label">Runner-ups</div>'+
          '<div style="font-size:1.1rem">'+squidsRunners.map(function(){return '&#129352;';}).join('')+'</div></div>'+
      '</div>';
  } else if(mode==='all') {
    // All seasons view - just show championships inline
    recapHTML=
      '<div style="display:flex;align-items:center;gap:1.5rem;flex-wrap:wrap">'+
        '<div><div class="filter-label">Championships</div>'+
          '<div style="font-size:1.1rem">'+squidsChamps.map(function(){return '&#127942;';}).join('')+'</div></div>'+
        '<div><div class="filter-label">Runner-ups</div>'+
          '<div style="font-size:1.1rem">'+squidsRunners.map(function(){return '&#129352;';}).join('')+'</div></div>'+
      '</div>';
  } else if(selSeason) {
    // Single season
    var key=seasonSortToKey(selSeason);
    var rec=SEASON_RECORDS.find(function(s){return s.s===key;});
    var wl='&mdash;', isChamp=false, isRunner=false, champName='', runnerName='';
    if(rec){
      isChamp=rec.champ==='Squids'; isRunner=rec.runner==='Squids';
      wl=(rec.w!=null&&rec.l!=null)?rec.w+'-'+rec.l:'&mdash;';
      champName=rec.champ||''; runnerName=rec.runner||'';
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
    var wlColor=isChamp?'var(--gold)':isRunner?'var(--sky)':'var(--text)';
    recapHTML=
      '<div style="display:flex;align-items:center;gap:1.5rem;flex-wrap:wrap">'+
        '<div><div class="filter-label">Record</div>'+
          '<div style="font-family:var(--font-blade);font-size:1.4rem;text-transform:lowercase;color:'+wlColor+'">'+wl+'</div></div>'+
        (champName&&champName!=='--'?
          '<div><div class="filter-label">Champion</div>'+
          '<div style="font-size:0.9rem;color:'+(isChamp?'var(--gold)':'var(--text)')+'">'+champName+(isChamp?' &#127942;':'')+'</div></div>':'')+
        (runnerName&&runnerName!=='--'?
          '<div><div class="filter-label">Runner-up</div>'+
          '<div style="font-size:0.9rem;color:'+(isRunner?'var(--sky)':'var(--text)')+'">'+runnerName+(isRunner?' &#129352;':'')+'</div></div>':'')+
      '</div>';
  }

  el.innerHTML=
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:1rem;margin-bottom:1rem">'+
      '<div style="display:flex;gap:1rem;align-items:flex-end">'+pennants+'</div>'+
      recapHTML+
    '</div>';
}


function showSeasons() {
  document.getElementById('page-seasons').classList.add('active');
  var seasons = Array.from(new Set(DATA.stats.map(function(s){return s.season_sort;}))).sort(function(a,b){return b-a;});

  // Populate season dropdown
  var sel = document.getElementById('stats-season');
  if (sel) {
    sel.innerHTML = '<option value="all">All Seasons</option>' +
      seasons.map(function(s){
        // Use toFixed(1) to avoid float representation issues like 2013.1000000001
        var v = s.toFixed(1);
        return '<option value="'+v+'">'+seasonLabel(s)+'</option>';
      }).join('');
    sel.value = seasons[0].toFixed(1);
  }
  // Also keep season-select in sync for recap
  var sel2 = document.getElementById('season-select');
  if (sel2) {
    sel2.innerHTML = seasons.map(function(s){return '<option value="'+s+'">'+seasonLabel(s)+'</option>';}).join('');
  }

  renderStats();
  renderSeasonRecap(seasons[0]);
}

function onScopeChange() {
  var scope = document.getElementById('stats-scope').value;
  var seasonEl = document.getElementById('stats-season');
  if (seasonEl) {
    seasonEl.disabled = scope === 'career';
    seasonEl.style.opacity = scope === 'career' ? '0.4' : '1';
    if (scope === 'career') seasonEl.value = 'all';
  }
}

function renderStats() {
  var scopeEl   = document.getElementById('stats-scope');
  var seasonEl  = document.getElementById('stats-season');
  var viewEl    = document.getElementById('stats-view');
  var genderEl  = document.getElementById('stats-gender');
  var activeEl  = document.getElementById('stats-active');
  var minABEl   = document.getElementById('stats-minab');
  if (!scopeEl) return;

  var scope    = scopeEl.value;
  // Grey out season dropdown in career mode
  if(seasonEl){
    seasonEl.disabled = scope === 'career';
    seasonEl.style.opacity = scope === 'career' ? '0.4' : '1';
    if(scope === 'career') seasonEl.value = 'all';
  }
  var season   = (scope === 'career') ? 'all' : (seasonEl ? seasonEl.value : 'all');
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

  // Update recap - always render with appropriate mode
  if (scope === 'career') {
    renderSeasonRecap(null, 'career');
  } else if (season === 'all') {
    renderSeasonRecap(null, 'all');
  } else {
    renderSeasonRecap(parseFloat(season), 'season');
  }

  // Update season label
  var labelEl = document.getElementById('season-label');
  if (labelEl) {
    if (scope === 'career') labelEl.textContent = 'Career';
    else if (season === 'all') labelEl.textContent = 'All Seasons — every player-season';
    else labelEl.textContent = seasonLabel(parseFloat(season));
  }

  var thead = document.getElementById('season-thead');
  var tbody = document.getElementById('season-tbody');
  thead.innerHTML = ''; tbody.innerHTML = '';

  // ── BATTING ──
  if (view === 'batting') {
    var rows = [];
    if (scope === 'season') {
      // Single season or best in any season
      var pool = DATA.stats.filter(function(s){
        if (season !== 'all' && s.season_sort.toFixed(1) !== season) return false;
        if (!gok(s.player_id)) return false;
        if ((s.G||0) === 0) return false;
        if (minAB > 0 && ((s.AB||0)+(s.BB||0)) < minAB) return false;
        return true;
      });
      rows = pool.sort(function(a,b){return (b.G||0)-(a.G||0)||(b.AB||0)-(a.AB||0);}).map(function(s){
        return {pid:s.player_id, seasonStr:s.season_label,
          G:s.G,AB:s.AB,R:s.R,H:s.H,RBI:s.RBI,dbl:s.dbl,trp:s.trp,HR:s.HR,BB:s.BB,
          BA:s.BA,OBP:s.OBP,SLG:s.SLG,OPS:s.OPS,MVP:s.MVP,RV:s.RV};
      });
    } else {
      // Career totals
      var tots = {};
      DATA.stats.forEach(function(s){
        if (!gok(s.player_id)) return;
        if (!tots[s.player_id]) tots[s.player_id]={G:0,AB:0,H:0,HR:0,RBI:0,R:0,dbl:0,trp:0,BB:0,RV:0,pit_W:0,pit_IP:0,pit_RA:0};
        var t=tots[s.player_id];
        t.G+=s.G||0;t.AB+=s.AB||0;t.H+=s.H||0;t.HR+=s.HR||0;t.RBI+=s.RBI||0;
        t.R+=s.R||0;t.dbl+=s.dbl||0;t.trp+=s.trp||0;t.BB+=s.BB||0;t.RV+=s.RV||0;
      });
      rows = Object.entries(tots)
        .filter(function(e){return e[1].G>0&&(minAB===0||e[1].AB>=minAB);})
        .map(function(e){
          var id=e[0],t=e[1];
          var sg=t.H-t.dbl-t.trp-t.HR;
          var ba=t.AB>0?t.H/t.AB:null;
          var obp=(t.AB+t.BB)>0?(t.H+t.BB)/(t.AB+t.BB):null;
          var slg=t.AB>0?(sg+2*t.dbl+3*t.trp+4*t.HR)/t.AB:null;
          return {pid:id, seasonStr:'Career',
            G:t.G,AB:t.AB,R:t.R,H:t.H,RBI:t.RBI,dbl:t.dbl,trp:t.trp,HR:t.HR,BB:t.BB,
            BA:ba,OBP:obp,SLG:slg,OPS:(obp!=null&&slg!=null)?obp+slg:null,MVP:null,RV:t.RV};
        })
        .sort(function(a,b){return (b.G||0)-(a.G||0)||(b.AB||0)-(a.AB||0);});
    }

    var showSeasonCol = (scope==='season' && season==='all');
    thead.innerHTML = '<tr>'+
      '<th style="text-align:left">Player</th>'+
      (showSeasonCol?'<th style="text-align:left">Season</th>':'')+
      '<th onclick="sortStats(this)" data-col="G">G</th>'+
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
      (showSeasonCol?'':'<th onclick="sortStats(this)" data-col="MVP">MVP</th>')+
      '<th onclick="sortStats(this)" data-col="RV">RV</th>'+
    '</tr>';

    window._statsRows = rows;
    window._statsShowSeason = showSeasonCol;
    renderStatsRows();

  // ── PITCHING ──
  } else {
    var prows = [];
    if (scope === 'season') {
      var pool2 = DATA.stats.filter(function(s){
        if (season !== 'all' && s.season_sort.toFixed(1) !== season) return false;
        if (!gok(s.player_id)) return false;
        if (!s.pit_IP || s.pit_IP <= 0) return false;
        return true;
      });
      prows = pool2.sort(function(a,b){return (b.pit_IP||0)-(a.pit_IP||0);}).map(function(s){
        return {pid:s.player_id,seasonStr:s.season_label,
          pit_G:s.pit_G,pit_GS:s.pit_GS,pit_IP:s.pit_IP,pit_RA:s.pit_RA,
          pit_W:s.pit_W,pit_L:s.pit_L,pit_S:s.pit_S,
          RIP:s.pit_IP>0?s.pit_RA/s.pit_IP:null};
      });
    } else {
      var ptots = {};
      DATA.stats.forEach(function(s){
        if (!gok(s.player_id)) return;
        if (!s.pit_IP||s.pit_IP<=0) return;
        if (!ptots[s.player_id]) ptots[s.player_id]={pit_G:0,pit_GS:0,pit_IP:0,pit_RA:0,pit_W:0,pit_L:0,pit_S:0};
        var t=ptots[s.player_id];
        t.pit_G+=s.pit_G||0;t.pit_GS+=s.pit_GS||0;t.pit_IP+=s.pit_IP||0;
        t.pit_RA+=s.pit_RA||0;t.pit_W+=s.pit_W||0;t.pit_L+=s.pit_L||0;t.pit_S+=s.pit_S||0;
      });
      prows = Object.values(ptots).filter(function(t){return t.pit_IP>0;})
        .map(function(t,i){
          var id=Object.keys(ptots)[i];
          return {pid:id,seasonStr:'Career',
            pit_G:t.pit_G,pit_GS:t.pit_GS,pit_IP:t.pit_IP,pit_RA:t.pit_RA,
            pit_W:t.pit_W,pit_L:t.pit_L,pit_S:t.pit_S,
            RIP:t.pit_IP>0?t.pit_RA/t.pit_IP:null};
        })
        .sort(function(a,b){return (b.pit_IP||0)-(a.pit_IP||0);});
    }

    var showSeasonCol2 = (scope==='season' && season==='all');
    thead.innerHTML = '<tr>'+
      '<th style="text-align:left">Player</th>'+
      (showSeasonCol2?'<th style="text-align:left">Season</th>':'')+
      '<th onclick="sortStats(this)" data-col="pit_G">G</th>'+
      '<th onclick="sortStats(this)" data-col="pit_GS">GS</th>'+
      '<th onclick="sortStats(this)" data-col="pit_IP">IP</th>'+
      '<th onclick="sortStats(this)" data-col="pit_RA">RA</th>'+
      '<th onclick="sortStats(this)" data-col="pit_W">W</th>'+
      '<th onclick="sortStats(this)" data-col="pit_L">L</th>'+
      '<th onclick="sortStats(this)" data-col="pit_S">S</th>'+
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

function renderStatsRows() {
  var rows = window._statsRows || [];
  var showSeasonCol = window._statsShowSeason;
  var isPitching = window._statsPitching;
  var tbody = document.getElementById('season-tbody');

  tbody.innerHTML = rows.slice(0,100).map(function(r){
    var cells = '';
    if (isPitching) {
      if (showSeasonCol) cells += '<td style="text-align:left;color:var(--text-dim);font-size:0.8rem">'+r.seasonStr+'</td>';
      cells += '<td>'+fmtStat(r.pit_G)+'</td><td>'+fmtStat(r.pit_GS)+'</td>'+
        '<td>'+fmtStat(r.pit_IP,1)+'</td><td>'+fmtStat(r.pit_RA)+'</td>'+
        '<td>'+fmtStat(r.pit_W)+'</td><td>'+fmtStat(r.pit_L)+'</td>'+
        '<td>'+fmtStat(r.pit_S)+'</td>'+
        '<td>'+(r.RIP!=null?Number(r.RIP).toFixed(2):'&mdash;')+'</td>';
    } else {
      if (showSeasonCol) cells += '<td style="text-align:left;color:var(--text-dim);font-size:0.8rem">'+r.seasonStr+'</td>';
      cells += '<td>'+fmtStat(r.G)+'</td><td>'+fmtStat(r.AB)+'</td><td>'+fmtStat(r.R)+'</td>'+
        '<td>'+fmtStat(r.H)+'</td><td>'+fmtStat(r.RBI)+'</td>'+
        '<td>'+fmtStat(r.dbl)+'</td><td>'+fmtStat(r.trp)+'</td>'+
        '<td>'+fmtStat(r.HR)+'</td><td>'+fmtStat(r.BB)+'</td>'+
        '<td>'+fmtBA(r.BA)+'</td><td>'+fmtBA(r.OBP)+'</td>'+
        '<td>'+fmtBA(r.SLG)+'</td><td>'+fmtBA(r.OPS)+'</td>'+
        (showSeasonCol?'':'<td>'+(r.MVP!=null?Number(r.MVP).toFixed(1):'&mdash;')+'</td>')+
        '<td>'+fmtRV(r.RV)+'</td>';
    }
    return '<tr>'+
      '<td style="text-align:left"><a onclick="navigate(\'profile\',\''+r.pid+'\')">'+nameWithFace(r.pid)+'</a></td>'+
      cells+'</tr>';
  }).join('');
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
    return asc ? av-bv : bv-av;
  });
  window._statsRows = rows;
  renderStatsRows();
}

// Stub for old calls
function renderSeasonStats() { renderStats(); }
function renderStatsLeaderboard() { renderStats(); }


// ── GAME LOGS ─────────────────────────────────────────────────────────────
function showGameLogs() {
  document.getElementById('page-gamelogs').classList.add('active');
  var games={};
  DATA.logs.forEach(function(l){
    var key=l.date+'||'+l.game_num;
    if(!games[key]) games[key]={date:l.date,game_num:l.game_num,opponent:l.opponent,rows:[]};
    games[key].rows.push(l);
  });
  var list=Object.values(games).sort(function(a,b){return b.date.localeCompare(a.date)||b.game_num-a.game_num;});
  var years=Array.from(new Set(list.map(function(g){return g.date.slice(0,4);}))).sort().reverse();
  document.getElementById('log-year-select').innerHTML=
    '<option value="all">All Years</option>'+years.map(function(y){return '<option value="'+y+'">'+y+'</option>';}).join('');
  window._gameList=list;
  renderGameList();
}

function renderGameList() {
  var year=document.getElementById('log-year-select').value;
  var games=window._gameList.filter(function(g){return year==='all'||g.date.startsWith(year);});
  var schedMap={};
  if(window._scheduleRows){
    window._scheduleRows.forEach(function(r){
      var d=schedDateToISO(r['Date']||'');
      if(d) schedMap[d]={wl:(r['W/L']||'').trim().toUpperCase(),rs:r['RS']||'',ra:r['RA']||''};
    });
  }
  var html='',lastSeason='';
  games.forEach(function(g){
    var yr=g.date.slice(0,4),mo=parseInt(g.date.slice(5,7));
    var season=yr+(mo<=7?' Spring':' Fall');
    if(season!==lastSeason){
      html+='<div style="font-family:var(--font-blade);text-transform:lowercase;color:var(--sky);font-size:0.85rem;'+
        'letter-spacing:0.08em;padding:0.6rem 0 0.3rem;border-top:1px solid var(--border-bright);'+
        'margin-top:'+(lastSeason?'1rem':'0')+'">'+season+'</div>';
      lastSeason=season;
    }
    var sched=schedMap[g.date]||{};
    var wl=sched.wl||'',rs=sched.rs||'',ra=sched.ra||'';
    var wlColor=wl==='W'?'var(--green)':wl==='L'?'var(--red)':'var(--text-muted)';
    var scoreStr=(rs&&ra)?rs+'\u2013'+ra:'';
    var hasBox=g.rows&&g.rows.length>0;
    html+='<div class="card mb1"'+(hasBox?' style="cursor:pointer" onclick="toggleGameBox(this)"':'')+'>'+
      '<div style="display:flex;justify-content:space-between;align-items:center">'+
        '<div style="display:flex;align-items:center;gap:0.75rem">'+
          (wl?'<span style="font-family:var(--font-blade);font-size:1.1rem;text-transform:lowercase;color:'+wlColor+'">'+wl+'</span>':
              '<span style="color:var(--text-muted);font-size:0.85rem;width:1rem">&mdash;</span>')+
          '<div>'+
            '<span style="font-family:var(--font-display);font-weight:700;font-size:0.95rem">'+g.date+'</span>'+
            '<span style="color:var(--text-muted);margin-left:0.6rem;font-size:0.88rem">vs '+g.opponent+'</span>'+
          '</div>'+
        '</div>'+
        '<div style="display:flex;align-items:center;gap:1rem">'+
          (scoreStr?'<span style="font-family:var(--font-display);font-weight:700;color:var(--text)">'+scoreStr+'</span>':'')+
          (hasBox?'<span style="color:var(--text-muted);font-size:0.8rem">box score &#9660;</span>':
                  '<span style="color:var(--text-muted);font-size:0.75rem;font-style:italic">no box score</span>')+
        '</div>'+
      '</div>'+
      (hasBox?'<div class="game-detail" style="display:none;margin-top:1rem">'+
        buildBoxTableWithPos(g.rows.slice().sort(function(a,b){return a.batting_order-b.batting_order;}),false)+
      '</div>':'')+
    '</div>';
  });
  document.getElementById('game-list').innerHTML=html||'<div class="empty-state">No games found</div>';
}

function toggleGameBox(el){
  var d=el.querySelector('.game-detail');
  if(d) d.style.display=d.style.display==='none'?'block':'none';
}

// ── RECORDS ───────────────────────────────────────────────────────────────
function showRecords() {
  document.getElementById('page-records').classList.add('active');
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
        MVP:s.MVP,RV:s.RV,pit_W:s.pit_W||0,pit_IP:s.pit_IP||0,
        RIP:s.pit_IP>0?s.pit_RA/s.pit_IP:null};
    });
  } else {
    var tots={};
    DATA.stats.forEach(function(s){
      if(!gok(s.player_id)) return;
      if(season!=='all'&&String(s.season_sort)!==season) return;
      if(!tots[s.player_id]) tots[s.player_id]={G:0,AB:0,H:0,HR:0,RBI:0,R:0,dbl:0,trp:0,BB:0,RV:0,pit_W:0,pit_IP:0,pit_RA:0,MVP_sum:0};
      var t=tots[s.player_id];
      t.G+=s.G||0;t.AB+=s.AB||0;t.H+=s.H||0;t.HR+=s.HR||0;t.RBI+=s.RBI||0;
      t.R+=s.R||0;t.dbl+=s.dbl||0;t.trp+=s.trp||0;t.BB+=s.BB||0;t.RV+=s.RV||0;
      t.pit_W+=s.pit_W||0;t.pit_IP+=s.pit_IP||0;t.pit_RA+=s.pit_RA||0;t.MVP_sum+=s.MVP||0;
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
          MVP:t.MVP_sum,RV:t.RV,pit_W:t.pit_W,pit_IP:t.pit_IP,
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
    {k:'dbl',label:'2B',fmt:function(v){return v==null?'&mdash;':v;}},
    {k:'trp',label:'3B',fmt:function(v){return v==null?'&mdash;':v;}},
    {k:'HR',label:'HR',fmt:function(v){return v==null?'&mdash;':v;}},
    {k:'BB',label:'BB',fmt:function(v){return v==null?'&mdash;':v;}},
    {k:'BA',label:'BA',fmt:fmtBA},
    {k:'OBP',label:'OBP',fmt:fmtBA},
    {k:'SLG',label:'SLG',fmt:fmtBA},
    {k:'OPS',label:'OPS',fmt:fmtBA},
    {k:'MVP',label:'MVP',fmt:function(v){return v!=null?Number(v).toFixed(1):'&mdash;';}},
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
}

// ── STANDINGS ─────────────────────────────────────────────────────────────
function showStandings(){
  document.getElementById('page-standings').classList.add('active');
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
document.addEventListener('scroll', function(e) {
  var el = e.target;
  if (el && el.classList && el.classList.contains('table-wrap')) {
    if (el.scrollLeft > 20) el.classList.add('scrolled-right');
    else el.classList.remove('scrolled-right');
  }
}, true);

// ── INIT ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async function(){
  await Promise.all([loadData(), loadSeasonRecords()]);
  navigate('home');
});
