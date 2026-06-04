// ══════════════════════════════════════════════════════
//  CardPioneer — Cookie Consent Banner
//  Includi in tutte le pagine DOPO auth.js:
//  <script src="cookie-banner.js"></script>
// ══════════════════════════════════════════════════════

const CP_CONSENT_KEY = 'cp_cookie_consent';

function cpGetConsent()   { return localStorage.getItem(CP_CONSENT_KEY); }
function cpSetConsent(v)  { localStorage.setItem(CP_CONSENT_KEY, v); }

function cpLoadGoogleAds() {
  if (document.getElementById('cp-gads-script')) return;
  const s = document.createElement('script');
  s.id    = 'cp-gads-script';
  s.async = true;
  s.src   = 'https://www.googletagmanager.com/gtag/js?id=AW-18020745433';
  document.head.appendChild(s);
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  window.gtag = gtag;
  gtag('js', new Date());
  gtag('config', 'AW-18020745433');
}

function cpShowBanner() {
  if (document.getElementById('cp-cookie-banner')) return;

  const banner = document.createElement('div');
  banner.id = 'cp-cookie-banner';
  banner.style.cssText = `
    position:fixed;bottom:0;left:0;right:0;
    background:#1a0a2e;color:#fff;
    padding:14px 28px;z-index:99999;
    display:flex;align-items:center;
    justify-content:space-between;gap:16px;
    flex-wrap:wrap;
    box-shadow:0 -4px 24px rgba(0,0,0,0.25);
    font-family:'Inter',sans-serif;
  `;

  banner.innerHTML = `
    <p style="font-size:12px;color:rgba(255,255,255,0.65);margin:0;flex:1;min-width:200px;line-height:1.6">
      Utilizziamo cookie tecnici necessari al funzionamento del sito e, con il tuo consenso,
      cookie di terze parti per Google Ads.
      <a href="cookie.html" style="color:#f5e642;font-weight:600">Cookie Policy</a> —
      <a href="privacy.html" style="color:#f5e642;font-weight:600">Privacy Policy</a>
    </p>
    <div style="display:flex;gap:10px;flex-shrink:0">
      <button id="cp-cookie-reject"
        style="font-size:11px;font-weight:500;background:transparent;
               color:rgba(255,255,255,0.5);border:1px solid rgba(255,255,255,0.2);
               padding:9px 16px;border-radius:8px;cursor:pointer;font-family:inherit">
        Solo necessari
      </button>
      <button id="cp-cookie-accept"
        style="font-size:11px;font-weight:700;background:#f5e642;
               color:#1a0a2e;border:none;padding:10px 20px;
               border-radius:8px;cursor:pointer;font-family:inherit">
        Accetta tutti
      </button>
    </div>`;

  document.body.appendChild(banner);

  document.getElementById('cp-cookie-accept').addEventListener('click', () => {
    cpSetConsent('accepted');
    cpLoadGoogleAds();
    banner.remove();
  });

  document.getElementById('cp-cookie-reject').addEventListener('click', () => {
    cpSetConsent('rejected');
    banner.remove();
  });
}

// ── Boot ──
document.addEventListener('DOMContentLoaded', () => {
  const consent = cpGetConsent();
  if (!consent) {
    cpShowBanner();
  } else if (consent === 'accepted') {
    cpLoadGoogleAds();
  }
});
