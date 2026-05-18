/* ============================================================
   ELV · Employee Lifetime Value — app.js
   Full Supabase-connected SPA
   ============================================================ */

'use strict';

// ─── Supabase client (lazy init) ───────────────────────────
let supabase = null;

function initSupabase() {
  const url = localStorage.getItem('elv_supabase_url');
  const key = localStorage.getItem('elv_supabase_key');
  if (!url || !key) return false;
  try {
    supabase = window.supabase.createClient(url, key);
    return true;
  } catch (e) {
    console.error('Supabase init error', e);
    return false;
  }
}

// ─── Chart instances ────────────────────────────────────────
let trendChart = null;
let kpiRadar   = null;
let yearChart  = null;
let weightChart = null;

// ─── State ──────────────────────────────────────────────────
let employees   = [];
let allSummaries = [];
let allKpiEntries = [];

// ─── Helpers ────────────────────────────────────────────────
function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.className = 'toast'; }, 3000);
}

function formatPct(v) {
  if (v == null || isNaN(v)) return '—';
  return (v * 100).toFixed(1) + '%';
}

function scoreClass(v) {
  if (v == null) return 'badge-gray';
  if (v >= 0.95) return 'badge-green';
  if (v >= 0.85) return 'badge-amber';
  return 'badge-red';
}

function scoreLabel(v) {
  if (v == null) return 'No data';
  if (v >= 0.95) return 'Excellent';
  if (v >= 0.85) return 'Good';
  return 'Needs Improvement';
}

function monthLabel(ym) {
  if (!ym) return '—';
  const [y, m] = ym.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return (months[parseInt(m) - 1] || m) + ' ' + y;
}

function monthLabelFull(ym) {
  if (!ym) return '—';
  const [y, m] = ym.split('-');
  const months = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
  return (months[parseInt(m) - 1] || m) + ' ' + y;
}

function empInitials(name) {
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
}

function avatarColor(name) {
  const colors = ['#1d9e75','#3b82f6','#8b5cf6','#f59e0b','#ef4444','#06b6d4'];
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % colors.length;
  return colors[h];
}

function getCurrentMonthYear() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// ─── DB guard ───────────────────────────────────────────────
function requireDB() {
  if (!supabase) {
    showToast('Connect to Supabase first (⚙ Settings)', 'error');
    return false;
  }
  return true;
}

// ─── DB Status ──────────────────────────────────────────────
async function checkDBStatus() {
  if (!supabase) {
    setDBStatus(false);
    return;
  }
  try {
    const { error } = await supabase.from('employees').select('id').limit(1);
    setDBStatus(!error);
    if (error) console.warn('DB check:', error.message);
  } catch {
    setDBStatus(false);
  }
}

function setDBStatus(online) {
  const dot = document.querySelector('.status-dot');
  const lbl = document.querySelector('.status-label');
  dot.className = 'status-dot ' + (online ? 'online' : 'offline');
  lbl.textContent = online ? 'Connected' : 'Not connected';
}

// ─── Navigation ─────────────────────────────────────────────
function navigateTo(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  const page = document.getElementById('page-' + pageId);
  if (page) page.classList.add('active');
  const link = document.querySelector(`[data-page="${pageId}"]`);
  if (link) link.classList.add('active');

  // Close sidebar on mobile
  document.getElementById('sidebar').classList.remove('open');

  switch (pageId) {
    case 'dashboard': loadDashboard(); break;
    case 'employees': loadEmployees(); break;
    case 'monthly':   loadMonthly(); break;
    case 'kpi-entry': loadKpiEntry(); break;
    case 'reports':   loadReports(); break;
  }
}

// ─── Load employees into memory ─────────────────────────────
async function fetchEmployees() {
  if (!supabase) return [];
  const { data, error } = await supabase.from('employees').select('*').order('name');
  if (error) { console.error(error); return []; }
  employees = data || [];
  return employees;
}

async function fetchSummaries() {
  if (!supabase) return [];
  const { data, error } = await supabase.from('monthly_summaries').select('*');
  if (error) { console.error(error); return []; }
  allSummaries = data || [];
  return allSummaries;
}

async function fetchKpiEntries() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('daily_kpi_entries').select('*').order('entry_date', { ascending: false });
  if (error) { console.error(error); return []; }
  allKpiEntries = data || [];
  return allKpiEntries;
}

// ─── Populate employee dropdowns ────────────────────────────
function populateEmpSelects(emps) {
  const selects = [
    'dashboardEmployee', 'monthlyEmpFilter', 'monthlyEmpSelect',
    'kpiEmployee', 'recentEmpFilter', 'reportEmployee'
  ];
  selects.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const prev = el.value;
    // Keep first option
    while (el.options.length > 1) el.remove(1);
    emps.forEach(e => {
      const opt = document.createElement('option');
      opt.value = e.id;
      opt.textContent = e.name + (e.branch ? ' · ' + e.branch : '');
      el.appendChild(opt);
    });
    if (prev) el.value = prev;
  });
}

