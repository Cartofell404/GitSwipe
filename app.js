/* GitSwipe: a vertical feed of random GitHub repos.
   No build step, no dependencies. */

"use strict";

/* ---------------- storage (safe when localStorage is blocked) ---------------- */
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
  list(k) {
    try { const v = JSON.parse(localStorage.getItem(k)); return Array.isArray(v) ? v : []; }
    catch { return []; }
  },
};

const STORAGE_KEYS = {
  SAVED: "gitswipe_saved",
  PROMOS: "gitswipe_promos", // ids of the in-feed cards the visitor dismissed or used
};

// One-time migration: storage keys were "gittok_*" before the rename to GitSwipe.
["saved"].forEach((k) => {
  const old = store.get("gittok_" + k);
  if (old !== null && store.get("gitswipe_" + k) === null) store.set("gitswipe_" + k, old);
});
// Token, starring, the taste recommender and the filter system are gone: clean up every leftover key.
["gittok_saved", "gittok_token", "gittok_starred", "gittok_taste",
 "gitswipe_token", "gitswipe_starred", "gitswipe_taste", "gittok_oauth_state",
 "gitswipe_filters"].forEach((k) => store.del(k));

const state = {
  buffer: [],          // fetched, not yet rendered
  seen: new Set(),     // repo ids already fetched this session
  loading: false,
  gen: 0,              // bumped on shuffle so stale fetches are discarded
  pausedUntil: 0,      // rate-limit lock (timestamp)
  resumeTimer: null,
  notice: "",          // last failure message, shown in the empty state
  saved: store.list(STORAGE_KEYS.SAVED).filter((s) => s && s.id && s.owner),
};

const $ = (id) => document.getElementById(id);
const feed = $("feed"), statusEl = $("status"), toastEl = $("toast");
const emptyState = $("emptyState"), emptyMsg = $("emptyMsg"), btnRetry = $("btnRetry");
const savedPanel = $("savedPanel"), savedList = $("savedList");

