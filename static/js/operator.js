/* =============================================================
   OPERATOR.JS — Operator Dashboard Logic
   Depends on: api.js (must be loaded FIRST)
   All DOM IDs match operator.html v2
   ============================================================= */
'use strict';

// ── Section titles (match data-section attrs in HTML) ──────────
const OP_SECTIONS = {
  predict:  'Run Prediction',
  history:  'My History',
  machines: 'Machine Status',
  alerts:   'Alerts',
};

// ── State ──────────────────────────────────────────────────────
const _op = {
  historyLoaded:  false,
  machinesLoaded: false,
  alertsLoaded:   false,
};

// ── Bootstrap ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // 1. Restore session & auth guard
  if (!window.PM?.auth?.accessToken) {
    window.location.href = '/';
    return;
  }

  let profile;
  try {
    profile = await apiGet('/auth/profile/');
    window.PM.auth.user = profile;
    saveSession();
  } catch (e) {
    window.location.href = '/';
    return;
  }

  // 2. Populate sidebar user info
  renderSidebarUser(profile);

  // 3. Show admin panel link if user is admin
  if (profile.role === 'admin') {
    const wrap = document.getElementById('admin-link-wrap');
    if (wrap) wrap.style.display = 'block';
  }

  // 4. Wire up chrome
  initTheme();
  startLiveClock('live-clock');
  initOpSidebar();
  initOpNav();
  initOpThemeToggle();
  initOpLogout();
  initPredictForm();

  // 5. Load initial data
  loadOpKPIs();
  loadAlertBadge();
});

// ── Theme ──────────────────────────────────────────────────────
function initOpThemeToggle() {
  document.getElementById('theme-toggle-btn')?.addEventListener('click', () => {
    toggleTheme();
  });
}

// ── Sidebar ────────────────────────────────────────────────────
function initOpSidebar() {
  const sidebar  = document.getElementById('sidebar');
  const overlay  = document.getElementById('sidebar-overlay');
  const openBtn  = document.getElementById('topbar-menu-btn');
  const closeBtn = document.getElementById('sidebar-close-btn');

  const open  = () => {
    sidebar?.classList.add('open');
    overlay?.classList.add('active');
    document.body.style.overflow = 'hidden';
  };
  const close = () => {
    sidebar?.classList.remove('open');
    overlay?.classList.remove('active');
    document.body.style.overflow = '';
  };

  openBtn?.addEventListener('click', open);
  closeBtn?.addEventListener('click', close);
  overlay?.addEventListener('click', close);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
}

// ── Navigation ─────────────────────────────────────────────────
function initOpNav() {
  const navItems = document.querySelectorAll('.nav-item[data-section]');

  function switchTo(name) {
    // Hide all panels
    document.querySelectorAll('.section-panel').forEach(p => p.classList.add('hidden'));

    // Show target panel
    const panel = document.getElementById(`section-${name}`);
    if (panel) panel.classList.remove('hidden');

    // Update nav active state
    navItems.forEach(item => item.classList.toggle('active', item.dataset.section === name));

    // Update topbar title
    const titleEl = document.getElementById('topbar-title');
    if (titleEl) titleEl.textContent = OP_SECTIONS[name] || name;

    // Close sidebar on mobile
    if (window.innerWidth <= 1024) {
      document.getElementById('sidebar')?.classList.remove('open');
      document.getElementById('sidebar-overlay')?.classList.remove('active');
      document.body.style.overflow = '';
    }

    // Lazy-load section data
    if (name === 'history'  && !_op.historyLoaded)  { loadHistory();  _op.historyLoaded  = true; }
    if (name === 'machines' && !_op.machinesLoaded) { loadMachines(); _op.machinesLoaded = true; }
    if (name === 'alerts'   && !_op.alertsLoaded)   { loadAlerts();   _op.alertsLoaded   = true; }
  }

  navItems.forEach(item => {
    item.addEventListener('click', e => { e.preventDefault(); switchTo(item.dataset.section); });
    item.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); switchTo(item.dataset.section); }
    });
  });

  // Hash routing
  const hash = location.hash.replace('#', '');
  const initial = OP_SECTIONS[hash] ? hash : 'predict';
  switchTo(initial);

  // Wire refresh buttons (lazily - they exist when section is shown)
  document.getElementById('refresh-history-btn')?.addEventListener('click', () => {
    _op.historyLoaded = false; loadHistory(); _op.historyLoaded = true;
  });
  document.getElementById('refresh-machines-btn')?.addEventListener('click', () => {
    _op.machinesLoaded = false; loadMachines(); _op.machinesLoaded = true;
  });
  document.getElementById('refresh-alerts-btn')?.addEventListener('click', () => {
    _op.alertsLoaded = false; loadAlerts(); _op.alertsLoaded = true;
  });
}

