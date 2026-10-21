/**
 * Sync tests for assets/reader.js, against a real built guide page in jsdom.
 *
 * These exist because the reader's sync had three faults that each destroyed a
 * student's work, and none was visible to the worker's own 48 tests: the worker
 * behaved correctly in every one of them. The damage was done on the client.
 *
 *   1. A pull that failed was read as "the server has nothing", after which the first
 *      local edit was pushed over the real notes and marks.
 *   2. Nothing stopped a push from going out before the first pull had returned, so a
 *      slow server lost to a fast reader.
 *   3. A write the worker accepted but clamped came back with a different stamp, which
 *      the client read as "ours lost", so it pushed again about every second, forever.
 *
 * Run with `npm test` in this directory.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";

const HTML = readFileSync(new URL("../dist/01-inguinal-hernia.html", import.meta.url), "utf8");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Boot a guide page and sign a student in, which is what makes the reader sync at all.
 * `handler(url, init, entry)` returns a Response for each call, or undefined to 404.
 *
 * The page sets its own window.ReaderConfig, so there is no point injecting one: the
 * student is set afterwards through the same Reader.remount the hub itself uses, and
 * every fetch is intercepted whatever URL it goes to.
 */
async function boot({ handler, student = "hitha", clockOffsetMs = 0 } = {}) {
  const calls = [];
  const errors = [];
  const vc = new VirtualConsole();
  vc.on("jsdomError", (e) => errors.push(String(e.message || e)));

  const dom = new JSDOM(HTML, {
    url: "https://rx.harnar.in/01-inguinal-hernia.html",
    runScripts: "dangerously",
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(w) {
      if (clockOffsetMs) {
        const Real = w.Date;
        class D extends Real {
          constructor(...a) { if (a.length) super(...a); else super(Real.now() + clockOffsetMs); }
          static now() { return Real.now() + clockOffsetMs; }
        }
        w.Date = D;
      }
      w.fetch = async (url, init = {}) => {
        const entry = { url: new URL(url, "https://rx.harnar.in/").href,
                        method: init.method || "GET", body: init.body, t: Date.now() };
        calls.push(entry);
        const r = await handler(entry.url, init, entry);
        return r || new Response("{}", { status: 404 });
      };
      w.HTMLCanvasElement.prototype.getContext = () =>
        new Proxy({}, { get: () => () => ({}) });
      w.scrollTo = () => {};
      w.matchMedia = w.matchMedia ||
        (() => ({ matches: false, addListener() {}, addEventListener() {} }));
    },
  });

  const w = dom.window;
  await sleep(120);                       // let the inline reader.js evaluate and start()
  const api = { dom, w, calls, errors,
    puts: () => calls.filter((c) => c.method === "PUT"),
    gets: () => calls.filter((c) => c.method === "GET"),
    close: () => w.close() };

  // sign in through the same path the hub uses, which mounts and pulls
  w.Reader.remount({ student, doc: "case01" });
  await sleep(60);

  // a real edit: clicking a settings segment calls save(), which schedules a push
  api.edit = () => {
    const seg = w.document.querySelector(".rdr-seg");
    if (!seg) throw new Error("no settings segment found; the UI did not build");
    const btn = [].slice.call(seg.children).find((b) => !b.classList.contains("on"));
    btn.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  };
  return api;
}

// jsdom's window has no Response constructor, so these use Node's global one. Getting
// that wrong is not harmless: every fake response threw, every fetch failed, and three
// of these tests passed because nothing was ever pushed, which is what they assert.
const ok = (body) => new Response(JSON.stringify(body), {
  status: 200, headers: { "content-type": "application/json" },
});
const fail = (status) => new Response("upstream", { status });

