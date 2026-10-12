/* ============================================================
   ExpenseIQ — Premium JavaScript (SaaS Edition)
   ============================================================ */

'use strict';

// ── Currency Configuration (Future-Ready) ──────────────────
const currencies = {
  INR: { symbol: '₹', name: 'Indian Rupee',      flag: '🇮🇳', locale: 'en-IN' },
  USD: { symbol: '$', name: 'US Dollar',          flag: '🇺🇸', locale: 'en-US' },
  EUR: { symbol: '€', name: 'Euro',               flag: '🇪🇺', locale: 'de-DE' },
  GBP: { symbol: '£', name: 'British Pound',      flag: '🇬🇧', locale: 'en-GB' },
  JPY: { symbol: '¥', name: 'Japanese Yen',       flag: '🇯🇵', locale: 'ja-JP' },
  CAD: { symbol: 'C$', name: 'Canadian Dollar',   flag: '🇨🇦', locale: 'en-CA' },
  AUD: { symbol: 'A$', name: 'Australian Dollar', flag: '🇦🇺', locale: 'en-AU' },
  AED: { symbol: 'د.إ', name: 'UAE Dirham',       flag: '🇦🇪', locale: 'ar-AE' },
};

const DEFAULT_CURRENCY = 'INR';
const API_BASE = '/api';
const TOKEN_KEY = 'expenseiq_token';

// ── State ──────────────────────────────────────────────────
let expenses = [];
let selectedCurrency = DEFAULT_CURRENCY;
let monthlyBudget = 0;
let editingId = null;
let monthlyChart = null;
let categoryChart = null;
let activeChip = null;
let customDateStart = null;
let customDateEnd = null;
let globalDateFilterVal = 'all';
let globalDateCustomStr = null;
const selectedExpenseIds = new Set();
let currentUser = null;
let currentPage = 'home';

// ── API Client ─────────────────────────────────────────────
function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function setAuthToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function apiRequest(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  const token = getAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    headers,
    ...options,
  });

  if (res.status === 401 && token) {
    setAuthToken(null);
    currentUser = null;
    showAuthenticatedShell(false);
    navigateTo('login');
    throw new Error('Session expired. Please sign in again.');
  }

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const err = await res.json();
      detail = err.detail || detail;
      if (Array.isArray(detail)) detail = detail.map(d => d.msg || d).join(', ');
    } catch (_) { /* ignore */ }
    throw new Error(detail || `Request failed (${res.status})`);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

