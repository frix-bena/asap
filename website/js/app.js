const API_BASE = (() => {
  if (typeof window !== 'undefined') {
    if (window.location.port === '5000') return window.location.origin;
    const hostname = window.location.hostname || '127.0.0.1';
    if (hostname && hostname !== '') return `http://${hostname}:5000`;
  }
  return 'http://127.0.0.1:5000';
})();

// ── Auth Helpers ─────────────────────────────────────────
const Auth = {
  getToken:  () => localStorage.getItem('iv_token'),
  getUser:   () => JSON.parse(localStorage.getItem('iv_user') || 'null'),
  setSession(token, user) {
    localStorage.setItem('iv_token', token);
    localStorage.setItem('iv_user', JSON.stringify(user));
  },
  clear() {
    localStorage.removeItem('iv_token');
    localStorage.removeItem('iv_user');
  },
  isLoggedIn: () => !!localStorage.getItem('iv_token'),
  requireAuth() {
    if (!this.isLoggedIn()) { window.location.href = 'login.html'; return false; }
    return true;
  },
  requireGuest() {
    if (this.isLoggedIn()) { window.location.href = 'dashboard.html'; }
  },
};

// ── HTTP Client ──────────────────────────────────────────
const api = {
  async request(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    const token = Auth.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const url = `${API_BASE}${path}`;
    console.log('[API] Fetching:', method, url); // ← debug: verify URL is not undefined
    const res = await fetch(url, {
      method, headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const isAuthRoute = path.includes('/login') || path.includes('/register');
      if (res.status === 401 && !isAuthRoute) { Auth.clear(); window.location.href = 'login.html'; }
      throw Object.assign(new Error(data.error || 'Request failed'), { data });
    }
    return data;
  },
  get:    (path)       => api.request('GET',  path),
  post:   (path, body) => api.request('POST', path, body),
};

// ── UI Helpers ────────────────────────────────────────────
function fmt(val, decimals = 2) {
  return parseFloat(val || 0).toLocaleString('en-US', {
    minimumFractionDigits: decimals, maximumFractionDigits: decimals,
  });
}

function showAlert(el, msg, type = 'error') {
  el.textContent = msg;
  el.className = `alert show alert-${type}`;
}
function hideAlert(el) { el.className = 'alert'; }

function setLoading(btn, loading, label = 'Submit') {
  if (loading) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>';
  } else {
    btn.disabled = false;
    btn.innerHTML = label;
  }
}

// ── Sidebar Population ────────────────────────────────────
function populateSidebar() {
  const user = Auth.getUser();
  if (!user) return;
  const nameEl  = document.getElementById('sidebar-name');
  const emailEl = document.getElementById('sidebar-email');
  const avatarEl = document.getElementById('sidebar-avatar');
  if (nameEl)   nameEl.textContent  = user.fullName || 'User';
  if (emailEl)  emailEl.textContent = user.phone || '';
  if (avatarEl) avatarEl.textContent = (user.fullName || 'U')[0].toUpperCase();
}

// Logout button
document.addEventListener('DOMContentLoaded', () => {
  populateSidebar();
  const logoutBtn = document.getElementById('btn-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      Auth.clear();
      window.location.href = 'login.html';
    });
  }
});
