"""Check the scored viva banks in app/viva-banks.js: the shape, the pitch, and the pages.

The hub's first bank was written by hand and three faults got through, all of which this
looks for now:

  - an answer that opened with an edition note instead of the answer ("B&L 28e has dropped
    the 80% figure" in reply to "what proportion of repairs are inguinal?"). The first
    sentence has to answer the question;
  - a question about what a book says rather than about the patient, which is not a viva
    question;
  - a citation naming a page the claim is not on. build_citations.py and check_quotes.py
    cover the guides; nothing covered the banks.

The page check uses the same machinery the guides are checked with, so it inherits the same
caveat: the sources are OCR and S Das scans badly, so a low support score is a place to look
and not proof of an error. Read the page before changing anything:

    py booksearch.py --page bailey 1564

    py check_bank.py                 # summary and the suspect list
    py check_bank.py --case hydrocele
    py check_bank.py --all           # every question, with its support score
    py check_bank.py --strict        # exit 1 if anything is suspect
"""

from __future__ import annotations

import argparse
import collections
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import booksearch as bs  # noqa: E402

BANKS = HERE / "app" / "viva-banks.js"

# the citation chips name the books the way the guides do
BOOK_DIR = {"das": "sdas", "b&l": "bailey", "bl": "bailey", "srb": "srb"}

# the progress screen groups by these, so a typo would open a category of one
TYPES = {"Anatomy", "Examination", "History", "Classification", "Investigation",
         "Management", "Treatment", "Complications", "Pathology", "Physiology",
         "Diagnosis", "Procedure"}

MIN_PER_CASE, MAX_PER_CASE = 25, 40

# an answer may carry an edition note, but not as its first sentence
NOTE_OPENER = re.compile(
    r"^\s*(edition note|b\s*&\s*l\s*2\d\s*e\s+(has|no longer)|"
    r"the (28th|26th) edition|the books disagree|the three books)", re.I)

# a question about the book, not about the patient
BOOKISH = re.compile(
    r"(according to (s das|b\s*&\s*l|bailey|srb)|what does (s das|b\s*&\s*l|bailey|srb|the book)"
    r"|which (book|edition)|does (b\s*&\s*l|bailey|srb|s das) (say|print|use|give)"
    r"|how does (b\s*&\s*l|bailey|srb|s das) define|in (b\s*&\s*l|bailey|srb) ?2\d ?e\b)", re.I)

STOP = set("""about above after again against all also although always among and another any are
around because been before being below between both but came come could does doing done down
during each either else even ever every first from further give given gives giving had has have
having hence here high how however into itself just keep kept large later less like made make
makes many may more most much must near need needs never next none nor not now off often once
one only onto other others ours out over own part patient patients than that the their them
then there these they this those three through thus too two under until upon used uses using
very was way well were what when where which while who whom whose why will with within without
would your""".split())

WORD = re.compile(r"[a-z][a-z0-9'’\-]{4,}")

ENTRY = re.compile(r"\{\s*id:\s*\"(?:[^\"\\]|\\.)*\".*?\}(?=\s*,\s*\{|\s*\])", re.S)
FIELD = re.compile(r"(\w+)\s*:\s*(\"(?:[^\"\\]|\\.)*\"|\d+)")
CASE_KEY = re.compile(r"^\s{2}\"([a-z0-9\-]+)\":\s*\[", re.M)


def unquote(v: str) -> str:
    if v.startswith("\""):
        return re.sub(r"\\(.)", r"\1", v[1:-1])
    return v


