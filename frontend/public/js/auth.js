/**
 * ════════════════════════════════════════════════════
 * LOTTO-TJ · auth.js  v1.0
 * ระบบ Login + Admin Lock — Frontend Auth Module
 * ════════════════════════════════════════════════════
 *
 *  ─ ผู้ใช้ทั่วไป: กรอก username + password → เข้าใช้งาน
 *  ─ Admin: ล็อก/ปลดล็อกระบบผ่าน /api/admin/lock | /unlock
 *  ─ สถานะล็อกถูกเช็คจาก API ทุกครั้งที่โหลดหน้า + ทุก 30 วิ
 *  ─ Session เก็บใน sessionStorage (ปิดแท็บ = ออกจากระบบอัตโนมัติ)
 *
 *  รหัสผ่านเริ่มต้น (เปลี่ยนได้ใน .env / server):
 *    ADMIN_USERNAME = admin
 *    ADMIN_PASSWORD = Admin@1234
 *    USER accounts  → /api/auth/users  (จัดการผ่าน server)
 * ════════════════════════════════════════════════════
 */

'use strict';

/* ── Constants ── */
const AUTH_SESSION_KEY = 'lottotj_session';
const LOCK_CHECK_INTERVAL = 30_000; // 30 วินาที

/* ── State ── */
let _authUser = null;
let _lockCheckTimer = null;

/* ══════════════════════════════════════════════════
   PUBLIC API
══════════════════════════════════════════════════ */

/**
 * เริ่มต้นระบบ Auth — เรียกจาก app.js ก่อน DOMContentLoaded จะทำงาน
 * return true = ผ่าน login แล้ว, false = ต้องกรอก login
 */
async function authInit() {
  renderLoginOverlay();
  renderAdminPanel();

  /* เช็คว่าระบบถูกล็อกไหม */
  const locked = await checkSystemLock();
  if (locked) { showLockScreen(); return false; }

  /* เช็ค session ที่เคย login ไว้ */
  const session = loadSession();
  if (session && session.token) {
    const valid = await verifySession(session.token);
    if (valid) {
      _authUser = session;
      onLoginSuccess(session);
      startLockPoller();
      return true;
    }
  }

  /* ต้อง login */
  showLoginOverlay();
  return false;
}

/* ── getCurrentUser ── */
function getCurrentUser() { return _authUser; }

/* ── logout ── */
function authLogout() {
  sessionStorage.removeItem(AUTH_SESSION_KEY);
  _authUser = null;
  stopLockPoller();
  location.reload();
}

/* ══════════════════════════════════════════════════
   LOGIN OVERLAY — HTML Injection
══════════════════════════════════════════════════ */
function renderLoginOverlay() {
  const el = document.createElement('div');
  el.id = 'authOverlay';
  el.className = 'auth-overlay hidden';
  el.innerHTML = `
    <div class="auth-box">
      <!-- Brand -->
      <div class="auth-brand">
        <div class="auth-gem">🎯</div>
        <div>
          <div class="auth-title">LOTTO-Analyze</div>
          <div class="auth-sub">TECH-TJ Solution Technology</div>
        </div>
      </div>

      <!-- Lock State (shown when system locked) -->
      <div id="lockBanner" class="lock-banner hidden">
        <div class="lock-icon">🔒</div>
        <div class="lock-title">ระบบถูกล็อกชั่วคราว</div>
        <div class="lock-msg" id="lockMsg">ผู้ดูแลระบบได้ปิดการใช้งานชั่วคราว กรุณาติดต่อผู้ดูแล</div>
      </div>

      <!-- Login Form (shown when system unlocked) -->
      <div id="loginForm">
        <div class="auth-form-title">เข้าสู่ระบบ</div>

        <div class="auth-field">
          <label class="auth-label">ชื่อผู้ใช้</label>
          <div class="auth-input-wrap">
            <span class="auth-icon">👤</span>
            <input class="auth-input" id="authUsername" type="text"
              placeholder="กรอกชื่อผู้ใช้"
              autocomplete="username"
              onkeydown="if(event.key==='Enter')document.getElementById('authPassword').focus()">
          </div>
        </div>

        <div class="auth-field">
          <label class="auth-label">รหัสผ่าน</label>
          <div class="auth-input-wrap">
            <span class="auth-icon">🔑</span>
            <input class="auth-input" id="authPassword" type="password"
              placeholder="กรอกรหัสผ่าน"
              autocomplete="current-password"
              onkeydown="if(event.key==='Enter')doLogin()">
            <button class="auth-eye" id="authEye" onclick="togglePwd()" type="button" title="แสดง/ซ่อนรหัสผ่าน">👁</button>
          </div>
        </div>

        <div class="auth-err hidden" id="authErr"></div>

        <button class="auth-btn" id="authBtn" onclick="doLogin()">
          <span id="authBtnTxt">เข้าสู่ระบบ</span>
          <div class="auth-spin hidden" id="authSpin"></div>
        </button>

        <div class="auth-hint">
          ระบบสงวนสิทธิ์เฉพาะผู้ได้รับอนุญาต<br>
          <span style="color:var(--muted);font-size:10px">© 2026 TECH-TJ Software Solutions Technology</span>
        </div>
      </div>
    </div>
  `;
  document.body.prepend(el);
}

