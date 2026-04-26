// ============================================================
// Fish Smarter — Auth Sheet (js/auth-sheet.js)
// ============================================================
// Responsibilities:
//   - Intercept save actions when user is logged out
//   - Show / hide the auth bottom sheet
//   - Handle Google + email sign-in flows
//   - Show one-question onboarding after sign-in
//
// What this file does NOT do:
//   - Does not modify any existing functions
//   - Does not touch species data, regulations, tide/weather logic
//   - Does not run on fishid.html (no save buttons there yet)
//
// Load order: app.js → auth.js → auth-sheet.js
// ============================================================

(function() {

  // ── Inject sheet HTML once ─────────────────────────────────
  // The sheet is a single DOM node appended to body.
  // It is shared across all pages — one sheet handles all triggers.
  function injectSheet() {
    if (document.getElementById('fsAuthOverlay')) return;

    var overlay = document.createElement('div');
    overlay.id = 'fsAuthOverlay';
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'background:rgba(0,0,0,0.45)',
      'z-index:500', 'opacity:0', 'pointer-events:none',
      'transition:opacity 0.3s'
    ].join(';');
    overlay.onclick = hideSheet;

    var sheet = document.createElement('div');
    sheet.id = 'fsAuthSheet';
    sheet.style.cssText = [
      'position:fixed', 'bottom:0', 'left:50%',
      'transform:translateX(-50%) translateY(100%)',
      'width:100%', 'max-width:480px',
      'background:#fff', 'border-radius:20px 20px 0 0',
      'z-index:501',
      'transition:transform 0.35s cubic-bezier(0.4,0,0.2,1)',
      'padding-bottom:env(safe-area-inset-bottom)',
      'font-family:DM Sans,sans-serif'
    ].join(';');

    sheet.innerHTML = [
      '<div style="width:40px;height:4px;background:#dce3ea;border-radius:2px;margin:12px auto 0"></div>',
      '<div id="fsAuthPane" style="padding:20px 24px 32px">',

        // ── Default pane: sign in ──────────────────────────────
        '<div id="fsSignInPane">',
          '<div id="fsSheetTitle" style="font-family:Unbounded,sans-serif;font-size:17px;font-weight:900;color:#1a1a2e;margin-bottom:6px">Save your first spot</div>',
          '<div id="fsSheetSub" style="font-size:13px;color:#5a6473;margin-bottom:20px;line-height:1.5">Create a free account to save species and spots across all your devices</div>',

          '<button id="fsBtnGoogle" style="width:100%;display:flex;align-items:center;justify-content:center;gap:10px;padding:13px;background:#f0f4f8;border:1.5px solid #dce3ea;border-radius:12px;font-family:DM Sans,sans-serif;font-size:14px;font-weight:600;color:#1a1a2e;cursor:pointer;margin-bottom:10px">',
            '<svg width="18" height="18" viewBox="0 0 18 18"><path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/><path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/><path d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05"/><path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/></svg>',
            'Continue with Google',
          '</button>',

          '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">',
            '<div style="flex:1;height:1px;background:#dce3ea"></div>',
            '<span style="font-size:12px;color:#5a6473">or</span>',
            '<div style="flex:1;height:1px;background:#dce3ea"></div>',
          '</div>',

          '<div id="fsEmailWrap" style="display:flex;gap:8px;margin-bottom:8px">',
            '<input id="fsEmailInput" type="email" placeholder="your@email.com" style="flex:1;padding:11px 14px;border:1.5px solid #dce3ea;border-radius:10px;font-family:DM Sans,sans-serif;font-size:14px;outline:none;color:#1a1a2e;background:#fff">',
            '<button id="fsBtnEmail" style="padding:11px 16px;background:#0a3d62;color:#fff;border:none;border-radius:10px;font-family:DM Sans,sans-serif;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap">Send link</button>',
          '</div>',
          '<div id="fsEmailMsg" style="display:none;font-size:12px;color:#27ae60;margin-bottom:8px;line-height:1.5"></div>',
          '<div id="fsAuthError" style="display:none;font-size:12px;color:#c0392b;margin-bottom:8px"></div>',

          '<div style="font-size:12px;color:#5a6473;text-align:center;margin-top:4px">',
            'No account needed to browse · ',
            '<span onclick="hideSheet()" style="color:#0a3d62;cursor:pointer;text-decoration:underline">keep exploring</span>',
          '</div>',
        '</div>',

        // ── Onboarding pane: one question ──────────────────────
        '<div id="fsOnboardPane" style="display:none">',
          '<div style="font-family:Unbounded,sans-serif;font-size:17px;font-weight:900;color:#1a1a2e;margin-bottom:6px">One quick thing</div>',
          '<div style="font-size:13px;color:#5a6473;margin-bottom:20px">What do you fish for most? We\'ll set your default view.</div>',
          '<div style="display:flex;flex-direction:column;gap:10px;margin-bottom:20px">',
            '<button class="fs-type-btn" data-type="saltwater" style="padding:14px;background:#f0f4f8;border:1.5px solid #dce3ea;border-radius:12px;font-family:DM Sans,sans-serif;font-size:14px;font-weight:500;color:#1a1a2e;cursor:pointer;text-align:left">🌊 Saltwater</button>',
            '<button class="fs-type-btn" data-type="freshwater" style="padding:14px;background:#f0f4f8;border:1.5px solid #dce3ea;border-radius:12px;font-family:DM Sans,sans-serif;font-size:14px;font-weight:500;color:#1a1a2e;cursor:pointer;text-align:left">🏞 Freshwater</button>',
            '<button class="fs-type-btn" data-type="both" style="padding:14px;background:#f0f4f8;border:1.5px solid #dce3ea;border-radius:12px;font-family:DM Sans,sans-serif;font-size:14px;font-weight:500;color:#1a1a2e;cursor:pointer;text-align:left">🎣 Both</button>',
          '</div>',
          '<button onclick="skipOnboarding()" style="width:100%;background:none;border:none;font-family:DM Sans,sans-serif;font-size:13px;color:#5a6473;cursor:pointer;padding:4px">',
            'Skip — I\'ll explore everything',
          '</button>',
        '</div>',

      '</div>'
    ].join('');

    document.body.appendChild(overlay);
    document.body.appendChild(sheet);

    // Wire up buttons
    document.getElementById('fsBtnGoogle').onclick = handleGoogleSignIn;
    document.getElementById('fsBtnEmail').onclick = handleEmailSignIn;
    document.getElementById('fsEmailInput').onkeydown = function(e) {
      if (e.key === 'Enter') handleEmailSignIn();
    };
    document.querySelectorAll('.fs-type-btn').forEach(function(btn) {
      btn.onclick = function() { handleFishingType(btn.getAttribute('data-type')); };
    });
  }

  // ── Show / hide ────────────────────────────────────────────
  window.showAuthSheet = function(titleOverride, subOverride) {
    injectSheet();
    // Reset to sign-in pane
    document.getElementById('fsSignInPane').style.display = 'block';
    document.getElementById('fsOnboardPane').style.display = 'none';
    document.getElementById('fsAuthError').style.display = 'none';
    document.getElementById('fsEmailMsg').style.display = 'none';
    document.getElementById('fsEmailInput').value = '';
    if (titleOverride) document.getElementById('fsSheetTitle').textContent = titleOverride;
    if (subOverride)   document.getElementById('fsSheetSub').textContent   = subOverride;

    var overlay = document.getElementById('fsAuthOverlay');
    var sheet   = document.getElementById('fsAuthSheet');
    overlay.style.pointerEvents = 'all';
    overlay.style.opacity = '1';
    sheet.style.transform = 'translateX(-50%) translateY(0)';
  };

  window.hideSheet = function() {
    var overlay = document.getElementById('fsAuthOverlay');
    var sheet   = document.getElementById('fsAuthSheet');
    if (!overlay || !sheet) return;
    overlay.style.opacity = '0';
    overlay.style.pointerEvents = 'none';
    sheet.style.transform = 'translateX(-50%) translateY(100%)';
  };

  // ── Swipe down to close ────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function() {
    injectSheet();
    var sheet = document.getElementById('fsAuthSheet');
    var tsY = 0;
    sheet.addEventListener('touchstart', function(e) {
      tsY = e.touches[0].clientY;
    }, { passive: true });
    sheet.addEventListener('touchend', function(e) {
      if (e.changedTouches[0].clientY - tsY > 80) hideSheet();
    }, { passive: true });
  });

  // ── Sign in handlers ───────────────────────────────────────
  async function handleGoogleSignIn() {
    var btn = document.getElementById('fsBtnGoogle');
    btn.textContent = 'Opening Google…';
    btn.disabled = true;
    var { error } = await signInWithGoogle();
    if (error) {
      showAuthError('Could not open Google sign-in. Try the email link instead.');
      btn.innerHTML = 'Continue with Google';
      btn.disabled = false;
    }
    // On success the page redirects — no further action needed here
  }

  async function handleEmailSignIn() {
    var email = (document.getElementById('fsEmailInput').value || '').trim();
    if (!email || !email.includes('@')) {
      showAuthError('Enter a valid email address.');
      return;
    }
    var btn = document.getElementById('fsBtnEmail');
    btn.textContent = 'Sending…';
    btn.disabled = true;
    var { error } = await signInWithEmail(email);
    if (error) {
      showAuthError('Could not send link. Check the email and try again.');
      btn.textContent = 'Send link';
      btn.disabled = false;
      return;
    }
    document.getElementById('fsEmailMsg').style.display = 'block';
    document.getElementById('fsEmailMsg').textContent =
      'Magic link sent to ' + email + ' — check your inbox and tap the link to sign in.';
    btn.textContent = 'Sent ✓';
  }

  function showAuthError(msg) {
    var el = document.getElementById('fsAuthError');
    el.textContent = msg;
    el.style.display = 'block';
  }

  // ── Onboarding ─────────────────────────────────────────────
  function showOnboardPane() {
    document.getElementById('fsSignInPane').style.display = 'none';
    document.getElementById('fsOnboardPane').style.display = 'block';
  }

  async function handleFishingType(type) {
    // Highlight selected
    document.querySelectorAll('.fs-type-btn').forEach(function(b) {
      var selected = b.getAttribute('data-type') === type;
      b.style.background    = selected ? '#e8f5ee' : '#f0f4f8';
      b.style.borderColor   = selected ? '#52b788' : '#dce3ea';
      b.style.color         = selected ? '#1a5c38' : '#1a1a2e';
    });

    var user = getUser();
    if (user) await saveFishingType(user.id, type);

    // Store locally too so index.html can apply it without a DB call
    try { localStorage.setItem('fs_fishing_type', type); } catch(e) {}

    // Brief pause so user sees selection, then close
    setTimeout(function() {
      hideSheet();
      // If on index.html, apply the filter preference immediately
      if (typeof renderList === 'function' && typeof currentFilter !== 'undefined') {
        if (type === 'saltwater')  currentFilter = 'saltwater';
        if (type === 'freshwater') currentFilter = 'freshwater';
        // 'both' keeps 'all' filter
        var tab = document.querySelector('[data-filter="' + currentFilter + '"]');
        if (tab) {
          document.querySelectorAll('.filter-tab').forEach(function(t) { t.classList.remove('active'); });
          tab.classList.add('active');
        }
        if (typeof renderList === 'function') renderList();
      }
    }, 600);
  }

  window.skipOnboarding = function() {
    try { localStorage.setItem('fs_fishing_type', 'all'); } catch(e) {}
    hideSheet();
  };

  // ── Pending action store ───────────────────────────────────
  // Stored in sessionStorage so it survives the Google OAuth
  // redirect. Cleared immediately after being consumed.
  var PENDING_KEY = 'fs_pending_action';

  function setPendingAction(action) {
    try { sessionStorage.setItem(PENDING_KEY, JSON.stringify(action)); } catch(e) {}
  }
  function getPendingAction() {
    try {
      var raw = sessionStorage.getItem(PENDING_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch(e) { return null; }
  }
  function clearPendingAction() {
    try { sessionStorage.removeItem(PENDING_KEY); } catch(e) {}
  }

  // ── Auth state: show onboarding + complete pending action ──
  var _shownOnboard = false;
  document.addEventListener('fsa:authchange', function(e) {
    var user = e.detail.user;
    var event = e.detail.event;

    if (user && event === 'SIGNED_IN') {
      // Complete any pending save action first
      var action = getPendingAction();
      if (action) {
        clearPendingAction();

        if (action.type === 'species' && action.id) {
          // Complete the species save
          var ids = getSavedIds();
          if (!ids.includes(action.id)) {
            if (typeof toggleSaved === 'function') toggleSaved(action.id);
          }
          // Re-render save button if drawer is still open
          var saveBtn = document.getElementById('saveBtn');
          if (saveBtn) {
            saveBtn.textContent = '⭐ Saved';
            saveBtn.className = 'd-save-btn saved';
          }
        }

        if (action.type === 'spot' && action.name) {
          // Complete the spot save
          if (typeof toggleFav === 'function') {
            toggleFav(action.name, action.lat, action.lng);
          }
        }
      }

      // Show onboarding if user hasn't answered yet.
      // Triggered by both species AND spot saves — anyone motivated
      // enough to save something should get the onboarding question.
      if (!_shownOnboard) {
        var hasPref = false;
        try { hasPref = !!localStorage.getItem('fs_fishing_type'); } catch(ex) {}

        if (!hasPref) {
          _shownOnboard = true;
          setTimeout(function() {
            injectSheet();
            var overlay = document.getElementById('fsAuthOverlay');
            var sheet   = document.getElementById('fsAuthSheet');
            overlay.style.pointerEvents = 'all';
            overlay.style.opacity = '1';
            sheet.style.transform = 'translateX(-50%) translateY(0)';
            showOnboardPane();
          }, 400);
        }
      }
    }
  });

  // ── Event delegation: intercept save actions ───────────────
  // Runs on every page. If user is logged out, stores the pending
  // action in sessionStorage and shows the auth sheet.
  // If logged in, does nothing and lets existing handler fire.
  document.addEventListener('click', function(e) {
    // Target: Save Species button in species drawer
    var saveBtn = e.target.closest('.d-save-btn');
    if (saveBtn) {
      if (!getUser()) {
        e.stopImmediatePropagation();
        // Parse species ID from onclick="handleSave(42)"
        var onclickAttr = saveBtn.getAttribute('onclick') || '';
        var idMatch = onclickAttr.match(/handleSave\((\d+)\)/);
        if (idMatch) {
          setPendingAction({ type: 'species', id: parseInt(idMatch[1]) });
        }
        showAuthSheet(
          'Save this species',
          'Create a free account to save species and access your collection on any device'
        );
        return;
      }
    }

    // Target: favourite star on forecast spots
    var starBtn = e.target.closest('.spot-star');
    if (starBtn) {
      if (!getUser()) {
        e.stopImmediatePropagation();
        // Parse spot from onclick="toggleFav('Bodega Bay',38.33,-123.04)"
        var starOnclick = starBtn.getAttribute('onclick') || '';
        var spotMatch = starOnclick.match(/toggleFav\('([^']+)',([^,]+),([^)]+)\)/);
        if (spotMatch) {
          setPendingAction({
            type: 'spot',
            name: spotMatch[1],
            lat: parseFloat(spotMatch[2]),
            lng: parseFloat(spotMatch[3])
          });
        }
        showAuthSheet(
          'Save this spot',
          'Create a free account to save your favourite fishing spots and get score alerts'
        );
        return;
      }
    }
  }, true); // capture phase so we can stopImmediatePropagation before existing handlers

})();