def load_banks(path: pathlib.Path = BANKS) -> dict:
    """case id -> list of questions, parsed out of the JS without evaluating it."""
    text = path.read_text(encoding="utf-8")
    keys = list(CASE_KEY.finditer(text))
    banks = {}
    for i, m in enumerate(keys):
        end = keys[i + 1].start() if i + 1 < len(keys) else len(text)
        chunk = text[m.end():end]
        if "]" in chunk:
            # keep a closing bracket, because the last entry's match needs something after it
            chunk = chunk[:chunk.rfind("]")] + "\n]"
        qs = []
        for e in ENTRY.finditer(chunk):
            d = {k: unquote(v) for k, v in FIELD.findall(e.group(0))}
            if "lv" in d:
                d["lv"] = int(d["lv"])
            qs.append(d)
        banks[m.group(1)] = qs
    return banks


REF_SEG = re.compile(
    r"(das|b\s*&\s*l|bl|srb)\s*(\d+)\s*((?:[\s,;]*(?:ch\.\s*\d+|p\.\s*[\d–\-]+))+)", re.I)
PAGES = re.compile(r"p\.\s*(\d+)(?:\s*[–\-]\s*(\d+))?")


def parse_ref(ref: str):
    """"Das 38 p.594 / B&L 64 p.1060-1061" -> [(book, chapter, page), ...]"""
    out = []
    for m in REF_SEG.finditer(ref):
        book = BOOK_DIR[re.sub(r"\s+", "", m.group(1)).lower()]
        chapter = int(m.group(2))
        for a, b in PAGES.findall(m.group(3)):
            for pg in range(int(a), int(b or a) + 1):
                out.append((book, chapter, pg))
    return out


def chapter_pages(pages):
    """(book, chapter) -> {page: Page}, and (book, page) -> Page whatever the chapter."""
    bych, bypg = collections.defaultdict(dict), {}
    for p in pages:
        m = re.match(r"(\d+)", p.chapter)
        if m:
            bych[(p.book, int(m.group(1)))][p.page] = p
        bypg[(p.book, p.page)] = p
    return bych, bypg


def terms(q: dict) -> list:
    """The distinctive words of a question and its answer.

    The book labels and the edition vocabulary are dropped, along with anything short or
    common. What is left is the clinical substance, which is what ought to be on the page.
    """
    text = (q.get("q", "") + " " + q.get("a", "")).lower()
    text = re.sub(r"\b(s das|b ?& ?l|bailey|love|srb|edition|28e|26e|13e|18e)\b", " ", text)
    seen, out = set(), []
    for w in WORD.findall(text):
        w = w.strip("'’-")
        if len(w) < 5 or w in STOP or w in seen:
            continue
        seen.add(w)
        out.append(w)
    return out


def support(q: dict, refs, bych, bypg):
    """What share of a question's distinctive words are on the pages it cites.

    Scored over the cited pages and their immediate neighbours, because a paragraph runs
    across a page break and a citation names where it starts.
    """
    want = terms(q)
    if not want:
        return None, []
    blob = []
    for book, chapter, pg in refs:
        for n in (pg - 1, pg, pg + 1):
            p = bych.get((book, chapter), {}).get(n) or bypg.get((book, n))
            if p:
                blob.append(p.norm)
                blob.append(p.tight)
    if not blob:
        return None, want
    norm = " ".join(blob)
    missing = []
    for w in want:
        t = bs.tighten(w)
        if w in norm or (t and t in norm):
            continue
        # a plural, or an -ing form of a word the page does carry, counts as present
        stem = w.rstrip("s")[:max(5, len(w) - 3)]
        if stem and bs.tighten(stem) in norm:
            continue
        missing.append(w)
    return (len(want) - len(missing)) / len(want), missing