// ── Logout ─────────────────────────────────────────────────────
function initOpLogout() {
  document.getElementById('logout-btn')?.addEventListener('click', async () => {
    showToast('Signing out…', 'info', 1500);
    await apiLogout();
    window.location.href = '/';
  });
}

// ── KPIs (operator stats) ──────────────────────────────────────
async function loadOpKPIs() {
  try {
    const d = await apiGet('/dashboard/operator-stats/');

    const total   = d.total_predictions ?? 0;
    const failures = d.total_failures   ?? 0;
    const healthy = total - failures;
    const rate    = d.failure_rate_percent ?? (total > 0 ? ((failures / total) * 100).toFixed(1) : 0);

    // Animate counts
    animateCount('op-stat-total',    total);
    animateCount('op-stat-failures', failures);
    animateCount('op-stat-healthy',  healthy);
    setText('op-stat-rate', rate + '%');
  } catch (e) {
    console.warn('[Operator] KPI load failed:', e.message);
  }
}

// ── Alert badge (nav badge) ────────────────────────────────────
async function loadAlertBadge() {
  try {
    const data  = await apiGet('/predictions/alerts/?limit=10');
    const count = Array.isArray(data) ? data.length : 0;
    const badge = document.getElementById('alerts-badge');
    if (badge && count > 0) {
      badge.textContent = count > 9 ? '9+' : count;
      badge.classList.remove('hidden');
    }
  } catch (_) { /* non-critical */ }
}

// ── Prediction form ────────────────────────────────────────────
function initPredictForm() {
  const form    = document.getElementById('predict-form');
  const submitBtn = document.getElementById('predict-submit-btn');
  const errEl   = document.getElementById('predict-error');
  if (!form) return;

  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (errEl) { errEl.classList.add('hidden'); errEl.textContent = ''; }

    const payload = buildPredictPayload();
    const validationErr = validatePredictPayload(payload);
    if (validationErr) {
      showPredictError(errEl, validationErr);
      return;
    }

    setBtnLoading(submitBtn, true);
    try {
      const result = await apiPost('/predictions/predict/', payload);
      renderPredictResult(result);
      // Refresh KPIs and badge after new prediction
      loadOpKPIs();
      loadAlertBadge();
      // Invalidate history cache so next visit reloads
      _op.historyLoaded = false;
    } catch (err) {
      showPredictError(errEl, err.message || 'Prediction failed — check server connection.');
    } finally {
      setBtnLoading(submitBtn, false);
    }
  });
}

function buildPredictPayload() {
  return {
    machine_id:          document.getElementById('machine-id-input')?.value.trim() || 'M001',
    machine_type:        document.getElementById('machine-type-input')?.value,
    air_temperature:     parseFloat(document.getElementById('air-temp-input')?.value),
    process_temperature: parseFloat(document.getElementById('process-temp-input')?.value),
    rotational_speed:    parseInt(document.getElementById('rot-speed-input')?.value, 10),
    torque:              parseFloat(document.getElementById('torque-input')?.value),
    tool_wear:           parseInt(document.getElementById('tool-wear-input')?.value, 10),
  };
}

