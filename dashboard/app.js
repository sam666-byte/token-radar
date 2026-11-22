// dashboard/app.js — Token Radar (round 2, written fresh).
// Renders window.RADAR (written by main.ts into data.js beside this
// page's folder). No network, no framework, no CDN: every number on
// the page comes from the snapshot the entry was built on.

"use strict";

const R = window.RADAR;
const rows = R ? R.rows : [];
const comps = R ? R.comps : [];
const live = R ? R.live || [] : [];
const meta = R ? R.meta : {};

function $(sel) {
  return document.querySelector(sel);
}
function money(n) {
  return "$" + Math.round(n).toLocaleString("en-US");
}
function moneyShort(n) {
  if (n >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return "$" + (n / 1e3).toFixed(0) + "K";
  return "$" + Math.round(n);
}
function pct(n) {
  return (n > 0 ? "+" : "") + n.toFixed(1) + "%";
}
function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function bandValue(v) {
  if (!v) return null;
  const parts = v.split("-");
  const lo = parts[0] === "" ? 0 : Number(parts[0]);
  const hi = parts[1] === "" || parts[1] === undefined ? Infinity : Number(parts[1]);
  return [lo, hi];
}

// ---- state from the hash: #category=Dexs&chain=Ethereum&tvL=..&q=..&p=slug&tab=live
function readHash() {
  const out = {};
  const h = window.location.hash.replace(/^#/, "");
  if (!h) return out;
  for (const pair of h.split("&")) {
    const i = pair.indexOf("=");
    if (i < 0) continue;
    out[decodeURIComponent(pair.slice(0, i))] = decodeURIComponent(pair.slice(i + 1));
  }
  return out;
}
function writeHash() {
  const parts = [];
  if (state.category) parts.push("category=" + encodeURIComponent(state.category));
  if (state.chain) parts.push("chain=" + encodeURIComponent(state.chain));
  if (state.tvl) parts.push("tvl=" + encodeURIComponent(state.tvl));
  if (state.implied) parts.push("implied=" + encodeURIComponent(state.implied));
  if (state.q) parts.push("q=" + encodeURIComponent(state.q));
  if (state.selected) parts.push("p=" + encodeURIComponent(state.selected));
  if (state.tab !== "board") parts.push("tab=" + encodeURIComponent(state.tab));
  const next = parts.length ? "#" + parts.join("&") : "";
  if (window.location.hash !== next) {
    window.history.replaceState(null, "", next || window.location.pathname + window.location.search);
  }
}

const hash = readHash();
const state = {
  category: hash.category || "",
  chain: hash.chain || "",
  tvl: hash.tvl || "",
  implied: hash.implied || "",
  q: hash.q || "",
  selected: hash.p || "",
  tab: hash.tab || "board",
};

// ---- filtering
function inBand(n, band) {
  if (!band) return true;
  const [lo, hi] = bandValue(band);
  return n >= lo && n < hi;
}
function filteredRows() {
  const q = state.q.trim().toLowerCase();
  return rows.filter((r) => {
    if (state.category && r.category !== state.category) return false;
    if (state.chain && !r.chains.includes(state.chain)) return false;
    if (!inBand(r.tvl_usd, state.tvl)) return false;
    if (!inBand(r.implied_value_usd, state.implied)) return false;
    if (q && !(r.name.toLowerCase().includes(q) || r.slug.toLowerCase().includes(q))) return false;
    return true;
  });
}

// ---- top 5 strip: the top 5 of the CURRENT filter, never the global one
function renderTop5(list) {
  const el = $("#top5");
  const top = list.slice(0, 5);
  if (top.length === 0) {
    el.innerHTML = "";
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.innerHTML =
    "<h2>Top " +
    top.length +
    " of this view</h2><ol>" +
    top
      .map(
        (r) =>
          '<li><a href="#p=' +
          esc(r.slug) +
          '" data-slug="' +
          esc(r.slug) +
          '"><span class="t5-name">' +
          esc(r.name) +
          '</span> <span class="t5-val">' +
          moneyShort(r.implied_value_usd) +
          "</span></a></li>",
      )
      .join("") +
    "</ol>";
}

// ---- board table
function renderBoard(list) {
  const body = $("#board-body");
  body.innerHTML = list
    .map((r) => {
      const change = r.change_7d === null ? "—" : pct(r.change_7d);
      const cls = r.change_7d === null ? "" : r.change_7d >= 0 ? "up" : "down";
      const chains = r.chains.slice(0, 3).join(", ") + (r.chains.length > 3 ? " +" + (r.chains.length - 3) : "");
      return (
        '<tr data-slug="' +
        esc(r.slug) +
        '"' +
        (state.selected === r.slug ? ' class="selected"' : "") +
        "><td>" +
        r.rank +
        '</td><td><a href="#p=' +
        esc(r.slug) +
        '" data-slug="' +
        esc(r.slug) +
        '">' +
        esc(r.name) +
        "</a></td><td>" +
        esc(r.category) +
        "</td><td>" +
        esc(chains) +
        '</td><td class="num">' +
        moneyShort(r.tvl_usd) +
        '</td><td class="num ' +
        cls +
        '">' +
        change +
        '</td><td class="num strong">' +
        moneyShort(r.implied_value_usd) +
        "</td></tr>"
      );
    })
    .join("");
  $("#count").textContent =
    list.length === rows.length
      ? rows.length + " protocols, ranked by implied launch value."
      : list.length + " of " + rows.length + " protocols match this view.";
}

// ---- detail drawer
function compsWord(n) {
  return n === 1 ? "1 live comp" : n + " live comps";
}
function recompute(r) {
  const m = r.model;
  return Math.round(r.tvl_usd * m.multiple * m.growthMult * m.maturityMult * m.chainMult);
}
function whyRank(r) {
  const m = r.model;
  const growth =
    m.growthPct === 0
      ? "its 7-day TVL change is flat"
      : "its 7-day TVL change of " + pct(m.growthPct) + " counts at half weight";
  const age =
    m.ageDays >= 1095
      ? "it is over three years old, so maturity counts at full value"
      : "at " + m.ageDays + " days old, maturity counts at " + m.maturityMult.toFixed(2);
  const chains =
    r.chains.length > 1
      ? "and " + r.chains.length + " chains add " + Math.round((m.chainMult - 1) * 100) + "%"
      : "and a single chain adds nothing";
  return (
    "Rank " +
    r.rank +
    " of " +
    rows.length +
    ": " +
    r.name +
    "'s " +
    money(r.tvl_usd) +
    " TVL at the " +
    r.category +
    " multiple of " +
    m.multiple.toFixed(2) +
    "x (" +
    compsWord(m.compN) +
    ") gives " +
    money(r.implied_value_usd) +
    " — " +
    growth +
    ", " +
    age +
    ", " +
    chains +
    "."
  );
}
function renderDetail() {
  const el = $("#detail");
  const r = rows.find((x) => x.slug === state.selected);
  if (!r) {
    el.hidden = true;
    el.innerHTML = "";
    return;
  }
  const m = r.model;
  const again = recompute(r);
  const check =
    again === r.implied_value_usd
      ? "Recompute: " + money(again) + " — the same number board.json carries."
      : "Recompute: " + money(again) + " — DIFFERENT from board.json (" + money(r.implied_value_usd) + ").";
  el.hidden = false;
  el.innerHTML =
    "<h2>" +
    esc(r.name) +
    ' <span class="rankpill">#' +
    r.rank +
    "</span></h2>" +
    '<p class="why">' +
    esc(whyRank(r)) +
    "</p>" +
    '<p class="recompute">' +
    esc(check) +
    "</p>" +
    '<dl class="factors">' +
    "<div><dt>TVL</dt><dd>" +
    money(r.tvl_usd) +
    "</dd></div>" +
    "<div><dt>Category multiple</dt><dd>" +
    m.multiple.toFixed(4) +
    "x (" +
    compsWord(m.compN) +
    ", median " +
    m.compMedian.toFixed(4) +
    "x)</dd></div>" +
    "<div><dt>7-day change</dt><dd>" +
    (r.change_7d === null ? "not reported" : pct(r.change_7d) + " → ×" + m.growthMult.toFixed(3)) +
    "</dd></div>" +
    "<div><dt>Age</dt><dd>" +
    m.ageDays +
    " days → maturity ×" +
    m.maturityMult.toFixed(3) +
    "</dd></div>" +
    "<div><dt>Chains</dt><dd>" +
    r.chains.length +
    " → ×" +
    m.chainMult.toFixed(2) +
    "</dd></div>" +
    "<div><dt>Implied value</dt><dd>" +
    money(r.implied_value_usd) +
    "</dd></div>" +
    "</dl>" +
    "<h3>Farm plan</h3><ol class=\"farm\">" +
    r.farm_steps.map((s) => "<li>" + esc(s) + "</li>").join("") +
    "</ol>" +
    '<p><button type="button" id="detail-close">Close detail</button></p>';
  const close = $("#detail-close");
  if (close) {
    close.addEventListener("click", () => {
      state.selected = "";
      writeHash();
      renderAll();
    });
  }
}

// ---- live-token tab
function renderLive() {
  const body = $("#live-body");
  const sorted = [...live].sort((a, b) => b.multiple - a.multiple);
  body.innerHTML = sorted
    .map(
      (p) =>
        "<tr><td>" +
        esc(p.name) +
        "</td><td>" +
        esc(p.category) +
        '</td><td class="num">' +
        moneyShort(p.tvl_usd) +
        '</td><td class="num">' +
        moneyShort(p.mcap_usd) +
        '</td><td class="num">' +
        p.multiple.toFixed(2) +
        "x</td></tr>",
    )
    .join("");
}

// ---- model tab
function renderModel() {
  const body = $("#comp-body");
  body.innerHTML = comps
    .map(
      (c) =>
        "<tr><td>" +
        esc(c.category) +
        '</td><td class="num">' +
        c.n +
        '</td><td class="num">' +
        c.median.toFixed(4) +
        "x</td><td class=\"num strong\">" +
        c.multiple.toFixed(4) +
        "x</td></tr>",
    )
    .join("");
}

// ---- tabs
function showTab(tab) {
  state.tab = tab;
  document.querySelectorAll("#tabs button").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === tab);
  });
  document.querySelectorAll(".tabpage").forEach((s) => {
    s.hidden = s.id !== "tab-" + tab;
  });
  writeHash();
}

