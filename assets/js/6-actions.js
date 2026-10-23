/* =====================================================================
   6-actions.js — عمليات الحفظ/التعديل/الحذف (Actions)
   يعتمد على: 1-config.js, 2-storage.js, 3-utils.js, 4-calc.js, 5-render.js
   ===================================================================== */

/* =====================================================
   BATCHES (الإنتاج والمخزون)
   ===================================================== */
function saveBatch() {
  const id = document.getElementById('b_id').value;
  const existing = id ? state.batches.find(b => b.id === id) : null;
  if (existing && num(existing.soldQty) > 0) {
    toast(t('msg.cannotEditSoldBatch'), 'error');
    return;
  }
  const productId = existing ? existing.productId : document.getElementById('b_product').value;
  const prod = getProduct(productId);
  const date = document.getElementById('b_date').value;
  const unitCount = num(document.getElementById('b_unitCount').value);
  const unitPrice = num(document.getElementById('b_unitPrice').value);
  const totalPurchase = unitCount * unitPrice;
  const supplier = document.getElementById('b_supplier').value.trim();
  const notes = document.getElementById('b_notes').value.trim();

  let rawWeight = 0, netWeight = 0, waste = 0, processingCost = 0;
  let availableQty = 0;

  if (prod.hasProcessing) {
    rawWeight = num(document.getElementById('b_rawWeight').value);
    netWeight = num(document.getElementById('b_netWeight').value);
    processingCost = num(document.getElementById('b_procCost').value);
    waste = Math.max(0, rawWeight - netWeight);
    availableQty = netWeight || rawWeight;
  } else {
    availableQty = unitCount;
  }

  if (!date || unitCount <= 0 || availableQty <= 0) {
    toast(t('toast.invalid'), 'error');
    return;
  }

  const data = {
    productId, date, unitCount, unitPrice, totalPurchase, supplier,
    rawWeight, netWeight, waste, availableQty, processingCost, notes, unitCost: 0
  };

  if (existing) {
    state.cashMovements = state.cashMovements.filter(m => m.refId !== existing.id);
    Object.assign(existing, data);
    existing.unitCost = Calc.batchUnitCost(existing);
    addCashMovement({
      date, type: 'inventory_purchase', category: prod.name,
      direction: 'out', amount: totalPurchase, method: 'cash',
      refId: existing.id, notes: supplier
    });
    if (processingCost > 0) {
      addCashMovement({
        date, type: 'processing', category: (LANG === 'ar' ? 'تجهيز ' : 'Processing ') + prod.name,
        direction: 'out', amount: processingCost, method: 'cash', refId: existing.id
      });
    }
    state.auditLog.push({ id: uid('log'), date: todayISO(), action: 'batch_edited', details: prod.name });
  } else {
    const batch = { id: uid('batch'), ...data, soldQty: 0 };
    batch.unitCost = Calc.batchUnitCost(batch);
    state.batches.push(batch);
    addCashMovement({
      date, type: 'inventory_purchase', category: prod.name,
      direction: 'out', amount: totalPurchase, method: 'cash',
      refId: batch.id, notes: supplier
    });
    if (processingCost > 0) {
      addCashMovement({
        date, type: 'processing', category: (LANG === 'ar' ? 'تجهيز ' : 'Processing ') + prod.name,
        direction: 'out', amount: processingCost, method: 'cash', refId: batch.id
      });
    }
    state.auditLog.push({ id: uid('log'), date, action: 'batch_created', details: prod.name });
  }

  saveState();
  closeModal();
  toast(t('toast.saved'));
  fireConfetti();
  renderInventory();
  updateCashPill();
}

function deleteBatch(id) {
  const b = state.batches.find(x => x.id === id);
  if (!b) return;
  if (num(b.soldQty) > 0) {
    toast(t('msg.cannotDeleteSoldBatch'), 'error');
    return;
  }
  confirmDialog(t('toast.confirmDelete'), `${b.date} — ${getProductName(b.productId)}`, () => {
    state.cashMovements = state.cashMovements.filter(m => m.refId !== id);
    state.batches = state.batches.filter(x => x.id !== id);
    state.auditLog.push({ id: uid('log'), date: todayISO(), action: 'batch_deleted', details: id });
    saveState();
    toast(t('toast.deleted'));
    renderInventory();
    updateCashPill();
  });
}

function saveAdjustBatch(id) {
  const b = state.batches.find(x => x.id === id);
  const av = num(document.getElementById('adj_avail').value);
  const reason = document.getElementById('adj_reason').value;
  if (av < num(b.soldQty)) {
    toast(t('toast.invalid'), 'error');
    return;
  }
  b.availableQty = av;
  b.unitCost = Calc.batchUnitCost(b);
  state.auditLog.push({ id: uid('log'), date: todayISO(), action: 'adjust', details: `${id}: ${reason}` });
  saveState();
  closeModal();
  toast(t('toast.saved'));
  renderInventory();
}

/* =====================================================
   INVOICES (المبيعات)
   ===================================================== */
