/* =====================================================================
   5-render.js — كل دوال العرض (Render) والنوافذ (Modals)
   يعتمد على: 1-config.js, 2-storage.js, 3-utils.js, 4-calc.js
   ===================================================================== */

/* =====================================================
   DASHBOARD
   ===================================================== */
function renderDashboard() {
  const today = todayISO();
  const todaySales = state.invoices.filter(i => i.status !== 'cancelled' && i.date === today).reduce((s, i) => s + num(i.total), 0);
  const periodSales = Calc.totalSales();
  const collected = Calc.collectedCash();
  const receivables = Calc.receivables();
  const cogs = Calc.cogs();
  const wages = Calc.totalWages();
  const op = Calc.operatingExpenses();
  const profit = Calc.netProfit();
  const opening = num(state.settings.openingCash);
  const current = Calc.cashBalance();
  const stockQty = Calc.stockQty();
  const stockVal = Calc.stockValue();
  const unpaidWages = state.workers.reduce((s, w) => s + Math.max(0, Calc.workerEarned(w.id) - Calc.workerPaid(w.id)), 0);
  const p1 = profit * num(state.settings.share1) / 100;
  const p2 = profit * num(state.settings.share2) / 100;
  const hasData = state.invoices.length || state.batches.length || state.expenses.length || state.workDays.length;

  if (!hasData) {
    document.getElementById('content').innerHTML = `
      <div class="panel empty">
        <h4>${t('dashboard.noData')}</h4>
        <p>${t('dashboard.noDataDesc')}</p>
        <div class="row" style="justify-content:center">
          <button class="btn btn-primary" onclick="openOpeningCashModal()">${t('cashbox.setOpening')}</button>
          <button class="btn btn-secondary" onclick="navigate('inventory')">${t('inventory.addBatch')}</button>
        </div>
      </div>`;
    return;
  }

  const cards = [
    ['dashboard.todaySales', fmt(todaySales), ''],
    ['dashboard.periodSales', fmt(periodSales), ''],
    ['dashboard.collected', fmt(collected), 'pos'],
    ['dashboard.receivables', fmt(receivables), receivables > 0 ? 'warn' : ''],
    ['dashboard.cogs', fmt(cogs), ''],
    ['dashboard.wages', fmt(wages), ''],
    ['dashboard.expenses', fmt(op), ''],
    ['dashboard.netProfit', fmt(profit), profit >= 0 ? 'pos' : 'neg'],
    ['dashboard.openingCash', fmt(opening), ''],
    ['dashboard.currentCash', fmt(current), 'pos'],
    ['dashboard.stockValue', fmt(stockVal), ''],
    ['dashboard.unpaidWages', fmt(unpaidWages), unpaidWages > 0 ? 'warn' : ''],
  ];

  const salesByProd = {};
  state.invoices.filter(i => i.status !== 'cancelled').forEach(inv => {
    inv.items.forEach(it => {
      const b = state.batches.find(x => x.id === it.batchId);
      if (b) {
        const pname = getProductName(b.productId);
        salesByProd[pname] = (salesByProd[pname] || 0) + it.qty * it.price;
      }
    });
  });

  const recent = [
    ...state.invoices.map(i => ({ d: i.date, txt: `${t('sales.invoice')} #${i.no}`, amt: i.total, dir: 'in' })),
    ...state.expenses.map(e => ({ d: e.date, txt: e.category, amt: e.amount, dir: 'out' })),
    ...state.cashMovements.map(m => ({ d: m.date, txt: m.category, amt: m.amount, dir: m.direction })),
  ].sort((a, b) => (b.d || '').localeCompare(a.d || '')).slice(0, 8);

  const goalHTML = (() => {
    const gp = getMonthProgress();
    if (!gp) return '';
    return `<div class="panel">
      <div class="panel-head"><h3>${t('goal.progress')}</h3></div>
      <div class="goal-bar"><div class="goal-fill" style="width:${gp.pct}%"></div></div>
      <div class="goal-info">
        <span>${fmt(gp.monthSales)} ${t('goal.of')} ${fmt(gp.goal)}</span>
        <span>${fmtNum(gp.pct)}%</span>
      </div>
    </div>`;
  })();

  document.getElementById('content').innerHTML = `
    <div class="panel" style="display:flex;justify-content:space-between;align-items:center;padding:14px 20px">
      <h3 style="font-size:15px;margin:0">${t('dashboard.dailySummary')}</h3>
      <button class="btn btn-primary" onclick="showDailySummary()">📊 ${t('dashboard.dailySummary')}</button>
    </div>
    <div class="stats-grid">
      ${cards.map(c => `<div class="stat-card"><div class="label">${t(c[0])}</div><div class="value ${c[2]}">${c[1]}</div></div>`).join('')}
    </div>
    <div class="panel">
      <div class="panel-head"><h3>${t('dashboard.partnerShare')}</h3></div>
      <div class="stats-grid">
        <div class="stat-card"><div class="label">${esc(state.settings.partner1)} (${state.settings.share1}%)</div><div class="value pos">${fmt(p1)}</div></div>
        <div class="stat-card"><div class="label">${esc(state.settings.partner2)} (${state.settings.share2}%)</div><div class="value pos">${fmt(p2)}</div></div>
        <div class="stat-card"><div class="label">${t('dashboard.drawings')}</div><div class="value">${fmt(Calc.partnerDrawings('p1') + Calc.partnerDrawings('p2'))}</div></div>
      </div>
    </div>
    ${goalHTML}
    <div class="panel">
      <div class="panel-head"><h3>${t('dashboard.salesByProduct')}</h3></div>
      ${Object.keys(salesByProd).length === 0 ? `<p class="text-muted">${t('common.empty')}</p>` : `
        <table><thead><tr><th>${t('common.product')}</th><th>${t('common.total')}</th></tr></thead><tbody>
          ${Object.entries(salesByProd).map(([k,v]) => `<tr><td>${esc(k)}</td><td class="text-success">${fmt(v)}</td></tr>`).join('')}
        </tbody></table>
      `}
    </div>
    <div class="panel">
      <div class="panel-head"><h3>${t('charts.salesTrend')}</h3></div>
      <div class="chart-box"><canvas id="chartSales"></canvas></div>
    </div>
    <div class="panel">
      <div class="panel-head"><h3>${t('dashboard.recent')}</h3></div>
      ${recent.length === 0 ? `<p class="text-muted">${t('common.empty')}</p>` :
        `<div class="table-wrap"><table><thead><tr><th>${t('common.date')}</th><th>${t('common.notes')}</th><th>${t('common.amount')}</th></tr></thead><tbody>
        ${recent.map(r => `<tr><td>${esc(r.d)}</td><td>${esc(r.txt)}</td><td class="${r.dir === 'in' ? 'text-success' : 'text-danger'}">${r.dir === 'in' ? '+' : '-'}${fmt(r.amt)}</td></tr>`).join('')}
        </tbody></table></div>`}
    </div>`;

  requestAnimationFrame(() => renderDashboardCharts());
}

/* =====================================================
   INVENTORY
   ===================================================== */
function renderInventory() {
  document.getElementById('content').innerHTML = `
    <div class="panel">
      <div class="panel-head">
        <h3>${t('inventory.title')}</h3>
        <button class="btn btn-primary" onclick="openBatchModal()">+ ${t('inventory.addBatch')}</button>
      </div>
      ${state.batches.length === 0 ? `<div class="empty"><h4>${t('inventory.noBatches')}</h4></div>` :
      `<div class="table-wrap"><table><thead><tr>
        <th>${t('common.date')}</th><th>${t('inventory.product')}</th><th>${t('inventory.unitsPurchased')}</th>
        <th>${t('inventory.unitPrice')}</th><th>${t('inventory.available')}</th><th>${t('inventory.sold')}</th>
        <th>${t('inventory.remaining')}</th><th>${t('inventory.unitCost')}</th><th>${t('common.actions')}</th>
      </tr></thead><tbody>
        ${state.batches.slice().reverse().map(b => {
          const prod = getProduct(b.productId);
          const rem = Math.max(0, num(b.availableQty) - num(b.soldQty));
          const hasSold = num(b.soldQty) > 0;
          return `<tr>
            <td>${esc(b.date)}</td><td><b>${esc(prod.name)}</b></td>
            <td>${fmtNum(b.unitCount)} ${esc(prod.unitLabel)}</td>
            <td>${fmt(b.unitPrice)}</td>
            <td>${fmtNum(b.availableQty)} ${esc(prod.unit)}</td>
            <td>${fmtNum(b.soldQty)} ${esc(prod.unit)}</td>
            <td><b>${fmtNum(rem)} ${esc(prod.unit)}</b></td>
            <td>${fmt(b.unitCost)}</td>
            <td>
              ${!hasSold ? `<button class="btn btn-sm btn-secondary" onclick="openBatchModal('${b.id}')" title="${t('common.edit')}">✏️</button> ` : ''}
              <button class="btn btn-sm btn-secondary" onclick="openAdjustBatch('${b.id}')" title="${t('inventory.adjust')}">⚖</button>
              ${!hasSold ? `<button class="btn btn-sm btn-danger" onclick="deleteBatch('${b.id}')" title="${t('common.delete')}">🗑️</button>` : ''}
            </td>
          </tr>`;
        }).join('')}
      </tbody></table></div>`}
    </div>`;
}

