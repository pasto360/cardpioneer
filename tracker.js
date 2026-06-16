// ══════════════════════════════════════════════════════
//  CardPioneer — Page Tracker
//  Includi in tutte le pagine DOPO auth.js:
//  <script src="tracker.js"></script>
// ══════════════════════════════════════════════════════
(function() {
  const PAGE_NAMES = {
    'index.html':          'Home',
    'acquista.html':       'Market',
    'carrello.html':       'Carrello',
    'checkout.html':       'Checkout',
    'conferma.html':       'Conferma ordine',
    'registrati.html':     'Registrazione',
    'profilo.html':        'Profilo',
    'ordini.html':         'I miei ordini',
    'wishlist.html':       'Wishlist',
    'mycollection.html':   'My Collection',
    'come-funziona.html':  'Come funziona',
    'classificazione.html':'Classificazione',
    'utility.html':        'FAQ',
    'vendi.html':          'Vendi',
    'contatti.html':       'Contatti',
    'privacy.html':        'Privacy Policy',
    'cookie.html':         'Cookie Policy',
    'norme-legali.html':   'Norme legali',
    'admin.html':          null, // non tracciare
  };

  // Session ID univoco per sessione browser (si resetta alla chiusura del tab)
  function getSessionId() {
    let sid = sessionStorage.getItem('cp_session_id');
    if (!sid) {
      sid = 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
      sessionStorage.setItem('cp_session_id', sid);
    }
    return sid;
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const file   = window.location.pathname.split('/').pop() || 'index.html';
    const nome   = PAGE_NAMES[file];
    if (nome === null) return; // admin — non tracciare
    const pagina = nome || file;

    const tryTrack = async (attempts) => {
      if (!window.sb) {
        if (attempts < 10) setTimeout(() => tryTrack(attempts + 1), 300);
        return;
      }
      try {
        const sessionId = getSessionId();
        // Recupera user_id se loggato
        const { data: { user } } = await window.sb.auth.getUser();
        await window.sb.from('visite').insert([{
          pagina,
          session_id: sessionId,
          user_id:    user?.id || null,
        }]);
      } catch(e) { /* silenzioso */ }
    };
    tryTrack(0);
  });
})();
