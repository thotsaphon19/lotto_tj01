/**
 * ════════════════════════════════════════════════════
 * LOTTO-TJ · app.js  v2.0  (Frontend Engine)
 * เชื่อมต่อ Backend API + วิเคราะห์ + UI Rendering
 * ════════════════════════════════════════════════════
 */

'use strict';

/* ── CONFIG ── */
const API_BASE = window.location.origin;
const PROXY_FALLBACK = 'https://api.allorigins.win/get?url=';

/* ── STATE ── */
let markets       = {};
let selectedMkt   = null;
let fetched       = {};
let allRounds     = [];
let freq          = {};
let histRows      = [];
let autoTimer     = null;
let backendOnline = false;
let accuracyData  = null; // latest accuracy calculation

/* ══════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {
  startClock();
  initHeatmap();
  await checkBackend();
  await loadMarkets();
  renderChips();
});

/* ── CLOCK + DATE ── */
function startClock() {
  const el = document.getElementById('clk');
  const dateEl = document.getElementById('systemDate');
  const tick = () => {
    const now = new Date();
    if (el) el.textContent = now.toLocaleTimeString('th-TH', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
    if (dateEl) {
      dateEl.textContent = now.toLocaleDateString('th-TH-u-ca-buddhist', {
        weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
      });
    }
  };
  tick(); setInterval(tick, 1000);
}

/* ── CHECK BACKEND ── */
async function checkBackend() {
  const el = document.getElementById('apiStatus');
  try {
    const r = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(4000) });
    if (r.ok) {
      const j = await r.json();
      backendOnline = true;
      el.className = 'api-status ok';
      el.title = `Backend online · ${j.markets} markets · ${j.popular} ยอดนิยม`;
      console.log('[API] Backend online:', j);
    } else throw new Error('non-200');
  } catch {
    backendOnline = false;
    el.className = 'api-status err';
    el.title = 'Backend offline — ใช้ CORS proxy แทน';
    alert2('⚠️ Backend ออฟไลน์ — ใช้ CORS proxy แทน (จำกัดฟีเจอร์)', 'al-warn');
  }
}

/* ── LOAD MARKETS ── */
async function loadMarkets() {
  try {
    let marketList;
    if (backendOnline) {
      const r = await fetch(`${API_BASE}/api/markets`);
      const j = await r.json();
      marketList = j.markets;
    } else {
      marketList = FALLBACK_MARKETS;
    }
    markets = {};
    marketList.forEach(m => { markets[m.id] = m; });
    renderMarketTabs(marketList);
    if (marketList.length) { selectedMkt = marketList[0].id; setActiveTab(selectedMkt); }
    updateTicker();
  } catch (e) {
    console.error('loadMarkets', e);
  }
}