function saveInvoice() {
  const date = document.getElementById('inv_date').value;
  const customerId = document.getElementById('inv_customer').value;
  const discount = num(document.getElementById('inv_discount').value);
  const paidIn = num(document.getElementById('inv_paid').value);
  const dueDate = (document.getElementById('inv_dueDate') || {}).value || '';
  const notes = document.getElementById('inv_notes').value;

  const lines = Array.from(document.querySelectorAll('#inv_lines .form-grid')).map(d => ({
    batchId: d.querySelector('.line-batch').value,
    qty: num(d.querySelector('.line-qty').value),
    price: num(d.querySelector('.line-price').value),
  })).filter(l => l.qty > 0);

  if (!lines.length) {
    toast(t('toast.invalid'), 'error');
    return;
  }

  for (const l of lines) {
    const b = state.batches.find(x => x.id === l.batchId);
    if (!b || l.qty > Math.max(0, num(b.availableQty) - num(b.soldQty))) {
      toast(t('toast.insufficientStock'), 'error');
      return;
    }
  }

  const total = lines.reduce((s, l) => s + l.qty * l.price, 0) - discount;
  if (total < 0) {
    toast(t('toast.invalid'), 'error');
    return;
  }

  const paid = Math.min(paidIn, total);
  const no = (state.invoices.length + 1).toString().padStart(4, '0');
  const inv = {
    id: uid('inv'), no, date, customerId, items: lines, discount, total, paid,
    remaining: total - paid,
    method: paid === 0 ? 'credit' : paid === total ? 'cash' : 'partial',
    notes, status: 'active', dueDate
  };

  state.invoices.push(inv);
  lines.forEach(l => {
    const b = state.batches.find(x => x.id === l.batchId);
    if (b) b.soldQty = num(b.soldQty) + l.qty;
  });

  if (paid > 0) {
    addCashMovement({
      date, type: 'sale', category: t('sales.invoice'),
      direction: 'in', amount: paid, method: 'cash', refId: inv.id
    });
  }

  state.auditLog.push({ id: uid('log'), date, action: 'invoice_created', details: '#' + no });
  saveState();
  closeModal();
  toast(t('toast.saved'));
  fireConfetti();
  renderSales();
  updateCashPill();
}

function saveEditInvoice() {
  const id = document.getElementById('inv_id').value;
  const inv = state.invoices.find(x => x.id === id);
  if (!inv) return;

  const discount = num(document.getElementById('inv_discount').value);
  const subtotal = inv.items.reduce((s, it) => s + it.qty * it.price, 0);
  const newTotal = subtotal - discount;
  if (newTotal < num(inv.paid)) {
    toast(t('toast.invalid'), 'error');
    return;
  }

  inv.date = document.getElementById('inv_date').value;
  inv.customerId = document.getElementById('inv_customer').value;
  inv.discount = discount;
  inv.total = newTotal;
  inv.remaining = newTotal - num(inv.paid);
  inv.dueDate = document.getElementById('inv_dueDate').value;
  inv.notes = document.getElementById('inv_notes').value;

  state.auditLog.push({ id: uid('log'), date: todayISO(), action: 'invoice_edited', details: '#' + inv.no });
  saveState();
  closeModal();
  toast(t('toast.saved'));
  renderSales();
  updateCashPill();
}

function cancelInvoice(id) {
  confirmDialog(t('toast.confirmDelete'), '', () => {
    const inv = state.invoices.find(x => x.id === id);
    if (!inv || inv.status === 'cancelled') return;

    inv.items.forEach(it => {
      const b = state.batches.find(x => x.id === it.batchId);
      if (b) b.soldQty = Math.max(0, num(b.soldQty) - num(it.qty));
    });

    state.cashMovements = state.cashMovements.filter(m => !(m.refId === inv.id && m.type === 'sale'));
    inv.status = 'cancelled';
    state.auditLog.push({ id: uid('log'), date: todayISO(), action: 'invoice_cancelled', details: '#' + inv.no });
    saveState();
    toast(t('toast.deleted'));
    renderSales();
    updateCashPill();
  });
}

function saveCollect(invoiceId) {
  const inv = state.invoices.find(x => x.id === invoiceId);
  const amount = num(document.getElementById('col_amount').value);
  const date = document.getElementById('col_date').value;
  const rem = num(inv.total) - num(inv.paid);
  if (amount <= 0 || amount > rem) {
    toast(t('toast.invalid'), 'error');
    return;
  }

  inv.paid = num(inv.paid) + amount;
  inv.remaining = num(inv.total) - inv.paid;
  state.payments.push({
    id: uid('pay'), date, customerId: inv.customerId,
    invoiceId: inv.id, amount, method: 'cash', notes: ''
  });
  addCashMovement({
    date, type: 'collection', category: (LANG === 'ar' ? 'تحصيل' : 'Collection'),
    direction: 'in', amount, method: 'cash', refId: inv.id
  });
  state.auditLog.push({ id: uid('log'), date, action: 'payment', details: fmt(amount) });
  saveState();
  closeModal();
  toast(t('toast.saved'));
  fireConfetti();
  renderSales();
  updateCashPill();
}

