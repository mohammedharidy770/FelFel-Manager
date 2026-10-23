/* =====================================================================
   2-storage.js — التخزين + إدارة الحالة + Cache + Migration
   ===================================================================== */

const STORAGE_KEY = 'fel_fel_manager_v1';

// Cache version — يتجدد مع كل حفظ = يبطّل كل الحسابات المخزنة
let __stateVer = 0;
let __calcCache = {};

// Debounced save — يجمع عمليات الحفظ المتتالية
let __saveTimer = null;
let __savePending = false;

let state = loadState();

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const p = JSON.parse(raw);
    const merged = { ...defaultState(), ...p, version: SCHEMA_VERSION };
    if (!merged.settings.products) merged.settings.products = defaultProducts();
    if (!merged.settings.printMode) merged.settings.printMode = 'a5';
    if (!merged.workDays) merged.workDays = [];
    // Migration: batches without productId
    merged.batches.forEach(b => {
      if (!b.productId) b.productId = 'prod_pepper';
      if (b.availableQty === undefined) b.availableQty = num(b.netWeight || b.rawWeight || 0);
      if (b.soldQty === undefined) b.soldQty = 0;
      if (b.unitCount === undefined) b.unitCount = b.bags || 1;
      if (b.unitPrice === undefined) b.unitPrice = b.purchasePrice || 0;
      if (b.totalPurchase === undefined) b.totalPurchase = (b.purchasePrice || 0) * (b.bags || 1);
    });
    // Migration: workers with 'rate' → dailyWage
    merged.workers.forEach(w => {
      if (w.dailyWage === undefined) w.dailyWage = num(w.rate || 150);
      delete w.rate;
    });
    // Migration: wageEntries → workDays
    if (p.wageEntries && p.wageEntries.length && (!p.workDays || !p.workDays.length)) {
      p.wageEntries.forEach(we => {
        merged.workDays.push({ id: we.id || uid('wd'), workerId: we.workerId, date: we.date, amount: num(we.amount), notes: 'مُرحّل' });
      });
    }
    delete merged.wageEntries;
    return merged;
  } catch(e) { return defaultState(); }
}

function saveState(immediate) {
  __stateVer++;
  __calcCache = {}; // invalidate cache
  if (immediate) {
    _doSave();
    return;
  }
  if (__saveTimer) clearTimeout(__saveTimer);
  __savePending = true;
  __saveTimer = setTimeout(_doSave, 150); // debounce 150ms
}

function _doSave() {
  if (!__savePending) return;
  __savePending = false;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch(e) {
    if (typeof toast === 'function') toast(t('toast.error') + ': ' + e.message, 'error');
    // Try again immediately if failed
    setTimeout(_doSave, 1000);
  }
}

// Flush on page unload — critical: don't lose data
window.addEventListener('beforeunload', () => {
  if (__savePending) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch(e) {}
  }
});