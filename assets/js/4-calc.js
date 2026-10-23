/* =====================================================================
   4-calc.js — الحسابات (مع Cache) + التنبيهات + المساعدين
   ===================================================================== */

function getProduct(id) {
  return state.settings.products.find(p => p.id === id) || state.settings.products[0];
}
function getProductName(id) { return getProduct(id).name; }
function getProductUnit(id) { return getProduct(id).unit; }

/* Cache helper: يحفظ نتيجة الحساب لما state متتغيرش */
function cached(key, fn) {
  if (__calcCache[key] !== undefined) return __calcCache[key];
  return (__calcCache[key] = fn());
}

const Calc = {
  batchUnitCost(b) {
    const total = num(b.totalPurchase) + num(b.processingCost);
    const q = num(b.availableQty);
    return q > 0 ? total / q : 0;
  },

  cogsRange(from, to) {
    return cached(`cogs_${from}_${to}`, () => {
      let s = 0;
      state.invoices.forEach(inv => {
        if (inv.status === 'cancelled') return;
        if (!withinRange(inv.date, from, to)) return;
        inv.items.forEach(it => {
          const b = state.batches.find(x => x.id === it.batchId);
          if (b) s += num(it.qty) * num(b.unitCost);
        });
      });
      return s;
    });
  },
  cogs() { return this.cogsRange('', ''); },

  totalSales(from='', to='') {
    return cached(`sales_${from}_${to}`, () =>
      state.invoices
        .filter(i => i.status !== 'cancelled' && withinRange(i.date, from, to))
        .reduce((s, i) => s + num(i.total), 0)
    );
  },

  collectedCash(from='', to='') {
    return cached(`collect_${from}_${to}`, () => {
      let s = 0;
      state.invoices.forEach(i => {
        if (i.status !== 'cancelled' && withinRange(i.date, from, to)) s += num(i.paid);
      });
      state.payments.forEach(p => {
        if (withinRange(p.date, from, to)) s += num(p.amount);
      });
      return s;
    });
  },

  receivables() {
    return cached('receivables', () =>
      state.invoices
        .filter(i => i.status !== 'cancelled')
        .reduce((s, i) => s + Math.max(0, num(i.total) - num(i.paid)), 0)
    );
  },

  operatingExpenses(from='', to='') {
    return cached(`opexp_${from}_${to}`, () => {
      const invCat = state.settings.expenseCategories[0] || '';
      return state.expenses
        .filter(e => withinRange(e.date, from, to) && e.category !== invCat)
        .reduce((s, e) => s + num(e.amount), 0);
    });
  },

  totalWages(from='', to='') {
    return cached(`wages_${from}_${to}`, () =>
      state.workDays
        .filter(w => withinRange(w.date, from, to))
        .reduce((s, w) => s + num(w.amount), 0)
    );
  },

  netProfit(from='', to='') {
    return this.totalSales(from, to)
      - this.cogsRange(from, to)
      - this.operatingExpenses(from, to)
      - this.totalWages(from, to);
  },

  cashBalance() {
    return cached('cash', () => {
      let b = num(state.settings.openingCash);
      state.cashMovements.forEach(m => b += (m.direction === 'in' ? 1 : -1) * num(m.amount));
      return b;
    });
  },

  partnerDrawings(id) {
    return cached(`draw_${id}`, () =>
      state.drawings.filter(d => d.partnerId === id).reduce((s, d) => s + num(d.amount), 0)
    );
  },

  workerEarned(id) {
    return cached(`earn_${id}`, () =>
      state.workDays.filter(w => w.workerId === id).reduce((s, w) => s + num(w.amount), 0)
    );
  },

  workerPaid(id) {
    return cached(`paid_${id}`, () =>
      state.wagePayments.filter(p => p.workerId === id).reduce((s, p) => s + num(p.amount), 0)
    );
  },

  customerBalance(id) {
    return cached(`cust_${id}`, () => {
      const inv = state.invoices
        .filter(i => i.customerId === id && i.status !== 'cancelled')
        .reduce((s, i) => s + Math.max(0, num(i.total) - num(i.paid)), 0);
      const pay = state.payments
        .filter(p => p.customerId === id)
        .reduce((s, p) => s + num(p.amount), 0);
      return inv - pay;
    });
  },

  stockQty(productId) {
    return state.batches
      .filter(b => !productId || b.productId === productId)
      .reduce((s, b) => s + Math.max(0, num(b.availableQty) - num(b.soldQty)), 0);
  },

  stockValue(productId) {
    return state.batches
      .filter(b => !productId || b.productId === productId)
      .reduce((s, b) => s + Math.max(0, num(b.availableQty) - num(b.soldQty)) * num(b.unitCost), 0);
  },
};

