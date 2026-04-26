// ============================================================
// Fish Smarter — Shared App Utilities
// ============================================================

// Supabase
const SUPABASE_URL = 'https://maqffkhgynuzbvpbueds.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_3Lh4gmjt2Wvvp0u76qqkrQ_3h-DqVwY';
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── Region config ───────────────────────────────────────────
// Single source of truth for the active region.
// Stored in localStorage so user preference persists.
// When expanding to Oregon/Washington: just update this value
// or let users pick from the regions table — zero other code changes needed.
const REGION_CONFIG = {
  california: { name: 'California', admin1: 'California', country_code: 'US', bbox: { minLat: 32.5, maxLat: 42.0, minLng: -124.5, maxLng: -114.1 } },
  oregon:     { name: 'Oregon',     admin1: 'Oregon',     country_code: 'US', bbox: { minLat: 41.9, maxLat: 46.3, minLng: -124.6, maxLng: -116.5 } },
  washington: { name: 'Washington', admin1: 'Washington', country_code: 'US', bbox: { minLat: 45.5, maxLat: 49.0, minLng: -124.8, maxLng: -116.9 } },
  alaska:     { name: 'Alaska',     admin1: 'Alaska',     country_code: 'US', bbox: { minLat: 54.0, maxLat: 71.5, minLng: -168.0, maxLng: -130.0 } },
  florida:    { name: 'Florida',    admin1: 'Florida',    country_code: 'US', bbox: { minLat: 24.5, maxLat: 31.0, minLng: -87.6,  maxLng: -80.0  } },
};

function getUserRegion() {
  try { return localStorage.getItem('fishsmarter_region') || 'california'; }
  catch(e) { return 'california'; }
}
function setUserRegion(regionId) {
  try { localStorage.setItem('fishsmarter_region', regionId); }
  catch(e) {}
}
function getRegionConfig() {
  return REGION_CONFIG[getUserRegion()] || REGION_CONFIG['california'];
}

// ── Translation System ─────────────────────────────────────
// Supports: Spanish (es), Vietnamese (vi), Chinese Simplified (zh), Korean (ko)
// Scientific names, numbers, URLs, and legal citations are never translated.
// Translations are cached in localStorage so each species only translates once per language.

const SUPPORTED_LANGUAGES = {
  en: { label: 'EN',    name: 'English' },
  es: { label: 'ES',    name: 'Español' },
  vi: { label: 'VI',    name: 'Tiếng Việt' },
  zh: { label: '中文',  name: '中文 (简体)' },
  ko: { label: '한국어', name: '한국어' },
  tl: { label: 'TL',    name: 'Filipino (Tagalog)' },
  km: { label: 'ខ្មែរ', name: 'ភាសាខ្មែរ (Khmer)' },
};

var currentLang = 'en';

function getLangCacheKey(lang, speciesName, fieldKey) {
  return 'fs_tx_' + lang + '_' + speciesName.replace(/\s+/g, '_').toLowerCase() + '_' + fieldKey;
}

function getCachedTranslation(lang, speciesName, fieldKey) {
  try { return localStorage.getItem(getLangCacheKey(lang, speciesName, fieldKey)); }
  catch(e) { return null; }
}

function setCachedTranslation(lang, speciesName, fieldKey, value) {
  try { localStorage.setItem(getLangCacheKey(lang, speciesName, fieldKey), value); }
  catch(e) {}
}

