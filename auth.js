// ═══════════════════════════════════════════════════════════
//  CardPioneer — Auth Manager
//  Includi questo file in tutte le pagine HTML:
//  <script src="auth.js"></script>
//  DOPO il tag <script src="supabase-js@2">
// ═══════════════════════════════════════════════════════════

const SUPABASE_URL = 'https://nzjwpdbljfwrspmepoqo.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im56andwZGJsamZ3cnNwbWVwb3FvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzNjM3OTIsImV4cCI6MjA5NTkzOTc5Mn0.-pYvXNjs-63OszfdMbdjiD2Harvgvl9L1D9UjgXa_Gs';

// Client Supabase globale — usato anche da acquista.html, index.html ecc.
window.sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ═══════════════════════════════════════════════════════════
//  STATO SESSIONE
// ═══════════════════════════════════════════════════════════
let currentUser = null;

// Aggiorna navbar in base allo stato login
function updateNavbar(user) {
  currentUser = user;
  const loginWrap = document.getElementById('loginWrap');
  if (!loginWrap) return;

  if (user) {
    // Utente loggato — sostituisce il dropdown con nome + logout
    const nome = user.user_metadata?.nome || user.email.split('@')[0];
    loginWrap.innerHTML = `
      <div class="cp-user-menu" id="userMenu">
        <button class="cp-login-btn" onclick="document.getElementById('userMenu').classList.toggle('open')">
          <svg viewBox="0 0 24 24" style="width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:2">
            <circle cx="12" cy="8" r="4"/>
            <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
          </svg>
          ${escHtml(nome)}
        </button>
        <div class="cp-login-dropdown" style="min-width:200px">
          <div style="font-family:var(--fu);font-size:12px;color:var(--dark);margin-bottom:4px;letter-spacing:-0.01em">
            ${escHtml(user.user_metadata?.nome || '')} ${escHtml(user.user_metadata?.cognome || '')}
          </div>
          <div style="font-size:11px;color:var(--muted);margin-bottom:16px">${escHtml(user.email)}</div>
          <hr style="border:none;border-top:1px solid var(--border);margin-bottom:12px">
          <div style="display:flex;flex-direction:column;gap:8px">
            <a href="profilo.html" style="font-size:12px;color:var(--dark);font-weight:500">👤 Il mio profilo</a>
            <a href="ordini.html"  style="font-size:12px;color:var(--dark);font-weight:500">📦 I miei ordini</a>
          </div>
          <hr style="border:none;border-top:1px solid var(--border);margin:12px 0">
          <button onclick="handleLogout()"
            style="width:100%;font-family:var(--fu);font-size:10px;font-weight:700;
                   background:rgba(232,16,122,0.08);color:var(--pink);border:1px solid rgba(232,16,122,0.2);
                   padding:9px;border-radius:8px;cursor:pointer;letter-spacing:-0.01em">
            Esci
          </button>
        </div>
      </div>`;

    // Click fuori chiude menu utente
    document.addEventListener('click', function closeMenu(e) {
      const m = document.getElementById('userMenu');
      if (m && !m.contains(e.target)) m.classList.remove('open');
    });

  } else {
    // Non loggato — mostra il dropdown login standard
    loginWrap.innerHTML = `
      <button class="cp-login-btn" onclick="document.getElementById('loginWrap').classList.toggle('open')">
        <svg viewBox="0 0 24 24" style="width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:2">
          <circle cx="12" cy="8" r="4"/>
          <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
        </svg>
        Accedi
      </button>
      <div class="cp-login-dropdown">
        <div class="cp-login-title">Accedi a CardPioneer</div>
        <div class="cp-login-form" id="loginForm">
          <div class="cp-login-field">
            <label class="cp-login-label">Email</label>
            <input type="email" id="loginEmail" class="cp-login-input"
                   placeholder="tua@email.it"
                   onkeydown="if(event.key==='Enter')handleLogin()">
          </div>
          <div class="cp-login-field">
            <label class="cp-login-label">Password</label>
            <input type="password" id="loginPassword" class="cp-login-input"
                   placeholder="••••••••"
                   onkeydown="if(event.key==='Enter')handleLogin()">
          </div>
          <div id="loginError" style="display:none;font-size:11px;color:#f87171;margin-top:4px;padding:6px 0"></div>
          <div class="cp-login-forgot" onclick="handleForgotPassword()">Password dimenticata?</div>
          <button class="cp-login-submit" id="loginBtn" onclick="handleLogin()">Accedi</button>
        </div>
        <div class="cp-login-register">Non hai un account? <a href="registrati.html">Registrati</a></div>
      </div>`;

    // Click fuori chiude dropdown login
    document.addEventListener('click', function closeLogin(e) {
      const w = document.getElementById('loginWrap');
      if (w && !w.contains(e.target)) w.classList.remove('open');
    });
  }
}

