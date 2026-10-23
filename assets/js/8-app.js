/* =====================================================================
   8-app.js — التنقل + Profit Calculator + Init + Command Palette
   ===================================================================== */

/* ========== Missing i18n keys patch ========== */
Object.assign(I18N.ar, {
  'profit.tab1':'ربح الدفعة','profit.tab2':'سعر البيع المقترح',
  'profit.weight':'الوزن (كجم)','profit.costPerKg':'تكلفة الكيلو',
  'profit.targetMargin':'نسبة الربح المطلوبة %','profit.suggestedPrice':'سعر البيع المقترح',
  'profit.margin':'هامش الربح','profit.perBag':'ربح الدفعة',
});
Object.assign(I18N.en, {
  'profit.tab1':'Batch Profit','profit.tab2':'Suggested Price',
  'profit.weight':'Weight (kg)','profit.costPerKg':'Cost / Kg',
  'profit.targetMargin':'Target Margin %','profit.suggestedPrice':'Suggested Price',
  'profit.margin':'Margin','profit.perBag':'Profit / Batch',
});

/* ========== Navigation ========== */
let currentPage = 'dashboard';
const PAGES = {
  dashboard: renderDashboard, inventory: renderInventory, sales: renderSales,
  customers: renderCustomers, expenses: renderExpenses, cashbox: renderCashbox,
  workers: renderWorkers, partners: renderPartners, reports: renderReports,
  activity: renderActivity, settings: renderSettings,
};
function navigate(page) {
  currentPage = page;
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.page === page));
  document.getElementById('pageTitle').textContent = t('nav.' + page) || page;
  document.getElementById('sidebar').classList.remove('open');
  PAGES[page]();
  document.getElementById('content').scrollTop = 0;
  staggerStats();
  updateCashPill();
  renderAlertsBar();
}

/* ========== Profit Calculator ========== */
let calcTab = 'profit';
function openProfitCalc() {
  openModal(t('profit.title'), `
    <div class="calc-tabs">
      <button class="calc-tab ${calcTab==='profit'?'active':''}" onclick="switchCalcTab('profit')">${t('profit.tab1')}</button>
      <button class="calc-tab ${calcTab==='price'?'active':''}" onclick="switchCalcTab('price')">${t('profit.tab2')}</button>
    </div>
    <div id="calcBody"></div>
  `, `<button class="btn btn-secondary" onclick="closeModal()">${t('common.close')}</button>`);
  renderCalcBody();
}
function switchCalcTab(tab) {
  calcTab = tab;
  document.querySelectorAll('.calc-tab').forEach((b, i) => b.classList.toggle('active', (i === 0) === (tab === 'profit')));
  renderCalcBody();
}
function renderCalcBody() {
  const body = document.getElementById('calcBody');
  if (!body) return;
  if (calcTab === 'profit') {
    body.innerHTML = `
      <div class="form-grid">
        <div class="form-group"><label>${t('profit.buyPrice')}</label><input type="number" id="pc_buy" value="${state.settings.products[0].defaultBuyPrice}"></div>
        <div class="form-group"><label>${t('profit.bags')}</label><input type="number" id="pc_bags" value="1" min="1"></div>
        <div class="form-group"><label>${t('profit.sellPrice')}</label><input type="number" id="pc_sell" value="${state.settings.products[0].defaultSellPrice}"></div>
        <div class="form-group"><label>${t('profit.otherCost')}</label><input type="number" id="pc_other" value="${state.settings.opCost}"></div>
        <div class="form-group"><label>${t('profit.weight')}</label><input type="number" id="pc_weight" value="0" step="0.01"></div>
      </div>
      <div class="mt-16"><button class="btn btn-primary" onclick="calcProfit()">${t('profit.calc')}</button></div>
      <div id="profitResult"></div>
    `;
    ['pc_buy','pc_bags','pc_sell','pc_other','pc_weight'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', calcProfit);
    });
    calcProfit();
  } else {
    body.innerHTML = `
      <div class="form-grid">
        <div class="form-group"><label>${t('profit.costPerKg')}</label><input type="number" id="sp_cost" value="0" step="0.01"></div>
        <div class="form-group"><label>${t('profit.targetMargin')}</label><input type="number" id="sp_margin" value="50" min="0" max="200"></div>
      </div>
      <div class="mt-16"><button class="btn btn-primary" onclick="calcSuggestedPrice()">${t('profit.calc')}</button></div>
      <div id="priceResult"></div>
    `;
    ['sp_cost','sp_margin'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', calcSuggestedPrice);
    });
    calcSuggestedPrice();
  }
}
function calcProfit() {
  const buy = num(document.getElementById('pc_buy').value);
  const bags = Math.max(1, num(document.getElementById('pc_bags').value));
  const sell = num(document.getElementById('pc_sell').value);
  const other = num(document.getElementById('pc_other').value);
  const weight = num(document.getElementById('pc_weight').value);
  const revenue = bags * sell;
  const cost = bags * buy + other;
  const profit = revenue - cost;
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
  const perBag = bags > 0 ? profit / bags : 0;
  const kgCost = weight > 0 ? cost / weight : 0;
  const el = document.getElementById('profitResult');
  if (!el) return;
  el.innerHTML = `
    <div class="calc-result">
      <div class="row-between"><span>${t('profit.expectedRevenue')}</span><span>${fmt(revenue)}</span></div>
      <div class="row-between"><span>${t('profit.totalCost')}</span><span class="text-danger">${fmt(cost)}</span></div>
      <div class="row-between"><span>${t('profit.perBag')}</span><span>${fmt(perBag)}</span></div>
      ${weight > 0 ? `<div class="row-between"><span>${t('profit.costPerKg')}</span><span>${fmt(kgCost)}</span></div>` : ''}
      <div class="row-between big ${profit < 0 ? 'loss' : ''}">
        <span>${t('profit.expectedProfit')}</span>
        <span class="v">${fmt(profit)}</span>
      </div>
      <div class="row-between"><span>${t('profit.margin')}</span><span>${fmtNum(margin)}%</span></div>
    </div>
  `;
}
function calcSuggestedPrice() {
  const cost = num(document.getElementById('sp_cost').value);
  const margin = num(document.getElementById('sp_margin').value);
  const price = cost * (1 + margin / 100);
  const el = document.getElementById('priceResult');
  if (!el) return;
  el.innerHTML = `
    <div class="calc-result">
      <div class="row-between big">
        <span>${t('profit.suggestedPrice')}</span>
        <span class="v">${fmt(price)}</span>
      </div>
    </div>
  `;
}

