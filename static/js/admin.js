/* =============================================================
   ADMIN.JS — Admin dashboard logic
   Depends on: api.js (must be loaded first)
   ============================================================= */
'use strict';

// ── Section metadata ───────────────────────────────────────────
const ADMIN_SECTIONS = {
  overview:    'Overview',
  predictions: 'Predictions',
  machines:    'Machines',
  users:       'User Management',
  charts:      'Analytics & Charts',
};

// ── State ──────────────────────────────────────────────────────
const _state = {
  dashboardStats: null,
  predictions:    [],
  machines:       [],
  users:          [],
  alerts:         [],
  chartsInitialized: false,
  charts: {},
};

// ── Bootstrap ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // 1. Auth guard — only admins allowed
  const profile = await requireAuth('admin');
  if (!profile) return; // redirect happens inside requireAuth

  // 2. Populate user info
  renderSidebarUser(profile);

  // 3. Wire up UI chrome
  initTheme();
  startLiveClock('live-clock');
  initAdminSidebar();
  initAdminNav();
  initAdminThemeToggle();
  initLogout();
  initAddUserDrawer();

  // 4. Load all data concurrently
  await loadAllData();
});

// ── Auth + sidebar + nav ───────────────────────────────────────
function initAdminSidebar() {
  const sidebar  = document.getElementById('sidebar');
  const overlay  = document.getElementById('sidebar-overlay');
  const openBtn  = document.getElementById('topbar-menu-btn');
  const closeBtn = document.getElementById('sidebar-close-btn');

  const open  = () => { sidebar.classList.add('open'); overlay.classList.add('active'); document.body.style.overflow = 'hidden'; };
  const close = () => { sidebar.classList.remove('open'); overlay.classList.remove('active'); document.body.style.overflow = ''; };

  openBtn?.addEventListener('click', open);
  closeBtn?.addEventListener('click', close);
  overlay?.addEventListener('click', close);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
}

function initAdminNav() {
  const navItems = document.querySelectorAll('.nav-item[data-section]');

  function switchSection(name) {
    // Hide all panels
    document.querySelectorAll('.section-panel').forEach(p => p.classList.add('hidden'));

    // Show target
    const panel = document.getElementById(`section-${name}`);
    if (panel) panel.classList.remove('hidden');

    // Update nav active state
    navItems.forEach(item => item.classList.toggle('active', item.dataset.section === name));

    // Update topbar title
    const titleEl = document.getElementById('topbar-title');
    if (titleEl) titleEl.textContent = ADMIN_SECTIONS[name] || name;

    // Close sidebar on mobile
    if (window.innerWidth <= 1024) {
      document.getElementById('sidebar')?.classList.remove('open');
      document.getElementById('sidebar-overlay')?.classList.remove('active');
      document.body.style.overflow = '';
    }

    // Lazy-initialize charts when charts section is shown
    if (name === 'charts' && !_state.chartsInitialized) {
      setTimeout(renderAllCharts, 50);
      _state.chartsInitialized = true;
    }
    if (name === 'overview' && _state.dashboardStats) {
      setTimeout(() => renderOverviewCharts(_state.dashboardStats), 50);
    }
  }

  navItems.forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      switchSection(item.dataset.section);
    });
    item.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); switchSection(item.dataset.section); }
    });
  });

  // Handle URL hash
  const hash = location.hash.replace('#', '');
  const initial = ADMIN_SECTIONS[hash] ? hash : 'overview';
  switchSection(initial);
}

function initAdminThemeToggle() {
  document.getElementById('theme-toggle-btn')?.addEventListener('click', () => {
    const next = toggleTheme();
    if (_state.chartsInitialized) setTimeout(renderAllCharts, 50);
  });
}

function initLogout() {
  document.getElementById('logout-btn')?.addEventListener('click', async () => {
    showToast('Signing out…', 'info', 1500);
    await apiLogout();
    window.location.href = '/';
  });
}

// ── Data loading ───────────────────────────────────────────────
async function loadAllData() {
  await Promise.allSettled([
    loadDashboardStats(),
    loadPredictions(),
    loadMachines(),
    loadUsers(),
    loadAlerts(),
  ]);
}

