/**
 * Sync tests for the viva answers in app/case-files.html, against the built hub in jsdom.
 *
 * The answers had the same three faults as the reader's state, with worse consequences,
 * because a question's counter is a running history rather than a document:
 *
 *   1. A pull that failed was read as "this student has no history", so the first answer
 *      posted attempts:1 over the server's attempts:12 and destroyed it.
 *   2. The response handler read the global student key when the response landed rather
 *      than the one the request was for, so a pull that returned after the reader switched
 *      name merged one student's history into the next student's record.
 *   3. The worker reported the number of rows it was sent, not the number it applied, so a
 *      row discarded as stale was marked synced and never retried.
 *
 * Run with `npm test` in this directory.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";

const HTML = readFileSync(new URL("../dist/artifact/index.html", import.meta.url), "utf8");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// the hub's localStorage key, as app/case-files.html defines it
const LS = "surgery-case-files-v2";

const ok = (body) => new Response(JSON.stringify(body), {
  status: 200, headers: { "content-type": "application/json" },
});
const fail = (status) => new Response("upstream", { status });

async function boot({ handler, storage = {} } = {}) {
  const calls = [];
  const errors = [];
  const vc = new VirtualConsole();
  vc.on("jsdomError", (e) => errors.push(String(e.message || e)));

  const dom = new JSDOM(HTML, {
    url: "https://rx.harnar.in/",
    runScripts: "dangerously",
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(w) {
      w.fetch = async (url, init = {}) => {
        const entry = { url: new URL(url, "https://rx.harnar.in/").href,
                        method: init.method || "GET", body: init.body, t: Date.now() };
        calls.push(entry);
        const r = await handler(entry.url, init, entry);
        return r || new Response("{}", { status: 404 });
      };
      for (const [k, v] of Object.entries(storage)) w.localStorage.setItem(k, v);
      w.HTMLCanvasElement.prototype.getContext = () =>
        new Proxy({}, { get: () => () => ({}) });
      w.scrollTo = () => {};
      w.matchMedia = w.matchMedia ||
        (() => ({ matches: false, addListener() {}, addEventListener() {} }));
    },
  });

  const w = dom.window;
  await sleep(150);
  const api = {
    w, calls, errors,
    posts: (path) => calls.filter((c) => c.method === "POST" && c.url.includes(path)),
    gets: (path) => calls.filter((c) => c.method === "GET" && c.url.includes(path)),
    close: () => w.close(),
  };

  api.signIn = async (name) => {
    // after someone is signed in the welcome screen is gone, and Switch person is the
    // way back to it, which is what a shared phone actually does
    if (!w.document.getElementById("nm")) {
      const sw = w.document.getElementById("switch") || w.document.getElementById("swapWho");
      if (sw) { sw.dispatchEvent(new w.MouseEvent("click", { bubbles: true })); await sleep(80); }
    }
    const nm = w.document.getElementById("nm");
    const go = w.document.getElementById("go");
    if (!nm || !go) throw new Error("welcome screen did not render");
    nm.value = name;
    go.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
    await sleep(80);
  };
  return api;
}

/** The store as the hub writes it, with one question already answered many times. */
const storeWith = (key, name, attempts, at) => JSON.stringify({
  lastStudent: key,
  students: { [key]: { name, sessions: [],
    questions: { ["inguinal-hernia::h01"]: { t: "Anatomy", n: attempts, ok: attempts,
                                             last: 1, at, synced: true } } } },
});

test("the hub signs a student in and pulls their answers", async () => {
  let h;
  h = await boot({
    handler: async (url, init, e) => {
      if (e.method === "GET" && url.includes("/api/answers")) {
        return ok({ answers: [{ caseId: "inguinal-hernia", questionId: "h01", type: "Anatomy",
                                attempts: 12, correct: 10, lastOk: true,
                                at: "2026-09-01T10:00:00.000Z" }] });
      }
      return ok({ ok: true });
    },
  });
  await h.signIn("hitha");
  await sleep(400);
  assert.ok(h.gets("/api/answers").length >= 1, "signing in pulls the answers");
  const s = JSON.parse(h.w.localStorage.getItem(LS) || "{}");
  const q = ((s.students || {}).hitha || {}).questions || {};
  assert.equal(q["inguinal-hernia::h01"] && q["inguinal-hernia::h01"].n, 12,
    "the server's history is adopted");
  h.close();
});

test("a 503 on the answers pull never becomes a push", async () => {
  // The fault that destroyed history: a failed pull was read as "no history", and the
  // next answer posted attempts:1 over the server's attempts:12.
  let h;
  h = await boot({
    storage: { LS: storeWith("hitha", "Hitha", 3, "2026-09-01T10:00:00.000Z") },
    handler: async (url, init, e) => {
      if (e.method === "GET" && url.includes("/api/answers")) return fail(503);
      return ok({ ok: true, written: 1, stored: [] });
    },
  });
  await h.signIn("hitha");
  await sleep(3000);
  assert.equal(h.posts("/api/answers").length, 0,
    "nothing may be posted while the server's history is unknown");
  assert.ok(h.gets("/api/answers").length >= 2,
    "the pull should be retried, got " + h.gets("/api/answers").length);
  h.close();
});

