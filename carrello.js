// ══════════════════════════════════════════════════════
//  CardPioneer — Carrello & Wishlist Manager
//  Includi in tutte le pagine DOPO auth.js:
//  <script src="carrello.js"></script>
// ══════════════════════════════════════════════════════

const CART_KEY = 'cp_cart';

// ═══════════════════════════════════════
//  CARRELLO (localStorage)
// ═══════════════════════════════════════
function cpGetCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; }
  catch(e) { return []; }
}

function cpSaveCart(items) {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
  cpUpdateCartBadge();
}

function cpUpdateCartBadge() {
  const tot = cpGetCart().reduce((s, i) => s + (i.qty || 1), 0);
  document.querySelectorAll('.cp-cart-badge').forEach(el => el.textContent = tot);
  // Aggiorna anche badge navbar con id specifico
  const nb = document.getElementById('cartBadgeNav');
  if (nb) nb.textContent = tot;
}

window.addToCart = function(product) {
  const cart     = cpGetCart();
  const existing = cart.find(i => i.sku === product.sku);
  if (existing) {
    if (existing.qty < (product.disponibile || 99)) existing.qty++;
  } else {
    cart.push({ ...product, qty: 1 });
  }
  cpSaveCart(cart);
  cpShowCartToast(product.nome || product.name || '');
};

function cpShowCartToast(nome) {
  let t = document.getElementById('cp-cart-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'cp-cart-toast';
    t.style.cssText = [
      'position:fixed;bottom:24px;right:24px;z-index:9999',
      'background:#1a0a2e;color:#fff',
      'padding:12px 20px;border-radius:10px',
      'font-size:13px;font-weight:500',
      'box-shadow:0 8px 24px rgba(0,0,0,0.25)',
      'display:flex;align-items:center;gap:10px',
      'transition:opacity 0.3s;opacity:0',
      'font-family:Inter,sans-serif',
      'max-width:320px'
    ].join(';');
    document.body.appendChild(t);
  }
  t.innerHTML = `✅ <span><strong style="color:#fff">${escHtml(nome)}</strong> aggiunto al carrello — <a href="carrello.html" style="color:#f5e642;font-weight:600">Vai al carrello</a></span>`;
  t.style.opacity = '1';
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.style.opacity = '0'; }, 3500);
}

// ═══════════════════════════════════════
//  WISHLIST (Supabase)
// ═══════════════════════════════════════
// Cache locale wishlist per evitare troppe query
let _wishlistCache = null;

async function cpGetWishlist() {
  if (!window.sb) return [];
  const user = window.getCurrentUser?.();
  if (!user) return [];
  if (_wishlistCache) return _wishlistCache;
  const { data } = await window.sb
    .from('wishlist')
    .select('prodotto_sku')
    .eq('user_id', user.id);
  _wishlistCache = (data || []).map(r => r.prodotto_sku);
  return _wishlistCache;
}

async function cpToggleWishlist(sku, btn) {
  if (!window.sb) return;
  const user = window.getCurrentUser?.();
  if (!user) {
    document.getElementById('loginWrap')?.classList.add('open');
    cpShowWishlistToast('Accedi per salvare i preferiti');
    return;
  }

  const list = await cpGetWishlist();
  const inList = list.includes(sku);

  if (inList) {
    await window.sb.from('wishlist').delete()
      .eq('user_id', user.id)
      .eq('prodotto_sku', sku);
    _wishlistCache = list.filter(s => s !== sku);
    if (btn) { btn.textContent = '♡'; btn.classList.remove('active'); }
    cpShowWishlistToast('Rimosso dai preferiti');
  } else {
    // Controlla disponibilità attuale per salvare era_disponibile
    let disponibile = true;
    try {
      const { data } = await window.sb.from('prodotti')
        .select('disponibile').eq('sku', sku).single();
      disponibile = (data?.disponibile || 0) > 0;
    } catch(e) {}

    await window.sb.from('wishlist').insert([{
      user_id: user.id,
      prodotto_sku: sku,
      era_disponibile: disponibile,
    }]);
    _wishlistCache = [...list, sku];
    if (btn) { btn.textContent = '♥'; btn.classList.add('active'); }
    cpShowWishlistToast('Aggiunto ai preferiti ♥');
  }

  cpUpdateWishlistBadge();
}

function cpShowWishlistToast(msg) {
  let t = document.getElementById('cp-wish-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'cp-wish-toast';
    t.style.cssText = [
      'position:fixed;bottom:72px;right:24px;z-index:9999',
      'background:#1a0a2e;color:#fff',
      'padding:10px 18px;border-radius:10px',
      'font-size:12px;font-weight:500',
      'box-shadow:0 4px 16px rgba(0,0,0,0.2)',
      'transition:opacity 0.3s;opacity:0',
      'font-family:Inter,sans-serif'
    ].join(';');
    document.body.appendChild(t);
  }
  t.textContent   = msg;
  t.style.opacity = '1';
  clearTimeout(t._wTimer);
  t._wTimer = setTimeout(() => { t.style.opacity = '0'; }, 2500);
}

async function cpUpdateWishlistBadge() {
  const list = await cpGetWishlist();
  document.querySelectorAll('.cp-wish-badge').forEach(el => el.textContent = list.length || '0');
}

