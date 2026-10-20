"""
Split the three textbooks into per-chapter text under sources/.

Every page is marked `[[ book p.N | pdf p.N ]]`, which is what build_citations.py reads to
resolve a citation chip to the passage behind it. The book page number is the one the
citations use; the pdf page is kept so a human can find it in the file.

The books themselves live outside the repository and are deliberately gitignored, so this
is run once on a machine that has them:

    python extract_sources.py                 # everything missing
    python extract_sources.py srb bailey      # only those books
    python extract_sources.py --list          # what is mapped and what exists
    python extract_sources.py --check bailey  # re-verify the page offset

The page ranges are pdf pages, read off each book's own outline.

Bailey & Love is the 28th edition as of 2026-10-20. The 26th edition it replaced numbered its
chapters completely differently (thyroid and parathyroid shared ch.51; they are now 55 and 56,
and hernia moved from 60 to 64), so no citation written against the old edition survives the
change. The superseded extraction is parked at sources/_bailey26-superseded/ for reference and
should be deleted once every case has been rebuilt.
"""

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent
OUT = ROOT / "sources"

DOWNLOADS = pathlib.Path(r"C:\Users\swaac\Downloads")

BOOKS = {
    "sdas": {
        "file": "S. Das - A Manual On Clinical Surgery (2018, S Das Publication) - libgen.li.pdf",
        "offset": 4,     # book page = pdf page - offset
        "chapters": {
            "01-case-taking": (5, 14), "02-special-symptoms": (15, 24),
            "03-lump-swelling": (25, 64), "04-ulcer": (65, 79),
            "05-sinus-fistula": (80, 83), "06-pvd-gangrene": (84, 103),
            "07-varicose-veins": (104, 112), "08-lymphatic": (113, 125),
            "24-oral-cavity": (345, 357), "25-salivary": (358, 367),
            "26-neck": (368, 377), "27-thyroid": (378, 399),
            "30-breast": (414, 437), "31-dysphagia": (438, 445),
            "33-acute-abdomen": (454, 485), "34-chronic-abdomen": (486, 521),
            "35-abdominal-lump": (522, 542), "36-rectal": (543, 558),
            "37-urinary": (559, 597), "38-hernia": (598, 614),
            "39-inguinoscrotal": (615, 620), "40-male-genitalia": (621, 642),
        },
    },
    # 28th edition, 1696 pages, 92 chapters. Offset verified on 287 of 300 sampled pages;
    # the misses are chapter-opening pages, which carry no printed folio in any of the three
    # books. Ranges end one page before the next chapter starts, per the pdf outline.
    "bailey": {
        "file": "_Bailey_&_Love's_Short_Practice_of_Surgery,_28th_edition.pdf",
        "offset": 21,
        "chapters": {
            "05-surgical-infection": (71, 86),
            # 28e has no lymphatic system chapter. Filarial lymphoedema and
            # elephantiasis live here, in "Tropical infections and infestations",
            # which is also where amoebiasis, ascariasis, hydatid and leprosy sit.
            "06-tropical-infections": (87, 114),
            "12-oncology-principles": (219, 238),
            "45-skin-subcutaneous": (660, 684),
            "52-pharynx-larynx-neck": (795, 833),
            "53-oral-cavity-cancer": (834, 851),
            "54-salivary": (852, 870),
            "55-thyroid": (871, 893),
            "56-parathyroid": (894, 908),
            "58-breast": (935, 964),
            "61-arterial": (1018, 1045),
            "62-venous": (1046, 1071),
            "63-abdomen-history": (1072, 1078),
            "64-abdominal-wall-hernia": (1079, 1103),
            "65-peritoneum-mesentery": (1104, 1126),
            "66-oesophagus": (1127, 1168),
            "67-stomach-duodenum": (1169, 1202),
            "69-liver": (1212, 1239),
            "70-spleen": (1240, 1252),
            "71-gallbladder-bile-ducts": (1253, 1280),
            "72-pancreas": (1281, 1308),
            "74-small-intestine": (1327, 1338),
            "75-inflammatory-bowel-disease": (1339, 1355),
            "76-appendix": (1356, 1374),
            "77-large-intestine": (1375, 1395),
            "78-intestinal-obstruction": (1396, 1413),
            "79-rectum": (1414, 1437),
            "80-anus-anal-canal": (1438, 1467),
            "81-urinary-symptoms": (1468, 1486),
            "82-kidney-ureter": (1487, 1506),
            "83-urinary-bladder": (1507, 1542),
            "84-prostate": (1543, 1558),
            "85-urethra-penis": (1559, 1578),
            "86-testis-scrotum": (1579, 1595),
        },
    },
    "srb": {
        "file": "SRB's Manual of Surgery [6th edition].pdf",
        "offset": 12,
        "chapters": {
            # chapter 1 is 337 pages and covers ulcers, swellings, cysts and vascular
            # disease, which between them feed most of the short cases
            "01-general-surgery": (13, 349),
            "03-oral-cavity": (368, 403),
            "04-salivary": (404, 425),
            "05-neck": (426, 454),
            "06-thyroid": (455, 500),
            "08-breast": (516, 568),
            "11-liver": (596, 634),
            "12-gallbladder": (635, 671),
            "14-pancreas": (684, 720),
            "16-mass-abdomen": (728, 739),
            "18-hernia": (751, 787),
            "20-stomach": (816, 863),
            "22-large-intestine": (888, 919),
            "23-intestinal-obstruction": (920, 939),
            "24-appendix": (940, 953),
            "26-urology": (996, 1087),
        },
    },
}


