/* =============================================================
   LOGIN.JS — Login page logic
   Depends on: api.js (loaded before this)
   ============================================================= */

'use strict';

// ── Init theme immediately ─────────────────────────────────────
initTheme();

// ── DOM refs ───────────────────────────────────────────────────
const loginForm     = document.getElementById('login-form');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const submitBtn     = document.getElementById('login-submit-btn');
const errorBox      = document.getElementById('login-error');
const successBox    = document.getElementById('login-success');
const togglePassBtn = document.getElementById('toggle-password');

// ── If already logged in, redirect ────────────────────────────
(function checkExistingSession() {
  if (window.PM?.auth?.accessToken && window.PM?.auth?.user) {
    redirectByRole(window.PM.auth.user.role);
  }
})();

// ── Password visibility toggle ─────────────────────────────────
togglePassBtn?.addEventListener('click', () => {
  const isPassword = passwordInput.type === 'password';
  passwordInput.type = isPassword ? 'text' : 'password';
  togglePassBtn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
  togglePassBtn.innerHTML = isPassword ? eyeOffIcon() : eyeIcon();
});

// ── Login form submit ──────────────────────────────────────────
loginForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearMessages();

  const username = usernameInput.value.trim();
  const password = passwordInput.value;

  // Client-side validation
  if (!username) {
    showError('Please enter your username.');
    usernameInput.focus();
    return;
  }
  if (!password) {
    showError('Please enter your password.');
    passwordInput.focus();
    return;
  }

  setLoading(true);

  try {
    const data = await apiLogin(username, password);

    // Brief success flash before redirect
    showSuccess(`Welcome back, ${data.user.first_name || data.user.username}!`);

    setTimeout(() => {
      redirectByRole(data.user.role);
    }, 600);

  } catch (err) {
    showError(err.message || 'Login failed. Please try again.');
    // Shake animation on error
    loginForm.classList.add('form-shake');
    setTimeout(() => loginForm.classList.remove('form-shake'), 500);
  } finally {
    setLoading(false);
  }
});

// ── Redirect based on role ─────────────────────────────────────
function redirectByRole(role) {
  if (role === 'admin') {
    window.location.href = '/admin-panel/';
  } else {
    window.location.href = '/operator/';
  }
}

// ── UI helpers ─────────────────────────────────────────────────
function setLoading(on) {
  submitBtn.disabled = on;
  submitBtn.innerHTML = on
    ? `<svg class="spin" width="16" height="16" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" stroke-width="2.5" aria-hidden="true">
         <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
       </svg> Signing in…`
    : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" stroke-width="2" aria-hidden="true">
         <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
         <polyline points="10 17 15 12 10 7"/>
         <line x1="15" y1="12" x2="3" y2="12"/>
       </svg> Sign In`;
}

function clearMessages() {
  errorBox.textContent   = '';
  errorBox.style.display = 'none';
  successBox.textContent   = '';
  successBox.style.display = 'none';
}

function showError(msg) {
  errorBox.textContent   = msg;
  errorBox.style.display = 'flex';
  errorBox.className     = 'alert-inline error login-alert';
}

function showSuccess(msg) {
  successBox.textContent   = msg;
  successBox.style.display = 'flex';
  successBox.className     = 'alert-inline success login-alert';
}

// ── SVG icons for password toggle ─────────────────────────────
function eyeIcon() {
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="2" aria-hidden="true">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>`;
}
function eyeOffIcon() {
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="2" aria-hidden="true">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>`;
}

// ── Enter key on username → focus password ─────────────────────
usernameInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    passwordInput.focus();
  }
});

// ── Input: clear error on type ─────────────────────────────────
[usernameInput, passwordInput].forEach(input => {
  input?.addEventListener('input', () => {
    if (errorBox.style.display !== 'none') clearMessages();
  });
});