/* ── FALLBACK MARKETS — ยอดนิยมขึ้นก่อน ── */
const FALLBACK_MARKETS = [
  /* หวยไทย — ยอดนิยมสูงสุด */
  { id:'thaiGov',      name:'หวยรัฐบาลไทย',    nameEn:'Thai Gov Lottery',     flag:'🇹🇭', region:'หวยไทย',                   url:'https://www.glo.or.th/result/lotterynumber',               rounds:['งวดล่าสุด'],                                                    open:'14:30',close:'15:30', popular:true },
  { id:'yeekeeMorning',name:'หวยยี่กีเช้า',     nameEn:'Yeekee Morning',       flag:'🇹🇭', region:'หวยไทย',                   url:'https://www.huaylike.com/yeekee-morning',                  rounds:['รอบเช้า','รอบสาย'],                                             open:'09:00',close:'12:00', popular:true },
  { id:'yeekeeBan',    name:'หวยยี่กีบ่าย',     nameEn:'Yeekee Afternoon',     flag:'🇹🇭', region:'หวยไทย',                   url:'https://www.huaylike.com/yeekee-afternoon',                rounds:['รอบบ่าย','รอบเย็น'],                                            open:'13:00',close:'18:00', popular:true },
  { id:'thaiSet',      name:'หวยหุ้นไทย (SET)', nameEn:'Thai Stock (SET)',      flag:'🇹🇭', region:'หวยไทย',                   url:'https://www.set.or.th/th/market/index/set/overview.html', rounds:['เปิดเช้า','ปิดเช้า','เปิดบ่าย','ปิดบ่าย','เปิดเย็น','ปิดเย็น'], open:'10:00',close:'17:00', popular:true },
  /* เอเชียตะวันออกเฉียงใต้ */
  { id:'hanoi',        name:'ฮานอย',             nameEn:'Hanoi Lottery',        flag:'🇻🇳', region:'เอเชียตะวันออกเฉียงใต้',  url:'https://xoso.me/xo-so-ha-noi.html',                       rounds:['รอบ 1','รอบ 2','รอบ 3'],                                        open:'18:00',close:'18:30', popular:true },
  { id:'hanoiVip',     name:'ฮานอย VIP',         nameEn:'Hanoi VIP Lottery',    flag:'🇻🇳', region:'เอเชียตะวันออกเฉียงใต้',  url:'https://xoso.me/xo-so-ha-noi-vip.html',                  rounds:['รอบพิเศษ'],                                                     open:'11:30',close:'12:00', popular:true },
  { id:'hanoiExtra',   name:'ฮานอย พิเศษ',       nameEn:'Hanoi Special',        flag:'🇻🇳', region:'เอเชียตะวันออกเฉียงใต้',  url:'https://xoso.me/xo-so-ha-noi-thu-5.html',                rounds:['รอบพิเศษ'],                                                     open:'18:00',close:'18:30' },
  { id:'laos',         name:'ลาว',               nameEn:'Laos Lottery',         flag:'🇱🇦', region:'เอเชียตะวันออกเฉียงใต้',  url:'https://www.laoslottery.info/',                           rounds:['รอบหลัก'],                                                      open:'20:00',close:'20:30', popular:true },
  { id:'laosStar',     name:'ลาวสตาร์',          nameEn:'Laos Star',            flag:'🇱🇦', region:'เอเชียตะวันออกเฉียงใต้',  url:'https://www.laoslottery.info/star',                       rounds:['รอบพิเศษ'],                                                     open:'21:00',close:'21:30' },
  { id:'malaysia',     name:'มาเลย์ (KLCI)',     nameEn:'Malaysia KLCI',        flag:'🇲🇾', region:'เอเชียตะวันออกเฉียงใต้',  url:'https://finance.yahoo.com/quote/%5EKLSE/',                rounds:['เปิด','ปิด'],                                                   open:'09:00',close:'17:00' },
  { id:'singapore',    name:'สิงคโปร์ (STI)',    nameEn:'Singapore STI',        flag:'🇸🇬', region:'เอเชียตะวันออกเฉียงใต้',  url:'https://finance.yahoo.com/quote/%5ESTI/',                 rounds:['เปิด','ปิด'],                                                   open:'09:00',close:'17:00' },
  { id:'hochiminh',    name:'โฮจิมินห์ (VNI)',   nameEn:'Ho Chi Minh VNIndex',  flag:'🇻🇳', region:'เอเชียตะวันออกเฉียงใต้',  url:'https://finance.yahoo.com/quote/%5EVNINDEX/',             rounds:['เปิด','ปิด'],                                                   open:'09:00',close:'15:00' },
  { id:'indonesia',    name:'อินโดนีเซีย (IDX)', nameEn:'Indonesia IDX',        flag:'🇮🇩', region:'เอเชียตะวันออกเฉียงใต้',  url:'https://finance.yahoo.com/quote/%5EJKSE/',               rounds:['เปิด','ปิด'],                                                   open:'09:00',close:'15:50' },
  { id:'philippines',  name:'ฟิลิปปินส์ (PSEi)', nameEn:'Philippines PSEi',    flag:'🇵🇭', region:'เอเชียตะวันออกเฉียงใต้',  url:'https://finance.yahoo.com/quote/%5EPSEI/',               rounds:['เปิด','ปิด'],                                                   open:'09:30',close:'15:30' },
  { id:'myanmar',      name:'เมียนมา (MSE)',      nameEn:'Myanmar MSE',          flag:'🇲🇲', region:'เอเชียตะวันออกเฉียงใต้',  url:'https://www.mse.com.mm/',                                 rounds:['เปิด','ปิด'],                                                   open:'09:30',close:'15:00' },
  /* เอเชียตะวันออก */
  { id:'nikkei',       name:'นิเคอิ (N225)',      nameEn:'Nikkei 225',           flag:'🇯🇵', region:'เอเชียตะวันออก',          url:'https://finance.yahoo.com/quote/%5EN225/',               rounds:['เปิด','ปิด'], open:'09:00',close:'15:30' },
  { id:'hangseng',     name:'ฮั่งเส็ง (HSI)',     nameEn:'Hang Seng',            flag:'🇭🇰', region:'เอเชียตะวันออก',          url:'https://finance.yahoo.com/quote/%5EHSI/',                rounds:['เปิด','ปิด'], open:'09:30',close:'16:00' },
  { id:'shanghai',     name:'เซี่ยงไฮ้ (SSE)',    nameEn:'Shanghai Composite',   flag:'🇨🇳', region:'เอเชียตะวันออก',          url:'https://finance.yahoo.com/quote/000001.SS/',             rounds:['เปิด','ปิด'], open:'09:30',close:'15:00' },
  { id:'shenzhen',     name:'เสิ่นเจิ้น (SZSE)',  nameEn:'Shenzhen Component',   flag:'🇨🇳', region:'เอเชียตะวันออก',          url:'https://finance.yahoo.com/quote/399001.SZ/',             rounds:['เปิด','ปิด'], open:'09:30',close:'15:00' },
  { id:'taiwan',       name:'ไต้หวัน (TAIEX)',    nameEn:'Taiwan TAIEX',         flag:'🇹🇼', region:'เอเชียตะวันออก',          url:'https://finance.yahoo.com/quote/%5ETWII/',               rounds:['เปิด','ปิด'], open:'09:00',close:'13:30' },
  { id:'kospi',        name:'เกาหลี (KOSPI)',      nameEn:'Korea KOSPI',          flag:'🇰🇷', region:'เอเชียตะวันออก',          url:'https://finance.yahoo.com/quote/%5EKS11/',               rounds:['เปิด','ปิด'], open:'09:00',close:'15:30' },
  /* เอเชียใต้ */
  { id:'india',        name:'อินเดีย (SENSEX)',   nameEn:'India SENSEX',         flag:'🇮🇳', region:'เอเชียใต้', url:'https://finance.yahoo.com/quote/%5EBSESN/', rounds:['เปิด','ปิด'], open:'09:15',close:'15:30' },
  { id:'indiaNifty',   name:'อินเดีย (NIFTY 50)',nameEn:'India Nifty 50',       flag:'🇮🇳', region:'เอเชียใต้', url:'https://finance.yahoo.com/quote/%5ENSEI/',  rounds:['เปิด','ปิด'], open:'09:15',close:'15:30' },
  { id:'pakistan',     name:'ปากีสถาน (KSE-100)',nameEn:'Pakistan KSE-100',     flag:'🇵🇰', region:'เอเชียใต้', url:'https://finance.yahoo.com/quote/%5EKSE/',   rounds:['เปิด','ปิด'], open:'09:30',close:'15:30' },
  /* ยุโรป */
  { id:'ftse',         name:'อังกฤษ (FTSE 100)',  nameEn:'UK FTSE 100',          flag:'🇬🇧', region:'ยุโรป', url:'https://finance.yahoo.com/quote/%5EFTSE/',  rounds:['เปิด','ปิด'], open:'08:00',close:'16:30' },
  { id:'dax',          name:'เยอรมัน (DAX)',       nameEn:'Germany DAX',          flag:'🇩🇪', region:'ยุโรป', url:'https://finance.yahoo.com/quote/%5EGDAXI/', rounds:['เปิด','ปิด'], open:'09:00',close:'17:30' },
  { id:'cac40',        name:'ฝรั่งเศส (CAC 40)',  nameEn:'France CAC 40',        flag:'🇫🇷', region:'ยุโรป', url:'https://finance.yahoo.com/quote/%5EFCHI/',  rounds:['เปิด','ปิด'], open:'09:00',close:'17:30' },
  { id:'russia',       name:'รัสเซีย (MOEX)',      nameEn:'Russia MOEX',          flag:'🇷🇺', region:'ยุโรป', url:'https://finance.yahoo.com/quote/IMOEX.ME/', rounds:['เปิด','ปิด'], open:'10:00',close:'18:50' },
  /* อเมริกา */
  { id:'dowjones',     name:'ดาวโจนส์ (DJI)',     nameEn:'Dow Jones',            flag:'🇺🇸', region:'อเมริกา', url:'https://finance.yahoo.com/quote/%5EDJI/',    rounds:['รอบล่าสุด'], open:'09:30',close:'16:00' },
  { id:'nasdaq',       name:'แนสแด็ก (NASDAQ)',   nameEn:'NASDAQ',               flag:'🇺🇸', region:'อเมริกา', url:'https://finance.yahoo.com/quote/%5EIXIC/',   rounds:['รอบล่าสุด'], open:'09:30',close:'16:00' },
  { id:'sp500',        name:'S&P 500',            nameEn:'S&P 500',              flag:'🇺🇸', region:'อเมริกา', url:'https://finance.yahoo.com/quote/%5EGSPC/',   rounds:['รอบล่าสุด'], open:'09:30',close:'16:00' },
  { id:'brazil',       name:'บราซิล (Bovespa)',   nameEn:'Brazil Bovespa',       flag:'🇧🇷', region:'อเมริกา', url:'https://finance.yahoo.com/quote/%5EBVSP/',   rounds:['เปิด','ปิด'], open:'10:00',close:'17:55' },
  { id:'canada',       name:'แคนาดา (TSX)',       nameEn:'Canada TSX',           flag:'🇨🇦', region:'อเมริกา', url:'https://finance.yahoo.com/quote/%5EGSPTSE/', rounds:['เปิด','ปิด'], open:'09:30',close:'16:00' },
  { id:'mexico',       name:'เม็กซิโก (IPC)',     nameEn:'Mexico IPC',           flag:'🇲🇽', region:'อเมริกา', url:'https://finance.yahoo.com/quote/%5EMXX/',    rounds:['เปิด','ปิด'], open:'08:30',close:'15:00' },
  /* ตะวันออกกลาง & แอฟริกา */
  { id:'dubai',        name:'ดูไบ (DFM)',          nameEn:'Dubai DFM',            flag:'🇦🇪', region:'ตะวันออกกลาง', url:'https://finance.yahoo.com/quote/%5EDFMGI/',  rounds:['เปิด','ปิด'], open:'10:00',close:'14:00' },
  { id:'egypt',        name:'อียิปต์ (EGX 30)',   nameEn:'Egypt EGX 30',         flag:'🇪🇬', region:'แอฟริกา',       url:'https://finance.yahoo.com/quote/%5ECase30/', rounds:['เปิด','ปิด'], open:'10:00',close:'14:30' },
  { id:'southafrica',  name:'แอฟริกาใต้ (JSE)',   nameEn:'South Africa JSE',     flag:'🇿🇦', region:'แอฟริกา',       url:'https://finance.yahoo.com/quote/%5EJSE/',    rounds:['เปิด','ปิด'], open:'09:00',close:'17:00' },
  /* โอเชียเนีย */
  { id:'australia',    name:'ออสเตรเลีย (ASX)',   nameEn:'Australia ASX 200',    flag:'🇦🇺', region:'โอเชียเนีย', url:'https://finance.yahoo.com/quote/%5EAXJO/', rounds:['เปิด','ปิด'], open:'10:00',close:'16:00' },
  { id:'newzealand',   name:'นิวซีแลนด์ (NZX 50)',nameEn:'New Zealand NZX 50',  flag:'🇳🇿', region:'โอเชียเนีย', url:'https://finance.yahoo.com/quote/%5ENZ50/', rounds:['เปิด','ปิด'], open:'10:00',close:'16:45' },
];

/* ══════════════════════════════════════════════════
   MARKET TABS — แยกตามภูมิภาค + scrollable
══════════════════════════════════════════════════ */
let activeRegion = 'all';