/* ---------------- icons ---------------- */
const ICONS = {
  shuffle: '<path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>',
  bookmark: '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  external: '<path d="M14 4h6v6M20 4 10 14M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  fork: '<circle cx="6" cy="5" r="2"/><circle cx="18" cy="5" r="2"/><circle cx="12" cy="19" r="2"/><path d="M6 7v2a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V7M12 12v5"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19V5M9 8h6"/>',
  issue: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h0"/>',
  terminal: '<path d="M4 17l6-6-6-6M12 19h8"/>',
  bars: '<path d="M4 20v-6M10 20V5M16 20v-9M22 20H2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h0"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.5 7.2L4 20l1-4.5A8 8 0 1 1 21 12z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z"/>',
  map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14"/>',
  pause: '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
  gem: '<path d="M12 21 3 9l3-6h12l3 6z"/><path d="M3 9h18M8 9l4 12 4-12M8 3 6 9M16 3l2 6"/>',
};
const icon = (n) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[n]}</svg>`;
document.querySelectorAll("[data-icon]").forEach((el) => (el.innerHTML = icon(el.dataset.icon)));

/* ---------------- helpers ---------------- */
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const trim1 = (x) => x.toFixed(1).replace(/\.0$/, "");
function fmt(n) {
  n = n || 0;
  if (n >= 999950) return trim1(n / 1e6) + "M";
  if (n >= 1e3) return trim1(n / 1e3) + "k";
  return String(n);
}
const fmtSize = (kb) => (kb >= 1024 ? trim1(kb / 1024) + " MB" : (kb || 0) + " KB");

function timeAgo(iso) {
  if (!iso) return "";
  const secs = (Date.now() - new Date(iso).getTime()) / 1000;
  const units = [[31536000, "y"], [2592000, "mo"], [604800, "w"], [86400, "d"], [3600, "h"], [60, "m"]];
  for (const [s, label] of units) if (secs >= s) return `${Math.floor(secs / s)}${label} ago`;
  return "just now";
}

function avatar(url, size) {
  try { const u = new URL(url); u.searchParams.set("s", size); return u.href; }
  catch { return url; }
}

let toastTimer;
function toast(msg, ms = 2600) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastEl.hidden = true), ms);
}
function setStatus(msg) {
  statusEl.textContent = msg;
  statusEl.hidden = !msg;
}

/* a light tick on devices that support vibration (Android); silently ignored elsewhere */
const haptic = (ms = 10) => { try { navigator.vibrate?.(ms); } catch {} };

function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const LANG_COLORS = {
  JavaScript: "#f1e05a", TypeScript: "#3178c6", Python: "#3572A5", Rust: "#dea584",
  Go: "#00ADD8", Java: "#b07219", "C++": "#f34b7d", C: "#8a8a8a", Swift: "#F05138",
  Kotlin: "#A97BFF", Ruby: "#cc342d", PHP: "#8892bf", "C#": "#178600", HTML: "#e34c26",
  CSS: "#7a5cc7", Shell: "#89e051", Dart: "#00B4AB", Vue: "#41b883", Zig: "#ec915c",
  Haskell: "#8f7bd1", Elixir: "#9a6bb5", Lua: "#4a6fe3", Scala: "#e8414f", OCaml: "#ef7a08",
  "Jupyter Notebook": "#DA5B0B", Svelte: "#ff3e00", Nix: "#7e7eff", R: "#198CE7",
  "Objective-C": "#438eff", Perl: "#39b6d8",
};

/* ---------------- random search ---------------- */
/* GitHub's search API can't order by random, so the query itself is randomised:
   language, star range, age, extra qualifier, sort order and result page.
   Popularity is deliberately mixed: every batch draws from hot, mid and hidden-gem
   tiers, and the buffer is dealt round-robin so one batch never clumps. */
const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
const shuffleArr = (a) => {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

const LANGS = Object.keys(LANG_COLORS);
const TIERS = {
  hot: { label: "Popular", icon: "star", ranges: ["stars:>10000", "stars:5000..50000", "stars:>20000", "stars:2000..20000"] },
  mid: { label: "Mid-size", icon: "bars", ranges: ["stars:200..5000", "stars:500..2000", "stars:100..1000", "stars:1000..5000"] },
  gem: { label: "Hidden gem", icon: "gem", ranges: ["stars:0..50", "stars:0..100", "stars:10..200", "stars:50..200"] },
};
const TIER_ORDER = ["hot", "mid", "gem"];
const SORTS = ["stars", "forks", "help-wanted-issues", "updated"];
const EXTRA = ["", "", "archived:false", "fork:false", "mirror:false", "help-wanted-issues:>3"];

/* rotate through tiers and languages so consecutive queries differ */
let tierPlan = [], langQueue = [];
function nextFrom(queue, pool) { if (!queue.length) queue.push(...shuffleArr(pool)); return queue.shift(); }
function nextTier() {
  if (!tierPlan.length) tierPlan.push(...shuffleArr(TIER_ORDER));
  return tierPlan.shift();
}

const daysAgo = (d) => new Date(Date.now() - d * 864e5).toISOString().slice(0, 10);
const ageQualifier = () =>
  rand(["", "", `created:>${daysAgo(365)}`, `created:${daysAgo(1095)}..${daysAgo(365)}`,
        `created:<${daysAgo(1825)}`, `pushed:>${daysAgo(30)}`]);

class ApiError extends Error {
  constructor(message, kind, until = 0) { super(message); this.kind = kind; this.until = until; }
}

async function fetchPage(q, sort, page) {
  const url = "https://api.github.com/search/repositories?" +
    new URLSearchParams({ q, sort, order: "desc", per_page: "30", page: String(page) });

  let res;
  try { res = await fetch(url, { headers: { Accept: "application/vnd.github+json" } }); }
  catch { throw new ApiError("Can't reach GitHub. Check your connection.", "net"); }

  if (res.status === 403 || res.status === 429) {
    const retry = Number(res.headers.get("Retry-After"));
    const reset = Number(res.headers.get("X-RateLimit-Reset"));
    const until = retry ? Date.now() + retry * 1000 : reset ? reset * 1000 : Date.now() + 60000;
    throw new ApiError("Rate limit reached.", "rate", Math.max(until, Date.now() + 5000));
  }
  if (!res.ok) throw new ApiError(`GitHub returned an error (${res.status}).`, "http");
  return (await res.json()).items || [];
}

function randomQuery() {
  const tier = nextTier();
  const lang = nextFrom(langQueue, LANGS);
  return {
    q: [`language:"${lang}"`, rand(TIERS[tier].ranges), ageQualifier(), rand(EXTRA)].filter(Boolean).join(" "),
    sort: rand(SORTS),
    page: 1 + Math.floor(Math.random() * 8), why: TIERS[tier].label, tier,
  };
}

async function searchRandom() {
  const { q, sort, page, why, tier } = randomQuery();
  let items = await fetchPage(q, sort, page);
  // Narrow queries run out of results before page 8: fall back to page 1.
  if (!items.length && page > 1) items = await fetchPage(q, sort, 1);
  items.forEach((r) => { r._why = why; r._tier = tier; });
  return items;
}

/* ---------------- feed building ---------------- */
function updateEmpty() {
  if (feed.children.length) { emptyState.hidden = true; return; }
  emptyState.hidden = false;
  emptyState.classList.toggle("is-error", !state.loading);
  emptyMsg.textContent = state.loading ? "Finding random repos…" : state.notice || "No repos found.";
  btnRetry.hidden = state.loading || Date.now() < state.pausedUntil;
}

function handleFailure(err) {
  state.notice = err.message;
  if (err.kind === "rate") {
    state.pausedUntil = err.until;
    const at = new Date(err.until).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    state.notice = `Rate limit reached. Resuming at ${at}.`;
    setStatus(state.notice);
    clearTimeout(state.resumeTimer);
    state.resumeTimer = setTimeout(() => { state.notice = ""; setStatus(""); ensureContent(); }, err.until - Date.now() + 500);
  } else {
    setStatus("");
    toast(err.message, 5000);
  }
}

/* deal the buffer round-robin across popularity tiers so cards always alternate */
function interleave() {
  const groups = TIER_ORDER.map((t) => shuffleArr(state.buffer.filter((r) => (r._tier || "mid") === t)));
  const out = [];
  let added = true;
  while (added) {
    added = false;
    for (const g of groups) { const r = g.shift(); if (r) { out.push(r); added = true; } }
  }
  state.buffer = out;
}

async function ensureContent() {
  if (state.loading || Date.now() < state.pausedUntil) return;
  if (state.buffer.length >= 8) { renderBatch(6); return; }

  const gen = state.gen;
  state.loading = true;
  state.notice = "";
  setStatus("Finding random repos…");
  updateEmpty();

  let failure = null;
  try {
    // Every batch pulls a few queries so the buffer spans the star spectrum.
    for (let i = 0; i < 3 && state.buffer.length < 100; i++) {
      const items = await searchRandom();
      if (gen !== state.gen) return;
      const fresh = items.filter((r) => !state.seen.has(r.id));
      fresh.forEach((r) => state.seen.add(r.id));
      state.buffer.push(...fresh);
    }
  } catch (err) {
    if (gen !== state.gen) return;
    failure = err;
  } finally {
    if (gen === state.gen) state.loading = false;
  }
  if (gen !== state.gen) return;

  interleave();
  renderBatch(6);
  if (failure) handleFailure(failure);
  else setStatus("");
  updateEmpty();
}

/* ---------------- promo cards ----------------
   Looks like any other card and shows up once every PROMO_EVERY repos. The kinds rotate
   (Discord, star, follow, feedback, roadmap, take-a-break) so it is never the same pitch twice
   in a row. Dismiss or use one and that kind never comes back (localStorage: gitswipe_promos,
   covered by the Privacy & Legal text). The take-a-break card is the exception: it has nothing
   to sell, so it may return.

   TO TURN DISCORD ON: set DISCORD_URL to a permanent invite (Server settings > Invites >
   "Never expires"). While it is left as the placeholder, the Discord card and the link in
   Privacy & Legal stay hidden, so nothing points at a dead invite. */
const DISCORD_URL = "https://discord.gg/YOUR-INVITE"; // <- your permanent invite
const REPO_URL = "https://github.com/Cartofell404/gitswipe";
const PROFILE_URL = "https://github.com/Cartofell404";
const PROMO_EVERY = 12; // one card per 12 repos
const DISCORD_READY = !DISCORD_URL.includes("YOUR-INVITE") &&
  (DISCORD_URL.startsWith("https://discord.gg/") || DISCORD_URL.startsWith("https://discord.com/invite/"));
const GH_MARK = '<svg class="gh" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor"><path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"/></svg>';
let reposShown = 0;

const PROMOS = [
  { id: "discord", ready: DISCORD_READY, accent: "#5865F2", glyph: "#", icon: "chat", why: "Community",
    title: "Found something good?",
    text: "Share your finds, get recommendations and help shape what GitSwipe becomes.",
    cta: "Join the Discord", href: DISCORD_URL },
  { id: "star", accent: "#e3b341", glyph: "*", icon: "star", why: "Open source",
    title: "Enjoying GitSwipe?",
    text: "A star on GitHub helps other developers find it. It's free and takes one tap.",
    cta: "Star on GitHub", href: REPO_URL, gh: true },
  { id: "follow", accent: "#2f81f7", glyph: "@", icon: "user", why: "Made by",
    title: "Built by cartofell404",
    text: "Follow along on GitHub for more small, useful tools like this one.",
    cta: "Follow on GitHub", href: PROFILE_URL, gh: true },
  { id: "idea", accent: "#3fb950", glyph: "?", icon: "bulb", why: "Feedback",
    title: "Missing something?",
    text: "Report a bug or suggest a feature. It only takes a minute on GitHub.",
    cta: "Open an issue", href: REPO_URL + "/issues/new", gh: true },
  { id: "roadmap", accent: "#a371f7", glyph: "//", icon: "map", why: "Roadmap",
    title: "See what's next",
    text: "Undo, deep links, a daily reading goal and smarter feeds are on the list. Tell us what to build first.",
    cta: "Read the roadmap", href: REPO_URL + "/blob/main/ROADMAP.md" },
  // Nothing to sell: just a nudge to stop scrolling, in line with the app's goal. Can come back.
  { id: "break", session: true, when: () => reposShown >= 24, accent: "#f0883e", glyph: "zZ", icon: "pause", why: "Take a break",
    title: "Try one before you swipe on",
    text: () => state.saved.length
      ? "Swiping is only useful if something gets used. Pick a saved repo and actually try it."
      : "Swiping is only useful if something gets used. Save one you like, then try it.",
    cta: "Open saved", action: () => { renderSaved(); savedPanel.showModal(); }, needsSaved: true, skip: "Keep swiping" },
];

const dismissedPromos = () => new Set(store.list(STORAGE_KEYS.PROMOS));
function dismissPromo(id) {
  const set = dismissedPromos();
  set.add(id);
  store.set(STORAGE_KEYS.PROMOS, JSON.stringify([...set]));
}
// older versions only had the Discord card (gitswipe_discord = "1" once dismissed)
if (store.get("gitswipe_discord") === "1") dismissPromo("discord");
store.del("gitswipe_discord");

if (DISCORD_READY) { // a passive link in Privacy & Legal, only once a real invite is configured
  const link = document.createElement("a");
  link.href = DISCORD_URL;
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = "Discord";
  document.querySelector(".legal-foot")?.appendChild(link);
}

/* pick the next promo: shuffled round, never the same one twice in a row */
let promoQueue = [], lastPromo = null;
function nextPromo() {
  const done = dismissedPromos();
  const live = PROMOS.filter((p) => p.ready !== false && (p.session || !done.has(p.id)) && (!p.when || p.when()));
  if (!live.length) return null;
  promoQueue = promoQueue.filter((p) => live.includes(p));
  if (!promoQueue.length) {
    promoQueue = shuffleArr(live);
    if (live.length > 1 && promoQueue[0] === lastPromo) promoQueue.push(promoQueue.shift());
  }
  return (lastPromo = promoQueue.shift());
}

/* render one batch, slipping a promo card in at the cadence */
function renderBatch(count) {
  const slice = state.buffer.splice(0, count);
  if (!slice.length) return;
  const first = feed.children.length === 0;
  const frag = document.createDocumentFragment();
  slice.forEach((repo, i) => {
    frag.appendChild(buildCard(repo, first && i === 0));
    if (++reposShown % PROMO_EVERY === 0) {
      const p = nextPromo();
      if (p) frag.appendChild(buildPromoCard(p));
    }
  });
  feed.appendChild(frag);
}

function buildPromoCard(p) {
  const el = document.createElement("section");
  el.className = "card promo";
  el.dataset.promo = p.id;
  el.setAttribute("aria-label", p.title);
  el.style.setProperty("--accent", p.accent);
  const text = typeof p.text === "function" ? p.text() : p.text;
  const showPrimary = p.href || (p.action && (!p.needsSaved || state.saved.length));
  const primary = !showPrimary ? ""
    : p.href
      ? `<a class="btn join" href="${esc(p.href)}" target="_blank" rel="noopener">${p.gh ? GH_MARK : ""}<span>${esc(p.cta)}</span></a>`
      : `<button type="button" class="btn join">${icon("bookmark")}<span>${esc(p.cta)}</span></button>`;
  el.innerHTML = `
    <div class="glyph" aria-hidden="true">${esc(p.glyph)}</div>
    <div class="card-inner">
      <div class="info">
        <span class="why">${icon(p.icon)}<span>${esc(p.why)}</span></span>
        <h2 class="repo-name">${esc(p.title)}</h2>
        <p class="repo-desc">${esc(text)}</p>
        <div class="promo-actions">
          ${primary}
          <button type="button" class="promo-skip">${esc(p.skip || "No thanks")}</button>
        </div>
      </div>
    </div>`;
  const finish = () => { if (!p.session) dismissPromo(p.id); };
  el.querySelector(".join")?.addEventListener("click", () => { finish(); p.action?.(); });
  el.querySelector(".promo-skip").addEventListener("click", () => {
    finish();
    const next = el.nextElementSibling; // a declined card shouldn't linger
    el.remove();
    if (next) next.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  return el;
}

function buildCard(repo, isFirst) {
  const el = document.createElement("section");
  el.className = "card";
  el.dataset.id = repo.id;
  const accent = LANG_COLORS[repo.language] || `hsl(${hash(repo.full_name) % 360} 60% 52%)`;
  el.style.setProperty("--accent", accent);

  const topics = (repo.topics || []).slice(0, 4);
  const license = repo.license?.spdx_id && repo.license.spdx_id !== "NOASSERTION" ? repo.license.spdx_id : "";
  const glyph = repo.name.replace(/[^a-z0-9]/gi, "").slice(0, 2).toUpperCase();
  const owner = esc(repo.owner.login);

  el.innerHTML = `
    <div class="glyph" aria-hidden="true">${esc(glyph)}</div>
    <div class="card-inner">
      <div class="info">
        ${repo._why ? `<span class="why">${icon(TIERS[repo._tier]?.icon || "star")}<span>${esc(repo._why)}</span></span>` : ""}
        <a class="owner" href="https://github.com/${encodeURIComponent(repo.owner.login)}" target="_blank" rel="noopener">
          <img src="${esc(avatar(repo.owner.avatar_url, 64))}" alt="" loading="lazy" /><span>${owner}</span>
        </a>
        <h2 class="repo-name" data-act="details" title="Open details">${esc(repo.name)}</h2>
        <p class="repo-desc" data-act="details" title="Open details">${esc(repo.description || "No description provided.")}</p>
        ${topics.length ? `<ul class="topics">${topics.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}
        <div class="stats">
          <span>${icon("fork")}${fmt(repo.forks_count)}</span>
          <span>${icon("issue")}${fmt(repo.open_issues_count)}</span>
          ${repo.language ? `<span><i class="lang-dot" style="--dot:${esc(accent)}"></i>${esc(repo.language)}</span>` : ""}
        </div>
        <div class="meta">
          ${license ? `<span>${esc(license)}</span>` : ""}
          <span>Updated ${timeAgo(repo.pushed_at)}</span>
          <span>${fmtSize(repo.size)}</span>
        </div>
      </div>
      <div class="rail">
        <div class="rail-count" aria-label="${fmt(repo.stargazers_count)} stars on GitHub">
          <span class="ico">${icon("star")}</span><span class="count">${fmt(repo.stargazers_count)}</span>
        </div>
        <button class="rail-btn btn-save" data-act="save" aria-label="Save ${esc(repo.full_name)}">
          <span class="ico">${icon("bookmark")}</span><span class="rail-label"></span>
        </button>
        <button class="rail-btn" data-act="details" aria-label="Read more about ${esc(repo.full_name)}">
          <span class="ico">${icon("book")}</span><span class="rail-label">Details</span>
        </button>
        <button class="rail-btn" data-act="share" aria-label="Share ${esc(repo.full_name)}">
          <span class="ico">${icon("share")}</span><span class="rail-label">Share</span>
        </button>
        <button class="rail-btn" data-act="clone" aria-label="Copy clone command for ${esc(repo.full_name)}">
          <span class="ico">${icon("terminal")}</span><span class="rail-label">Clone</span>
        </button>
        <a class="rail-btn open" href="${esc(repo.html_url)}" target="_blank" rel="noopener" aria-label="Open ${esc(repo.full_name)} on GitHub">
          <span class="ico">${icon("external")}</span><span class="rail-label">Open</span>
        </a>
      </div>
    </div>
    ${isFirst ? `<div class="hint">Swipe up or use ↑ ↓</div>` : ""}
  `;

  const saveBtn = el.querySelector('[data-act="save"]');
  setSave(saveBtn, state.saved.some((s) => s.id === repo.id));
  saveBtn.addEventListener("click", () => toggleSave(repo, saveBtn));
  el.querySelectorAll('[data-act="details"]').forEach((b) => b.addEventListener("click", () => openDetail(repo)));
  el.querySelector('[data-act="share"]').addEventListener("click", () => shareRepo(repo));
  el.querySelector('[data-act="clone"]').addEventListener("click", () => copyClone(repo));
  return el;
}