// ─── Dashboard ──────────────────────────────────────────────
async function loadDashboard() {
  if (!supabase) {
    document.getElementById('dashboardSubtitle').textContent = 'Connect to Supabase to see your data';
    document.getElementById('empTableBody').innerHTML =
      '<tr><td colspan="7" class="loading-row">Not connected — open ⚙ Settings to configure Supabase.</td></tr>';
    return;
  }

  const [emps, summaries, entries] = await Promise.all([
    fetchEmployees(), fetchSummaries(), fetchKpiEntries()
  ]);

  populateEmpSelects(emps);

  // Fill month selector
  const monthSel = document.getElementById('dashboardMonth');
  const months = [...new Set(summaries.map(s => s.month_year))].sort().reverse();
  while (monthSel.options.length > 1) monthSel.remove(1);
  months.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = monthLabelFull(m);
    monthSel.appendChild(opt);
  });
  // Default to most recent
  if (!monthSel.value && months.length) monthSel.value = months[0];

  renderDashboard(emps, summaries, entries);
}

function renderDashboard(emps, summaries, entries) {
  const filterMonth = document.getElementById('dashboardMonth').value;
  const filterEmp   = document.getElementById('dashboardEmployee').value;

  let filteredSummaries = summaries;
  if (filterMonth) filteredSummaries = filteredSummaries.filter(s => s.month_year === filterMonth);
  if (filterEmp)   filteredSummaries = filteredSummaries.filter(s => s.employee_id === filterEmp);

  let filteredEntries = entries;
  if (filterMonth) {
    filteredEntries = filteredEntries.filter(e => e.entry_date?.startsWith(filterMonth));
  }
  if (filterEmp) filteredEntries = filteredEntries.filter(e => e.employee_id === filterEmp);

  // Subtitle
  const subtitle = filterMonth
    ? `Showing ${monthLabelFull(filterMonth)}${filterEmp ? ' · ' + (emps.find(e => e.id === filterEmp)?.name || '') : ''}`
    : 'All time';
  document.getElementById('dashboardSubtitle').textContent = subtitle;

  // Stats
  const scores = filteredSummaries.map(s => s.avg_score).filter(v => v != null && v > 0);
  const avgScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
  document.getElementById('statAvgScore').textContent = avgScore != null ? (avgScore * 100).toFixed(1) + '%' : '—';
  document.getElementById('statAvgScoreSub').textContent = `across ${emps.length} employee${emps.length !== 1 ? 's' : ''}`;

  // Top performer in filtered period
  const empScores = emps.map(emp => {
    const s = filteredSummaries.filter(x => x.employee_id === emp.id);
    const sc = s.map(x => x.avg_score).filter(v => v != null && v > 0);
    return { emp, avg: sc.length ? sc.reduce((a,b) => a+b,0)/sc.length : null };
  }).filter(x => x.avg != null).sort((a, b) => b.avg - a.avg);

  if (empScores.length) {
    document.getElementById('statTopPerformer').textContent = empScores[0].emp.name;
    document.getElementById('statTopScore').textContent = formatPct(empScores[0].avg);
  } else {
    document.getElementById('statTopPerformer').textContent = '—';
    document.getElementById('statTopScore').textContent = 'this period';
  }

  // Work days = distinct entry dates
  const workDays = new Set(filteredEntries.map(e => e.entry_date)).size;
  document.getElementById('statWorkDays').textContent = workDays;
  document.getElementById('statKpiCount').textContent = filteredEntries.length;

  // Trend chart — monthly avg per employee
  renderTrendChart(emps, summaries, filterEmp);

  // KPI radar — avg weighted values by KPI name
  renderKpiRadar(filteredEntries);

  // Employee table
  renderEmpTable(emps, summaries, document.getElementById('empSearch').value);
}