function validatePredictPayload(p) {
  if (!p.machine_type)               return 'Please select a machine type.';
  if (!p.machine_id)                 return 'Machine ID is required.';
  if (isNaN(p.air_temperature))      return 'Air temperature is required (numeric).';
  if (isNaN(p.process_temperature))  return 'Process temperature is required (numeric).';
  if (isNaN(p.rotational_speed))     return 'Rotational speed is required (numeric).';
  if (isNaN(p.torque))               return 'Torque is required (numeric).';
  if (isNaN(p.tool_wear))            return 'Tool wear is required (numeric).';
  return null;
}

function setBtnLoading(btn, loading) {
  if (!btn) return;
  btn.disabled = loading;
  btn.innerHTML = loading
    ? `<svg class="spin" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Running…`
    : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polygon points="5 3 19 12 5 21 5 3"/></svg> Run Prediction`;
}

function showPredictError(el, msg) {
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
}

function renderPredictResult(r) {
  // Hide empty state, show result
  const emptyEl  = document.getElementById('result-empty');
  const outputEl = document.getElementById('result-output');
  if (emptyEl)  emptyEl.classList.add('hidden');
  if (outputEl) outputEl.classList.remove('hidden');

  const isFailure = r.predicted_failure;

  // ── Banner ──────────────────────────────────────────────────
  const banner = document.getElementById('result-banner');
  if (banner) banner.className = `result-status-banner ${isFailure ? 'failure' : 'healthy'}`;

  // ── Icon ────────────────────────────────────────────────────
  const iconEl = document.getElementById('result-icon');
  if (iconEl) {
    iconEl.innerHTML = isFailure
      ? `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`
      : `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
  }

  // ── Banner labels ───────────────────────────────────────────
  setText('result-label',
    isFailure ? '⚠ Failure Detected' : '✓ Machine Healthy');
  setText('result-failure-type',
    isFailure ? `Failure Type: ${r.failure_type || 'Unknown'}` : 'Operating within normal parameters');

  // ── Health status — UPPERCASE, replace underscores ──────────
  const rawHealth  = (r.health_status || '').replace(/_/g, ' ');
  const healthStr  = rawHealth.toUpperCase() || '—';

  // ── Confidence / failure probability ────────────────────────
  // Backend returns confidence as 0–1 float (e.g. 0.7406)
  let confidenceStr = '—';
  if (r.confidence != null) {
    confidenceStr = (r.confidence * 100).toFixed(2) + '%';
  }

  // ── Failure type display ─────────────────────────────────────
  const failureStr = r.failure_type || '—';

  // ── Inference latency (replaces Tool Wear) ───────────────────
  const latencyStr = r.inference_time_ms != null ? r.inference_time_ms + ' ms' : '—';

  // ── Update metric card labels depending on failure state ─────
  // Label for card 2: "Failure Probability" if failure, else "Prediction Confidence"
  const probLabelEl = document.getElementById('res-prob-label');
  if (probLabelEl) {
    probLabelEl.textContent = isFailure ? 'FAILURE PROBABILITY' : 'PREDICTION CONFIDENCE';
  }

  // Update metric values
  setText('res-health',       healthStr);
  setText('res-probability',  confidenceStr);
  setText('res-failure-type', failureStr);
  setText('res-latency',      latencyStr);

  // Apply color to probability value
  const probEl = document.getElementById('res-probability');
  if (probEl) {
    probEl.className = 'result-metric-value ' + (isFailure ? 'text-danger' : 'text-success');
  }

  // ── Structured recommendation block ──────────────────────────
  const recEl = document.getElementById('result-recommendation');
  if (recEl) {
    if (isFailure) {
      recEl.innerHTML = `
        <div class="recommendation recommendation--danger">
          <div class="rec-headline">⚠ Immediate action recommended</div>
          <div class="rec-grid">
            <div class="rec-row"><span class="rec-key">Failure Type</span><span class="rec-val">${esc(r.failure_type || 'Unknown')}</span></div>
            <div class="rec-row"><span class="rec-key">Confidence</span><span class="rec-val">${confidenceStr}</span></div>
            <div class="rec-row"><span class="rec-key">Machine</span><span class="rec-val">${esc(r.machine_id || '—')}</span></div>
          </div>
        </div>`;
    } else {
      recEl.innerHTML = `
        <div class="recommendation recommendation--ok">
          <div class="rec-headline">✓ Machine operating normally</div>
          <div class="rec-grid">
            <div class="rec-row"><span class="rec-key">Prediction Confidence</span><span class="rec-val">${confidenceStr}</span></div>
            <div class="rec-row"><span class="rec-key">Machine</span><span class="rec-val">${esc(r.machine_id || '—')}</span></div>
          </div>
          <div class="rec-note">Continue routine monitoring.</div>
        </div>`;
    }
  }

  // ── Entrance animation ───────────────────────────────────────
  if (outputEl) {
    outputEl.style.opacity = '0';
    outputEl.style.transform = 'translateY(10px)';
    requestAnimationFrame(() => {
      outputEl.style.transition = 'opacity 300ms ease, transform 300ms ease';
      outputEl.style.opacity = '1';
      outputEl.style.transform = 'translateY(0)';
    });
  }

  // ── Toast ────────────────────────────────────────────────────
  showToast(
    isFailure ? `⚠ Failure detected on ${r.machine_id}` : `✓ ${r.machine_id} is healthy`,
    isFailure ? 'error' : 'success'
  );
}