/* ---------------- actions ---------------- */
function setToggle(btn, on, onTxt, offTxt) {
  btn.classList.toggle("is-on", on);
  btn.setAttribute("aria-pressed", String(on));
  btn.querySelector(".rail-label").textContent = on ? onTxt : offTxt;
}
const setSave = (b, on) => setToggle(b, on, "Saved", "Save");

function toggleSave(repo, btn) {
  const idx = state.saved.findIndex((s) => s.id === repo.id);
  if (idx >= 0) {
    state.saved.splice(idx, 1);
    setSave(btn, false);
    toast("Removed from saved");
  } else {
    state.saved.push({
      id: repo.id, full_name: repo.full_name, name: repo.name, description: repo.description,
      html_url: repo.html_url, stargazers_count: repo.stargazers_count, language: repo.language, topics: repo.topics,
      owner: { login: repo.owner.login, avatar_url: repo.owner.avatar_url },
    });
    setSave(btn, true);
    toast("Saved");
  }
  haptic();
  store.set(STORAGE_KEYS.SAVED, JSON.stringify(state.saved));
  updateSavedBadge();
}

function updateSavedBadge() {
  const badge = $("savedCount");
  badge.textContent = state.saved.length;
  badge.hidden = state.saved.length === 0;
}

/* native share sheet where the platform has one, clipboard copy everywhere else */
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch { return false; } // no permission or insecure context
}