test("signing in pulls once, and an edit is then pushed", async () => {
  let h;
  h = await boot({
    handler: async (url, init, e) =>
      e.method === "GET" ? ok({ found: false })
                         : ok({ ok: true, updatedAt: Date.now(), stored: true }),
  });
  assert.ok(h.gets().length >= 1, "a pull on sign-in, got " + h.gets().length);
  h.edit();
  await sleep(3200);
  assert.ok(h.puts().length >= 1, "the edit should reach the server");
  h.close();
});

test("a 503 on the pull never becomes a push", async () => {
  // The fault: !r.ok was turned into null and then read as "the worker has nothing",
  // so the next edit pushed this device's empty state over the server's real copy.
  let h;
  h = await boot({
    handler: async (url, init, e) =>
      e.method === "GET" ? fail(503)
                         : ok({ ok: true, updatedAt: Date.now(), stored: true }),
  });
  h.edit();
  await sleep(3200);
  assert.equal(h.puts().length, 0,
    "no PUT may be sent while the server's copy is unknown");
  assert.ok(h.gets().length >= 2,
    "the pull should be retried, got " + h.gets().length);
  h.close();
});

test("a slow pull is not overtaken by a push", async () => {
  // The fault: nothing gated the push on the pull, so an edit made while the GET was
  // still in flight was written to the server first, and the pull then had nothing left
  // to reconcile.
  let release;
  const gate = new Promise((r) => { release = r; });
  let h;
  h = await boot({
    handler: async (url, init, e) => {
      if (e.method !== "GET") return ok({ ok: true, updatedAt: Date.now(), stored: true });
      await gate;
      return ok({ found: true, updatedAt: Date.now(), state: { marks: [{ id: "m1" }] } });
    },
  });
  h.edit();
  await sleep(3200);
  assert.equal(h.puts().length, 0, "nothing may be pushed before the pull returns");
  release();
  await sleep(200);
  h.close();
});

test("a write the worker clamped does not start a push loop", async () => {
  // The fault: the worker clamps a stamp more than five minutes in the future, so a
  // device with a fast clock saw its own accepted write come back with a different
  // stamp, read that as "ours lost", stayed dirty and pushed again about every second.
  let h;
  h = await boot({
    clockOffsetMs: 10 * 60 * 1000,
    handler: async (url, init, e) => {
      if (e.method === "GET") return ok({ found: false });
      const sent = JSON.parse(e.body || "{}").updatedAt || 0;
      // accepted, but stored at a clamped (earlier) stamp
      return ok({ ok: true, updatedAt: sent - 5 * 60 * 1000, stored: true });
    },
  });
  h.edit();
  await sleep(9000);
  const n = h.puts().length;
  assert.ok(n >= 1, "the edit should still be pushed once");
  // Before the fix this retried about every 1.2s for as long as the tab stayed open,
  // which is roughly 72k writes a day against a 100k/day free tier. One settled write
  // is the expected number; the allowance is for a retry, not for a loop.
  assert.ok(n <= 2, "a clamped but accepted write must settle, saw " + n + " PUTs in 9s");
  h.close();
});

test("a write the worker rejected as stale is reconciled by pulling", async () => {
  let h;
  h = await boot({
    handler: async (url, init, e) => {
      if (e.method === "GET") return ok({ found: false });
      // the server kept something newer than ours
      return ok({ ok: true, updatedAt: Date.now() + 60000, stored: false });
    },
  });
  const before = h.gets().length;
  h.edit();
  await sleep(4000);
  assert.ok(h.gets().length > before,
    "a rejected write should trigger a fresh pull rather than another push");
  h.close();
});