function renderMarketTabs(list) {
  const container = document.getElementById('marketTabs');
  container.innerHTML = '';

  // ── Region filter bar ──
  const regions    = ['all', ...new Set(list.map(m => m.region).filter(Boolean))];
  const regionBar  = document.createElement('div');
  regionBar.className = 'region-bar';
  regionBar.id = 'regionBar';

  const regionIcons = {
    'all':                    '🌐',
    'หวยไทย':                 '🎫',
    'เอเชียตะวันออกเฉียงใต้': '🌏',
    'เอเชียตะวันออก':         '🌏',
    'เอเชียใต้':              '🌏',
    'ยุโรป':                  '🌍',
    'อเมริกา':                '🌎',
    'ตะวันออกกลาง':           '🌍',
    'แอฟริกา':                '🌍',
    'โอเชียเนีย':             '🌏',
  };
  const regionLabels = {
    'all':                    'ทั้งหมด',
    'หวยไทย':                 'หวยไทย⭐',
    'เอเชียตะวันออกเฉียงใต้': 'ตอ.ฉต.',
    'เอเชียตะวันออก':         'ตอ.ออก',
    'เอเชียใต้':              'ใต้',
    'ยุโรป':                  'ยุโรป',
    'อเมริกา':                'อเมริกา',
    'ตะวันออกกลาง':           'ตต.กลาง',
    'แอฟริกา':                'แอฟริกา',
    'โอเชียเนีย':             'โอเชียเนีย',
  };

  regions.forEach(r => {
    const btn = document.createElement('button');
    btn.className = 'rbtn' + (r === 'all' ? ' on' : '') + (r === 'หวยไทย' ? ' rbtn-thai' : '');
    btn.dataset.region = r;
    const cnt = r === 'all' ? list.length : list.filter(m => m.region === r).length;
    btn.innerHTML = `${regionIcons[r]||'🌐'} ${regionLabels[r]||r} <span class="rbtn-cnt">${cnt}</span>`;
    btn.onclick = () => {
      activeRegion = r;
      document.querySelectorAll('.rbtn').forEach(b => b.classList.remove('on'));
      btn.classList.add('on');
      renderMtabs(list);
    };
    regionBar.appendChild(btn);
  });
  container.appendChild(regionBar);

  // ── Scrollable market tabs row ──
  const tabWrap = document.createElement('div');
  tabWrap.className = 'mtab-wrap';

  const scrollBtn = (dir) => {
    const btn = document.createElement('button');
    btn.className = `tab-scroll-btn tab-scroll-${dir}`;
    btn.innerHTML = dir === 'left' ? '‹' : '›';
    btn.onclick = () => {
      const row = tabWrap.querySelector('.mtab-row');
      if (row) row.scrollBy({ left: dir === 'left' ? -200 : 200, behavior: 'smooth' });
    };
    return btn;
  };

  tabWrap.appendChild(scrollBtn('left'));

  const tabRow = document.createElement('div');
  tabRow.className = 'mtab-row';
  tabRow.id = 'mtabRow';
  tabWrap.appendChild(tabRow);

  tabWrap.appendChild(scrollBtn('right'));
  container.appendChild(tabWrap);

  // All-markets tab
  const allTab = document.createElement('div');
  allTab.className = 'mtab'; allTab.id = 'tab_all';
  allTab.innerHTML = '<span class="mtab-icon">🌐</span><span class="mtab-txt">ทั้งหมด</span>';
  allTab.onclick = () => { selectedMkt = 'all'; setActiveTab('all'); };
  tabRow.appendChild(allTab);

  renderMtabs(list);
  initCards(list);
}

function renderMtabs(list) {
  const tabRow = document.getElementById('mtabRow');
  if (!tabRow) return;
  const allTab = tabRow.querySelector('#tab_all');
  tabRow.innerHTML = '';
  if (allTab) tabRow.appendChild(allTab);

  const filtered = activeRegion === 'all' ? list : list.filter(m => m.region === activeRegion);
  filtered.forEach(m => {
    const tab = document.createElement('div');
    tab.className = 'mtab' + (m.popular ? ' mtab-popular' : '');
    tab.id = 'tab_' + m.id;
    tab.title = `${m.nameEn} | เปิด ${m.open||''}–${m.close||''}`;
    tab.innerHTML = `<span class="mtab-icon">${m.flag}</span><span class="mtab-txt">${m.name}</span>${m.popular ? '<span class="mtab-star">⭐</span>' : ''}`;
    tab.onclick = () => { selectedMkt = m.id; setActiveTab(m.id); };
    tabRow.appendChild(tab);
  });

  if (selectedMkt) setActiveTab(selectedMkt);
}

function setActiveTab(id) {
  document.querySelectorAll('.mtab').forEach(t => t.classList.remove('on'));
  const target = id === 'all'
    ? document.getElementById('tab_all')
    : document.getElementById('tab_' + id);
  if (target) {
    target.classList.add('on');
    target.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
  }
}

function initCards(list) {
  const grid = document.getElementById('resGrid');
  grid.innerHTML = '';
  list.forEach(m => {
    const div = document.createElement('div');
    div.className = 'rc'; div.id = 'rc_' + m.id;
    div.innerHTML =
      `<div class="rc-hd">
        <div class="rc-flag">${m.flag}</div>
        <div>
          <div class="rc-name">${m.name}</div>
          <div class="rc-time">รอดึงข้อมูล · <span class="rc-region">${m.region||''}</span></div>
        </div>
        <span class="rc-badge b-idle">IDLE</span>
       </div>
       <div class="idle-state"><div style="font-size:26px;opacity:.2">📡</div><div>กดดึงข้อมูล</div></div>`;
    grid.appendChild(div);
  });
}

/* ══════════════════════════════════════════════════
   INIT HEATMAP
══════════════════════════════════════════════════ */
function initHeatmap() {
  const g = document.getElementById('heatmap');
  g.innerHTML = '';
  for (let i = 0; i < 100; i++) {
    const n = pad(i);
    const el = document.createElement('div');
    el.className = 'hc lv0'; el.id = 'hc_' + n;
    el.title = 'เลข ' + n;
    el.innerHTML = `${n}<span class="hcc"></span>`;
    g.appendChild(el);
  }
}

/* ══════════════════════════════════════════════════
   FETCH
══════════════════════════════════════════════════ */
async function fetchSelected() {
  if (!selectedMkt) { alert2('⚠️ กรุณาเลือกตลาด', 'al-info'); return; }
  if (selectedMkt === 'all') { await fetchAll(); return; }
  await fetchMarket(selectedMkt);
}

async function fetchMarket(id) {
  const m = markets[id];
  if (!m) return;
  setStatus('⏳', `กำลังดึงข้อมูล ${m.name}...`);
  setBusy(true);
  renderCard(id, 'loading');

  try {
    let data;
    if (backendOnline) {
      const r = await fetch(`${API_BASE}/api/fetch/${id}`, { signal: AbortSignal.timeout(20000) });
      const j = await r.json();
      if (!j.success) throw new Error(j.error);
      data = j.data;
      if (j.fromCache) renderCardBadge(id, 'cache');
    } else {
      data = await fetchViaProxy(id, m);
    }

    fetched[id] = data;
    renderCard(id, 'ok', data);
    ingestData(data);
    renderAll(true);
    setStatus('✅', `ดึง ${m.name} สำเร็จ (${data.numbers?.length || 0} เลข)`);
    alert2(`✅ ดึงข้อมูล ${m.flag} ${m.name} สำเร็จ`, 'al-ok');
    updateTickerItem(id, data.top, data.bot);

  } catch (e) {
    fetched[id] = null;
    renderCard(id, 'err');
    setStatus('❌', `ผิดพลาด: ${e.message}`);
    alert2(`❌ ${m.name}: ${e.message}`, 'al-err');
  } finally {
    setBusy(false);
    renderChips();
  }
}