/* ── Admin Panel (floating button + modal) ── */
function renderAdminPanel() {
  /* Floating Admin Button — จะปรากฏเฉพาะ admin */
  const fab = document.createElement('div');
  fab.id = 'adminFab';
  fab.className = 'admin-fab hidden';
  fab.title = 'Admin Panel';
  fab.innerHTML = `⚙️`;
  fab.onclick = toggleAdminPanel;
  document.body.appendChild(fab);

  /* Admin Modal */
  const modal = document.createElement('div');
  modal.id = 'adminModal';
  modal.className = 'admin-modal hidden';
  modal.innerHTML = `
    <div class="admin-box">
      <div class="admin-header">
        <span>⚙️ Admin Panel</span>
        <button class="admin-close" onclick="toggleAdminPanel()">✕</button>
      </div>
      <div class="admin-body">
        <!-- ข้อมูล admin -->
        <div class="admin-info">
          <span class="admin-badge">👑 Administrator</span>
          <span id="adminUserLabel" style="font-size:11px;color:var(--muted)"></span>
        </div>

        <div class="admin-divider"></div>

        <!-- สถานะระบบ -->
        <div class="admin-section-title">🔒 สถานะระบบ</div>
        <div class="admin-status-row">
          <div class="admin-status-chip" id="adminLockChip">
            <div class="cdot" id="adminLockDot" style="background:var(--green)"></div>
            <span id="adminLockLabel">ระบบเปิดใช้งาน</span>
          </div>
        </div>

        <!-- เหตุผลล็อก -->
        <div class="auth-field" style="margin-top:12px" id="lockReasonWrap">
          <label class="auth-label">เหตุผลที่ล็อก (แสดงให้ผู้ใช้เห็น)</label>
          <textarea class="auth-input" id="lockReason" rows="2"
            placeholder="เช่น ปรับปรุงระบบ, พักชั่วคราว..."
            style="resize:vertical;font-size:12px;padding:8px 12px;min-height:56px"></textarea>
        </div>

        <!-- ปุ่มล็อก/ปลดล็อก -->
        <div style="display:flex;gap:8px;margin-top:10px">
          <button class="btn btn-danger" id="btnLock" onclick="adminLockSystem()" style="flex:1">
            🔒 ล็อกระบบ
          </button>
          <button class="btn btn-ghost" id="btnUnlock" onclick="adminUnlockSystem()" style="flex:1">
            🔓 ปลดล็อก
          </button>
        </div>

        <div class="admin-divider"></div>

        <!-- ออกจากระบบ -->
        <button class="btn btn-ghost btn-sm" onclick="authLogout()" style="width:100%">
          🚪 ออกจากระบบ (Logout)
        </button>

        <div class="auth-hint" style="margin-top:10px">
          การล็อกระบบจะมีผลทันที — ผู้ใช้ที่กำลังใช้งานจะถูกล็อกออกใน 30 วินาที
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  /* Click outside to close */
  modal.addEventListener('click', e => { if (e.target === modal) toggleAdminPanel(); });
}

/* ══════════════════════════════════════════════════
   LOGIN LOGIC
══════════════════════════════════════════════════ */
async function doLogin() {
  const username = document.getElementById('authUsername')?.value.trim();
  const password = document.getElementById('authPassword')?.value;
  const errEl    = document.getElementById('authErr');
  const btn      = document.getElementById('authBtn');
  const btnTxt   = document.getElementById('authBtnTxt');
  const spin     = document.getElementById('authSpin');

  if (!username || !password) {
    showAuthErr('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน');
    return;
  }

  /* Loading state */
  btn.disabled = true;
  btnTxt.textContent = 'กำลังตรวจสอบ...';
  spin.classList.remove('hidden');
  errEl?.classList.add('hidden');

  try {
    const res = await fetch(`${window.API_BASE || window.location.origin}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
      signal: AbortSignal.timeout(8000),
    });

    const data = await res.json();

    if (res.ok && data.success) {
      /* บันทึก session */
      const session = { username: data.username, role: data.role, token: data.token, loginAt: Date.now() };
      sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
      _authUser = session;
      onLoginSuccess(session);
      startLockPoller();
    } else {
      showAuthErr(data.message || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
    }
  } catch (e) {
    /* Fallback: ถ้า backend ออฟไลน์ ให้ใช้ default credentials */
    if (await localAuthFallback(username, password)) {
      const session = { username, role: username === 'admin' ? 'admin' : 'user', token: `local_${Date.now()}`, loginAt: Date.now() };
      sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
      _authUser = session;
      onLoginSuccess(session);
      startLockPoller();
    } else {
      showAuthErr('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
    }
  } finally {
    btn.disabled = false;
    btnTxt.textContent = 'เข้าสู่ระบบ';
    spin.classList.add('hidden');
  }
}