function printInvoice(invoiceId) {
  document.body.classList.toggle('thermal-print', state.settings.printMode === 'thermal');
  const inv = state.invoices.find(x => x.id === invoiceId);
  if (!inv) return;
  const c = state.customers.find(x => x.id === inv.customerId);
  const dueDate = inv.dueDate || '';

  const rowsHTML = inv.items.map(it => {
    const b = state.batches.find(x => x.id === it.batchId);
    const pname = b ? getProductName(b.productId) : '-';
    const unit = b ? getProduct(b.productId).unit : '';
    return `<tr>
      <td>${esc(pname)}</td>
      <td>${fmtNum(it.qty)} ${esc(unit)}</td>
      <td>${fmt(it.price)}</td>
      <td>${fmt(it.qty * it.price)}</td>
    </tr>`;
  }).join('');

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent('FAT-' + inv.no)}`;

  const area = document.getElementById('printArea');
  area.innerHTML = `
    <div class="invoice-paper">
      <div class="head">
        <div class="right">
          <h1>🌶️ FelFel Manager</h1>
          <div>${esc(state.settings.partner1)} / ${esc(state.settings.partner2)}</div>
          ${state.settings.sellerPhone ? `<div>${esc(state.settings.sellerPhone)}</div>` : ''}
        </div>
        <div class="left">
          <div><b>${t('print.invoiceNo')}:</b> ${inv.no}</div>
          <div><b>${t('common.date')}:</b> ${inv.date}</div>
          ${dueDate ? `<div><b>${t('print.dueDate')}:</b> ${dueDate}</div>` : ''}
        </div>
      </div>
      <div style="margin-bottom:12pt">
        <b>${t('sales.customer')}:</b> ${esc(c ? c.name : '-')}
        ${c && c.phone ? `<br><b>${t('customers.phone')}:</b> ${esc(c.phone)}` : ''}
        ${c && c.address ? `<br><b>${t('customers.address')}:</b> ${esc(c.address)}` : ''}
      </div>
      <table><thead><tr>
        <th>${t('common.product')}</th>
        <th>${t('common.qty')}</th>
        <th>${t('sales.unitPrice')}</th>
        <th>${t('common.amount')}</th>
      </tr></thead><tbody>${rowsHTML}</tbody></table>
      <div class="totals"><table>
        <tr><td>${t('common.amount')}</td><td>${fmt(inv.items.reduce((s, it) => s + it.qty * it.price, 0))}</td></tr>
        ${inv.discount > 0 ? `<tr><td>${t('sales.discount')}</td><td>-${fmt(inv.discount)}</td></tr>` : ''}
        <tr><td><b>${t('common.total')}</b></td><td><b>${fmt(inv.total)}</b></td></tr>
        <tr><td>${t('sales.paid')}</td><td>${fmt(inv.paid)}</td></tr>
        <tr><td>${t('sales.remaining')}</td><td>${fmt(inv.total - inv.paid)}</td></tr>
      </table></div>
      <div class="footer">
        <div>${t('print.thanks')}</div>
        <div class="qr-box"><img src="${qrUrl}" alt="QR" onerror="this.style.display='none'"></div>
      </div>
    </div>`;

  setTimeout(() => {
    window.print();
    setTimeout(() => document.body.classList.remove('thermal-print'), 500);
  }, 150);
}

function repeatInvoice(invoiceId) {
  const old = state.invoices.find(x => x.id === invoiceId);
  if (!old) return;

  const validItems = old.items.filter(it => {
    const b = state.batches.find(x => x.id === it.batchId);
    if (!b) return false;
    const avail = Math.max(0, num(b.availableQty) - num(b.soldQty));
    return avail >= it.qty;
  });

  if (!validItems.length) {
    toast(t('toast.insufficientStock'), 'error');
    return;
  }

  const no = (state.invoices.length + 1).toString().padStart(4, '0');
  const total = validItems.reduce((s, it) => s + it.qty * it.price, 0);
  const newInv = {
    id: uid('inv'), no, date: todayISO(), customerId: old.customerId,
    items: validItems.map(it => ({ batchId: it.batchId, qty: it.qty, price: it.price })),
    discount: 0, total, paid: 0, remaining: total, method: 'credit',
    notes: (LANG === 'ar' ? 'مكرر من #' : 'Repeat of #') + old.no,
    status: 'active', dueDate: ''
  };

  state.invoices.push(newInv);
  validItems.forEach(it => {
    const b = state.batches.find(x => x.id === it.batchId);
    if (b) b.soldQty = num(b.soldQty) + it.qty;
  });

  state.auditLog.push({ id: uid('log'), date: todayISO(), action: 'invoice_created', details: 'Repeat #' + no });
  saveState();
  toast(t('toast.saved'));
  fireConfetti();
  navigate('sales');
  updateCashPill();
}

/* =====================================================
   CUSTOMERS
   ===================================================== */
function saveCustomer() {
  const id = document.getElementById('c_id').value;
  const name = document.getElementById('c_name').value.trim();
  if (!name) {
    toast(t('toast.invalid'), 'error');
    return;
  }

  const data = {
    name,
    phone: document.getElementById('c_phone').value.trim(),
    address: document.getElementById('c_address').value.trim(),
    defaultPrice: num(document.getElementById('c_defaultPrice').value)
  };

  if (id) {
    const c = state.customers.find(x => x.id === id);
    Object.assign(c, data);
    state.auditLog.push({ id: uid('log'), date: todayISO(), action: 'customer_edited', details: name });
  } else {
    state.customers.push({ id: uid('cus'), ...data });
  }

  saveState();
  closeModal();
  toast(t('toast.saved'));
  renderCustomers();
}

function deleteCustomer(id) {
  const linked = state.invoices.filter(i => i.customerId === id && i.status !== 'cancelled');
  if (linked.length > 0) {
    toast(t('msg.customerHasInvoices'), 'error');
    return;
  }
  confirmDialog(t('toast.confirmDelete'), '', () => {
    state.customers = state.customers.filter(c => c.id !== id);
    state.auditLog.push({ id: uid('log'), date: todayISO(), action: 'customer_deleted', details: id });
    saveState();
    toast(t('toast.deleted'));
    renderCustomers();
  });
}

/* =====================================================
   EXPENSES
   ===================================================== */
function saveExpense() {
  const id = document.getElementById('e_id').value;
  const amount = num(document.getElementById('e_amount').value);
  if (amount <= 0) {
    toast(t('toast.invalid'), 'error');
    return;
  }

  const data = {
    date: document.getElementById('e_date').value,
    category: document.getElementById('e_cat').value,
    amount,
    desc: document.getElementById('e_desc').value.trim(),
    receiver: document.getElementById('e_receiver').value.trim(),
    method: 'cash'
  };

  if (id) {
    const e = state.expenses.find(x => x.id === id);
    state.cashMovements = state.cashMovements.filter(m => !(m.refId === id && m.type === 'expense'));
    Object.assign(e, data);
    addCashMovement({
      date: e.date, type: 'expense', category: e.category,
      direction: 'out', amount, method: 'cash', refId: id
    });
    state.auditLog.push({ id: uid('log'), date: todayISO(), action: 'expense_edited', details: e.category });
  } else {
    const e = { id: uid('exp'), ...data };
    state.expenses.push(e);
    addCashMovement({
      date: e.date, type: 'expense', category: e.category,
      direction: 'out', amount, method: 'cash', refId: e.id
    });
    state.auditLog.push({ id: uid('log'), date: e.date, action: 'expense_created', details: e.category });
  }

  saveState();
  closeModal();
  toast(t('toast.saved'));
  renderExpenses();
  updateCashPill();
}

function deleteExpense(id) {
  confirmDialog(t('toast.confirmDelete'), '', () => {
    state.cashMovements = state.cashMovements.filter(m => !(m.refId === id && m.type === 'expense'));
    state.expenses = state.expenses.filter(e => e.id !== id);
    state.auditLog.push({ id: uid('log'), date: todayISO(), action: 'expense_deleted', details: id });
    saveState();
    toast(t('toast.deleted'));
    renderExpenses();
    updateCashPill();
  });
}

/* =====================================================
   CASH MOVEMENTS
   ===================================================== */
function saveOpeningCash() {
  state.settings.openingCash = num(document.getElementById('oc_amount').value);
  state.settings.openingCashSet = true;
  saveState();
  closeModal();
  toast(t('toast.saved'));
  navigate(currentPage);
  updateCashPill();
}

function saveCashMovement() {
  const id = document.getElementById('cm_id').value;
  const amount = num(document.getElementById('cm_amount').value);
  if (amount <= 0) {
    toast(t('toast.invalid'), 'error');
    return;
  }
  const dir = document.getElementById('cm_dir').value;

  const data = {
    date: document.getElementById('cm_date').value,
    type: 'manual',
    category: document.getElementById('cm_cat').value || 'manual',
    direction: dir, amount, method: 'cash',
    reason: document.getElementById('cm_reason').value
  };

  if (id) {
    const existing = state.cashMovements.find(m => m.id === id);
    const others = state.cashMovements.filter(m => m.id !== id);
    const balWithout = num(state.settings.openingCash) + others.reduce((s, m) => s + (m.direction === 'in' ? 1 : -1) * num(m.amount), 0);
    if (dir === 'out' && amount > balWithout) {
      toast(t('toast.insufficientCash'), 'error');
      return;
    }
    Object.assign(existing, data);
    state.auditLog.push({ id: uid('log'), date: todayISO(), action: 'cash_edited', details: id });
  } else {
    if (dir === 'out' && amount > Calc.cashBalance()) {
      toast(t('toast.insufficientCash'), 'error');
      return;
    }
    addCashMovement(data);
  }

  saveState();
  closeModal();
  toast(t('toast.saved'));
  renderCashbox();
  updateCashPill();
}

function deleteCashMovement(id) {
  const m = state.cashMovements.find(x => x.id === id);
  if (!m) return;
  if (m.type !== 'manual') {
    toast(t('msg.cashAutoOnly'), 'error');
    return;
  }
  confirmDialog(t('toast.confirmDelete'), fmt(m.amount), () => {
    state.cashMovements = state.cashMovements.filter(x => x.id !== id);
    state.auditLog.push({ id: uid('log'), date: todayISO(), action: 'cash_deleted', details: id });
    saveState();
    toast(t('toast.deleted'));
    renderCashbox();
    updateCashPill();
  });
}

/* =====================================================
   WORKERS & WORK DAYS
   ===================================================== */
function saveWorker() {
  const id = document.getElementById('w_id').value;
  const name = document.getElementById('w_name').value.trim();
  if (!name) {
    toast(t('toast.invalid'), 'error');
    return;
  }
  const dailyWage = num(document.getElementById('w_dailyWage').value);

  if (id) {
    const w = state.workers.find(x => x.id === id);
    w.name = name;
    w.dailyWage = dailyWage;
    const activeEl = document.getElementById('w_active');
    if (activeEl) w.active = activeEl.value === '1';
    state.auditLog.push({ id: uid('log'), date: todayISO(), action: 'worker_edited', details: name });
  } else {
    state.workers.push({ id: uid('wrk'), name, dailyWage, active: true });
  }

  saveState();
  closeModal();
  toast(t('toast.saved'));
  renderWorkers();
}

function deleteWorker(id) {
  const has = state.workDays.some(w => w.workerId === id) || state.wagePayments.some(w => w.workerId === id);
  if (has) {
    toast(t('msg.workerHasWages'), 'error');
    return;
  }
  confirmDialog(t('toast.confirmDelete'), '', () => {
    state.workers = state.workers.filter(w => w.id !== id);
    state.auditLog.push({ id: uid('log'), date: todayISO(), action: 'worker_deleted', details: id });
    saveState();
    toast(t('toast.deleted'));
    renderWorkers();
  });
}

function saveWorkDay() {
  const id = document.getElementById('wd_id').value;
  const workerId = document.getElementById('wd_worker').value;
  const amount = num(document.getElementById('wd_amount').value);
  const date = document.getElementById('wd_date').value;
  const notes = document.getElementById('wd_notes').value.trim();

  if (amount <= 0 || !date) {
    toast(t('toast.invalid'), 'error');
    return;
  }

  if (id) {
    const wd = state.workDays.find(d => d.id === id);
    Object.assign(wd, { workerId, amount, date, notes });
    state.auditLog.push({ id: uid('log'), date: todayISO(), action: 'work_day_edited', details: id });
  } else {
    state.workDays.push({ id: uid('wd'), workerId, amount, date, notes });
    state.auditLog.push({ id: uid('log'), date, action: 'work_day', details: fmt(amount) });
  }

  saveState();
  closeModal();
  toast(t('toast.saved'));
  renderWorkers();
}

function deleteWorkDay(id) {
  confirmDialog(t('toast.confirmDelete'), '', () => {
    state.workDays = state.workDays.filter(w => w.id !== id);
    state.auditLog.push({ id: uid('log'), date: todayISO(), action: 'work_day_deleted', details: id });
    saveState();
    toast(t('toast.deleted'));
    renderWorkers();
  });
}

function savePayWorker(id) {
  const amount = num(document.getElementById('wp_amount').value);
  const date = document.getElementById('wp_date').value;
  const bal = Calc.workerEarned(id) - Calc.workerPaid(id);
  if (amount <= 0 || amount > bal) {
    toast(t('toast.invalid'), 'error');
    return;
  }
  if (amount > Calc.cashBalance()) {
    toast(t('toast.insufficientCash'), 'error');
    return;
  }

  state.wagePayments.push({ id: uid('wp'), workerId: id, amount, date, method: 'cash' });
  addCashMovement({
    date, type: 'wage_payment',
    category: (LANG === 'ar' ? 'أجور عمال' : 'Worker Wages'),
    direction: 'out', amount, method: 'cash', refId: id
  });
  state.auditLog.push({ id: uid('log'), date, action: 'worker_payment', details: fmt(amount) });

  saveState();
  closeModal();
  toast(t('toast.saved'));
  renderWorkers();
  updateCashPill();
}

/* =====================================================
   PARTNER DRAWINGS
   ===================================================== */
function saveWithdraw(partnerId) {
  const id = document.getElementById('dw_id').value;
  const existing = id ? state.drawings.find(d => d.id === id) : null;
  const amount = num(document.getElementById('dw_amount').value);
  const date = document.getElementById('dw_date').value;
  const balanceFor = Calc.cashBalance() + (existing ? num(existing.amount) : 0);

  if (amount <= 0 || amount > balanceFor) {
    toast(t('toast.insufficientCash'), 'error');
    return;
  }

  if (existing) {
    state.cashMovements = state.cashMovements.filter(m => !(m.refId === existing.id && m.type === 'partner_drawing'));
    Object.assign(existing, { amount, date });
    addCashMovement({
      date, type: 'partner_drawing', category: t('partners.drawings'),
      direction: 'out', amount, method: 'cash', refId: existing.id
    });
    state.auditLog.push({ id: uid('log'), date: todayISO(), action: 'drawing_edited', details: existing.id });
  } else {
    const drawing = { id: uid('drw'), partnerId, amount, date };
    state.drawings.push(drawing);
    addCashMovement({
      date, type: 'partner_drawing', category: t('partners.drawings'),
      direction: 'out', amount, method: 'cash', refId: drawing.id
    });
    state.auditLog.push({ id: uid('log'), date, action: 'withdrawal', details: fmt(amount) });
  }

  saveState();
  closeModal();
  toast(t('toast.saved'));
  renderPartners();
  updateCashPill();
}

function deleteDrawing(id) {
  const d = state.drawings.find(x => x.id === id);
  if (!d) return;
  confirmDialog(t('toast.confirmDelete'), fmt(d.amount), () => {
    state.cashMovements = state.cashMovements.filter(m => !(m.refId === id && m.type === 'partner_drawing'));
    state.drawings = state.drawings.filter(x => x.id !== id);
    state.auditLog.push({ id: uid('log'), date: todayISO(), action: 'drawing_deleted', details: id });
    saveState();
    toast(t('toast.deleted'));
    renderPartners();
    updateCashPill();
  });
}

/* =====================================================
   SETTINGS & PRODUCTS
   ===================================================== */
function saveSettings() {
  const s = state.settings;
  s.workerDailyWage = num(document.getElementById('s_workerWage').value);
  s.opCost = num(document.getElementById('s_opCost').value);
  s.partner1 = document.getElementById('s_p1').value.trim();
  s.partner2 = document.getElementById('s_p2').value.trim();
  s.share1 = num(document.getElementById('s_sh1').value);
  s.share2 = num(document.getElementById('s_sh2').value);
  s.monthlyGoal = num(document.getElementById('s_monthlyGoal').value);
  s.lowStockThreshold = num(document.getElementById('s_lowStock').value);
  s.sellerPhone = document.getElementById('s_sellerPhone').value.trim();
  s.expenseCategories = document.getElementById('s_cats').value.split(',').map(x => x.trim()).filter(Boolean);

  state.auditLog.push({ id: uid('log'), date: todayISO(), action: 'settings', details: '' });
  saveState();
  toast(t('settings.saved'));
  updateCashPill();
}

function saveProduct() {
  const id = document.getElementById('pr_id').value;
  const name = document.getElementById('pr_name').value.trim();
  if (!name) {
    toast(t('toast.invalid'), 'error');
    return;
  }

  const data = {
    name,
    unit: document.getElementById('pr_unit').value.trim() || 'كجم',
    unitLabel: document.getElementById('pr_unitLabel').value.trim() || 'وحدة',
    hasProcessing: document.getElementById('pr_hasProcessing').value === '1',
    defaultBuyPrice: num(document.getElementById('pr_buy').value),
    defaultSellPrice: num(document.getElementById('pr_sell').value),
    defaultWeight: num(document.getElementById('pr_weight').value) || 10
  };

  if (id) {
    Object.assign(state.settings.products.find(p => p.id === id), data);
  } else {
    state.settings.products.push({ id: uid('prod'), ...data });
  }

  saveState();
  closeModal();
  toast(t('toast.saved'));
  renderSettings();
}

function deleteProduct(id) {
  if (state.batches.some(b => b.productId === id)) {
    toast(t('msg.productHasBatches'), 'error');
    return;
  }
  if (state.settings.products.length <= 1) {
    toast(LANG === 'ar' ? 'لازم منتج واحد على الأقل' : 'At least 1 product required', 'error');
    return;
  }
  confirmDialog(t('toast.confirmDelete'), '', () => {
    state.settings.products = state.settings.products.filter(p => p.id !== id);
    saveState();
    toast(t('toast.deleted'));
    renderSettings();
  });
}

/* =====================================================
   EXPORT / IMPORT / BACKUP
   ===================================================== */
function downloadFile(name, content, type) {
  const blob = new Blob([content], { type: type || 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function exportTableCSV(id) {
  const tbl = document.getElementById(id);
  if (!tbl) return;
  const rows = Array.from(tbl.querySelectorAll('tr')).map(tr =>
    Array.from(tr.querySelectorAll('th,td')).map(td => `"${td.textContent.trim().replace(/"/g, '""')}"`).join(','));
  downloadFile(id + '.csv', '\ufeff' + rows.join('\n'), 'text/csv');
}