async function shareRepo(repo) {
  const payload = { title: repo.full_name, text: repo.description || `Check out ${repo.full_name} on GitHub`, url: repo.html_url };
  if (navigator.share) {
    try { await navigator.share(payload); return; }
    catch (err) { if (err && err.name === "AbortError") return; } // user closed the sheet; anything else falls through
  }
  if (await copyText(repo.html_url)) { toast("Link copied to clipboard"); haptic(); }
  else toast(repo.html_url, 5000); // clipboard unavailable: show the link
}

/* the one-liner: git clone is the only command that always points at this exact repo.
   npm i / pip install style guesses can silently install someone else's package. */
const cloneCmd = (repo) => `git clone ${repo.html_url}`;

function copyClone(repo) {
  const cmd = cloneCmd(repo);
  copyText(cmd).then((ok) => {
    toast(ok ? `Copied: ${cmd}` : cmd, ok ? 2800 : 5200);
    haptic();
  });
}

/* ---------------- dialogs ---------------- */
document.querySelectorAll("dialog").forEach((dlg) => {
  dlg.addEventListener("click", (e) => {
    if (e.target === dlg) {
      const r = dlg.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dlg.close();
    }
  });
  dlg.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => dlg.close()));
});

const btnClear = $("btnClearSaved");
let clearTimer = null;
const resetClear = () => { clearTimer = null; btnClear.textContent = "Clear all"; };