// Colora i cuori già salvati quando si carica una pagina con prodotti
async function cpHighlightWishlistItems() {
  const list = await cpGetWishlist();
  if (!list.length) return;
  document.querySelectorAll('[data-wish-sku]').forEach(btn => {
    if (list.includes(btn.dataset.wishSku)) {
      btn.textContent = '♥';
      btn.classList.add('active');
    }
  });
}

// ═══════════════════════════════════════
//  CSS WISHLIST BUTTON
// ═══════════════════════════════════════
(function injectWishCSS() {
  if (document.getElementById('cp-wish-css')) return;
  const s = document.createElement('style');
  s.id = 'cp-wish-css';
  s.textContent = `
    .cp-wish-btn {
      position:absolute;top:7px;right:7px;
      width:28px;height:28px;
      background:rgba(255,255,255,0.92);
      border:1px solid rgba(0,0,0,0.08);
      border-radius:50%;
      display:flex;align-items:center;justify-content:center;
      font-size:14px;cursor:pointer;
      opacity:0;transition:opacity 0.2s, color 0.2s, transform 0.15s;
      color:#aaa;
      z-index:10;
    }
    .cp-wish-btn:hover { transform:scale(1.15); color:#e8107a !important; }
    .cp-wish-btn.active { color:#e8107a; opacity:1 !important; }
    .pcard:hover .cp-wish-btn,
    .mcard:hover .cp-wish-btn { opacity:1; }
  `;
  document.head.appendChild(s);
})();

// ═══════════════════════════════════════
//  UTILITY
// ═══════════════════════════════════════
function escHtml(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ═══════════════════════════════════════
//  NOTIFICA WISHLIST — carte diventate disponibili
// ═══════════════════════════════════════
async function cpCheckWishlistDisponibilita() {
  if (!window.sb) return;
  const user = window.getCurrentUser?.();
  if (!user) return;

  try {
    // Prendi solo le carte che erano NON disponibili quando aggiunte
    const { data: wishItems } = await window.sb
      .from('wishlist')
      .select('prodotto_sku, era_disponibile')
      .eq('user_id', user.id)
      .eq('era_disponibile', false);

    if (!wishItems?.length) return;

    const skus = wishItems.map(w => w.prodotto_sku);

    // Controlla quali sono ora disponibili
    const { data: prodotti } = await window.sb
      .from('prodotti')
      .select('sku, nome, disponibile')
      .in('sku', skus)
      .gt('disponibile', 0);

    if (!prodotti?.length) return;

    // Aggiorna era_disponibile a true per quelle ora disponibili
    const skusDisponibili = prodotti.map(p => p.sku);
    await window.sb.from('wishlist')
      .update({ era_disponibile: true })
      .eq('user_id', user.id)
      .in('prodotto_sku', skusDisponibili);

    // Mostra notifica
    const n = prodotti.length;
    const msg = n === 1
      ? `🟢 "${prodotti[0].nome}" nella tua wishlist è ora disponibile!`
      : `🟢 ${n} carte nella tua wishlist sono ora disponibili!`;

    cpShowWishlistNotifica(msg);
  } catch(e) {}
}

function cpShowWishlistNotifica(msg) {
  const id = 'cp-wish-notifica';
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    el.style.cssText = `
      position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
      background:#059669;color:#fff;
      font-family:system-ui,sans-serif;font-size:13px;font-weight:600;
      padding:13px 22px;border-radius:10px;
      box-shadow:0 4px 20px rgba(0,0,0,.18);
      z-index:9999;cursor:pointer;
      display:flex;align-items:center;gap:12px;
      max-width:90vw;text-align:center;
      animation:slideUp .3s ease;
    `;
    el.innerHTML = `<span id="cp-wish-notifica-text"></span>
      <a href="wishlist.html" style="color:#fff;text-decoration:underline;white-space:nowrap;font-size:12px">Vedi →</a>
      <button onclick="document.getElementById('cp-wish-notifica').remove()"
        style="background:none;border:none;color:#fff;font-size:18px;cursor:pointer;padding:0;margin-left:4px;line-height:1">×</button>`;
    document.body.appendChild(el);

    // Auto-remove dopo 8 secondi
    setTimeout(() => el?.remove(), 8000);
  }
  document.getElementById('cp-wish-notifica-text').textContent = msg;

  // Aggiungi keyframe se non esiste
  if (!document.getElementById('cp-wish-anim')) {
    const style = document.createElement('style');
    style.id = 'cp-wish-anim';
    style.textContent = '@keyframes slideUp{from{opacity:0;transform:translateX(-50%) translateY(20px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}';
    document.head.appendChild(style);
  }
}

// ═══════════════════════════════════════
//  BOOT
// ═══════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  cpUpdateCartBadge();
  // Unica chiamata wishlist dopo auth — delay 1.2s per non sovraccaricare Supabase
  setTimeout(async () => {
    const user = window.getCurrentUser?.();
    if (!user) return;
    const list = await cpGetWishlist();
    // Evidenzia cuori
    if (list.length) {
      document.querySelectorAll('[data-wish-sku]').forEach(btn => {
        if (list.includes(btn.dataset.wishSku)) {
          btn.textContent = '♥';
          btn.classList.add('active');
        }
      });
    }
    // Badge wishlist — senza contatore (solo ♡)
    document.querySelectorAll('.cp-wish-badge').forEach(el => el.textContent = '');
    // Controlla carte diventate disponibili
    cpCheckWishlistDisponibilita();
  }, 1200);
});