// Translate a batch of text fields for a species
// Returns { fieldKey: translatedText, ... } or null on error
async function translateFields(lang, speciesName, fields) {
  if (lang === 'en') return null; // nothing to do

  // Check cache first — only translate uncached fields
  var toTranslate = {};
  var cached = {};
  Object.keys(fields).forEach(function(key) {
    var c = getCachedTranslation(lang, speciesName, key);
    if (c) cached[key] = c;
    else if (fields[key]) toTranslate[key] = fields[key];
  });

  if (Object.keys(toTranslate).length === 0) return cached;

  var langName = SUPPORTED_LANGUAGES[lang].name;

  var prompt = 'You are a fishing regulation translator. Translate the following fishing regulation fields into ' + langName + '.\n\n' +
    'Rules:\n' +
    '- Translate naturally as a native speaker would say it\n' +
    '- Keep scientific names in Latin (do not translate them)\n' +
    '- Keep numbers, measurements, and dates as-is\n' +
    '- Keep species names that have no direct translation (use phonetic or closest equivalent)\n' +
    '- Do NOT translate URLs or citations like "CCR Title 14"\n' +
    '- Return ONLY valid JSON with the same keys, nothing else\n\n' +
    'Fields to translate:\n' + JSON.stringify(toTranslate, null, 2);

  try {
    var res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!res.ok) return cached;

    var data = await res.json();
    var text = (data.content || []).map(function(b) { return b.text || ''; }).join('');
    var clean = text.replace(/```json|```/g, '').trim();
    var translated = JSON.parse(clean);

    // Cache each translated field
    Object.keys(translated).forEach(function(key) {
      setCachedTranslation(lang, speciesName, key, translated[key]);
      cached[key] = translated[key];
    });

    return cached;
  } catch(e) {
    console.warn('[FS] Translation failed:', e.message);
    return cached;
  }
}

// Build language pill selector HTML — uses data-name attribute to avoid quote escaping
function buildLangPills(speciesName) {
  var html = '<div class="lang-pills" id="langPills" style="display:flex;gap:6px;flex-wrap:wrap;margin:12px 0 4px">';
  Object.keys(SUPPORTED_LANGUAGES).forEach(function(code) {
    var lang = SUPPORTED_LANGUAGES[code];
    var isActive = code === currentLang;
    html += '<button class="lang-pill' + (isActive ? ' active' : '') + '" ' +
      'data-lang="' + code + '" ' +
      'data-species="' + speciesName.replace(/"/g, '&quot;') + '" ' +
      'onclick="handleLangPill(this)" ' +
      'style="padding:4px 10px;border-radius:100px;border:1.5px solid ' +
      (isActive ? 'var(--ocean)' : 'var(--border)') + ';' +
      'background:' + (isActive ? 'var(--ocean)' : 'var(--bg)') + ';' +
      'color:' + (isActive ? '#fff' : 'var(--text)') + ';' +
      'font-size:11px;font-weight:600;cursor:pointer;font-family:inherit">' +
      lang.label + '</button>';
  });
  html += '</div>';
  return html;
}

// Called by pill onclick — reads data attributes to avoid quote issues
function handleLangPill(btn) {
  var lang = btn.getAttribute('data-lang');
  var speciesName = btn.getAttribute('data-species');
  selectLang(lang, speciesName, btn);
}


// ── Active nav item ─────────────────────────────────────────
function setActiveNav(page) {
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });
}

// ── Toast notification ──────────────────────────────────────
function showToast(msg) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#1a3a5a;color:white;padding:10px 20px;border-radius:100px;font-size:13px;z-index:9999;opacity:0;transition:opacity 0.3s;pointer-events:none;white-space:nowrap';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = '1';
  setTimeout(() => { t.style.opacity = '0'; }, 2000);
}

// ── Saved species (localStorage) ───────────────────────────
function getSavedIds() {
  try { return JSON.parse(localStorage.getItem('fishsmarter_saved') || '[]'); }
  catch(e) { return []; }
}
function setSavedIds(ids) {
  localStorage.setItem('fishsmarter_saved', JSON.stringify(ids));
}
function toggleSaved(id) {
  const ids = getSavedIds();
  const idx = ids.indexOf(id);
  if (idx > -1) { ids.splice(idx, 1); showToast('Removed from saved'); }
  else { ids.push(id); showToast('✓ Saved'); }
  setSavedIds(ids);
  return ids.includes(id);
}

// ── Species emoji map ───────────────────────────────────────
const EMOJI_MAP = {
  salmon:'🐟', trout:'🐟', bass:'🐟', rockfish:'🐠', halibut:'🐟',
  tuna:'🐟', shark:'🦈', ray:'🦈', crab:'🦀', lobster:'🦞',
  shrimp:'🦐', prawn:'🦐', mussel:'🦪', oyster:'🦪', clam:'🦪',
  abalone:'🐚', urchin:'🦔', octopus:'🐙', squid:'🦑',
  anchovy:'🐟', sardine:'🐟', smelt:'🐟', perch:'🐟',
  sturgeon:'🐟', catfish:'🐟', carp:'🐟', tilapia:'🐟',
  kelp:'🌿', seaweed:'🌿', algae:'🌿', sea:'🌊',
  star:'⭐', anemone:'🌸', nudibranch:'🐛', worm:'🪱',
  barnacle:'🐚', snail:'🐌', limpet:'🐚', chiton:'🐚',
  invasive:'⚠️', pike:'⚠️', mussel_inv:'⚠️'
};
function getEmoji(name) {
  if (!name) return '🐟';
  const n = name.toLowerCase();
  for (const [k, v] of Object.entries(EMOJI_MAP)) {
    if (n.includes(k)) return v;
  }
  return '🐟';
}