function renderSaved() {
  btnClear.hidden = !state.saved.length;
  if (!state.saved.length) {
    savedList.innerHTML = `<div class="empty">Nothing saved yet.<br/>Use Save on a card and it shows up here.</div>`;
    return;
  }
  savedList.innerHTML = state.saved.map((r) => `
    <div class="saved-item" data-id="${r.id}">
      <img src="${esc(avatar(r.owner.avatar_url, 72))}" alt="" loading="lazy" />
      <button class="si-body" data-act="detail" aria-label="Read more about ${esc(r.full_name)}">
        <span class="si-name">${esc(r.full_name)}</span>
        <span class="si-desc">${fmt(r.stargazers_count)} stars · ${esc(r.description || "No description")}</span>
      </button>
      <div class="si-actions">
        <a href="${esc(r.html_url)}" target="_blank" rel="noopener" aria-label="Open ${esc(r.full_name)}">${icon("external")}</a>
        <button data-act="unsave" aria-label="Remove ${esc(r.full_name)}">${icon("trash")}</button>
      </div>
    </div>`).join("");

  savedList.querySelectorAll('[data-act="unsave"]').forEach((btn) =>
    btn.addEventListener("click", () => {
      const id = Number(btn.closest(".saved-item").dataset.id);
      state.saved = state.saved.filter((s) => s.id !== id);
      store.set(STORAGE_KEYS.SAVED, JSON.stringify(state.saved));
      updateSavedBadge();
      renderSaved();
      const cardBtn = feed.querySelector(`.card[data-id="${id}"] [data-act="save"]`);
      if (cardBtn) setSave(cardBtn, false);
    })
  );
  savedList.querySelectorAll('[data-act="detail"]').forEach((btn) =>
    btn.addEventListener("click", () => {
      const id = Number(btn.closest(".saved-item").dataset.id);
      openDetail(state.saved.find((x) => x.id === id));
    })
  );
}

