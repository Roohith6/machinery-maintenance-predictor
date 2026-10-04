/* =============================================================
   API.JS — Central DRF connector
   Handles: token storage, auto-refresh, all API calls
   Must be loaded FIRST before login.js / operator.js / admin.js
   ============================================================= */

'use strict';

// ── Auth store — in-memory + sessionStorage for redirect survival ──
window.PM = window.PM || {};
window.PM.auth = {
  accessToken:  null,
  refreshToken: null,
  user:         null,
};

// Restore from sessionStorage on every page load
(function restoreSession() {
  try {
    const saved = sessionStorage.getItem('pm_auth');
    if (saved) {
      const parsed = JSON.parse(saved);
      window.PM.auth.accessToken  = parsed.accessToken  || null;
      window.PM.auth.refreshToken = parsed.refreshToken || null;
      window.PM.auth.user         = parsed.user         || null;
    }
  } catch (e) { /* ignore */ }
})();

// Persist current tokens to sessionStorage (call after login or token refresh)
function saveSession() {
  try {
    sessionStorage.setItem('pm_auth', JSON.stringify({
      accessToken:  window.PM.auth.accessToken,
      refreshToken: window.PM.auth.refreshToken,
      user:         window.PM.auth.user,
    }));
  } catch (e) { /* ignore */ }
}

function clearSession() {
  try { sessionStorage.removeItem('pm_auth'); } catch (e) { /* ignore */ }
}

// ── Base URL — change to your Django server URL if different ───
const API_BASE = 'http://127.0.0.1:8000/api';

// ── CSRF helper (Django requires this for non-GET requests) ────
function getCookie(name) {
  const val = `; ${document.cookie}`;
  const parts = val.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
  return null;
}

// ── Build request headers ──────────────────────────────────────
function buildHeaders(extraHeaders = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...extraHeaders,
  };
  if (window.PM.auth.accessToken) {
    headers['Authorization'] = `Bearer ${window.PM.auth.accessToken}`;
  }
  const csrf = getCookie('csrftoken');
  if (csrf) headers['X-CSRFToken'] = csrf;
  return headers;
}

// ── Token refresh ──────────────────────────────────────────────
let _refreshing = false;
let _refreshQueue = [];

