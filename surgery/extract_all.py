"""Extract every page of all three books, not only the chapters we expected to need.

Why this exists
---------------
`extract_sources.py` pulls the chapters a case was being written from. That was fine while the
guides were being drafted, and wrong as soon as the material started making claims about what
a book does *not* say. Coverage was 61% of S Das, 46% of Bailey & Love and 78% of SRB, so
"Bailey & Love 28e never mentions this" could be false simply because the chapter had never
been extracted. That has already produced at least one wrong claim in the guides.

The editorial rule is that the book is the authority. A claim about the book can only be
checked against the whole book, so this extracts all of it.

Bailey & Love has a usable outline, so its chapters are read straight from the PDF. S Das and
SRB have sparse outlines, so whatever their chapter map does not already cover is written out
in page-range chunks. Nothing is skipped either way.

    python extract_all.py            # fill in everything missing
    python extract_all.py --force    # redo it

Output goes to sources/<book>/, alongside the existing chapter files and in the same format:
every page prefixed `[[ book p.N | pdf p.N ]]`, so build_citations.py and every checker read
these without changes.
"""

import importlib.util
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE / "sources"
CHUNK = 40          # pages per file for the ranges we have no chapter names for

_spec = importlib.util.spec_from_file_location("extract_sources", HERE / "extract_sources.py")
_ex = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_ex)
BOOKS, DOWNLOADS = _ex.BOOKS, _ex.DOWNLOADS


def slugify(title: str) -> str:
    t = re.sub(r"\s+", " ", title).strip().lower()
    t = re.sub(r"[^a-z0-9 ]+", "", t)
    return re.sub(r"\s+", "-", t)[:60]


def outline_chapters(doc):
    """Chapter-level outline entries as (number, slug, first_page), in page order."""
    found = []
    for _lvl, title, page in doc.get_toc():
        flat = re.sub(r"\s+", " ", title).strip()
        m = re.match(r"(\d+)\s+(.*)", flat)
        if m and page:
            found.append((int(m.group(1)), slugify(m.group(2)), page))
    found.sort(key=lambda x: x[2])
    return found


def write_pages(doc, path: pathlib.Path, first: int, last: int, offset: int) -> int:
    parts = []
    for i in range(first - 1, min(last, doc.page_count)):
        text = doc[i].get_text()
        if text.strip():
            parts.append(f"\n[[ book p.{i + 1 - offset} | pdf p.{i + 1} ]]\n{text}")
    body = "".join(parts)
    path.write_text(body, encoding="utf-8")
    return len(body)


def covered_pages(spec) -> set:
    pages = set()
    for a, b in spec["chapters"].values():
        pages |= set(range(a, b + 1))
    return pages


def main() -> int:
    import fitz

    force = "--force" in sys.argv
    grand = 0

    for book_id, spec in BOOKS.items():
        src = DOWNLOADS / spec["file"]
        if not src.exists():
            print(f"  !  {book_id}: pdf not found at {src}", file=sys.stderr)
            continue

        doc = fitz.open(src)
        outdir = OUT / book_id
        outdir.mkdir(parents=True, exist_ok=True)
        offset = spec["offset"]
        have = covered_pages(spec)
        written = 0

        chapters = outline_chapters(doc)
        if chapters:
            # a real outline: take every chapter, ending each where the next begins
            for idx, (num, slug, start) in enumerate(chapters):
                end = chapters[idx + 1][2] - 1 if idx + 1 < len(chapters) else doc.page_count
                if end < start:
                    continue
                if set(range(start, end + 1)) <= have:
                    continue                      # already in the hand-made map
                target = outdir / f"{num:02d}-{slug}.txt"
                if target.exists() and not force:
                    continue
                size = write_pages(doc, target, start, end, offset)
                written += 1
                print(f"  {book_id}/{target.name}  pdf {start}-{end}  {size // 1024} KB")
        else:
            # no usable outline: chunk whatever the chapter map leaves out
            missing = sorted(set(range(1, doc.page_count + 1)) - have)
            runs, run = [], []
            for p in missing:
                if run and p == run[-1] + 1:
                    run.append(p)
                else:
                    if run:
                        runs.append(run)
                    run = [p]
            if run:
                runs.append(run)
            for r in runs:
                for i in range(0, len(r), CHUNK):
                    block = r[i:i + CHUNK]
                    target = outdir / f"zz-pages-{block[0]:04d}-{block[-1]:04d}.txt"
                    if target.exists() and not force:
                        continue
                    size = write_pages(doc, target, block[0], block[-1], offset)
                    written += 1
                    print(f"  {book_id}/{target.name}  pdf {block[0]}-{block[-1]}  {size // 1024} KB")

        doc.close()
        grand += written
        print(f"  -- {book_id}: {written} new file(s)")

    print(f"\n{grand} file(s) written")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