function exportTableExcel(id) {
  const tbl = document.getElementById(id);
  if (!tbl) return;
  let html = '<html><head><meta charset="UTF-8"></head><body><table border="1">';
  tbl.querySelectorAll('tr').forEach(tr => {
    html += '<tr>';
    tr.querySelectorAll('th,td').forEach(td => {
      const tag = td.tagName.toLowerCase();
      html += `<${tag}>${td.textContent.trim()}</${tag}>`;
    });
    html += '</tr>';
  });
  html += '</table></body></html>';
  downloadFile(id + '.xls', html, 'application/vnd.ms-excel');
}

function exportFullJSON() {
  const data = { ...state, exportedAt: new Date().toISOString(), schema: SCHEMA_VERSION };
  downloadFile('felfel-backup-' + todayISO() + '.json', JSON.stringify(data, null, 2), 'application/json');
  toast(t('toast.saved'));
  if (window.Extras && typeof window.Extras.recordBackup === 'function') {
    window.Extras.recordBackup();
  }
}

function importJSON(ev) {
  const file = ev.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data || typeof data !== 'object') throw new Error('bad');
      if (data.schema !== SCHEMA_VERSION) {
        toast(LANG === 'ar' ? 'إصدار غير متوافق' : 'Version mismatch', 'error');
        return;
      }
      confirmDialog(t('settings.importBackup'), t('confirm.import'), () => {
        const backup = JSON.stringify(state);
        try {
          state = { ...defaultState(), ...data };
          delete state.exportedAt;
          delete state.schema;
          saveState(true);
          toast(t('toast.saved'));
          navigate(currentPage);
        } catch(e) {
          localStorage.setItem('ff_pre_import_backup', backup);
          toast(t('toast.error'), 'error');
        }
      });
    } catch(e) {
      toast(t('toast.error') + ': ' + e.message, 'error');
    }
  };
  reader.readAsText(file);
  ev.target.value = '';
}