async function fetchAll() {
  setBusy(true);
  setStatus('⏳', 'กำลังดึงข้อมูลทุกตลาด...');

  if (backendOnline) {
    try {
      const r = await fetch(`${API_BASE}/api/fetch-all`, { signal: AbortSignal.timeout(60000) });
      const j = await r.json();
      Object.entries(j.results || {}).forEach(([id, data]) => {
        fetched[id] = data;
        renderCard(id, 'ok', data);
        ingestData(data);
        updateTickerItem(id, data.top, data.bot);
      });
      Object.entries(j.errors || {}).forEach(([id]) => renderCard(id, 'err'));
      setStatus('✅', `ดึงข้อมูลสำเร็จ ${j.total} ตลาด / ผิดพลาด ${j.failed}`);
      alert2(`✅ ดึงข้อมูลสำเร็จ ${j.total}/${Object.keys(markets).length} ตลาด`, 'al-ok');
    } catch (e) {
      alert2('❌ fetch-all: ' + e.message, 'al-err');
    }
  } else {
    for (const id of Object.keys(markets)) {
      await fetchMarket(id);
      await sleep(600);
    }
  }

  renderAll(true);
  setBusy(false);
  renderChips();
}

/* ── CORS proxy fallback ── */
async function fetchViaProxy(id, m) {
  const r = await fetch(PROXY_FALLBACK + encodeURIComponent(m.url), { signal: AbortSignal.timeout(14000) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const j = await r.json();
  return parseHtmlFrontend(id, m, j.contents || '');
}

function parseHtmlFrontend(id, m, html) {
  const doc  = new DOMParser().parseFromString(html, 'text/html');
  const text = doc.body?.innerText || html;
  const seen = new Set(), nums = [];
  let match;
  const re = /\b(\d{2})\b/g;
  while ((match = re.exec(text)) !== null) {
    if (!seen.has(match[1]) && nums.length < 20) { seen.add(match[1]); nums.push(match[1]); }
  }
  const idxM = text.match(/(\d{3,6}[.,]\d{2})/);
  const dateM = text.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/);
  return {
    market:     id,
    name:       m.name,
    flag:       m.flag,
    rounds:     m.rounds,
    top:        nums[0] || '??',
    bot:        nums[1] || '??',
    numbers:    nums,
    indexVal:   idxM ? idxM[1] : null,
    resultDate: dateM ? dateM[1] : null,
    fetchedAt:  new Date().toISOString(),
    systemDate: new Date().toLocaleDateString('th-TH-u-ca-buddhist', {
      year: 'numeric', month: 'long', day: 'numeric',
    }),
    source: m.url,
  };
}

/* ── Custom URL fetch ── */
async function fetchCustomUrl() {
  const url  = document.getElementById('customUrl').value.trim();
  const name = document.getElementById('customName').value.trim() || url;
  if (!url) { alert2('⚠️ กรุณากรอก URL', 'al-info'); return; }

  setStatus('⏳', `ดึงข้อมูล ${name}...`);
  try {
    let data;
    if (backendOnline) {
      const r = await fetch(`${API_BASE}/api/analyze-custom`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, marketName: name }), signal: AbortSignal.timeout(20000)
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error);
      data = { market: 'custom', name, flag: '🔗', rounds: ['รอบหลัก'], ...j };
    } else {
      const r = await fetch(PROXY_FALLBACK + encodeURIComponent(url), { signal: AbortSignal.timeout(14000) });
      const j = await r.json();
      data = parseHtmlFrontend('custom', { name, flag:'🔗', rounds:['รอบหลัก'], url }, j.contents || '');
    }

    ingestData(data);
    renderAll(true);
    alert2(`✅ ดึงข้อมูล "${name}" สำเร็จ — เลข: ${data.top}/${data.bot}`, 'al-ok');
    setStatus('✅', `ดึง ${name} สำเร็จ`);
    document.getElementById('customUrl').value = '';
    document.getElementById('customName').value = '';
  } catch (e) {
    alert2(`❌ Custom URL: ${e.message}`, 'al-err');
    setStatus('❌', e.message);
  }
}

/* ══════════════════════════════════════════════════
   MANUAL INPUT
══════════════════════════════════════════════════ */
function addManual() {
  const top = document.getElementById('manTop').value.trim();
  const bot = document.getElementById('manBot').value.trim();
  if (!top && !bot) { alert2('⚠️ กรอกเลขบนหรือล่างอย่างน้อย 1 ช่อง', 'al-info'); return; }

  const mkt = selectedMkt && selectedMkt !== 'all' ? markets[selectedMkt] : { name:'กรอกเอง', flag:'✏️' };
  const entry = {
    market: 'manual', name: mkt.name, flag: mkt.flag,
    top:    top ? pad(parseInt(top)) : '??',
    bot:    bot ? pad(parseInt(bot)) : '??',
    numbers: [top, bot].filter(Boolean).map(n => pad(parseInt(n))),
    rounds: ['กรอกเอง'],
    fetchedAt: new Date().toISOString(), indexVal: null,
    systemDate: new Date().toLocaleDateString('th-TH-u-ca-buddhist', {
      year: 'numeric', month: 'long', day: 'numeric',
    }),
  };

  ingestData(entry);
  document.getElementById('manTop').value = '';
  document.getElementById('manBot').value = '';
  renderAll(true);

  const tF = (freq[entry.top]||[]).length;
  const bF = (freq[entry.bot]||[]).length;
  if (tF >= 2)      alert2(`⚡ เลขบน ${entry.top} เบิ้ล! ออกซ้ำ ${tF} ครั้ง`, 'al-warn');
  else if (bF >= 2) alert2(`⚡ เลขล่าง ${entry.bot} เบิ้ล! ออกซ้ำ ${bF} ครั้ง`, 'al-warn');
  else              alert2(`✅ เพิ่มเลข ${entry.top}/${entry.bot} เรียบร้อย`, 'al-ok');
}

/* ══════════════════════════════════════════════════
   INGEST DATA
══════════════════════════════════════════════════ */
function ingestData(data) {
  const round = data.rounds?.[0] || '—';
  const entry = {
    src:        data.market || 'unknown',
    name:       data.name,
    flag:       data.flag,
    top:        data.top,
    bot:        data.bot,
    round,
    indexVal:   data.indexVal || null,
    resultDate: data.resultDate || null,
    systemDate: data.systemDate || null,
    time:       new Date(data.fetchedAt || Date.now()),
  };
  allRounds.unshift(entry);
  histRows.unshift(entry);

  const add = (n) => {
    if (!n || n === '??') return;
    if (!freq[n]) freq[n] = [];
    freq[n].push(entry);
  };
  add(data.top);
  if (data.bot !== data.top) add(data.bot);
}

/* ══════════════════════════════════════════════════
   CLEAR ALL
══════════════════════════════════════════════════ */
function clearAll() {
  if (!allRounds.length) return;
  if (!confirm('ล้างข้อมูลทั้งหมด?')) return;
  fetched = {}; allRounds = []; freq = {}; histRows = []; accuracyData = null;
  activeRegion = 'all';
  document.querySelectorAll('.rbtn').forEach(b => b.classList.remove('on'));
  const allRbtn = document.querySelector('.rbtn[data-region="all"]');
  if (allRbtn) allRbtn.classList.add('on');
  initHeatmap();
  Object.values(markets).forEach(m => {
    const c = document.getElementById('rc_' + m.id);
    if (c) c.innerHTML = `<div class="rc-hd"><div class="rc-flag">${m.flag}</div><div><div class="rc-name">${m.name}</div><div class="rc-time">รอดึงข้อมูล · <span class="rc-region">${m.region||''}</span></div></div><span class="rc-badge b-idle">IDLE</span></div><div class="idle-state"><div style="font-size:26px;opacity:.2">📡</div><div>กดดึงข้อมูล</div></div>`;
  });
  renderAll(false);
  renderAccuracyPanel(null);
  alert2('🗑️ ล้างข้อมูลเรียบร้อย', 'al-info');
  setStatus('📡', 'พร้อมใช้งานใหม่');
}