async function loadDashboardStats() {
  try {
    const d = await window.PMApi.getAdminDashboardStats();
    _state.dashboardStats = d;

    // Update KPI cards
    setText('kpi-total-predictions', (d.total_predictions ?? 0).toLocaleString());
    setText('kpi-today-predictions',  (d.today_predictions  ?? 0).toLocaleString());
    setText('kpi-total-failures',     (d.total_failures     ?? 0).toLocaleString());
    setText('kpi-failure-rate',       `${d.failure_rate_percent ?? 0}%`);
    setText('kpi-active-machines',    (d.total_machines     ?? 0).toLocaleString());

    renderOverviewCharts(d);
  } catch (err) {
    console.error('[Admin] stats error:', err.message);
    showToast('Failed to load dashboard stats', 'error');
  }
}

async function loadPredictions() {
  const tbody = document.getElementById('predictions-tbody');
  if (!tbody) return;
  tbody.innerHTML = skeletonRows(9, 6);

  try {
    const data = await window.PMApi.getPredictionHistory();
    _state.predictions = Array.isArray(data) ? data : data.results || [];
    renderPredictionsTable();
  } catch (err) {
    console.error('[Admin] predictions error:', err.message);
    if (tbody) tbody.innerHTML = `<tr><td colspan="9" class="table-empty text-danger">Failed to load predictions.</td></tr>`;
  }
}

async function loadMachines() {
  const tbody = document.getElementById('machines-tbody');
  if (!tbody) return;
  tbody.innerHTML = skeletonRows(7, 5);

  try {
    const data = await window.PMApi.getMachineStatus();
    _state.machines = Array.isArray(data) ? data : data.results || [];
    renderMachinesTable();
  } catch (err) {
    console.error('[Admin] machines error:', err.message);
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="table-empty text-danger">Failed to load machines.</td></tr>`;
  }
}

async function loadUsers() {
  const tbody = document.getElementById('users-tbody');
  if (!tbody) return;
  tbody.innerHTML = skeletonRows(6, 4);

  try {
    const data = await window.PMApi.getUsers();
    _state.users = Array.isArray(data) ? data : data.results || [];
    renderUsersTable();
  } catch (err) {
    console.error('[Admin] users error:', err.message);
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="table-empty text-danger">Failed to load users.</td></tr>`;
  }
}

async function loadAlerts() {
  const feed = document.getElementById('alerts-feed');
  if (!feed) return;

  try {
    const data = await window.PMApi.getAlerts();
    _state.alerts = Array.isArray(data) ? data.slice(0, 10) : [];
    renderAlertsFeed();
  } catch (err) {
    console.error('[Admin] alerts error:', err.message);
    if (feed) feed.innerHTML = `<div class="table-empty" style="padding:var(--space-6)">Failed to load alerts.</div>`;
  }
}

// ── Render functions ───────────────────────────────────────────
function renderPredictionsTable() {
  const tbody = document.getElementById('predictions-tbody');
  if (!tbody) return;

  if (!_state.predictions.length) {
    tbody.innerHTML = `<tr><td colspan="9" class="table-empty">No predictions found. Run a prediction to see data here.</td></tr>`;
    return;
  }

  tbody.innerHTML = _state.predictions.map(p => `
    <tr>
      <td class="text-muted font-mono">#${p.id ?? '—'}</td>
      <td><strong>${esc(p.machine_id ?? '—')}</strong></td>
      <td>${esc(p.machine_type ?? '—')}</td>
      <td>${esc(p.username ?? p.user ?? '—')}</td>
      <td>${failureBadge(p.predicted_failure)}</td>
      <td>${esc(p.failure_type || '—')}</td>
      <td>${healthBadge(p.health_status ?? p.current_health_status)}</td>
      <td class="font-mono">${p.tool_wear != null ? p.tool_wear + ' min' : '—'}</td>
      <td class="text-muted">${fmtDate(p.created_at)}</td>
    </tr>
  `).join('');
}

