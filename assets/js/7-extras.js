/* =====================================================================
   7-extras.js — ميزات إضافية
   - تنبيه النسخ الاحتياطي
   - تثبيت PWA
   - البيانات التجريبية
   ===================================================================== */

(function() {
  'use strict';

  /* ========== Backup Reminder ========== */
  const BACKUP_KEY = 'ff_last_backup';

  function getDaysSinceBackup() {
    const last = localStorage.getItem(BACKUP_KEY);
    if (!last) return 999;
    const diff = Date.now() - new Date(last).getTime();
    return Math.floor(diff / 86400000);
  }

  function recordBackup() {
    localStorage.setItem(BACKUP_KEY, new Date().toISOString());
    hideBackupBanner();
    toast(LANG === 'ar' ? 'تم تسجيل النسخة الاحتياطية ✓' : 'Backup recorded ✓', 'success');
  }

  function renderBackupBanner() {
    const el = document.getElementById('backupBanner');
    if (!el) return;
    const days = getDaysSinceBackup();
    if (days < 7) { hideBackupBanner(); return; }
    const isDanger = days >= 14;
    el.className = 'backup-banner show' + (isDanger ? ' danger' : '');
    const msg = days >= 999
      ? (LANG === 'ar' ? 'لم تعمل نسخة احتياطية أبدًا — بياناتك في خطر!' : 'Never backed up — your data is at risk!')
      : (LANG === 'ar' ? `مر ${days} يوم على آخر نسخة — اعمل نسخة الآن!` : `${days} days since last backup — backup now!`);
    el.innerHTML = `
      <span class="b-icon">${isDanger ? '🚨' : '⚠️'}</span>
      <span class="b-text">${msg}</span>
      <button class="b-btn" onclick="Extras.quickBackup()">${LANG === 'ar' ? 'نسخة الآن' : 'Backup Now'}</button>
      <button class="b-close" onclick="Extras.hideBackupBanner()">✕</button>
    `;
  }

  function hideBackupBanner() {
    const el = document.getElementById('backupBanner');
    if (el) el.classList.remove('show');
  }

  function quickBackup() {
    if (typeof exportFullJSON === 'function') {
      exportFullJSON();
      recordBackup();
    }
  }

  /* ========== PWA Install ========== */
  let deferredPrompt = null;
  function setupPWA() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      const btn = document.getElementById('pwaInstallBtn');
      if (btn) btn.classList.add('show');
    });
    window.addEventListener('appinstalled', () => {
      deferredPrompt = null;
      const btn = document.getElementById('pwaInstallBtn');
      if (btn) btn.classList.remove('show');
      toast(LANG === 'ar' ? 'تم التثبيت ✓' : 'Installed ✓', 'success');
    });
    // Create button
    if (!document.getElementById('pwaInstallBtn')) {
      const btn = document.createElement('button');
      btn.id = 'pwaInstallBtn';
      btn.className = 'pwa-install-btn';
      btn.textContent = LANG === 'ar' ? '⬇ تثبيت التطبيق' : '⬇ Install App';
      btn.onclick = () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(() => { deferredPrompt = null; btn.classList.remove('show'); });
      };
      document.body.appendChild(btn);
    }
  }

  /* ========== Demo Data ========== */
  function loadDemoData() {
    if (!confirm(LANG === 'ar' ? 'سيتم إضافة بيانات تجريبية. البيانات الحالية لن تُمسح. متابعة؟' : 'Demo data will be added. Current data preserved. Continue?')) return;
    const today = new Date();
    const dAgo = (n) => {
      const d = new Date(today); d.setDate(d.getDate() - n);
      return d.toISOString().slice(0, 10);
    };

    // 3 customers
    const c1 = { id: uid('cus'), name: 'مطعم الكبدة', phone: '01000000001', address: 'شارع الجيش', defaultPrice: 0 };
    const c2 = { id: uid('cus'), name: 'محل المشويات', phone: '01000000002', address: 'الميدان', defaultPrice: 0 };
    const c3 = { id: uid('cus'), name: 'مطعم الشرق', phone: '01000000003', address: 'المنطقة الصناعية', defaultPrice: 0 };
    state.customers.push(c1, c2, c3);

    // 2 workers
    const w1 = { id: uid('wrk'), name: 'محمد', dailyWage: 150, active: true };
    const w2 = { id: uid('wrk'), name: 'علي', dailyWage: 120, active: true };
    state.workers.push(w1, w2);

    // 2 batches
    const b1 = {
      id: uid('batch'), productId: 'prod_pepper', date: dAgo(10),
      unitCount: 3, unitPrice: 200, totalPurchase: 600, supplier: 'عم أحمد',
      rawWeight: 60, netWeight: 51, waste: 9, availableQty: 51, soldQty: 0,
      processingCost: 100, unitCost: 0, notes: ''
    };
    b1.unitCost = (600 + 100) / 51;
    const b2 = {
      id: uid('batch'), productId: 'prod_torshi', date: dAgo(7),
      unitCount: 2, unitPrice: 120, totalPurchase: 240, supplier: 'الموزع',
      rawWeight: 0, netWeight: 0, waste: 0, availableQty: 2, soldQty: 0,
      processingCost: 0, unitCost: 0, notes: 'جردل 10 كجم'
    };
    b2.unitCost = 240 / 2;
    state.batches.push(b1, b2);

    // 3 work days
    state.workDays.push(
      { id: uid('wd'), workerId: w1.id, amount: 150, date: dAgo(5), notes: '' },
      { id: uid('wd'), workerId: w2.id, amount: 120, date: dAgo(5), notes: '' },
      { id: uid('wd'), workerId: w1.id, amount: 150, date: dAgo(3), notes: '' }
    );

    // 2 invoices
    const inv1Items = [{ batchId: b1.id, qty: 20, price: 30 }];
    const inv1Total = 600;
    const inv1 = {
      id: uid('inv'), no: '0001', date: dAgo(5), customerId: c1.id,
      items: inv1Items, discount: 0, total: inv1Total, paid: 400,
      remaining: 200, method: 'partial', notes: '', status: 'active', dueDate: ''
    };
    b1.soldQty = 20;
    const inv2Items = [
      { batchId: b1.id, qty: 10, price: 28 },
      { batchId: b2.id, qty: 1, price: 200 }
    ];
    const inv2Total = 280 + 200;
    const inv2 = {
      id: uid('inv'), no: '0002', date: dAgo(2), customerId: c2.id,
      items: inv2Items, discount: 0, total: inv2Total, paid: inv2Total,
      remaining: 0, method: 'cash', notes: '', status: 'active', dueDate: ''
    };
    b1.soldQty += 10;
    b2.soldQty += 1;
    state.invoices.push(inv1, inv2);

    // Cash movements
    addCashMovement({ date: dAgo(10), type: 'inventory_purchase', category: 'فلفل', direction: 'out', amount: 600, method: 'cash', refId: b1.id });
    addCashMovement({ date: dAgo(7), type: 'inventory_purchase', category: 'مخلل طرشي', direction: 'out', amount: 240, method: 'cash', refId: b2.id });
    addCashMovement({ date: dAgo(5), type: 'sale', category: 'فاتورة', direction: 'in', amount: 400, method: 'cash', refId: inv1.id });
    addCashMovement({ date: dAgo(2), type: 'sale', category: 'فاتورة', direction: 'in', amount: inv2Total, method: 'cash', refId: inv2.id });

    state.auditLog.push({ id: uid('log'), date: today.toISOString().slice(0,10), action: 'settings', details: 'Demo data loaded' });
    saveState();
    toast(LANG === 'ar' ? 'تم تحميل البيانات التجريبية ✓' : 'Demo data loaded ✓', 'success');
    navigate('dashboard');
    updateCashPill();
  }

  function clearDemoData() {
    if (!confirm(LANG === 'ar' ? 'سيتم مسح كل البيانات نهائيًا. متأكد؟' : 'All data will be deleted. Sure?')) return;
    if (!confirm(LANG === 'ar' ? 'تأكيد أخير — لا يمكن التراجع!' : 'Final confirm — cannot undo!')) return;
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  }

  /* ========== Init extras ========== */
  function initExtras() {
    renderBackupBanner();
    setupPWA();
    // Check backup banner periodically
    setInterval(renderBackupBanner, 60 * 60 * 1000); // every hour
  }

  // Expose
  window.Extras = {
    renderBackupBanner, hideBackupBanner, quickBackup, recordBackup,
    loadDemoData, clearDemoData, setupPWA,
  };

  // Boot on ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initExtras);
  } else {
    setTimeout(initExtras, 100);
  }
})();