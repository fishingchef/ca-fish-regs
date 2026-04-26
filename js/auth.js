// ============================================================
// Fish Smarter — Auth Module (js/auth.js)
// ============================================================
// Responsibilities:
//   - Supabase Auth session management
//   - getUser() / signIn / signOut
//   - migrateLocalStorage() — runs once after first login
//   - onAuthStateChange() — broadcast auth state to any listener
//
// What this file does NOT do:
//   - No DOM manipulation
//   - No UI rendering
//   - No changes to existing app.js functions
//
// Dependencies: Supabase client (db) already initialised in app.js
// Load order: app.js → auth.js → auth-sheet.js → page scripts
// ============================================================

// ── Session state ────────────────────────────────────────────
// Single source of truth for the current user.
// Other modules read window._fsUser — never call supabase.auth.getUser()
// directly from page scripts.
window._fsUser = null;

// ── getUser ──────────────────────────────────────────────────
// Returns the current user object or null.
// Sync-safe: reads the cached value set by onAuthStateChange.
function getUser() {
  return window._fsUser || null;
}

// ── signInWithGoogle ─────────────────────────────────────────
async function signInWithGoogle() {
  var { error } = await db.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.href,
      queryParams: { prompt: 'select_account' }
    }
  });
  if (error) {
    console.error('[FS Auth] Google sign-in error:', error.message);
    return { error };
  }
  return { error: null };
}

// ── signInWithEmail ──────────────────────────────────────────
// Sends a magic link — simpler than password auth for MVP.
// Switch to email+password later if needed.
async function signInWithEmail(email) {
  var { error } = await db.auth.signInWithOtp({
    email: email,
    options: {
      emailRedirectTo: window.location.href
    }
  });
  if (error) {
    console.error('[FS Auth] Email sign-in error:', error.message);
    return { error };
  }
  return { error: null };
}

// ── signOut ──────────────────────────────────────────────────
async function signOut() {
  var { error } = await db.auth.signOut();
  if (error) {
    console.error('[FS Auth] Sign-out error:', error.message);
    return { error };
  }
  window._fsUser = null;
  return { error: null };
}

// ── saveFishingType ──────────────────────────────────────────
// Stores the user's answer to the onboarding question.
// Upserts into a user_profiles table (see schema note below).
async function saveFishingType(userId, fishingType) {
  if (!userId || !fishingType) return;
  var { error } = await db
    .from('user_profiles')
    .upsert({
      id: userId,
      fishing_type: fishingType,
      updated_at: new Date().toISOString()
    }, { onConflict: 'id' });
  if (error) console.warn('[FS Auth] saveFishingType error:', error.message);
}

// ── migrateLocalStorage ──────────────────────────────────────
// Runs ONCE after a user first logs in.
// Reads saved species IDs and favourite spots from localStorage,
// writes them to Supabase, then writes Supabase state back to
// localStorage so all existing getSavedIds() callers keep working.
//
// Migration guard: localStorage key 'fs_migrated_<userId>'
// ensures this never runs twice for the same account.
async function migrateLocalStorage(userId) {
  if (!userId) return;

  var guardKey = 'fs_migrated_' + userId;
  try {
    if (localStorage.getItem(guardKey) === '1') return; // already done
  } catch(e) { return; }

  console.log('[FS Auth] Running localStorage migration for user', userId);

  // ── Saved species ──────────────────────────────────────────
  var localSavedIds = [];
  try {
    localSavedIds = JSON.parse(localStorage.getItem('fishsmarter_saved') || '[]');
  } catch(e) {}

  if (localSavedIds.length > 0) {
    // Fetch any existing saved species from Supabase for this user
    var { data: existingRows } = await db
      .from('saved_species')
      .select('species_id')
      .eq('user_id', userId);

    var existingIds = (existingRows || []).map(function(r) { return r.species_id; });

    // Only insert IDs not already in Supabase
    var toInsert = localSavedIds
      .filter(function(id) { return !existingIds.includes(id); })
      .map(function(id) { return { user_id: userId, species_id: id }; });

    if (toInsert.length > 0) {
      var { error: insertErr } = await db.from('saved_species').insert(toInsert);
      if (insertErr) console.warn('[FS Auth] saved_species insert error:', insertErr.message);
    }

    // Write merged set back to localStorage so getSavedIds() stays accurate
    var mergedIds = Array.from(new Set(existingIds.concat(localSavedIds)));
    try { localStorage.setItem('fishsmarter_saved', JSON.stringify(mergedIds)); } catch(e) {}
  }

  // ── Favourite spots ────────────────────────────────────────
  var localFavs = [];
  try {
    localFavs = JSON.parse(localStorage.getItem('fs_favspots') || '[]');
  } catch(e) {}

  if (localFavs.length > 0) {
    var { data: existingFavRows } = await db
      .from('saved_spots')
      .select('name')
      .eq('user_id', userId);

    var existingNames = (existingFavRows || []).map(function(r) { return r.name; });

    var favsToInsert = localFavs
      .filter(function(f) { return !existingNames.includes(f.name); })
      .map(function(f) { return {
        user_id: userId,
        name: f.name,
        lat: f.lat,
        lng: f.lng
      }; });

    if (favsToInsert.length > 0) {
      var { error: favErr } = await db.from('saved_spots').insert(favsToInsert);
      if (favErr) console.warn('[FS Auth] saved_spots insert error:', favErr.message);
    }
  }

  // Mark migration done
  try { localStorage.setItem(guardKey, '1'); } catch(e) {}
  console.log('[FS Auth] Migration complete.');
}