function apiGet(path) { return apiRequest(path); }
function apiPost(path, body) {
  return apiRequest(path, { method: 'POST', body: JSON.stringify(body) });
}
function apiPut(path, body) {
  return apiRequest(path, { method: 'PUT', body: JSON.stringify(body) });
}
function apiDelete(path, body) {
  return apiRequest(path, {
    method: 'DELETE',
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

async function loadExpenses() {
  expenses = await apiGet('/expenses') || [];
}

async function loadSettings() {
  const settings = await apiGet('/settings');
  if (settings) {
    if (settings.currency && currencies[settings.currency]) {
      selectedCurrency = settings.currency;
    }
    monthlyBudget = parseFloat(settings.monthly_budget) || 0;
  }
}

async function saveSettingsToApi(updates) {
  const payload = {};
  if (updates.currency !== undefined) payload.currency = updates.currency;
  if (updates.monthly_budget !== undefined) payload.monthly_budget = updates.monthly_budget;
  const settings = await apiPut('/settings', payload);
  if (settings.currency && currencies[settings.currency]) {
    selectedCurrency = settings.currency;
  }
  monthlyBudget = parseFloat(settings.monthly_budget) || 0;
  return settings;
}

async function loadInitialData() {
  await Promise.all([loadExpenses(), loadSettings()]);
}

async function migrateLocalStorageIfNeeded() {
  if (expenses.length > 0) return;

  const raw = localStorage.getItem('expenseiq_data');
  if (!raw) return;

  let localExpenses;
  try {
    localExpenses = JSON.parse(raw);
  } catch (_) {
    return;
  }
  if (!Array.isArray(localExpenses) || localExpenses.length === 0) return;

  for (const exp of localExpenses) {
    await apiPost('/expenses', {
      id: exp.id,
      desc: exp.desc || 'Expense',
      amount: exp.amount,
      cat: exp.cat || 'Other',
      date: exp.date,
      currency: exp.currency || selectedCurrency,
    });
  }

  const localBudget = localStorage.getItem('expenseiq_budget');
  const localCurrency = localStorage.getItem('expenseiq_currency');
  const updates = {};
  if (localBudget !== null) updates.monthly_budget = parseFloat(localBudget) || 0;
  if (localCurrency && currencies[localCurrency]) updates.currency = localCurrency;
  if (Object.keys(updates).length > 0) await saveSettingsToApi(updates);

  localStorage.removeItem('expenseiq_data');
  localStorage.removeItem('expenseiq_budget');
  localStorage.removeItem('expenseiq_currency');

  await loadInitialData();
  showToast('Imported existing data from browser storage.', 'success');
}

// ── Auth ───────────────────────────────────────────────────
async function loadCurrentUser() {
  currentUser = await apiGet('/users/me');
  updateSidebarUser();
  return currentUser;
}

async function login(email, password) {
  const data = await apiPost('/auth/login', { email, password });
  setAuthToken(data.access_token);
  currentUser = data.user;
  updateSidebarUser();
  await loadInitialData();
  showAuthenticatedShell(true);
  navigateTo('home');
  showToast(`Welcome back, ${currentUser.full_name}!`, 'success');
}

async function register(fullName, email, password) {
  const data = await apiPost('/auth/register', {
    full_name: fullName,
    email,
    password,
  });
  setAuthToken(data.access_token);
  currentUser = data.user;
  updateSidebarUser();
  await loadInitialData();
  showAuthenticatedShell(true);
  navigateTo('home');
  showToast(`Account created. Welcome, ${currentUser.full_name}!`, 'success');
}

async function logout() {
  try {
    await apiPost('/auth/logout', {});
  } catch (_) { /* ignore if token already invalid */ }
  setAuthToken(null);
  currentUser = null;
  expenses = [];
  closeSidebar();
  showAuthenticatedShell(false);
  navigateTo('login');
  showToast('You have been logged out.', 'info');
}

function updateSidebarUser() {
  if (!currentUser) return;
  const initial = (currentUser.full_name || '?').charAt(0).toUpperCase();
  sidebarAvatar.textContent = initial;
  const headerAvatar = document.getElementById('header-user-avatar');
  if (headerAvatar) headerAvatar.textContent = initial;
  const firstName = (currentUser.full_name || '').trim().split(/\s+/)[0] || 'there';
  const headerName = document.getElementById('header-user-name');
  if (headerName) headerName.textContent = firstName;
  const holder = document.getElementById('hero-card-holder');
  if (holder) holder.textContent = currentUser.full_name || 'Your name';
  updateGreeting();
  sidebarUserName.textContent = currentUser.full_name;
  sidebarUserEmail.textContent = currentUser.email;
}

function showAuthenticatedShell(show) {
  authenticatedShell.hidden = !show;
  viewLogin.classList.toggle('app-view-active', !show);
}

// ── Router ─────────────────────────────────────────────────
const PROTECTED_PAGES = ['home', 'profile', 'audit'];

function navigateTo(page) {
  if (PROTECTED_PAGES.includes(page) && !getAuthToken()) {
    page = 'login';
  }
  if (page === 'login' && getAuthToken()) {
    page = 'home';
  }

  currentPage = page;
  const newHash = `#/${page}`;
  if (location.hash !== newHash) {
    location.hash = newHash;
    return;
  }

  applyPageView(page);
}

function handleHashChange() {
  const defaultPage = getAuthToken() ? 'home' : 'login';
  const hash = location.hash.replace('#/', '') || defaultPage;
  const page = ['home', 'profile', 'audit', 'login'].includes(hash) ? hash : defaultPage;
  currentPage = page;
  applyPageView(page);
}

function applyPageView(page) {
  if (PROTECTED_PAGES.includes(page) && !getAuthToken()) {
    showAuthenticatedShell(false);
    switchAuthTab('login');
    viewLogin.classList.add('app-view-active');
    viewHome.classList.remove('app-view-active');
    viewProfile.classList.remove('app-view-active');
    viewAudit.classList.remove('app-view-active');
    return;
  }

  if (page === 'login') {
    showAuthenticatedShell(false);
  } else if (getAuthToken()) {
    showAuthenticatedShell(true);
  }

  viewLogin.classList.toggle('app-view-active', page === 'login');
  viewHome.classList.toggle('app-view-active', page === 'home');
  viewProfile.classList.toggle('app-view-active', page === 'profile');
  viewAudit.classList.toggle('app-view-active', page === 'audit');

  document.querySelectorAll('.sidebar-link[data-page], .header-nav-link[data-page]').forEach(link => {
    link.classList.toggle('active', link.dataset.page === page);
  });

  if (page === 'profile') renderProfile();
  if (page === 'audit') renderAuditLog();
  if (page === 'home') renderAll();
}

// ── Sidebar ────────────────────────────────────────────────
function openSidebar() {
  appSidebar.classList.add('open');
  sidebarOverlay.classList.add('open');
  appSidebar.setAttribute('aria-hidden', 'false');
  sidebarOverlay.setAttribute('aria-hidden', 'false');
}

function closeSidebar() {
  appSidebar.classList.remove('open');
  sidebarOverlay.classList.remove('open');
  appSidebar.setAttribute('aria-hidden', 'true');
  sidebarOverlay.setAttribute('aria-hidden', 'true');
}

function toggleSidebar() {
  if (appSidebar.classList.contains('open')) closeSidebar();
  else openSidebar();
}

// ── Profile & Audit ────────────────────────────────────────
async function renderProfile() {
  if (!currentUser) {
    try { await loadCurrentUser(); } catch (_) { return; }
  }
  const initial = (currentUser.full_name || '?').charAt(0).toUpperCase();
  profileAvatar.textContent = initial;
  profileNameDisplay.textContent = currentUser.full_name;
  profileEmailDisplay.textContent = currentUser.email;
  profileCreatedDisplay.textContent = formatDateTime(currentUser.created_at);
  profileCurrencyDisplay.textContent = `${getCurrencyObj().symbol} ${selectedCurrency}`;
  profileNameInput.value = currentUser.full_name;
}

async function handleProfileSave(e) {
  e.preventDefault();
  const fullName = profileNameInput.value.trim();
  if (!fullName) {
    showToast('Name cannot be empty.', 'danger');
    return;
  }
  try {
    currentUser = await apiPut('/users/me', { full_name: fullName });
    updateSidebarUser();
    renderProfile();
    showToast('Profile updated.', 'success');
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

// ── Audit Log state ────────────────────────────────────────
let auditLogs = [];   // full dataset from API (newest first)
const auditFilters = { search: '', action: '', type: '', from: '', to: '' };

async function renderAuditLog() {
  try {
    auditLogs = await apiGet('/audit-logs?limit=200') || [];
  } catch (err) {
    showToast(err.message, 'danger');
    return;
  }

  buildAuditColumnMenus();
  applyAuditView();
}

// Build the per-column dropdown menus (Action / Type) from the data present.
function buildAuditColumnMenus() {
  const actions = [...new Set(auditLogs.map(l => l.action).filter(Boolean))].sort();
  const types = [...new Set(auditLogs.map(l => l.entity_type).filter(Boolean))].sort();
  renderAuditColumnMenu(auditMenuAction, actions, 'action', 'All actions');
  renderAuditColumnMenu(auditMenuType, types, 'type', 'All types');
}

function renderAuditColumnMenu(menu, values, filterKey, allLabel) {
  if (!menu) return;
  const current = auditFilters[filterKey];
  const rows = [{ v: '', label: allLabel }, ...values.map(v => ({ v, label: formatAuditLabel(v) }))];
  menu.innerHTML = rows.map(({ v, label }) => {
    const isActive = current === v;
    return `<button type="button" class="audit-col-option${isActive ? ' is-selected' : ''}"
      data-filter-key="${filterKey}" data-value="${escHtml(v)}">
      <span>${escHtml(label)}</span>
      ${isActive ? '<i class="fa-solid fa-check"></i>' : ''}
    </button>`;
  }).join('');
}

// Filter + render, using current auditFilters. Order stays newest-first (API order).
function applyAuditView() {
  const totalEvents = auditLogs.length;

  if (totalEvents === 0) {
    if (auditToolbar) auditToolbar.hidden = true;
    auditEmptyState.hidden = false;
    auditNoResults.hidden = true;
    auditTable.hidden = true;
    auditTbody.innerHTML = '';
    auditCountBadge.textContent = '0 events';
    return;
  }

  if (auditToolbar) auditToolbar.hidden = false;
  auditEmptyState.hidden = true;

  const rows = getFilteredLogs();

  auditCountBadge.textContent = rows.length === totalEvents
    ? `${totalEvents} event${totalEvents === 1 ? '' : 's'}`
    : `${rows.length} of ${totalEvents} events`;

  if (rows.length === 0) {
    auditTable.hidden = true;
    auditNoResults.hidden = false;
    auditTbody.innerHTML = '';
    updateAuditFilterIndicators();
    return;
  }

  auditNoResults.hidden = true;
  auditTable.hidden = false;
  auditTbody.innerHTML = rows.map(log => {
    const badgeClass = getAuditBadgeClass(log.action);
    return `<tr>
      <td>
        <div class="audit-time-primary">${formatRelativeTime(log.created_at)}</div>
        <div class="audit-time-secondary">${formatDateTime(log.created_at)}</div>
      </td>
      <td><span class="audit-badge ${badgeClass}">${escHtml(formatAuditLabel(log.action))}</span></td>
      <td><span class="audit-type">${escHtml(formatAuditLabel(log.entity_type) || '—')}</span></td>
      <td>${escHtml(log.summary)}</td>
    </tr>`;
  }).join('');

  updateAuditFilterIndicators();
}

function getFilteredLogs() {
  const q = auditFilters.search.trim().toLowerCase();
  const fromTs = auditFilters.from ? new Date(auditFilters.from + 'T00:00:00').getTime() : null;
  const toTs = auditFilters.to ? new Date(auditFilters.to + 'T23:59:59.999').getTime() : null;

  return auditLogs.filter(log => {
    if (auditFilters.action && log.action !== auditFilters.action) return false;
    if (auditFilters.type && log.entity_type !== auditFilters.type) return false;

    if (fromTs !== null || toTs !== null) {
      const ts = new Date(log.created_at).getTime();
      if (fromTs !== null && ts < fromTs) return false;
      if (toTs !== null && ts > toTs) return false;
    }

    if (q) {
      const haystack = [log.action, log.entity_type, log.summary]
        .filter(Boolean).join(' ').toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

// Highlight the funnel icon on any column that has an active filter.
function updateAuditFilterIndicators() {
  const activeMap = {
    when: !!(auditFilters.from || auditFilters.to),
    action: !!auditFilters.action,
    type: !!auditFilters.type,
  };
  document.querySelectorAll('.audit-th-filter').forEach(th => {
    th.classList.toggle('audit-col-filtered', !!activeMap[th.dataset.filter]);
  });
  const anyActive = auditFilters.search || auditFilters.action ||
    auditFilters.type || auditFilters.from || auditFilters.to;
  if (auditClearFilters) auditClearFilters.hidden = !anyActive;
}

// Open/close a column dropdown menu.
function toggleAuditColMenu(th) {
  const menu = th.querySelector('.audit-col-menu');
  const btn = th.querySelector('.audit-col-btn');
  if (!menu) return;
  const willOpen = menu.hidden;
  closeAllAuditColMenus();
  menu.hidden = !willOpen;
  if (btn) btn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
}

function closeAllAuditColMenus() {
  document.querySelectorAll('.audit-col-menu').forEach(m => { m.hidden = true; });
  document.querySelectorAll('.audit-col-btn').forEach(b => b.setAttribute('aria-expanded', 'false'));
}

function setAuditFilter(key, value) {
  auditFilters[key] = value;
  if (key === 'action') renderAuditColumnMenu(auditMenuAction, [...new Set(auditLogs.map(l => l.action).filter(Boolean))].sort(), 'action', 'All actions');
  if (key === 'type') renderAuditColumnMenu(auditMenuType, [...new Set(auditLogs.map(l => l.entity_type).filter(Boolean))].sort(), 'type', 'All types');
  applyAuditView();
}

function clearAuditFilters() {
  auditFilters.search = '';
  auditFilters.action = '';
  auditFilters.type = '';
  auditFilters.from = '';
  auditFilters.to = '';
  if (auditSearchInput) auditSearchInput.value = '';
  if (auditFilterFrom) auditFilterFrom.value = '';
  if (auditFilterTo) auditFilterTo.value = '';
  buildAuditColumnMenus();
  closeAllAuditColMenus();
  applyAuditView();
}

// Export the currently filtered rows to CSV.
function exportAuditCSV() {
  const rows = getFilteredLogs();
  if (rows.length === 0) {
    showToast('Nothing to export.', 'danger');
    return;
  }
  const header = ['Timestamp', 'Action', 'Type', 'Summary'];
  const csvEscape = (val) => {
    const s = (val ?? '').toString();
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [header.join(',')];
  rows.forEach(log => {
    lines.push([
      csvEscape(new Date(log.created_at).toISOString()),
      csvEscape(log.action),
      csvEscape(log.entity_type),
      csvEscape(log.summary),
    ].join(','));
  });
  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `audit-log-${todayISO()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast(`Exported ${rows.length} event${rows.length === 1 ? '' : 's'}.`, 'success');
}

// "settings_update" -> "Settings Update", "auth" -> "Auth"
function formatAuditLabel(value) {
  if (!value) return '';
  return value.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function getAuditBadgeClass(action) {
  const map = {
    create: 'audit-badge--create',
    update: 'audit-badge--update',
    delete: 'audit-badge--delete',
    login: 'audit-badge--login',
    logout: 'audit-badge--logout',
    register: 'audit-badge--register',
    settings_update: 'audit-badge--settings_update',
  };
  return map[action] || 'audit-badge--default';
}

function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatRelativeTime(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDateTime(iso);
}

function switchAuthTab(tab) {
  const isLogin = tab === 'login';
  authTabLogin.classList.toggle('auth-tab--active', isLogin);
  authTabRegister.classList.toggle('auth-tab--active', !isLogin);
  authTabLogin.setAttribute('aria-selected', isLogin ? 'true' : 'false');
  authTabRegister.setAttribute('aria-selected', isLogin ? 'false' : 'true');
  loginForm.hidden = !isLogin;
  registerForm.hidden = isLogin;

  if (authCardTitle && authCardSubtitle) {
    if (isLogin) {
      authCardTitle.textContent = 'Welcome back';
      authCardSubtitle.textContent = 'Sign in to continue to your dashboard';
    } else {
      authCardTitle.textContent = 'Create your account';
      authCardSubtitle.textContent = 'Start tracking expenses in minutes';
    }
  }
}

function getCurrencyObj() {
  return currencies[selectedCurrency] || currencies[DEFAULT_CURRENCY];
}

// ── DOM Refs ───────────────────────────────────────────────
const descInput      = document.getElementById('expense-description');
const amountInput    = document.getElementById('expense-amount');
const categoryInput  = document.getElementById('expense-category');
const dateInput      = document.getElementById('expense-date');
const addBtn         = document.getElementById('btn-add-expense');
const clearBtn       = document.getElementById('btn-clear-form');
const openAddBtn     = document.getElementById('btn-open-add-expense');
const searchInput    = document.getElementById('search-input');
const filterCat      = document.getElementById('filter-category');
const sortSelect     = document.getElementById('sort-select');
const tbody          = document.getElementById('expense-tbody');
const expenseTable   = document.getElementById('expense-table');
const emptyState     = document.getElementById('empty-state');
const countBadge     = document.getElementById('expense-count-badge');
const selectAllCheckbox = document.getElementById('select-all-expenses');
const deleteSelectedBtn = document.getElementById('btn-delete-selected');
const exportBtn      = document.getElementById('btn-export');
const themeBtn       = document.getElementById('btn-toggle-theme');
const loadingOverlay = document.getElementById('loading-overlay');
const toastContainer = document.getElementById('toast-container');

// Global Date Filter
const globalDateBtn       = document.getElementById('global-date-btn');
const globalDateDropdown  = document.getElementById('global-date-dropdown');
const globalDateText      = document.getElementById('global-date-text');
const globalDateCustomText= document.getElementById('global-date-custom-text');
const globalCustomDate    = document.getElementById('global-custom-date');

// Currency DOM
const currencyBtn       = document.getElementById('currency-btn');
const currencyDropdown  = document.getElementById('currency-dropdown');
const currencyOptions   = document.getElementById('currency-options');
const currencyFlag      = document.getElementById('currency-flag');
const currencySymbolEl  = document.getElementById('currency-symbol-display');
const currencyCodeEl    = document.getElementById('currency-code-display');
const amountPrefix      = document.getElementById('amount-currency-prefix');
const modalCurrencyPfx  = document.getElementById('modal-currency-prefix');

// Add Expense Modal
const addModal       = document.getElementById('add-expense-modal');
const addModalClose  = document.getElementById('add-modal-close');

// Modal
const modal         = document.getElementById('edit-modal');
const modalClose    = document.getElementById('modal-close');
const modalCancel   = document.getElementById('modal-cancel');
const modalSave     = document.getElementById('modal-save');
const modalDesc     = document.getElementById('modal-description');
const modalAmount   = document.getElementById('modal-amount');
const modalCategory = document.getElementById('modal-category');
const modalDate     = document.getElementById('modal-date');

// Budget Modal
const budgetModal       = document.getElementById('budget-modal');
const budgetModalClose  = document.getElementById('budget-modal-close');
const budgetModalCancel = document.getElementById('budget-modal-cancel');
const budgetModalSave   = document.getElementById('budget-modal-save');
const budgetModalAmount = document.getElementById('budget-modal-amount');
const budgetModalPrefix = document.getElementById('budget-modal-prefix');

// Date Range
const dateRangeFilter   = document.getElementById('date-range-filter');
const customDateRange   = document.getElementById('custom-date-range');
const dateRangeStart    = document.getElementById('date-range-start');
const dateRangeEnd      = document.getElementById('date-range-end');
const applyRangeBtn     = document.getElementById('btn-apply-range');

// Export Dropdown
const exportDropdown    = document.getElementById('export-dropdown');
const exportCSVBtn      = document.getElementById('export-csv');
const exportExcelBtn    = document.getElementById('export-excel');
const exportPDFBtn      = document.getElementById('export-pdf');

// New widgets
const editBudgetBtn     = document.getElementById('btn-edit-budget');

// Auth & Navigation
const authenticatedShell = document.getElementById('authenticated-shell');
const viewLogin          = document.getElementById('view-login');
const viewHome           = document.getElementById('view-home');
const viewProfile        = document.getElementById('view-profile');
const viewAudit          = document.getElementById('view-audit');
const appSidebar         = document.getElementById('app-sidebar');
const sidebarOverlay     = document.getElementById('sidebar-overlay');
const btnOpenSidebar     = document.getElementById('btn-open-sidebar');
const sidebarCloseBtn    = document.getElementById('sidebar-close-btn');
const btnLogout          = document.getElementById('btn-logout');
const sidebarAvatar      = document.getElementById('sidebar-avatar');
const sidebarUserName    = document.getElementById('sidebar-user-name');
const sidebarUserEmail   = document.getElementById('sidebar-user-email');
const authTabLogin       = document.getElementById('auth-tab-login');
const authTabRegister    = document.getElementById('auth-tab-register');
const authCardTitle      = document.getElementById('auth-card-title');
const authCardSubtitle   = document.getElementById('auth-card-subtitle');
const authThemeBtn       = document.getElementById('auth-theme-toggle');
const loginForm          = document.getElementById('login-form');
const registerForm       = document.getElementById('register-form');
const profileAvatar      = document.getElementById('profile-avatar');
const profileNameDisplay = document.getElementById('profile-name-display');
const profileEmailDisplay = document.getElementById('profile-email-display');
const profileCreatedDisplay = document.getElementById('profile-created-display');
const profileCurrencyDisplay = document.getElementById('profile-currency-display');
const profileNameInput   = document.getElementById('profile-name-input');
const profileEditForm    = document.getElementById('profile-edit-form');
const auditCountBadge    = document.getElementById('audit-count-badge');
const auditEmptyState    = document.getElementById('audit-empty-state');
const auditTable         = document.getElementById('audit-table');
const auditTbody         = document.getElementById('audit-tbody');
const auditToolbar       = document.getElementById('audit-toolbar');
const auditNoResults     = document.getElementById('audit-no-results');
const auditSearchInput   = document.getElementById('audit-search-input');
const auditMenuAction    = document.getElementById('audit-menu-action');
const auditMenuType      = document.getElementById('audit-menu-type');
const auditFilterFrom    = document.getElementById('audit-filter-from');
const auditFilterTo      = document.getElementById('audit-filter-to');
const auditClearFilters  = document.getElementById('audit-clear-filters');
const auditRefreshBtn    = document.getElementById('audit-refresh-btn');
const auditExportBtn     = document.getElementById('audit-export-btn');

// ── Init ───────────────────────────────────────────────────
async function init() {
  // Set default date
  dateInput.value = todayISO();

  // Theme (UI-only, stays in localStorage)
  const savedTheme = localStorage.getItem('expenseiq_theme') || 'light';
  applyTheme(savedTheme);

  buildCurrencyDropdown();
  applyCurrencyUI();
  updateGreeting();
  initCardTilt();

  // Auth gate
  const token = getAuthToken();
  if (token) {
    try {
      await loadCurrentUser();
      await loadInitialData();
      await migrateLocalStorageIfNeeded();
      showAuthenticatedShell(true);
      handleHashChange();
    } catch (err) {
      console.error(err);
      setAuthToken(null);
      currentUser = null;
      showAuthenticatedShell(false);
      navigateTo('login');
      showToast('Session expired. Please sign in again.', 'danger');
    }
  } else {
    showAuthenticatedShell(false);
    switchAuthTab('login');
    navigateTo('login');
  }

  if (currentPage === 'home') renderAll();

  // Hide loader
  setTimeout(() => { loadingOverlay.classList.add('hidden'); MotionFX.introHome(); }, 350);

  // Sidebar & auth events
  btnOpenSidebar.addEventListener('click', toggleSidebar);
  sidebarCloseBtn.addEventListener('click', closeSidebar);
  sidebarOverlay.addEventListener('click', closeSidebar);
  btnLogout.addEventListener('click', logout);
  authTabLogin.addEventListener('click', () => switchAuthTab('login'));
  authTabRegister.addEventListener('click', () => switchAuthTab('register'));
  if (authThemeBtn) authThemeBtn.addEventListener('click', toggleTheme);
  window.addEventListener('hashchange', handleHashChange);

  document.querySelectorAll('.sidebar-link[data-page]').forEach(link => {
    link.addEventListener('click', () => closeSidebar());
  });

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await login(
        document.getElementById('login-email').value.trim(),
        document.getElementById('login-password').value,
      );
    } catch (err) {
      showToast(err.message, 'danger');
    }
  });

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await register(
        document.getElementById('register-name').value.trim(),
        document.getElementById('register-email').value.trim(),
        document.getElementById('register-password').value,
      );
    } catch (err) {
      showToast(err.message, 'danger');
    }
  });

  profileEditForm.addEventListener('submit', handleProfileSave);

  // Audit log toolbar
  if (auditSearchInput) auditSearchInput.addEventListener('input', () => {
    auditFilters.search = auditSearchInput.value;
    applyAuditView();
  });
  if (auditFilterFrom) auditFilterFrom.addEventListener('change', () => {
    auditFilters.from = auditFilterFrom.value;
    applyAuditView();
  });
  if (auditFilterTo) auditFilterTo.addEventListener('change', () => {
    auditFilters.to = auditFilterTo.value;
    applyAuditView();
  });
  if (auditClearFilters) auditClearFilters.addEventListener('click', clearAuditFilters);
  if (auditRefreshBtn) auditRefreshBtn.addEventListener('click', async () => {
    auditRefreshBtn.classList.add('is-spinning');
    await renderAuditLog();
    setTimeout(() => auditRefreshBtn.classList.remove('is-spinning'), 600);
  });
  if (auditExportBtn) auditExportBtn.addEventListener('click', exportAuditCSV);

  // Column-header filter dropdowns
  document.querySelectorAll('.audit-th-filter .audit-col-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleAuditColMenu(btn.closest('.audit-th-filter'));
    });
  });
  // Delegate clicks inside the Action / Type option lists
  [auditMenuAction, auditMenuType].forEach(menu => {
    if (!menu) return;
    menu.addEventListener('click', (e) => {
      const opt = e.target.closest('.audit-col-option');
      if (!opt) return;
      setAuditFilter(opt.dataset.filterKey, opt.dataset.value);
      closeAllAuditColMenus();
    });
  });
  // Per-column reset (When date range)
  document.querySelectorAll('.audit-col-reset').forEach(btn => {
    btn.addEventListener('click', () => {
      auditFilters.from = '';
      auditFilters.to = '';
      if (auditFilterFrom) auditFilterFrom.value = '';
      if (auditFilterTo) auditFilterTo.value = '';
      applyAuditView();
      closeAllAuditColMenus();
    });
  });
  // Keep date-picker clicks from closing the menu
  document.querySelectorAll('.audit-col-menu').forEach(menu => {
    menu.addEventListener('click', (e) => e.stopPropagation());
  });
  // Close menus on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.audit-th-filter')) closeAllAuditColMenus();
  });

  // Events
  openAddBtn.addEventListener('click', openAddModal);
  addBtn.addEventListener('click', handleAddExpense);
  clearBtn.addEventListener('click', clearForm);
  addModalClose.addEventListener('click', closeAddModal);
  addModal.addEventListener('click', (e) => { if (e.target === addModal) closeAddModal(); });
  searchInput.addEventListener('input', renderAll);
  filterCat.addEventListener('change', renderAll);
  sortSelect.addEventListener('change', renderAll);
  themeBtn.addEventListener('click', toggleTheme);
  modalClose.addEventListener('click', closeModal);
  modalCancel.addEventListener('click', closeModal);
  modalSave.addEventListener('click', handleModalSave);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

  // Export dropdown
  exportBtn.addEventListener('click', toggleExportDropdown);
  exportCSVBtn.addEventListener('click', () => { exportCSV(); closeExportDropdown(); });
  exportExcelBtn.addEventListener('click', () => { exportExcel(); closeExportDropdown(); });
  exportPDFBtn.addEventListener('click', () => { exportPDF(); closeExportDropdown(); });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#export-dropdown-wrapper')) closeExportDropdown();
  });

  // Currency dropdown toggle
  if (currencyBtn) {
    currencyBtn.addEventListener('click', toggleCurrencyDropdown);
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#currency-selector-header')) {
        closeCurrencyDropdown();
      }
    });
  }

  // Keyboard nav for dropdowns
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeCurrencyDropdown();
      closeExportDropdown();
      closeGlobalDateDropdown();
      closeAddModal();
      closeSidebar();
    }
  });

  // Global Date Dropdown
  if (globalDateBtn) {
    globalDateBtn.addEventListener('click', toggleGlobalDateDropdown);
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#global-date-wrapper')) {
        closeGlobalDateDropdown();
      }
    });
    document.querySelectorAll('.global-date-option').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const val = btn.dataset.val;
        if (val !== 'custom') {
          selectGlobalDateFilter(val);
        } else if (globalCustomDate) {
          e.stopPropagation();
          if (e.target !== globalCustomDate) {
            if (typeof globalCustomDate.showPicker === 'function') {
              try { globalCustomDate.showPicker(); } catch (err) { /* ignore */ }
            } else {
              globalCustomDate.click();
            }
          }
        }
      });
    });
  }

  if (globalCustomDate) {
    globalCustomDate.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof globalCustomDate.showPicker === 'function') {
        try { globalCustomDate.showPicker(); } catch (err) { /* ignore */ }
      }
    });
    globalCustomDate.addEventListener('change', (e) => {
      if (e.target.value) {
        globalDateCustomStr = e.target.value;
        selectGlobalDateFilter('custom');
      }
    });
  }

  // Enter key on form
  [descInput, amountInput].forEach(el => {
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleAddExpense(); });
  });

  // Open calendar on click of the date field
  [dateInput, modalDate].forEach(input => {
    input.addEventListener('click', () => {
      if (typeof input.showPicker === 'function') {
        try { input.showPicker(); } catch (err) { /* ignore */ }
      }
    });
  });

  // Quick Category Chips
  document.querySelectorAll('#add-expense-modal .chip[data-cat]').forEach(chip => {
    chip.addEventListener('click', () => {
      const cat = chip.dataset.cat;
      categoryInput.value = cat;
      document.querySelectorAll('#add-expense-modal .chip').forEach(c => c.classList.remove('chip-active'));
      chip.classList.add('chip-active');
      activeChip = cat;
    });
  });

  // Date Range Filter
  dateRangeFilter.addEventListener('change', handleDateRangeChange);
  applyRangeBtn.addEventListener('click', () => {
    customDateStart = dateRangeStart.value || null;
    customDateEnd = dateRangeEnd.value || null;
    renderAll();
  });

  // Budget Modal
  editBudgetBtn.addEventListener('click', openBudgetModal);
  budgetModalClose.addEventListener('click', closeBudgetModal);
  budgetModalCancel.addEventListener('click', closeBudgetModal);
  budgetModalSave.addEventListener('click', handleBudgetSave);
  budgetModal.addEventListener('click', (e) => { if (e.target === budgetModal) closeBudgetModal(); });

  selectAllCheckbox.addEventListener('change', handleSelectAll);
  deleteSelectedBtn.addEventListener('click', deleteSelectedExpenses);

  // Shortcut buttons (hero links, footer) forward their click to the real control
  document.addEventListener('click', (e) => {
    const proxy = e.target.closest('[data-proxy]');
    if (!proxy) return;
    const target = document.getElementById(proxy.dataset.proxy);
    if (target) { e.preventDefault(); target.click(); }
  });
  const backToTop = document.getElementById('btn-back-to-top');
  if (backToTop) backToTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

  // Ripple Effect for all .btn-ripple buttons
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-ripple');
    if (!btn) return;
    const circle = document.createElement('span');
    circle.className = 'ripple-circle';
    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    circle.style.width = circle.style.height = size + 'px';
    circle.style.left = (e.clientX - rect.left - size / 2) + 'px';
    circle.style.top = (e.clientY - rect.top - size / 2) + 'px';
    btn.appendChild(circle);
    circle.addEventListener('animationend', () => circle.remove());
  });
}

// ── Global Date Filter ─────────────────────────────────────
function toggleGlobalDateDropdown() {
  if (!globalDateDropdown || !globalDateBtn) return;
  globalDateDropdown.classList.toggle('open');
  globalDateBtn.setAttribute('aria-expanded', globalDateDropdown.classList.contains('open'));
}
function closeGlobalDateDropdown() {
  if (!globalDateDropdown || !globalDateBtn) return;
  globalDateDropdown.classList.remove('open');
  globalDateBtn.setAttribute('aria-expanded', 'false');
}
function selectGlobalDateFilter(val) {
  globalDateFilterVal = val;
  
  // Update UI
  document.querySelectorAll('.global-date-option').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.val === val);
  });
  
  if (globalDateText) {
    switch(val) {
      case 'all': globalDateText.textContent = 'All Dates'; break;
      case 'today': globalDateText.textContent = 'Today'; break;
      case 'week': globalDateText.textContent = 'This Week'; break;
      case 'month': globalDateText.textContent = 'This Month'; break;
      case 'custom': 
        globalDateText.textContent = formatDate(globalDateCustomStr); 
        if (globalDateCustomText) globalDateCustomText.textContent = formatDate(globalDateCustomStr);
        break;
    }
  }
  
  closeGlobalDateDropdown();
  renderAll();
}

function getGlobalFilteredExpenses() {
  if (globalDateFilterVal === 'all') return expenses;
  
  const now = new Date();
  const todayStr = todayISO();
  let dateFilter;

  switch (globalDateFilterVal) {
    case 'today':
      dateFilter = (d) => d === todayStr;
      break;
    case 'week': {
      const dayOfWeek = now.getDay();
      const monday = new Date(now);
      monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
      const startStr = monday.toISOString().split('T')[0];
      dateFilter = (d) => d >= startStr && d <= todayStr;
      break;
    }
    case 'month': {
      const startStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      dateFilter = (d) => d >= startStr && d <= todayStr;
      break;
    }
    case 'custom': {
      if (globalDateCustomStr) {
        dateFilter = (d) => d === globalDateCustomStr;
      } else {
        dateFilter = () => true;
      }
      break;
    }
    default:
      dateFilter = () => true;
  }
  return expenses.filter(e => dateFilter(e.date));
}

// ── Currency Dropdown ──────────────────────────────────────
function buildCurrencyDropdown() {
  if (!currencyOptions) return;
  currencyOptions.innerHTML = '';
  Object.entries(currencies).forEach(([code, data]) => {
    const option = document.createElement('button');
    option.className = 'currency-option' + (code === selectedCurrency ? ' active' : '');
    option.setAttribute('role', 'option');
    option.setAttribute('aria-selected', code === selectedCurrency);
    option.dataset.code = code;
    option.innerHTML = `
      <span class="currency-option-flag">${data.flag}</span>
      <span class="currency-option-symbol">${data.symbol}</span>
      <span class="currency-option-info">
        <span class="currency-option-code">${code}</span>
        <span class="currency-option-name">${data.name}</span>
      </span>
      ${code === selectedCurrency ? '<i class="fa-solid fa-check currency-option-check"></i>' : ''}
    `;
    option.addEventListener('click', () => selectCurrency(code));
    currencyOptions.appendChild(option);
  });
}

async function selectCurrency(code) {
  if (!currencies[code]) return;
  try {
    await saveSettingsToApi({ currency: code });
    applyCurrencyUI();
    buildCurrencyDropdown();
    renderAll();
    closeCurrencyDropdown();
    showToast(`Currency changed to ${currencies[code].flag} ${code}`, 'info');
    animateStatCards();
  } catch (err) {
    showToast(err.message || 'Failed to update currency.', 'danger');
  }
}

function applyCurrencyUI() {
  const c = getCurrencyObj();
  if (currencyFlag) currencyFlag.textContent = c.flag;
  if (currencySymbolEl) currencySymbolEl.textContent = c.symbol;
  if (currencyCodeEl) currencyCodeEl.textContent = selectedCurrency;
  if (amountPrefix) amountPrefix.textContent = c.symbol;
  if (modalCurrencyPfx) modalCurrencyPfx.textContent = c.symbol;
  if (budgetModalPrefix) budgetModalPrefix.textContent = c.symbol;
}

function toggleCurrencyDropdown() {
  if (!currencyDropdown || !currencyBtn) return;
  const isOpen = currencyDropdown.classList.contains('open');
  if (isOpen) {
    closeCurrencyDropdown();
  } else {
    currencyDropdown.classList.add('open');
    currencyBtn.setAttribute('aria-expanded', 'true');
  }
}

function closeCurrencyDropdown() {
  if (!currencyDropdown || !currencyBtn) return;
  currencyDropdown.classList.remove('open');
  currencyBtn.setAttribute('aria-expanded', 'false');
}

// ── Export Dropdown ────────────────────────────────────────
function toggleExportDropdown() {
  exportDropdown.classList.toggle('open');
}

function closeExportDropdown() {
  exportDropdown.classList.remove('open');
}

// ── Data Helpers ───────────────────────────────────────────
function todayISO() {
  return new Date().toISOString().split('T')[0];
}

function genId() {
  return `exp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function formatCurrency(val) {
  const c = getCurrencyObj();
  return `${c.symbol}${parseFloat(val).toLocaleString(c.locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function formatDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric'
  });
}

// ── Add Expense ────────────────────────────────────────────
function openAddModal() {
  closeExportDropdown();
  if (!dateInput.value) dateInput.value = todayISO();
  addModal.classList.add('open');
  amountInput.focus();
}

function closeAddModal() {
  addModal.classList.remove('open');
}

async function handleAddExpense() {
  const desc   = descInput.value.trim() || 'Expense';
  const amount = parseFloat(amountInput.value);
  const cat    = categoryInput.value || 'Other';
  const date   = dateInput.value;

  if (!date) {
    showToast('Please select an expense date.', 'danger');
    dateInput.focus();
    return;
  }
  if (isNaN(amount) || amount <= 0) {
    showToast('Please enter a valid amount.', 'danger');
    amountInput.focus();
    return;
  }

  try {
    const expense = await apiPost('/expenses', {
      id: genId(),
      desc,
      amount,
      cat,
      date,
      currency: selectedCurrency,
    });
    expenses.unshift(expense);
    renderAll();
    clearForm();
    closeAddModal();
    showToast(`"${desc}" added successfully!`, 'success');
    animateStatCards();
  } catch (err) {
    showToast(err.message || 'Failed to add expense.', 'danger');
  }
}

function clearForm() {
  descInput.value     = '';
  amountInput.value   = '';
  categoryInput.value = '';
  dateInput.value     = todayISO();
  document.querySelectorAll('#add-expense-modal .chip').forEach(c => c.classList.remove('chip-active'));
  activeChip = null;
  amountInput.focus();
}

// ── Edit Expense ───────────────────────────────────────────
function openEditModal(id) {
  const exp = expenses.find(e => e.id === id);
  if (!exp) return;
  editingId = id;
  modalDesc.value     = exp.desc;
  modalAmount.value   = exp.amount;
  modalCategory.value = exp.cat;
  modalDate.value     = exp.date;
  modal.classList.add('open');
  modalDesc.focus();
}

function closeModal() {
  modal.classList.remove('open');
  editingId = null;
}

async function handleModalSave() {
  const desc   = modalDesc.value.trim();
  const amount = parseFloat(modalAmount.value);
  const cat    = modalCategory.value || 'Other';
  const date   = modalDate.value || todayISO();

  if (!desc) { showToast('Description cannot be empty.', 'danger'); return; }
  if (isNaN(amount) || amount <= 0) { showToast('Enter a valid amount.', 'danger'); return; }

  const idx = expenses.findIndex(e => e.id === editingId);
  if (idx === -1) return;

  try {
    const updated = await apiPut(`/expenses/${editingId}`, {
      desc,
      amount,
      cat,
      date,
      currency: selectedCurrency,
    });
    expenses[idx] = updated;
    renderAll();
    showToast('Expense updated!', 'info');
    animateStatCards();
    closeModal();
  } catch (err) {
    showToast(err.message || 'Failed to update expense.', 'danger');
  }
}

// ── Delete Expense ─────────────────────────────────────────
async function deleteSelectedExpenses() {
  if (selectedExpenseIds.size === 0) return;
  const ids = [...selectedExpenseIds];
  const count = ids.length;

  try {
    await apiDelete('/expenses/bulk', { ids });
    expenses = expenses.filter(e => !selectedExpenseIds.has(e.id));
    selectedExpenseIds.clear();
    renderAll();
    showToast(`${count} transaction${count !== 1 ? 's' : ''} removed.`, 'danger');
    animateStatCards();
  } catch (err) {
    showToast(err.message || 'Failed to delete expenses.', 'danger');
  }
}

function handleSelectAll() {
  const list = getFilteredSorted();
  if (selectAllCheckbox.checked) {
    list.forEach(exp => selectedExpenseIds.add(exp.id));
  } else {
    list.forEach(exp => selectedExpenseIds.delete(exp.id));
  }
  renderTable();
}

function handleRowCheckbox(id, checked) {
  if (checked) {
    selectedExpenseIds.add(id);
  } else {
    selectedExpenseIds.delete(id);
  }
  const row = tbody.querySelector(`.expense-row-checkbox[data-id="${id}"]`)?.closest('tr');
  if (row) row.classList.toggle('row-selected', checked);
  updateSelectionUI(getFilteredSorted());
}

function updateSelectionUI(list) {
  const visibleIds = list.map(e => e.id);
  const selectedVisible = visibleIds.filter(id => selectedExpenseIds.has(id));
  const allSelected = list.length > 0 && selectedVisible.length === list.length;
  const someSelected = selectedVisible.length > 0 && !allSelected;

  selectAllCheckbox.checked = allSelected;
  selectAllCheckbox.indeterminate = someSelected;

  const count = selectedExpenseIds.size;
  deleteSelectedBtn.hidden = count === 0;
  deleteSelectedBtn.disabled = count === 0;
  deleteSelectedBtn.innerHTML = count > 0
    ? `<i class="fa-solid fa-trash"></i> Delete Selected (${count})`
    : `<i class="fa-solid fa-trash"></i> Delete Selected`;
}

// ── Budget ─────────────────────────────────────────────────
function openBudgetModal() {
  budgetModalAmount.value = monthlyBudget > 0 ? monthlyBudget : '';
  budgetModal.classList.add('open');
  budgetModalAmount.focus();
}

function closeBudgetModal() {
  budgetModal.classList.remove('open');
}

async function handleBudgetSave() {
  const val = parseFloat(budgetModalAmount.value);
  if (isNaN(val) || val < 0) {
    showToast('Please enter a valid budget amount.', 'danger');
    return;
  }
  try {
    await saveSettingsToApi({ monthly_budget: val });
    closeBudgetModal();
    renderBudget();
    showToast('Monthly budget updated!', 'success');
  } catch (err) {
    showToast(err.message || 'Failed to update budget.', 'danger');
  }
}

function renderBudget() {
  const c = getCurrencyObj();
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const spent = expenses
    .filter(e => e.date && e.date.startsWith(monthKey))
    .reduce((s, e) => s + e.amount, 0);

  const remaining = Math.max(0, monthlyBudget - spent);
  const pct = monthlyBudget > 0 ? Math.min((spent / monthlyBudget) * 100, 100) : 0;
  const isOver = monthlyBudget > 0 && spent > monthlyBudget;

  document.getElementById('budget-total-value').textContent = formatCurrency(monthlyBudget);
  document.getElementById('budget-spent-value').textContent = formatCurrency(spent);
  document.getElementById('budget-remaining-value').textContent = formatCurrency(remaining);

  const fill = document.getElementById('budget-progress-fill');
  fill.style.width = pct + '%';
  fill.classList.toggle('over-budget', isOver);

  const pctEl = document.getElementById('budget-percentage');
  pctEl.textContent = Math.round(pct) + '%';
  pctEl.classList.toggle('over-budget', isOver);
}

// ── Date Range Filtering ───────────────────────────────────
function handleDateRangeChange() {
  const val = dateRangeFilter.value;
  if (val === 'custom') {
    customDateRange.style.display = 'flex';
  } else {
    customDateRange.style.display = 'none';
    customDateStart = null;
    customDateEnd = null;
  }
  renderAll();
}

function getDateRangeFilter() {
  const val = dateRangeFilter.value;
  const now = new Date();
  const todayStr = todayISO();

  switch (val) {
    case 'today':
      return (d) => d === todayStr;
    case 'week': {
      const dayOfWeek = now.getDay();
      const monday = new Date(now);
      monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
      const startStr = monday.toISOString().split('T')[0];
      return (d) => d >= startStr && d <= todayStr;
    }
    case 'month': {
      const startStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      return (d) => d >= startStr && d <= todayStr;
    }
    case 'year': {
      const startStr = `${now.getFullYear()}-01-01`;
      return (d) => d >= startStr && d <= todayStr;
    }
    case 'custom': {
      if (customDateStart && customDateEnd) {
        return (d) => d >= customDateStart && d <= customDateEnd;
      }
      return () => true;
    }
    default:
      return () => true;
  }
}

// ── Filter / Sort ──────────────────────────────────────────
function getFilteredSorted() {
  const q   = searchInput.value.trim().toLowerCase();
  const cat = filterCat.value;
  const sort= sortSelect.value;
  const dateFilter = getDateRangeFilter();
  const currentGlobalList = getGlobalFilteredExpenses();

  let list = currentGlobalList.filter(e => {
    const matchSearch = !q || e.desc.toLowerCase().includes(q) || e.cat.toLowerCase().includes(q);
    const matchCat    = !cat || e.cat === cat;
    const matchDate   = dateFilter(e.date);
    return matchSearch && matchCat && matchDate;
  });

  list.sort((a, b) => {
    switch (sort) {
      case 'date-desc':   return b.date.localeCompare(a.date);
      case 'date-asc':    return a.date.localeCompare(b.date);
      case 'amount-desc': return b.amount - a.amount;
      case 'amount-asc':  return a.amount - b.amount;
      case 'name-asc':    return a.desc.localeCompare(b.desc);
      default:            return 0;
    }
  });

  return list;
}

// ── Render All ─────────────────────────────────────────────
function renderAll() {
  renderStats();
  renderTable();
  renderCharts();
  renderBudget();
  renderTopCategory();
  renderInsights();
  renderRecentActivity();
}

// ── Stats ──────────────────────────────────────────────────
function renderStats() {
  const currentList = getGlobalFilteredExpenses();
  const total   = currentList.reduce((s, e) => s + e.amount, 0);
  const count   = currentList.length;
  const highest = count ? Math.max(...currentList.map(e => e.amount)) : 0;
  const avg     = count ? total / count : 0;

  animateCount('stat-total-value',   total,   true);
  animateCount('stat-count-value',   count,   false);
  animateCount('stat-highest-value', highest, true);
  animateCount('stat-avg-value',     avg,     true);

  const sub = document.getElementById('hero-sub');
  if (sub) {
    sub.textContent = String(count);
  }
  renderHeroSpark(currentList);
}

function updateGreeting() {
  const h = new Date().getHours();
  const part = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = currentUser ? ((currentUser.full_name || '').trim().split(/\s+/)[0] || '') : '';
  const g = document.getElementById('hero-greeting');
  if (g) g.textContent = firstName ? `${part}, ${firstName}` : part;
  const dateEl = document.getElementById('header-date');
  if (dateEl) dateEl.textContent = new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

// Six-month trend line on the trend panel
function renderHeroSpark(list) {
  const svg = document.getElementById('hero-spark-svg');
  if (!svg) return;
  const monthMap = {};
  list.forEach(e => {
    const key = e.date ? String(e.date).slice(0, 7) : '';
    monthMap[key] = (monthMap[key] || 0) + e.amount;
  });
  const vals = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    vals.push(monthMap[key] || 0);
  }
  const W = 600, H = 140, padTop = 16, padBottom = 6;
  const max = Math.max(...vals, 1);
  const pts = vals.map((v, i) => [
    (i / (vals.length - 1)) * W,
    padTop + (1 - v / max) * (H - padTop - padBottom)
  ]);
  // smooth curve (Catmull-Rom → Bezier)
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`;
  }
  svg.innerHTML = `
    <defs>
      <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#2A9FF6" stop-opacity="0.28"></stop>
        <stop offset="100%" stop-color="#2A9FF6" stop-opacity="0"></stop>
      </linearGradient>
      <linearGradient id="sparkStroke" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#4188F2"></stop>
        <stop offset="100%" stop-color="#11B7FB"></stop>
      </linearGradient>
    </defs>
    ${pts.map(p => `<line class="spark-grid" x1="${p[0]}" y1="0" x2="${p[0]}" y2="${H}"></line>`).join('')}
    <path class="spark-area" d="${d} L${W},${H} L0,${H} Z" fill="url(#sparkFill)"></path>
    <path class="spark-line" d="${d}" stroke="url(#sparkStroke)"></path>`;

  // Month labels + the endpoint marker sit in HTML so they don't stretch with the SVG
  const months = document.getElementById('hero-spark-months');
  if (months) {
    const labels = [];
    for (let i = 5; i >= 0; i--) {
      const dd = new Date(); dd.setDate(1); dd.setMonth(dd.getMonth() - i);
      labels.push(dd.toLocaleDateString('en-US', { month: 'short' }));
    }
    months.innerHTML = labels.map((l, i) => `<span${i === 5 ? ' class="is-current"' : ''}>${l}</span>`).join('');
  }
  const wrap = svg.parentElement;
  let dot = wrap.querySelector('.spark-marker');
  if (!dot) { dot = document.createElement('span'); dot.className = 'spark-marker'; wrap.appendChild(dot); }
  const last = pts[pts.length - 1];
  dot.style.left = '100%';
  dot.style.top = (last[1] / H * 100) + '%';

  // Month-over-month change badge
  const badge = document.getElementById('hero-trend-badge');
  if (badge) {
    const cur = vals[5], prev = vals[4];
    if (!prev && !cur) { badge.textContent = 'No data yet'; badge.className = 'trend-badge'; }
    else if (!prev) { badge.textContent = 'New this month'; badge.className = 'trend-badge'; }
    else {
      const pct = Math.round(((cur - prev) / prev) * 100);
      const up = pct > 0;
      badge.innerHTML = `<i class="fa-solid fa-arrow-${up ? 'up' : 'down'}"></i> ${Math.abs(pct)}% vs last month`;
      badge.className = 'trend-badge ' + (up ? 'trend-badge--up' : 'trend-badge--down');
    }
  }
}

function animateCount(id, target, isCurrency) {
  const el = document.getElementById(id);
  const start = 0;
  const duration = 600;
  const startTime = performance.now();

  function step(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = start + (target - start) * eased;
    el.textContent = isCurrency ? formatCurrency(current) : Math.round(current).toString();
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function animateStatCards() {
  document.querySelectorAll('.stat-card').forEach((card, i) => {
    setTimeout(() => {
      card.style.animation = 'none';
      card.offsetHeight; // reflow
      card.style.animation = 'pulseGlow 0.6s ease';
    }, i * 80);
  });
}

// ── Top Category ───────────────────────────────────────────
function renderTopCategory() {
  const container = document.getElementById('top-category-body');
  const currentList = getGlobalFilteredExpenses();
  if (currentList.length === 0) {
    container.innerHTML = `<div class="top-cat-empty"><i class="fa-solid fa-chart-simple"></i><span>Your biggest category shows up after your first expense.</span></div>`;
    return;
  }

  const catMap = {};
  const total = currentList.reduce((s, e) => s + e.amount, 0);
  currentList.forEach(e => { catMap[e.cat] = (catMap[e.cat] || 0) + e.amount; });

  const topCat = Object.entries(catMap).sort((a, b) => b[1] - a[1])[0];
  const [catName, catAmount] = topCat;
  const pct = total > 0 ? ((catAmount / total) * 100).toFixed(1) : 0;
  const catClass = CAT_CLASS_MAP[catName] || 'cat-other';

  container.innerHTML = `
    <div class="top-cat-display ${catClass}">
      <div class="top-cat-icon">${catIconHtml(catName)}</div>
      <div class="top-cat-info">
        <div class="top-cat-name">${escHtml(catName)}</div>
        <div class="top-cat-amount">${formatCurrency(catAmount)}</div>
      </div>
    </div>
    <div class="top-cat-bar-wrapper ${catClass}">
      <div class="top-cat-bar"><div class="top-cat-bar-fill" style="width:${pct}%"></div></div>
      <div class="top-cat-percentage">${pct}% of everything you've spent</div>
    </div>
  `;
}

// ── AI Insights ────────────────────────────────────────────
function renderInsights() {
  const container = document.getElementById('insights-body');
  const currentList = getGlobalFilteredExpenses();

  if (currentList.length === 0) {
    container.innerHTML = `<div class="insight-item"><i class="fa-solid fa-circle-info insight-icon"></i><span>Add a few expenses and patterns in your spending will appear here.</span></div>`;
    return;
  }

  const insights = [];
  const total = currentList.reduce((s, e) => s + e.amount, 0);
  const count = currentList.length;

  // Highest spending category
  const catMap = {};
  currentList.forEach(e => { catMap[e.cat] = (catMap[e.cat] || 0) + e.amount; });
  const topCat = Object.entries(catMap).sort((a, b) => b[1] - a[1])[0];
  if (topCat) {
    const pct = ((topCat[1] / total) * 100).toFixed(0);
    insights.push({
      icon: 'fa-solid fa-fire',
      cls: 'insight-warn',
      text: `<strong>${escHtml(topCat[0])}</strong> is your top spending category at <strong>${pct}%</strong> of total expenses.`
    });
  }

  // Average daily spending
  const dates = [...new Set(currentList.map(e => e.date))];
  if (dates.length > 0) {
    const avgDaily = total / dates.length;
    insights.push({
      icon: 'fa-solid fa-chart-line',
      cls: '',
      text: `Your average daily spending is <strong>${formatCurrency(avgDaily)}</strong> across ${dates.length} day${dates.length > 1 ? 's' : ''}.`
    });
  }

  // Monthly summary
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const monthExpenses = currentList.filter(e => e.date && e.date.startsWith(monthKey));
  const monthTotal = monthExpenses.reduce((s, e) => s + e.amount, 0);
  if (monthExpenses.length > 0) {
    insights.push({
      icon: 'fa-solid fa-calendar-check',
      cls: 'insight-success',
      text: `This month you've spent <strong>${formatCurrency(monthTotal)}</strong> across <strong>${monthExpenses.length}</strong> transaction${monthExpenses.length > 1 ? 's' : ''}.`
    });
  }

  // Budget alert
  if (monthlyBudget > 0) {
    const pctUsed = (monthTotal / monthlyBudget) * 100;
    if (pctUsed > 90) {
      insights.push({
        icon: 'fa-solid fa-triangle-exclamation',
        cls: 'insight-danger',
        text: `You've used <strong>${Math.round(pctUsed)}%</strong> of your monthly budget!`
      });
    }
  }

  // Spending trend
  if (count >= 3) {
    const sorted = [...currentList].sort((a, b) => a.date.localeCompare(b.date));
    const mid = Math.floor(sorted.length / 2);
    const firstHalf = sorted.slice(0, mid).reduce((s, e) => s + e.amount, 0);
    const secondHalf = sorted.slice(mid).reduce((s, e) => s + e.amount, 0);
    const trend = secondHalf > firstHalf ? 'going up' : 'going down';
    insights.push({
      icon: 'fa-solid fa-arrow-trend-up',
      cls: secondHalf > firstHalf ? 'insight-warn' : 'insight-success',
      text: `Your spending is <strong>${trend}</strong> compared with earlier entries.`
    });
  }

  container.innerHTML = insights.map(i =>
    `<div class="insight-item"><i class="${i.icon} insight-icon ${i.cls}"></i><span>${i.text}</span></div>`
  ).join('');
}

// ── Recent Activity ────────────────────────────────────────
function renderRecentActivity() {
  const container = document.getElementById('activity-list');
  if (!container) return;
  const currentList = getGlobalFilteredExpenses();
  if (currentList.length === 0) {
    container.innerHTML = `<div class="activity-empty"><i class="fa-solid fa-inbox"></i><span>No recent transactions</span></div>`;
    return;
  }

  const recent = currentList.slice(0, 5);
  container.innerHTML = recent.map(exp => {
    return `
      <div class="activity-item">
        <span class="activity-dot"></span>
        <div class="activity-info">
          <div class="activity-desc">${escHtml(exp.desc)}</div>
          <div class="activity-meta">${exp.cat} • ${formatDate(exp.date)}</div>
        </div>
        <span class="activity-amount">${formatExpenseAmount(exp)}</span>
      </div>
    `;
  }).join('');
}

// ── Table ──────────────────────────────────────────────────
const CAT_CLASS_MAP = {
  'Food': 'cat-food',
  'Transport': 'cat-transport',
  'Shopping': 'cat-shopping',
  'Entertainment': 'cat-entertainment',
  'Health': 'cat-health',
  'Utilities': 'cat-utilities',
  'Education': 'cat-education',
  'Other': 'cat-other',
};

const CAT_ICON = {
  'Food': 'fa-utensils', 'Transport': 'fa-car-side', 'Shopping': 'fa-bag-shopping',
  'Entertainment': 'fa-film', 'Health': 'fa-heart-pulse', 'Utilities': 'fa-bolt',
  'Education': 'fa-graduation-cap', 'Other': 'fa-box'
};

function catIconHtml(cat) {
  return `<i class="fa-solid ${CAT_ICON[cat] || CAT_ICON.Other}" aria-hidden="true"></i>`;
}

// Category colour, read from the CSS tokens so pills, charts and cards always match
function getCatColor(cat) {
  const cls = (CAT_CLASS_MAP[cat] || 'cat-other');
  const v = getComputedStyle(document.documentElement).getPropertyValue('--' + cls).trim();
  return v || '#9AA9A6';
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function formatExpenseAmount(exp) {
  const code = exp.currency && currencies[exp.currency] ? exp.currency : selectedCurrency;
  const c = currencies[code];
  return `${c.symbol}${parseFloat(exp.amount).toLocaleString(c.locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function getCurrencyBadge(exp) {
  const code = exp.currency && currencies[exp.currency] ? exp.currency : selectedCurrency;
  const c = currencies[code];
  return `<span class="currency-badge">${c.flag} ${c.symbol} ${code}</span>`;
}

function renderTable() {
  const list = getFilteredSorted();
  countBadge.textContent = `${list.length} item${list.length !== 1 ? 's' : ''}`;

  // Drop selections for expenses no longer in the dataset
  const allIds = new Set(expenses.map(e => e.id));
  selectedExpenseIds.forEach(id => {
    if (!allIds.has(id)) selectedExpenseIds.delete(id);
  });

  tbody.innerHTML = '';

  if (list.length === 0) {
    emptyState.classList.add('visible');
    expenseTable.style.display = 'none';
    updateSelectionUI(list);
  } else {
    emptyState.classList.remove('visible');
    expenseTable.style.display = 'table';

    list.forEach((exp, idx) => {
      const tr = document.createElement('tr');
      const catClass = CAT_CLASS_MAP[exp.cat] || 'cat-other';
      const isSelected = selectedExpenseIds.has(exp.id);
      tr.dataset.id = exp.id;
      if (isSelected) tr.classList.add('row-selected');

      tr.innerHTML = `
        <td class="col-checkbox">
          <input type="checkbox" class="expense-checkbox expense-row-checkbox" data-id="${exp.id}" ${isSelected ? 'checked' : ''} aria-label="Select ${escHtml(exp.desc)}" />
        </td>
        <td class="row-index">${idx + 1}</td>
        <td class="row-name">${escHtml(exp.desc)}</td>
        <td><span class="category-pill ${catClass}">${catIconHtml(exp.cat)}${escHtml(exp.cat)}</span></td>
        <td class="row-currency">${getCurrencyBadge(exp)}</td>
        <td class="row-amount">${formatExpenseAmount(exp)}</td>
        <td class="row-date">${formatDate(exp.date)}</td>
        <td>
          <div class="action-btn-group">
            <button class="action-btn action-btn-edit" data-id="${exp.id}" title="Edit expense" aria-label="Edit ${escHtml(exp.desc)}">
              <i class="fa-solid fa-pen"></i>
            </button>
          </div>
        </td>
      `;

      tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.expense-row-checkbox').forEach(cb => {
      cb.addEventListener('change', () => handleRowCheckbox(cb.dataset.id, cb.checked));
    });

    tbody.querySelectorAll('.action-btn-edit').forEach(btn => {
      btn.addEventListener('click', () => openEditModal(btn.dataset.id));
    });

    updateSelectionUI(list);
  }
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Charts ─────────────────────────────────────────────────
function renderCharts() {
  renderMonthlyChart();
  renderCategoryChart();
}

function chartTheme() {
  return {
    accent:      cssVar('--primary-light') || '#4188F2',
    barMuted:    cssVar('--chart-muted') || '#D4D4D4',
    barHover:    cssVar('--chart-muted-hover') || '#A3A3A3',
    grid:        cssVar('--border') || 'rgba(196,226,222,0.1)',
    tick:        cssVar('--text-muted') || '#81989A',
    legend:      cssVar('--text-secondary') || '#A7BCB8',
    surface:     cssVar('--bg-surface') || '#112428',
    tooltipBg:   '#0B1A3E',
    tooltipText: '#FFFFFF',
  };
}

function renderMonthlyChart() {
  const c = getCurrencyObj();
  const currentList = getGlobalFilteredExpenses();
  const monthMap = {};
  currentList.forEach(e => {
    const key = e.date ? e.date.slice(0, 7) : 'Unknown';
    monthMap[key] = (monthMap[key] || 0) + e.amount;
  });

  // Last 6 months
  const labels = [];
  const data   = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    labels.push(d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }));
    data.push(monthMap[key] || 0);
  }

  const ctx = document.getElementById('chart-monthly');
  if (monthlyChart) monthlyChart.destroy();
  const t = chartTheme();

  monthlyChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: `Expenses (${c.symbol})`,
        data,
        backgroundColor: data.map((_, i) => i === data.length - 1 ? t.accent : t.barMuted),
        hoverBackgroundColor: data.map((_, i) => i === data.length - 1 ? t.accent : t.barHover),
        borderRadius: 10,
        borderSkipped: false,
        maxBarThickness: 46,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 800,
        easing: 'easeOutQuart'
      },
      layout: {
        padding: {
          left: 10,
          right: 15,
          top: 15,
          bottom: 5
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: t.tooltipBg,
          borderColor: t.grid,
          borderWidth: 1,
          titleColor: t.tooltipText,
          bodyColor: t.tooltipText,
          titleFont: { family: 'Plus Jakarta Sans', weight: '700' },
          bodyFont: { family: 'Plus Jakarta Sans', weight: '600' },
          padding: 12,
          cornerRadius: 10,
          displayColors: false,
          callbacks: { label: ctx => ` ${c.symbol}${ctx.parsed.y.toFixed(2)}` }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: { color: t.tick, font: { family: 'Plus Jakarta Sans', size: 12, weight: '600' }, padding: 8 }
        },
        y: {
          grid: { color: t.grid, drawTicks: false },
          border: { display: false },
          ticks: {
            color: t.tick,
            font: { family: 'Plus Jakarta Sans', size: 11, weight: '600' },
            maxTicksLimit: 5,
            callback: v => `${c.symbol}${v}`,
            padding: 8
          },
          beginAtZero: true
        }
      }
    }
  });
}

function renderCategoryChart() {
  const c = getCurrencyObj();
  const currentList = getGlobalFilteredExpenses();
  const catMap = {};
  currentList.forEach(e => {
    catMap[e.cat] = (catMap[e.cat] || 0) + e.amount;
  });

  const labels = Object.keys(catMap);
  const data   = Object.values(catMap);

  const ctx = document.getElementById('chart-category');
  if (categoryChart) categoryChart.destroy();
  const t = chartTheme();

  if (data.length === 0) {
    // Draw placeholder
    categoryChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['No Data'],
        datasets: [{ data: [1], backgroundColor: [t.grid], borderWidth: 0 }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: {
          padding: { top: 15, bottom: 15, left: 20, right: 20 }
        },
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false }
        },
        cutout: '70%'
      }
    });
    return;
  }

  categoryChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: labels.map(l => getCatColor(l)),
        borderWidth: 3,
        borderColor: t.surface,
        hoverBorderColor: t.surface,
        borderRadius: 6,
        hoverOffset: 6,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        animateRotate: true,
        duration: 800
      },
      layout: {
        padding: { top: 15, bottom: 15, left: 20, right: 20 }
      },
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: t.legend,
            font: { family: 'Plus Jakarta Sans', size: 12, weight: '600' },
            padding: 14,
            boxWidth: 8,
            boxHeight: 8,
            pointStyle: 'circle',
            usePointStyle: true,
          }
        },
        tooltip: {
          backgroundColor: t.tooltipBg,
          borderColor: t.grid,
          borderWidth: 1,
          titleColor: t.tooltipText,
          bodyColor: t.tooltipText,
          titleFont: { family: 'Plus Jakarta Sans', weight: '700' },
          bodyFont: { family: 'Plus Jakarta Sans', weight: '600' },
          padding: 12,
          cornerRadius: 10,
          displayColors: false,
          callbacks: {
            label: ctx => ` ${c.symbol}${ctx.parsed.toFixed(2)} (${((ctx.parsed / data.reduce((a,b)=>a+b,0))*100).toFixed(1)}%)`
          }
        }
      },
      cutout: '70%'
    }
  });
}

// ── Export CSV ─────────────────────────────────────────────
function exportCSV() {
  const listToExport = getFilteredSorted();
  if (listToExport.length === 0) { showToast('No expenses to export.', 'info'); return; }
  const headers = ['Description', 'Category', 'Currency', 'Amount', 'Date'];
  const rows = listToExport.map(e => [
    `"${e.desc.replace(/"/g,'""')}"`,
    e.cat,
    e.currency || selectedCurrency,
    e.amount.toFixed(2),
    e.date
  ]);
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `expenseiq_${todayISO()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Expenses exported as CSV!', 'success');
}

// ── Export Excel (XLS) ────────────────────────────────────
function exportExcel() {
  const listToExport = getFilteredSorted();
  if (listToExport.length === 0) { showToast('No expenses to export.', 'info'); return; }

  let html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">';
  html += '<head><meta charset="UTF-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>';
  html += '<x:Name>Expenses</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>';
  html += '</x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head><body>';
  html += '<table><thead><tr><th>Description</th><th>Category</th><th>Currency</th><th>Amount</th><th>Date</th></tr></thead><tbody>';

  listToExport.forEach(e => {
    html += `<tr><td>${escHtml(e.desc)}</td><td>${escHtml(e.cat)}</td><td>${e.currency || selectedCurrency}</td><td>${e.amount.toFixed(2)}</td><td>${e.date}</td></tr>`;
  });

  html += '</tbody></table></body></html>';

  const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `expenseiq_${todayISO()}.xls`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Expenses exported as Excel!', 'success');
}

// ── Export PDF ─────────────────────────────────────────────
function exportPDF() {
  const listToExport = getFilteredSorted();
  if (listToExport.length === 0) { showToast('No expenses to export.', 'info'); return; }

  const c = getCurrencyObj();
  const total = listToExport.reduce((s, e) => s + e.amount, 0);

  let html = `<!DOCTYPE html><html><head><title>ExpenseIQ Report</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; color: #1E293B; }
    h1 { font-size: 22px; margin-bottom: 4px; color: #6366F1; }
    .subtitle { font-size: 12px; color: #64748B; margin-bottom: 24px; }
    .summary { display: flex; gap: 20px; margin-bottom: 24px; }
    .summary-item { background: #F0F4FF; padding: 12px 18px; border-radius: 8px; }
    .summary-label { font-size: 11px; color: #64748B; text-transform: uppercase; letter-spacing: 0.05em; }
    .summary-value { font-size: 18px; font-weight: 700; color: #1E293B; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { background: #6366F1; color: #fff; padding: 10px 14px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
    td { padding: 10px 14px; border-bottom: 1px solid #E2E8F0; }
    tr:nth-child(even) td { background: #F8FAFC; }
    .amount { font-weight: 700; color: #EF4444; }
    .footer { margin-top: 24px; font-size: 10px; color: #94A3B8; text-align: center; }
  </style></head><body>
  <h1>ExpenseIQ Report</h1>
  <div class="subtitle">Generated on ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
  <div class="summary">
    <div class="summary-item"><div class="summary-label">Total Expenses</div><div class="summary-value">${formatCurrency(total)}</div></div>
    <div class="summary-item"><div class="summary-label">Transactions</div><div class="summary-value">${listToExport.length}</div></div>
  </div>
  <table><thead><tr><th>#</th><th>Description</th><th>Category</th><th>Amount</th><th>Date</th></tr></thead><tbody>`;

  listToExport.forEach((e, i) => {
    html += `<tr><td>${i + 1}</td><td>${escHtml(e.desc)}</td><td>${escHtml(e.cat)}</td><td class="amount">${formatExpenseAmount(e)}</td><td>${formatDate(e.date)}</td></tr>`;
  });

  html += `</tbody></table><div class="footer">ExpenseIQ — Premium Expense Tracker</div></body></html>`;

  const printWindow = window.open('', '_blank');
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => { printWindow.print(); }, 500);
  showToast('PDF print dialog opened!', 'success');
}

// ── Theme Toggle ───────────────────────────────────────────
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next    = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  localStorage.setItem('expenseiq_theme', next);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const iconClass = theme === 'dark' ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
  if (themeBtn) themeBtn.querySelector('i').className = iconClass;
  if (authThemeBtn) authThemeBtn.querySelector('i').className = iconClass;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#070F26' : '#F5F7FC');
  // Charts read colours from CSS tokens, so redraw them in the new theme
  if (typeof monthlyChart !== 'undefined' && (monthlyChart || categoryChart)) {
    try { renderCharts(); } catch (_) { /* charts not ready yet */ }
  }
}

// ── Toast ──────────────────────────────────────────────────
function showToast(message, type = 'info') {
  const icons = { success: 'fa-circle-check', danger: 'fa-circle-xmark', info: 'fa-circle-info' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<i class="fa-solid ${icons[type] || icons.info} toast-icon"></i><span>${message}</span>`;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('hide');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  }, 3500);
}


// ── Card tilt ──────────────────────────────────────────────
// The total-spent card leans toward the pointer and its sheen follows,
// like a real card catching the light. Off for touch and reduced motion.
function initCardTilt() {
  const card = document.getElementById('stat-total');
  if (!card) return;
  const fine = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!fine || reduce) return;
  let raf = null;
  card.addEventListener('pointermove', (e) => {
    const r = card.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      card.style.setProperty('--rx', ((0.5 - y) * 10).toFixed(2) + 'deg');
      card.style.setProperty('--ry', ((x - 0.5) * 14).toFixed(2) + 'deg');
      card.style.setProperty('--mx', (x * 100).toFixed(1) + '%');
      card.style.setProperty('--my', (y * 100).toFixed(1) + '%');
      card.classList.add('is-tilting');
    });
  });
  card.addEventListener('pointerleave', () => {
    if (raf) cancelAnimationFrame(raf);
    card.classList.remove('is-tilting');
    card.style.setProperty('--rx', '0deg');
    card.style.setProperty('--ry', '0deg');
  });
}

// ── Motion layer ───────────────────────────────────────────
// Uses Motion (the engine behind Framer Motion) in its vanilla JS build.
// Every effect answers a change on screen; nothing loops or decorates.
// If the library fails to load, or the user prefers reduced motion,
// all of this becomes a no-op and the app works exactly the same.
const MotionFX = (() => {
  const M = window.Motion;
  const reduceQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const enabled = () => !!(M && M.animate) && !(reduceQuery && reduceQuery.matches);
  const EASE = [0.22, 1, 0.36, 1];
  const stg = (...a) => (M && M.stagger ? M.stagger(...a) : 0);
  const SPRING = { type: 'spring', stiffness: 420, damping: 40, mass: 0.9 };
  const isPhone = () => window.matchMedia('(max-width: 720px)').matches;
  const loaderGone = () => {
    const l = document.getElementById('loading-overlay');
    return !l || l.classList.contains('hidden');
  };

  if (enabled()) document.documentElement.classList.add('motion-on');

  function run(els, keyframes, opts) {
    if (!enabled()) return;
    const list = (Array.isArray(els) ? els : (els && els.length !== undefined ? Array.from(els) : [els])).filter(Boolean);
    if (!list.length) return;
    try { M.animate(list, keyframes, opts); } catch (err) { console.warn('Motion:', err); }
  }

  // One orchestrated entrance for the dashboard: hero first, then the rest settles in.
  let homeIntroDone = false;
  function introHome() {
    const home = document.getElementById('view-home');
    if (!home || !home.classList.contains('app-view-active') || homeIntroDone) return;
    homeIntroDone = true;
    if (!enabled()) return;

    run(home.querySelector('.hero-intro'), { opacity: [0, 1], y: [14, 0] }, { duration: 0.6, ease: EASE });
    // The card rises in like it's being dealt onto the table
    run(home.querySelector('.hero-card-stage'), { opacity: [0, 1], y: [40, 0], rotate: [-4, 0], scale: [0.94, 1] },
        { type: 'spring', stiffness: 140, damping: 18, delay: 0.1 });
    run(home.querySelector('.trend-card'), { opacity: [0, 1], y: [20, 0] }, { duration: 0.6, ease: EASE, delay: 0.2 });

    const spark = document.getElementById('hero-spark-svg');
    if (spark && spark.animate) {
      spark.animate(
        [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)' }],
        { duration: 1200, delay: 450, easing: 'cubic-bezier(0.65, 0, 0.35, 1)', fill: 'backwards' }
      );
    }

    run(home.querySelectorAll('.stat-card'), { opacity: [0, 1], x: [20, 0] },
        { duration: 0.5, ease: EASE, delay: stg(0.07, { startDelay: 0.3 }) });

    const rest = [
      ...home.querySelectorAll('.section-head'),
      ...home.querySelectorAll('.metrics-grid > .card'),
      ...home.querySelectorAll('.charts-row > .card'),
      home.querySelector('.list-card'),
    ];
    run(rest, { opacity: [0, 1], y: [20, 0] },
        { duration: 0.55, ease: EASE, delay: stg(0.06, { startDelay: 0.35 }) });
  }

  // Lighter entrance when switching to another page from the sidebar
  function introView(view) {
    if (!view || view.id === 'view-login') return;
    if (view.id === 'view-home') {
      if (!homeIntroDone) return introHome();
      run(view.children, { opacity: [0, 1], y: [12, 0] }, { duration: 0.4, ease: EASE, delay: stg(0.04) });
      return;
    }
    run(view.querySelectorAll('.page-card'), { opacity: [0, 1], y: [16, 0] }, { duration: 0.45, ease: EASE });
    window.scrollTo({ top: 0 });
  }

  function introLogin() {
    const login = document.getElementById('view-login');
    if (!login || !login.classList.contains('app-view-active')) return;
    run(login.querySelectorAll('.auth-hero__headline, .auth-hero__lede'), { opacity: [0, 1], y: [24, 0] },
        { duration: 0.7, ease: EASE, delay: stg(0.08, { startDelay: 0.1 }) });
    run(login.querySelectorAll('.auth-hero__features li'), { opacity: [0, 1], x: [-12, 0] },
        { duration: 0.45, ease: EASE, delay: stg(0.06, { startDelay: 0.35 }) });
    run(login.querySelector('.auth-card'), { opacity: [0, 1], y: [16, 0] }, { duration: 0.55, ease: EASE, delay: 0.15 });
  }

  // Modals spring up from where the eye already is (bottom sheet on phones)
  function onModalOpen(overlay) {
    const card = overlay.querySelector('.modal-card');
    if (isPhone()) run(card, { y: ['100%', '0%'], opacity: [1, 1] }, { type: 'spring', stiffness: 320, damping: 34 });
    else run(card, { opacity: [0, 1], y: [24, 0], scale: [0.96, 1] }, SPRING);
  }

  function onSidebarOpen(sidebar) {
    run(sidebar.querySelectorAll('.sidebar-nav > li'), { opacity: [0, 1], x: [24, 0] },
        { duration: 0.35, ease: EASE, delay: stg(0.04, { startDelay: 0.08 }) });
  }

  // Only rows that are new since the last render animate in — typing in search stays calm.
  const seenRows = new Set();
  let firstTableRender = true;
  function onTableRender(tbody) {
    const rows = Array.from(tbody.querySelectorAll('tr[data-id]'));
    const fresh = rows.filter(r => !seenRows.has(r.dataset.id));
    rows.forEach(r => seenRows.add(r.dataset.id));
    if (firstTableRender) { firstTableRender = false; return; } // the page entrance covers the first paint
    if (!fresh.length) return;
    run(fresh.slice(0, 12), { opacity: [0, 1], y: [-8, 0] },
        { duration: 0.4, ease: EASE, delay: stg(0.04) });
    fresh.slice(0, 1).forEach(r => {
      if (fresh.length === 1 && r.animate) {
        r.animate([{ backgroundColor: cssVar('--accent-soft') }, { backgroundColor: 'rgba(0,0,0,0)' }],
                  { duration: 1400, easing: 'ease-out' });
      }
    });
  }

  function onTopCategory(body) {
    run(body.querySelector('.top-cat-bar-fill'), { scaleX: [0, 1] }, { duration: 0.8, ease: EASE, delay: 0.1 });
    run(body.querySelector('.top-cat-icon'), { scale: [0.6, 1], opacity: [0, 1] }, SPRING);
  }

  function onAuthFormShown(form) {
    run(form.children, { opacity: [0, 1], y: [8, 0] }, { duration: 0.3, ease: EASE, delay: stg(0.04) });
  }

  function onToast(toast) {
    toast.style.animation = 'none';
    run(toast, { opacity: [0, 1], y: [20, 0], scale: [0.95, 1] }, { type: 'spring', stiffness: 420, damping: 30 });
  }

  function watch() {
    const classObserver = new MutationObserver(muts => {
      muts.forEach(m => {
        const el = m.target;
        const was = (m.oldValue || '').split(/\s+/);
        if (el.classList.contains('modal-overlay') && el.classList.contains('open') && !was.includes('open')) onModalOpen(el);
        if (el.id === 'app-sidebar' && el.classList.contains('open') && !was.includes('open')) onSidebarOpen(el);
        if (loaderGone() && el.classList.contains('app-view') && el.classList.contains('app-view-active') && !was.includes('app-view-active')) {
          if (el.id === 'view-login') introLogin(); else introView(el);
        }
      });
    });
    document.querySelectorAll('.modal-overlay, #app-sidebar, .app-view').forEach(el =>
      classObserver.observe(el, { attributes: true, attributeFilter: ['class'], attributeOldValue: true }));

    const hiddenObserver = new MutationObserver(muts => {
      muts.forEach(m => { if (!m.target.hidden && m.oldValue !== null) onAuthFormShown(m.target); });
    });
    document.querySelectorAll('.auth-form').forEach(f =>
      hiddenObserver.observe(f, { attributes: true, attributeFilter: ['hidden'], attributeOldValue: true }));

    const tbody = document.getElementById('expense-tbody');
    if (tbody) new MutationObserver(() => onTableRender(tbody)).observe(tbody, { childList: true });

    const topCat = document.getElementById('top-category-body');
    if (topCat) new MutationObserver(() => onTopCategory(topCat)).observe(topCat, { childList: true });

    const toasts = document.getElementById('toast-container');
    if (toasts) new MutationObserver(muts => muts.forEach(m => m.addedNodes.forEach(n => {
      if (n.nodeType === 1 && n.classList.contains('toast')) onToast(n);
    }))).observe(toasts, { childList: true });
  }

  return { watch, introHome, introLogin };
})();

document.addEventListener('DOMContentLoaded', () => {
  MotionFX.watch();
  // Let the loader fade first, then play the login entrance if that's where we land
  setTimeout(() => MotionFX.introLogin(), 380);
});

// ── Start ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
