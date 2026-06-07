// ══════════════════════════════════════════════════════
//  CardPioneer — Page Tracker
//  Includi in tutte le pagine DOPO auth.js:
//  <script src="tracker.js"></script>
// ══════════════════════════════════════════════════════
(function() {
  // Mappa nome pagina leggibile
  const PAGE_NAMES = {
    'index.html':          'Home',
    'acquista.html':       'Market',
    'carrello.html':       'Carrello',
    'checkout.html':       'Checkout',
    'conferma.html':       'Conferma ordine',
    'registrati.html':     'Registrazione',
    'profilo.html':        'Profilo',
    'ordini.html':         'I miei ordini',
    'come-funziona.html':  'Come funziona',
    'classificazione.html':'Classificazione',
    'utility.html':        'FAQ',
    'vendi.html':          'Vendi',
    'contatti.html':       'Contatti',
    'privacy.html':        'Privacy Policy',
    'cookie.html':         'Cookie Policy',
    'norme-legali.html':   'Norme legali',
    'admin.html':          null, // non tracciare admin
  };

  document.addEventListener('DOMContentLoaded', async () => {
    // Aspetta che window.sb sia disponibile
    const tryTrack = async (attempts) => {
      if (!window.sb) {
        if (attempts < 10) setTimeout(() => tryTrack(attempts + 1), 300);
        return;
      }

      // Identifica pagina corrente
      const file  = window.location.pathname.split('/').pop() || 'index.html';
      const nome  = PAGE_NAMES[file];
      if (nome === null) return; // pagina admin — non tracciare
      const pagina = nome || file;

      try {
        await window.sb.from('visite').insert([{ pagina }]);
      } catch(e) { /* silenzioso */ }
    };

    tryTrack(0);
  });
})();