function openBatchModal(id) {
  const existing = id ? state.batches.find(b => b.id === id) : null;
  const products = state.settings.products;
  const selProdId = existing ? existing.productId : products[0].id;
  const prod = getProduct(selProdId);
  openModal((existing ? t('common.edit') : t('inventory.addBatch')),
    `<input type="hidden" id="b_id" value="${existing ? existing.id : ''}">
    <div class="form-grid">
      <div class="form-group"><label>${t('inventory.product')}</label>
        <select id="b_product" ${existing ? 'disabled' : ''} onchange="updateBatchFields()">
          ${products.map(p => `<option value="${p.id}" ${p.id === selProdId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label>${t('common.date')}</label><input type="date" id="b_date" value="${existing ? existing.date : todayISO()}"></div>
      <div class="form-group" id="b_unitCountGroup">
        <label id="b_unitCountLabel">${t('inventory.unitsPurchased')} (${esc(prod.unitLabel)})</label>
        <input type="number" id="b_unitCount" value="${existing ? existing.unitCount : 1}" min="0.01" step="0.01">
      </div>
      <div class="form-group" id="b_unitPriceGroup">
        <label id="b_unitPriceLabel">${t('inventory.unitPrice')} (${t('currency')}/${esc(prod.unitLabel)})</label>
        <input type="number" id="b_unitPrice" value="${existing ? existing.unitPrice : prod.defaultBuyPrice}">
      </div>
      <div class="form-group"><label>${t('inventory.supplier')}</label><input id="b_supplier" value="${existing ? esc(existing.supplier || '') : ''}" placeholder="${LANG === 'ar' ? 'اختياري' : 'Optional'}"></div>
      <div id="b_processingFields" style="display: ${prod.hasProcessing ? 'contents' : 'none'}">
        <div class="form-group"><label>${t('inventory.rawWeight')} (كجم)</label><input type="number" id="b_rawWeight" value="${existing ? existing.rawWeight : 0}" step="0.01"></div>
        <div class="form-group"><label>${t('inventory.netWeight')} (كجم)</label><input type="number" id="b_netWeight" value="${existing ? existing.netWeight : 0}" step="0.01"></div>
        <div class="form-group"><label>${t('inventory.processingCost')}</label><input type="number" id="b_procCost" value="${existing ? existing.processingCost : 0}"></div>
      </div>
      <div class="form-group full"><label>${t('common.notes')}</label><textarea id="b_notes">${existing ? esc(existing.notes || '') : ''}</textarea></div>
    </div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">${t('common.cancel')}</button>
     <button class="btn btn-primary" onclick="saveBatch()">${t('common.save')}</button>`);
}

function updateBatchFields() {
  const pid = document.getElementById('b_product').value;
  const prod = getProduct(pid);
  document.getElementById('b_processingFields').style.display = prod.hasProcessing ? 'contents' : 'none';
  document.getElementById('b_unitCountLabel').textContent = t('inventory.unitsPurchased') + ' (' + prod.unitLabel + ')';
  document.getElementById('b_unitPriceLabel').textContent = t('inventory.unitPrice') + ' (' + t('currency') + '/' + prod.unitLabel + ')';
  document.getElementById('b_unitPrice').value = prod.defaultBuyPrice;
}

function openAdjustBatch(id) {
  const b = state.batches.find(x => x.id === id);
  if (!b) return;
  const prod = getProduct(b.productId);
  openModal(t('inventory.adjust'), `
    <div class="form-grid">
      <div class="form-group"><label>${t('inventory.available')} (${esc(prod.unit)})</label><input type="number" id="adj_avail" value="${b.availableQty}" step="0.01"></div>
      <div class="form-group full"><label>${t('cashbox.reason')}</label><input id="adj_reason" placeholder="${LANG === 'ar' ? 'تالف / فرق جرد' : 'Waste / Stock diff'}"></div>
    </div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">${t('common.cancel')}</button>
     <button class="btn btn-primary" onclick="saveAdjustBatch('${id}')">${t('common.save')}</button>`);
}

/* =====================================================
   SALES
   ===================================================== */
function renderSales() {
  document.getElementById('content').innerHTML = `
    <div class="panel">
      <div class="panel-head">
        <h3>${t('sales.title')}</h3>
        <button class="btn btn-primary" onclick="openInvoiceModal()">+ ${t('sales.newInvoice')}</button>
      </div>
      ${state.invoices.length === 0 ? `<div class="empty"><h4>${t('sales.noInvoices')}</h4></div>` :
      `<div class="table-wrap"><table><thead><tr>
        <th>#</th><th>${t('common.date')}</th><th>${t('sales.customer')}</th>
        <th>${t('common.amount')}</th><th>${t('sales.paid')}</th><th>${t('sales.remaining')}</th>
        <th>${t('common.status')}</th><th>${t('common.actions')}</th>
      </tr></thead><tbody>
        ${state.invoices.slice().reverse().map(inv => {
          const c = state.customers.find(x => x.id === inv.customerId);
          const rem = Math.max(0, num(inv.total) - num(inv.paid));
          const st = inv.status === 'cancelled' ? `<span class="badge badge-danger">✕</span>` :
            rem === 0 ? `<span class="badge badge-success">✓</span>` : `<span class="badge badge-warn">${fmt(rem)}</span>`;
          return `<tr>
            <td>${inv.no}</td><td>${esc(inv.date)}</td><td>${esc(c ? c.name : '-')}</td>
            <td>${fmt(inv.total)}</td><td>${fmt(inv.paid)}</td><td>${fmt(rem)}</td>
            <td>${st}</td>
            <td>
              ${inv.status !== 'cancelled' ? `<button class="btn btn-sm btn-secondary" onclick="openEditInvoice('${inv.id}')" title="${t('common.edit')}">✏️</button> ` : ''}
              ${inv.status !== 'cancelled' ? `<button class="btn btn-sm btn-secondary" onclick="printInvoice('${inv.id}')" title="${t('invoice.print')}">🖨</button> ` : ''}
              ${inv.status !== 'cancelled' ? `<button class="btn btn-sm btn-secondary" onclick="shareWhatsApp('${inv.id}')" title="${t('invoice.shareWhatsApp')}">📱</button> ` : ''}
              ${inv.status !== 'cancelled' ? `<button class="btn btn-sm btn-secondary" onclick="repeatInvoice('${inv.id}')" title="${t('invoice.repeat')}">↻</button> ` : ''}
              ${inv.status !== 'cancelled' && rem > 0 ? `<button class="btn btn-sm btn-primary" onclick="openCollectModal('${inv.id}')">${t('customers.collect')}</button> ` : ''}
              ${inv.status !== 'cancelled' ? `<button class="btn btn-sm btn-danger" onclick="cancelInvoice('${inv.id}')" title="${t('common.delete')}">🗑️</button>` : ''}
            </td>
          </tr>`;
        }).join('')}
      </tbody></table></div>`}
    </div>`;
}

function openInvoiceModal() {
  if (!state.customers.length) {
    toast(LANG === 'ar' ? 'أضف عميلًا أولًا' : 'Add a customer first', 'error');
    navigate('customers');
    return;
  }
  const batches = state.batches.filter(b => Math.max(0, num(b.availableQty) - num(b.soldQty)) > 0);
  if (!batches.length) { toast(t('toast.insufficientStock'), 'error'); return; }
  openModal(t('sales.newInvoice'), `
    <div class="form-grid">
      <div class="form-group"><label>${t('common.date')}</label><input type="date" id="inv_date" value="${todayISO()}"></div>
      <div class="form-group"><label>${t('sales.customer')}</label>
        <select id="inv_customer" onchange="applyCustomerPrice()">${state.customers.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>
      </div>
      <div class="form-group"><label>${t('sales.discount')}</label><input type="number" id="inv_discount" value="0"></div>
      <div class="form-group"><label>${t('sales.paid')}</label><input type="number" id="inv_paid" value="0"></div>
      <div class="form-group"><label>${t('installments.dueDate')}</label><input type="date" id="inv_dueDate"></div>
    </div>
    <div class="panel-head" style="margin-top:14px">
      <h3>${t('sales.items')}</h3>
      <button class="btn btn-sm btn-secondary" onclick="addInvoiceLine()">+ ${t('common.add')}</button>
    </div>
    <div id="inv_lines"></div>
    <div class="form-group full"><label>${t('common.notes')}</label><textarea id="inv_notes"></textarea></div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">${t('common.cancel')}</button>
     <button class="btn btn-primary" onclick="saveInvoice()">${t('common.save')}</button>`);
  addInvoiceLine();
}

function addInvoiceLine() {
  const batches = state.batches.filter(b => Math.max(0, num(b.availableQty) - num(b.soldQty)) > 0);
  const customerId = (document.getElementById('inv_customer') || {}).value;
  const customer = state.customers.find(x => x.id === customerId);
  const defaultPrice = (customer && customer.defaultPrice > 0)
    ? customer.defaultPrice
    : state.settings.products[0].defaultSellPrice;
  const div = document.createElement('div');
  div.className = 'form-grid';
  div.style.cssText = 'margin-bottom:10px;padding:10px;background:var(--surface-2);border-radius:8px';
  div.innerHTML = `
    <div class="form-group"><label>${t('inventory.product')}</label>
      <select class="line-batch">
        ${batches.map(b => {
          const prod = getProduct(b.productId);
          const rem = Math.max(0, num(b.availableQty) - num(b.soldQty));
          return `<option value="${b.id}">${esc(prod.name)} — ${esc(b.date)} (${LANG === 'ar' ? 'متبقي' : 'avail'} ${fmtNum(rem)} ${esc(prod.unit)})</option>`;
        }).join('')}
      </select>
    </div>
    <div class="form-group"><label>${t('common.qty')}</label><input type="number" class="line-qty" value="1" min="0.01" step="0.01"></div>
    <div class="form-group"><label>${t('sales.unitPrice')}</label><input type="number" class="line-price" value="${defaultPrice}" min="0" step="0.01"></div>`;
  document.getElementById('inv_lines').appendChild(div);
}

function applyCustomerPrice() {
  const customerId = document.getElementById('inv_customer').value;
  const customer = state.customers.find(x => x.id === customerId);
  if (!customer || !customer.defaultPrice) return;
  document.querySelectorAll('.line-price').forEach(el => {
    el.value = customer.defaultPrice;
  });
}

function openEditInvoice(id) {
  const inv = state.invoices.find(x => x.id === id);
  if (!inv) return;
  openModal(t('common.edit') + ' — #' + inv.no, `
    <input type="hidden" id="inv_id" value="${id}">
    <div class="form-grid">
      <div class="form-group"><label>${t('common.date')}</label><input type="date" id="inv_date" value="${inv.date}"></div>
      <div class="form-group"><label>${t('sales.customer')}</label>
        <select id="inv_customer">${state.customers.map(c => `<option value="${c.id}" ${c.id === inv.customerId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
      </div>
      <div class="form-group"><label>${t('sales.discount')}</label><input type="number" id="inv_discount" value="${inv.discount || 0}"></div>
      <div class="form-group"><label>${t('installments.dueDate')}</label><input type="date" id="inv_dueDate" value="${inv.dueDate || ''}"></div>
    </div>
    <div class="form-group full mt-16"><label>${t('common.notes')}</label><textarea id="inv_notes">${esc(inv.notes || '')}</textarea></div>
    <div class="mt-16 text-muted" style="font-size:12px">${t('msg.editHintInvoice')}</div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">${t('common.cancel')}</button>
     <button class="btn btn-primary" onclick="saveEditInvoice()">${t('common.save')}</button>`);
}

function openCollectModal(invoiceId) {
  const inv = state.invoices.find(x => x.id === invoiceId);
  if (!inv) return;
  const rem = num(inv.total) - num(inv.paid);
  openModal(t('customers.collect'), `
    <div class="form-group"><label>${t('sales.remaining')}</label><input value="${fmt(rem)}" disabled></div>
    <div class="form-group"><label>${t('common.amount')}</label><input type="number" id="col_amount" value="${rem}" max="${rem}"></div>
    <div class="form-group"><label>${t('common.date')}</label><input type="date" id="col_date" value="${todayISO()}"></div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">${t('common.cancel')}</button>
     <button class="btn btn-primary" onclick="saveCollect('${invoiceId}')">${t('common.save')}</button>`);
}

/* =====================================================
   CUSTOMERS
   ===================================================== */
function renderCustomers() {
  document.getElementById('content').innerHTML = `
    <div class="panel">
      <div class="panel-head">
        <h3>${t('customers.title')}</h3>
        <button class="btn btn-primary" onclick="openCustomerModal()">+ ${t('customers.new')}</button>
      </div>
      ${state.customers.length === 0 ? `<div class="empty"><h4>${t('customers.noCustomers')}</h4></div>` :
      `<div class="table-wrap"><table><thead><tr>
        <th>#</th><th>${t('customers.name')}</th><th>${t('customers.phone')}</th>
        <th>${t('customers.totalInvoices')}</th><th>${t('customers.totalPaid')}</th>
        <th>${t('customers.balance')}</th><th>${t('common.actions')}</th>
      </tr></thead><tbody>
        ${state.customers.map((c, i) => {
          const invs = state.invoices.filter(x => x.customerId === c.id && x.status !== 'cancelled');
          const totInv = invs.reduce((s, x) => s + num(x.total), 0);
          const totPaid = invs.reduce((s, x) => s + num(x.paid), 0) + state.payments.filter(p => p.customerId === c.id).reduce((s, p) => s + num(p.amount), 0);
          const bal = Calc.customerBalance(c.id);
          const oldInvs = invs.filter(x => num(x.total) - num(x.paid) > 0);
          const invD = oldInvs.length ? Math.floor((Date.now() - new Date(oldInvs[0].date).getTime()) / 86400000) : 0;
          return `<tr>
            <td>${i + 1}</td><td>${esc(c.name)}</td><td>${esc(c.phone || '-')}</td>
            <td>${fmt(totInv)}</td><td>${fmt(totPaid)}</td>
            <td class="${bal <= 0 ? 'text-success' : (invD > 30 ? 'overdue' : 'due-warn')}"><b>${fmt(bal)}</b></td>
            <td>
              <button class="btn btn-sm btn-secondary" onclick="openStatement('${c.id}')">${t('customers.statement')}</button>
              <button class="btn btn-sm btn-secondary" onclick="openCustomerModal('${c.id}')" title="${t('common.edit')}">✏️</button>
              <button class="btn btn-sm btn-danger" onclick="deleteCustomer('${c.id}')" title="${t('common.delete')}">🗑️</button>
            </td>
          </tr>`;
        }).join('')}
      </tbody></table></div>`}
    </div>`;
}

function openCustomerModal(id) {
  const existing = id ? state.customers.find(c => c.id === id) : null;
  openModal((existing ? t('common.edit') : t('customers.new')), `
    <input type="hidden" id="c_id" value="${existing ? existing.id : ''}">
    <div class="form-grid">
      <div class="form-group"><label>${t('customers.name')}</label><input id="c_name" value="${existing ? esc(existing.name) : ''}"></div>
      <div class="form-group"><label>${t('customers.phone')}</label><input id="c_phone" value="${existing ? esc(existing.phone || '') : ''}"></div>
      <div class="form-group"><label>${t('customers.address')}</label><input id="c_address" value="${existing ? esc(existing.address || '') : ''}"></div>
      <div class="form-group"><label>${t('customers.defaultPrice')}</label><input type="number" id="c_defaultPrice" value="${existing ? existing.defaultPrice : 0}"></div>
    </div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">${t('common.cancel')}</button>
     <button class="btn btn-primary" onclick="saveCustomer()">${t('common.save')}</button>`);
}

function openStatement(customerId) {
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
    return `<tr><td>${esc(r.date)}</td><td>${esc(r.desc)}</td><td>${r.debit ? fmt(r.debit) : '-'}</td><td>${r.credit ? fmt(r.credit) : '-'}</td><td>${fmt(bal)}</td></tr>`;
  }).join('');
  openModal(`${t('customers.statement')} — ${c.name}`, `
    <div class="table-wrap"><table>
      <thead><tr><th>${t('common.date')}</th><th>${t('common.notes')}</th><th>مدين</th><th>دائن</th><th>${t('customers.balance')}</th></tr></thead>
      <tbody>${tableRows || `<tr><td colspan="5" class="text-muted">${t('common.empty')}</td></tr>`}</tbody>
    </table></div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">${t('common.close')}</button>
     <button class="btn btn-primary" onclick="printStatement('${customerId}')">🖨 ${t('invoice.printStatement')}</button>`);
}

/* =====================================================
   EXPENSES
   ===================================================== */
function renderExpenses() {
  document.getElementById('content').innerHTML = `
    <div class="panel">
      <div class="panel-head">
        <h3>${t('expenses.title')}</h3>
        <button class="btn btn-primary" onclick="openExpenseModal()">+ ${t('expenses.new')}</button>
      </div>
      ${state.expenses.length === 0 ? `<div class="empty"><h4>${t('expenses.noExpenses')}</h4></div>` :
      `<div class="table-wrap"><table><thead><tr>
        <th>${t('common.date')}</th><th>${t('expenses.category')}</th><th>${t('expenses.desc')}</th>
        <th>${t('common.amount')}</th><th>${t('expenses.receiver')}</th><th>${t('common.actions')}</th>
      </tr></thead><tbody>
        ${state.expenses.slice().reverse().map(e => `<tr>
          <td>${esc(e.date)}</td><td>${esc(e.category)}</td><td>${esc(e.desc)}</td>
          <td class="text-danger">${fmt(e.amount)}</td><td>${esc(e.receiver || '-')}</td>
          <td>
            <button class="btn btn-sm btn-secondary" onclick="openExpenseModal('${e.id}')" title="${t('common.edit')}">✏️</button>
            <button class="btn btn-sm btn-danger" onclick="deleteExpense('${e.id}')" title="${t('common.delete')}">🗑️</button>
          </td>
        </tr>`).join('')}
      </tbody></table></div>`}
    </div>`;
}

function openExpenseModal(id) {
  const existing = id ? state.expenses.find(e => e.id === id) : null;
  openModal((existing ? t('common.edit') : t('expenses.new')), `
    <input type="hidden" id="e_id" value="${existing ? existing.id : ''}">
    <div class="form-grid">
      <div class="form-group"><label>${t('common.date')}</label><input type="date" id="e_date" value="${existing ? existing.date : todayISO()}"></div>
      <div class="form-group"><label>${t('expenses.category')}</label>
        <select id="e_cat">${state.settings.expenseCategories.map(c => `<option ${existing && existing.category === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
      </div>
      <div class="form-group"><label>${t('common.amount')}</label><input type="number" id="e_amount" value="${existing ? existing.amount : ''}"></div>
      <div class="form-group"><label>${t('expenses.receiver')}</label><input id="e_receiver" value="${existing ? esc(existing.receiver || '') : ''}"></div>
      <div class="form-group full"><label>${t('expenses.desc')}</label><input id="e_desc" value="${existing ? esc(existing.desc || '') : ''}"></div>
    </div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">${t('common.cancel')}</button>
     <button class="btn btn-primary" onclick="saveExpense()">${t('common.save')}</button>`);
}

/* =====================================================
   CASHBOX
   ===================================================== */
function renderCashbox() {
  document.getElementById('content').innerHTML = `
    <div class="panel">
      <div class="stats-grid">
        <div class="stat-card"><div class="label">${t('cashbox.opening')}</div><div class="value">${fmt(state.settings.openingCash)}</div></div>
        <div class="stat-card"><div class="label">${t('cashbox.current')}</div><div class="value pos">${fmt(Calc.cashBalance())}</div></div>
      </div>
      <div class="row mt-16">
        <button class="btn btn-primary" onclick="openOpeningCashModal()">${t('cashbox.setOpening')}</button>
        <button class="btn btn-secondary" onclick="openCashMovementModal()">+ ${t('cashbox.newMovement')}</button>
      </div>
    </div>
    <div class="panel">
      <div class="panel-head"><h3>${t('cashbox.title')}</h3></div>
      ${state.cashMovements.length === 0 ? `<div class="empty"><h4>${t('cashbox.noMovements')}</h4></div>` :
      `<div class="table-wrap"><table><thead><tr>
        <th>${t('common.date')}</th><th>${t('cashbox.category')}</th>
        <th>${t('cashbox.direction')}</th><th>${t('common.amount')}</th>
        <th>${t('cashbox.reason')}</th><th>${t('common.actions')}</th>
      </tr></thead><tbody>
        ${state.cashMovements.slice().reverse().map(m => `<tr>
          <td>${esc(m.date)}</td><td>${esc(m.category)}</td>
          <td>${m.direction === 'in' ? `<span class="badge badge-success">${t('cashbox.in')}</span>` : `<span class="badge badge-danger">${t('cashbox.out')}</span>`}</td>
          <td class="${m.direction === 'in' ? 'text-success' : 'text-danger'}">${fmt(m.amount)}</td>
          <td>${esc(m.reason || m.notes || '-')}</td>
          <td>
            ${m.type === 'manual' ? `<button class="btn btn-sm btn-secondary" onclick="openCashMovementModal('${m.id}')" title="${t('common.edit')}">✏️</button>
            <button class="btn btn-sm btn-danger" onclick="deleteCashMovement('${m.id}')" title="${t('common.delete')}">🗑️</button>` : `<span class="text-muted" style="font-size:11px">—</span>`}
          </td>
        </tr>`).join('')}
      </tbody></table></div>`}
    </div>`;
}

function openOpeningCashModal() {
  openModal(t('cashbox.setOpening'), `
    <div class="form-group"><label>${t('cashbox.opening')}</label><input type="number" id="oc_amount" value="${state.settings.openingCash || 0}"></div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">${t('common.cancel')}</button>
     <button class="btn btn-primary" onclick="saveOpeningCash()">${t('common.save')}</button>`);
}

function openCashMovementModal(id) {
  const existing = id ? state.cashMovements.find(m => m.id === id) : null;
  openModal((existing ? t('common.edit') : t('cashbox.newMovement')), `
    <input type="hidden" id="cm_id" value="${existing ? existing.id : ''}">
    <div class="form-grid">
      <div class="form-group"><label>${t('common.date')}</label><input type="date" id="cm_date" value="${existing ? existing.date : todayISO()}"></div>
      <div class="form-group"><label>${t('cashbox.direction')}</label>
        <select id="cm_dir">
          <option value="in" ${existing && existing.direction === 'in' ? 'selected' : ''}>${t('cashbox.in')}</option>
          <option value="out" ${existing && existing.direction === 'out' ? 'selected' : ''}>${t('cashbox.out')}</option>
        </select>
      </div>
      <div class="form-group"><label>${t('common.amount')}</label><input type="number" id="cm_amount" value="${existing ? existing.amount : ''}"></div>
      <div class="form-group"><label>${t('cashbox.category')}</label><input id="cm_cat" value="${existing ? esc(existing.category || '') : ''}"></div>
      <div class="form-group full"><label>${t('cashbox.reason')}</label><input id="cm_reason" value="${existing ? esc(existing.reason || '') : ''}"></div>
    </div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">${t('common.cancel')}</button>
     <button class="btn btn-primary" onclick="saveCashMovement()">${t('common.save')}</button>`);
}

/* =====================================================
   WORKERS (Daily Wages)
   ===================================================== */
function renderWorkers() {
  const totalDays = state.workDays.length;
  document.getElementById('content').innerHTML = `
    <div class="panel">
      <div class="panel-head">
        <h3>${t('workers.title')}</h3>
        <div class="row">
          <button class="btn btn-primary" onclick="openWorkerModal()">+ ${t('workers.new')}</button>
          <button class="btn btn-secondary" onclick="openWorkDayModal()">📅 ${t('workers.recordDay')}</button>
        </div>
      </div>
      ${state.workers.length === 0 ? `<div class="empty"><h4>${t('workers.noWorkers')}</h4></div>` :
      `<div class="table-wrap"><table><thead><tr>
        <th>${t('workers.name')}</th><th>${t('workers.dailyWage')}</th><th>${t('workers.daysWorked')}</th>
        <th>${t('workers.earned')}</th><th>${t('workers.paid')}</th><th>${t('workers.balance')}</th>
        <th>${t('common.status')}</th><th>${t('common.actions')}</th>
      </tr></thead><tbody>
        ${state.workers.map(w => {
          const days = state.workDays.filter(x => x.workerId === w.id).length;
          const earned = Calc.workerEarned(w.id), paid = Calc.workerPaid(w.id), bal = earned - paid;
          return `<tr>
            <td>${esc(w.name)}</td><td>${fmt(w.dailyWage)}</td><td>${fmtNum(days)}</td>
            <td>${fmt(earned)}</td><td>${fmt(paid)}</td>
            <td class="${bal > 0 ? 'text-danger' : 'text-success'}"><b>${fmt(bal)}</b></td>
            <td>${w.active ? `<span class="badge badge-success">${t('workers.active')}</span>` : `<span class="badge badge-danger">${t('workers.inactive')}</span>`}</td>
            <td>
              ${bal > 0 ? `<button class="btn btn-sm btn-primary" onclick="openPayWorker('${w.id}')">${t('workers.pay')}</button> ` : ''}
              <button class="btn btn-sm btn-secondary" onclick="openWorkerModal('${w.id}')" title="${t('common.edit')}">✏️</button>
              <button class="btn btn-sm btn-danger" onclick="deleteWorker('${w.id}')" title="${t('common.delete')}">🗑️</button>
            </td>
          </tr>`;
        }).join('')}
      </tbody></table></div>`}
    </div>
    <div class="panel">
      <div class="panel-head"><h3>${t('workers.daysList')}</h3></div>
      ${totalDays === 0 ? `<div class="empty"><h4>${t('workers.noDays')}</h4></div>` :
      `<div class="table-wrap"><table><thead><tr>
        <th>${t('common.date')}</th><th>${t('workers.name')}</th><th>${t('common.amount')}</th>
        <th>${t('common.notes')}</th><th>${t('common.actions')}</th>
      </tr></thead><tbody>
        ${state.workDays.slice().reverse().map(wd => {
          const wk = state.workers.find(x => x.id === wd.workerId);
          return `<tr>
            <td>${esc(wd.date)}</td><td>${esc(wk ? wk.name : '-')}</td>
            <td class="text-danger">${fmt(wd.amount)}</td>
            <td>${esc(wd.notes || '-')}</td>
            <td>
              <button class="btn btn-sm btn-secondary" onclick="openWorkDayModal('${wd.id}')" title="${t('common.edit')}">✏️</button>
              <button class="btn btn-sm btn-danger" onclick="deleteWorkDay('${wd.id}')" title="${t('common.delete')}">🗑️</button>
            </td>
          </tr>`;
        }).join('')}
      </tbody></table></div>`}
    </div>`;
}

function openWorkerModal(id) {
  const existing = id ? state.workers.find(w => w.id === id) : null;
  openModal((existing ? t('common.edit') : t('workers.new')), `
    <input type="hidden" id="w_id" value="${existing ? existing.id : ''}">
    <div class="form-grid">
      <div class="form-group"><label>${t('workers.name')}</label><input id="w_name" value="${existing ? esc(existing.name) : ''}"></div>
      <div class="form-group"><label>${t('workers.dailyWage')}</label><input type="number" id="w_dailyWage" value="${existing ? existing.dailyWage : state.settings.workerDailyWage}"></div>
      ${existing ? `<div class="form-group"><label>${t('common.status')}</label>
        <select id="w_active">
          <option value="1" ${existing.active ? 'selected' : ''}>${t('workers.active')}</option>
          <option value="0" ${!existing.active ? 'selected' : ''}>${t('workers.inactive')}</option>
        </select></div>` : ''}
    </div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">${t('common.cancel')}</button>
     <button class="btn btn-primary" onclick="saveWorker()">${t('common.save')}</button>`);
}

function openWorkDayModal(id) {
  const existing = id ? state.workDays.find(d => d.id === id) : null;
  const activeWorkers = state.workers.filter(w => w.active || (existing && w.id === existing.workerId));
  if (!activeWorkers.length) {
    toast(LANG === 'ar' ? 'أضف عاملًا أولًا' : 'Add a worker first', 'error');
    return;
  }
  openModal(existing ? t('common.edit') : t('workers.recordDay'), `
    <input type="hidden" id="wd_id" value="${existing ? existing.id : ''}">
    <div class="form-grid">
      <div class="form-group"><label>${t('common.date')}</label><input type="date" id="wd_date" value="${existing ? existing.date : todayISO()}"></div>
      <div class="form-group"><label>${t('workers.name')}</label>
        <select id="wd_worker" onchange="fillWorkDayAmount()">
          ${activeWorkers.map(w => `<option value="${w.id}" data-wage="${w.dailyWage}" ${existing && w.id === existing.workerId ? 'selected' : ''}>${esc(w.name)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label>${t('common.amount')}</label><input type="number" id="wd_amount" value="${existing ? existing.amount : ''}"></div>
      <div class="form-group full"><label>${t('common.notes')}</label><input id="wd_notes" value="${existing ? esc(existing.notes || '') : ''}"></div>
    </div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">${t('common.cancel')}</button>
     <button class="btn btn-primary" onclick="saveWorkDay()">${t('common.save')}</button>`);
  if (!existing) fillWorkDayAmount();
}

function fillWorkDayAmount() {
  const sel = document.getElementById('wd_worker');
  if (!sel) return;
  const opt = sel.options[sel.selectedIndex];
  const wage = opt ? num(opt.dataset.wage) : 0;
  const amtEl = document.getElementById('wd_amount');
  if (amtEl && !amtEl.value) amtEl.value = wage;
}

function openPayWorker(id) {
  const bal = Calc.workerEarned(id) - Calc.workerPaid(id);
  openModal(t('workers.pay'), `
    <div class="form-group"><label>${t('workers.balance')}</label><input value="${fmt(bal)}" disabled></div>
    <div class="form-group"><label>${t('common.amount')}</label><input type="number" id="wp_amount" value="${bal}" max="${bal}"></div>
    <div class="form-group"><label>${t('common.date')}</label><input type="date" id="wp_date" value="${todayISO()}"></div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">${t('common.cancel')}</button>
     <button class="btn btn-primary" onclick="savePayWorker('${id}')">${t('common.save')}</button>`);
}

/* =====================================================
   PARTNERS
   ===================================================== */
function renderPartners() {
  const profit = Calc.netProfit();
  const p1 = profit * num(state.settings.share1) / 100;
  const p2 = profit * num(state.settings.share2) / 100;
  const d1 = Calc.partnerDrawings('p1'), d2 = Calc.partnerDrawings('p2');
  const drawingsList = state.drawings.slice().reverse();
  document.getElementById('content').innerHTML = `
    <div class="panel">
      <div class="panel-head"><h3>${t('partners.title')}</h3></div>
      <div class="stats-grid">
        <div class="stat-card"><div class="label">${t('partners.periodProfit')}</div><div class="value pos">${fmt(profit)}</div></div>
        <div class="stat-card"><div class="label">${t('partners.availableCash')}</div><div class="value">${fmt(Calc.cashBalance())}</div></div>
      </div>
    </div>
    <div class="panel">
      <div class="table-wrap"><table><thead><tr>
        <th>${t('partners.name')}</th><th>${t('partners.share')}</th>
        <th>${t('partners.profitShare')}</th><th>${t('partners.drawings')}</th>
        <th>${t('partners.balance')}</th><th>${t('common.actions')}</th>
      </tr></thead><tbody>
        <tr>
          <td>${esc(state.settings.partner1)}</td><td>${state.settings.share1}%</td>
          <td>${fmt(p1)}</td><td>${fmt(d1)}</td>
          <td class="${p1-d1 > 0 ? 'text-success' : 'text-danger'}"><b>${fmt(p1-d1)}</b></td>
          <td><button class="btn btn-sm btn-primary" onclick="openWithdraw('p1')">${t('partners.withdraw')}</button></td>
        </tr>
        <tr>
          <td>${esc(state.settings.partner2)}</td><td>${state.settings.share2}%</td>
          <td>${fmt(p2)}</td><td>${fmt(d2)}</td>
          <td class="${p2-d2 > 0 ? 'text-success' : 'text-danger'}"><b>${fmt(p2-d2)}</b></td>
          <td><button class="btn btn-sm btn-primary" onclick="openWithdraw('p2')">${t('partners.withdraw')}</button></td>
        </tr>
      </tbody></table></div>
    </div>
    <div class="panel">
      <div class="panel-head"><h3>${t('partners.drawingsList')}</h3></div>
      ${drawingsList.length === 0 ? `<p class="text-muted">${t('common.empty')}</p>` :
      `<div class="table-wrap"><table><thead><tr>
        <th>${t('common.date')}</th><th>${t('partners.name')}</th>
        <th>${t('common.amount')}</th><th>${t('common.actions')}</th>
      </tr></thead><tbody>
        ${drawingsList.map(d => {
          const pn = d.partnerId === 'p1' ? state.settings.partner1 : state.settings.partner2;
          return `<tr>
            <td>${esc(d.date)}</td><td>${esc(pn)}</td><td class="text-danger">${fmt(d.amount)}</td>
            <td>
              <button class="btn btn-sm btn-secondary" onclick="openWithdraw('${d.partnerId}','${d.id}')" title="${t('common.edit')}">✏️</button>
              <button class="btn btn-sm btn-danger" onclick="deleteDrawing('${d.id}')" title="${t('common.delete')}">🗑️</button>
            </td>
          </tr>`;
        }).join('')}
      </tbody></table></div>`}
    </div>`;
}

function openWithdraw(partnerId, drawingId) {
  const existing = drawingId ? state.drawings.find(d => d.id === drawingId) : null;
  const balanceFor = Calc.cashBalance() + (existing ? num(existing.amount) : 0);
  openModal(existing ? t('common.edit') : t('partners.withdraw'), `
    <input type="hidden" id="dw_id" value="${existing ? existing.id : ''}">
    <input type="hidden" id="dw_partner" value="${partnerId}">
    <div class="form-group"><label>${t('partners.availableCash')}</label><input value="${fmt(balanceFor)}" disabled></div>
    <div class="form-group"><label>${t('common.amount')}</label><input type="number" id="dw_amount" value="${existing ? existing.amount : ''}" max="${balanceFor}"></div>
    <div class="form-group"><label>${t('common.date')}</label><input type="date" id="dw_date" value="${existing ? existing.date : todayISO()}"></div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">${t('common.cancel')}</button>
     <button class="btn btn-primary" onclick="saveWithdraw('${partnerId}')">${t('common.save')}</button>`);
}

/* =====================================================
   REPORTS
   ===================================================== */
function renderReports() {
  document.getElementById('content').innerHTML = `
    <div class="panel">
      <div class="panel-head"><h3>${t('reports.title')}</h3></div>
      <div class="form-grid">
        <div class="form-group"><label>${t('reports.from')}</label><input type="date" id="r_from"></div>
        <div class="form-group"><label>${t('reports.to')}</label><input type="date" id="r_to"></div>
        <div class="form-group"><label>${t('reports.product')}</label>
          <select id="r_product"><option value="">${t('reports.all')}</option>${state.settings.products.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select>
        </div>
        <div class="form-group"><label>&nbsp;</label><button class="btn btn-primary" onclick="runReports()">${t('common.search')}</button></div>
      </div>
    </div>
    <div id="reportOutput"></div>`;
  runReports();
}

function reportTable(id, title, rows, col) {
  return `<div class="panel"><div class="panel-head"><h3>${title}</h3>
    <div class="row">
      <button class="btn btn-sm btn-secondary" onclick="exportTableCSV('${id}')">${t('common.export')}</button>
      <button class="btn btn-sm btn-secondary" onclick="exportTableExcel('${id}')">${t('export.excel')}</button>
    </div></div>
    <table id="${id}"><thead><tr><th>${col}</th><th>${t('common.amount')}</th></tr></thead>
    <tbody>${rows.length ? rows.map(r => `<tr><td>${esc(r[0])}</td><td>${fmt(r[1])}</td></tr>`).join('') : `<tr><td colspan="2" class="text-muted">${t('reports.noData')}</td></tr>`}</tbody>
    </table></div>`;
}

function runReports() {
  const from = (document.getElementById('r_from') || {}).value || '';
  const to = (document.getElementById('r_to') || {}).value || '';
  const prodFilter = (document.getElementById('r_product') || {}).value || '';
  const out = document.getElementById('reportOutput');
  if (!out) return;
  const sales = Calc.totalSales(from, to);
  const cogs = Calc.cogsRange(from, to);
  const op = Calc.operatingExpenses(from, to);
  const wages = Calc.totalWages(from, to);
  const profit = sales - cogs - op - wages;
  const expByCat = {}, salesByCust = {}, salesByBatch = {}, salesByProd = {};
  state.expenses.filter(e => withinRange(e.date, from, to)).forEach(e => expByCat[e.category] = (expByCat[e.category] || 0) + num(e.amount));
  state.invoices.filter(i => i.status !== 'cancelled' && withinRange(i.date, from, to)).forEach(i => {
    const c = state.customers.find(x => x.id === i.customerId);
    const k = c ? c.name : '-';
    salesByCust[k] = (salesByCust[k] || 0) + num(i.total);
    i.items.forEach(it => {
      const b = state.batches.find(x => x.id === it.batchId);
      if (!b) return;
      if (prodFilter && b.productId !== prodFilter) return;
      const bk = b.date;
      salesByBatch[bk] = (salesByBatch[bk] || 0) + it.qty * it.price;
      const pk = getProductName(b.productId);
      salesByProd[pk] = (salesByProd[pk] || 0) + it.qty * it.price;
    });
  });
  const debts = state.customers.map(c => [c.name, Calc.customerBalance(c.id)]).filter(r => r[1] > 0);
  const invRows = state.batches.filter(b => !prodFilter || b.productId === prodFilter)
    .map(b => [b.date, getProductName(b.productId), Math.max(0, num(b.availableQty) - num(b.soldQty)), b.unitCost]);
  const cmp = comparePeriods(from, to);

  out.innerHTML = `
    <div class="panel"><div class="panel-head"><h3>${t('reports.profitReport')}</h3>
      <div class="row">
        <button class="btn btn-sm btn-secondary" onclick="exportTableCSV('profitTable')">${t('common.export')}</button>
        <button class="btn btn-sm btn-secondary" onclick="exportTableExcel('profitTable')">${t('export.excel')}</button>
      </div></div>
      <table id="profitTable"><tbody>
        <tr><td>${t('dashboard.periodSales')}</td><td>${fmt(sales)}</td></tr>
        <tr><td>${t('dashboard.cogs')}</td><td>${fmt(cogs)}</td></tr>
        <tr><td>${t('dashboard.expenses')}</td><td>${fmt(op)}</td></tr>
        <tr><td>${t('dashboard.wages')}</td><td>${fmt(wages)}</td></tr>
        <tr><td><b>${t('dashboard.netProfit')}</b></td><td><b class="${profit>=0?'text-success':'text-danger'}">${fmt(profit)}</b></td></tr>
        <tr><td>${esc(state.settings.partner1)} (${state.settings.share1}%)</td><td>${fmt(profit*num(state.settings.share1)/100)}</td></tr>
        <tr><td>${esc(state.settings.partner2)} (${state.settings.share2}%)</td><td>${fmt(profit*num(state.settings.share2)/100)}</td></tr>
      </tbody></table>
    </div>
    ${cmp ? `<div class="panel">
      <div class="panel-head"><h3>${t('reports.comparison')}</h3></div>
      <table><thead><tr>
        <th></th><th>${t('reports.current')}</th><th>${t('reports.prev')}</th><th>${t('reports.growth')}</th>
      </tr></thead><tbody>
        <tr>
          <td>${t('dashboard.periodSales')}</td>
          <td>${fmt(cmp.curSales)}</td>
          <td>${fmt(cmp.prevSales)}</td>
          <td class="${cmp.growth >= 0 ? 'text-success' : 'text-danger'}">${fmtNum(cmp.growth)}%</td>
        </tr>
        <tr>
          <td>${t('dashboard.netProfit')}</td>
          <td>${fmt(cmp.curProfit)}</td>
          <td>${fmt(cmp.prevProfit)}</td>
          <td class="${cmp.curProfit >= cmp.prevProfit ? 'text-success' : 'text-danger'}">${fmt(cmp.curProfit - cmp.prevProfit)}</td>
        </tr>
      </tbody></table>
    </div>` : ''}
    ${renderAgingReport()}
    ${reportTable('salesByProdTable', t('reports.salesByProduct'), Object.entries(salesByProd), t('common.product'))}
    ${reportTable('salesByCustTable', t('reports.salesByCustomer'), Object.entries(salesByCust), t('sales.customer'))}
    ${reportTable('expByCatTable', t('reports.expensesByCat'), Object.entries(expByCat), t('expenses.category'))}
    ${reportTable('debtsTable', t('reports.customerDebts'), debts, t('customers.name'))}
    <div class="panel"><div class="panel-head"><h3>${t('reports.inventoryReport')}</h3></div>
      <table><thead><tr><th>${t('common.date')}</th><th>${t('common.product')}</th><th>${t('inventory.remaining')}</th><th>${t('inventory.unitCost')}</th></tr></thead>
      <tbody>${invRows.map(r => `<tr><td>${r[0]}</td><td>${esc(r[1])}</td><td>${fmtNum(r[2])}</td><td>${fmt(r[3])}</td></tr>`).join('') || `<tr><td colspan="4" class="text-muted">${t('reports.noData')}</td></tr>`}</tbody>
      </table>
    </div>
    <div class="panel"><button class="btn btn-secondary" onclick="exportFullJSON()">${t('reports.exportJson')}</button></div>`;
}

/* =====================================================
   ACTIVITY
   ===================================================== */
function renderActivity() {
  const logs = state.auditLog.slice().reverse();
  const icons = {
    invoice_created:'▤',invoice_cancelled:'✕',invoice_edited:'✏️',batch_created:'▦',
    batch_edited:'✏️',batch_deleted:'🗑️',expense_created:'◈',expense_edited:'✏️',
    expense_deleted:'🗑️',payment:'◉',withdrawal:'◑',drawing_edited:'✏️',
    drawing_deleted:'🗑️',adjust:'⚙',settings:'⚙',worker_payment:'◐',
    customer_edited:'✏️',customer_deleted:'🗑️',worker_edited:'✏️',
    worker_deleted:'🗑️',cash_edited:'✏️',cash_deleted:'🗑️',
    work_day:'📅',work_day_edited:'✏️',work_day_deleted:'🗑️',
  };
  document.getElementById('content').innerHTML = `
    <div class="panel">
      <div class="panel-head"><h3>${t('nav.activity')}</h3></div>
      ${logs.length === 0 ? `<div class="empty"><h4>${t('common.empty')}</h4></div>` : `
        <div class="log-list">
          ${logs.map(l => `
            <div class="log-item">
              <div class="log-ico">${icons[l.action] || '•'}</div>
              <div class="log-body">
                <div class="log-title">${esc(t('action.' + l.action) || l.action)}</div>
                <div class="log-meta">${esc(l.details || '')} · ${esc(l.date || '')}</div>
              </div>
            </div>
          `).join('')}
        </div>`}
    </div>`;
}

/* =====================================================
   SETTINGS
   ===================================================== */
function renderSettings() {
  const s = state.settings;
  const accents = ['#0FB864','#16DD79','#0A9A52','#046A38','#34E68C'];
  document.getElementById('content').innerHTML = `
    <div class="panel">
      <div class="panel-head"><h3>${t('settings.general')}</h3></div>
      <div class="form-grid">
        <div class="form-group"><label>${t('settings.lang')}</label>
          <select id="set_lang"><option value="ar">العربية</option><option value="en">English</option></select></div>
        <div class="form-group"><label>${t('settings.theme')}</label>
          <select id="set_theme"><option value="dark">Dark</option><option value="light">Light</option></select></div>
        <div class="form-group full"><label>${t('settings.accent')}</label>
          <div class="row">${accents.map(c => `<button class="btn btn-sm ${ACCENT===c?'btn-primary':'btn-secondary'}" style="background:${c};color:#fff;border-color:${c}" onclick="applyAccent('${c}');renderSettings()">${c}</button>`).join('')}</div>
        </div>
      </div>
    </div>
    <div class="panel">
      <div class="panel-head"><h3>${t('settings.defaults')}</h3></div>
      <div class="form-grid">
        <div class="form-group"><label>${t('settings.workerWage')}</label><input type="number" id="s_workerWage" value="${s.workerDailyWage}"></div>
        <div class="form-group"><label>${t('settings.opCost')}</label><input type="number" id="s_opCost" value="${s.opCost}"></div>
        <div class="form-group"><label>${t('settings.partner1')}</label><input id="s_p1" value="${esc(s.partner1)}"></div>
        <div class="form-group"><label>${t('settings.partner2')}</label><input id="s_p2" value="${esc(s.partner2)}"></div>
        <div class="form-group"><label>${t('settings.share1')}</label><input type="number" id="s_sh1" value="${s.share1}"></div>
        <div class="form-group"><label>${t('settings.share2')}</label><input type="number" id="s_sh2" value="${s.share2}"></div>
        <div class="form-group"><label>${t('settings.monthlyGoal')}</label><input type="number" id="s_monthlyGoal" value="${s.monthlyGoal || 0}"></div>
        <div class="form-group"><label>${t('settings.lowStock')}</label><input type="number" id="s_lowStock" value="${s.lowStockThreshold || 5}"></div>
        <div class="form-group"><label>${t('print.tel')}</label><input id="s_sellerPhone" value="${esc(s.sellerPhone || '')}"></div>
        <div class="form-group full"><label>${t('settings.categories')}</label><input id="s_cats" value="${esc(s.expenseCategories.join(', '))}"></div>
      </div>
      <div class="mt-16"><button class="btn btn-primary" onclick="saveSettings()">${t('common.save')}</button></div>
    </div>
    <div class="panel">
      <div class="panel-head"><h3>${t('settings.manageProducts')}</h3>
        <button class="btn btn-sm btn-primary" onclick="openProductModal()">+ ${t('products.new')}</button>
      </div>
      <div class="table-wrap"><table><thead><tr>
        <th>${t('products.name')}</th><th>${t('products.unit')}</th><th>${t('products.unitLabel')}</th>
        <th>${t('products.hasProcessing')}</th><th>${t('products.defaultBuyPrice')}</th>
        <th>${t('products.defaultSellPrice')}</th><th>${t('common.actions')}</th>
      </tr></thead><tbody>
        ${s.products.map(p => `<tr>
          <td><b>${esc(p.name)}</b></td><td>${esc(p.unit)}</td><td>${esc(p.unitLabel)}</td>
          <td>${p.hasProcessing ? '✓' : '—'}</td>
          <td>${fmt(p.defaultBuyPrice)}</td><td>${fmt(p.defaultSellPrice)}</td>
          <td>
            <button class="btn btn-sm btn-secondary" onclick="openProductModal('${p.id}')" title="${t('common.edit')}">✏️</button>
            <button class="btn btn-sm btn-danger" onclick="deleteProduct('${p.id}')" title="${t('common.delete')}">🗑️</button>
          </td>
        </tr>`).join('')}
      </tbody></table></div>
    </div>
    <div class="panel">
      <div class="panel-head"><h3>${t('settings.printMode')}</h3></div>
      <div class="form-grid">
        <div class="form-group">
          <select id="set_printMode">
            <option value="a5" ${s.printMode === 'a5' ? 'selected' : ''}>${t('settings.printA5')}</option>
            <option value="thermal" ${s.printMode === 'thermal' ? 'selected' : ''}>${t('settings.printThermal')}</option>
          </select>
        </div>
      </div>
    </div>
    <div class="panel">
      <div class="panel-head"><h3>${t('settings.backup')}</h3></div>
      <div class="row">
        <button class="btn btn-secondary" onclick="exportFullJSON()">${t('settings.exportBackup')}</button>
        <button class="btn btn-secondary" onclick="document.getElementById('importFile').click()">${t('settings.importBackup')}</button>
        <input type="file" id="importFile" accept="application/json" style="display:none" onchange="importJSON(event)">
        <button class="btn btn-danger" onclick="resetSystem()">${t('settings.reset')}</button>
      </div>
    </div>
    <div class="panel">
      <div class="panel-head"><h3>${t('settings.pin')} ${s.pin ? `<span class="badge badge-success">${t('settings.pinProtected')}</span>` : ''}</h3></div>
      <div class="row">
        <button class="btn btn-secondary" onclick="setPin()">${s.pin ? t('settings.pinRemove') : t('settings.pinSet')}</button>
      </div>
    </div>
    <div class="panel">
      <div class="panel-head"><h3>${t('settings.demoData')}</h3></div>
      <div class="row">
        <button class="btn btn-secondary" onclick="Extras.loadDemoData()">${t('settings.loadDemo')}</button>
        <button class="btn btn-danger" onclick="Extras.clearDemoData()">${t('settings.clearDemo')}</button>
      </div>
    </div>`;
  document.getElementById('set_lang').value = LANG;
  document.getElementById('set_theme').value = THEME;
  document.getElementById('set_lang').onchange = e => { LANG = e.target.value; localStorage.setItem('ff_lang', LANG); applyLang(); navigate(currentPage); };
  document.getElementById('set_theme').onchange = e => { THEME = e.target.value; localStorage.setItem('ff_theme', THEME); applyTheme(); };
  const pmEl = document.getElementById('set_printMode');
  if (pmEl) pmEl.onchange = e => { state.settings.printMode = e.target.value; saveState(); };
}

function openProductModal(id) {
  const existing = id ? state.settings.products.find(p => p.id === id) : null;
  openModal(existing ? t('common.edit') : t('products.new'), `
    <input type="hidden" id="pr_id" value="${existing ? existing.id : ''}">
    <div class="form-grid">
      <div class="form-group"><label>${t('products.name')}</label><input id="pr_name" value="${existing ? esc(existing.name) : ''}"></div>
      <div class="form-group"><label>${t('products.unit')}</label><input id="pr_unit" value="${existing ? esc(existing.unit) : 'كجم'}" placeholder="كجم / برميل / عبوة"></div>
      <div class="form-group"><label>${t('products.unitLabel')}</label><input id="pr_unitLabel" value="${existing ? esc(existing.unitLabel) : ''}" placeholder="شكارة / برميل / كرتونة"></div>
      <div class="form-group"><label>${t('products.hasProcessing')}</label>
        <select id="pr_hasProcessing"><option value="1" ${existing && existing.hasProcessing ? 'selected' : ''}>${LANG === 'ar' ? 'نعم' : 'Yes'}</option><option value="0" ${existing && !existing.hasProcessing ? 'selected' : ''}>${LANG === 'ar' ? 'لا' : 'No'}</option></select>
      </div>
      <div class="form-group"><label>${t('products.defaultBuyPrice')}</label><input type="number" id="pr_buy" value="${existing ? existing.defaultBuyPrice : 0}"></div>
      <div class="form-group"><label>${t('products.defaultSellPrice')}</label><input type="number" id="pr_sell" value="${existing ? existing.defaultSellPrice : 0}"></div>
      <div class="form-group"><label>${t('products.defaultWeight')}</label><input type="number" id="pr_weight" value="${existing ? existing.defaultWeight : 10}" step="0.01"></div>
    </div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">${t('common.cancel')}</button>
     <button class="btn btn-primary" onclick="saveProduct()">${t('common.save')}</button>`);
}

/* =====================================================
   CHARTS
   ===================================================== */
function drawLineChart(canvas, data, labels, color) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0) return;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  const W = rect.width, H = rect.height;
  ctx.clearRect(0, 0, W, H);
  if (!data.length) return;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const col = color || getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  const mutedCol = getComputedStyle(document.documentElement).getPropertyValue('--muted').trim();
  const stepX = W / Math.max(1, data.length - 1);
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, col + '55');
  grad.addColorStop(1, col + '00');
  ctx.beginPath();
  ctx.moveTo(0, H - 20);
  data.forEach((v, i) => {
    const x = i * stepX;
    const y = H - 22 - ((v - min) / range) * (H - 32);
    ctx.lineTo(x, y);
  });
  ctx.lineTo(W, H - 20);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.beginPath();
  data.forEach((v, i) => {
    const x = i * stepX;
    const y = H - 22 - ((v - min) / range) * (H - 32);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = col;
  ctx.lineWidth = 2;
  ctx.stroke();
  data.forEach((v, i) => {
    const x = i * stepX;
    const y = H - 22 - ((v - min) / range) * (H - 32);
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    ctx.fill();
    if (labels[i] && (i % Math.ceil(labels.length / 6) === 0 || labels.length <= 8)) {
      ctx.fillStyle = mutedCol;
      ctx.font = '9px Cairo, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(labels[i], x, H - 6);
    }
  });
}

function drawBarChart(canvas, data, labels, color) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0) return;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  const W = rect.width, H = rect.height;
  ctx.clearRect(0, 0, W, H);
  if (!data.length) return;
  const max = Math.max(...data, 1);
  const barSpace = W / data.length;
  const barW = Math.max(4, barSpace * 0.65);
  const col = color || getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  const mutedCol = getComputedStyle(document.documentElement).getPropertyValue('--muted').trim();
  data.forEach((v, i) => {
    const h = (v / max) * (H - 28);
    const x = i * barSpace + (barSpace - barW) / 2;
    const y = H - 22 - h;
    ctx.fillStyle = col;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(x, y, barW, h);
    ctx.globalAlpha = 1;
    if (labels[i] && (i % Math.ceil(labels.length / 8) === 0 || labels.length <= 10)) {
      ctx.fillStyle = mutedCol;
      ctx.font = '9px Cairo, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(labels[i], x + barW / 2, H - 6);
    }
  });
}

function renderDashboardCharts() {
  const days = 30;
  const dailySales = {};
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    dailySales[d.toISOString().slice(0, 10)] = 0;
  }
  state.invoices.forEach(i => {
    if (i.status !== 'cancelled' && dailySales[i.date] !== undefined)
      dailySales[i.date] += num(i.total);
  });
  const labels = Object.keys(dailySales).map(d => d.slice(5));
  drawLineChart(document.getElementById('chartSales'), Object.values(dailySales), labels);
}

/* =====================================================
   AGING REPORT (أعمار الديون)
   ===================================================== */
function renderAgingReport() {
  const today = new Date();
  const byCustomer = {};

  state.customers.forEach(c => {
    const bal = Calc.customerBalance(c.id);
    if (bal <= 0) return;
    byCustomer[c.id] = { name: c.name, b30: 0, b60: 0, b90: 0, b90plus: 0, total: bal };
  });

  state.invoices.filter(i => i.status !== 'cancelled' && num(i.total) - num(i.paid) > 0).forEach(inv => {
    if (!byCustomer[inv.customerId]) return;
    const rem = num(inv.total) - num(inv.paid);
    const days = Math.floor((today - new Date(inv.date)) / 86400000);
    if (days <= 30) byCustomer[inv.customerId].b30 += rem;
    else if (days <= 60) byCustomer[inv.customerId].b60 += rem;
    else if (days <= 90) byCustomer[inv.customerId].b90 += rem;
    else byCustomer[inv.customerId].b90plus += rem;
  });

  const rows = Object.values(byCustomer);
  if (!rows.length) return '';

  return `<div class="panel">
    <div class="panel-head"><h3>${t('reports.agingTitle')}</h3></div>
    <div class="table-wrap"><table>
      <thead><tr>
        <th>${t('customers.name')}</th>
        <th>${t('reports.aging0_30')}</th>
        <th>${t('reports.aging31_60')}</th>
        <th>${t('reports.aging61_90')}</th>
        <th>${t('reports.aging91plus')}</th>
        <th>${t('common.total')}</th>
      </tr></thead>
      <tbody>
        ${rows.map(r => `<tr>
          <td><b>${esc(r.name)}</b></td>
          <td class="${r.b30 > 0 ? 'text-success' : 'text-muted'}">${r.b30 > 0 ? fmt(r.b30) : '-'}</td>
          <td class="${r.b60 > 0 ? 'text-warning' : 'text-muted'}">${r.b60 > 0 ? fmt(r.b60) : '-'}</td>
          <td class="${r.b90 > 0 ? 'text-danger' : 'text-muted'}">${r.b90 > 0 ? fmt(r.b90) : '-'}</td>
          <td class="${r.b90plus > 0 ? 'text-danger overdue' : 'text-muted'}">${r.b90plus > 0 ? fmt(r.b90plus) : '-'}</td>
          <td><b>${fmt(r.total)}</b></td>
        </tr>`).join('')}
      </tbody>
    </table></div>
  </div>`;
}