test("reading settings follow the reader from one case to the next", async () => {
  // They used to live in the per-case record, so a student who had set Hyperlegible at XL
  // with loose spacing got the defaults back on the next case, twenty-five times over.
  let h;
  h = await boot({
    handler: async (url, init, e) =>
      e.method === "GET" ? ok({ found: false })
                         : ok({ ok: true, updatedAt: Date.now(), stored: true }),
  });

  const seg = h.w.document.querySelector('.rdr-seg[data-setting="face"]')
           || h.w.document.querySelector(".rdr-seg");
  const setting = seg.getAttribute("data-setting");
  const btn = [].slice.call(seg.children).find((b) => !b.classList.contains("on"));
  const chosen = btn.getAttribute("data-v");
  btn.dispatchEvent(new h.w.MouseEvent("click", { bubbles: true }));
  await sleep(50);
  assert.equal(h.w.Reader.state()[setting], chosen, "the setting took on this case");

  // open a different case as the same reader, which is what remount does from the hub
  h.w.Reader.remount({ student: "hitha", doc: "case02" });
  await sleep(100);
  assert.equal(h.w.Reader.state()[setting], chosen,
    "the same setting should still be in force on the next case");
  h.close();
});

test("opening a case does not drag its old settings back over the reader's", async () => {
  // Documents saved under the old per-case model still carry settings in their record.
  // Applying those on a pull would undo the reader's own choice every time they opened
  // an older case.
  let h;
  h = await boot({
    handler: async (url, init, e) => {
      if (e.method !== "GET") return ok({ ok: true, updatedAt: Date.now(), stored: true });
      if (url.includes("reader-prefs")) return ok({ found: false });
      return ok({ found: true, updatedAt: Date.now() + 60000,
                  state: { face: "mono", size: "1", marks: [{ id: "m1" }] } });
    },
  });
  const seg = h.w.document.querySelector('.rdr-seg[data-setting="face"]');
  const btn = [].slice.call(seg.children).find((b) => !b.classList.contains("on"));
  const chosen = btn.getAttribute("data-v");
  btn.dispatchEvent(new h.w.MouseEvent("click", { bubbles: true }));
  await sleep(50);

  h.w.Reader.remount({ student: "hitha", doc: "case03" });
  await sleep(400);
  assert.equal(h.w.Reader.state().face, chosen,
    "the document's stored face must not override the reader's own");
  assert.ok((h.w.Reader.state().marks || []).length >= 1,
    "but the document's marks are still adopted");
  h.close();
});

test("one student's highlights never reach another student", async () => {
  // DEFAULTS held literal arrays, so every student with no stored record was handed the
  // same array object. The first highlight pushed into it belonged to everyone after,
  // and their next edit uploaded it to the server under their own name. On a tablet
  // shared by two students that is the whole isolation the design rests on.
  let h;
  h = await boot({
    student: "alpha",
    handler: async (url, init, e) =>
      e.method === "GET" ? ok({ found: false })
                         : ok({ ok: true, updatedAt: Date.now(), stored: true }),
  });

  // alpha annotates. Reader.state() returns the one live state object, so hold on to the
  // array itself: comparing state objects before and after a remount compares a thing
  // with itself and proves nothing.
  const st = h.w.Reader.state();
  const alphaMarks = st.marks;
  st.marks.push({ id: "m-alpha", b: 0, s: 0, e: 5, kind: "hl", colour: "yellow" });
  st.notes.push({ id: "n-alpha", b: 0, text: "alpha's note" });
  h.edit();                      // a settings change calls save(), which persists the lot
  await sleep(80);
  assert.equal(h.w.Reader.state().marks.length, 1);

  // beta signs in on the same device, having never annotated anything
  h.w.Reader.remount({ student: "beta", doc: "case01" });
  await sleep(120);
  const beta = h.w.Reader.state();
  assert.equal(beta.marks.length, 0, "beta must not inherit alpha's highlights");
  assert.equal(beta.notes.length, 0, "beta must not inherit alpha's notes");
  assert.notEqual(beta.marks, alphaMarks, "and must not share the same array object");

  // and alpha's work is still alpha's
  h.w.Reader.remount({ student: "alpha", doc: "case01" });
  await sleep(120);
  assert.equal(h.w.Reader.state().marks.length, 1, "alpha keeps their own work");
  h.close();
});