async function refreshAccessToken() {
  if (_refreshing) {
    // Queue concurrent requests while refresh is in progress
    return new Promise((resolve, reject) => {
      _refreshQueue.push({ resolve, reject });
    });
  }

  _refreshing = true;

  try {
    const res = await fetch(`${API_BASE}/auth/token/refresh/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh: window.PM.auth.refreshToken }),
    });

    if (!res.ok) throw new Error('Session expired. Please login again.');

    const data = await res.json();
    window.PM.auth.accessToken = data.access;
    saveSession(); // persist refreshed token

    // Drain the queue with the new token
    _refreshQueue.forEach(p => p.resolve(data.access));
    _refreshQueue = [];
    return data.access;

  } catch (err) {
    _refreshQueue.forEach(p => p.reject(err));
    _refreshQueue = [];
    // Force logout
    window.PM.auth = { accessToken: null, refreshToken: null, user: null };
    clearSession();
    window.location.href = '/';
    throw err;

  } finally {
    _refreshing = false;
  }
}

// ── Core fetch wrapper with auto-retry on 401 ─────────────────
async function apiFetch(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;

  const doFetch = async (token) => {
    const headers = buildHeaders(options.headers || {});
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(url, {
      ...options,
      headers,
    });

    return res;
  };

  let res = await doFetch(window.PM.auth.accessToken);

  // Auto-refresh on 401
  if (res.status === 401 && window.PM.auth.refreshToken) {
    try {
      const newToken = await refreshAccessToken();
      res = await doFetch(newToken);
    } catch (e) {
      throw new Error('Session expired. Please login again.');
    }
  }

  // Parse response
  let data;
  const contentType = res.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }

  if (!res.ok) {
    // Extract best error message from DRF response
    const msg = extractError(data, res.status);
    throw Object.assign(new Error(msg), { status: res.status, data });
  }

  return data;
}

// ── Error message extractor (handles DRF formats) ─────────────
function extractError(data, status) {
  if (!data || typeof data === 'string') {
    return data || `Request failed (${status})`;
  }
  if (data.detail) return data.detail;
  if (data.non_field_errors) return data.non_field_errors[0];
  if (data.message) return data.message;

  // Collect all field errors
  const fieldErrors = [];
  for (const [field, errors] of Object.entries(data)) {
    if (Array.isArray(errors)) {
      fieldErrors.push(`${field}: ${errors[0]}`);
    } else if (typeof errors === 'string') {
      fieldErrors.push(`${field}: ${errors}`);
    }
  }
  if (fieldErrors.length) return fieldErrors.join(' | ');

  return `Request failed (${status})`;
}

// ── Convenience methods ────────────────────────────────────────

async function apiGet(endpoint) {
  return apiFetch(endpoint, { method: 'GET' });
}

async function apiPost(endpoint, body) {
  return apiFetch(endpoint, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

async function apiPut(endpoint, body) {
  return apiFetch(endpoint, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

async function apiPatch(endpoint, body) {
  return apiFetch(endpoint, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

async function apiDelete(endpoint) {
  return apiFetch(endpoint, { method: 'DELETE' });
}

// ── Login helper ───────────────────────────────────────────────
async function apiLogin(username, password) {
  const res = await fetch(`${API_BASE}/auth/login/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(extractError(data, res.status));
  }

  // Store tokens in memory AND sessionStorage (so they survive page redirect)
  window.PM.auth.accessToken  = data.access;
  window.PM.auth.refreshToken = data.refresh;
  window.PM.auth.user         = data.user;
  saveSession();

  return data;
}

// ── Logout helper ──────────────────────────────────────────────
async function apiLogout() {
  if (window.PM.auth.refreshToken) {
    try {
      await apiPost('/auth/logout/', { refresh: window.PM.auth.refreshToken });
    } catch (e) { /* ignore — server may already have invalidated */ }
  }
  window.PM.auth = { accessToken: null, refreshToken: null, user: null };
  clearSession();
}

// ── PMApi compatibility shim (used by admin.js) ────────────────
// admin.js calls window.PMApi.getProfile(), window.PMApi.getAdminDashboardStats() etc.
window.PMApi = {
  getProfile:            () => apiGet('/auth/profile/'),
  getAdminDashboardStats:() => apiGet('/dashboard/stats/'),
  getPredictionHistory:  () => apiGet('/predictions/history/'),
  getMachineStatus:      () => apiGet('/machines/status/'),
  getUsers:              () => apiGet('/auth/users/'),
  getAlerts:             () => apiGet('/predictions/alerts/?limit=20'),
  createUser:            (data) => apiPost('/auth/users/', data),
  logout:                () => apiLogout(),
};

// ── Auth guard — call at top of each protected page ───────────
async function requireAuth(requiredRole = null) {
  if (!window.PM.auth.accessToken) {
    window.location.href = '/';
    return null;
  }

  try {
    const profile = await apiGet('/auth/profile/');
    window.PM.auth.user = profile;

    if (requiredRole && profile.role !== requiredRole) {
      // Wrong role — redirect to correct dashboard
      if (profile.role === 'admin') {
        window.location.href = '/admin-panel/';
      } else {
        window.location.href = '/operator/';
      }
      return null;
    }

    return profile;
  } catch (e) {
    window.location.href = '/';
    return null;
  }
}

// ── Theme helpers ──────────────────────────────────────────────
function initTheme() {
  const stored = window._pmTheme || null;
  const system = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  const theme  = stored || system;
  document.documentElement.setAttribute('data-theme', theme);
  return theme;
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next    = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  window._pmTheme = next;
  return next;
}

// ── Live clock ─────────────────────────────────────────────────
function startLiveClock(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;

  function tick() {
    el.textContent = new Date().toLocaleTimeString('en-IN', {
      hour:   '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  }
  tick();
  return setInterval(tick, 1000);
}

// ── Date formatter ─────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    day:    '2-digit',
    month:  'short',
    year:   'numeric',
    hour:   '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function fmtDateShort(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

// ── Number counter animation ───────────────────────────────────
function animateCount(elementId, target, suffix = '') {
  const el = document.getElementById(elementId);
  if (!el) return;

  const duration = 800;
  const start    = performance.now();
  const from     = 0;

  function step(now) {
    const elapsed  = now - start;
    const progress = Math.min(elapsed / duration, 1);
    // Ease-out cubic
    const eased    = 1 - Math.pow(1 - progress, 3);
    const current  = Math.round(from + (target - from) * eased);
    el.textContent = current.toLocaleString('en-IN') + suffix;
    if (progress < 1) requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}

// ── Sidebar helpers (shared by operator + admin) ──────────────
function initSidebar() {
  const sidebar   = document.getElementById('sidebar');
  const overlay   = document.getElementById('sidebar-overlay');
  const openBtn   = document.getElementById('topbar-menu-btn');
  const closeBtn  = document.getElementById('sidebar-close-btn');

  function openSidebar() {
    sidebar?.classList.add('open');
    overlay?.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeSidebar() {
    sidebar?.classList.remove('open');
    overlay?.classList.remove('active');
    document.body.style.overflow = '';
  }

  openBtn?.addEventListener('click', openSidebar);
  closeBtn?.addEventListener('click', closeSidebar);
  overlay?.addEventListener('click', closeSidebar);

  // Close on ESC
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSidebar();
  });
}

// ── Nav section switcher (shared) ─────────────────────────────
function initNavigation(sections, onSwitch) {
  const navItems = document.querySelectorAll('.nav-item[data-section]');

  function switchTo(sectionName, updateHash = true) {
    // Hide all panels
    document.querySelectorAll('.section-panel').forEach(p => {
      p.classList.add('hidden');
    });

    // Show target
    const target = document.getElementById(`section-${sectionName}`);
    if (target) target.classList.remove('hidden');

    // Update nav active state
    navItems.forEach(item => {
      item.classList.toggle('active', item.dataset.section === sectionName);
    });

    // Update topbar title
    const titleEl = document.getElementById('topbar-title');
    if (titleEl && sections[sectionName]) {
      titleEl.textContent = sections[sectionName];
    }

    if (updateHash) history.replaceState(null, '', `#${sectionName}`);

    // Callback for section-specific data loading
    if (typeof onSwitch === 'function') onSwitch(sectionName);

    // Close sidebar on mobile
    if (window.innerWidth <= 1024) {
      document.getElementById('sidebar')?.classList.remove('open');
      document.getElementById('sidebar-overlay')?.classList.remove('active');
      document.body.style.overflow = '';
    }
  }

  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      switchTo(item.dataset.section);
    });
  });

  // Handle initial hash navigation
  const hash = window.location.hash.replace('#', '');
  const initialSection = (hash && sections[hash]) ? hash : Object.keys(sections)[0];
  switchTo(initialSection, false);

  return { switchTo };
}