def main(argv=None) -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--case", help="one case id, or part of one")
    ap.add_argument("--all", action="store_true", help="print every question's score")
    ap.add_argument("--strict", action="store_true", help="exit 1 if anything is suspect")
    ap.add_argument("--floor", type=float, default=0.55,
                    help="support below this is reported (default 0.55)")
    a = ap.parse_args(argv)

    banks = load_banks()
    if not banks:
        print("no banks found in app/viva-banks.js", file=sys.stderr)
        return 2

    pages = bs.load()
    bych, bypg = chapter_pages(pages)

    problems = []          # hard faults: the shape, or a page that does not exist
    notes = []             # worth saying, not wrong
    suspect = []           # soft: the claim may not be on the page it names
    ids = {}
    scored = []

    for cid, qs in sorted(banks.items()):
        if a.case and a.case not in cid:
            continue
        # a count outside the target is worth saying, but it is not a fault: case 01's bank
        # was written before the target existed and is longer than it
        if not (MIN_PER_CASE <= len(qs) <= MAX_PER_CASE):
            notes.append(f"{cid}: {len(qs)} questions, the target is "
                         f"{MIN_PER_CASE}-{MAX_PER_CASE}")
        for lv in (1, 2, 3):
            if not [q for q in qs if q.get("lv") == lv]:
                problems.append(f"{cid}: no level {lv} questions")
        for q in qs:
            tag = f"{cid}/{q.get('id', '?')}"
            for f in ("id", "lv", "type", "q", "a", "ref"):
                if not q.get(f):
                    problems.append(f"{tag}: no {f}")
            if q.get("id") in ids:
                problems.append(f"{tag}: id already used by {ids[q['id']]}")
            ids[q.get("id")] = tag
            if q.get("lv") not in (1, 2, 3):
                problems.append(f"{tag}: lv {q.get('lv')}")
            if q.get("type") not in TYPES:
                problems.append(f"{tag}: type {q.get('type')!r} is not a known type")
            if BOOKISH.search(q.get("q", "")):
                problems.append(f"{tag}: the question asks what a book says\n      {q.get('q')}")
            if NOTE_OPENER.match(q.get("a", "")):
                problems.append(f"{tag}: the answer opens with an edition note, not the answer"
                                f"\n      {q.get('a', '')[:90]}")
            refs = parse_ref(q.get("ref", ""))
            if not refs:
                problems.append(f"{tag}: ref {q.get('ref')!r} does not parse")
                continue
            for book, chapter, pg in refs:
                known = bych.get((book, chapter))
                if known is None:
                    problems.append(f"{tag}: {book} ch.{chapter} has no source file  [{q['ref']}]")
                elif pg not in known:
                    lo, hi = min(known), max(known)
                    problems.append(f"{tag}: {book} ch.{chapter} p.{pg} outside {lo}-{hi}"
                                    f"  [{q['ref']}]")
            score, missing = support(q, refs, bych, bypg)
            if score is None:
                continue
            scored.append((score, tag, q, missing))
            if score < a.floor:
                suspect.append((score, tag, q, missing))

    if a.all:
        for score, tag, q, missing in sorted(scored, key=lambda r: r[0]):
            print(f"  {score:4.0%}  {tag:30s} {q['ref']}")
            print(f"        {q['q'][:96]}")
            if missing:
                print(f"        not on the page: {', '.join(missing[:12])}")

    if scored:
        cases = len({t.split("/")[0] for _, t, _, _ in scored})
        med = sorted(s for s, _, _, _ in scored)[len(scored) // 2]
        print(f"\n{len(scored)} questions in {cases} case(s); median support {med:.0%}")
    else:
        print("\nnothing scored")

    for n in notes:
        print(f"  - {n}")

    if problems:
        print(f"\n{len(problems)} fault(s):")
        for p in problems:
            print(f"  ! {p}")
    else:
        print("no shape or page faults")

    if suspect:
        print(f"\n{len(suspect)} citation(s) worth reading the page for "
              f"(support < {a.floor:.0%}):")
        for score, tag, q, missing in sorted(suspect, key=lambda r: r[0]):
            print(f"  {score:4.0%}  {tag}  {q['ref']}")
            print(f"        {q['q'][:96]}")
            print(f"        not on the page: {', '.join(missing[:12])}")

    return 1 if (problems or (a.strict and suspect)) else 0


if __name__ == "__main__":
    raise SystemExit(main())