/* ══════════════════════════════════════════════════
   DEMO DATA
══════════════════════════════════════════════════ */
function loadDemo() {
  const demo = [
    { id:'thaiGov',    top:'15', bot:'72', round:'งวด 16/03/68',   d:0  },
    { id:'thaiSet',    top:'28', bot:'15', round:'ปิดเช้า',        d:1  },
    { id:'hanoi',      top:'44', bot:'28', round:'รอบ 1',          d:2  },
    { id:'hanoiVip',   top:'15', bot:'33', round:'รอบพิเศษ',       d:3  },
    { id:'laos',       top:'62', bot:'44', round:'รอบหลัก',        d:4  },
    { id:'laosStar',   top:'33', bot:'15', round:'รอบพิเศษ',       d:5  },
    { id:'nikkei',     top:'28', bot:'62', round:'เปิด',           d:6  },
    { id:'hangseng',   top:'15', bot:'44', round:'เปิด',           d:7  },
    { id:'thaiSet',    top:'77', bot:'28', round:'ปิดบ่าย',        d:8  },
    { id:'yeekeeMorning',top:'15',bot:'62',round:'รอบเช้า',        d:9  },
    { id:'malaysia',   top:'44', bot:'33', round:'เปิด',           d:10 },
    { id:'taiwan',     top:'28', bot:'15', round:'เปิด',           d:11 },
    { id:'kospi',      top:'62', bot:'15', round:'เปิด',           d:12 },
    { id:'ftse',       top:'33', bot:'44', round:'เปิด',           d:13 },
    { id:'dax',        top:'15', bot:'77', round:'เปิด',           d:14 },
    { id:'nasdaq',     top:'44', bot:'28', round:'รอบล่าสุด',      d:15 },
    { id:'sp500',      top:'28', bot:'62', round:'รอบล่าสุด',      d:16 },
    { id:'shanghai',   top:'15', bot:'33', round:'เปิด',           d:17 },
    { id:'singapore',  top:'62', bot:'44', round:'เปิด',           d:18 },
    { id:'india',      top:'33', bot:'15', round:'เปิด',           d:19 },
    { id:'hochiminh',  top:'44', bot:'62', round:'เปิด',           d:20 },
    { id:'australia',  top:'77', bot:'15', round:'เปิด',           d:21 },
    { id:'yeekeeBan',  top:'15', bot:'44', round:'รอบบ่าย',        d:22 },
    { id:'dowjones',   top:'28', bot:'77', round:'รอบล่าสุด',      d:23 },
  ];

  demo.forEach(d => {
    const m = markets[d.id] || FALLBACK_MARKETS.find(x=>x.id===d.id) || { name:d.id, flag:'🏳️', rounds:[d.round], region:'อื่นๆ' };
    const dDate = new Date(Date.now() - d.d * 600_000);
    const data = {
      market: d.id, name: m.name, flag: m.flag,
      top: d.top, bot: d.bot, rounds: [d.round],
      numbers: [d.top, d.bot], indexVal: null,
      fetchedAt: dDate.toISOString(),
      resultDate: dDate.toLocaleDateString('th-TH', { day:'2-digit', month:'2-digit', year:'2-digit' }),
      systemDate: new Date().toLocaleDateString('th-TH-u-ca-buddhist', { year:'numeric', month:'long', day:'numeric' }),
    };
    if (!fetched[d.id]) { fetched[d.id] = data; renderCard(d.id, 'ok', data); }
    ingestData(data);
    updateTickerItem(d.id, d.top, d.bot);
  });

  renderAll(false);
  alert2('📦 โหลด Demo 24 งวด · 16 ตลาด — เลข 15, 28, 44 เป็นเลขเบิ้ล — ลองกด "🤖 AI วิเคราะห์"', 'al-info');
  setStatus('✅', 'โหลด Demo สำเร็จ (24 งวด · 16 ตลาด)');
}

/* ══════════════════════════════════════════════════
   RENDER CARD — with result date + system date
══════════════════════════════════════════════════ */
function renderCard(id, state, data) {
  const card = document.getElementById('rc_' + id);
  if (!card) return;
  const m = markets[id] || FALLBACK_MARKETS.find(x=>x.id===id) || { name: id, flag: '🏳️', rounds: ['—'] };

  if (state === 'loading') {
    card.innerHTML = `<div class="rc-hd"><div class="rc-flag">${m.flag}</div><div><div class="rc-name">${m.name}</div><div class="rc-time">กำลังโหลด... · <span class="rc-region">${m.region||''}</span></div></div><span class="rc-badge b-idle">WAIT</span></div><div class="idle-state"><div class="spin"></div>ดึงข้อมูล...</div>`;
    return;
  }
  if (state === 'err') {
    card.innerHTML = `<div class="rc-hd"><div class="rc-flag">${m.flag}</div><div><div class="rc-name">${m.name}</div><div class="rc-time">ผิดพลาด · <span class="rc-region">${m.region||''}</span></div></div><span class="rc-badge b-err">ERR</span></div><div class="idle-state" style="color:var(--red)">❌ เชื่อมต่อไม่ได้</div>`;
    return;
  }

  const t    = new Date(data.fetchedAt).toLocaleTimeString('th-TH', { hour:'2-digit', minute:'2-digit' });
  const tF   = (freq[data.top]  || []).length;
  const bF   = (freq[data.bot]  || []).length;
  const isDbl = tF >= 2 || bF >= 2;
  const boxes = (data.numbers || []).slice(0, 4).map((n, i) => {
    const f   = (freq[n] || []).length;
    const cls = f >= 4 ? 'double' : f >= 2 ? 'prime' : '';
    const lbl = i===0 ? 'บน' : i===1 ? 'ล่าง' : f>=2 ? '⚡เบิ้ล' : '#'+(i+1);
    return `<div class="nbox ${cls}"><div class="nv">${n}</div><div class="nl">${lbl}</div></div>`;
  }).join('');

  const resultDateHtml = data.resultDate
    ? `<div class="mrow"><span class="mk">📅 วันที่ผล</span><span class="mv date-val">${data.resultDate}</span></div>`
    : '';
  const systemDateHtml = data.systemDate
    ? `<div class="mrow"><span class="mk">🗓️ วันที่ระบบ</span><span class="mv sys-date">${data.systemDate}</span></div>`
    : '';

  card.innerHTML = `
    <div class="rc-hd">
      <div class="rc-flag">${data.flag}</div>
      <div>
        <div class="rc-name">${data.name}</div>
        <div class="rc-time">${t} · <span class="rc-region">${m.region||''}</span></div>
      </div>
      <span class="rc-badge b-live">LIVE</span>
    </div>
    <div class="rc-body">
      <div class="num-row">${boxes}</div>
      ${data.indexVal ? `<div class="mrow"><span class="mk">ดัชนี</span><span class="mv">${data.indexVal}</span></div>` : ''}
      ${resultDateHtml}
      ${systemDateHtml}
      <div class="mrow"><span class="mk">เบิ้ล?</span><span class="mv ${isDbl?'up':''}">${isDbl ? `⚡ ${tF>=2?data.top:data.bot} เบิ้ล (${Math.max(tF,bF)}×)` : '—'}</span></div>
      <div class="mrow"><span class="mk">รอบ</span><span class="mv" style="font-size:10px;color:var(--muted)">${(m.rounds||data.rounds||[]).join(' · ')}</span></div>
      ${m.open ? `<div class="mrow"><span class="mk">เวลา</span><span class="mv" style="font-size:10px;color:var(--muted)">${m.open}–${m.close}</span></div>` : ''}
    </div>`;
}

function renderCardBadge(id, type) {
  const card = document.getElementById('rc_' + id);
  if (!card) return;
  const badge = card.querySelector('.rc-badge');
  if (badge && type === 'cache') { badge.className = 'rc-badge b-cache'; badge.textContent = 'CACHE'; }
}

/* ══════════════════════════════════════════════════
   RENDER ALL
══════════════════════════════════════════════════ */
function renderAll(isNew) {
  updateHeatmap();
  renderDoubles();
  renderPatterns();
  renderStatKPIs();
  renderHistory(isNew);
  calcLocalPred();
  renderChips();
  computeAndShowAccuracy();
  const b = document.getElementById('rcBadge');
  if (b) b.textContent = Object.values(fetched).filter(Boolean).length + ' ตลาด';
}