/* ========== Command Palette ========== */
const CMD_ITEMS = [
  { id: 'nav.dashboard', k: 'dash', fn: () => navigate('dashboard') },
  { id: 'nav.inventory', k: 'inv', fn: () => navigate('inventory') },
  { id: 'nav.sales', k: 'sale', fn: () => navigate('sales') },
  { id: 'nav.customers', k: 'cust', fn: () => navigate('customers') },
  { id: 'nav.expenses', k: 'exp', fn: () => navigate('expenses') },
  { id: 'nav.cashbox', k: 'cash', fn: () => navigate('cashbox') },
  { id: 'nav.workers', k: 'wrk', fn: () => navigate('workers') },
  { id: 'nav.partners', k: 'prt', fn: () => navigate('partners') },
  { id: 'nav.reports', k: 'rep', fn: () => navigate('reports') },
  { id: 'nav.activity', k: 'act', fn: () => navigate('activity') },
  { id: 'nav.settings', k: 'set', fn: () => navigate('settings') },
];
function openCmdPalette() {
  document.getElementById('cmdPalette').classList.remove('hidden');
  const inp = document.getElementById('cmdInput');
  inp.value = ''; inp.focus();
  renderCmdResults('');
  inp.oninput = e => renderCmdResults(e.target.value);
  inp.onkeydown = e => {
    if (e.key === 'Escape') closeCmdPalette();
    if (e.key === 'Enter') {
      const first = document.querySelector('.cmd-item.active') || document.querySelector('.cmd-item');
      if (first) first.click();
    }
  };
}
function closeCmdPalette() { document.getElementById('cmdPalette').classList.add('hidden'); }
function renderCmdResults(q) {
  const results = document.getElementById('cmdResults');
  const items = CMD_ITEMS.filter(it => {
    const label = t(it.id).toLowerCase();
    return !q || label.includes(q.toLowerCase()) || it.k.includes(q.toLowerCase());
  });
  results.innerHTML = items.map((it, i) =>
    `<div class="cmd-item ${i===0?'active':''}" data-idx="${i}"><span>${esc(t(it.id))}</span></div>`
  ).join('') || `<div class="cmd-item text-muted">${LANG==='ar'?'لا نتائج':'No results'}</div>`;
  results.querySelectorAll('.cmd-item').forEach(el => {
    el.onclick = () => {
      const idx = +el.dataset.idx;
      if (items[idx]) { items[idx].fn(); closeCmdPalette(); }
    };
  });
}