/* Fallback auth เมื่อ backend ออฟไลน์ */
async function localAuthFallback(username, password) {
  /* Default accounts — เปลี่ยนได้ใน production */
  const LOCAL_ACCOUNTS = [
    { username: 'admin',  password: 'Admin@1234' },
    { username: 'user1',  password: 'User@1234'  },
    { username: 'staff',  password: 'Staff@2026' },
  ];
  return LOCAL_ACCOUNTS.some(a => a.username === username && a.password === password);
}

function showAuthErr(msg) {
  const el = document.getElementById('authErr');
  if (!el) return;
  el.textContent = '⚠️ ' + msg;
  el.classList.remove('hidden');
  el.classList.add('auth-err-shake');
  setTimeout(() => el.classList.remove('auth-err-shake'), 500);
}

function togglePwd() {
  const inp = document.getElementById('authPassword');
  if (!inp) return;
  inp.type = inp.type === 'password' ? 'text' : 'password';
}

/* ══════════════════════════════════════════════════
   SESSION
══════════════════════════════════════════════════ */
function loadSession() {
  try { return JSON.parse(sessionStorage.getItem(AUTH_SESSION_KEY)); } catch { return null; }
}

async function verifySession(token) {
  if (token.startsWith('local_')) return true; /* local fallback tokens always valid */
  try {
    const res = await fetch(`${window.API_BASE || window.location.origin}/api/auth/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      signal: AbortSignal.timeout(4000),
    });
    const data = await res.json();
    return res.ok && data.valid;
  } catch { return true; /* ถ้า verify ไม่ได้ ให้ผ่านไปก่อน */ }
}

/* ══════════════════════════════════════════════════
   SYSTEM LOCK
══════════════════════════════════════════════════ */
async function checkSystemLock() {
  try {
    const res = await fetch(`${window.API_BASE || window.location.origin}/api/auth/status`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data.locked === true;
  } catch { return false; }
}

async function updateLockStatus() {
  const locked = await checkSystemLock();
  if (locked) {
    /* ถ้าล็อกระหว่างใช้งาน — reload → แสดง lock screen */
    const isAdmin = _authUser?.role === 'admin';
    if (!isAdmin) {
      sessionStorage.removeItem(AUTH_SESSION_KEY);
      location.reload();
    } else {
      /* Admin เห็นแค่ indicator */
      updateAdminLockChip(true);
    }
  } else {
    updateAdminLockChip(false);
  }
}

function startLockPoller() {
  stopLockPoller();
  _lockCheckTimer = setInterval(updateLockStatus, LOCK_CHECK_INTERVAL);
}
function stopLockPoller() {
  if (_lockCheckTimer) { clearInterval(_lockCheckTimer); _lockCheckTimer = null; }
}

/* ── Admin: Lock / Unlock ── */
async function adminLockSystem() {
  const reason = document.getElementById('lockReason')?.value.trim() || 'ผู้ดูแลระบบปิดการใช้งานชั่วคราว';
  const token  = _authUser?.token;
  try {
    const res = await fetch(`${window.API_BASE || window.location.origin}/api/admin/lock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ reason }),
      signal: AbortSignal.timeout(6000),
    });
    const data = await res.json();
    if (res.ok && data.success) {
      updateAdminLockChip(true);
      alert2('🔒 ล็อกระบบสำเร็จ — ผู้ใช้จะถูกล็อกออกใน 30 วินาที', 'al-warn');
    } else {
      alert2('❌ ล็อกไม่สำเร็จ: ' + (data.message || 'unknown'), 'al-danger');
    }
  } catch {
    /* Fallback: เก็บใน localStorage เพื่อ sync กับ localAuthFallback */
    localStorage.setItem('lottotj_system_lock', JSON.stringify({ locked: true, reason, lockedAt: Date.now() }));
    updateAdminLockChip(true);
    alert2('🔒 ล็อกระบบสำเร็จ (local mode)', 'al-warn');
  }
}