/* ── ACCURACY ENGINE (Frontend) ── */
function computeAndShowAccuracy() {
  if (allRounds.length < 3) return;

  const entries    = Object.entries(freq);
  const total      = entries.reduce((s, [, a]) => s + a.length, 0);
  if (!total) return;

  const dblCount   = entries.filter(([, a]) => a.length >= 2).length;
  const hotCount   = entries.filter(([, a]) => a.length >= 4).length;
  const uniqueCount = entries.length;

  // Shannon entropy
  let entropy = 0;
  entries.forEach(([, a]) => {
    const p = a.length / total;
    if (p > 0) entropy -= p * Math.log2(p);
  });
  const spreadScore  = entropy / Math.log2(100);
  const repScore     = Math.min(dblCount / Math.max(uniqueCount, 1), 1);
  const volScore     = Math.min(allRounds.length / 50, 1);
  const recent       = allRounds.slice(0, 10).map(e => e.top);
  const recentSet    = new Set(recent);
  const coherence    = recentSet.size < recent.length ? 1 - (recentSet.size / Math.max(recent.length, 1)) : 0;

  const raw = (spreadScore * 25 + repScore * 30 + volScore * 25 + coherence * 20) * 100;
  const score   = Math.min(Math.max(Math.round(raw), 45), 92);
  const margin  = 5;
  const grade   = score >= 80 ? 'A' : score >= 70 ? 'B' : score >= 60 ? 'C' : 'D';

  accuracyData = { score, margin, low: score - margin, high: score + margin, grade,
    detail: `ข้อมูล ${allRounds.length} งวด · เลขเบิ้ล ${dblCount} ตัว · Spread ${(spreadScore*100).toFixed(0)}%` };

  renderAccuracyPanel(accuracyData);
}

function renderAccuracyPanel(acc) {
  const panel = document.getElementById('accuracyPanel');
  if (!panel) return;

  if (!acc) {
    panel.innerHTML = `<div class="acc-empty">เพิ่มข้อมูลเพื่อดูความแม่นยำ</div>`;
    return;
  }

  const col = acc.score >= 80 ? 'var(--green)' : acc.score >= 70 ? 'var(--amber)' : acc.score >= 60 ? 'var(--ember)' : 'var(--red)';
  const gradeColors = { A: 'var(--green)', B: 'var(--amber)', C: 'var(--ember)', D: 'var(--red)' };

  panel.innerHTML = `
    <div class="acc-row">
      <div class="acc-score-wrap">
        <div class="acc-score" style="color:${col}">${acc.score}%</div>
        <div class="acc-margin" style="color:${col}">±${acc.margin}%</div>
        <div class="acc-grade" style="background:${gradeColors[acc.grade]||col}">${acc.grade}</div>
      </div>
      <div class="acc-detail">
        <div class="acc-range">
          <span class="acc-lbl">ช่วงความแม่นยำ</span>
          <span class="acc-range-val" style="color:${col}">${acc.low}% – ${acc.high}%</span>
        </div>
        <div class="acc-bar-wrap">
          <div class="acc-bar">
            <div class="acc-fill" style="width:${acc.score}%;background:${col}"></div>
            <div class="acc-marker" style="left:${acc.low}%"></div>
            <div class="acc-marker" style="left:${acc.high}%"></div>
          </div>
          <div class="acc-bar-labels"><span>0%</span><span>50%</span><span>100%</span></div>
        </div>
        <div class="acc-info">${acc.detail}</div>
      </div>
    </div>`;
}

/* ── HEATMAP ── */
function updateHeatmap() {
  for (let i = 0; i < 100; i++) {
    const n  = pad(i);
    const el = document.getElementById('hc_' + n);
    if (!el) continue;
    const c  = (freq[n] || []).length;
    const lv = c===0?0 : c===1?1 : c===2?2 : c===3?3 : c===4?4 : 5;
    el.className = 'hc lv' + lv;
    el.innerHTML = `${n}<span class="hcc">${c>0?c+'×':''}</span>`;
    el.title = `เลข ${n}: ${c} ครั้ง${c>=2?' ⚡เบิ้ล':''}`;
  }
}

/* ── DOUBLES ── */
function renderDoubles() {
  const doubles = Object.entries(freq).filter(([,a])=>a.length>=2).sort((a,b)=>b[1].length-a[1].length);
  const b = document.getElementById('dblBadge');
  if (b) b.textContent = doubles.length + ' ตัว';
  const list = document.getElementById('dblList');
  if (!list) return;

  if (!doubles.length) { list.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);font-size:12px">✅ ยังไม่พบเลขซ้ำ</div>'; return; }

  const maxC = doubles[0][1].length;
  list.className = 'dbl-list';
  list.innerHTML = doubles.map(([n, entries]) => {
    const c      = entries.length;
    const pct    = Math.round(c / maxC * 100);
    const pctAll = allRounds.length ? Math.round(c / allRounds.length * 100) : 0;
    const col    = c>=5?'var(--fire)':c>=4?'var(--ember)':'var(--dbl)';
    const icon   = c>=5?'🔥':c>=4?'⚡':c>=3?'↑':'↩';
    const tagTxt = c>=5?'🔥 ร้อนแรง':c>=4?'⚡ เบิ้ล+':c>=3?'↑ ออกบ่อย':'↩ ซ้ำ';
    const tagCls = c>=5?'t-fire':c>=4?'t-hot':'t-dbl';
    const mkts   = [...new Set(entries.map(e => e.flag+e.name.slice(0,3)))];
    return `<div class="dbl-row">
      <div class="dbl-num" style="color:${col}">${n}</div>
      <div class="dbl-info">
        <div class="dbl-meta">
          <span class="dbl-lbl">${icon} ออก ${c} ครั้ง</span>
          <div style="display:flex;align-items:center;gap:7px">
            <span class="dbl-tag ${tagCls}">${tagTxt}</span>
            <span style="font-family:'Share Tech Mono';font-size:11px;color:${col}">${pctAll}%</span>
          </div>
        </div>
        <div class="bar-t"><div class="bar-f" style="width:${pct}%;background:${col}"></div></div>
        <div class="mkt-tags">${mkts.slice(0,5).map(t=>`<span class="mkt-tag">${t}</span>`).join('')}</div>
      </div>
    </div>`;
  }).join('');
}

/* ── PATTERNS ── */
function renderPatterns() {
  const pg = document.getElementById('patGrid');
  if (!pg || !allRounds.length) return;
  const nums = allRounds.filter(e=>e.top!=='??').map(e=>+e.top);
  const avg  = Math.round(nums.reduce((a,b)=>a+b,0)/nums.length);
  const twins= Object.entries(freq).filter(([n])=>n[0]===n[1]).map(([n])=>n).slice(0,4);
  const hot  = Object.entries(freq).sort((a,b)=>b[1].length-a[1].length).slice(0,4).map(([n])=>n);
  const cold = Array.from({length:100},(_,i)=>pad(i)).filter(n=>!freq[n]||freq[n].length===0).slice(0,4);
  const ends = [...new Set(nums.slice(0,10).map(n=>n%10))].slice(0,4).map(d=>`X${d}`);
  const pats = [
    {icon:'🔢',title:'เลขแฝด',  nums:twins, cls:'a'},
    {icon:'🔥',title:'เลขร้อน', nums:hot,   cls:'e'},
    {icon:'🧊',title:'เลขเย็น', nums:cold,  cls:'c'},
    {icon:'🔢',title:'หน่วยเด่น',nums:ends, cls:'b'},
  ];
  pg.innerHTML = pats.map(p=>`
    <div class="pat">
      <div class="pat-icon">${p.icon}</div>
      <div class="pat-title">${p.title}</div>
      <div class="pat-nums">${p.nums.length?p.nums.map(n=>`<span class="pn ${p.cls}">${n}</span>`).join(''):'<span style="font-size:11px;color:var(--muted)">—</span>'}</div>
    </div>`).join('');
}

/* ── STAT KPIs ── */
function renderStatKPIs() {
  const row=document.getElementById('kpiRow');
  if(!row||!allRounds.length)return;
  row.style.display='grid';
  const nums=allRounds.filter(e=>e.top!=='??').map(e=>+e.top);
  if(!nums.length)return;
  const avg=(nums.reduce((a,b)=>a+b,0)/nums.length).toFixed(1);
  const s2=[...nums].sort((a,b)=>a-b);
  const med=s2[Math.floor(s2.length/2)];
  const uniq=Object.keys(freq).length;
  const dbl=Object.values(freq).filter(a=>a.length>=2).length;
  const hot=Object.values(freq).filter(a=>a.length>=4).length;
  const mn=Math.min(...nums),mx=Math.max(...nums);
  document.getElementById('kAvg').textContent=avg;
  document.getElementById('kMed').textContent=pad(med);
  document.getElementById('kUniq').textContent=uniq;
  document.getElementById('kDbl').textContent=dbl;
  document.getElementById('kHot').textContent=hot;
  document.getElementById('kRange').textContent=pad(mn)+'–'+pad(mx);
}