test("a late pull is not written into the next student's record", async () => {
  // The fault: the response handler read the global student key when the response landed,
  // so A's history was merged into B after a switch.
  let release;
  const gate = new Promise((r) => { release = r; });
  let first = true;
  let h;
  h = await boot({
    handler: async (url, init, e) => {
      if (e.method === "GET" && url.includes("/api/answers")) {
        if (first) {
          first = false;
          await gate;                       // A's pull hangs until after the switch
          return ok({ answers: [{ caseId: "inguinal-hernia", questionId: "h01",
                                  type: "Anatomy", attempts: 99, correct: 99, lastOk: true,
                                  at: "2026-09-05T10:00:00.000Z" }] });
        }
        return ok({ answers: [] });
      }
      return ok({ ok: true, written: 0, stored: [] });
    },
  });
  await h.signIn("aisha");
  await h.signIn("hitha");                   // switch while aisha's pull is still in flight
  release();
  await sleep(600);
  const s = JSON.parse(h.w.localStorage.getItem(LS) || "{}");
  const hithaQs = ((s.students || {}).hitha || {}).questions || {};
  assert.ok(!hithaQs["inguinal-hernia::h01"],
    "aisha's 99 attempts must not appear in hitha's record");
  h.close();
});

test("a row the worker rejected as stale is not marked synced", async () => {
  // The fault: a bare ok was read as success, so a row the conflict clause discarded was
  // marked synced and never retried.
  let h;
  h = await boot({
    storage: { LS: storeWith("hitha", "Hitha", 2, "2026-09-01T10:00:00.000Z") },
    handler: async (url, init, e) => {
      if (e.method === "GET" && url.includes("/api/answers")) return ok({ answers: [] });
      // accepted the request, applied nothing
      return ok({ ok: true, sent: 1, written: 0, stored: [] });
    },
  });
  await h.signIn("hitha");
  await sleep(400);
  // put an unsynced row into whatever record sign-in produced, so a push picks it up
  const s0 = JSON.parse(h.w.localStorage.getItem(LS) || "{}");
  s0.students = s0.students || {};
  const rec0 = s0.students.hitha || (s0.students.hitha = { name: "Hitha", sessions: [] });
  rec0.questions = rec0.questions || {};
  rec0.questions["inguinal-hernia::h01"] =
    { t: "Anatomy", n: 2, ok: 2, last: 1, at: "2026-09-01T10:00:00.000Z", synced: false };
  h.w.localStorage.setItem(LS, JSON.stringify(s0));
  h.w.dispatchEvent(new h.w.Event("visibilitychange"));
  await sleep(2500);

  const s = JSON.parse(h.w.localStorage.getItem(LS) || "{}");
  const rec = (((s.students || {}).hitha || {}).questions || {})["inguinal-hernia::h01"];
  assert.ok(rec, "the row is still there");
  assert.notEqual(rec.synced, true,
    "a row the worker did not store must stay unsynced so it is retried");
  h.close();
});

test("an older worker that does not report stored is still handled", async () => {
  // The worker is deployed separately, so the client has to cope with one that predates
  // the stored list. Treating every row as rejected there would mean nothing was ever
  // marked synced and the client pulled in a loop against a healthy server.
  let h;
  h = await boot({
    handler: async (url, init, e) => {
      if (e.method === "GET" && url.includes("/api/answers")) return ok({ answers: [] });
      return ok({ ok: true, written: 1 });        // no stored list, as the old worker replies
    },
  });
  await h.signIn("hitha");
  await sleep(400);
  const s0 = JSON.parse(h.w.localStorage.getItem(LS) || "{}");
  s0.students = s0.students || {};
  const rec0 = s0.students.hitha || (s0.students.hitha = { name: "Hitha", sessions: [] });
  rec0.questions = rec0.questions || {};
  rec0.questions["inguinal-hernia::h01"] =
    { t: "Anatomy", n: 2, ok: 2, last: 1, at: "2026-09-01T10:00:00.000Z", synced: false };
  h.w.localStorage.setItem(LS, JSON.stringify(s0));
  h.w.dispatchEvent(new h.w.Event("visibilitychange"));
  await sleep(2500);

  const s = JSON.parse(h.w.localStorage.getItem(LS) || "{}");
  const rec = (((s.students || {}).hitha || {}).questions || {})["inguinal-hernia::h01"];
  assert.equal(rec && rec.synced, true,
    "with no stored list the client falls back to believing a plain ok");
  h.close();
});
