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
    // Non loggato → apri dropdown login
    document.getElementById('loginWrap')?.classList.add('open');
    cpShowWishlistToast('Accedi per salvare i preferiti');
    return;
  }

  const list = await cpGetWishlist();
  const inList = list.includes(sku);

  if (inList) {
    // Rimuovi
    await window.sb.from('wishlist').delete()
      .eq('user_id', user.id)
      .eq('prodotto_sku', sku);
    _wishlistCache = list.filter(s => s !== sku);
    if (btn) { btn.textContent = '♡'; btn.classList.remove('active'); }
    cpShowWishlistToast('Rimosso dai preferiti');
  } else {
    // Aggiungi
    await window.sb.from('wishlist').insert([{ user_id: user.id, prodotto_sku: sku }]);
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
//  BOOT
// ═══════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  cpUpdateCartBadge();
  // Evidenzia wishlist dopo che auth.js ha caricato la sessione
  setTimeout(async () => {
    await cpHighlightWishlistItems();
    await cpUpdateWishlistBadge();
  }, 600);
});