// ── Derive open/closed/seasonal status ─────────────────────
function deriveStatus(reg) {
  if (!reg) return 'unknown';
  if (reg.bag_limit === 0) return 'closed';
  const sn = (reg.season_note || '').toLowerCase();
  if (sn.includes('closed') || sn.includes('prohibited')) return 'closed';
  if (sn.includes('year-round') || sn.includes('open year')) return 'open';
  if (sn.includes('seasonal') || sn.includes('season')) return 'seasonal';
  const now = new Date();
  if (reg.season_open && reg.season_close) {
    // Use current year instead of hardcoded 2024
    const yr = now.getFullYear();
    const open  = new Date(reg.season_open  + '/' + yr);
    const close = new Date(reg.season_close + '/' + yr);
    if (open <= now && now <= close) return 'open';
    return 'seasonal';
  }
  return 'open';
}
function getStatusLabel(s) {
  return s === 'open' ? 'Open' : s === 'closed' ? 'Closed' : s === 'seasonal' ? 'Seasonal' : 'Check Rules';
}
function getBadgeClass(s) {
  return s === 'open' ? 'badge-open' : s === 'closed' ? 'badge-closed' : 'badge-seasonal';
}
function formatSeason(reg) {
  if (!reg) return '';
  const sn = reg.season_note || '';
  if (sn.toLowerCase().includes('year-round') || sn.toLowerCase().includes('open year')) return 'Year-round';
  if (sn.toLowerCase().includes('closed') || sn.toLowerCase().includes('prohibited')) return sn;
  if (reg.season_open && reg.season_close) return reg.season_open + ' – ' + reg.season_close;
  return sn || 'Year-round';
}

// ── Weather icon helper ─────────────────────────────────────
function getWxIcon(text) {
  if (!text) return '🌤️';
  const t = text.toLowerCase();
  if (t.includes('thunder')) return '⛈️';
  if (t.includes('rain') || t.includes('shower')) return '🌧️';
  if (t.includes('fog')) return '🌫️';
  if (t.includes('snow')) return '🌨️';
  if (t.includes('partly')) return '⛅';
  if (t.includes('cloud') || t.includes('overcast')) return '☁️';
  if (t.includes('clear') || t.includes('sunny')) return '☀️';
  if (t.includes('wind')) return '💨';
  return '🌤️';
}