function renderMachinesTable() {
  const tbody = document.getElementById('machines-tbody');
  if (!tbody) return;

  if (!_state.machines.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="table-empty">No machines registered. Use the seed command to add demo machines.</td></tr>`;
    return;
  }

  tbody.innerHTML = _state.machines.map(m => `
    <tr>
      <td><strong class="font-mono">${esc(m.machine_id ?? '—')}</strong></td>
      <td>${esc(m.name ?? m.machine_name ?? '—')}</td>
      <td>${esc(m.machine_type ?? '—')}</td>
      <td>${esc(m.location ?? '—')}</td>
      <td>${healthBadge(m.current_health_status ?? m.health_status)}</td>
      <td class="font-mono">${m.failure_count ?? 0}</td>
      <td class="text-muted">${fmtDate(m.last_prediction_at || m.last_prediction_time)}</td>
    </tr>
  `).join('');
}

function renderUsersTable() {
  const tbody = document.getElementById('users-tbody');
  if (!tbody) return;

  if (!_state.users.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="table-empty">No users found.</td></tr>`;
    return;
  }

  tbody.innerHTML = _state.users.map(u => `
    <tr>
      <td><strong>${esc(u.username ?? '—')}</strong></td>
      <td>${esc([u.first_name, u.last_name].filter(Boolean).join(' ') || '—')}</td>
      <td class="text-muted">${esc(u.email ?? '—')}</td>
      <td>${roleBadge(u.role)}</td>
      <td>
        <span class="badge ${u.is_active !== false ? 'badge-success' : 'badge-danger'}">
          ${u.is_active !== false ? 'Active' : 'Inactive'}
        </span>
      </td>
      <td class="text-muted">${fmtDateShort(u.created_at || u.date_joined)}</td>
    </tr>
  `).join('');
}

function renderAlertsFeed() {
  const feed = document.getElementById('alerts-feed');
  if (!feed) return;

  if (!_state.alerts.length) {
    feed.innerHTML = `
      <div class="table-empty" style="padding:var(--space-8)">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--color-success);margin:0 auto var(--space-3)"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        <div>No recent alerts — all machines operating normally.</div>
      </div>`;
    return;
  }

  feed.innerHTML = _state.alerts.map(a => `
    <div class="activity-item">
      <div class="activity-dot" style="background:${a.health_status === 'critical' ? 'var(--color-danger)' : 'var(--color-warning)'}"></div>
      <div class="activity-info">
        <div class="activity-text">
          <strong>${esc(a.machine_id ?? '—')}</strong> — ${esc(a.failure_type || 'Failure detected')}
          <span class="text-muted" style="margin-left:var(--space-2)">by ${esc(a.username ?? '—')}</span>
        </div>
        <div class="activity-meta">${fmtDate(a.created_at)}</div>
      </div>
      <div>${healthBadge(a.health_status)}</div>
    </div>
  `).join('');
}