function resetSystem() {
  confirmDialog(t('settings.reset'), t('settings.resetWarn'), () => {
    localStorage.removeItem(STORAGE_KEY);
    state = defaultState();
    saveState(true);
    toast(t('toast.deleted'));
    navigate('dashboard');
  });
}

/* =====================================================
   PIN
   ===================================================== */
function checkPin() {
  if (!state.settings.pin) {
    document.getElementById('pinLock').classList.add('hidden');
    return;
  }
  document.getElementById('pinLock').classList.remove('hidden');
  const input = document.getElementById('pinInput');
  input.value = '';
  setTimeout(() => input.focus(), 100);
  input.oninput = (e) => {
    if (e.target.value === state.settings.pin) {
      document.getElementById('pinLock').classList.add('hidden');
      document.getElementById('pinError').textContent = '';
    } else if (e.target.value.length >= state.settings.pin.length) {
      document.getElementById('pinError').textContent = t('pin.wrong');
    }
  };
}

function setPin() {
  const current = state.settings.pin;
  const body = current
    ? `<div class="form-group"><label>${t('pin.set')}</label><input type="password" id="pin_new" inputmode="numeric" maxlength="6"></div>
       <button class="btn btn-danger mt-16" onclick="removePin()">${t('settings.pinRemove')}</button>`
    : `<div class="form-group"><label>${t('pin.set')}</label><input type="password" id="pin_new" inputmode="numeric" maxlength="6"></div>`;
  openModal(t('settings.pin'), body + `
    <div class="mt-16"><button class="btn btn-primary" onclick="savePin()">${t('common.save')}</button></div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">${t('common.cancel')}</button>`);
}