// ── Auth state listener ──────────────────────────────────────
// Single listener that:
//   1. Sets window._fsUser
//   2. Runs migration on first sign-in
//   3. Dispatches 'fsa:authchange' event so any page/module can react
//      without being tightly coupled to this module
//
// Usage in any page script:
//   document.addEventListener('fsa:authchange', function(e) {
//     var user = e.detail.user; // null if signed out
//   });
(function initAuthListener() {
  // Immediately try to restore session from storage so pages don't
  // flash logged-out state while waiting for onAuthStateChange.
  // getSession() reads from localStorage synchronously via the SDK.
  db.auth.getSession().then(function(result) {
    var session = result.data && result.data.session;
    if (session && session.user && !window._fsUser) {
      window._fsUser = session.user;
      document.dispatchEvent(new CustomEvent('fsa:authchange', {
        detail: { user: session.user, event: 'INITIAL_SESSION' }
      }));
    }
  }).catch(function() {});

  // Then keep listening for changes (sign in, sign out, token refresh)
  db.auth.onAuthStateChange(async function(event, session) {
    var user = session ? session.user : null;
    window._fsUser = user;

    // Run migration once when user first signs in
    if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && user) {
      await migrateLocalStorage(user.id);
    }

    // Broadcast to all listeners
    document.dispatchEvent(new CustomEvent('fsa:authchange', {
      detail: { user: user, event: event }
    }));
  });
})();

// ── Supabase schema required for auth ────────────────────────
// Run these SQL statements in Supabase SQL editor before deploying.
//
// -- User profiles (fishing_type preference + future fields)
// CREATE TABLE user_profiles (
//   id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
//   fishing_type TEXT CHECK (fishing_type IN ('saltwater','freshwater','both')),
//   created_at TIMESTAMPTZ DEFAULT NOW(),
//   updated_at TIMESTAMPTZ DEFAULT NOW()
// );
// ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
// CREATE POLICY "Users read own profile"
//   ON user_profiles FOR SELECT USING (auth.uid() = id);
// CREATE POLICY "Users write own profile"
//   ON user_profiles FOR ALL USING (auth.uid() = id);
//
// -- Saved species
// CREATE TABLE saved_species (
//   id BIGSERIAL PRIMARY KEY,
//   user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
//   species_id BIGINT NOT NULL,
//   created_at TIMESTAMPTZ DEFAULT NOW(),
//   UNIQUE(user_id, species_id)
// );
// ALTER TABLE saved_species ENABLE ROW LEVEL SECURITY;
// CREATE POLICY "Users manage own saved species"
//   ON saved_species FOR ALL USING (auth.uid() = user_id);
//
// -- Saved spots
// CREATE TABLE saved_spots (
//   id BIGSERIAL PRIMARY KEY,
//   user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
//   name TEXT NOT NULL,
//   lat DOUBLE PRECISION NOT NULL,
//   lng DOUBLE PRECISION NOT NULL,
//   created_at TIMESTAMPTZ DEFAULT NOW(),
//   UNIQUE(user_id, name)
// );
// ALTER TABLE saved_spots ENABLE ROW LEVEL SECURITY;
// CREATE POLICY "Users manage own saved spots"
//   ON saved_spots FOR ALL USING (auth.uid() = user_id);