// ---- filter controls
function fillOptions() {
  const catSel = $("#f-category");
  const cats = [...new Set(rows.map((r) => r.category))].sort();
  catSel.innerHTML =
    '<option value="">Any category</option>' +
    cats.map((c) => '<option value="' + esc(c) + '">' + esc(c) + "</option>").join("");
  const chainCounts = new Map();
  for (const r of rows) for (const c of r.chains) chainCounts.set(c, (chainCounts.get(c) || 0) + 1);
  const chains = [...chainCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 40)
    .map((e) => e[0]);
  const chainSel = $("#f-chain");
  chainSel.innerHTML =
    '<option value="">Any chain</option>' +
    chains.map((c) => '<option value="' + esc(c) + '">' + esc(c) + "</option>").join("");
  catSel.value = state.category;
  chainSel.value = state.chain;
  $("#f-tvl").value = state.tvl;
  $("#f-implied").value = state.implied;
  $("#f-q").value = state.q;
}

function renderAll() {
  const list = filteredRows();
  renderTop5(list);
  renderBoard(list);
  renderDetail();
  showTab(state.tab);
  writeHash();
}

function init() {
  if (!R) {
    document.querySelector("main").innerHTML =
      "<p>Data failed to load: data.js was not found beside this page.</p>";
    return;
  }
  $("#meta").textContent =
    "Snapshot " +
    meta.as_of +
    " · " +
    meta.rows +
    " protocols ranked · watchlist " +
    meta.watchlist +
    " covered · global median multiple " +
    Number(meta.global_median).toFixed(2) +
    "x.";
  fillOptions();
  renderModel();
  renderLive();
  renderAll();
  $("#f-category").addEventListener("change", (e) => {
    state.category = e.target.value;
    renderAll();
  });
  $("#f-chain").addEventListener("change", (e) => {
    state.chain = e.target.value;
    renderAll();
  });
  $("#f-tvl").addEventListener("change", (e) => {
    state.tvl = e.target.value;
    renderAll();
  });
  $("#f-implied").addEventListener("change", (e) => {
    state.implied = e.target.value;
    renderAll();
  });
  $("#f-q").addEventListener("input", (e) => {
    state.q = e.target.value;
    renderAll();
  });
  $("#f-clear").addEventListener("click", () => {
    state.category = "";
    state.chain = "";
    state.tvl = "";
    state.implied = "";
    state.q = "";
    state.selected = "";
    fillOptions();
    renderAll();
  });
  document.querySelectorAll("#tabs button").forEach((b) => {
    b.addEventListener("click", () => showTab(b.dataset.tab));
  });
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[data-slug]");
    if (!a) return;
    e.preventDefault();
    state.selected = a.dataset.slug;
    writeHash();
    renderAll();
    const detail = $("#detail");
    if (detail && !detail.hidden) detail.scrollIntoView({ block: "start" });
  });
  window.addEventListener("hashchange", () => {
    const h = readHash();
    state.category = h.category || "";
    state.chain = h.chain || "";
    state.tvl = h.tvl || "";
    state.implied = h.implied || "";
    state.q = h.q || "";
    state.selected = h.p || "";
    state.tab = h.tab || "board";
    fillOptions();
    renderAll();
  });
}

init();