// ── Add User Drawer ────────────────────────────────────────────
function initAddUserDrawer() {
  const drawer   = document.getElementById('add-user-drawer');
  const toggleBtn = document.getElementById('toggle-add-user-btn');
  const cancelBtn = document.getElementById('cancel-add-user-btn');
  const form     = document.getElementById('create-user-form');
  const msgEl    = document.getElementById('create-user-msg');

  toggleBtn?.addEventListener('click', () => {
    const shown = drawer.style.display !== 'none';
    drawer.style.display = shown ? 'none' : 'block';
    drawer.setAttribute('aria-hidden', shown ? 'true' : 'false');
    if (!shown) document.getElementById('new-username')?.focus();
  });

  cancelBtn?.addEventListener('click', () => {
    drawer.style.display = 'none';
    drawer.setAttribute('aria-hidden', 'true');
    form?.reset();
    if (msgEl) { msgEl.textContent = ''; msgEl.className = 'form-feedback'; }
  });

  form?.addEventListener('submit', async e => {
    e.preventDefault();
    const submitBtn = document.getElementById('create-user-submit-btn');

    const payload = {
      username:   document.getElementById('new-username')?.value.trim(),
      email:      document.getElementById('new-email')?.value.trim(),
      password:   document.getElementById('new-password')?.value,
      role:       document.getElementById('new-role')?.value,
      first_name: document.getElementById('new-first-name')?.value.trim() || '',
      last_name:  document.getElementById('new-last-name')?.value.trim() || '',
    };

    if (!payload.username || !payload.email || !payload.password) {
      showFeedback(msgEl, 'Username, email, and password are required.', 'error');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating…';

    try {
      await window.PMApi.createUser(payload);
      showFeedback(msgEl, `User "${payload.username}" created successfully.`, 'success');
      form.reset();
      await loadUsers();
      showToast(`User "${payload.username}" created`, 'success');
      setTimeout(() => {
        drawer.style.display = 'none';
        drawer.setAttribute('aria-hidden', 'true');
        if (msgEl) { msgEl.textContent = ''; msgEl.className = 'form-feedback'; }
      }, 2000);
    } catch (err) {
      showFeedback(msgEl, err.message || 'Failed to create user.', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Create User`;
    }
  });

  // Refresh buttons
  document.getElementById('refresh-predictions-btn')?.addEventListener('click', loadPredictions);
  document.getElementById('refresh-machines-btn')?.addEventListener('click', loadMachines);
  document.getElementById('refresh-alerts-btn')?.addEventListener('click', loadAlerts);
}

// ── Charts ─────────────────────────────────────────────────────
function getChartColors() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  return {
    text:    isDark ? '#e8eaf0' : '#0d1117',
    muted:   isDark ? '#7c8494' : '#5c6370',
    grid:    isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)',
    palette: ['#0a6e6e','#f59e0b','#dc2626','#16a34a','#6366f1','#0891b2'],
  };
}

function baseChartOptions(colors) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: { color: colors.text, font: { family: 'Inter', size: 11 }, boxWidth: 10 },
      },
      tooltip: {
        backgroundColor: colors.text === '#e8eaf0' ? '#1c2028' : '#fff',
        titleColor: colors.text === '#e8eaf0' ? '#e8eaf0' : '#0d1117',
        bodyColor: colors.muted,
        borderColor: colors.grid,
        borderWidth: 1,
      },
    },
    scales: {
      x: { ticks: { color: colors.muted, font: { size: 10 } }, grid: { color: colors.grid } },
      y: { ticks: { color: colors.muted, font: { size: 10 } }, grid: { color: colors.grid }, beginAtZero: true },
    },
  };
}

function destroyChart(key) {
  if (_state.charts[key]) { _state.charts[key].destroy(); _state.charts[key] = null; }
}

function renderOverviewCharts(stats) {
  const colors = getChartColors();

  // Failure type pie (overview)
  destroyChart('failure-type');
  const failureDist = stats.failure_type_distribution || {};
  const ftLabels = Object.keys(failureDist);
  const ftValues = Object.values(failureDist);
  const ctxFt = document.getElementById('chart-failure-type');
  if (ctxFt && ftLabels.length) {
    _state.charts['failure-type'] = new Chart(ctxFt, {
      type: 'doughnut',
      data: { labels: ftLabels, datasets: [{ data: ftValues, backgroundColor: colors.palette, borderWidth: 0, hoverOffset: 6 }] },
      options: { ...baseChartOptions(colors), scales: undefined, plugins: { ...baseChartOptions(colors).plugins, legend: { position: 'bottom', labels: { color: colors.text, font: { size: 10, family: 'Inter' }, boxWidth: 10, padding: 12 } } } },
    });
  } else if (ctxFt) {
    ctxFt.parentElement.innerHTML = '<div class="chart-empty">No failure data yet</div>';
  }

  // Machine health bar (overview)
  destroyChart('machine-health');
  const healthSummary = stats.machine_health_summary || {};
  const hlLabels = Object.keys(healthSummary);
  const hlValues = Object.values(healthSummary);
  const hlColors = hlLabels.map(l => l === 'healthy' ? '#16a34a' : l === 'at_risk' ? '#f59e0b' : l === 'critical' ? '#dc2626' : '#7c8494');
  const ctxMh = document.getElementById('chart-machine-health');
  if (ctxMh && hlLabels.length) {
    _state.charts['machine-health'] = new Chart(ctxMh, {
      type: 'bar',
      data: { labels: hlLabels, datasets: [{ label: 'Machines', data: hlValues, backgroundColor: hlColors, borderRadius: 6, borderWidth: 0 }] },
      options: { ...baseChartOptions(colors), plugins: { legend: { display: false } } },
    });
  } else if (ctxMh) {
    ctxMh.parentElement.innerHTML = '<div class="chart-empty">No machine data yet</div>';
  }

  // 7-day trend line (overview)
  destroyChart('trend');
  const trend = stats.prediction_trend_7days || [];
  const ctxTr = document.getElementById('chart-trend');
  if (ctxTr && trend.length) {
    _state.charts['trend'] = new Chart(ctxTr, {
      type: 'line',
      data: {
        labels: trend.map(t => t.date),
        datasets: [{ label: 'Predictions', data: trend.map(t => t.count), borderColor: '#0a6e6e', backgroundColor: 'rgba(10,110,110,0.10)', fill: true, tension: 0.4, pointRadius: 4, pointHoverRadius: 6, borderWidth: 2 }],
      },
      options: baseChartOptions(colors),
    });
  } else if (ctxTr) {
    ctxTr.parentElement.innerHTML = '<div class="chart-empty">No trend data yet</div>';
  }
}

function renderAllCharts() {
  if (_state.dashboardStats) renderOverviewCharts(_state.dashboardStats);

  const colors = getChartColors();

  // ── Charts section — full trend ─────────────────────────────
  destroyChart('trend-full');
  const trend = _state.dashboardStats?.prediction_trend_7days || [];
  const ctxTf = document.getElementById('chart-trend-full');
  if (ctxTf) {
    _state.charts['trend-full'] = new Chart(ctxTf, {
      type: 'bar',
      data: {
        labels: trend.map(t => t.date),
        datasets: [{ label: 'Predictions per day', data: trend.map(t => t.count), backgroundColor: 'rgba(10,110,110,0.7)', borderColor: '#0a6e6e', borderRadius: 6, borderWidth: 0 }],
      },
      options: baseChartOptions(colors),
    });
  }

  // ── Charts section — failure type 2 ────────────────────────
  destroyChart('failure-type-2');
  const failureDist = _state.dashboardStats?.failure_type_distribution || {};
  const ftLabels = Object.keys(failureDist);
  const ftValues = Object.values(failureDist);
  const ctxFt2 = document.getElementById('chart-failure-type-2');
  if (ctxFt2 && ftLabels.length) {
    _state.charts['failure-type-2'] = new Chart(ctxFt2, {
      type: 'pie',
      data: { labels: ftLabels, datasets: [{ data: ftValues, backgroundColor: colors.palette, borderWidth: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: colors.text, font: { size: 11, family: 'Inter' } } } } },
    });
  }

  // ── Charts section — machine health 2 ───────────────────────
  destroyChart('machine-health-2');
  const healthSummary = _state.dashboardStats?.machine_health_summary || {};
  const hlLabels = Object.keys(healthSummary);
  const hlValues = Object.values(healthSummary);
  const hlColors = hlLabels.map(l => l === 'healthy' ? '#16a34a' : l === 'at_risk' ? '#f59e0b' : l === 'critical' ? '#dc2626' : '#7c8494');
  const ctxMh2 = document.getElementById('chart-machine-health-2');
  if (ctxMh2 && hlLabels.length) {
    _state.charts['machine-health-2'] = new Chart(ctxMh2, {
      type: 'doughnut',
      data: { labels: hlLabels, datasets: [{ data: hlValues, backgroundColor: hlColors, borderWidth: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: colors.text, font: { size: 11, family: 'Inter' } } } } },
    });
  }
}

// ── Helpers ────────────────────────────────────────────────────
function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showFeedback(el, msg, type) {
  if (!el) return;
  el.textContent = msg;
  el.className = `form-feedback form-feedback--${type}`;
}