def extract(book_id, spec, only_missing=True):
    import fitz

    src = DOWNLOADS / spec["file"]
    if not src.exists():
        print(f"  !  {book_id}: source pdf not found at {src}", file=sys.stderr)
        return 0

    outdir = OUT / book_id
    outdir.mkdir(parents=True, exist_ok=True)
    doc = fitz.open(src)
    offset = spec["offset"]
    written = 0

    for slug, (a, b) in sorted(spec["chapters"].items()):
        target = outdir / (slug + ".txt")
        if only_missing and target.exists():
            continue
        parts = []
        for i in range(a - 1, min(b, doc.page_count)):
            text = doc[i].get_text()
            if text.strip():
                parts.append(f"\n[[ book p.{i + 1 - offset} | pdf p.{i + 1} ]]\n{text}")
        body = "".join(parts)
        target.write_text(body, encoding="utf-8")
        written += 1
        print(f"  {book_id}/{slug}.txt  pdf {a}-{b}  book {a-offset}-{b-offset}  "
              f"{len(body)//1024} KB")
    doc.close()
    return written


def check(book_id, spec, sample=300):
    """Re-derive the offset from printed folios and confirm it matches the configured one.

    Worth running after swapping in a new edition: a wrong offset silently sends every
    citation to the wrong page, and nothing downstream would notice.
    """
    import collections

    import fitz

    src = DOWNLOADS / spec["file"]
    if not src.exists():
        print(f"  !  {book_id}: source pdf not found at {src}", file=sys.stderr)
        return False
    doc = fitz.open(src)
    pages = sorted({p for a, b in spec["chapters"].values() for p in (a, (a + b) // 2, b)})
    pages = [p for p in pages if 1 <= p <= doc.page_count][:sample]

    votes = collections.Counter()
    for p in pages:
        lines = [l.strip() for l in doc[p - 1].get_text().splitlines() if l.strip()]
        for l in lines:
            if re.fullmatch(r"\d{2,4}", l) and 1 <= int(l) <= doc.page_count:
                votes[p - int(l)] += 1
    doc.close()

    if not votes:
        print(f"  ?  {book_id}: no printed folios found, cannot verify")
        return False
    best, hits = votes.most_common(1)[0]
    ok = best == spec["offset"]
    print(f"  {'ok  ' if ok else 'BAD '}{book_id}: configured offset {spec['offset']:+d}, "
          f"detected {best:+d} on {hits}/{len(pages)} sampled pages")
    if not ok:
        print(f"      fix BOOKS['{book_id}']['offset'] to {best} and re-extract with --force")
    return ok


def show():
    for book_id, spec in BOOKS.items():
        have = {p.stem for p in (OUT / book_id).glob("*.txt")} if (OUT / book_id).exists() else set()
        want = set(spec["chapters"])
        print(f"  {book_id}: {len(have & want)}/{len(want)} extracted")
        missing = sorted(want - have)
        if missing:
            print("    missing: " + ", ".join(missing))


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if "--list" in sys.argv:
        show()
        return 0
    only = args or list(BOOKS)
    if "--check" in sys.argv:
        return 0 if all(check(b, BOOKS[b]) for b in only if b in BOOKS) else 1
    total = 0
    for book_id in only:
        if book_id not in BOOKS:
            print(f"  !  unknown book {book_id}", file=sys.stderr)
            continue
        total += extract(book_id, BOOKS[book_id], only_missing="--force" not in sys.argv)
    print(f"\n{total} chapter file(s) written")
    show()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