function getMonthProgress() {
  const goal = num(state.settings.monthlyGoal);
  if (goal <= 0) return null;
  const now = new Date();
  const ms = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const me = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  const sales = state.invoices
    .filter(i => i.status !== 'cancelled' && i.date >= ms && i.date <= me)
    .reduce((s, i) => s + num(i.total), 0);
  return { goal, monthSales: sales, pct: Math.min(100, (sales / goal) * 100) };
}

function comparePeriods(from, to) {
  if (!from || !to) return null;
  const fromD = new Date(from), toD = new Date(to);
  const days = Math.round((toD - fromD) / 86400000) + 1;
  const prevTo = new Date(fromD); prevTo.setDate(prevTo.getDate() - 1);
  const prevFrom = new Date(prevTo); prevFrom.setDate(prevFrom.getDate() - days + 1);
  const prevFromStr = prevFrom.toISOString().slice(0, 10);
  const prevToStr = prevTo.toISOString().slice(0, 10);
  const curSales = Calc.totalSales(from, to);
  const prevSales = Calc.totalSales(prevFromStr, prevToStr);
  const curProfit = Calc.netProfit(from, to);
  const prevProfit = Calc.netProfit(prevFromStr, prevToStr);
  const growth = prevSales > 0 ? ((curSales - prevSales) / prevSales) * 100 : (curSales > 0 ? 100 : 0);
  return { curSales, prevSales, curProfit, prevProfit, growth };
}

function peekAlerts() {
  const alerts = [];
  const overdue = state.customers.filter(c => {
    const bal = Calc.customerBalance(c.id);
    if (bal <= 0) return false;
    const oldInv = state.invoices.filter(i => i.customerId === c.id && i.status !== 'cancelled' && num(i.total) - num(i.paid) > 0);
    if (!oldInv.length) return false;
    const oldest = oldInv.reduce((a, b) => (a.date < b.date ? a : b));
    return Math.floor((Date.now() - new Date(oldest.date).getTime()) / 86400000) > 30;
  });
  if (overdue.length) alerts.push({ type: 'danger', txt: t('alerts.debtsOverdue') + ': ' + overdue.length, page: 'customers' });
  const wagesDue = state.workers.reduce((s, w) => s + Math.max(0, Calc.workerEarned(w.id) - Calc.workerPaid(w.id)), 0);
  if (wagesDue > 0) alerts.push({ type: 'warn', txt: t('alerts.wagesDue') + ': ' + fmt(wagesDue), page: 'workers' });
  if (Calc.stockQty() < num(state.settings.lowStockThreshold))
    alerts.push({ type: 'info', txt: t('alerts.lowStock') + ': ' + fmtNum(Calc.stockQty()), page: 'inventory' });
  return alerts;
}

function renderAlertsBar() {
  const bar = document.getElementById('alertsBar');
  if (!bar) return;
  const alerts = peekAlerts();
  if (!alerts.length) { bar.classList.remove('has-alerts'); bar.innerHTML = ''; return; }
  bar.classList.add('has-alerts');
  bar.innerHTML = alerts.map((a, i) =>
    `<div class="alert-pill ${a.type}" style="animation-delay:${i*0.05}s" onclick="navigate('${a.page}')">
      <span class="dot"></span><span>${esc(a.txt)}</span>
    </div>`
  ).join('');
}