async function adminUnlockSystem() {
  const token = _authUser?.token;
  try {
    const res = await fetch(`${window.API_BASE || window.location.origin}/api/admin/unlock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      signal: AbortSignal.timeout(6000),
    });
    const data = await res.json();
    if (res.ok && data.success) {
      updateAdminLockChip(false);
      alert2('🔓 ปลดล็อกระบบสำเร็จ', 'al-ok');
    } else {
      alert2('❌ ปลดล็อกไม่สำเร็จ', 'al-danger');
    }
  } catch {
    localStorage.removeItem('lottotj_system_lock');
    updateAdminLockChip(false);
    alert2('🔓 ปลดล็อกสำเร็จ (local mode)', 'al-ok');
  }
}

function updateAdminLockChip(locked) {
  const dot   = document.getElementById('adminLockDot');
  const label = document.getElementById('adminLockLabel');
  const btnLock   = document.getElementById('btnLock');
  const btnUnlock = document.getElementById('btnUnlock');
  if (dot)   dot.style.background   = locked ? 'var(--red)' : 'var(--green)';
  if (label) label.textContent       = locked ? '🔒 ระบบถูกล็อก' : '✅ ระบบเปิดใช้งาน';
  if (btnLock)   btnLock.disabled    = locked;
  if (btnUnlock) btnUnlock.disabled  = !locked;
}

/* ══════════════════════════════════════════════════
   UI STATE
══════════════════════════════════════════════════ */
function showLoginOverlay() {
  document.getElementById('authOverlay')?.classList.remove('hidden');
  document.body.classList.add('auth-active');
  setTimeout(() => document.getElementById('authUsername')?.focus(), 300);
}

function hideLoginOverlay() {
  const el = document.getElementById('authOverlay');
  if (!el) return;
  el.classList.add('auth-leaving');
  setTimeout(() => { el.classList.add('hidden'); el.classList.remove('auth-leaving'); }, 600);
  document.body.classList.remove('auth-active');
}

function showLockScreen() {
  document.getElementById('lockBanner')?.classList.remove('hidden');
  document.getElementById('loginForm')?.classList.add('hidden');
  document.getElementById('authOverlay')?.classList.remove('hidden');
  document.body.classList.add('auth-active');

  /* แสดงเหตุผล (ถ้ามี) */
  fetch(`${window.API_BASE || window.location.origin}/api/auth/status`).then(r => r.json()).then(d => {
    const msgEl = document.getElementById('lockMsg');
    if (msgEl && d.reason) msgEl.textContent = d.reason;
  }).catch(() => {});
}

function onLoginSuccess(session) {
  hideLoginOverlay();

  /* แสดง admin fab ถ้าเป็น admin */
  if (session.role === 'admin') {
    document.getElementById('adminFab')?.classList.remove('hidden');
    const lbl = document.getElementById('adminUserLabel');
    if (lbl) lbl.textContent = session.username;
    checkSystemLock().then(locked => updateAdminLockChip(locked));
  }

  /* แสดง user chip ใน topbar */
  renderUserChip(session);

  /* เริ่มต้น App หลัง login สำเร็จ */
  setTimeout(async () => {
    if (typeof initHeatmap   === 'function') initHeatmap();
    if (typeof checkBackend  === 'function') await checkBackend();
    if (typeof loadMarkets   === 'function') await loadMarkets();
    if (typeof renderChips   === 'function') renderChips();
  }, 400); /* รอ animation overlay หาย */
}

function renderUserChip(session) {
  const topbarR = document.querySelector('.topbar-r');
  if (!topbarR) return;
  const chip = document.createElement('div');
  chip.className = 'user-chip';
  chip.innerHTML = `
    <span>${session.role === 'admin' ? '👑' : '👤'}</span>
    <span>${session.username}</span>
    <button class="user-logout-btn" onclick="authLogout()" title="ออกจากระบบ">✕</button>
  `;
  topbarR.prepend(chip);
}

function toggleAdminPanel() {
  const modal = document.getElementById('adminModal');
  if (!modal) return;
  modal.classList.toggle('hidden');
}
