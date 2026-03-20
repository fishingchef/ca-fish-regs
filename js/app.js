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
function calcFishingScore(temp, wind, forecastText) {
  let score = 70;
  if (temp) {
    const t = parseInt(temp);
    if (t >= 55 && t <= 75) score += 15;
    else if (t < 45 || t > 85) score -= 20;
  }
  if (wind) {
    const spd = parseInt(wind);
    if (spd <= 10) score += 15;
    else if (spd <= 15) score += 5;
    else if (spd <= 20) score -= 10;
    else score -= 25;
  }
  if (forecastText) {
    const f = forecastText.toLowerCase();
    if (f.includes('clear') || f.includes('sunny')) score += 5;
    if (f.includes('thunder') || f.includes('storm')) score -= 30;
    if (f.includes('rain')) score -= 10;
    if (f.includes('fog')) score -= 5;
  }
  return Math.max(10, Math.min(99, score));
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