function renderTrendChart(emps, summaries, filterEmp) {
  const canvas = document.getElementById('trendChart');
  if (!canvas) return;

  // Get all months with data
  const allMonths = [...new Set(summaries.map(s => s.month_year))].sort();
  const displayEmps = filterEmp ? emps.filter(e => e.id === filterEmp) : emps;

  const palette = ['#1d9e75','#3b82f6','#8b5cf6','#f59e0b','#ef4444','#06b6d4'];
  const datasets = displayEmps.map((emp, i) => {
    const data = allMonths.map(m => {
      const s = summaries.find(x => x.employee_id === emp.id && x.month_year === m);
      return s?.avg_score != null ? +(s.avg_score * 100).toFixed(2) : null;
    });
    return {
      label: emp.name,
      data,
      borderColor: palette[i % palette.length],
      backgroundColor: palette[i % palette.length] + '20',
      borderWidth: 2,
      pointRadius: 4,
      pointHoverRadius: 6,
      tension: 0.35,
      fill: false,
      spanGaps: true
    };
  });

  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';
  const textColor = isDark ? '#a09e99' : '#6b6a67';

  if (trendChart) trendChart.destroy();
  trendChart = new Chart(canvas, {
    type: 'line',
    data: { labels: allMonths.map(m => monthLabel(m)), datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: textColor, font: { size: 11 }, boxWidth: 10 } },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y != null ? ctx.parsed.y.toFixed(1) + '%' : '—'}`
          }
        }
      },
      scales: {
        x: { grid: { color: gridColor }, ticks: { color: textColor, font: { size: 11 } } },
        y: {
          grid: { color: gridColor },
          ticks: { color: textColor, font: { size: 11 }, callback: v => v + '%' },
          min: 0, max: 110
        }
      }
    }
  });

  // Legend
  const legend = document.getElementById('trendLegend');
  if (legend) {
    legend.innerHTML = displayEmps.map((e, i) =>
      `<span style="color:${palette[i % palette.length]};margin-right:8px">● ${e.name}</span>`
    ).join('');
  }
}

function renderKpiRadar(entries) {
  const canvas = document.getElementById('kpiRadar');
  if (!canvas) return;

  const kpiNames = ['System Uptime','Timeliness','Technical Accuracy','Compliance','Coordination','Attendance','Grooming and Hygeine'];
  const avgs = kpiNames.map(kpi => {
    const vals = entries.filter(e => e.kpi_name === kpi && e.actual_pct != null).map(e => e.actual_pct);
    return vals.length ? vals.reduce((a,b) => a+b,0)/vals.length * 100 : 0;
  });

  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const gridColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)';
  const textColor = isDark ? '#a09e99' : '#6b6a67';

  if (kpiRadar) kpiRadar.destroy();
  kpiRadar = new Chart(canvas, {
    type: 'radar',
    data: {
      labels: kpiNames.map(k => k.length > 12 ? k.slice(0, 12) + '…' : k),
      datasets: [{
        label: 'Avg %',
        data: avgs,
        borderColor: '#1d9e75',
        backgroundColor: 'rgba(29,158,117,0.15)',
        borderWidth: 2,
        pointRadius: 4
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        r: {
          min: 0, max: 100,
          grid: { color: gridColor },
          angleLines: { color: gridColor },
          pointLabels: { color: textColor, font: { size: 10 } },
          ticks: { display: false }
        }
      }
    }
  });
}

function renderEmpTable(emps, summaries, search) {
  const tbody = document.getElementById('empTableBody');
  const months = ['2026-04','2026-05','2026-06'];

  let list = emps;
  if (search) list = list.filter(e => e.name.toLowerCase().includes(search.toLowerCase()) ||
                                      e.branch?.toLowerCase().includes(search.toLowerCase()));

  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="loading-row">No employees found.</td></tr>';
    return;
  }

  tbody.innerHTML = list.map(emp => {
    const byMonth = months.map(m => {
      const s = summaries.find(x => x.employee_id === emp.id && x.month_year === m);
      return s?.avg_score != null && s.avg_score > 0 ? s.avg_score : null;
    });
    const ytdScores = summaries.filter(s => s.employee_id === emp.id && s.avg_score != null && s.avg_score > 0)
                               .map(s => s.avg_score);
    const ytdAvg = ytdScores.length ? ytdScores.reduce((a,b) => a+b,0)/ytdScores.length : null;

    return `<tr>
      <td><strong>${emp.name}</strong></td>
      <td>${emp.branch || '—'}</td>
      ${byMonth.map(v => `<td>${v != null ? (v*100).toFixed(1)+'%' : '<span style="color:var(--text-3)">—</span>'}</td>`).join('')}
      <td>${ytdAvg != null ? (ytdAvg*100).toFixed(1)+'%' : '—'}</td>
      <td><span class="badge ${scoreClass(ytdAvg)}">${scoreLabel(ytdAvg)}</span></td>
    </tr>`;
  }).join('');
}

// ─── Employees Page ─────────────────────────────────────────
async function loadEmployees() {
  const grid = document.getElementById('employeeGrid');
  grid.innerHTML = '<p class="loading-text">Loading employees…</p>';

  if (!requireDB()) {
    grid.innerHTML = '<p class="loading-text">Not connected. Open ⚙ Settings.</p>';
    return;
  }

  const [emps, summaries] = await Promise.all([fetchEmployees(), fetchSummaries()]);
  populateEmpSelects(emps);

  if (!emps.length) {
    grid.innerHTML = '<p class="loading-text">No employees yet. Click + Add Employee to get started.</p>';
    return;
  }

  const currentMonth = getCurrentMonthYear();

  grid.innerHTML = emps.map(emp => {
    const recentSummaries = summaries.filter(s => s.employee_id === emp.id && s.avg_score != null && s.avg_score > 0);
    const latestScore = recentSummaries.sort((a,b) => b.month_year.localeCompare(a.month_year))[0];
    const ytdScores = recentSummaries.map(s => s.avg_score);
    const ytdAvg = ytdScores.length ? ytdScores.reduce((a,b) => a+b,0)/ytdScores.length : null;
    const color = avatarColor(emp.name);

    return `<div class="emp-card">
      <div class="emp-card-top">
        <div class="emp-avatar" style="background:${color}22;color:${color}">${empInitials(emp.name)}</div>
        <div>
          <div class="emp-name">${emp.name}</div>
          <div class="emp-branch">${emp.branch || 'No branch'}</div>
        </div>
      </div>
      <div class="emp-stats">
        <div class="emp-stat-item">
          <div class="emp-stat-label">Latest Score</div>
          <div class="emp-stat-value" style="color:${color}">${latestScore ? (latestScore.avg_score*100).toFixed(1)+'%' : '—'}</div>
        </div>
        <div class="emp-stat-item">
          <div class="emp-stat-label">YTD Average</div>
          <div class="emp-stat-value">${ytdAvg != null ? (ytdAvg*100).toFixed(1)+'%' : '—'}</div>
        </div>
        <div class="emp-stat-item">
          <div class="emp-stat-label">Months Logged</div>
          <div class="emp-stat-value">${recentSummaries.length}</div>
        </div>
        <div class="emp-stat-item">
          <div class="emp-stat-label">Status</div>
          <div class="emp-stat-value" style="font-size:12px">
            <span class="badge ${scoreClass(ytdAvg)}">${scoreLabel(ytdAvg)}</span>
          </div>
        </div>
      </div>
      <div class="emp-card-actions">
        <button class="btn-secondary" style="flex:1;font-size:12px" onclick="editEmployee('${emp.id}')">Edit</button>
        <button class="btn-icon danger" onclick="deleteEmployee('${emp.id}','${emp.name.replace(/'/g,"\\'")}')">✕</button>
      </div>
    </div>`;
  }).join('');
}

async function editEmployee(id) {
  const emp = employees.find(e => e.id === id);
  if (!emp) return;
  document.getElementById('empId').value = emp.id;
  document.getElementById('empName').value = emp.name;
  document.getElementById('empBranch').value = emp.branch || '';
  document.getElementById('empModalTitle').textContent = 'Edit Employee';
  document.getElementById('employeeModal').classList.remove('hidden');
}

async function deleteEmployee(id, name) {
  if (!confirm(`Delete ${name}? This will also remove all their KPI entries and summaries.`)) return;
  const { error } = await supabase.from('employees').delete().eq('id', id);
  if (error) { showToast('Delete failed: ' + error.message, 'error'); return; }
  showToast(`${name} deleted.`, 'success');
  loadEmployees();
}

// ─── Monthly Tracker ────────────────────────────────────────
async function loadMonthly() {
  const grid = document.getElementById('monthlyGrid');
  grid.innerHTML = '<p class="loading-text">Loading…</p>';

  if (!requireDB()) {
    grid.innerHTML = '<p class="loading-text">Not connected.</p>';
    return;
  }

  const [emps, summaries] = await Promise.all([fetchEmployees(), fetchSummaries()]);
  populateEmpSelects(emps);

  // Populate month filter
  const monthSel = document.getElementById('monthlyMonthFilter');
  const months = [...new Set(summaries.map(s => s.month_year))].sort().reverse();
  while (monthSel.options.length > 1) monthSel.remove(1);
  months.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m; opt.textContent = monthLabelFull(m);
    monthSel.appendChild(opt);
  });

  renderMonthlyGrid(emps, summaries);
}

function renderMonthlyGrid(emps, summaries) {
  const filterEmp   = document.getElementById('monthlyEmpFilter').value;
  const filterMonth = document.getElementById('monthlyMonthFilter').value;

  const allMonths = ['2026-01','2026-02','2026-03','2026-04','2026-05','2026-06',
                     '2026-07','2026-08','2026-09','2026-10','2026-11','2026-12'];

  const showEmps  = filterEmp ? emps.filter(e => e.id === filterEmp) : emps;
  const showMonths = filterMonth ? [filterMonth] : allMonths;

  const cards = [];
  showEmps.forEach(emp => {
    showMonths.forEach(m => {
      const s = summaries.find(x => x.employee_id === emp.id && x.month_year === m);
      cards.push({ emp, month: m, summary: s });
    });
  });

  if (!cards.length) {
    document.getElementById('monthlyGrid').innerHTML = '<p class="loading-text">No data found.</p>';
    return;
  }

  const color = avatarColor;
  document.getElementById('monthlyGrid').innerHTML = cards.map(({ emp, month, summary: s }) => {
    const hasData = s && s.avg_score != null && s.avg_score > 0;
    const zeroTol = s?.zero_tolerance;
    const cls = zeroTol ? 'monthly-card zero-tolerance' : hasData ? 'monthly-card has-data' : 'monthly-card';
    const score = hasData ? (s.avg_score * 100).toFixed(2) + '%' : '—';
    const c = avatarColor(emp.name);

    return `<div class="${cls}">
      <div class="monthly-card-month">${monthLabelFull(month)}</div>
      <div class="monthly-card-name" style="color:${c}">${emp.name}</div>
      <div class="monthly-card-score">${score}</div>
      <div class="monthly-card-label">
        ${hasData ? `<span class="badge ${scoreClass(s.avg_score)}">${scoreLabel(s.avg_score)}</span>` : 'Not logged'}
        ${zeroTol ? ' <span class="badge badge-red">Zero Tolerance</span>' : ''}
      </div>
      ${hasData && s.notes ? `<div style="font-size:11px;color:var(--text-2);margin-top:6px;font-style:italic">${s.notes}</div>` : ''}
      <button class="monthly-card-edit" onclick='openMonthlyModal(${JSON.stringify(s || null)}, "${emp.id}", "${month}")'>✎</button>
    </div>`;
  }).join('');
}

function openMonthlyModal(s, empId, month) {
  const modal = document.getElementById('monthlyModal');
  document.getElementById('monthlyId').value = s?.id || '';
  document.getElementById('monthlyEmpId').value = empId;
  document.getElementById('monthlyEmpSelect').value = empId;
  document.getElementById('monthlyMonthSelect').value = month;
  document.getElementById('monthlyScore').value = s?.avg_score != null ? (s.avg_score * 100).toFixed(4) : '';
  document.getElementById('monthlyBonus').value = s?.bonus_points || '';
  document.getElementById('monthlyAmuma').value = s?.amuma_behavior || '';
  document.getElementById('monthlyDeduction').value = s?.deduction || '';
  document.getElementById('monthlyZeroTolerance').checked = s?.zero_tolerance || false;
  document.getElementById('monthlyNotes').value = s?.notes || '';
  const emp = employees.find(e => e.id === empId);
  document.getElementById('monthlyModalTitle').textContent =
    `${emp ? emp.name + ' · ' : ''}${monthLabelFull(month)}`;
  modal.classList.remove('hidden');
}

// ─── KPI Entry ──────────────────────────────────────────────
let kpiRows = [];

async function loadKpiEntry() {
  if (!requireDB()) return;

  const emps = await fetchEmployees();
  populateEmpSelects(emps);

  // Default date to today
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('kpiDate').value = today;

  // Init with default KPIs
  kpiRows = [];
  document.getElementById('kpiRows').innerHTML = '';
  const defaultKPIs = [
    { name: 'System Uptime', weight: 0.25 },
    { name: 'Timeliness', weight: 0.20 },
    { name: 'Technical Accuracy', weight: 0.20 },
    { name: 'Compliance', weight: 0.15 },
    { name: 'Coordination', weight: 0.10 },
    { name: 'Attendance', weight: 0.05 },
    { name: 'Grooming and Hygeine', weight: 0.05 },
  ];
  defaultKPIs.forEach(k => addKpiRow(k.name, k.weight));

  // Load recent entries
  loadRecentEntries();
}

function addKpiRow(name = '', weight = '') {
  const id = 'kpi_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  kpiRows.push(id);

  const row = document.createElement('div');
  row.className = 'kpi-row';
  row.id = id;
  row.innerHTML = `
    <input type="text" placeholder="KPI name" class="kpi-name" value="${name}">
    <input type="number" placeholder="0.25" class="kpi-weight" value="${weight}" min="0" max="1" step="0.01">
    <input type="number" placeholder="Target" class="kpi-target" min="0" step="0.01">
    <input type="number" placeholder="Actual" class="kpi-actual" min="0" step="0.01">
    <span class="kpi-wv kpi-pct-display">—</span>
    <span class="kpi-wv kpi-wv-display">—</span>
    <button type="button" class="btn-icon danger" onclick="removeKpiRow('${id}')">✕</button>
  `;
  document.getElementById('kpiRows').appendChild(row);

  // Auto-calc on input
  row.querySelectorAll('input').forEach(inp => inp.addEventListener('input', recalcKpi));
}

function removeKpiRow(id) {
  document.getElementById(id)?.remove();
  kpiRows = kpiRows.filter(r => r !== id);
  recalcKpi();
}

function recalcKpi() {
  let totalWV = 0;
  document.querySelectorAll('.kpi-row').forEach(row => {
    const weight = parseFloat(row.querySelector('.kpi-weight')?.value) || 0;
    const target = parseFloat(row.querySelector('.kpi-target')?.value);
    const actual = parseFloat(row.querySelector('.kpi-actual')?.value);
    const pctEl  = row.querySelector('.kpi-pct-display');
    const wvEl   = row.querySelector('.kpi-wv-display');

    if (!isNaN(target) && !isNaN(actual) && target > 0) {
      const pct = actual / target;
      const wv  = pct * weight;
      totalWV += wv;
      if (pctEl) pctEl.textContent = (pct * 100).toFixed(1) + '%';
      if (wvEl)  wvEl.textContent  = wv.toFixed(4);
    } else {
      if (pctEl) pctEl.textContent = '—';
      if (wvEl)  wvEl.textContent  = '—';
    }
  });

  document.getElementById('kpiTotalWV').textContent  = totalWV.toFixed(4);
  document.getElementById('kpiScore').textContent     = (totalWV * 100).toFixed(2) + '%';
}

async function loadRecentEntries() {
  const tbody = document.getElementById('recentTableBody');
  tbody.innerHTML = '<tr><td colspan="7" class="loading-row">Loading…</td></tr>';

  const entries = await fetchKpiEntries();
  const filterEmp   = document.getElementById('recentEmpFilter').value;
  const filterMonth = document.getElementById('recentMonthFilter').value;

  let filtered = entries;
  if (filterEmp)   filtered = filtered.filter(e => e.employee_id === filterEmp);
  if (filterMonth) filtered = filtered.filter(e => e.entry_date?.startsWith(filterMonth));

  // Group by date+employee
  const grouped = {};
  filtered.forEach(e => {
    const key = `${e.entry_date}|${e.employee_id}`;
    if (!grouped[key]) grouped[key] = { date: e.entry_date, empId: e.employee_id, entries: [] };
    grouped[key].entries.push(e);
  });

  const rows = Object.values(grouped).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 100);

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="loading-row">No entries found.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.flatMap(g => {
    const emp = employees.find(e => e.id === g.empId);
    return g.entries.map((e, i) => `<tr>
      <td>${i === 0 ? g.date : ''}</td>
      <td>${i === 0 && emp ? emp.name : ''}</td>
      <td>${e.kpi_name}</td>
      <td>${e.target ?? '—'}</td>
      <td>${e.actual_value ?? '—'}</td>
      <td>${e.weighted_value != null ? e.weighted_value.toFixed(4) : '—'}</td>
      <td><button class="btn-icon danger" onclick="deleteKpiEntry('${e.id}')">✕</button></td>
    </tr>`);
  }).join('');
}

async function deleteKpiEntry(id) {
  if (!confirm('Delete this KPI entry?')) return;
  const { error } = await supabase.from('daily_kpi_entries').delete().eq('id', id);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Entry deleted.', 'success');
  loadRecentEntries();
}

// ─── Reports ────────────────────────────────────────────────
async function loadReports() {
  if (!requireDB()) return;

  const [emps, summaries, entries] = await Promise.all([
    fetchEmployees(), fetchSummaries(), fetchKpiEntries()
  ]);
  populateEmpSelects(emps);

  renderYearChart(emps, summaries);
  renderWeightChart(entries);
  renderReportTable(emps, summaries);
}

function renderYearChart(emps, summaries) {
  const canvas = document.getElementById('yearChart');
  if (!canvas) return;

  const filterEmp = document.getElementById('reportEmployee').value;
  const filterYear = document.getElementById('reportYear').value || '2026';

  const months = Array.from({length:12}, (_,i) => `${filterYear}-${String(i+1).padStart(2,'0')}`);
  const displayEmps = filterEmp ? emps.filter(e => e.id === filterEmp) : emps;
  const palette = ['#1d9e75','#3b82f6','#8b5cf6','#f59e0b','#ef4444','#06b6d4'];

  const datasets = displayEmps.map((emp, i) => ({
    label: emp.name,
    data: months.map(m => {
      const s = summaries.find(x => x.employee_id === emp.id && x.month_year === m);
      return s?.avg_score != null && s.avg_score > 0 ? +(s.avg_score*100).toFixed(2) : null;
    }),
    borderColor: palette[i % palette.length],
    backgroundColor: palette[i % palette.length] + '30',
    borderWidth: 2,
    pointRadius: 5,
    tension: 0.3,
    fill: false,
    spanGaps: true
  }));

  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';
  const textColor = isDark ? '#a09e99' : '#6b6a67';
  const monthLabels = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  if (yearChart) yearChart.destroy();
  yearChart = new Chart(canvas, {
    type: 'line',
    data: { labels: monthLabels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: textColor, font: { size: 11 }, boxWidth: 10 } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y != null ? ctx.parsed.y+'%' : '—'}` }}
      },
      scales: {
        x: { grid: { color: gridColor }, ticks: { color: textColor } },
        y: { grid: { color: gridColor }, ticks: { color: textColor, callback: v => v+'%' }, min: 0, max: 110 }
      }
    }
  });
}