// ═══════════════════════════════════════════════════════════
//  LOGIN
// ═══════════════════════════════════════════════════════════
async function handleLogin() {
  const email    = document.getElementById('loginEmail')?.value.trim();
  const password = document.getElementById('loginPassword')?.value;
  const errEl    = document.getElementById('loginError');
  const btn      = document.getElementById('loginBtn');

  if (!email || !password) {
    if (errEl) { errEl.style.display='block'; errEl.textContent='Inserisci email e password.'; }
    return;
  }

  if (btn) { btn.disabled=true; btn.textContent='⏳ Accesso...'; }

  try {
    const { data, error } = await window.sb.auth.signInWithPassword({ email, password });
    if (error) throw error;

    // Login ok — la navbar si aggiorna via onAuthStateChange
    document.getElementById('loginWrap')?.classList.remove('open');

  } catch(err) {
    let msg = 'Credenziali non valide.';
    if (err.message?.includes('Email not confirmed')) {
      msg = 'Conferma prima la tua email — controlla la posta.';
    } else if (err.message?.includes('Invalid login')) {
      msg = 'Email o password errati.';
    }
    if (errEl) { errEl.style.display='block'; errEl.textContent=msg; }
    if (btn) { btn.disabled=false; btn.textContent='Accedi'; }
  }
}

// ═══════════════════════════════════════════════════════════
//  LOGOUT
// ═══════════════════════════════════════════════════════════
async function handleLogout() {
  await window.sb.auth.signOut();
  // onAuthStateChange aggiorna la navbar automaticamente
}

// ═══════════════════════════════════════════════════════════
//  PASSWORD DIMENTICATA
// ═══════════════════════════════════════════════════════════
async function handleForgotPassword() {
  const email = document.getElementById('loginEmail')?.value.trim();
  if (!email) {
    const errEl = document.getElementById('loginError');
    if (errEl) { errEl.style.display='block'; errEl.textContent='Inserisci la tua email sopra.'; }
    return;
  }
  try {
    await window.sb.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/reset-password.html'
    });
    const errEl = document.getElementById('loginError');
    if (errEl) {
      errEl.style.display='block';
      errEl.style.color='#34d399';
      errEl.textContent='Email inviata! Controlla la tua casella.';
    }
  } catch(e) { console.error(e); }
}

// ═══════════════════════════════════════════════════════════
//  INIT — controlla sessione al caricamento pagina
// ═══════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  // Controlla se c'è già una sessione attiva
  const { data: { session } } = await window.sb.auth.getSession();
  updateNavbar(session?.user || null);

  // Ascolta cambiamenti di stato (login/logout)
  window.sb.auth.onAuthStateChange((_event, session) => {
    updateNavbar(session?.user || null);
  });
});

// ═══════════════════════════════════════════════════════════
//  UTILITY
// ═══════════════════════════════════════════════════════════
function escHtml(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Esponi currentUser per altre pagine
window.getCurrentUser = () => currentUser;