// ── Fishing Score (5-factor) ────────────────────────────────
// Inputs:
//   temp        — air temperature in °F (number or string like "65")
//   wind        — wind speed string from NWS, e.g. "10 mph" or "Calm"
//   forecastText — short forecast string, e.g. "Partly Cloudy"
//   tides       — array of NOAA tide prediction objects for the target day
//                 each: { t: "2026-04-25 06:30", v: "4.2", type: "H"|"L" }
//   targetDate  — Date object for the day being scored (used for time-of-day)
//
// Factors:
//   Baseline:          60
//   Temperature:      –20 to +18  (sweet spot 58–70°F)
//   Wind:             –35 to +15  (calm ≤5mph = +15, dangerous >25mph = –35)
//   Weather:          –40 to +10  (overcast = +5, clearing = +10, storm = –35)
//   Tide state:        –8 to +18  (incoming flood mid-phase = +18)
//   Tidal range bonus: +3 to  +6  (bigger swing = more activity)
//   Time of day:       –5 to +10  (dawn 5–8am or dusk 5–8pm = +10)
//
// Output: integer clamped 10–99
function calcFishingScore(temp, wind, forecastText, tides, targetDate) {
  var score = 60;

  // ── Temperature ──────────────────────────────────────────
  var t = parseInt(temp);
  if (!isNaN(t)) {
    if (t >= 58 && t <= 70)       score += 18;  // sweet spot
    else if (t >= 50 && t < 58)   score += 8;
    else if (t > 70 && t <= 80)   score += 5;
    else if (t >= 45 && t < 50)   score -= 5;
    else if (t > 80 && t <= 90)   score -= 10;
    else                           score -= 20;  // <45°F or >90°F
  }

  // ── Wind ─────────────────────────────────────────────────
  // NWS wind strings: "Calm", "5 mph", "10 to 15 mph", "15 mph"
  var windStr = (wind || '').toLowerCase();
  var windSpd = 0;
  if (windStr === 'calm' || windStr === '0 mph') {
    windSpd = 0;
  } else {
    // "10 to 15 mph" → take the higher number for conservative scoring
    var windNums = windStr.match(/\d+/g);
    if (windNums && windNums.length > 0) {
      windSpd = Math.max.apply(null, windNums.map(Number));
    }
  }
  if (windSpd <= 5)        score += 15;
  else if (windSpd <= 10)  score += 10;
  else if (windSpd <= 15)  score += 3;
  else if (windSpd <= 20)  score -= 10;
  else if (windSpd <= 25)  score -= 20;
  else                      score -= 35;  // dangerous

  // ── Weather condition ─────────────────────────────────────
  var f = (forecastText || '').toLowerCase();
  if (f.includes('thunder') || f.includes('storm'))        score -= 35;
  else if (f.includes('hurricane') || f.includes('blizzard')) score -= 40;
  else if (f.includes('heavy rain'))                        score -= 20;
  else if (f.includes('rain') || f.includes('shower'))     score -= 12;
  else if (f.includes('snow') || f.includes('sleet'))      score -= 15;
  else if (f.includes('fog'))                               score -= 8;
  else if (f.includes('clearing') || f.includes('clearing')) score += 10;
  else if (f.includes('overcast') || f.includes('cloudy')) score += 5;
  else if (f.includes('partly'))                            score += 3;
  else if (f.includes('clear') || f.includes('sunny'))     score += 5;

  // ── Tide state ────────────────────────────────────────────
  // Best fishing: incoming flood (rising tide), especially mid-phase.
  // Worst: approaching or at dead low slack.
  if (tides && tides.length > 0) {
    // Sort tide events for this day by time
    var sorted = tides.slice().sort(function(a, b) {
      return a.t.localeCompare(b.t);
    });

    // Find the next and previous tide events relative to targetDate
    var now = targetDate || new Date();
    // For a future day, use noon as the reference time for scoring
    var refHour = (now.toDateString() === new Date().toDateString()) ? now.getHours() : 12;
    var refMin  = refHour * 60 + ((now.toDateString() === new Date().toDateString()) ? now.getMinutes() : 0);

    function tideMinutes(t) {
      var parts = t.t.split(' ')[1].split(':');
      return parseInt(parts[0]) * 60 + parseInt(parts[1]);
    }

    // Find the surrounding tide pair (prev high/low and next high/low)
    var prev = null, next = null;
    for (var i = 0; i < sorted.length; i++) {
      var tm = tideMinutes(sorted[i]);
      if (tm <= refMin) prev = sorted[i];
      else if (!next)   next = sorted[i];
    }

    // If no prev, use last tide of day as anchor; if no next, use first
    if (!prev && sorted.length > 0) prev = sorted[sorted.length - 1];
    if (!next && sorted.length > 0) next = sorted[0];

    if (prev && next) {
      var prevM = tideMinutes(prev), nextM = tideMinutes(next);
      var totalSpan = nextM - prevM;
      if (totalSpan <= 0) totalSpan = 360; // fallback 6hr cycle
      var elapsed = refMin - prevM;
      var phase = elapsed / totalSpan; // 0 = just turned, 1 = arriving at next

      var incoming = (next.type === 'H'); // tide is rising toward a high
      var midPhase = phase >= 0.3 && phase <= 0.7;

      if (incoming && midPhase)           score += 18; // best: mid-flood
      else if (incoming && !midPhase)     score += 10; // early/late flood still good
      else if (!incoming && midPhase)     score -= 5;  // mid-ebb, moderate
      else                                score -= 8;  // approaching low slack

      // Tidal range bonus: larger swing = more water movement = more fish activity
      var highTide = sorted.find(function(t) { return t.type === 'H'; });
      var lowTide  = sorted.find(function(t) { return t.type === 'L'; });
      if (highTide && lowTide) {
        var range = parseFloat(highTide.v) - parseFloat(lowTide.v);
        if (range >= 5)      score += 6;
        else if (range >= 3) score += 3;
      }
    }
  }

  // ── Time of day ───────────────────────────────────────────
  // Dawn (5–8am) and dusk (5–8pm) are prime feeding times.
  // For future days, scored at noon — no bonus or penalty (neutral).
  var date = targetDate || new Date();
  var isToday = date.toDateString() === new Date().toDateString();
  if (isToday) {
    var hour = date.getHours();
    if (hour >= 5  && hour < 8)  score += 10; // dawn
    else if (hour >= 17 && hour < 20) score += 10; // dusk
    else if (hour >= 8  && hour < 17) score -= 3;  // midday — ok
    else                               score -= 5;  // night
  }
  // Future days: no time-of-day adjustment (scored at noon, no bias)

  return Math.max(10, Math.min(99, Math.round(score)));
}