function savePin() {
  const v = document.getElementById('pin_new').value.trim();
  if (!v || v.length < 4) {
    toast(t('toast.invalid'), 'error');
    return;
  }
  state.settings.pin = v;
  saveState();
  closeModal();
  toast(t('toast.saved'));
  renderSettings();
}

function removePin() {
  state.settings.pin = '';
  saveState();
  closeModal();
  toast(t('toast.saved'));
  renderSettings();
}

/* =====================================================
   WHATSAPP SHARE
   ===================================================== */
function shareWhatsApp(invoiceId) {
  const inv = state.invoices.find(x => x.id === invoiceId);
  if (!inv) return;
  const c = state.customers.find(x => x.id === inv.customerId);

  const items = inv.items.map(it => {
    const b = state.batches.find(x => x.id === it.batchId);
    const pname = b ? getProductName(b.productId) : '-';
    const unit = b ? getProduct(b.productId).unit : '';
    return `• ${pname} — ${fmtNum(it.qty)} ${unit} × ${fmt(it.price)} = ${fmt(it.qty * it.price)}`;
  }).join('\n');

  const msg =
    `🌶️ *${LANG === 'ar' ? 'فاتورة' : 'Invoice'} #${inv.no}*\n` +
    `${LANG === 'ar' ? 'التاريخ' : 'Date'}: ${inv.date}\n` +
    (c ? `${LANG === 'ar' ? 'العميل' : 'Customer'}: ${c.name}\n` : '') +
    `\n${items}\n\n` +
    `${LANG === 'ar' ? 'الإجمالي' : 'Total'}: *${fmt(inv.total)}*\n` +
    `${LANG === 'ar' ? 'المدفوع' : 'Paid'}: ${fmt(inv.paid)}\n` +
    `${LANG === 'ar' ? 'المتبقي' : 'Remaining'}: *${fmt(inv.total - inv.paid)}*\n\n` +
    `${t('print.thanks')}`;

  const phone = c && c.phone ? c.phone.replace(/\D/g, '') : '';
  const url = phone
    ? `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`
    : `https://wa.me/?text=${encodeURIComponent(msg)}`;
  window.open(url, '_blank');
}

