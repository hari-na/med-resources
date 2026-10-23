# Outstanding work

Kept honest: this is what is known to be wrong or missing, not a wish list. Items are
roughly in the order they would change a student's marks or their trust in the material.

## Content gaps, largest first

- **The scored drill exists for one case out of twenty-five.** The hub offers "VIVA Viva
  drill" on every case and 24 of them answer "No scored drill for this case yet." Every
  reviewer raised it, and the student put it first. Each case needs a bank in the shape of
  the hernia one, written from the books.
- **No images anywhere.** Zero img, svg or figure in 25 guides. For surgery that is the
  biggest single gap: the inguinal canal, Hesselbach's triangle, the fascial layers, the
  Rutherford table as a picture, Goodsall's rule. Line drawings would do.
- **Cases that are missing entirely**, named by the intern and the external examiner:
  carcinoma rectum and colon with stoma, diabetic foot and gangrene, abdominal lump with
  ascites and portal hypertension, acute appendicitis, stricture urethra, umbilical and
  incisional hernia, keloid, ganglion, haemangioma.
- **No presentation script.** Nothing says how to open a long case, in what order to
  speak, or how to close. Marks go on this before any sign is found.
- **Table viva has no home**: instruments, specimens, X-rays, operative steps.

## Known defects

- **No History API.** Every screen is the same URL, so Android Back leaves the site, a
  reload returns to the name screen, nothing can be bookmarked or shared, and the reading
  position is lost. Named a top-three fix by the student.
- **No offline.** No service worker and no manifest, so nothing works on bad hostel wifi
  and the site cannot be added to a home screen. The whole hub, all 25 bodies and the
  citations come to about 1 MB, so precaching is practical.
- **citations.json is 1.6 MB** and is fetched whole on the first citation tap, with no
  loading state: on a slow connection the tap looks like nothing happening. It should be
  split per case and show that it is loading.
- **"Layout is locked because there is ink on this page" is untrue.** No control is
  disabled, and changing the text size moves every stroke off the text it was drawn over.
  state.inkLayout is written and never read.
- **The highlighter colours are off-screen on every phone width.** The rail scrolls but
  all the affordances are hidden, and scrolling to the colours pushes the tools off.
- **The citation pane does not return focus on close** and does not trap focus; it is an
  aside with no dialog role.
- **The drill progress bar never reaches 100%** while the counter beside it reads 14/14.
- **Identity is a name with no password**, and anyone typing it on any device gets that
  student's notes and scores from the server.

## Clinical, still outstanding from the surgeon's review

- Case 25: B and L's fistulotomy limits are missing, the 30% of external sphincter ceiling
  and the exclusion of anterior fistulae in women.
- Case 17: B and L's structural classification of hydrocele is mis-rendered; its infantile
  hydrocele has been dropped and the B and L definition conflicts with SRB's, unflagged.
  B and L also contradicts itself between its numbered list and its figure caption.
- Case 09: SRB's compartment pressure "or above the mean arterial pressure" is passed on
  without comment; as a fasciotomy trigger it is meaningless.
- Case 19: B and L gives 3% of full-term infants in ch.86 and 4% in ch.17; only the 3% is
  quoted.
- Case 24: "1.5% glycine, hypo-osmolar" is in none of the three books and is not flagged.
- Case 25: the claim that B and L's fistula percentages come from a specialist practice is
  the author's inference stated as fact.
- A quotation-fidelity pass is needed: in at least three places a closing quote mark lands
  mid-word, so the guide's own paraphrase reads as the book's words.

## Tooling

- **S Das scans badly** and its quoted passages reach the reader with real OCR damage.
  The citation pane now says so, which is honest but not a fix. Re-OCR, or hand-correct
  the passages actually cited.
- **citations.json is 1.78 MB** and grew when the excerpt windows were widened to stop
  them cutting quotations in half. Splitting it per case is the fix, and would take the
  first-tap download from about 540 KB to 10-50 KB.

### Checks that exist, and what each proves

    python build_citations.py    every chip resolves to a page            0 unresolved
    python check_quotes.py       every quoted sentence is on that page    0 suspect, 0 cut
    python check_absence.py      every "the book does not say X" claim    22 of 22 hold
    npm test                     the reader and the hub                   13 tests

check_quotes scores similarity rather than answering yes or no, because the books are OCR
and a verbatim quotation often does not match character for character. Genuine quotations
score 0.79 to 1.00 and invented ones 0.35 to 0.42, so the thresholds sit in that gap. A
"damaged" verdict means recognisable through bad OCR, which is expected in S Das; a
"suspect" verdict means it does not look like that page at all and needs reading by a
person.

check_absence is a hand-written table, because no regex reliably pulls the claimed term
out of the prose around it. Add a row whenever a guide makes a new absence claim.