function scoreColor(s) { return s >= 70 ? '#27ae60' : s >= 45 ? '#f0a500' : '#c0392b'; }
function scoreDesc(s) {
  if (s >= 80) return 'Excellent';
  if (s >= 70) return 'Good';
  if (s >= 55) return 'Fair';
  if (s >= 40) return 'Marginal';
  return 'Poor';
}

// ── NOAA tide stations ──────────────────────────────────────
const TIDE_STATIONS = [
  {id:'9415020', name:'Point Reyes',     lat:37.99, lng:-122.97},
  {id:'9414290', name:'San Francisco',   lat:37.81, lng:-122.47},
  {id:'9413450', name:'Monterey',        lat:36.60, lng:-121.89},
  {id:'9411340', name:'Santa Barbara',   lat:34.41, lng:-119.69},
  {id:'9410660', name:'Los Angeles',     lat:33.72, lng:-118.27},
  {id:'9410230', name:'La Jolla',        lat:32.87, lng:-117.26},
  {id:'9416841', name:'Arena Cove',      lat:38.91, lng:-123.71},
  {id:'9418767', name:'North Spit',      lat:40.77, lng:-124.22},
];
function nearestStation(lat, lng) {
  return TIDE_STATIONS.reduce((best, s) => {
    const d = Math.hypot(s.lat - lat, s.lng - lng);
    return d < Math.hypot(best.lat - lat, best.lng - lng) ? s : best;
  });
}

// selectLang — called when user taps a language pill
// Finds the nearest translatable block and re-renders it in the chosen language
async function selectLang(lang, speciesName, btn) {
  if (lang === currentLang) return;
  currentLang = lang;

  // Update pill styles
  var container = btn.closest('.lang-pills');
  if (container) {
    container.querySelectorAll('.lang-pill').forEach(function(b) {
      var active = b.getAttribute('data-lang') === lang;
      b.classList.toggle('active', active);
      b.style.background = active ? 'var(--ocean)' : 'var(--bg)';
      b.style.color = active ? '#fff' : 'var(--text)';
      b.style.borderColor = active ? 'var(--ocean)' : 'var(--border)';
    });
  }

  // Find the translatable content block
  var block = document.getElementById('translatable-content');
  if (!block) return;

  if (lang === 'en') {
    // Restore original content
    if (block._originalHtml) block.innerHTML = block._originalHtml;
    return;
  }

  // Save original on first translation
  if (!block._originalHtml) block._originalHtml = block.innerHTML;

  // Show loading indicator
  var loadingEl = document.getElementById('translate-loading');
  if (loadingEl) {
    loadingEl.textContent = 'Translating…';
    loadingEl.style.display = 'block';
  }

  // Extract translatable fields from data attributes on the block
  var fields = {};
  block.querySelectorAll('[data-translate]').forEach(function(el) {
    var key = el.getAttribute('data-translate');
    if (el.textContent.trim()) fields[key] = el.textContent.trim();
  });

  var translations = await translateFields(lang, speciesName, fields);

  // Apply translations
  if (translations) {
    block.querySelectorAll('[data-translate]').forEach(function(el) {
      var key = el.getAttribute('data-translate');
      if (translations[key]) el.textContent = translations[key];
    });
  }

  if (loadingEl) loadingEl.style.display = 'none';
}
