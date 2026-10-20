# Outstanding work

Everything found by the nine-person review panel and the clinical re-review of all 25 cases,
in the order it will be worked. Ticked items are fixed **and verified**, not just edited.

Editorial rule throughout: **the three books are the authority.** Where something differs from
the book, the book's answer leads and the difference is stated with its source named. A typo
the book contradicts elsewhere is reconciled to the book, and said to be a typo.

---

## 1. Ships a broken page

- [ ] **Viewport meta tag and doctype on the hub.** `app/case-files.html` has neither, so phones
      lay out at ~980px and shrink to ~38%. Every `max-width:640px` rule is dead. This is the
      originally reported bug.
- [ ] **Dark mode chrome is white-on-white.** `--paper`, `--accent-soft`, `--flag`, `--flag-soft`
      are defined on `.guide`, but the rail, studio, note editor, bubble and source pane are
      appended to `document.body`. Measured 1.24:1 contrast.
- [ ] **Canvas taller than 65,535px blanks the guide.** Chrome shows its placeholder over the
      text. Reproduced on cases 01 and 02 at 320px. Also exceeds iOS Safari's ~16.7M px area.
- [ ] **Rail is 416px wide on a 375px phone.** Settings button clipped off the left edge;
      swatches off the right. Vertical rail is taller than a landscape phone.
- [ ] **Note editor sits under the on-screen keyboard**, and its textarea is 14.7px so iOS
      zooms on focus.
- [ ] **Touch targets below 44px**, worst being the citation chips at ~16px, which are the main
      interaction in the guide.
- [ ] **Case 09 breaks the page width**: a `.who` with `display:flex` stretches the layout to
      549px on a 360px phone.
- [ ] **Hover states stick after a tap**; no `@media (hover:hover)` guard anywhere.
- [ ] **Citation chips `white-space:nowrap`** overflow the column at larger text sizes.
- [ ] **Conflict summary collapses into two squeezed columns** below ~480px.

## 2. Loses or corrupts data

- [ ] **Per-question history is write-only.** Nothing ever GETs `/api/answers`, so a second
      device shows empty and its first answer overwrites the server's counters downward
      (reproduced live, 5 -> 1). The progress page's claim that it follows you is false.
- [ ] **A slow pull applies to whichever guide is open when it returns.** Reproduced: case 1's
      note replaced case 2's, was persisted, and was pushed as case 2. `syncedAt`, `syncing`
      and `retryMs` are module globals with no per-document scoping.
- [ ] **Back from progress records the session again.** `screenSummary` writes on every render.
- [ ] **Client clock is trusted without bound.** A future timestamp locks a row permanently;
      the worker returns `ok:true` on a write it discarded, so the client marks it synced.
- [ ] **localStorage failure is silent.** `save()` swallows quota errors and `pushAnswers`
      reads back from storage, so nothing is stored and nothing is sent.
- [ ] **A corrupt storage blob wipes every student on the device**: `store()` returns `{}` and
      the next write replaces everything.
- [ ] **Answers have no retry timer and no `online` listener.**
- [ ] **Clear highlights/notes/ink** is one tap, no confirmation, no undo, and it syncs.
- [ ] **Highlights anchor to a block index with no content hash**, so editing a guide silently
      re-attaches a student's marks to different text.

## 3. Wrong or missing clinically

- [ ] **Acute limb ischaemia (09) still has no management.** No heparin, Fogarty, thrombolysis,
      analgesia, or reperfusion monitoring.
- [ ] **TUR syndrome (24)**: mechanism only; no recognition, no treatment. Irrigant given as
      1% in one place and 1.5% in another.
- [ ] **Anorectal abscess (25) absent entirely**, including B&L's two explicit prohibitions on
      probing and immediate fistulotomy in the acute stage.
- [ ] **Cutting seton described as sphincter-sparing (25).**
- [ ] **Circumcision "near-total immunity" (23)** overstated; the books overstate it too, so
      state what they say and flag it.
- [ ] **Gastric outlet obstruction (04)**: double-strength saline passed on without comment, no
      potassium limits, no thiamine before glucose, no aspiration plan.
- [ ] **Post-thyroidectomy hypocalcaemia (02)**: explained, never treated. No carbimazole
      agranulocytosis counselling.
- [ ] **~12 citations do not support the claim attached to them** (listed in the review
      reports): hepatic artery ligation vs embolisation, Makuuchi 1984, the torch method,
      secondary hydrocele "common", the varicocele cough impulse, and others.
- [ ] **Case 19**: orchidopexy operative age; "cryptorchidism" used in SRB's bilateral-only
      sense; the two books' figures presented as agreeing when they differ.
- [ ] **Case 17**: the "big tense hydrocele is primary" rule needs the filarial exception.

## 4. Structural

- [ ] **Only 1 of 25 cases has a scored viva bank.** 48 questions, all hernia. The other 24
      have untagged tap-to-reveal items and record nothing.
- [ ] **Non-bank cases can start a drill** and record hernia questions under their own case id.
- [ ] **Zero images across all 25 cases.** Finals have a spotter station.
- [ ] **67 chips written `pp.X, Y` silently lose the second page**, and the build still reports
      `unresolved refs: 0`.
- [ ] **A build against empty sources exits 0** and would be published.
- [ ] **`citations.json` is not part of the build** and nothing checks it is current.
- [ ] **Reading settings are stored per case**, so they must be set again in each of 25 guides.
- [ ] **The "layout is locked" message is false**: the attribute that would enforce it is never
      emitted, so text reflows out from under ink.
- [ ] **A failed `citations.json` fetch is cached forever**, killing every chip until reload.
- [ ] **Dark theme prints washed out**: `.guide[data-theme="dark"]` outranks the print block.
- [ ] **Docs still say B&L 26e** (README, BACKLOG offset +17, RESOURCES "not yet available").
- [ ] **No history API**: browser back leaves the site; no deep links.

## 5. Then

- [ ] Rebuild, verify, publish, confirm live.
- [ ] Start a fresh blank-slate review and repeat.