/* =====================================================
   PRINT STATEMENT (كشف الحساب)
   ===================================================== */
function printStatement(customerId) {
  const c = state.customers.find(x => x.id === customerId);
  if (!c) return;

  const rows = [];
  state.invoices.filter(i => i.customerId === customerId && i.status !== 'cancelled').forEach(i => {
    rows.push({ date: i.date, desc: `${t('sales.invoice')} #${i.no}`, debit: num(i.total), credit: num(i.paid) });
  });
  state.payments.filter(p => p.customerId === customerId).forEach(p => {
    rows.push({ date: p.date, desc: t('customers.collect'), debit: 0, credit: num(p.amount) });
  });
  rows.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  let bal = 0;
  const tableRows = rows.map(r => {
    bal += r.debit - r.credit;
    return `<tr>
      <td>${esc(r.date)}</td>
      <td>${esc(r.desc)}</td>
      <td>${r.debit ? fmt(r.debit) : '-'}</td>
      <td>${r.credit ? fmt(r.credit) : '-'}</td>
      <td>${fmt(bal)}</td>
    </tr>`;
  }).join('');

  document.getElementById('printArea').innerHTML = `
    <div class="invoice-paper">
      <div class="head">
        <div class="right">
          <h1>🌶️ FelFel Manager</h1>
          <div>${esc(state.settings.partner1)} / ${esc(state.settings.partner2)}</div>
          ${state.settings.sellerPhone ? `<div>${esc(state.settings.sellerPhone)}</div>` : ''}
        </div>
        <div class="left">
          <div><b>${t('invoice.printStatement')}</b></div>
          <div>${new Date().toLocaleDateString(LANG === 'ar' ? 'ar-EG' : 'en-US')}</div>
        </div>
      </div>
      <div style="margin-bottom:12pt">
        <b>${t('customers.name')}:</b> ${esc(c.name)}
        ${c.phone ? `<br><b>${t('customers.phone')}:</b> ${esc(c.phone)}` : ''}
        ${c.address ? `<br><b>${t('customers.address')}:</b> ${esc(c.address)}` : ''}
      </div>
      <table>
        <thead><tr>
          <th>${t('common.date')}</th>
          <th>${t('common.notes')}</th>
          <th>مدين</th>
          <th>دائن</th>
          <th>${t('customers.balance')}</th>
        </tr></thead>
        <tbody>${tableRows || `<tr><td colspan="5" style="text-align:center">${t('common.empty')}</td></tr>`}</tbody>
      </table>
      <div class="totals">
        <table>
          <tr>
            <td><b>${t('customers.balance')}</b></td>
            <td><b>${fmt(bal)}</b></td>
          </tr>
        </table>
      </div>
      <div class="footer">
        <div>${t('print.thanks')}</div>
      </div>
    </div>`;

  setTimeout(() => window.print(), 150);
}

/* =====================================================
   DAILY SUMMARY (ملخص اليوم)
   ===================================================== */
