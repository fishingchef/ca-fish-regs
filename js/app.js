// ============================================================
// Fish Smarter — Shared App Utilities
// ============================================================

// Supabase
const SUPABASE_URL = 'https://maqffkhgynuzbvpbueds.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_3Lh4gmjt2Wvvp0u76qqkrQ_3h-DqVwY';
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── Region config ───────────────────────────────────────────
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

async function translateFields(lang, speciesName, fields) {
  if (lang === 'en') return null;
  var toTranslate = {};
  var cached = {};
  Object.keys(fields).forEach(function(key) {
    var c = getCachedTranslation(lang, speciesName, key);
    if (c) cached[key] = c;
    else if (fields[key]) toTranslate[key] = fields[key];
  });
  if (Object.keys(toTranslate).length === 0) return cached;
  var langName = SUPPORTED_LANGUAGES[lang].name;
  try {
    var res = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lang: lang, langName: langName, fields: toTranslate })
    });
    if (!res.ok) return cached;
    var translated = await res.json();
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

function buildLangPills(speciesName) {
  var html = '<div class="lang-pills" id="langPills">';
  Object.keys(SUPPORTED_LANGUAGES).forEach(function(code) {
    var lang = SUPPORTED_LANGUAGES[code];
    var isActive = code === currentLang;
    html += '<button class="lang-pill' + (isActive ? ' active' : '') + '" ' +
      'data-lang="' + code + '" ' +
      'data-species="' + speciesName.replace(/"/g, '&quot;') + '" ' +
      'onclick="handleLangPill(this)">' + lang.label + '</button>';
  });
  html += '</div>';
  return html;
}

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
  if (/^(closed|prohibited|no take|no recreational)/.test(sn)) return 'closed';
  if (sn.includes('year-round') || sn.includes('open year')) return 'open';
  if (sn.includes('seasonal') || sn.includes('season')) return 'seasonal';
  if (sn.includes('closed') || sn.includes('prohibited')) return 'open';
  const now = new Date();
  if (reg.season_open && reg.season_close) {
    const open = new Date(reg.season_open + '/2024');
    const close = new Date(reg.season_close + '/2024');
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

// ── Fishing score ───────────────────────────────────────────
// Inputs:
//   temp         — air temp string e.g. "62" (°F), from NWS forecast
//   wind         — wind string e.g. "7 mph", from NWS forecast
//   forecastText — NWS short forecast e.g. "Partly Sunny"
//   tides        — array of NOAA hi/lo predictions for the day [{t, v, type}], optional
//   targetDate   — Date object for the day being scored, optional (defaults to now)
//
// Score breakdown:
//   Baseline:       60
//   Temperature:   -20 to +18
//   Wind:          -35 to +15
//   Weather:       -40 to +10
//   Tide state:     -8 to +18  (only when tides provided)
//   Tidal range:     0 to  +6  (only when tides provided)
//   Time of day:    -5 to +10
//   Total range:    10–99

function calcFishingScore(temp, wind, forecastText, tides, targetDate) {
  var score = 60;

  // ── 1. Air temperature ─────────────────────────────────────
  // Coastal CA sweet spot: 55–72°F. Fish are most active in mild temps.
  if (temp) {
    var t = parseInt(temp);
    if (t >= 58 && t <= 70)      score += 18;
    else if (t >= 50 && t < 58)  score += 10;
    else if (t > 70 && t <= 80)  score += 10;
    else if (t > 80 && t <= 88)  score += 0;
    else if (t > 88)             score -= 15;
    else if (t >= 40 && t < 50)  score -= 5;
    else if (t < 40)             score -= 20;
  }

  // ── 2. Wind speed ──────────────────────────────────────────
  // Calm = glassy water, good casting, fish near surface.
  // Strong = rough, dangerous, fish go deep.
  if (wind) {
    var spd = parseInt(wind);
    if (spd <= 5)        score += 15;
    else if (spd <= 10)  score += 12;
    else if (spd <= 15)  score += 4;
    else if (spd <= 20)  score -= 12;
    else if (spd <= 25)  score -= 22;
    else                 score -= 35;
  }

  // ── 3. Weather condition ───────────────────────────────────
  // Overcast is often GOOD — fish less spooked, feed near surface.
  // Storm = dangerous and terrible bite.
  if (forecastText) {
    var f = forecastText.toLowerCase();
    if (f.includes('thunder') || f.includes('storm'))           score -= 35;
    else if (f.includes('hurricane') || f.includes('gale'))     score -= 40;
    else if (f.includes('heavy rain') || f.includes('heavy shower')) score -= 18;
    else if (f.includes('rain') || f.includes('shower'))        score -= 8;
    else if (f.includes('overcast') || f.includes('mostly cloudy')) score += 5;
    else if (f.includes('partly cloudy') || f.includes('partly sunny')) score += 8;
    else if (f.includes('clear') || f.includes('sunny'))        score += 5;
    if (f.includes('fog'))                                       score -= 5;
    // Pressure cues: approaching front = fish feed before it hits (brief bite window)
    if (f.includes('becoming') && (f.includes('rain') || f.includes('storm'))) score += 6;
    // Clearing after rain = pressure rising = reliable bite window
    if (f.includes('clearing') || f.includes('decreasing clouds')) score += 10;
  }

  // ── 4. Tide state ──────────────────────────────────────────
  // The single strongest fishing predictor we have real data for.
  // Incoming (flood) tide: fish push into shallows to feed — best bite.
  // Around high tide: fish are positioned, good but slowing.
  // Outgoing (ebb): fish follow food washing out — decent.
  // Around low tide: fish scatter to deeper water — toughest bite.
  if (tides && tides.length > 0) {
    var checkDate = targetDate ? new Date(targetDate) : new Date();
    var nowMin = checkDate.getHours() * 60 + checkDate.getMinutes();

    var tidePts = tides.map(function(tide) {
      var parts = tide.t.split(' ')[1].split(':');
      return {
        min: parseInt(parts[0]) * 60 + parseInt(parts[1]),
        ht: parseFloat(tide.v),
        type: tide.type
      };
    }).sort(function(a, b) { return a.min - b.min; });

    // Find the two tide events bracketing our target time
    var before = null, after = null;
    for (var i = 0; i < tidePts.length; i++) {
      if (tidePts[i].min <= nowMin) before = tidePts[i];
      else if (!after) after = tidePts[i];
    }

    if (before && after) {
      var elapsed = nowMin - before.min;
      var window = after.min - before.min;
      var pct = elapsed / window; // 0 = just after 'before', 1 = just before 'after'

      if (before.type === 'L' && after.type === 'H') {
        // Incoming (flood) tide — prime fishing
        if (pct < 0.15)      score += 8;
        else if (pct < 0.50) score += 18;
        else if (pct < 0.85) score += 14;
        else                 score += 8;
      } else if (before.type === 'H' && after.type === 'L') {
        // Outgoing (ebb) tide — decent
        if (pct < 0.15)      score += 8;
        else if (pct < 0.50) score += 2;
        else if (pct < 0.85) score -= 5;
        else                 score -= 8;
      }

      // Tidal range bonus — bigger swing = more water movement = more active fish
      var range = Math.abs(after.ht - before.ht);
      if (range >= 4.0)      score += 6;
      else if (range >= 2.5) score += 3;

    } else if (before) {
      // Edge of day — minor nudge based on last tide type
      score += before.type === 'H' ? 3 : -3;
    }
  }

  // ── 5. Time of day ─────────────────────────────────────────
  // Dawn and dusk are peak feeding windows for most species.
  // Only meaningful when we have a real time context.
  if (targetDate || tides) {
    var timeRef = targetDate ? new Date(targetDate) : new Date();
    var hr = timeRef.getHours();
    if (hr >= 5 && hr < 8)        score += 10; // dawn — golden hour
    else if (hr >= 8 && hr < 10)  score += 5;  // morning
    else if (hr >= 17 && hr < 20) score += 10; // dusk — golden hour
    else if (hr >= 20)            score -= 5;  // night
  }

  return Math.max(10, Math.min(99, score));
}

function scoreColor(s) {
  return s >= 70 ? '#27ae60' : s >= 45 ? '#f0a500' : '#c0392b';
}
function scoreDesc(s) {
  if (s >= 85) return 'Excellent';
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

// ── selectLang ─────────────────────────────────────────────
async function selectLang(lang, speciesName, btn) {
  if (lang === currentLang) return;
  currentLang = lang;
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
  var block = document.getElementById('translatable-content');
  if (!block) return;
  if (lang === 'en') {
    if (block._originalHtml) block.innerHTML = block._originalHtml;
    return;
  }
  if (!block._originalHtml) block._originalHtml = block.innerHTML;
  var loadingEl = document.getElementById('translate-loading');
  if (loadingEl) { loadingEl.textContent = 'Translating…'; loadingEl.style.display = 'block'; }
  var fields = {};
  block.querySelectorAll('[data-translate]').forEach(function(el) {
    var key = el.getAttribute('data-translate');
    if (el.textContent.trim()) fields[key] = el.textContent.trim();
  });
  var translations = await translateFields(lang, speciesName, fields);
  if (translations) {
    block.querySelectorAll('[data-translate]').forEach(function(el) {
      var key = el.getAttribute('data-translate');
      if (translations[key]) el.textContent = translations[key];
    });
  }
  if (loadingEl) loadingEl.style.display = 'none';
}