// ── History ────────────────────────────────────────────────────
async function loadHistory() {
  const tbody = document.getElementById('history-tbody');
  if (!tbody) return;
  tbody.innerHTML = skeletonRows(8, 9);

  try {
    const data = await apiGet('/predictions/history/?limit=100');
    const rows = Array.isArray(data) ? data : data.results || [];

    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="9" class="table-empty">
        No predictions yet. Run a prediction on the <em>Run Prediction</em> tab.
      </td></tr>`;
      return;
    }

    tbody.innerHTML = rows.map(row => {
      // inference_time_ms IS in the serializer — display it
      const latency = row.inference_time_ms != null && row.inference_time_ms > 0
        ? `${row.inference_time_ms} ms` : '—';

      return `
        <tr>
          <td><strong>${esc(row.machine_id ?? '—')}</strong></td>
          <td class="font-mono">${esc(row.machine_type ?? '—')}</td>
          <td>${failureBadge(row.predicted_failure)}</td>
          <td>${esc(row.failure_type || '—')}</td>
          <td>${healthBadge(row.health_status)}</td>
          <td class="font-mono">${row.tool_wear != null ? row.tool_wear + ' min' : '—'}</td>
          <td class="font-mono">${row.torque != null ? row.torque + ' Nm' : '—'}</td>
          <td class="font-mono text-muted">${latency}</td>
          <td class="text-muted">${fmtDate(row.created_at)}</td>
        </tr>`;
    }).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="9" class="table-empty table-error">Failed to load history — ${esc(e.message)}</td></tr>`;
  }
}

