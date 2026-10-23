"""Verify every claim the guides make that a book does NOT say something.

The guides tell a student things like "the word agranulocytosis does not appear anywhere in
Bailey & Love 28e, so quote SRB if asked for a source", and "Maydl's is absent from the
whole of the 28th edition, so supply it yourself". Those are load-bearing: a student acts
on them in front of an examiner. They are also the one kind of claim that nothing else
here checks, because there is no citation to resolve and no quotation to match.

They were also made with a broken tool. booksearch.py used to lose its ligature repairs
silently under Python's isolated mode, so any absence check on a word containing ff, fi or
fl searched damaged text and reported a confident, wrong "absent". That is fixed, and this
re-checks the claims that were made while it was broken.

One claim was wrong: case 07 said "hepatic artery embolisation appears in none of the
three books", and SRB p.869 reads "hepatic artery ligation or embolisation is tried".

The table is written by hand, because the claims are prose and no regex reliably extracts
the term being claimed absent from the sentence around it. Add a row whenever a guide
makes a new absence claim; the comment is where the claim lives, so a failure is traceable
back to the sentence that has to change.

    python check_absence.py           # check every claim
    python check_absence.py --strict  # exit 1 if any claim is wrong
"""

from __future__ import annotations

import argparse
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import booksearch as bs  # noqa: E402

# term, book, chapter prefix or None, expectation, where the guide says it
#   "absent"  - the guide tells the student this is not there
#   "present" - the guide tells the student it IS there, against the obvious assumption
CLAIMS = [
    ("Maydl",            "bailey", None, "absent",
     "01 hernia: absent from the whole of the 28th edition, so supply it yourself"),
    ("Garengeot",        "bailey", None, "absent",
     "01 hernia: de Garengeot's, same claim"),
    ("Amyand",           "bailey", None, "present",
     "01 hernia: 'Amyand's and Littre's are not absent', named in the paediatric chapter"),
    ("Littre",           "bailey", None, "present",
     "01 hernia: same sentence"),
    ("stridor",          "bailey", "55", "absent",
     "02 thyroid: ch.55 never uses the word"),
    ("exophthalmos",     "bailey", "55", "absent",
     "02 thyroid: ch.55 does not use the word in its text"),
    ("Kocher",           "bailey", "55", "absent",
     "02 thyroid: the name does not appear in ch.55"),
    ("Crile",            "bailey", "55", "absent",
     "02 thyroid: the name does not appear in ch.55"),
    ("agranulocytosis",  "bailey", None, "absent",
     "02 thyroid: nowhere in B&L 28e, quote SRB instead"),
    ("Madden",           "srb",    None, "absent",
     "03 breast: nowhere in SRB's breast chapter"),
    ("visible peristalsis", "bailey", "67", "absent",
     "04 GOO: the sign does not appear in B&L ch.67"),
    ("Reynolds",         "bailey", "71", "absent",
     "05 jaundice: the pentad is nowhere in the chapter, attribute it to SRB"),
    ("Perthes",          "bailey", "62", "absent",
     "08 varicose veins: the name does not appear in ch.62"),
    ("Fontaine",         "bailey", None, "absent",
     "09 PVD: appears nowhere in B&L 28e"),
    ("critical limb ischaemia", "bailey", "61", "absent",
     "09 PVD: the phrase is not in the arterial chapter, which uses CLTI"),
    ("Sharma",           "bailey", "86", "absent",
     "17 hydrocele: Sharma and Jhawer's, nowhere in B&L's testis chapter"),
    ("dysphagia lusoria", "bailey", "66", "absent",
     "20 dysphagia: the word does not appear in B&L ch.66"),
    ("Negus",            "bailey", None, "absent",
     "20 dysphagia: the Negus hydrostatic dilator is not in B&L 28e"),
    ("PLAP",             "bailey", "86", "absent",
     "21 testis: only SRB gives it; not in B&L's chapter"),
    ("Daseler",          "bailey", None, "absent",
     "23 penis: Daseler's quadrangle appears nowhere in B&L 28e"),
    ("Jackson",          "bailey", "85", "absent",
     "23 penis: the name does not appear in B&L ch.85"),
    ("acid phosphatase", "bailey", "84", "absent",
     "24 BPH: the words appear nowhere in B&L 28e ch.84"),
]


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--strict", action="store_true", help="exit 1 if any claim is wrong")
    a = ap.parse_args(argv)

    if not bs.LIGATURE_REPAIRS:
        print("  refusing to check: the ligature table did not load, so every result here "
              "would be unreliable. Run derive_ligatures.py.", file=sys.stderr)
        return 2
    print(f"  ligature table: {len(bs.LIGATURE_REPAIRS)} entries")

    pages = bs.load(None)
    wrong = []
    for term, book, chapter, expect, note in CLAIMS:
        hits = bs.search([p for p in pages if p.book == book], term, limit=40)
        if chapter:
            hits = [(p, at) for p, at in hits if p.chapter.startswith(chapter)]
        found = bool(hits)
        ok = found == (expect == "present")
        where = sorted({f"{p.chapter.split('-')[0]} p.{p.page}" for p, _ in hits})[:6]
        mark = "ok   " if ok else "WRONG"
        scope = f"ch.{chapter}" if chapter else "whole book"
        print(f"  [{mark}] {term:26} {book:7} {scope:11} claimed {expect}")
        if not ok:
            wrong.append((term, book, note, where))
        if where and (not ok or expect == "present"):
            print(f"            found in: {', '.join(where)}")

    print(f"\n  {len(CLAIMS) - len(wrong)} of {len(CLAIMS)} claims hold")
    for term, book, note, where in wrong:
        print(f"    {term} ({book}) — {note}")
        print(f"      actually at: {', '.join(where) if where else 'nowhere'}")
    return 1 if (a.strict and wrong) else 0


if __name__ == "__main__":
    raise SystemExit(main())