function showDailySummary() {
  const today = todayISO();
  const todayInvoices = state.invoices.filter(i => i.date === today && i.status !== 'cancelled');
  const todaySales = todayInvoices.reduce((s, i) => s + num(i.total), 0);
  const todayCollected = todayInvoices.reduce((s, i) => s + num(i.paid), 0) +
    state.payments.filter(p => p.date === today).reduce((s, p) => s + num(p.amount), 0);
  const todayNewDebts = todayInvoices.reduce((s, i) => s + Math.max(0, num(i.total) - num(i.paid)), 0);
  const todayExpenses = state.expenses.filter(e => e.date === today).reduce((s, e) => s + num(e.amount), 0);
  const todayWages = state.workDays.filter(w => w.date === today).reduce((s, w) => s + num(w.amount), 0);
  const todayBatches = state.batches.filter(b => b.date === today);
  const todayPepperSold = todayInvoices.reduce((s, i) =>
    s + i.items.filter(it => {
      const b = state.batches.find(x => x.id === it.batchId);
      return b && b.productId === 'prod_pepper';
    }).reduce((sum, it) => sum + num(it.qty), 0), 0);
  const todayPicklesSold = todayInvoices.reduce((s, i) =>
    s + i.items.filter(it => {
      const b = state.batches.find(x => x.id === it.batchId);
      return b && b.productId !== 'prod_pepper';
    }).reduce((sum, it) => sum + num(it.qty), 0), 0);
  const endCash = Calc.cashBalance();
  const pepperUnit = getProduct('prod_pepper').unit;

  openModal(`📊 ${t('dashboard.dailySummaryTitle')} — ${today}`, `
    <div class="summary-grid">
      <div class="summary-item">
        <div class="summary-label">${t('dashboard.todaySales')}</div>
        <div class="summary-value pos">${fmt(todaySales)}</div>
      </div>
      <div class="summary-item">
        <div class="summary-label">${t('dashboard.collected')}</div>
        <div class="summary-value pos">${fmt(todayCollected)}</div>
      </div>
      <div class="summary-item">
        <div class="summary-label">${t('summary.newDebts')}</div>
        <div class="summary-value warn">${fmt(todayNewDebts)}</div>
      </div>
      <div class="summary-item">
        <div class="summary-label">${t('dashboard.expenses')}</div>
        <div class="summary-value neg">${fmt(todayExpenses)}</div>
      </div>
      <div class="summary-item">
        <div class="summary-label">${t('dashboard.wages')}</div>
        <div class="summary-value neg">${fmt(todayWages)}</div>
      </div>
      <div class="summary-item">
        <div class="summary-label">${t('summary.invoiceCount')}</div>
        <div class="summary-value">${todayInvoices.length}</div>
      </div>
      <div class="summary-item">
        <div class="summary-label">${t('summary.bagsCount')}</div>
        <div class="summary-value">${todayBatches.length}</div>
      </div>
      <div class="summary-item">
        <div class="summary-label">${t('summary.pepperSold')}</div>
        <div class="summary-value">${fmtNum(todayPepperSold)} ${esc(pepperUnit)}</div>
      </div>
      <div class="summary-item">
        <div class="summary-label">${t('summary.picklesSold')}</div>
        <div class="summary-value">${fmtNum(todayPicklesSold)}</div>
      </div>
      <div class="summary-item full">
        <div class="summary-label">${t('summary.endCash')}</div>
        <div class="summary-value pos big">${fmt(endCash)}</div>
      </div>
    </div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">${t('common.close')}</button>
     <button class="btn btn-primary" onclick="printDailySummary()">🖨 ${t('invoice.print')}</button>`);
}

function printDailySummary() {
  const today = todayISO();
  const todayInvoices = state.invoices.filter(i => i.date === today && i.status !== 'cancelled');
  const todaySales = todayInvoices.reduce((s, i) => s + num(i.total), 0);
  const todayCollected = todayInvoices.reduce((s, i) => s + num(i.paid), 0) +
    state.payments.filter(p => p.date === today).reduce((s, p) => s + num(p.amount), 0);
  const todayNewDebts = todayInvoices.reduce((s, i) => s + Math.max(0, num(i.total) - num(i.paid)), 0);
  const todayExpenses = state.expenses.filter(e => e.date === today).reduce((s, e) => s + num(e.amount), 0);
  const todayWages = state.workDays.filter(w => w.date === today).reduce((s, w) => s + num(w.amount), 0);
  const todayBatches = state.batches.filter(b => b.date === today);
  const endCash = Calc.cashBalance();

  document.getElementById('printArea').innerHTML = `
    <div class="invoice-paper">
      <div class="head">
        <div class="right">
          <h1>🌶️ FelFel Manager</h1>
          <div>${esc(state.settings.partner1)} / ${esc(state.settings.partner2)}</div>
        </div>
        <div class="left">
          <div><b>${t('dashboard.dailySummaryTitle')}</b></div>
          <div>${today}</div>
        </div>
      </div>
      <table>
        <tbody>
          <tr><td>${t('dashboard.todaySales')}</td><td>${fmt(todaySales)}</td></tr>
          <tr><td>${t('dashboard.collected')}</td><td>${fmt(todayCollected)}</td></tr>
          <tr><td>${t('summary.newDebts')}</td><td>${fmt(todayNewDebts)}</td></tr>
          <tr><td>${t('dashboard.expenses')}</td><td>${fmt(todayExpenses)}</td></tr>
          <tr><td>${t('dashboard.wages')}</td><td>${fmt(todayWages)}</td></tr>
          <tr><td>${t('summary.invoiceCount')}</td><td>${todayInvoices.length}</td></tr>
          <tr><td>${t('summary.bagsCount')}</td><td>${todayBatches.length}</td></tr>
          <tr><td><b>${t('summary.endCash')}</b></td><td><b>${fmt(endCash)}</b></td></tr>
        </tbody>
      </table>
      <div class="footer">
        <div>${t('print.thanks')}</div>
      </div>
    </div>`;

  setTimeout(() => window.print(), 150);
}