$("btnSaved").addEventListener("click", () => { renderSaved(); savedPanel.showModal(); });

btnClear.addEventListener("click", () => {
  if (!clearTimer) { btnClear.textContent = "Confirm clear"; clearTimer = setTimeout(resetClear, 3000); return; }
  clearTimeout(clearTimer);
  resetClear();
  state.saved = [];
  store.set(STORAGE_KEYS.SAVED, "[]");
  updateSavedBadge();
  renderSaved();
  feed.querySelectorAll(".btn-save.is-on").forEach((b) => setSave(b, false));
});
savedPanel.addEventListener("close", () => { clearTimeout(clearTimer); resetClear(); });

/* legal / privacy */
$("btnLegal").addEventListener("click", () => $("legalDialog").showModal());

/* ---------------- shuffle / retry ---------------- */
function shuffle() {
  state.gen++;
  state.loading = false;
  state.buffer = [];
  // the observer only ever tracks the last card; detach it before the cards go away
  if (observed) { io.unobserve(observed); observed = null; }
  feed.replaceChildren();
  feed.scrollTo({ top: 0, behavior: "instant" });
  ensureContent().then(updateEmpty);
  updateEmpty();
}
$("btnShuffle").addEventListener("click", shuffle);
btnRetry.addEventListener("click", () => { state.pausedUntil = 0; shuffle(); });