/* ========== Init ========== */
function init() {
  applyLang();
  applyTheme();
  applyAccent(ACCENT);

  document.getElementById('nav').addEventListener('click', e => {
    const btn = e.target.closest('.nav-item');
    if (btn) { Sound.click(); navigate(btn.dataset.page); }
  });
  document.getElementById('langBtn').onclick = () => {
    LANG = LANG === 'ar' ? 'en' : 'ar';
    localStorage.setItem('ff_lang', LANG);
    applyLang(); navigate(currentPage);
  };
  document.getElementById('themeBtn').onclick = () => {
    THEME = THEME === 'dark' ? 'light' : 'dark';
    localStorage.setItem('ff_theme', THEME);
    applyTheme();
  };
  document.getElementById('menuBtn').onclick = () => document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('modalClose').onclick = closeModal;
  document.getElementById('modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
  document.getElementById('cmdBtn').onclick = openCmdPalette;
  document.getElementById('cmdPalette').addEventListener('click', e => { if (e.target.id === 'cmdPalette') closeCmdPalette(); });
  document.getElementById('profitCalcBtn').onclick = openProfitCalc;

  const stBtn = document.getElementById('soundToggle');
  stBtn.onclick = () => {
    SOUND_ON = !SOUND_ON;
    localStorage.setItem('ff_sound', SOUND_ON ? 'on' : 'off');
    stBtn.textContent = SOUND_ON ? '🔊' : '🔇';
    if (SOUND_ON) Sound.click();
  };
  stBtn.textContent = SOUND_ON ? '🔊' : '🔇';

  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      if (document.getElementById('cmdPalette').classList.contains('hidden')) openCmdPalette();
      else closeCmdPalette();
    }
    if (e.key === 'Escape') { closeModal(); closeCmdPalette(); }
  });

  setupCursorGlow();
  checkPin();
  navigate('dashboard');

  setTimeout(() => {
    const s = document.getElementById('splash');
    if (s) { s.classList.add('hide'); setTimeout(() => s.remove(), 600); }
  }, 800);
}

/* ========== Window Exposures ========== */
Object.assign(window, {
  shareWhatsApp, printStatement, showDailySummary, printDailySummary,
  applyCustomerPrice, renderAgingReport,
  navigate, closeModal, openModal, confirmDialog,
  updateBatchFields, openBatchModal, saveBatch, deleteBatch, openAdjustBatch, saveAdjustBatch,
  openInvoiceModal, addInvoiceLine, saveInvoice, openEditInvoice, saveEditInvoice,
  cancelInvoice, openCollectModal, saveCollect, printInvoice, repeatInvoice,
  openCustomerModal, saveCustomer, deleteCustomer, openStatement,
  openExpenseModal, saveExpense, deleteExpense,
  openOpeningCashModal, saveOpeningCash, openCashMovementModal, saveCashMovement, deleteCashMovement,
  openWorkerModal, saveWorker, deleteWorker, openWorkDayModal, fillWorkDayAmount,
  saveWorkDay, deleteWorkDay, openPayWorker, savePayWorker,
  openWithdraw, saveWithdraw, deleteDrawing,
  runReports, exportTableCSV, exportTableExcel,
  saveSettings, openProductModal, saveProduct, deleteProduct,
  exportFullJSON, importJSON, resetSystem, renderSettings, applyAccent,
  setPin, savePin, removePin,
  openProfitCalc, switchCalcTab, calcProfit, calcSuggestedPrice,
  renderDashboardCharts, renderAlertsBar, staggerStats,
});

document.addEventListener('DOMContentLoaded', init);