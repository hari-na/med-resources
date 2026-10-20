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