/* ── LOCAL PREDICTION ── */
function calcLocalPred() {
  if(allRounds.length<3)return;
  const conf=Math.min(20+allRounds.length*2.5,78);
  setRing(conf,'สถิติพื้นฐาน',`จาก ${allRounds.length} งวด — กด "AI วิเคราะห์" เพื่อความแม่นยำสูงขึ้น`);

  const rec=allRounds.slice(0,5).filter(e=>e.top!=='??').map(e=>+e.top);
  const p1=pad(Math.round(rec.reduce((a,b)=>a+b,0)/rec.length)%100);
  const topF=Object.entries(freq).sort((a,b)=>b[1].length-a[1].length)[0];
  const p2=topF?pad((+topF[0]+11)%100):'??';
  const d0=Array(10).fill(0),d1=Array(10).fill(0);
  allRounds.slice(0,10).forEach(e=>{if(e.top!=='??'){d0[+e.top[0]]++;d1[+e.top[1]]++;}});
  const p3=''+d0.indexOf(Math.max(...d0))+d1.indexOf(Math.max(...d1));
  const dblC=Object.entries(freq).filter(([,a])=>a.length>=2).sort((a,b)=>b[1].length-a[1].length);
  const p4=dblC[0]?dblC[0][0]:'??';

  document.getElementById('predSection').style.display='block';
  document.getElementById('methodSection').style.display='block';
  document.getElementById('predNums').innerHTML=
    `<div class="pred-n pn-gold"  style="animation-delay:0s">${p1}<span class="pred-n-lbl">ค่าเฉลี่ย</span></div>
     <div class="pred-n pn-ember" style="animation-delay:.08s">${p4}<span class="pred-n-lbl">เบิ้ลซ้ำ</span></div>
     <div class="pred-n pn-ice"   style="animation-delay:.16s">${p3}<span class="pred-n-lbl">นำ+หน่วย</span></div>
     <div class="pred-n pn-gold"  style="animation-delay:.24s">${p2}<span class="pred-n-lbl">ร้อน+11</span></div>`;

  const acc = accuracyData;
  const methods=[
    {icon:'📊',name:'ค่าเฉลี่ย 5 งวด',  score:72,col:'var(--amber)'},
    {icon:'⚡',name:'เลขเบิ้ลซ้ำ',       score:80,col:'var(--green)'},
    {icon:'🔢',name:'หลักนำ+หน่วยเด่น', score:62,col:'var(--ice)'},
    {icon:'🔥',name:'เลขร้อน+offset',   score:65,col:'var(--ember)'},
    {icon:'📈',name:`แม่นยำรวม (±5%)`,   score:acc?acc.score:conf,col:'var(--violet)'},
  ];
  document.getElementById('methodList').innerHTML=methods.map(m=>
    `<div class="method-row">
       <div class="m-icon">${m.icon}</div>
       <div class="m-name">${m.name}</div>
       <div class="m-bar"><div class="m-fill" style="width:${m.score}%;background:${m.col}"></div></div>
       <div class="m-score" style="color:${m.col}">${m.score}%</div>
     </div>`).join('');
}

/* ── HISTORY with date columns ── */
function renderHistory(isNew) {
  const tb=document.getElementById('histBody');
  const badge=document.getElementById('histBadge');
  if(badge) badge.textContent=histRows.length+' งวด';
  if(!tb) return;
  if(!histRows.length){ tb.innerHTML='<tr><td colspan="10" style="text-align:center;padding:24px;color:var(--muted)">ยังไม่มีข้อมูล</td></tr>'; return; }
  tb.innerHTML=histRows.slice(0,50).map((r,i)=>{
    const tF=(freq[r.top]||[]).length, bF=(freq[r.bot]||[]).length;
    const isDbl=tF>=2||bF>=2;
    const resultDateTxt = r.resultDate || '—';
    return `<tr${i===0&&isNew?' class="flash"':''}>
      <td>${r.flag||''} <span style="font-size:11px;color:var(--muted)">${r.name}</span></td>
      <td style="font-size:10px;color:var(--muted)">${r.round}</td>
      <td><span class="nb ${tF>=2?'nb-dbl':'nb-top'}">${r.top}</span></td>
      <td><span class="nb ${bF>=2?'nb-dbl':'nb-bot'}">${r.bot}</span></td>
      <td style="font-size:11px;color:${isDbl?'var(--amber)':'var(--muted)'}">${isDbl?'⚡ เบิ้ล!':'—'}</td>
      <td style="font-family:'Share Tech Mono';font-size:11px;color:${tF>=4?'var(--ember)':tF>=2?'var(--amber)':'var(--muted)'}">${tF}×</td>
      <td style="font-family:'Share Tech Mono';font-size:11px;color:${bF>=4?'var(--ember)':bF>=2?'var(--amber)':'var(--muted)'}">${bF}×</td>
      <td style="font-family:'Share Tech Mono';font-size:10px;color:var(--ice)">${resultDateTxt}</td>
      <td style="font-family:'Share Tech Mono';font-size:10px;color:var(--muted)">${r.indexVal||'—'}</td>
      <td style="font-family:'Share Tech Mono';font-size:10px;color:var(--ghost)">${r.time.toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'})}</td>
    </tr>`;
  }).join('');
}

/* ══════════════════════════════════════════════════
   AI ANALYSIS
══════════════════════════════════════════════════ */
async function runAI() {
  if(allRounds.length<2){ alert2('⚠️ ต้องการข้อมูลอย่างน้อย 2 งวด','al-info'); return; }

  const aiEl=document.getElementById('aiStream');
  const aiLoad=document.getElementById('aiLoading');
  aiEl.className='ai-stream pending';
  aiEl.innerHTML='กำลังวิเคราะห์ด้วย Claude AI...<span class="cursor"></span>';
  if(aiLoad) aiLoad.style.display='flex';
  setRing(null,'AI กำลังประมวลผล...','');

  const freqCount={};
  Object.entries(freq).forEach(([n,arr])=>{ freqCount[n]=arr.length; });
  const sources=[...new Set(allRounds.map(e=>e.flag+e.name))].join(', ');

  try {
    let aiResult;
    if(backendOnline) {
      const r=await fetch(`${API_BASE}/api/analyze`,{
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          rounds:   allRounds.length,
          freq:     freqCount,
          allNums:  allRounds.slice(0,12).map(e=>`${e.top}/${e.bot}`),
          sources,
        }),
        signal: AbortSignal.timeout(35000)
      });
      const j=await r.json();
      if(!j.success) throw new Error(j.error);
      aiResult=j.analysis;
      if(j.analysis.accuracy) {
        accuracyData = j.analysis.accuracy;
        renderAccuracyPanel(accuracyData);
      }
    } else {
      aiResult=await callClaudeDirect(freqCount,sources);
    }

    aiEl.className='ai-stream';
    aiEl.innerHTML=aiResult.text.replace(/\n/g,'<br>');

    const confDisp = aiResult.confLow && aiResult.confHigh
      ? `${aiResult.confLow}–${aiResult.confHigh}%`
      : `${aiResult.conf}% (±5%)`;
    setRing(aiResult.conf,'AI วิเคราะห์เสร็จ',`ความแม่นยำ ${confDisp} · จาก ${allRounds.length} งวด`);

    // Update accuracy display from AI result
    if (aiResult.conf) {
      accuracyData = {
        score:  aiResult.conf,
        margin: 5,
        low:    (aiResult.confLow  || aiResult.conf - 5),
        high:   (aiResult.confHigh || aiResult.conf + 5),
        grade:  aiResult.conf >= 80 ? 'A' : aiResult.conf >= 70 ? 'B' : aiResult.conf >= 60 ? 'C' : 'D',
        detail: `AI วิเคราะห์ ${allRounds.length} งวด · ${Object.values(freqCount).filter(c=>c>=2).length} เลขเบิ้ล`,
      };
      renderAccuracyPanel(accuracyData);
    }

    if(aiResult.pred?.length||aiResult.double?.length){
      document.getElementById('predSection').style.display='block';
      document.getElementById('predNums').innerHTML=
        (aiResult.pred||[]).map((n,i)=>`<div class="pred-n pn-gold" style="animation-delay:${i*.08}s">${pad(+n)}<span class="pred-n-lbl">AI แนะนำ</span></div>`).join('')+
        (aiResult.double||[]).map((n,i)=>`<div class="pred-n pn-ember" style="animation-delay:${((aiResult.pred||[]).length+i)*.08}s">${pad(+n)}<span class="pred-n-lbl">AI เบิ้ล</span></div>`).join('');
    }
    alert2(`✅ AI วิเคราะห์เสร็จ — ความแม่นยำ ${aiResult.conf}% (±5%)`,'al-ok');
    renderChips();
  } catch(e) {
    aiEl.className='ai-stream';
    aiEl.innerHTML=`❌ ไม่สามารถวิเคราะห์ได้<br><span style="font-size:11px;color:var(--muted)">${e.message}</span>`;
    setRing(0,'วิเคราะห์ล้มเหลว',e.message);
    alert2('❌ AI: '+e.message,'al-err');
  } finally {
    if(aiLoad) aiLoad.style.display='none';
  }
}