/* ---------------- infinite scroll ---------------- */
const io = new IntersectionObserver(
  (entries) => { if (entries.some((e) => e.isIntersecting)) ensureContent(); },
  { root: feed, rootMargin: "120% 0px" }
);

let observed = null;
new MutationObserver(() => {
  const last = feed.lastElementChild;
  if (last === observed) return;
  if (observed) io.unobserve(observed);
  observed = last;
  if (last) io.observe(last);
}).observe(feed, { childList: true });

/* keyboard: ↑ / ↓ jump card to card */
document.addEventListener("keydown", (e) => {
  if (e.altKey || e.ctrlKey || e.metaKey || document.querySelector("dialog[open]")) return;
  if (e.target.closest?.("input, textarea")) return;
  const dir = e.key === "ArrowDown" || e.key === "PageDown" ? 1
            : e.key === "ArrowUp" || e.key === "PageUp" ? -1 : 0;
  if (!dir || !feed.children.length) return;
  e.preventDefault();
  const idx = Math.round(feed.scrollTop / feed.clientHeight);
  const target = Math.min(feed.children.length - 1, Math.max(0, idx + dir));
  feed.children[target].scrollIntoView({ behavior: "smooth", block: "start" });
});

/* ---------------- repo details (banner, stats, README) ---------------- */
const detailDialog = $("detailDialog"), detailBody = $("detailBody"), detailTitle = $("detailTitle");
const readmeCache = new Map();
let detailGen = 0;
let detailCtl = null;   // newest detail/README fetch; opening or closing aborts the previous
let detailOpener = null; // element that opened the drawer, refocused when it closes
const readBar = detailDialog.querySelector(".read-progress i");

/* loading placeholders: shimmering skeletons instead of "Loading…" text */
const skLine = (w) => `<div class="skeleton sk-line" style="width:${w}%"></div>`;
const SK_INITIAL = `<div class="skeleton sk-banner"></div>${skLine(80)}${skLine(62)}${skLine(74)}${skLine(55)}`;
const SK_README = `${skLine(45)}${skLine(92)}${skLine(88)}${skLine(70)}${skLine(94)}${skLine(60)}`;

/* subtle reading progress across the top of the drawer */
detailBody.addEventListener("scroll", () => {
  const max = detailBody.scrollHeight - detailBody.clientHeight;
  readBar.style.width = max > 0 ? ((detailBody.scrollTop / max) * 100).toFixed(1) + "%" : "0";
}, { passive: true });

const jsonHeaders = { Accept: "application/vnd.github+json" };
const htmlHeaders = { Accept: "application/vnd.github.html+json" };
const repoPath = (full) => full.split("/").map(encodeURIComponent).join("/");
const safeUrl = (u) => (/^https?:\/\//i.test(u || "") ? u : "");
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "");

detailDialog.addEventListener("close", () => {
  detailGen++;
  detailCtl?.abort();
  if (detailOpener && document.contains(detailOpener)) detailOpener.focus();
  detailOpener = null;
});

async function openDetail(repo) {
  if (!repo) return;
  detailCtl?.abort();
  detailCtl = new AbortController();
  const gen = ++detailGen;
  detailOpener = document.activeElement;
  detailTitle.textContent = repo.full_name;
  detailBody.innerHTML = `<div class="skel">${SK_INITIAL}</div>`;
  detailBody.classList.remove("settled"); // real content will fade in when it replaces the skeleton
  if (!detailDialog.open) detailDialog.showModal();
  detailBody.scrollTop = 0;
  readBar.style.width = "0";
  if (!repo.created_at) { // saved items only keep a short summary, so fetch the full repo
    try {
      const res = await fetch(`https://api.github.com/repos/${repoPath(repo.full_name)}`,
        { headers: jsonHeaders, signal: detailCtl.signal });
      if (res.ok) repo = await res.json();
    } catch {}
    if (gen !== detailGen) return;
  }
  renderDetail(repo, gen);
}

