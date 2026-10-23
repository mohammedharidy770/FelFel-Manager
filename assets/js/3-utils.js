/* =====================================================================
   3-utils.js — الأدوات المساعدة (Utilities)
   ===================================================================== */

/* ========== Utils ========== */
const uid = (p='id') => p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2,6);
const num = v => { const n = Number(v); return isFinite(n) ? n : 0; };
const fmt = n => num(n).toLocaleString(LANG === 'ar' ? 'ar-EG' : 'en-US', { maximumFractionDigits: 2 }) + ' ' + t('currency');
const fmtNum = n => num(n).toLocaleString(LANG === 'ar' ? 'ar-EG' : 'en-US', { maximumFractionDigits: 2 });
const todayISO = () => new Date().toISOString().slice(0, 10);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const withinRange = (d, f, to) => (!f && !to) || (d >= (f||'') && d <= (to||'9999-12-31'));

/* ========== Sound ========== */
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;
function playSound(type) {
  if (!SOUND_ON) return;
  try {
    if (!audioCtx) audioCtx = new AudioCtx();
    const ctx = audioCtx;
    const now = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    if (type === 'click') { o.frequency.value = 800; g.gain.value = 0.03; o.type = 'sine'; }
    else if (type === 'success') {
      o.frequency.value = 660; o.type = 'triangle'; g.gain.value = 0.04;
      o.frequency.setValueAtTime(660, now);
      o.frequency.exponentialRampToValueAtTime(990, now + 0.15);
    } else if (type === 'error') { o.frequency.value = 220; o.type = 'sawtooth'; g.gain.value = 0.04; }
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
    o.start(now); o.stop(now + 0.3);
  } catch(e) {}
}
const Sound = { click: () => playSound('click'), success: () => playSound('success'), error: () => playSound('error') };

/* ========== Confetti ========== */
let confettiParticles = [];
let confettiRAF = null;
function fireConfetti() {
  const canvas = document.getElementById('confetti');
  if (!canvas) return;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  canvas.classList.add('active');
  const colors = ['#0FB864','#16DD79','#0A9A52','#34E68C','#046A38','#16DD79'];
  confettiParticles = [];
  for (let i = 0; i < 100; i++) {
    confettiParticles.push({
      x: Math.random() * canvas.width,
      y: -10 - Math.random() * 40,
      vx: (Math.random() - 0.5) * 6,
      vy: 2 + Math.random() * 4,
      size: 5 + Math.random() * 6,
      color: colors[Math.floor(Math.random() * colors.length)],
      rot: Math.random() * 360,
      vr: (Math.random() - 0.5) * 12,
    });
  }
  if (confettiRAF) cancelAnimationFrame(confettiRAF);
  let frames = 0;
  const ctx = canvas.getContext('2d');
  function loop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    confettiParticles.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.rot += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot * Math.PI / 180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
    });
    confettiParticles = confettiParticles.filter(p => p.y < canvas.height + 20);
    frames++;
    if (confettiParticles.length > 0 && frames < 180) confettiRAF = requestAnimationFrame(loop);
    else { canvas.classList.remove('active'); ctx.clearRect(0, 0, canvas.width, canvas.height); }
  }
  loop();
}

/* ========== Toast ========== */
function toast(msg, type='success') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'toast show ' + type;
  clearTimeout(el._to);
  el._to = setTimeout(() => { el.className = 'toast'; }, 2800);
  if (type === 'success') Sound.success(); else if (type === 'error') Sound.error();
}

/* ========== Modal ========== */
function openModal(title, bodyHTML, footerHTML) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHTML;
  document.getElementById('modalFooter').innerHTML = footerHTML || '';
  document.getElementById('modal').classList.remove('hidden');
  document.body.classList.add('modal-open');
}
function closeModal() {
  document.getElementById('modal').classList.add('hidden');
  document.body.classList.remove('modal-open');
}
function confirmDialog(title, msg, onYes) {
  openModal(title, `<p>${esc(msg)}</p>`,
    `<button class="btn btn-secondary" onclick="closeModal()">${t('confirm.no')}</button>
     <button class="btn btn-danger" id="__confirmYes">${t('confirm.yes')}</button>`);
  document.getElementById('__confirmYes').onclick = () => { closeModal(); onYes(); };
}

/* ========== Cash Movement ========== */
function addCashMovement(m) {
  state.cashMovements.push({ id: uid('cash'), ...m });
}

/* ========== Optimized: updateCashPill ========== */
let __cashPillPending = false;
function updateCashPill() {
  if (__cashPillPending) return;
  __cashPillPending = true;
  requestAnimationFrame(() => {
    const el = document.getElementById('cashPillText');
    if (el) el.textContent = t('cashbox.current') + ': ' + fmt(Calc.cashBalance());
    __cashPillPending = false;
  });
}

/* ========== Optimized: staggerStats ========== */
function staggerStats() {
  const cards = document.querySelectorAll('.stat-card');
  const len = Math.min(cards.length, 20);
  for (let i = 0; i < len; i++) {
    cards[i].style.animationDelay = (i * 0.025) + 's';
  }
}

/* ========== Cursor Glow ========== */
function setupCursorGlow() {
  const glow = document.getElementById('cursorGlow');
  if (!glow) return;
  let mx = -200, my = -200, ticking = false;
  window.addEventListener('mousemove', e => {
    mx = e.clientX; my = e.clientY;
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(() => {
        glow.style.transform = `translate3d(${mx - 200}px, ${my - 200}px, 0)`;
        glow.classList.add('visible');
        ticking = false;
      });
    }
  }, { passive: true });
  document.addEventListener('mouseleave', () => glow.classList.remove('visible'));
}