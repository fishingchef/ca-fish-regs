# Fish Smarter — Project Context & Decisions

[![CI](https://github.com/fishingchef/ca-fish-regs/actions/workflows/ci.yml/badge.svg)](https://github.com/fishingchef/ca-fish-regs/actions/workflows/ci.yml)

> Paste this file at the start of any new Claude conversation to restore full project context.
> Last updated: April 2026

---

## What Is Fish Smarter

A mobile-first Progressive Web App (PWA) for California fishing. Live at **fishsmarter.app**.

**Core features (built and live):**
- Species lookup with California fishing regulations (273 species in Supabase)
- AI Fish ID using Gemini Vision API (photo → species identification)
- MPA Map with official CDFW polygon boundaries via ArcGIS API
- Fishing Spots map (saltwater + freshwater across California)
- Tides & Forecast page (NOAA tides + NWS weather, 7-day + 14-day)
- Fishing Score (0–99) incorporating tide state, wind, temp, weather, time of day
- Multi-language support (EN, ES, VI, 中文, 한국어, TL, ខ្មែរ)
- Favorites / My Spots for forecast locations
- Save species feature

**Tech stack:**
- Frontend: Vanilla HTML/CSS/JS, PWA with service worker
- Database: Supabase (PostgreSQL) — species, regulations, emergency_closures tables
- AI: Gemini Vision API (Fish ID), Claude API (translations, some features)
- Hosting: Vercel (fishsmarter.app custom domain)
- Tile maps: Leaflet.js + OpenStreetMap
- MPA data: CDFW ArcGIS REST API (primary), hardcoded fallback circles
- Tides: NOAA Tides & Currents API
- Weather: NWS (api.weather.gov)
- Geocoding: Open-Meteo geocoding API
- Fonts: Unbounded + DM Sans (Google Fonts)

**Repo:** GitHub — `ca-fish-regs` (public), deployed via Vercel auto-deploy on commit

**Key files:**
- `index.html` — species list + regulation lookup
- `fishid.html` — AI Fish ID camera page
- `forecast.html` — tides + weather forecast
- `map.html` — MPA map + fishing spots
- `account.html` — account page (UI shell, auth not yet built)
- `js/app.js` — shared utilities: calcFishingScore, nearestStation, getEmoji, deriveStatus, etc.
- `manifest.json` — PWA manifest (icons: icon-192.png, icon-512.png)
- `sw.js` — service worker

---

## Architecture Decisions Made

### Data & Storage
- **Supabase** is the single source of truth for species/regulations data
- Species data: 273 species covered in Supabase as of April 2026
- Photos: stored as URLs in Supabase `image_url` field — some species still missing photos
- Future catch log photos: **Cloudflare R2** (not Supabase Storage) to avoid egress fees
  - Compress client-side to ~300KB max using Canvas API before upload
  - Store two versions: thumbnail (50KB for feed) + full (300KB for detail)
  - Store only the R2 URL in Supabase, not the binary

### Authentication
- **BUILT AND LIVE** — April 2026
- Google OAuth + magic link email via Supabase Auth
- `js/auth.js` — core module: `getUser()`, `signInWithGoogle()`, `signInWithEmail()`, `signOut()`, `migrateLocalStorage()`, `onAuthStateChange()` broadcasting `fsa:authchange` event
- `js/auth-sheet.js` — trigger sheet: intercepts `.d-save-btn` and `.spot-star` clicks when logged out, stores pending action in `sessionStorage` (survives OAuth redirect), completes action after sign-in
- `account.html` — logged-out state (sign in), logged-in state (profile, stats, coming soon tiles, settings)
- Onboarding: one question (saltwater/freshwater/both) shown after first sign-in, stored as `fs_fishing_type` in localStorage and `fishing_type` in `user_profiles` table
- localStorage migration: on first sign-in, saved species + spots migrated from localStorage to Supabase, merged back to localStorage as cache. Guard key: `fs_migrated_<userId>`
- Pending action: species saves and spot saves attempted while logged out are completed automatically after sign-in
- All existing pages unchanged except two `<script>` tags added after `</script>` before `</body>`

**Supabase tables added:**
- `user_profiles` — id (UUID), fishing_type, created_at, updated_at. Auto-created by trigger on auth.users insert.
- `saved_species` — user_id, species_id, UNIQUE(user_id, species_id)
- `saved_spots` — user_id, name, lat, lng, UNIQUE(user_id, name)
- All tables have RLS enabled. Policies use `auth.uid()::uuid` cast.

### Fishing Score Algorithm (`calcFishingScore` in app.js)
Inputs: temp (°F), wind speed, forecast text, tides array, targetDate
- Baseline: 60 points
- Temperature: –20 to +18 (sweet spot 58–70°F)
- Wind: –35 to +15 (calm ≤5mph = +15, dangerous >25mph = –35)
- Weather condition: –40 to +10 (overcast = +5, clearing after rain = +10, storm = –35)
- Tide state: –8 to +18 (incoming flood mid-phase = +18, approaching low = –8)
- Tidal range bonus: +3 to +6 (bigger swing = more fish activity)
- Time of day: –5 to +10 (dawn 5–8am = +10, dusk 5–8pm = +10)
- Output: clamped 10–99
- Honest caveat: does NOT include water temp, moon phase, barometric pressure, species behavior

### MPA Map
- Primary data: CDFW ArcGIS polygon API (real boundaries)
- Fallback: hardcoded circle approximations (MPAS_FALLBACK array in map.html)
- **Known issue with fallback circles**: they are oversized estimates — Bodega Bay, Monterey Bay, and Morro Bay fishing spots were moved to safe coordinates after audit
- Fishing spots inside SMR zones are suppressed at runtime via `isSpotInMPA()` check
- SMCA spots get orange marker + warning in drawer instead of suppression

### Forecast Page
- 7-day grid: all 7 days visible at once (replaced horizontal scroll tabs)
- Score card updates dynamically when user taps a different day (`switchDay()`)
- Tide rows are tappable → drawer with sine-interpolated tide curve + "Now" marker
- "ⓘ How is this score calculated?" disclosure below score card
- 14-day section: tide data only, no weather (NWS only provides 7 days)
- Favorites (My Spots): saved to localStorage, shown above quick spots strip
- GPS: non-blocking init — shows idle state, attempts GPS silently if previously granted

---

## Monetization Strategy — Decided

**Model: Freemium — "Free for information, premium for personalization and alerts"**

### Free tier (forever free):
- All species lookup + regulations
- MPA map
- Fish ID (unlimited — do NOT paywall this)
- Tides + forecast
- Basic fishing spots

### Premium tier (target ~$19.99/year or $3.99/month):
- Catch log / journal
- Spot notes (private notes on saved locations)
- Offline mode (download for no-signal areas)
- Regulation alerts (push notifications for season open/close)
- Tide + score alerts ("Score 90+ at Bodega Bay tomorrow at dawn")
- Unlimited catch photos (free tier: 3 photos per entry max)
- Ad-free experience (if ads added to free tier later)

### Fish ID — keep free, reasoning:
- Most anglers catch common species they already recognize
- One fishing trip doesn't guarantee a catch
- Better use case: intertidal zone ID (anemones, sea stars, chitons, snails, crabs)
  - Gemini Vision can identify intertidal species from photos
  - Only useful if those species are in Supabase with regulation data
  - Intertidal coverage is currently the weakest category (~12%)

### Ads — not yet, and not display ads:
- Affiliate links preferred over display ads (Amazon/Bass Pro Shops, 3–5% commission)
- Contextual: species detail page → recommended gear/lures as affiliate links
- Community feed catch + gear data could support contextual affiliate links later
- Anthropic does NOT prohibit ads in products built on Claude API
- Decision: hold on ads until freemium + catch log is stable and has user base

---

## Feature Build Order (Agreed)

Build one at a time, each isolated from existing code, audit before deploying.

### ✅ Priority 1: Supabase Auth — COMPLETE (April 2026)
- Google OAuth + magic link email
- Session management, RLS policies, localStorage migration
- Onboarding question, pending action completion after sign-in
- See Architecture → Authentication for full details

### ✅ Priority 2: Catch Log — COMPLETE (April 2026)
- Photo-first entry (`catchlog-new.html`) — photo → AI size estimate → method chips → location → save
- AI size estimate via `api/estimate-size.js` (Vercel edge, same Gemini key as Fish ID)
- Photo upload to Cloudflare R2 via `fishsmarter-upload` Worker
- Reward card after save — species count stat, personal best prompt
- Community feed share toggle (is_public flag) — visible but feed not yet built
- Fish ID → "Log this catch" button — pre-fills species + photo via sessionStorage
- `catchlog.html` — personal feed, stats strip (total, species count, best score), delete
- Nav restructured: Account → Catches (📓) in bottom nav; Account moved to profile avatar in header
- R2 bucket: `fishsmarter-catches` (Western North America), public URL: `pub-a063c13b1c494899bfc43fa7da2b5b0e.r2.dev`
- Worker: `fishsmarter-upload.ideas2execution.workers.dev`

### Priority 3: Offline Mode
- Update sw.js (already exists) with proper cache versioning
- Cache: species data, regulations, app shell, tide station list
- Show "offline" badge when no network detected
- Risk: cache invalidation — must version the cache correctly

### Priority 4: Community Feed
- Read-only feed of `catch_logs` where `is_public = true`
- Shows: species, general location (not exact GPS), method, gear, fishing score at time
- No comments, no following, no profiles
- New page: `community.html` or tab on catch log page

### Priority 5: Regulation Alerts (most complex, build last)
- Requires: VAPID keys, push subscription storage in Supabase, Supabase Edge Function
- Triggers: season open/close events, emergency closures
- User subscribes to specific species or locations
- Server-initiated — zero impact on app load performance

---

## App Store Plans

**Google Play:** PWABuilder (free, Microsoft) wraps PWA into APK. $25 one-time fee.
**Apple App Store:** PWABuilder or Capacitor. Requires Mac + $99/year Apple Developer account + App Review (1–7 days).

**Prerequisites before submission:**
- Privacy policy page (required by both stores)
- Age rating questionnaire answers
- Store screenshots at required sizes
- All icons already done (192px, 512px, apple-touch-icon 180px)

**Recommendation:** Do Google Play first (cheaper, faster), Apple after freemium is stable.

---

## Species Coverage Status (April 2026)

- **Total in Supabase:** 273 species
- **Missing photos:** some species have no image_url — need Wikimedia Commons public domain photos
- **Weakest categories by coverage:**
  - Intertidal zone (~12%) — Owl Limpet, Gumboot Chiton, Turban Snail, Tidepool Sculpin, Purple Shore Crab, Sand Crab missing
  - Marine plants (~10%) — Giant Kelp, Bull Kelp, Sea Palm, Sea Lettuce, harvestable red algae
  - Freshwater invertebrates/bivalves (~12%) — invasive crayfish, Asian Clam
  - Freshwater finfish (~34%) — Pacific Lamprey, River Lamprey, Sacramento natives, invasive carp missing
  - Pelagic/offshore (~44%) — Swordfish, Thresher Shark, Mako, Striped Marlin, Pacific Halibut missing

---

## Open Questions / Outstanding Items

- [x] Auth: Google OAuth + magic link email — both live
- [ ] Catch log: launch without photos first, add photos in v2?
- [ ] Community feed: same page as catch log (tab) or separate nav item?
- [ ] Offline mode: which data to cache? All 273 species or just shell + user's saved species?
- [ ] Regulation alerts: who triggers them? Manual admin entry or CDFW data feed?
- [ ] Monetization: Stripe for payments, or go through App Store in-app purchase?
- [ ] Photo storage: Cloudflare R2 setup — needs R2 bucket + Workers script for upload
- [ ] Intertidal species: add to Supabase before or after app store submission?
- [ ] Missing species photos: systematic sourcing from Wikimedia Commons needed
- [ ] Gemini API key exposed client-side in fishid.html — move to Supabase Edge Function after catch log

---

## Current File Versions in Project
- js/app.js: updated April 2026 (5-factor fishing score, deriveStatus year fix)
- js/auth.js: added April 2026 (Supabase Auth core module)
- js/auth-sheet.js: added April 2026 (trigger sheet, sessionStorage pending action, onboarding)
- api/estimate-size.js: added April 2026 (Gemini AI size estimation for catch log)
- index.html: updated April 2026 (renderList fix, SW removed, avatar, Catches nav, nav data-page fix)
- fishid.html: updated April 2026 (Log this catch button, avatar, Catches nav, nav data-page fix)
- forecast.html: updated April 2026 (7-day grid, tide drawer, avatar, Catches nav, nav data-page fix)
- map.html: updated April 2026 (MPA fixes, avatar, Catches nav, nav data-page fix)
- CLAUDE.md: added April 2026 (full project context — replaces stub, source of truth for Claude sessions)
- account.html: updated April 2026 (full auth UI — logged out/in states, coming soon, settings)
- catchlog.html: added April 2026 (personal catch feed, stats strip)
- catchlog-new.html: added April 2026 (photo-first entry, AI size estimate, R2 upload, reward card)

- `closeMPADrawer()` → renamed to `closeDrawer()` in map.html
- `setGPSStatus()` was ignoring 3rd argument (MPA detail text)
- `switchTab()` was calling `.setStyle()` on wrapper objects, not Leaflet layers
- Fishing spots inside MPA circles: Bodega Bay, Monterey Bay, Morro Bay coords corrected
- Fishing score card was static — now updates dynamically on day tab switch (`switchDay()`)
- `calcFishingScore` week-grid was showing same score for all days (today's score used for all)
- Tide drawer `onclick` had broken quote nesting — rewrote buildTideRow with counter-based index
- forecast.html infinite spinner — removed auto `useGPS()` on load, now shows idle state
- `Uncaught SyntaxError` at line 467 — score info panel HTML used Python line continuation `\` which injected stray quotes
- Service worker was being unregistered on every load — removed dev unregister block from index.html
- `Monterey State Beach` was misclassified as SMR in fallback data — corrected to SMCA
- index.html `renderList()` — search filter block missing closing brace, SW code pasted inside filter function causing `Unexpected end of input`
- `deriveStatus()` hardcoded year 2024 for season date comparisons — fixed to use `now.getFullYear()`
- `switchDay()` score title grammar — "Mon, Apr 28's Fishing Score" fixed to "Fishing Score — Mon, Apr 28"
- Supabase RLS policies — `auth.uid()` requires `::uuid` cast; `saved_species.user_id` created as TEXT not UUID — fixed with DROP/recreate
- Saved species count 0 after sign-up — pending save action stored in `sessionStorage`, completed after OAuth redirect
- Onboarding re-triggered on new device — now checks Supabase `user_profiles.fishing_type` first
- Catch log location showing raw coordinates — fixed with Nominatim reverse geocoding
- Public catches stored exact GPS — rounded to 1 decimal (~11km) for public entries
- Account page catch count hardcoded 0 — now queries Supabase `catch_logs` directly
- Catch log cards not tappable — added detail drawer with full photo, all tiles, swipe-to-close
- Cloudflare Worker CORS blocked `vercel.app` — fixed `getAllowedOrigin()` and passed `request` to all `json()` calls and OPTIONS preflight
- Worker template literal syntax error — replaced all backtick strings with concatenation
- Bottom nav `data-page` attribute wrong on Catches tab — `data-page="account"` in index.html fixed to `data-page="catchlog"`; fishid.html, forecast.html, map.html were missing the attribute entirely — added `data-page="catchlog"` to all three

---

## How to Use This Document

**Starting a new Claude conversation:**
1. Upload this file or paste its contents
2. Say: "This is my Fish Smarter project context. I want to work on [specific feature]."
3. Claude will have full context of all decisions made.

**Updating this document:**
- After any significant decision or completed feature, ask Claude: "Update the FISHSMARTER_PROJECT.md with what we decided today"
- Commit the updated file to your GitHub repo alongside code changes
- This file is your source of truth — keep it current

**Repo location:** Save as `FISHSMARTER_PROJECT.md` in the root of your `ca-fish-regs` GitHub repo