function renderDetail(repo, gen) {
  const stat = (label, value) => `<div class="dstat"><b>${value}</b><span>${label}</span></div>`;
  const license = repo.license?.spdx_id && repo.license.spdx_id !== "NOASSERTION" ? repo.license.spdx_id : "";
  const facts = [["Language", repo.language], ["License", license], ["Created", fmtDate(repo.created_at)],
                 ["Last push", fmtDate(repo.pushed_at)], ["Default branch", repo.default_branch]].filter((f) => f[1]);
  const home = safeUrl(repo.homepage);
  const topics = repo.topics || [];

  detailBody.innerHTML = `
    <img class="banner" src="https://opengraph.githubassets.com/1/${repoPath(repo.full_name)}" alt="" />
    <p class="repo-desc">${esc(repo.description || "No description provided.")}</p>
    <div class="dstats">
      ${stat("Stars", (repo.stargazers_count || 0).toLocaleString())}
      ${stat("Forks", (repo.forks_count || 0).toLocaleString())}
      ${stat("Open issues", (repo.open_issues_count || 0).toLocaleString())}
      ${repo.size != null ? stat("Size", fmtSize(repo.size)) : ""}
    </div>
    ${topics.length ? `<ul class="topics">${topics.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}
    <dl class="facts">${facts.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("")}</dl>
    <div class="row wrap">
      <a class="btn btn-solid" href="${esc(repo.html_url)}" target="_blank" rel="noopener">Open on GitHub</a>
      ${home ? `<a class="btn" href="${esc(home)}" target="_blank" rel="noopener noreferrer">Website</a>` : ""}
    </div>
    <h3 class="readme-title">README</h3>
    <div class="readme" id="readmeBox"><div class="skel">${SK_README}</div></div>`;
  detailBody.querySelector(".banner").addEventListener("error", (e) => e.target.remove());
  requestAnimationFrame(() => detailBody.classList.add("settled")); // fade the real content in over the skeleton
  loadReadme(repo, gen, detailCtl?.signal);
}

/* GitHub returns rendered README HTML. Strip anything active anyway and fix relative links. */
function cleanHtml(html, repo) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script,style,iframe,object,embed,form,link,meta,base,svg,math,source,video,audio").forEach((n) => n.remove());
  const branch = repo.default_branch || "HEAD";
  const rawBase = `https://raw.githubusercontent.com/${repoPath(repo.full_name)}/${branch}/`;
  const blobBase = `https://github.com/${repoPath(repo.full_name)}/blob/${branch}/`;
  const resolve = (u, base) => { try { const h = new URL(u, base).href; return /^(https?:|mailto:)/i.test(h) ? h : ""; } catch { return ""; } };

  doc.querySelectorAll("*").forEach((el) => {
    [...el.attributes].forEach((a) => { if (/^on/i.test(a.name) || a.name === "style" || a.name === "srcset") el.removeAttribute(a.name); });
    if (el.tagName === "IMG") {
      const src = resolve(el.getAttribute("src") || "", rawBase);
      if (!src) return el.remove();
      el.setAttribute("src", src);
      el.setAttribute("loading", "lazy");
      el.setAttribute("referrerpolicy", "no-referrer");
    } else if (el.tagName === "A") {
      const raw = el.getAttribute("href") || "";
      const href = raw.startsWith("#") ? "" : resolve(raw, blobBase);
      if (href) { el.setAttribute("href", href); el.setAttribute("target", "_blank"); el.setAttribute("rel", "noopener noreferrer"); }
      else el.removeAttribute("href");
    }
  });
  return doc.body.innerHTML;
}

async function loadReadme(repo, gen, signal) {
  const box = () => (gen === detailGen ? $("readmeBox") : null);
  let html = readmeCache.get(repo.full_name);
  if (html == null) {
    try {
      const res = await fetch(`https://api.github.com/repos/${repoPath(repo.full_name)}/readme`,
        { headers: htmlHeaders, signal });
      if (res.status === 404) html = "";
      else if (res.status === 403 || res.status === 429)
        throw new Error("GitHub rate limit reached (60 README loads an hour). Try again in a bit.");
      else if (!res.ok) throw new Error(`GitHub returned an error (${res.status}).`);
      else html = cleanHtml(await res.text(), repo);
      readmeCache.set(repo.full_name, html);
    } catch (err) {
      if (err && err.name === "AbortError") return; // a newer detail view took over
      const b = box();
      if (b) b.innerHTML = `<div class="readme-note">${esc(err instanceof TypeError ? "Can't reach GitHub. Check your connection." : err.message)}</div>`;
      return;
    }
  }
  const b = box();
  if (b) {
    b.innerHTML = html || `<div class="readme-note">This repo has no README.</div>`;
    b.classList.remove("settled");
    requestAnimationFrame(() => b.classList.add("settled"));
  }
}

/* ---------------- go ---------------- */
updateSavedBadge();
ensureContent();
