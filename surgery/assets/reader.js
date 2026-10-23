/* Reader: study settings and annotation for the surgery guides.

   Attaches to an element with class "guide". Used in two places: the standalone document,
   where it is loaded with a <script src>, and inside the Claude artifact, where the same
   source is inlined. Everything it stores is keyed by person, so two students sharing a
   tablet keep separate settings, highlights, notes and ink.

   window.ReaderConfig may be set before this runs:
     { student: "hita", doc: "inguinal-hernia", storage: <object with get/set> }
*/

(function () {
  "use strict";

  var cfg = window.ReaderConfig || {};
  var DOC = cfg.doc || "guide";
  var guide = document.querySelector(".guide");

  // ------------------------------------------------------------------ storage

  var student = (cfg.student || "").trim().toLowerCase() || "_";
  function key() { return "reader:" + student + ":" + DOC; }

  function load() {
    if (cfg.storage && cfg.storage.get) { return cfg.storage.get(key()) || {}; }
    try { return JSON.parse(localStorage.getItem(key()) || "{}"); } catch (e) { return {}; }
  }
  function persist(state) {
    if (cfg.storage && cfg.storage.set) { cfg.storage.set(key(), state); return; }
    try { localStorage.setItem(key(), JSON.stringify(state)); } catch (e) {}
  }

  var DEFAULTS = {
    width: "medium", size: "3", leading: "normal", face: "serif", theme: "auto",
    cite: "on", conflicts: "on",
    hlHead: "off", hlWhy: "off", hlTerm: "off", recall: "off",
    marks: [], notes: [], ink: [], inkLayout: null, updatedAt: 0
  };

  // How the page is set is a property of the reader, not of the case. These lived in the
  // per-case record, so a student who had chosen Hyperlegible at XL with loose spacing got
  // Georgia at 17px back on the next case, and on the next, twenty-five times over.
  // Marks, notes and ink stay per case: those really are about this document.
  var PREFS = ["width", "size", "leading", "face", "theme", "cite", "conflicts",
               "hlHead", "hlWhy", "hlTerm", "recall"];

  function prefsKey() { return "reader:" + student + ":prefs"; }

  function loadPrefs() {
    if (cfg.storage && cfg.storage.get) { return cfg.storage.get(prefsKey()) || {}; }
    try { return JSON.parse(localStorage.getItem(prefsKey()) || "{}") || {}; }
    catch (e) { return {}; }
  }

  function savePrefs(at) {
    var out = { updatedAt: at || Date.now() };
    PREFS.forEach(function (k) { out[k] = state[k]; });
    if (cfg.storage && cfg.storage.set) { cfg.storage.set(prefsKey(), out); return; }
    try { localStorage.setItem(prefsKey(), JSON.stringify(out)); } catch (e) {}
  }

  // overlay the reader's own settings on top of whatever this document's record holds
  function applyPrefsTo(target) {
    var p = loadPrefs();
    PREFS.forEach(function (k) { if (p[k] !== undefined) target[k] = p[k]; });
    return p;
  }

  // DEFAULTS holds literal arrays for marks, notes and ink. Assigning DEFAULTS[k] handed
  // every student who had no stored record *the same array object*, so the first
  // highlight pushed into it belonged to everyone afterwards: a second person signing in
  // on the same tablet saw the first person's highlights and notes, and their next edit
  // uploaded that work to the server under their own name. Copy, never share.
  function defaultFor(k) {
    var v = DEFAULTS[k];
    return Array.isArray(v) ? v.slice() : v;
  }

  var state = (function () {
    var s = load(), out = {}, p = loadPrefs();
    Object.keys(DEFAULTS).forEach(function (k) {
      out[k] = (s[k] === undefined) ? defaultFor(k) : s[k];
      // the reader's own settings win over whatever this case last recorded
      if (PREFS.indexOf(k) >= 0 && p[k] !== undefined) out[k] = p[k];
    });
    return out;
  })();

  function save() {
    state.updatedAt = Date.now();
    persist(state);
    savePrefs(state.updatedAt);
    syncLater();
    prefsLater();
  }


  // ------------------------------------------------------------------ sync
  // Optional, and off until an endpoint is set. The local copy is authoritative: sync
  // pulls once on open and pushes after changes settle, and anything that goes wrong is
  // swallowed, because a reader halfway through a chapter should never see a network
  // error about their highlights.

  // The deployed worker, so every case picks sync up without each page having to opt in.
  // A page can still override it with ReaderConfig.sync, and setting that to "" turns sync
  // off entirely, which is how you get a purely local copy.
  var SYNC_DEFAULT = "https://rx-sync.harnar.workers.dev";
  var SYNC_ENDPOINT = (window.ReaderConfig && window.ReaderConfig.sync !== undefined)
    ? window.ReaderConfig.sync
    : SYNC_DEFAULT;
  // syncedAt is the newest stamp the worker has confirmed. Anything newer than it locally is
  // work the server has not got yet, which is what makes a retry possible at all: without it
  // a push that failed, or one that was overtaken while in flight, was simply lost from the
  // remote copy with nothing left to say so.
  // Sync state belongs to one (student, document) pair, not to the module.
  //
  // It used to be three globals. Open guide A, go back, open guide B before A's GET returns,
  // and A's response was applied to B: B's notes were replaced by A's, written to storage,
  // and pushed to the server as B. That was reproduced, not theorised. syncedAt leaking the
  // other way was quieter but worse, because B could read as "already synced" on a value that
  // described A, and B's real work then never left the device.
  //
  // So every request captures the pair it was issued for and drops its own result if the
  // reader has moved on.
  var syncTimer = null;
  var sync = { key: "", syncing: false, syncedAt: 0, retryMs: 4000 };

  var pullTimer = null;

  function syncOn() { return !!SYNC_ENDPOINT && student && student !== "_"; }

  function syncKey() { return student + "::" + DOC; }

  function syncCtx() {
    if (sync.key !== syncKey()) {
      // pulled stays false until the server has given a definite answer for this
      // document. Until then nothing may be pushed: a push before the first successful
      // pull overwrites whatever the server holds with whatever this device happens to
      // have, which on a new or cleared browser is nothing at all.
      sync = { key: syncKey(), syncing: false, syncedAt: 0, serverAt: 0,
               pulled: false, retryMs: 4000, pullMs: 1000 };
      clearTimeout(syncTimer);
      clearTimeout(pullTimer);
    }
    return sync;
  }

  function backupHint() {
    var el = document.getElementById("rdrBackupHint");
    if (!el) return;
    el.textContent = syncOn()
      ? "Your highlights, notes and drawings are kept on this device and copied to your name, "
        + "so they follow you to another phone or browser. A file copy is still worth having."
      : "Your highlights, notes and drawings are kept in this browser only. Save a copy if you "
        + "clear your browsing data or change device.";
  }

  function syncSay(msg) {
    var el2 = document.getElementById("rdrSyncSay");
    if (el2) el2.textContent = msg || "";
  }

  // pull once when a guide opens, and adopt the remote copy only if it is newer
  function syncPull() {
    if (!syncOn()) return Promise.resolve(false);
    var c = syncCtx(), mine = c.key;
    var u = SYNC_ENDPOINT + "/api/state?student=" + encodeURIComponent(student) +
            "&doc=" + encodeURIComponent(DOC);
    return fetch(u, { method: "GET" })
      .then(function (r) {
        // A 503 is not an answer. Reading any non-OK response as "the worker has nothing"
        // is what let a slow or failing server be mistaken for an empty one, after which
        // the first local edit was pushed over the real notes and marks.
        if (!r.ok) throw new Error("sync pull " + r.status);
        return r.json();
      })
      .then(function (j) {
        if (mine !== syncKey()) return false;          // the reader moved on; not ours to apply
        c.pulled = true;                               // the server has answered for this doc
        c.pullMs = 1000;
        if (!j || !j.found || !j.state) {
          // the worker really does have nothing, so everything local is unsent
          syncLater(600);
          return false;
        }
        c.serverAt = j.updatedAt || 0;
        c.syncedAt = j.updatedAt || 0;                 // what the server demonstrably holds
        var local = state.updatedAt || 0;
        if (!(j.updatedAt > local)) {
          // ours is the same or newer: push anything it has not seen, instead of sitting on
          // work that would otherwise only leave this device at the next edit
          syncLater(600);
          return false;
        }
        Object.keys(DEFAULTS).forEach(function (k) {
          // the settings in a document's record are a leftover of the old per-case model;
          // the reader's own settings are synced separately and must not be overwritten
          // by whatever this case happened to be read with
          if (PREFS.indexOf(k) >= 0) return;
          if (j.state[k] !== undefined) state[k] = j.state[k];
        });
        state.updatedAt = j.updatedAt;
        persist(state);
        applySettings(); renderMarks(); renderNotes(); redrawInk(); updateLock();
        syncSay("Picked up newer work from another device.");
        return true;
      })
      .catch(function () {
        // could not reach the server, so we still do not know what it holds. Try the pull
        // again, and leave pulled false so that nothing is pushed in the meantime.
        if (mine === syncKey()) {
          pullLater(c.pullMs);
          c.pullMs = Math.min(c.pullMs * 2, 60000);
        }
        return false;
      });
  }

  function pullLater(ms) {
    if (!syncOn()) return;
    clearTimeout(pullTimer);
    pullTimer = setTimeout(syncPull, ms === undefined ? 1000 : ms);
  }

  function syncDirty() { return (state.updatedAt || 0) > syncCtx().syncedAt; }

  function syncPush() {
    if (!syncOn() || !syncDirty()) return;
    var c = syncCtx(), mine = c.key;
    if (!c.pulled) {                             // we do not yet know what the server holds
      pullLater(c.pullMs);
      return;
    }
    if (c.syncing) { syncLater(400); return; }   // overtaken; come back for the newer state
    c.syncing = true;

    // snapshot the stamp being sent: edits can land while this is in flight, and confirming
    // those as synced because an older push succeeded is how work goes missing
    var at = state.updatedAt || Date.now();
    var u = SYNC_ENDPOINT + "/api/state?student=" + encodeURIComponent(student) +
            "&doc=" + encodeURIComponent(DOC);
    fetch(u, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ state: state, updatedAt: at })
    }).then(function (r) {
      if (mine !== syncKey()) return;
      c.syncing = false;
      if (!r.ok) {
        syncSay("");
        syncLater(c.retryMs);                    // server said no; try again later
        c.retryMs = Math.min(c.retryMs * 2, 60000);
        return;
      }
      return r.json().then(function (j) {
        if (mine !== syncKey()) return;
        // The worker answers ok even when it discarded the write as stale, and tells us the
        // stamp it actually holds. Believing the status alone is how a device with a wrong
        // clock, or one racing a second device, marked itself synced while the server kept
        // someone else's copy. Only treat it as stored if the server agrees it is.
        // The worker reports whether it applied this write, which is not the same as
        // whether the stamp came back unchanged: it clamps a stamp more than five minutes
        // in the future, so a device with a fast clock saw its own accepted write come
        // back "different", stayed dirty and pushed again about every second, forever.
        c.serverAt = (j && j.updatedAt) || c.serverAt;
        if (j && j.stored === false) {
          // the server kept something newer; reconcile by pulling rather than pushing again
          c.syncedAt = j.updatedAt || c.syncedAt;
          c.pulled = false;
          pullLater(600);
          return;
        }
        c.syncedAt = Math.max(c.syncedAt, at);
        c.retryMs = 4000;
        syncSay("");
        if (syncDirty()) syncLater(400);         // changed again while in flight
      });
    }).catch(function () {
      if (mine !== syncKey()) return;
      c.syncing = false;
      syncSay("");                               // offline is normal; say nothing
      syncLater(c.retryMs);
      c.retryMs = Math.min(c.retryMs * 2, 60000);
    });
  }

  function syncLater(ms) {
    if (!syncOn()) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(syncPush, ms === undefined ? 2500 : ms);
  }

  // A tab is far more likely to be backgrounded or closed than to fire unload, especially on
  // a phone. Without this, anything highlighted, noted or drawn in the last couple of seconds
  // stayed on that one device: the debounce had not elapsed and the push never happened.
  function syncFlush() {
    if (!syncOn()) return;
    clearTimeout(prefsTimer);
    prefsPush();
    if (!syncDirty()) return;
    clearTimeout(syncTimer);
    syncPush();
  }

  // ---------------------------------------------------------- settings sync
  //
  // The reader's settings are one record per student, not one per case, so they travel as
  // their own document. Same bargain as everything else here: the local copy is
  // authoritative, nothing is pushed until the server has said what it holds, and every
  // failure is swallowed.

  var PREFS_DOC = "reader-prefs";
  var prefsSync = { key: "", syncing: false, syncedAt: 0, pulled: false,
                    retryMs: 4000, pullMs: 1000 };
  var prefsTimer = null, prefsPullTimer = null;

  function prefsSyncKey() { return student + "::prefs"; }

  function prefsCtx() {
    if (prefsSync.key !== prefsSyncKey()) {
      prefsSync = { key: prefsSyncKey(), syncing: false, syncedAt: 0, pulled: false,
                    retryMs: 4000, pullMs: 1000 };
      clearTimeout(prefsTimer);
      clearTimeout(prefsPullTimer);
    }
    return prefsSync;
  }

  function prefsUrl() {
    return SYNC_ENDPOINT + "/api/state?student=" + encodeURIComponent(student) +
           "&doc=" + encodeURIComponent(PREFS_DOC);
  }

  function prefsLater(ms) {
    if (!syncOn()) return;
    clearTimeout(prefsTimer);
    prefsTimer = setTimeout(prefsPush, ms === undefined ? 2500 : ms);
  }

  function prefsPullLater(ms) {
    if (!syncOn()) return;
    clearTimeout(prefsPullTimer);
    prefsPullTimer = setTimeout(prefsPull, ms === undefined ? 1000 : ms);
  }

  function prefsPull() {
    if (!syncOn()) return;
    var c = prefsCtx(), mine = c.key;
    fetch(prefsUrl(), { method: "GET" })
      .then(function (r) {
        if (!r.ok) throw new Error("prefs pull " + r.status);
        return r.json();
      })
      .then(function (j) {
        if (mine !== prefsSyncKey()) return;
        c.pulled = true;
        c.pullMs = 1000;
        if (!j || !j.found || !j.state) { prefsLater(600); return; }
        c.syncedAt = j.updatedAt || 0;
        var local = loadPrefs();
        if (!(j.updatedAt > (local.updatedAt || 0))) { prefsLater(600); return; }
        PREFS.forEach(function (k) {
          if (j.state[k] !== undefined) state[k] = j.state[k];
        });
        savePrefs(j.updatedAt);
        applySettings();
      })
      .catch(function () {
        if (mine === prefsSyncKey()) {
          prefsPullLater(c.pullMs);
          c.pullMs = Math.min(c.pullMs * 2, 60000);
        }
      });
  }

  function prefsPush() {
    if (!syncOn()) return;
    var c = prefsCtx(), mine = c.key;
    if (!c.pulled) { prefsPullLater(c.pullMs); return; }
    if (c.syncing) { prefsLater(400); return; }
    var p = loadPrefs();
    var at = p.updatedAt || 0;
    if (!(at > c.syncedAt)) return;
    c.syncing = true;
    fetch(prefsUrl(), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ state: p, updatedAt: at })
    }).then(function (r) {
      if (mine !== prefsSyncKey()) return;
      c.syncing = false;
      if (!r.ok) {
        prefsLater(c.retryMs);
        c.retryMs = Math.min(c.retryMs * 2, 60000);
        return;
      }
      return r.json().then(function (j) {
        if (mine !== prefsSyncKey()) return;
        if (j && j.stored === false) {
          c.syncedAt = j.updatedAt || c.syncedAt;
          c.pulled = false;
          prefsPullLater(600);
          return;
        }
        c.syncedAt = Math.max(c.syncedAt, at);
        c.retryMs = 4000;
      });
    }).catch(function () {
      if (mine !== prefsSyncKey()) return;
      c.syncing = false;
      prefsLater(c.retryMs);
      c.retryMs = Math.min(c.retryMs * 2, 60000);
    });
  }

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") syncFlush();
  });
  window.addEventListener("pagehide", syncFlush);

  // ------------------------------------------------------------------ settings

  var ATTR = {
    width: "data-width", size: "data-size", leading: "data-leading", face: "data-face",
    theme: "data-theme", cite: "data-cite", conflicts: "data-conflicts",
    hlHead: "data-hl-head", hlWhy: "data-hl-why", hlTerm: "data-hl-term", recall: "data-recall"
  };

  var RECALL_SEL = ".why, dl.findings dd, .viva .ans";

  // In recall mode the answers are hidden until they are tapped, and tapping was the only
  // way: no tabindex, no role, no key handler, so a reader working by keyboard could not
  // use the mode at all. These become real buttons while the mode is on, and ordinary
  // prose again when it is off.
  function armRecall() {
    if (!guide) return;
    var on = state.recall === "on";
    [].forEach.call(guide.querySelectorAll(RECALL_SEL), function (el) {
      if (on) {
        el.tabIndex = 0;
        el.setAttribute("role", "button");
        el.setAttribute("aria-expanded", el.classList.contains("revealed") ? "true" : "false");
      } else {
        el.removeAttribute("tabindex");
        el.removeAttribute("role");
        el.removeAttribute("aria-expanded");
        el.classList.remove("revealed");
      }
    });
  }

  function toggleRecall(el) {
    var shown = el.classList.toggle("revealed");
    el.setAttribute("aria-expanded", shown ? "true" : "false");
  }

  function applySettings() {
    if (!guide) return;
    Object.keys(ATTR).forEach(function (k) { guide.setAttribute(ATTR[k], state[k]); });
    armRecall();
    if (state.face === "hyper" || state.face === "sans") ensureFont(state.face);
    syncHostTheme();
    backupHint();
    layoutInk();
  }

  // Inside the artifact the guide sits in a page with its own chrome. Two independent
  // theme switches read as a bug, so the reader's colour choice drives both. Sepia and
  // high contrast have no chrome equivalent, so the chrome takes the nearest of the two.
  // The guide sets its own measure, but inside the hub it is mounted in a shell with a
  // max-width of its own, which clamped Medium, Wide and Full to the same width: changing
  // the setting appeared to do nothing at all on anything bigger than a phone. Mirror the
  // choice onto the host so the shell can follow it.
  function syncHostWidth() {
    if (!cfg.syncRoot) return;
    document.body.setAttribute("data-width", state.width || "medium");
  }

  function syncHostTheme() {
    syncHostWidth();
    if (!cfg.syncRoot) return;
    var map = { auto: "", light: "light", sepia: "light", dark: "dark", contrast: "dark" };
    var v = map[state.theme];
    if (v) document.documentElement.setAttribute("data-theme", v);
    else document.documentElement.removeAttribute("data-theme");
    if (typeof cfg.onTheme === "function") cfg.onTheme(state.theme);
  }

  var fontsAdded = {};
  function ensureFont(which) {
    if (fontsAdded[which]) return;
    fontsAdded[which] = true;
    var fam = which === "hyper" ? "Atkinson+Hyperlegible:wght@400;700" : "Inter:wght@400;600;700";
    var l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=" + fam + "&display=swap";
    document.head.appendChild(l);
  }

  // ------------------------------------------------------------------ anchors
  // Every block that holds text gets a stable index in document order, so a highlight
  // can be stored as (block, start character, end character) and re-applied next time.

  // Anchor to the innermost block-level element rather than a fixed tag list. A fixed list
  // silently refused to highlight anything it had not been told about (legend rows, table
  // cells, summary lines), which looked exactly like the feature being broken.

  var blocks = [];

  function blockish(el) {
    var d = getComputedStyle(el).display;
    return d === "block" || d === "list-item" || d === "table-cell" ||
           d === "flex" || d === "grid" || d === "table-caption";
  }

  function indexBlocks() {
    if (!guide) return;
    blocks = [];
    var all = guide.querySelectorAll("*");
    var blockyWithText = [];
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (!el.textContent || !el.textContent.trim()) continue;
      if (el.classList.contains("rdr-note")) continue;
      if (blockish(el)) blockyWithText.push(el);
    }
    // keep only the innermost ones: a block that contains another block is a container
    for (var j = 0; j < blockyWithText.length; j++) {
      var cand = blockyWithText[j], inner = false;
      for (var k = 0; k < blockyWithText.length; k++) {
        if (k !== j && cand.contains(blockyWithText[k])) { inner = true; break; }
      }
      if (!inner) blocks.push(cand);
    }
    blocks.forEach(function (el, n) { el.setAttribute("data-b", n); });
  }

  function blockOf(node) {
    var el = node && (node.nodeType === 1 ? node : node.parentElement);
    if (!el) return null;
    var b = el.closest("[data-b]");
    return (b && guide.contains(b)) ? b : null;
  }

  // A selection that begins exactly at the start of a paragraph is reported by the browser
  // with startContainer set to an ancestor rather than to a text node inside the block, so
  // blockOf came back null, the bubble stayed hidden and the phrase could not be
  // highlighted at all. Look at what the range actually covers before giving up.
  function blockOfRange(r) {
    if (!r) return null;
    var b = blockOf(r.startContainer);
    if (b) return b;
    var sc = r.startContainer;
    if (sc && sc.nodeType === 1 && sc.childNodes[r.startOffset]) {
      b = blockOf(sc.childNodes[r.startOffset]);
      if (b) return b;
    }
    return blockOf(r.endContainer) || blockOf(r.commonAncestorContainer);
  }

  function textNodesIn(el) {
    var out = [], w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    var n; while ((n = w.nextNode())) { if (n.nodeValue.length) out.push(n); }
    return out;
  }

  function offsetsOf(range, block) {
    var nodes = textNodesIn(block), pos = 0, start = -1, end = -1;
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i], len = n.nodeValue.length;
      if (n === range.startContainer) start = pos + range.startOffset;
      if (n === range.endContainer) end = pos + range.endOffset;
      pos += len;
    }
    if (start < 0 && range.startContainer === block) start = 0;
    if (end < 0 && range.endContainer === block) end = pos;
    return (start >= 0 && end > start) ? { s: start, e: end } : null;
  }

  function wrapRange(block, s, e, kind, colour, id) {
    var nodes = textNodesIn(block), pos = 0;
    for (var i = 0; i < nodes.length && pos < e; i++) {
      var n = nodes[i], len = n.nodeValue.length, a = pos, b = pos + len;
      pos = b;
      if (b <= s || a >= e) continue;
      var from = Math.max(0, s - a), to = Math.min(len, e - a);
      var target = n;
      if (to < len) target.splitText(to);
      if (from > 0) target = target.splitText(from);
      var tag = document.createElement(kind === "ul" ? "u" : "mark");
      tag.className = "rdr-mark rdr-" + kind;
      tag.setAttribute("data-mid", id);
      if (kind === "ul") { tag.style.textDecorationColor = colour; tag.style.textDecorationThickness = "2px"; }
      else { tag.style.background = colour; }
      target.parentNode.insertBefore(tag, target);
      tag.appendChild(target);
      nodes = textNodesIn(block);
      pos = 0;
      for (var j = 0; j < nodes.length; j++) {
        if (nodes[j] === target) break;
        pos += nodes[j].nodeValue.length;
      }
      pos += target.nodeValue.length;
    }
  }

  function clearMarks() {
    [].slice.call(guide.querySelectorAll(".rdr-mark")).forEach(function (m) {
      var p = m.parentNode;
      while (m.firstChild) p.insertBefore(m.firstChild, m);
      p.removeChild(m);
      p.normalize();
    });
  }

  function renderMarks() {
    if (!guide) return;
    clearMarks();
    state.marks.forEach(function (m) {
      var block = blocks[m.b];
      if (block) { try { wrapRange(block, m.s, m.e, m.k, m.c, m.id); } catch (e) {} }
    });
  }

  // ------------------------------------------------------------------ palette

  var PALETTE = [
    { id: "yellow", hl: "#ffe89a", ul: "#d9a400", label: "Yellow" },
    { id: "green", hl: "#bdebc4", ul: "#2f8a44", label: "Green" },
    { id: "blue",  hl: "#bfe0f5", ul: "#1f6f9e", label: "Blue" },
    { id: "pink",  hl: "#fbcfe0", ul: "#b63f73", label: "Pink" },
    { id: "orange", hl: "#ffd8ab", ul: "#c2650d", label: "Orange" }
  ];
  function colourOf(id, kind) {
    var p = PALETTE.filter(function (x) { return x.id === id; })[0] || PALETTE[0];
    return kind === "ul" ? p.ul : p.hl;
  }

  var tool = { kind: "hl", colour: "yellow" };

  // ------------------------------------------------------------------ selection

  function onSelection() {
    var sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) { hideBubble(); return; }
    var r = sel.getRangeAt(0);
    if (!guide || !blockOfRange(r)) { hideBubble(); return; }
    showBubble(r);
  }

  var bubble = null;
  function hideBubble() { if (bubble) bubble.hidden = true; }

  function showBubble(range) {
    if (!bubble) return;
    var rect = range.getBoundingClientRect();
    bubble.hidden = false;
    var top = rect.top + window.scrollY - bubble.offsetHeight - 8;
    if (top < window.scrollY + 4) top = rect.bottom + window.scrollY + 8;
    var left = rect.left + window.scrollX + rect.width / 2 - bubble.offsetWidth / 2;
    left = Math.max(8, Math.min(left, document.documentElement.clientWidth - bubble.offsetWidth - 8));
    bubble.style.top = top + "px";
    bubble.style.left = left + "px";
  }

  function applyToSelection(kind) {
    var sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return;
    var r = sel.getRangeAt(0);
    var first = blockOfRange(r), last = blockOf(r.endContainer) || first;
    if (!first) return;

    // one mark per block the selection touches, so dragging across paragraphs works
    var touched = [];
    if (!last || first === last) {
      touched = [first];
    } else {
      for (var i = 0; i < blocks.length; i++) {
        if (r.intersectsNode && r.intersectsNode(blocks[i])) touched.push(blocks[i]);
      }
      if (!touched.length) touched = [first];
    }

    var made = 0;
    touched.forEach(function (block) {
      var full = document.createRange();
      full.selectNodeContents(block);
      var s = (block === first) ? r.cloneRange() : full.cloneRange();
      if (block !== first) s.setEnd(full.endContainer, full.endOffset);
      if (block === last && block !== first) { s = full.cloneRange(); s.setEnd(r.endContainer, r.endOffset); }
      var off = offsetsOf(block === first ? r : s, block);
      if (!off) {
        var len = block.textContent.length;
        off = { s: 0, e: len };
        if (block === last) off.e = offsetsOf(s, block) ? offsetsOf(s, block).e : len;
      }
      if (off.e <= off.s) return;
      state.marks.push({
        id: "m" + Date.now() + Math.random().toString(36).slice(2, 5) + made,
        b: +block.getAttribute("data-b"), s: off.s, e: off.e,
        k: kind, c: colourOf(tool.colour, kind), colourId: tool.colour
      });
      made++;
    });

    if (!made) return;
    save();
    renderMarks();
    sel.removeAllRanges();
    hideBubble();
  }

  function removeMarkAt(target) {
    var mid = target.getAttribute("data-mid");
    state.marks = state.marks.filter(function (m) { return m.id !== mid; });
    save();
    renderMarks();
  }

  // ------------------------------------------------------------------ notes

  function renderNotes() {
    if (!guide) return;
    [].slice.call(guide.querySelectorAll(".rdr-note")).forEach(function (n) { n.remove(); });
    state.notes.forEach(function (n) {
      var block = blocks[n.b];
      if (!block) return;
      var pin = document.createElement("span");
      pin.className = "rdr-note";
      pin.setAttribute("data-nid", n.id);
      pin.title = n.text;
      pin.textContent = "note";
      block.appendChild(pin);
    });
  }

  function addNoteFor(block) {
    var existing = "";
    var text = promptNote(existing);
    if (text === null) return;
    if (!text.trim()) return;
    state.notes.push({
      id: "n" + Date.now() + Math.random().toString(36).slice(2, 5),
      b: +block.getAttribute("data-b"), text: text.trim(), at: new Date().toISOString()
    });
    save();
    renderNotes();
  }

  // the artifact viewer suppresses window.prompt, so notes use an inline editor
  var noteEditor = null, noteResolve = null;
  function promptNote(initial) { return null; }   // replaced below by the inline editor

  function openNoteEditor(block, existingId) {
    var found = state.notes.filter(function (n) { return n.id === existingId; })[0];
    noteEditor.hidden = false;
    noteEditor.querySelector("textarea").value = found ? found.text : "";
    noteEditor.dataset.block = block ? block.getAttribute("data-b") : "";
    noteEditor.dataset.nid = existingId || "";
    noteEditor.querySelector(".rdr-del").hidden = !existingId;
    noteEditor.querySelector("textarea").focus();
  }

  // ------------------------------------------------------------------ ink
  // Strokes stay vectors. Two canvases: everything committed is on `canvas`, the stroke
  // being drawn right now is on `live`. That keeps a 16-megapixel repaint off the hot path
  // and lets a translucent highlighter stroke be drawn as one path, so it does not darken
  // itself where it doubles back.
  //
  // Erasing never composites. "part" drops the points under the eraser and splits what is
  // left; "whole" removes any stroke the eraser touches, the way a tablet object eraser
  // behaves. Both are ordinary edits to the stroke list.

  var canvas = null, ctx = null;        // committed
  var live = null, lctx = null;         // the stroke in progress
  var drawing = false, stroke = null;
  var eraseMode = "part";               // part | whole
  var rafPending = false;

  var INK = {
    pen: { w: 2.4, alpha: 1 },
    hl:  { w: 16,  alpha: 0.32 }
  };
  var ERASE_R = { part: 14, whole: 9 };

  function layoutSignature() {
    return [state.width, state.size, state.leading, state.face,
            Math.round(guide.getBoundingClientRect().width)].join("|");
  }

  // Two separate ceilings, and the old code only knew about one of them.
  //
  // Area was capped at 60M, but a browser also refuses a canvas whose *side* is too long, and
  // a long case is far taller than it is wide. Case 01 at 320px is about 287 x 69,679, which
  // is only 20M pixels and sails past an area check, while 69,679 exceeds Chrome's 65,535
  // limit outright: Chrome then renders its broken-canvas placeholder over the guide and the
  // page goes white. The text was intact underneath the whole time.
  //
  // The old fallback was worse than nothing, too. It truncated the canvas height, so on any
  // guide over the cap the lower part of the page silently could not be inked.
  //
  // So nothing is truncated now. The canvas keeps the document's full CSS size and the
  // backing store is scaled to fit inside both ceilings, with the context transformed to
  // match. Strokes stay in document coordinates and keep working. Where there is headroom the
  // scale goes the other way, up to devicePixelRatio, which is also what makes ink sharp on a
  // retina screen instead of soft.
  var MAX_CANVAS_DIM = 32767;     // comfortably inside Chrome's 65535 and Safari's lower bound
  var MAX_CANVAS_PX = 16000000;   // iOS Safari refuses much beyond ~16.7M

  function inkScale(w, h) {
    var s = window.devicePixelRatio || 1;
    s = Math.min(s, MAX_CANVAS_DIM / Math.max(1, w), MAX_CANVAS_DIM / Math.max(1, h));
    s = Math.min(s, Math.sqrt(MAX_CANVAS_PX / Math.max(1, w * h)));
    return Math.max(0.08, s);
  }

  function sizeCanvas(c, w, h, left, top, originY) {
    // CSS size is always the true size, so stroke coordinates remain document pixels
    c.style.width = w + "px";
    c.style.height = h + "px";
    c.style.left = left + "px";
    c.style.top = top + "px";

    var s = inkScale(w, h);
    c.width = Math.max(1, Math.round(w * s));
    c.height = Math.max(1, Math.round(h * s));
    c.inkScale = s;
    // The canvas covers a window onto the page, not the whole page, so shift the context
    // by where that window starts. Strokes stay in guide coordinates throughout.
    c.inkOriginY = originY || 0;
    var g = c.getContext("2d");
    if (g) g.setTransform(s, 0, 0, s, 0, -c.inkOriginY * s);
    return s;
  }

  // clearRect runs through the transform, so clearing has to be done in untransformed space
  function wipe(c, g) {
    if (!c || !g) return;
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, c.width, c.height);
    g.restore();
  }

  // How much page above and below the viewport the ink canvas also covers, so that an
  // ordinary scroll does not need a new canvas on every frame.
  var INK_MARGIN = 600;

  // The ink canvases used to span the whole document. On a long case that is a canvas
  // 48,000px tall, which does two bad things on an iPad. The browser caps a canvas at
  // about 16 million pixels, so the backing store was forced below screen resolution and
  // the ink came out soft and blotchy. And every pointermove cleared the whole of it,
  // fifteen million pixels at a time, which is why writing skipped. A canvas the size of
  // the viewport is sharp at full device pixel ratio and costs almost nothing to clear.
  function layoutInk() {
    if (!canvas || !guide) return;
    var wrap = guide.querySelector(".wrap") || guide;
    var r = wrap.getBoundingClientRect();
    var w = Math.round(r.width);
    var pageH = Math.round(wrap.scrollHeight || r.height);
    var view = window.innerHeight || 800;

    // where the visible slice starts, measured from the top of the wrap
    var originY = Math.max(0, Math.round(-r.top) - INK_MARGIN);
    var h = Math.min(pageH - originY, view + INK_MARGIN * 2);
    if (h < 1) { originY = Math.max(0, pageH - 1); h = Math.min(pageH, view); }

    sizeCanvas(canvas, w, h, wrap.offsetLeft, wrap.offsetTop + originY, originY);
    sizeCanvas(live, w, h, wrap.offsetLeft, wrap.offsetTop + originY, originY);
    redrawInk();
  }

  // Re-aim the canvases when the page has scrolled far enough that the window they cover
  // is about to run out. Never while a stroke is in progress: moving the canvas would
  // wipe what is being drawn.
  function inkFollowScroll() {
    if (!canvas || !guide || drawing) return;
    var wrap = guide.querySelector(".wrap") || guide;
    var r = wrap.getBoundingClientRect();
    var want = Math.max(0, Math.round(-r.top) - INK_MARGIN);
    var have = canvas.inkOriginY || 0;
    var slack = INK_MARGIN / 2;
    if (Math.abs(want - have) > slack) layoutInk();
  }

  function pathStroke(c, s) {
    if (!s.pts.length) return;
    c.save();
    c.globalAlpha = INK[s.k || "pen"].alpha;
    c.strokeStyle = s.c;
    c.lineWidth = s.w;
    c.lineCap = "round";
    c.lineJoin = "round";
    c.beginPath();
    c.moveTo(s.pts[0][0], s.pts[0][1]);
    for (var i = 1; i < s.pts.length; i++) c.lineTo(s.pts[i][0], s.pts[i][1]);
    if (s.pts.length === 1) c.lineTo(s.pts[0][0] + 0.01, s.pts[0][1]);
    c.stroke();
    c.restore();
  }

  function strokeBox(s) {
    if (s.__box && s.__n === s.pts.length) return s.__box;
    var lo = Infinity, hi = -Infinity;
    for (var i = 0; i < s.pts.length; i++) {
      if (s.pts[i][1] < lo) lo = s.pts[i][1];
      if (s.pts[i][1] > hi) hi = s.pts[i][1];
    }
    s.__box = [lo, hi];
    s.__n = s.pts.length;
    return s.__box;
  }

  function inWindow(c, s) {
    if (!s.pts || !s.pts.length) return false;
    var box = strokeBox(s), pad = (s.w || 2) + 4;
    var top = c.inkOriginY || 0;
    return box[1] + pad >= top && box[0] - pad <= top + (parseFloat(c.style.height) || 0);
  }

  // Draw only the tail of a stroke, from `from` onwards. Opaque ink can be extended in
  // place like this; translucent ink cannot, because the overlap would darken.
  function pathTail(c, s, from) {
    if (s.pts.length - from < 2) return;
    c.save();
    c.globalAlpha = INK[s.k || "pen"].alpha;
    c.strokeStyle = s.c;
    c.lineWidth = s.w;
    c.lineCap = "round";
    c.lineJoin = "round";
    c.beginPath();
    c.moveTo(s.pts[from][0], s.pts[from][1]);
    for (var i = from + 1; i < s.pts.length; i++) c.lineTo(s.pts[i][0], s.pts[i][1]);
    c.stroke();
    c.restore();
  }

  // Clear just the rectangle a stroke covers, rather than the whole canvas.
  function clearStrokeBox(c, g, s) {
    if (!s.pts.length) return;
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (var i = 0; i < s.pts.length; i++) {
      var pt = s.pts[i];
      if (pt[0] < x0) x0 = pt[0];
      if (pt[0] > x1) x1 = pt[0];
      if (pt[1] < y0) y0 = pt[1];
      if (pt[1] > y1) y1 = pt[1];
    }
    var pad = (s.w || 2) + 4;
    g.clearRect(x0 - pad, y0 - pad, (x1 - x0) + pad * 2, (y1 - y0) + pad * 2);
  }

  function redrawInk() {
    if (!ctx) return;
    wipe(canvas, ctx);
    // highlighter first, so pen marks sit on top of it rather than under
    for (var i = 0; i < state.ink.length; i++) {
      if (state.ink[i].k === "hl" && inWindow(canvas, state.ink[i])) {
        pathStroke(ctx, state.ink[i]);
      }
    }
    for (var j = 0; j < state.ink.length; j++) {
      if (state.ink[j].k !== "hl" && inWindow(canvas, state.ink[j])) {
        pathStroke(ctx, state.ink[j]);
      }
    }
  }

  function queueRedraw() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(function () { rafPending = false; redrawInk(); });
  }

  function penPoint(ev) {
    var r = live.getBoundingClientRect();
    // the canvas is a window onto the page now, so add where that window starts
    return [ev.clientX - r.left, ev.clientY - r.top + (live.inkOriginY || 0)];
  }

  // ---- erasing -------------------------------------------------------------

  function near(pt, x, y, r) {
    var dx = pt[0] - x, dy = pt[1] - y;
    return dx * dx + dy * dy <= r * r;
  }

  // distance from (x,y) to the segment a-b, so a thin stroke is still easy to hit
  function segNear(a, b, x, y, r) {
    var vx = b[0] - a[0], vy = b[1] - a[1];
    var wx = x - a[0], wy = y - a[1];
    var len = vx * vx + vy * vy;
    var tt = len ? Math.max(0, Math.min(1, (wx * vx + wy * vy) / len)) : 0;
    var px = a[0] + tt * vx, py = a[1] + tt * vy;
    var dx = x - px, dy = y - py;
    return dx * dx + dy * dy <= r * r;
  }

  function strokeHit(s, x, y, r) {
    var pad = r + s.w / 2;
    if (s.pts.length === 1) return near(s.pts[0], x, y, pad);
    for (var i = 1; i < s.pts.length; i++) {
      if (segNear(s.pts[i - 1], s.pts[i], x, y, pad)) return true;
    }
    return false;
  }

  function eraseAt(x, y) {
    var r = ERASE_R[eraseMode];
    var next = [], changed = false;

    for (var i = 0; i < state.ink.length; i++) {
      var s = state.ink[i];

      if (eraseMode === "whole") {
        if (strokeHit(s, x, y, r)) { changed = true; continue; }
        next.push(s);
        continue;
      }

      // part: drop points under the eraser, keeping whatever runs survive
      if (!strokeHit(s, x, y, r)) { next.push(s); continue; }
      var pad = r + s.w / 2;
      var run = [], runs = [];
      for (var j = 0; j < s.pts.length; j++) {
        if (near(s.pts[j], x, y, pad)) {
          if (run.length > 1) runs.push(run);
          run = [];
        } else {
          run.push(s.pts[j]);
        }
      }
      if (run.length > 1) runs.push(run);
      changed = true;
      for (var k = 0; k < runs.length; k++) {
        next.push({ id: s.id + "-" + k, k: s.k, pts: runs[k], c: s.c, w: s.w });
      }
    }

    if (changed) { state.ink = next; queueRedraw(); }
    return changed;
  }

  // ---- drawing -------------------------------------------------------------

  function penDown(ev) {
    if (tool.kind !== "pen" && tool.kind !== "ink-hl" && tool.kind !== "erase") return;
    ev.preventDefault();
    // Aim the ink window before the stroke starts rather than trusting that a scroll
    // event arrived. If the canvas is stale the pointer coordinates are offset by the
    // scroll, and the stroke lands somewhere else entirely.
    inkFollowScroll();
    drawing = true;
    // setPointerCapture throws on a pointer the element does not currently own, and an
    // exception here would abort the rest of the handler, so the stroke never starts
    try { live.setPointerCapture && live.setPointerCapture(ev.pointerId); } catch (e) {}

    if (tool.kind === "erase") {
      var p = penPoint(ev);
      eraseAt(p[0], p[1]);
      return;
    }
    var kind = tool.kind === "ink-hl" ? "hl" : "pen";
    stroke = {
      id: "s" + Date.now() + Math.random().toString(36).slice(2, 5),
      k: kind,
      pts: [penPoint(ev)],
      c: colourOf(tool.colour, kind === "hl" ? "hl" : "ul"),
      w: INK[kind].w
    };
  }

  function penMove(ev) {
    if (!drawing) return;
    ev.preventDefault();
    var pts = (ev.getCoalescedEvents ? ev.getCoalescedEvents() : [ev]).map(penPoint);
    if (!pts.length) pts = [penPoint(ev)];

    if (tool.kind === "erase") {
      for (var i = 0; i < pts.length; i++) eraseAt(pts[i][0], pts[i][1]);
      return;
    }
    if (!stroke) return;          // a move with no stroke in progress
    var from = Math.max(0, stroke.pts.length - 1);
    stroke.pts.push.apply(stroke.pts, pts);

    if (INK[stroke.k || "pen"].alpha >= 1) {
      // Opaque ink: extend the line in place and draw only the new piece. Clearing the
      // canvas and re-drawing the whole stroke on every pointer event made the cost grow
      // with the length of the stroke, and an Apple Pencil sends events at 120Hz, which
      // is why writing skipped and broke up.
      pathTail(lctx, stroke, from);
    } else {
      // Translucent ink has to be redrawn whole or the overlaps darken, but only the
      // rectangle it covers needs clearing, not the whole canvas.
      clearStrokeBox(live, lctx, stroke);
      pathStroke(lctx, stroke);
    }
  }

  function penUp() {
    if (!drawing) return;
    drawing = false;
    if (tool.kind === "erase") { save(); updateLock(); return; }
    if (stroke && stroke.pts.length) {
      state.ink.push(stroke);
      state.inkLayout = layoutSignature();
      save();
      updateLock();
    }
    stroke = null;
    wipe(live, lctx);
    redrawInk();
  }

  function setPenMode(on) {
    guide.classList.toggle("rdr-pen-on", on);
    if (live) live.style.pointerEvents = on ? "auto" : "none";
    if (on && !state.inkLayout) { state.inkLayout = layoutSignature(); save(); }
    updateLock();
  }

  function updateLock() {
    var locked = state.ink.length > 0;
    [].slice.call(document.querySelectorAll("[data-locks-layout]")).forEach(function (el) {
      el.disabled = locked;
      el.title = locked ? "Locked while there is ink on the page; erase it to change layout" : "";
    });
    var warn = document.getElementById("rdrLock");
    if (warn) warn.hidden = !locked;
  }

  // ------------------------------------------------------------------ recall mode

  function bindGuide() {
    if (!guide || guide.__rdrBound) return;
    guide.__rdrBound = true;

    // citations: first tap fetches the excerpts, then opens the pane
    guide.addEventListener("click", function (ev) {
      var c = ev.target.closest("cite.src");
      if (!c || tool.kind === "pen" || tool.kind === "ink-hl" || tool.kind === "erase") return;
      ev.preventDefault();
      ev.stopPropagation();
      var k = citeKeyOf(c);
      if (!k) return;
      if (citesState === "ready") { openCite(k); return; }
      loadCites().then(function (j) { if (j) openCite(k); });
    });

    guide.addEventListener("keydown", function (ev) {
      if (ev.key !== "Enter" && ev.key !== " ") return;
      // not cite.src[data-cite-key]: that attribute is only set once the excerpts have
      // loaded, and they only loaded on a mouse click, so a keyboard-only reader could
      // never open the first citation and therefore never got any of them.
      var c = ev.target.closest && ev.target.closest("cite.src");
      if (!c) return;
      ev.preventDefault();
      var k = citeKeyOf(c);
      if (!k) return;
      if (citesState === "ready") { openCite(k); return; }
      loadCites().then(function (j) { if (j) openCite(k); });
    });

    // recall mode: tap a hidden answer to show it
    guide.addEventListener("click", function (ev) {
      if (state.recall !== "on") return;
      // A drag to select text inside a revealed answer ends in a click, which hid it
      // again, so the answer could not be highlighted or copied.
      var sel = window.getSelection && window.getSelection();
      if (sel && !sel.isCollapsed) return;
      var t = ev.target.closest(RECALL_SEL);
      if (t && guide.contains(t)) toggleRecall(t);
    });

    guide.addEventListener("keydown", function (ev) {
      if (state.recall !== "on") return;
      if (ev.key !== "Enter" && ev.key !== " ") return;
      var t = ev.target.closest && ev.target.closest(RECALL_SEL);
      if (!t || !guide.contains(t)) return;
      ev.preventDefault();
      toggleRecall(t);
    });

    // tapping a highlight removes it; tapping a note opens it
    guide.addEventListener("click", function (ev) {
      var n = ev.target.closest(".rdr-note");
      if (n) { openNoteEditor(null, n.getAttribute("data-nid")); return; }
      var m = ev.target.closest(".rdr-mark");
      if (m && tool.kind !== "pen" && tool.kind !== "ink-hl" && tool.kind !== "erase") {
        removeMarkAt(m);
      }
    });
  }


  // ------------------------------------------------------------------ source pane
  // Tapping a citation shows what the book actually said, in a pane over the guide rather
  // than a new tab, so the reader keeps their place. The excerpts live in citations.json,
  // fetched once on the first tap; without it the chips stay inert rather than erroring.

  var CITES = null, citesState = "idle";   // idle | loading | ready | failed
  var citePane = null;

  // The book id is the class beside "src"; the rest of the key is every number in the chip,
  // in order. That covers the simple case, comma lists, page ranges, and the one chip that
  // carries two chapters, and it matches the rule the extractor used to name its entries.
  function citeKeyOf(el) {
    var book = null;
    for (var i = 0; i < el.classList.length; i++) {
      if (el.classList[i] !== "src") { book = el.classList[i]; break; }
    }
    if (!book) return null;
    var nums = (el.textContent || "").match(/[0-9]+/g);
    if (!nums || !nums.length) return null;
    return book + "-" + nums.join("-");
  }

  var citesPromise = null;

  function loadCites() {
    if (citesPromise) return citesPromise;
    citesState = "loading";
    citesPromise = fetch("citations.json")
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (j) { CITES = j; citesState = "ready"; markCitesClickable(); return j; })
      .catch(function () {
        // Drop the cached promise as well as the state. Keeping it meant one bad moment
        // on a ward connection killed every citation in the guide for the life of the
        // page, and the only way back was a reload, which costs the reader their place.
        citesState = "failed";
        citesPromise = null;
        return null;
      });
    return citesPromise;
  }

  // A long case is eight to ten numbered sections and up to seventeen thousand words,
  // with no way to reach the viva at the bottom but scrolling. This gives every section
  // an id and puts a collapsed contents list under the standfirst.
  function slugOf(text) {
    return String(text).toLowerCase()
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  }

  function buildContents() {
    if (!guide || guide.querySelector(".rdr-toc")) return;
    var hs = [].slice.call(guide.querySelectorAll("h2"));
    if (hs.length < 3) return;

    var items = hs.map(function (h, i) {
      var n = h.querySelector(".n");
      // "<span class=n>1</span>The case in one breath" is read aloud as "1The case in
      // one breath", and the number is already in the link beside it
      if (n) n.setAttribute("aria-hidden", "true");
      var label = (h.textContent || "").replace(/^\s*\d+\s*/, "").trim();
      if (!h.id) h.id = "s" + (i + 1) + "-" + slugOf(label);
      return '<li><a href="#' + h.id + '"><b>' + (n ? escHtml(n.textContent) : (i + 1)) +
             '</b>' + escHtml(label) + "</a></li>";
    }).join("");

    var nav = document.createElement("nav");
    nav.className = "rdr-toc";
    nav.setAttribute("aria-label", "Sections");
    nav.innerHTML = "<details><summary>Sections</summary><ol>" + items + "</ol></details>";

    var after = guide.querySelector(".standfirst") || guide.querySelector("header");
    if (after && after.parentNode) after.parentNode.insertBefore(nav, after.nextSibling);
    else guide.insertBefore(nav, guide.firstChild);
  }

  // The chips only became focusable once the excerpts had loaded, and the excerpts only
  // loaded on a mouse click, so a keyboard-only reader could not reach a single one. They
  // are controls from the moment the guide mounts; the keydown handler loads on demand.
  function armCites() {
    if (!guide) return;
    [].forEach.call(guide.querySelectorAll("cite.src"), function (c) {
      c.tabIndex = 0;
      c.setAttribute("role", "button");
      if (!c.getAttribute("aria-label")) {
        c.setAttribute("aria-label", "Source: " + (c.textContent || "").trim() +
                                     ". Opens the passage it cites.");
      }
    });
  }

  function markCitesClickable() {
    if (!guide || !CITES) return;
    [].forEach.call(guide.querySelectorAll("cite.src"), function (c) {
      var k = citeKeyOf(c);
      if (k && CITES.citations && CITES.citations[k]) {
        c.setAttribute("data-cite-key", k);
        c.tabIndex = 0;
      }
    });
  }

  function openCite(key) {
    if (!CITES) return;
    var c = CITES.citations[key];
    if (!c) return;
    var book = (CITES.books || {})[c.book] || { title: c.book, edition: "" };

    var body = (c.pages || []).map(function (pid) {
      var pg = (CITES.pages || {})[pid];
      if (!pg) return "";
      return '<div class="rdr-src-page">' +
        '<div class="rdr-src-pno">page ' + pg.page + '</div>' +
        (pg.before ? '<p class="rdr-src-ctx">' + escHtml(pg.before) + '</p>' : "") +
        '<p class="rdr-src-main">' + escHtml(pg.text) + '</p>' +
        (pg.after ? '<p class="rdr-src-ctx">' + escHtml(pg.after) + '</p>' : "") +
        '</div>';
    }).join("");

    citePane.querySelector(".rdr-src-book").textContent = book.title;
    citePane.querySelector(".rdr-src-meta").textContent =
      [book.edition, "chapter " + c.chapter].filter(Boolean).join(" · ");
    // S Das is the worst scanned of the three books, and its passages come through with
    // real OCR damage: broken words, spliced columns, numbers turned into letters. Saying
    // so is better than letting a reader conclude the guide is quoting carelessly, or
    // worse, trusting a mangled number.
    var note = (c.book === "das")
      ? '<p class="rdr-src-ctx">This book scans poorly, so the text below has OCR errors: ' +
        'broken words, and columns that run into each other. The quotation in the guide is ' +
        'what the printed page says. Check a number here against your own copy.</p>'
      : "";
    citePane.querySelector(".rdr-src-body").innerHTML = (note + body) ||
      '<p class="rdr-src-ctx">That page was not extracted.</p>';
    citePane.hidden = false;
    citePane.querySelector(".rdr-src-close").focus();
  }

  function closeCite() { if (citePane) citePane.hidden = true; }

  function escHtml(s) {
    return String(s).replace(/[&<>"']/g, function (ch) {
      return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch];
    });
  }

  function buildCitePane() {
    citePane = el("aside", "rdr-srcpane");
    citePane.hidden = true;
    citePane.setAttribute("aria-label", "Source text");
    citePane.innerHTML =
      '<header class="rdr-src-head">' +
        '<div><div class="rdr-src-book"></div><div class="rdr-src-meta"></div></div>' +
        '<button class="rdr-src-close" aria-label="Close">&times;</button>' +
      '</header><div class="rdr-src-body"></div>' +
      '<footer class="rdr-src-foot">Quoted for study. The surrounding paragraphs are shown ' +
      'for context.</footer>';
    document.body.appendChild(citePane);
    citePane.querySelector(".rdr-src-close").addEventListener("click", closeCite);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeCite();
    });
  }


  // ------------------------------------------------------------------ backup
  // localStorage is the only copy of any of this, and Safari drops it for sites left
  // unvisited for a week. Export writes one file holding every person's settings,
  // highlights, notes, ink and viva results; restore puts them back.

  var BACKUP_FORMAT = "rx-backup";

  function backupKeys() {
    var out = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && (k.indexOf("reader:") === 0 || k.indexOf("surgery-case-files") === 0)) {
          out.push(k);
        }
      }
    } catch (e) {}
    return out;
  }

  function collectBackup() {
    var data = {};
    backupKeys().forEach(function (k) {
      try { data[k] = JSON.parse(localStorage.getItem(k)); }
      catch (e) { data[k] = localStorage.getItem(k); }
    });
    return {
      format: BACKUP_FORMAT,
      version: 1,
      exportedAt: new Date().toISOString(),
      keys: data
    };
  }

  // a plain-English summary, so a restore is not a leap of faith
  function describeBackup(b) {
    var people = {}, marks = 0, notes = 0, ink = 0, sessions = 0, docs = {};
    Object.keys(b.keys || {}).forEach(function (k) {
      var v = b.keys[k];
      if (k.indexOf("reader:") === 0) {
        var bits = k.split(":");
        if (bits[1] && bits[1] !== "_") people[bits[1]] = true;
        if (bits[2]) docs[bits[2]] = true;
        if (v && v.marks) marks += v.marks.length;
        if (v && v.notes) notes += v.notes.length;
        if (v && v.ink) ink += v.ink.length;
      } else if (v && v.students) {
        Object.keys(v.students).forEach(function (s) {
          people[s] = true;
          sessions += (v.students[s].sessions || []).length;
        });
      }
    });
    return {
      people: Object.keys(people),
      docs: Object.keys(docs).length,
      marks: marks, notes: notes, ink: ink, sessions: sessions
    };
  }

  function backupFilename() {
    var d = new Date();
    function p(n) { return (n < 10 ? "0" : "") + n; }
    return "rx-backup-" + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + ".json";
  }

  function exportBackup(say) {
    var json = JSON.stringify(collectBackup(), null, 1);
    var blob = new Blob([json], { type: "application/json" });
    var name = backupFilename();
    var size = Math.max(1, Math.round(json.length / 1024));

    // inside an artifact a download link does nothing, so ask the host to save it
    if (window.claude && window.claude.use) {
      window.claude.use("downloads").then(function (dl) {
        if (!dl) throw new Error("not granted");
        return dl.save({ filename: name, data: blob });
      }).then(function () {
        say("Saved " + name + ", " + size + " KB.");
      }).catch(function () {
        say("Could not save the file here. Open the guide on the website and export from there.");
      });
      return;
    }

    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    say("Saved " + name + ", " + size + " KB.");
  }

  var pendingRestore = null;

  function readBackupFile(file, say, onReady) {
    var fr = new FileReader();
    fr.onload = function () {
      var b;
      try { b = JSON.parse(fr.result); } catch (e) { b = null; }
      if (!b || b.format !== BACKUP_FORMAT || !b.keys) {
        say("That does not look like a backup from this site.");
        return;
      }
      pendingRestore = b;
      onReady(describeBackup(b), b);
    };
    fr.onerror = function () { say("Could not read that file."); };
    fr.readAsText(file);
  }

  function applyRestore(say) {
    if (!pendingRestore) return;
    var n = 0;
    Object.keys(pendingRestore.keys).forEach(function (k) {
      var v = pendingRestore.keys[k];
      try {
        localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v));
        n++;
      } catch (e) {}
    });
    pendingRestore = null;
    say("Restored " + n + " record" + (n === 1 ? "" : "s") + ". Reloading…");
    setTimeout(function () { location.reload(); }, 900);
  }

  // ------------------------------------------------------------------ interface

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  function swatches(kind) {
    return PALETTE.map(function (p) {
      return '<button class="rdr-sw" data-colour="' + p.id + '" title="' + p.label + '" ' +
             'style="background:' + (kind === "ul" ? p.ul : p.hl) + '"></button>';
    }).join("");
  }

  function seg(name, opts, current) {
    return '<div class="rdr-seg" data-setting="' + name + '">' + opts.map(function (o) {
      return '<button data-v="' + o[0] + '"' + (current === o[0] ? ' class="on"' : '') +
             (o[2] ? ' data-locks-layout="1"' : '') + '>' + o[1] + '</button>';
    }).join("") + '</div>';
  }

  function buildUI() {
    // floating rail
    var rail = el("div", "rdr-rail");
    rail.innerHTML =
      '<button id="rdrStudio" title="Reading settings" aria-label="Reading settings">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h10M4 17h7"/></svg></button>' +
      '<button class="rdr-tool" data-tool="hl" title="Highlighter">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14l-4 4v2h4l10-10a2.8 2.8 0 10-4-4L5 16"/></svg></button>' +
      '<button class="rdr-tool" data-tool="ul" title="Underline">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M7 4v6a5 5 0 0010 0V4M5 20h14"/></svg></button>' +
      '<button class="rdr-tool" data-tool="pen" title="Pen, write on the page">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19l7-7-4-4-7 7-1 5z"/><path d="M15 8l1-1a2 2 0 013 3l-1 1"/></svg></button>' +
      '<button class="rdr-tool" data-tool="ink-hl" title="Freehand highlighter">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16"/><path d="M7 16l9-9 3 3-9 9H7z" fill="currentColor" fill-opacity=".22"/></svg></button>' +
      '<button class="rdr-tool" data-tool="note" title="Leave a note">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v10H9l-5 4z"/></svg></button>' +
      '<button class="rdr-tool" data-tool="erase" title="Eraser">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 20H4l9-9 7 7-5 2z"/><path d="M13 11l-6-6 4-4 6 6z"/></svg></button>' +
      '<div class="rdr-pal" id="rdrPal">' + swatches("hl") + '</div>' +
      '<div class="rdr-erase-modes" id="rdrEraseModes" hidden>' +
        '<button data-erase="part" class="on" title="Rub out part of a stroke">part</button>' +
        '<button data-erase="whole" title="Remove a whole stroke">whole</button>' +
      '</div>';
    document.body.appendChild(rail);

    // selection bubble
    bubble = el("div", "rdr-bubble");
    bubble.hidden = true;
    bubble.innerHTML =
      '<button data-act="hl">Highlight</button>' +
      '<button data-act="ul">Underline</button>' +
      '<button data-act="note">Note</button>';
    document.body.appendChild(bubble);

    // note editor
    noteEditor = el("div", "rdr-noteedit");
    noteEditor.hidden = true;
    noteEditor.innerHTML =
      '<div class="rdr-ne-head">Note</div>' +
      '<textarea rows="4" placeholder="Anything you want to remember here…"></textarea>' +
      '<div class="rdr-ne-row">' +
        '<button class="rdr-del">Delete</button><span style="flex:1"></span>' +
        '<button class="rdr-cancel">Cancel</button>' +
        '<button class="rdr-ok">Save</button></div>';
    document.body.appendChild(noteEditor);

    // studio panel
    var studio = el("div", "rdr-studio");
    studio.hidden = true;
    studio.innerHTML =
      '<div class="rdr-st-head"><b>Reading settings</b>' +
        '<button class="rdr-close" aria-label="Close">&times;</button></div>' +
      '<div class="rdr-st-body">' +
        '<label>Line width</label>' +
        seg("width", [["narrow","Narrow"],["medium","Medium"],["wide","Wide"],["full","Full"]], state.width) +
        '<label>Text size</label>' +
        seg("size", [["1","XS"],["2","S"],["3","M"],["4","L"],["5","XL"],["6","XXL"]], state.size) +
        '<label>Line spacing</label>' +
        seg("leading", [["tight","Tight"],["normal","Normal"],["loose","Loose"]], state.leading) +
        '<label>Typeface</label>' +
        seg("face", [["serif","Serif"],["sans","Sans"],["hyper","Hyperlegible"],["mono","Mono"]], state.face) +
        '<label>Colour</label>' +
        seg("theme", [["auto","Auto"],["light","Light"],["sepia","Sepia"],["dark","Dark"],["contrast","High contrast"]], state.theme) +
        '<label>Emphasis</label>' +
        seg("hlHead", [["off","Plain headings"],["on","Bold headings"]], state.hlHead) +
        seg("hlWhy", [["off","Plain reasoning"],["on","Highlight reasoning"]], state.hlWhy) +
        seg("hlTerm", [["off","Plain key terms"],["on","Highlight key terms"]], state.hlTerm) +
        '<label>Study mode</label>' +
        seg("recall", [["off","Read"],["on","Recall, hide answers until tapped"]], state.recall) +
        '<label>Show</label>' +
        seg("cite", [["on","Citations"],["off","No citations"]], state.cite) +
        seg("conflicts", [["on","Discrepancies"],["off","Hide discrepancies"]], state.conflicts) +
        '<div class="rdr-lock" id="rdrLock" hidden>Layout is locked because there is ink on ' +
          'this page. Writing is drawn at a fixed width: erase the ink to change the layout.</div>' +
        '<label>Backup</label>' +
        // This used to say the work was stored only in this browser. That stopped being
        // true when sync was added, and telling a reader their highlighting is about to
        // vanish is why they would not bother highlighting.
        '<p class="rdr-note-hint" id="rdrBackupHint"></p>' +
        '<div class="rdr-backup">' +
          '<button class="rdr-export">Save a copy</button>' +
          '<button class="rdr-import">Restore from a file</button>' +
          '<input type="file" accept="application/json,.json" class="rdr-file" hidden>' +
        '</div>' +
        '<div class="rdr-restore" id="rdrRestore" hidden></div>' +
        '<p class="rdr-say" id="rdrSay"></p>' +
        '<p class="rdr-say" id="rdrSyncSay"></p>' +
        '<div class="rdr-st-foot">' +
          '<button class="rdr-clear" data-what="marks">Clear highlights</button>' +
          '<button class="rdr-clear" data-what="notes">Clear notes</button>' +
          '<button class="rdr-clear" data-what="ink">Clear ink</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(studio);

    buildCitePane();
    attachCanvas();
    wireUI(rail, studio);
  }

  function attachCanvas() {
    if (!canvas) {
      canvas = el("canvas", "rdr-canvas");
      canvas.style.pointerEvents = "none";
      ctx = canvas.getContext("2d");

      // the stroke in progress lives on its own layer, above the committed one
      live = el("canvas", "rdr-canvas rdr-canvas-live");
      live.style.pointerEvents = "none";
      live.addEventListener("pointerdown", penDown);
      live.addEventListener("pointermove", penMove);
      live.addEventListener("pointerup", penUp);
      live.addEventListener("pointercancel", penUp);
      live.addEventListener("pointerleave", penUp);
      lctx = live.getContext("2d");
    }
    var host = guide.querySelector(".wrap") || guide;
    if (canvas.parentNode !== host.parentNode) {
      host.parentNode.insertBefore(canvas, host);
      host.parentNode.insertBefore(live, host);
    }
  }

  function wireUI(rail, studio) {
    document.getElementById("rdrStudio").addEventListener("click", function () {
      studio.hidden = !studio.hidden;
    });
    studio.querySelector(".rdr-close").addEventListener("click", function () { studio.hidden = true; });

    // settings segments
    studio.addEventListener("click", function (ev) {
      var b = ev.target.closest(".rdr-seg button");
      if (!b) return;
      var name = b.parentNode.getAttribute("data-setting");
      [].slice.call(b.parentNode.children).forEach(function (x) { x.classList.remove("on"); });
      b.classList.add("on");
      state[name] = b.getAttribute("data-v");
      save();
      applySettings();
    });

    function say(msg) {
      var el2 = document.getElementById("rdrSay");
      if (el2) el2.textContent = msg || "";
    }

    studio.querySelector(".rdr-export").addEventListener("click", function () {
      say("Preparing…");
      exportBackup(say);
    });

    var fileInput = studio.querySelector(".rdr-file");
    studio.querySelector(".rdr-import").addEventListener("click", function () {
      say("");
      fileInput.value = "";
      fileInput.click();
    });

    fileInput.addEventListener("change", function () {
      var f = fileInput.files && fileInput.files[0];
      if (!f) return;
      readBackupFile(f, say, function (sum) {
        var box = document.getElementById("rdrRestore");
        var bits = [];
        if (sum.people.length) bits.push(sum.people.join(", "));
        if (sum.marks) bits.push(sum.marks + " highlight" + (sum.marks === 1 ? "" : "s"));
        if (sum.notes) bits.push(sum.notes + " note" + (sum.notes === 1 ? "" : "s"));
        if (sum.ink) bits.push(sum.ink + " ink stroke" + (sum.ink === 1 ? "" : "s"));
        if (sum.sessions) bits.push(sum.sessions + " viva session" + (sum.sessions === 1 ? "" : "s"));
        box.innerHTML =
          '<p>This file holds ' + escHtml(bits.join(", ") || "nothing recognisable") + '.</p>' +
          '<p class="rdr-warn">Restoring replaces what is in this browser now.</p>' +
          '<div class="rdr-backup">' +
            '<button class="rdr-cancel-restore">Cancel</button>' +
            '<button class="rdr-do-restore">Restore</button>' +
          '</div>';
        box.hidden = false;
        box.querySelector(".rdr-cancel-restore").addEventListener("click", function () {
          pendingRestore = null; box.hidden = true; say("");
        });
        box.querySelector(".rdr-do-restore").addEventListener("click", function () {
          box.hidden = true;
          applyRestore(say);
        });
      });
    });

    studio.addEventListener("click", function (ev) {
      var c = ev.target.closest(".rdr-clear");
      if (!c) return;
      var what = c.getAttribute("data-what");
      state[what] = [];
      if (what === "ink") { state.inkLayout = null; }
      save();
      if (what === "marks") renderMarks();
      if (what === "notes") renderNotes();
      if (what === "ink") redrawInk();
      updateLock();
    });

    // tools
    rail.addEventListener("click", function (ev) {
      var b = ev.target.closest(".rdr-tool");
      if (b) {
        var t = b.getAttribute("data-tool");
        tool.kind = (tool.kind === t) ? "hl" : t;
        [].slice.call(rail.querySelectorAll(".rdr-tool")).forEach(function (x) {
          x.classList.toggle("on", x.getAttribute("data-tool") === tool.kind);
        });
        var inkish = (tool.kind === "pen" || tool.kind === "ink-hl" || tool.kind === "erase");
        document.getElementById("rdrPal").innerHTML =
          swatches(tool.kind === "ul" || tool.kind === "pen" ? "ul" : "hl");
        document.getElementById("rdrPal").hidden = (tool.kind === "erase");
        document.getElementById("rdrEraseModes").hidden = (tool.kind !== "erase");
        markActiveSwatch();
        setPenMode(inkish);
        return;
      }
      var s = ev.target.closest(".rdr-sw");
      if (s) {
        tool.colour = s.getAttribute("data-colour");
        markActiveSwatch();
        return;
      }
      var m = ev.target.closest(".rdr-erase-modes button");
      if (m) {
        eraseMode = m.getAttribute("data-erase");
        [].slice.call(m.parentNode.children).forEach(function (x) {
          x.classList.toggle("on", x === m);
        });
      }
    });

    // selection bubble
    bubble.addEventListener("mousedown", function (e) { e.preventDefault(); });
    bubble.addEventListener("click", function (ev) {
      var b = ev.target.closest("button");
      if (!b) return;
      var act = b.getAttribute("data-act");
      if (act === "note") {
        var sel = window.getSelection();
        var block = blockOf(sel.anchorNode);
        hideBubble();
        if (block) openNoteEditor(block, "");
        return;
      }
      applyToSelection(act);
    });

    document.addEventListener("selectionchange", function () {
      if (tool.kind === "pen" || tool.kind === "ink-hl" || tool.kind === "erase") return;
      clearTimeout(wireUI._t);
      wireUI._t = setTimeout(onSelection, 120);
    });

    // note editor
    noteEditor.querySelector(".rdr-cancel").addEventListener("click", function () { noteEditor.hidden = true; });
    noteEditor.querySelector(".rdr-ok").addEventListener("click", function () {
      var text = noteEditor.querySelector("textarea").value.trim();
      var nid = noteEditor.dataset.nid;
      if (nid) {
        state.notes = state.notes.map(function (n) { return n.id === nid ? Object.assign({}, n, { text: text }) : n; })
                                 .filter(function (n) { return n.text; });
      } else if (text) {
        state.notes.push({
          id: "n" + Date.now() + Math.random().toString(36).slice(2, 5),
          b: +noteEditor.dataset.block, text: text, at: new Date().toISOString()
        });
      }
      save(); renderNotes();
      noteEditor.hidden = true;
    });
    noteEditor.querySelector(".rdr-del").addEventListener("click", function () {
      var nid = noteEditor.dataset.nid;
      state.notes = state.notes.filter(function (n) { return n.id !== nid; });
      save(); renderNotes();
      noteEditor.hidden = true;
    });

    window.addEventListener("resize", function () { clearTimeout(wireUI._r); wireUI._r = setTimeout(layoutInk, 150); });
    // The ink canvas covers a window onto the page, so it has to follow the scroll. One
    // frame at a time, and never mid-stroke.
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) inkFollowScroll();
    });
    // A plain time throttle rather than requestAnimationFrame: this has to keep working
    // in a backgrounded tab and anywhere rAF is throttled, and inkFollowScroll already
    // does nothing unless the window has drifted far enough to matter.
    var inkLast = 0;
    window.addEventListener("scroll", function () {
      hideBubble();
      var now = Date.now();
      if (now - inkLast < 80) return;
      inkLast = now;
      inkFollowScroll();
    }, { passive: true });

    markActiveSwatch();
  }

  function markActiveSwatch() {
    [].slice.call(document.querySelectorAll(".rdr-sw")).forEach(function (s) {
      s.classList.toggle("on", s.getAttribute("data-colour") === tool.colour);
    });
  }

  // ------------------------------------------------------------------ print

  function openAllForPrint() {
    window.__rdrReopen = [];
    [].slice.call(document.querySelectorAll("details:not([open])")).forEach(function (d) {
      window.__rdrReopen.push(d); d.open = true;
    });
  }
  function restoreAfterPrint() {
    (window.__rdrReopen || []).forEach(function (d) { d.open = false; });
    window.__rdrReopen = [];
  }
  window.addEventListener("beforeprint", openAllForPrint);
  window.addEventListener("afterprint", restoreAfterPrint);

  // ------------------------------------------------------------------ boot

  function start() {
    if (!guide) return;
    bindGuide();
    indexBlocks();
    if (!document.querySelector(".rdr-rail")) buildUI();
    else attachCanvas();
    applySettings();
    renderMarks();
    renderNotes();
    buildContents();
    armCites();
    markCitesClickable();
    setTimeout(layoutInk, 60);
    updateLock();
    syncPull();
    prefsPull();
  }

  function reloadState() {
    var s = load();
    Object.keys(DEFAULTS).forEach(function (k) {
      state[k] = (s[k] === undefined) ? defaultFor(k) : s[k];
    });
    applyPrefsTo(state);
    // strokes saved before the highlighter existed carry no kind, and the old pixel
    // eraser stored erase strokes that the vector model has no use for
    state.ink = (state.ink || []).filter(function (x) { return !x.erase; })
                                 .map(function (x) {
      if (!x.k) x.k = "pen";
      if (!x.id) x.id = "s" + Math.random().toString(36).slice(2, 8);
      return x;
    });
  }

  // The standalone document already holds the guide, so boot now. Inside the artifact the
  // guide is fetched and injected when the reader opens it, so wait to be called.
  if (guide) start();
  else window.ReaderBoot = function (opts) {
    opts = opts || {};
    guide = opts.guide || document.querySelector(".guide");
    if (!guide) return null;
    DOC = opts.doc || DOC;
    if (opts.syncRoot !== undefined) cfg.syncRoot = opts.syncRoot;
    if (opts.onTheme !== undefined) cfg.onTheme = opts.onTheme;
    if (opts.student !== undefined) student = (opts.student || "").trim().toLowerCase() || "_";
    reloadState();
    start();
    return window.Reader;
  };

  window.Reader = {
    setStudent: function (name) {
      student = (name || "").trim().toLowerCase() || "_";
      reloadState();
      if (!guide) return;          // nothing mounted yet; start() will apply it
      applySettings(); renderMarks(); renderNotes(); redrawInk(); updateLock();
      // A different student has a different record on the server, and this is the one
      // path into a mounted guide that did not go through start(), so without this the
      // new student read their local copy and never learned what the server held.
      syncPull();
      prefsPull();
    },
    remount: function (opts) {
      opts = opts || {};
      if (opts.guide) guide = opts.guide;
      if (opts.doc) DOC = opts.doc;
      if (opts.student !== undefined) student = (opts.student || "").trim().toLowerCase() || "_";
      reloadState();
      start();
    },
    // The rail, studio, bubble, note editor and source pane are appended to document.body,
    // while the hub swaps #app.innerHTML. So leaving a guide removed the guide and left its
    // chrome behind: the source pane covering the case list, the tool rail pinned over the
    // viva, the pen still armed, and twelve tool buttons in the tab order of every screen.
    unmount: function () {
      closeCite && closeCite();
      hideBubble();
      [".rdr-rail", ".rdr-studio", ".rdr-bubble", ".rdr-noteedit", ".rdr-srcpane"]
        .forEach(function (sel) {
          [].forEach.call(document.querySelectorAll(sel), function (n) {
            if (n.parentNode) n.parentNode.removeChild(n);
          });
        });
      bubble = null;
      noteEditor = null;
      citePane = null;
      guide = null;
      clearTimeout(syncTimer);
      clearTimeout(pullTimer);
    },

    state: function () { return state; }
  };
})();