// ── Machines ───────────────────────────────────────────────────
async function loadMachines() {
  const grid = document.getElementById('machine-grid');
  if (!grid) return;
  grid.innerHTML = skeletonMachineCards(6);

  try {
    const data = await apiGet('/machines/status/');
    const machines = Array.isArray(data) ? data : data.results || [];

    if (!machines.length) {
      grid.innerHTML = `
        <div style="grid-column:1/-1;text-align:center;padding:var(--space-12) var(--space-4);color:var(--color-text-faint);">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" style="margin:0 auto var(--space-3);display:block"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8m-4-4v4"/></svg>
          No machines registered yet.
        </div>`;
      return;
    }

    grid.innerHTML = machines.map(m => {
      const health = m.current_health_status ?? m.health_status ?? 'offline';
      const lastCheck = m.last_prediction_at || m.last_prediction_time;
      return `
        <article class="machine-card ${esc(health)}" tabindex="0" role="article">
          <div class="machine-card-top">
            <div>
              <div class="machine-id-label">${esc(m.machine_id ?? '—')}</div>
              <div class="machine-name">${esc(m.name ?? m.machine_name ?? '—')}</div>
            </div>
            ${healthBadge(health)}
          </div>
          <div class="machine-meta-row">
            <span class="machine-meta-item">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/></svg>
              ${esc(m.machine_type ?? '—')} type
            </span>
            <span class="machine-meta-item">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              ${esc(m.location ?? '—')}
            </span>
            <span class="machine-meta-item">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              ${m.failure_count ?? 0} failures
            </span>
          </div>
          <div class="machine-last-check">
            ${lastCheck ? 'Last check: ' + fmtDate(lastCheck) : 'No checks recorded yet'}
          </div>
        </article>
      `;
    }).join('');
  } catch (e) {
    grid.innerHTML = `<div style="grid-column:1/-1" class="table-error">Failed to load machines — ${esc(e.message)}</div>`;
  }
}

// ── Alerts ─────────────────────────────────────────────────────
async function loadAlerts() {
  const feed = document.getElementById('alerts-feed');
  if (!feed) return;
  feed.innerHTML = `<div class="table-empty" style="padding:var(--space-8)">Loading alerts…</div>`;

  try {
    const data   = await apiGet('/predictions/alerts/?limit=25');
    const alerts = Array.isArray(data) ? data : [];

    if (!alerts.length) {
      feed.innerHTML = `
        <div class="table-empty" style="padding:var(--space-12) var(--space-4)">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" style="color:var(--color-success);margin:0 auto var(--space-3);display:block"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          <strong style="display:block;margin-bottom:4px;color:var(--color-text-muted)">All Clear</strong>
          No recent failure alerts — machines are operating normally.
        </div>`;
      return;
    }

    feed.innerHTML = alerts.map(a => {
      // Inference latency from serializer field
      const latencyPart = a.inference_time_ms != null && a.inference_time_ms > 0
        ? `<span class="alert-chip">⚡ ${a.inference_time_ms}ms</span>` : '';

      return `
        <div class="alert-item fade-in">
          <div class="alert-item-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>
          <div class="alert-item-body">
            <div class="alert-item-title">
              <strong>${esc(a.machine_id ?? '—')}</strong>
              <span class="alert-sep">·</span>
              ${esc(a.failure_type || 'Failure Detected')}
            </div>
            <div class="alert-item-meta">
              <span>By <strong>${esc(a.username ?? '—')}</strong></span>
              <span class="meta-dot">·</span>
              <span>${fmtDate(a.created_at)}</span>
              ${a.air_temperature != null ? `<span class="meta-dot">·</span><span>Air: ${a.air_temperature}K</span>` : ''}
              ${a.rotational_speed != null ? `<span class="meta-dot">·</span><span>RPM: ${a.rotational_speed}</span>` : ''}
              ${a.tool_wear != null ? `<span class="meta-dot">·</span><span>Wear: ${a.tool_wear}min</span>` : ''}
              ${a.torque != null ? `<span class="meta-dot">·</span><span>Torque: ${a.torque}Nm</span>` : ''}
            </div>
            <div class="alert-item-chips">${latencyPart}</div>
          </div>
          <div class="alert-item-badge">${healthBadge(a.health_status)}</div>
        </div>`;
    }).join('');
  } catch (e) {
    feed.innerHTML = `<div class="table-empty table-error">Failed to load alerts — ${esc(e.message)}</div>`;
  }
}

// ── Utility helpers ────────────────────────────────────────────
function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