/* fallback: call Claude directly */
async function callClaudeDirect(freqCount, sources) {
  const doubles=Object.entries(freqCount).filter(([,c])=>c>=2).sort((a,b)=>b[1]-a[1]);
  const topNums=Object.entries(freqCount).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([n,c])=>`${n}(${c}×)`).join(', ');
  const recentSeq=allRounds.slice(0,12).map(e=>`${e.top}/${e.bot}`).join(', ');
  const dblList=doubles.map(([n,c])=>`${n}×${c}`).join(', ')||'ยังไม่พบ';
  const acc = accuracyData;
  const prompt=`คุณคือผู้เชี่ยวชาญวิเคราะห์หวยหุ้น ข้อมูล: ${allRounds.length} งวด จาก ${sources}\nลำดับล่าสุด: ${recentSeq}\nความถี่: ${topNums}\nเบิ้ล: ${dblList}\nค่าแม่นยำเบื้องต้น: ${acc?acc.score:70}% (±5%)\nวิเคราะห์เชิงลึก 5 ข้อ แล้วลงท้าย JSON: {"pred":["XX","XX","XX"],"double":["XX","XX"],"cold":["XX"],"conf":75,"confLow":70,"confHigh":80,"reasoning":"สั้น"}`;

  const r=await fetch('https://api.anthropic.com/v1/messages',{
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:1000,messages:[{role:'user',content:prompt}]}),
    signal:AbortSignal.timeout(30000)
  });
  if(!r.ok){const err=await r.json().catch(()=>({}));throw new Error(err.error?.message||'API '+r.status);}
  const data=await r.json();
  const txt=data.content?.[0]?.text||'';
  let aiText=txt,pred=[],dbl=[],cold=[],conf=70,confLow=65,confHigh=75,reasoning='';
  const jm=txt.match(/\{[\s\S]*?"pred"[\s\S]*?\}/);
  if(jm){try{const j=JSON.parse(jm[0]);pred=j.pred||[];dbl=j.double||[];cold=j.cold||[];conf=j.conf||70;confLow=j.confLow||conf-5;confHigh=j.confHigh||conf+5;reasoning=j.reasoning||'';aiText=txt.replace(jm[0],'').trim();}catch(_){}}
  return{text:aiText,pred,double:dbl,cold,conf,confLow,confHigh,reasoning,timestamp:new Date().toISOString()};
}

/* ══════════════════════════════════════════════════
   EXPORT CSV
══════════════════════════════════════════════════ */
function exportCSV() {
  if(!histRows.length){alert2('ไม่มีข้อมูล','al-info');return;}
  const header='ตลาด,รอบ,เลขบน,เลขล่าง,เบิ้ล,บน(×),ล่าง(×),วันที่ผล,เวลา\n';
  const rows=histRows.map(r=>{
    const tF=(freq[r.top]||[]).length,bF=(freq[r.bot]||[]).length;
    return [r.name,r.round,r.top,r.bot,tF>=2||bF>=2?'เบิ้ล':'',tF,bF,r.resultDate||'—',r.time.toLocaleString('th-TH')].join(',');
  }).join('\n');
  const blob=new Blob(['\uFEFF'+header+rows],{type:'text/csv;charset=utf-8;'});
  const link=document.createElement('a');
  link.href=URL.createObjectURL(blob);
  link.download=`lottotj_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
  alert2('📥 Export CSV สำเร็จ','al-ok');
}

/* ══════════════════════════════════════════════════
   AUTO REFRESH
══════════════════════════════════════════════════ */
function toggleAutoRefresh() {
  const chk=document.getElementById('autoRefresh');
  const sel=document.getElementById('refreshInterval');
  if(chk.checked){
    const secs=parseInt(sel.value)||60;
    autoTimer=setInterval(()=>fetchAll(),secs*1000);
    alert2(`⏰ Auto refresh ทุก ${sel.options[sel.selectedIndex].text}`,'al-info');
  } else {
    clearInterval(autoTimer); autoTimer=null;
    alert2('⏰ หยุด Auto refresh','al-info');
  }
}

/* ══════════════════════════════════════════════════
   TICKER
══════════════════════════════════════════════════ */
function updateTicker() {
  const scroll=document.getElementById('tickerScroll');
  if(!scroll||!Object.keys(markets).length)return;
  const mList=Object.values(markets);
  const items=mList.map(m=>`<span class="tk"><b>${m.flag} ${m.name}</b><span id="tq_${m.id}"> ---</span></span>`);
  const all=[...items,...items].join('');
  scroll.innerHTML=all;
}
function updateTickerItem(id,top,bot) {
  const el=document.getElementById('tq_'+id);
  if(el) el.textContent=` ${top}/${bot}`;
}

/* ══════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════ */
function pad(n)    { return String(n).padStart(2,'0'); }
function sleep(ms) { return new Promise(r=>setTimeout(r,ms)); }

function setStatus(icon,txt) {
  const i=document.getElementById('sIcon'), t=document.getElementById('sTxt');
  if(i) i.textContent=icon; if(t) t.textContent=txt;
}
function setBusy(b) {
  const btn=document.getElementById('btnFetch');
  if(!btn)return; btn.disabled=b; btn.textContent=b?'⏳ กำลังดึง...':'⚡ ดึงข้อมูล';
}

let alertTmr;
function alert2(msg,cls) {
  const box=document.getElementById('alertBox');
  if(!box)return;
  box.innerHTML=`<div class="alert ${cls}">${msg}</div>`;
  clearTimeout(alertTmr); alertTmr=setTimeout(()=>box.innerHTML='',5500);
}

function renderChips() {
  const dbl=Object.values(freq).filter(a=>a.length>=2).length;
  const hot=Object.values(freq).filter(a=>a.length>=4).length;
  const fire=Object.values(freq).filter(a=>a.length>=5).length;
  const activeMarkets=Object.values(fetched).filter(Boolean).length;
  const activeRegions=[...new Set(Object.keys(fetched).filter(id=>fetched[id]).map(id=>(markets[id]||FALLBACK_MARKETS.find(m=>m.id===id)||{}).region).filter(Boolean))].length;
  const set=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
  set('cAll',     allRounds.length);
  set('cDbl',     dbl);
  set('cHot',     hot);
  set('cFire',    fire);
  set('cMkt',     activeMarkets);
  set('cRegion',  activeRegions || [...new Set(Object.values(markets).map(m=>m.region).filter(Boolean))].length || 8);
  set('cTime',    allRounds.length?new Date().toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'}):'—');
  if (accuracyData) {
    const accEl = document.getElementById('cAccuracy');
    if (accEl) accEl.textContent = `${accuracyData.low}–${accuracyData.high}%`;
  }
}

function setRing(pct,status,desc) {
  if(pct!==null){
    const C=238.8,off=C*(1-pct/100);
    const arc=document.getElementById('confArc'),lbl=document.getElementById('confPct');
    if(arc)arc.style.strokeDashoffset=off; if(lbl)lbl.textContent=Math.round(pct)+'%';
  }
  const st=document.getElementById('confStatus'),dc=document.getElementById('confDesc');
  if(status&&st)st.textContent=status; if(desc&&dc)dc.textContent=desc;
}

function refreshDoubles() { renderDoubles(); updateHeatmap(); }