function renderWeightChart(entries) {
  const canvas = document.getElementById('weightChart');
  if (!canvas) return;

  const kpiWeights = {};
  entries.forEach(e => {
    if (e.kpi_name && e.weight) {
      kpiWeights[e.kpi_name] = Math.max(kpiWeights[e.kpi_name] || 0, e.weight);
    }
  });

  const labels = Object.keys(kpiWeights);
  const data   = Object.values(kpiWeights);
  const palette = ['#1d9e75','#3b82f6','#8b5cf6','#f59e0b','#ef4444','#06b6d4','#10b981'];

  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const textColor = isDark ? '#a09e99' : '#6b6a67';

  if (weightChart) weightChart.destroy();
  weightChart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data, backgroundColor: palette, borderWidth: 0 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: textColor, font: { size: 10 }, boxWidth: 10, padding: 8 } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${(ctx.parsed*100).toFixed(0)}%` } }
      }
    }
  });
}

function renderReportTable(emps, summaries) {
  const tbody = document.getElementById('reportTableBody');
  const filterEmp  = document.getElementById('reportEmployee').value;
  const filterYear = document.getElementById('reportYear').value || '2026';

  let data = summaries.filter(s => s.month_year?.startsWith(filterYear));
  if (filterEmp) data = data.filter(s => s.employee_id === filterEmp);
  data.sort((a,b) => b.month_year.localeCompare(a.month_year) || 0);

  if (!data.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="loading-row">No data for selected period.</td></tr>';
    return;
  }

  tbody.innerHTML = data.map(s => {
    const emp = emps.find(e => e.id === s.employee_id);
    const score = s.avg_score || 0;
    const bonus = s.bonus_points || 0;
    const amuma = s.amuma_behavior || 0;
    const ded   = s.deduction || 0;
    const final = score + (bonus/100) + (amuma/100) - (ded/100);

    return `<tr>
      <td>${monthLabelFull(s.month_year)}</td>
      <td>${emp ? emp.name : '—'}</td>
      <td>${score > 0 ? (score*100).toFixed(2)+'%' : '—'}</td>
      <td>${bonus ? '+'+bonus+'%' : '—'}</td>
      <td>${amuma ? amuma+'%' : '—'}</td>
      <td>${ded ? '-'+ded+'%' : '—'}</td>
      <td><strong>${score > 0 ? (final*100).toFixed(2)+'%' : '—'}</strong></td>
      <td>
        ${s.zero_tolerance ? '<span class="badge badge-red">Zero Tol.</span>' : ''}
        <span class="badge ${scoreClass(score)}">${scoreLabel(score)}</span>
      </td>
    </tr>`;
  }).join('');
}

// ─── Settings modal ─────────────────────────────────────────
function openSettings() {
  document.getElementById('supabaseUrl').value = localStorage.getItem('elv_supabase_url') || '';
  document.getElementById('supabaseKey').value = localStorage.getItem('elv_supabase_key') || '';
  document.getElementById('settingsModal').classList.remove('hidden');
}

function closeSettings() {
  document.getElementById('settingsModal').classList.add('hidden');
}

// ─── All event listeners — safely inside DOMContentLoaded ───
document.addEventListener('DOMContentLoaded', () => {

  // Init Supabase
  initSupabase();
  checkDBStatus();

  // Navigation
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      navigateTo(link.dataset.page);
    });
  });

  // Sidebar toggle
  document.getElementById('sidebarToggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });

  // Settings open/close
  document.getElementById('openSettings').addEventListener('click', openSettings);
  document.getElementById('closeSettings').addEventListener('click', closeSettings);
  document.getElementById('cancelSettings').addEventListener('click', closeSettings);

  // Settings form submit
  document.getElementById('settingsForm').addEventListener('submit', async e => {
    e.preventDefault();
    const url = document.getElementById('supabaseUrl').value.trim();
    const key = document.getElementById('supabaseKey').value.trim();
    if (!url || !key) { showToast('Both URL and key are required.', 'error'); return; }
    localStorage.setItem('elv_supabase_url', url);
    localStorage.setItem('elv_supabase_key', key);
    supabase = null;
    if (initSupabase()) {
      await checkDBStatus();
      showToast('Connected to Supabase!', 'success');
      closeSettings();
      navigateTo('dashboard');
    } else {
      showToast('Failed to init Supabase client.', 'error');
    }
  });

  // Employee modal open/close
  document.getElementById('addEmployeeBtn').addEventListener('click', () => {
    document.getElementById('empId').value = '';
    document.getElementById('empName').value = '';
    document.getElementById('empBranch').value = '';
    document.getElementById('empModalTitle').textContent = 'Add Employee';
    document.getElementById('employeeModal').classList.remove('hidden');
  });
  document.getElementById('closeEmpModal').addEventListener('click', () => {
    document.getElementById('employeeModal').classList.add('hidden');
  });
  document.getElementById('cancelEmpModal').addEventListener('click', () => {
    document.getElementById('employeeModal').classList.add('hidden');
  });

  // Employee form submit
  document.getElementById('employeeForm').addEventListener('submit', async e => {
    e.preventDefault();
    if (!requireDB()) return;

    const id     = document.getElementById('empId').value;
    const name   = document.getElementById('empName').value.trim();
    const branch = document.getElementById('empBranch').value.trim();

    if (!name) { showToast('Name is required.', 'error'); return; }

    let error;
    if (id) {
      ({ error } = await supabase.from('employees').update({ name, branch }).eq('id', id));
    } else {
      ({ error } = await supabase.from('employees').insert({ name, branch }));
    }

    if (error) { showToast('Error: ' + error.message, 'error'); return; }
    showToast(id ? 'Employee updated.' : 'Employee added.', 'success');
    document.getElementById('employeeModal').classList.add('hidden');
    document.getElementById('employeeForm').reset();
    loadEmployees();
  });

  // Monthly modal close
  document.getElementById('closeMonthlyModal').addEventListener('click', () => {
    document.getElementById('monthlyModal').classList.add('hidden');
  });
  document.getElementById('cancelMonthlyModal').addEventListener('click', () => {
    document.getElementById('monthlyModal').classList.add('hidden');
  });

  // Monthly form submit
  document.getElementById('monthlyForm').addEventListener('submit', async e => {
    e.preventDefault();
    if (!requireDB()) return;

    const id       = document.getElementById('monthlyId').value;
    const emp_id   = document.getElementById('monthlyEmpSelect').value;
    const month_yr = document.getElementById('monthlyMonthSelect').value;
    const scoreRaw = parseFloat(document.getElementById('monthlyScore').value);

    if (!emp_id || !month_yr) { showToast('Employee and month are required.', 'error'); return; }

    const payload = {
      employee_id: emp_id,
      month_year: month_yr,
      avg_score: !isNaN(scoreRaw) ? scoreRaw / 100 : null,
      bonus_points: parseFloat(document.getElementById('monthlyBonus').value) || 0,
      amuma_behavior: parseFloat(document.getElementById('monthlyAmuma').value) || 0,
      deduction: parseFloat(document.getElementById('monthlyDeduction').value) || 0,
      zero_tolerance: document.getElementById('monthlyZeroTolerance').checked,
      notes: document.getElementById('monthlyNotes').value.trim() || null,
      updated_at: new Date().toISOString()
    };

    let error;
    if (id) {
      ({ error } = await supabase.from('monthly_summaries').update(payload).eq('id', id));
    } else {
      ({ error } = await supabase.from('monthly_summaries').upsert(payload, {
        onConflict: 'employee_id,month_year'
      }));
    }

    if (error) { showToast('Error: ' + error.message, 'error'); return; }
    showToast('Summary saved!', 'success');
    document.getElementById('monthlyModal').classList.add('hidden');

    const [emps, summaries] = await Promise.all([fetchEmployees(), fetchSummaries()]);
    renderMonthlyGrid(emps, summaries);
  });

  // KPI add row button
  document.getElementById('addKpiRow').addEventListener('click', () => addKpiRow());

  // KPI form submit
  document.getElementById('kpiForm').addEventListener('submit', async e => {
    e.preventDefault();
    if (!requireDB()) return;

    const empId = document.getElementById('kpiEmployee').value;
    const date  = document.getElementById('kpiDate').value;
    const shift = document.getElementById('kpiShift').value.trim();
    const notes = document.getElementById('kpiNotes').value.trim();

    if (!empId || !date) { showToast('Employee and date are required.', 'error'); return; }

    const rows = document.querySelectorAll('.kpi-row');
    const entries = [];

    rows.forEach(row => {
      const kpiName = row.querySelector('.kpi-name')?.value?.trim();
      const weight  = parseFloat(row.querySelector('.kpi-weight')?.value);
      const target  = parseFloat(row.querySelector('.kpi-target')?.value);
      const actual  = parseFloat(row.querySelector('.kpi-actual')?.value);

      if (!kpiName || isNaN(weight)) return;

      const actual_pct = (!isNaN(target) && !isNaN(actual) && target > 0) ? actual / target : null;
      const weighted   = actual_pct != null ? actual_pct * weight : null;

      entries.push({
        employee_id: empId,
        entry_date: date,
        kpi_name: kpiName,
        weight,
        target: !isNaN(target) ? target : null,
        actual_value: !isNaN(actual) ? actual : null,
        actual_pct,
        weighted_value: weighted,
        updated_at: new Date().toISOString()
      });
    });

    if (!entries.length) { showToast('Add at least one KPI row.', 'error'); return; }

    // Delete existing for this employee+date, then re-insert
    await supabase.from('daily_kpi_entries')
      .delete().eq('employee_id', empId).eq('entry_date', date);

    const { error } = await supabase.from('daily_kpi_entries').insert(entries);
    if (error) { showToast('Error: ' + error.message, 'error'); return; }

    if (shift) {
      await supabase.from('daily_shifts').upsert({
        employee_id: empId, shift_date: date, shift_label: shift
      }, { onConflict: 'employee_id,shift_date' });
    }

    if (notes) {
      await supabase.from('daily_notes').insert({
        employee_id: empId, note_date: date, note_text: notes
      });
    }

    // Recalculate monthly average from all days
    const monthYear = date.slice(0, 7);
    const { data: monthEntries } = await supabase
      .from('daily_kpi_entries')
      .select('entry_date, weighted_value')
      .eq('employee_id', empId)
      .gte('entry_date', monthYear + '-01')
      .lte('entry_date', monthYear + '-31');

    if (monthEntries?.length) {
      const byDay = {};
      monthEntries.forEach(me => {
        if (!byDay[me.entry_date]) byDay[me.entry_date] = 0;
        byDay[me.entry_date] += (me.weighted_value || 0);
      });
      const dayScores = Object.values(byDay).filter(v => v > 0);
      const avgScore  = dayScores.length ? dayScores.reduce((a,b) => a+b,0) / dayScores.length : null;

      await supabase.from('monthly_summaries').upsert({
        employee_id: empId,
        month_year: monthYear,
        avg_score: avgScore,
        updated_at: new Date().toISOString()
      }, { onConflict: 'employee_id,month_year' });
    }

    showToast('KPI entry saved!', 'success');
    document.getElementById('kpiForm').reset();
    kpiRows = [];
    document.getElementById('kpiRows').innerHTML = '';
    const defaultKPIs = [
      { name: 'System Uptime', weight: 0.25 }, { name: 'Timeliness', weight: 0.20 },
      { name: 'Technical Accuracy', weight: 0.20 }, { name: 'Compliance', weight: 0.15 },
      { name: 'Coordination', weight: 0.10 }, { name: 'Attendance', weight: 0.05 },
      { name: 'Grooming and Hygeine', weight: 0.05 }
    ];
    defaultKPIs.forEach(k => addKpiRow(k.name, k.weight));
    document.getElementById('kpiDate').value = date;
    loadRecentEntries();
  });

  // Dashboard filters
  document.getElementById('dashboardMonth').addEventListener('change', () => {
    renderDashboard(employees, allSummaries, allKpiEntries);
  });
  document.getElementById('dashboardEmployee').addEventListener('change', () => {
    renderDashboard(employees, allSummaries, allKpiEntries);
  });
  document.getElementById('empSearch').addEventListener('input', e => {
    renderEmpTable(employees, allSummaries, e.target.value);
  });

  // Monthly filters
  document.getElementById('monthlyEmpFilter').addEventListener('change', () => {
    renderMonthlyGrid(employees, allSummaries);
  });
  document.getElementById('monthlyMonthFilter').addEventListener('change', () => {
    renderMonthlyGrid(employees, allSummaries);
  });

  // Recent entries filters
  document.getElementById('recentEmpFilter').addEventListener('change', loadRecentEntries);
  document.getElementById('recentMonthFilter').addEventListener('change', loadRecentEntries);

  // Report filters
  document.getElementById('reportEmployee').addEventListener('change', () => {
    renderYearChart(employees, allSummaries);
    renderReportTable(employees, allSummaries);
  });
  document.getElementById('reportYear').addEventListener('change', () => {
    renderYearChart(employees, allSummaries);
    renderReportTable(employees, allSummaries);
  });

  // Close modals on backdrop click
  ['employeeModal', 'monthlyModal', 'settingsModal'].forEach(id => {
    document.getElementById(id).addEventListener('click', e => {
      if (e.target.id === id) {
        document.getElementById(id).classList.add('hidden');
      }
    });
  });

  // Load initial page
  navigateTo('dashboard');
});