// ── Toast notification ─────────────────────────────────────────
let _toastTimer = null;

function showToast(message, type = 'info', duration = 3500) {
  let toast = document.getElementById('pm-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'pm-toast';
    toast.style.cssText = `
      position: fixed; bottom: 24px; right: 24px;
      padding: 12px 20px;
      border-radius: 10px;
      font-size: 13px; font-weight: 500;
      font-family: var(--font-body);
      box-shadow: var(--shadow-lg);
      z-index: 9999;
      max-width: 320px;
      display: flex; align-items: center; gap: 10px;
      transform: translateY(80px); opacity: 0;
      transition: transform 0.25s cubic-bezier(0.16,1,0.3,1), opacity 0.25s ease;
      pointer-events: none;
    `;
    document.body.appendChild(toast);
  }

  const styles = {
    success: { bg: 'var(--color-success-light)', color: 'var(--color-success)', border: 'rgba(22,163,74,0.2)' },
    error:   { bg: 'var(--color-danger-light)',  color: 'var(--color-danger)',  border: 'rgba(220,38,38,0.2)' },
    warning: { bg: 'var(--color-warning-light)', color: 'var(--color-warning)', border: 'rgba(217,119,6,0.2)' },
    info:    { bg: 'var(--color-primary-light)', color: 'var(--color-primary)', border: 'var(--color-primary-ring)' },
  };

  const s = styles[type] || styles.info;
  toast.style.background = s.bg;
  toast.style.color       = s.color;
  toast.style.border      = `1px solid ${s.border}`;
  toast.textContent       = message;

  // Animate in
  requestAnimationFrame(() => {
    toast.style.transform = 'translateY(0)';
    toast.style.opacity   = '1';
  });

  // Auto dismiss
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => {
    toast.style.transform = 'translateY(80px)';
    toast.style.opacity   = '0';
  }, duration);
}

// ── Populate user info in sidebar ─────────────────────────────
function renderSidebarUser(user) {
  const nameEl   = document.getElementById('sidebar-user-name');
  const roleEl   = document.getElementById('sidebar-user-role');
  const avatarEl = document.getElementById('user-avatar');

  const displayName = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username;
  const initials    = displayName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  if (nameEl)   nameEl.textContent   = displayName;
  if (roleEl)   roleEl.textContent   = user.role?.charAt(0).toUpperCase() + user.role?.slice(1);
  if (avatarEl) avatarEl.textContent = initials;
}

// ── Health status helper ───────────────────────────────────────
function healthBadge(status) {
  const map = {
    healthy:  'badge-health-healthy',
    at_risk:  'badge-health-at_risk',
    critical: 'badge-health-critical',
    offline:  'badge-health-offline',
  };
  const label = status ? status.replace('_', ' ') : '—';
  const cls   = map[status] || 'badge-muted';
  return `<span class="badge ${cls}">${label}</span>`;
}

function healthDot(status) {
  return `<span class="health-dot ${status || 'offline'}" aria-hidden="true"></span>`;
}

function failureBadge(predicted) {
  return predicted
    ? `<span class="badge badge-danger">Yes</span>`
    : `<span class="badge badge-success">No</span>`;
}

function roleBadge(role) {
  const cls = role === 'admin' ? 'badge-role-admin' : 'badge-role-operator';
  return `<span class="badge ${cls}">${role}</span>`;
}

// ── Skeleton helpers ───────────────────────────────────────────
function skeletonRows(cols, count = 5) {
  const cells = Array.from({ length: cols }, () =>
    `<td><div class="skeleton sk-text" style="width:${60 + Math.random()*30}%"></div></td>`
  ).join('');
  return Array.from({ length: count }, () => `<tr>${cells}</tr>`).join('');
}

function skeletonMachineCards(count = 4) {
  return Array.from({ length: count }, () => `
    <div class="machine-card-skeleton">
      <div class="skeleton sk-h" style="width:40%;margin-bottom:8px"></div>
      <div class="skeleton sk-text" style="width:65%;margin-bottom:6px"></div>
      <div class="skeleton sk-text" style="width:50%"></div>
      <div class="skeleton sk-block" style="margin-top:12px;height:36px"></div>
    </div>
  `).join('');
}