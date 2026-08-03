// ── Auth ─────────────────────────────────────────────────
const Auth = {
  getToken:   () => localStorage.getItem('vault_token'),
  getUser:    () => JSON.parse(localStorage.getItem('vault_user') || 'null'),
  setSession(token, user) {
    localStorage.setItem('vault_token', token);
    localStorage.setItem('vault_user', JSON.stringify(user));
  },
  clear() { localStorage.removeItem('vault_token'); localStorage.removeItem('vault_user'); },
  isLoggedIn: () => !!localStorage.getItem('vault_token'),
  requireAuth() { if (!this.isLoggedIn()) { location.href = '/login.html'; return false; } return true; },
  requireGuest() { if (this.isLoggedIn()) location.href = '/dashboard.html'; },
};

// ── API Client ───────────────────────────────────────────
const api = {
  async req(method, path, body) {
    const h = { 'Content-Type': 'application/json' };
    const t = Auth.getToken();
    if (t) h['Authorization'] = `Bearer ${t}`;
    const r = await fetch(`/api${path}`, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { if (r.status === 401) { Auth.clear(); location.href = '/login.html'; } throw Object.assign(new Error(d.error || 'Error'), { data: d }); }
    return d;
  },
  get:  (p)    => api.req('GET',  p),
  post: (p, b) => api.req('POST', p, b),
};

// ── UI helpers ───────────────────────────────────────────
const fmt = (v, d = 2) => 'KES ' + parseFloat(v || 0).toLocaleString('en-KE', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtNum = (v) => parseFloat(v || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function showAlert(el, msg, type = 'error') { el.textContent = msg; el.className = `alert show alert-${type}`; }
function hideAlert(el) { el.className = 'alert'; }

function setLoading(btn, on, label = btn.dataset.label || 'Submit') {
  btn.dataset.label = btn.dataset.label || btn.textContent;
  btn.disabled = on;
  btn.innerHTML = on ? '<span class="spinner"></span>' : label;
}

// ── Sidebar ──────────────────────────────────────────────
function initSidebar() {
  const user = Auth.getUser();
  if (!user) return;
  const a = document.getElementById('sb-avatar'); if (a) a.textContent = (user.fullName || 'V')[0].toUpperCase();
  const n = document.getElementById('sb-name');   if (n) n.textContent = user.fullName || '—';
  const p = document.getElementById('sb-phone');  if (p) p.textContent = user.phone || '—';
  const l = document.getElementById('btn-logout');
  if (l) l.addEventListener('click', () => { Auth.clear(); location.href = '/login.html'; });
}

document.addEventListener('DOMContentLoaded', initSidebar);

// ── Countdown Timer ──────────────────────────────────────
const RING_R   = 52;
const RING_C   = 2 * Math.PI * RING_R;

function startCountdown({ nextClaimAt, canClaim, onReady, onTick }) {
  const ringFg = document.getElementById('ring-fg');
  const hmsEl  = document.getElementById('countdown-hms');
  const lblEl  = document.getElementById('countdown-lbl');
  if (!ringFg || !hmsEl) return;

  const TOTAL_MS = 24 * 60 * 60 * 1000;

  function render() {
    const now     = Date.now();
    const target  = new Date(nextClaimAt).getTime();
    const msLeft  = Math.max(0, target - now);
    const pct     = msLeft / TOTAL_MS;

    if (msLeft <= 0 && typeof onReady === 'function') { onReady(); return; }
    if (typeof onTick === 'function') onTick(msLeft);

    const h = Math.floor(msLeft / 3600000);
    const m = Math.floor((msLeft % 3600000) / 60000);
    const s = Math.floor((msLeft % 60000) / 1000);
    hmsEl.textContent = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    if (lblEl) lblEl.textContent = 'until next claim';

    // SVG ring
    const offset = RING_C * pct;
    ringFg.style.strokeDasharray  = RING_C;
    ringFg.style.strokeDashoffset = RING_C - offset;

    setTimeout(render, 1000);
  }

  if (ringFg) {
    ringFg.setAttribute('r', RING_R);
    ringFg.setAttribute('cx', 60);
    ringFg.setAttribute('cy', 60);
  }

  render();
}
