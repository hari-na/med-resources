#!/usr/bin/env python3
"""Build dist/citations.json: the textbook text behind every <cite> chip in the guides.

Reads the study guides (default: reference/*.html), collects every citation chip,
resolves each printed page reference to the OCR'd chapter text under sources/, and
writes a deduplicated JSON blob the website can use to show readers the source page.

Usage:
    python build_citations.py                      # all of reference/*.html
    python build_citations.py reference/01-*.html  # explicit guide paths
    python build_citations.py --out dist/citations.json

Standard library only.
"""

from __future__ import annotations

import argparse
import collections
import difflib
import glob
import html
import json
import os
import re
import sys
import unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))

# ---------------------------------------------------------------------------
# Book registry
# ---------------------------------------------------------------------------
# Key = the chip's CSS class after "src" (<cite class="src das">), which is also
# the prefix of every page/citation key, so the browser can derive keys from the
# chip alone.  `dir` is the per-book folder of plain-text chapters under sources/.
BOOKS = {
    "das": {
        "title": "S Das, A Manual on Clinical Surgery",
        "edition": "13th edition (2018)",
        "dir": "sdas",
    },
    "bl": {
        "title": "Bailey & Love, Short Practice of Surgery",
        "edition": "28th edition",
        "dir": "bailey",
    },
    "srb": {
        "title": "SRB's Manual of Surgery",
        "edition": "6th edition",
        "dir": "srb",
    },
}

CONTEXT_CHARS = 400  # size of the `before` / `after` excerpts

# ---------------------------------------------------------------------------
# Citation chip parsing
# ---------------------------------------------------------------------------

CITE_RE = re.compile(r'<cite\s+class="src\s+([a-z0-9_-]+)"\s*>(.*?)</cite>', re.I | re.S)

# A page reference: "p.594", "p.740-741" (any dash), optionally in a comma list.
PAGE_REF_RE = re.compile(r"p\.\s*(\d+)\s*(?:[-‐-―]\s*(\d+))?")

# "ch.1" inside a trailing segment, e.g. "Das 38 p.602; ch.1 p.8" -> second chapter.
CHAPTER_OVERRIDE_RE = re.compile(r"ch\.\s*(\d+)")

# The leading chapter number: the digits before the first middot separator.
LEAD_CHAPTER_RE = re.compile(r"^[^·]*?(\d+)\s*·")

DIGITS_RE = re.compile(r"\d+")


def chip_text(raw: str) -> str:
    """Normalise the inner HTML of a <cite> to plain text.

    Entities (&middot; &ndash; &amp;) are decoded first because every downstream
    rule - the key munging and the page regex - works on the rendered characters,
    which is also exactly what the browser will see in the DOM.
    """
    text = html.unescape(re.sub(r"<[^>]+>", "", raw))
    return re.sub(r"\s+", " ", text).strip()


def citation_key(book: str, text: str) -> str:
    """Key for a chip, derivable in the browser from the chip alone.

    Rule: lowercase book id (the CSS class), then every number appearing in the
    chip text in order, joined by hyphens.  In JS this is literally
        cls + '-' + el.textContent.match(/\\d+/g).join('-')
    The first number is the chapter (book names carry no digits), the rest are the
    printed pages exactly as written - so a range stays as its two endpoints
    ("p.740-741" -> srb-18-740-741) even though it expands to several pages below.
    """
    return "-".join([book] + DIGITS_RE.findall(text))


def parse_chip(book: str, text: str):
    """Return [(chapter, page_number), ...] for one chip, in reading order.

    Handles the three page forms (single, comma list, dash range) plus the rare
    multi-chapter chip "Das 38 p.602; ch.1 p.8" - segments are split on ';' and a
    segment carrying "ch.N" switches chapter for the pages that follow it.
    """
    refs: list[tuple[str, int]] = []
    chapters: list[str] = []
    segments = text.split(";")

    lead = LEAD_CHAPTER_RE.search(segments[0])
    chapter = lead.group(1) if lead else None

    for i, segment in enumerate(segments):
        override = CHAPTER_OVERRIDE_RE.search(segment)
        if override:
            chapter = override.group(1)
        elif i and (m := LEAD_CHAPTER_RE.search(segment)):
            chapter = m.group(1)
        if chapter is None:
            continue
        if chapter not in chapters:
            chapters.append(chapter)
        for start, end in PAGE_REF_RE.findall(segment):
            first = int(start)
            last = int(end) if end else first
            if last < first:  # nonsense range; treat as the single page given
                last = first
            for page in range(first, last + 1):
                refs.append((chapter, page))

    # Dedupe while preserving order (a chip may repeat a page).
    seen = set()
    ordered = [r for r in refs if not (r in seen or seen.add(r))]
    return ordered, chapters


# ---------------------------------------------------------------------------
# Source text: page splitting
# ---------------------------------------------------------------------------

# Page markers look like:  [[ book p.597 | pdf p.601 ]]
# The printed ("book") number is what citations refer to; the pdf number is the
# physical sheet in the scan and is deliberately ignored.  Some scans could not
# establish a printed number and are marked "book p.?" - those pages keep their
# text (they still serve as reading context for a neighbour) but get no key.
PAGE_MARKER_RE = re.compile(
    r"^\[\[\s*book\s+p\.\s*(\d+|\?)\s*\|\s*pdf\s+p\.\s*(\d+|\?)\s*\]\]\s*$",
    re.M,
)


def split_pages(raw: str):
    """Split a chapter file into [(book_page_or_None, raw_text), ...] in file order."""
    pages = []
    matches = list(PAGE_MARKER_RE.finditer(raw))
    for i, m in enumerate(matches):
        end = matches[i + 1].start() if i + 1 < len(matches) else len(raw)
        number = None if m.group(1) == "?" else int(m.group(1))
        pages.append((number, raw[m.end():end]))
    return pages


# ---------------------------------------------------------------------------
# OCR cleanup
# ---------------------------------------------------------------------------

LIGATURES = {
    "ﬀ": "ff", "ﬁ": "fi", "ﬂ": "fl", "ﬃ": "ffi",
    "ﬄ": "ffl", "ﬅ": "st", "ﬆ": "st",
}

# Short words that may legitimately sit alone on a wrapped line; anything else
# three characters or shorter is almost always scan debris (stray "I", ":::s",
# rotated figure labels, bullet glyphs) rather than text.
SHORT_WORD_WHITELIST = {
    "a", "an", "as", "at", "be", "by", "do", "go", "he", "if", "in", "is",
    "it", "no", "of", "on", "or", "so", "to", "up", "us", "we", "the", "and",
    "but", "for", "not", "was", "all", "its", "may", "can", "due", "one", "two",
    "six", "ten", "sac", "cm", "mm",
}


def normalise_head(line: str) -> str:
    """Signature for running-head comparison: letters only, uppercased.

    OCR mangles running heads differently on every page ("EXAMINATION OF A CASE
    OF HERNIA" vs "EXAMINATION or A CASE OF HERNlA"), so heads are matched
    fuzzily against this signature rather than by equality.
    """
    return re.sub(r"[^A-Za-z]", "", line).upper()


def head_signature_counts(pages) -> collections.Counter:
    """Count candidate running-head signatures over the page edges of `pages`.

    Only the top and bottom three lines are considered: that is where furniture
    lives, so body text cannot inflate the counts.  Adjacent line pairs are also
    joined before counting, because the OCR sometimes breaks one head across two
    lines ("A MANUAL O" / "CLINICAL SURGERY").
    """
    counts = collections.Counter()
    for _, raw in pages:
        lines = [l.strip() for l in raw.splitlines() if l.strip()]
        edge = lines[:3] + lines[-3:]
        candidates = set()
        for line in edge:
            if len(line) <= 60:
                candidates.add(normalise_head(line))
        for a, b in zip(edge, edge[1:]):
            if len(a) + len(b) <= 60:
                candidates.add(normalise_head(a + b))
        for sig in candidates:
            if len(sig) >= 6:  # ignore near-empty signatures
                counts[sig] += 1
    return counts


def collect_running_heads(pages, min_pages=3):
    """Running heads of one chapter: signatures seen at the edge of >= 3 pages.

    Nothing is hardcoded per book - a genuine section heading occurs once or
    twice in a chapter, a running head on most of its pages.  These are only ever
    stripped from the page edges, in case a body line resembles one.
    """
    return {sig for sig, n in head_signature_counts(pages).items() if n >= min_pages}


def is_running_head(line: str, heads: set) -> bool:
    sig = normalise_head(line)
    if len(sig) < 6:
        return False
    if sig in heads:
        return True
    # Fuzzy match catches OCR variants of the same head.
    return any(difflib.SequenceMatcher(None, sig, h).ratio() >= 0.8 for h in heads)


def strip_furniture(raw: str, page: int | None, heads: set, book_heads: set = frozenset()) -> list[str]:
    """Drop page furniture from one page's lines.

    `heads` are chapter-level running heads, removed only from the page edges.
    `book_heads` are strings repeated at page edges throughout the whole book
    (the book/part title) - a scrambled scan sometimes drops that title into the
    middle of a figure page, so those are removed wherever they appear.
    """
    lines = [l.rstrip() for l in raw.splitlines()]
    lines = [l for l in lines if l.strip()]
    if book_heads:
        lines = [l for l in lines if not (len(l) <= 60 and is_running_head(l.strip(), book_heads))]
    if not lines:
        return []

    def furniture(line: str) -> bool:
        s = line.strip()
        # A bare number alone on a line near the edge is the folio.  Accept any
        # 1-4 digit number, not just the page's own: OCR often misreads a digit.
        if re.fullmatch(r"\d{1,4}", s):
            return True
        if page is not None and re.fullmatch(rf"[^\w]*{page}[^\w]*", s):
            return True
        return is_running_head(s, heads)

    # Only the first/last three lines are examined; furniture never sits mid-page,
    # and a body line that happens to resemble the running head must be kept.
    head = 0
    for line in lines[:3]:
        if furniture(line):
            head += 1
        else:
            break
    tail = 0
    for line in reversed(lines[-3:]):
        if furniture(line):
            tail += 1
        else:
            break
    return lines[head:len(lines) - tail] if tail else lines[head:]


def clean_text(raw: str, page: int | None, heads: set, book_heads: set = frozenset()) -> str:
    """Turn one page of OCR output into a single readable paragraph of text."""
    lines = strip_furniture(raw, page, heads, book_heads)

    kept = []
    for line in lines:
        s = line.strip()
        if not re.search(r"[A-Za-z0-9]", s):
            continue  # bullet glyphs, rule characters, stray punctuation
        if len(s) <= 3 and s.lower().strip(".,:;)(") not in SHORT_WORD_WHITELIST:
            continue  # scan debris: single letters, rotated column labels
        kept.append(s)

    out = []
    for i, line in enumerate(kept):
        nxt = kept[i + 1] if i + 1 < len(kept) else ""
        # Rejoin a word hyphenated across the line break ("paraum-" + "bilical").
        # Only when a letter precedes the hyphen and the continuation starts
        # lowercase - otherwise the dash is real punctuation ("HISTORY.-",
        # "the scrotum -") or joins a proper noun, and must survive.
        if re.search(r"[A-Za-z]-$", line) and re.match(r"[a-z]", nxt):
            out.append(line[:-1])
            continue
        out.append(line + " ")

    text = "".join(out)
    text = unicodedata.normalize("NFKC", text)
    for lig, repl in LIGATURES.items():
        text = text.replace(lig, repl)
    text = text.replace("­", "")          # soft hyphens
    text = re.sub(r"\s+", " ", text)           # collapse all whitespace runs
    text = re.sub(r"\s+([,.;:!?%])", r"\1", text)   # " ," -> ","
    text = re.sub(r"\(\s+", "(", text)
    text = re.sub(r"\s+\)", ")", text)
    return text.strip()


def tail_context(text: str, n=CONTEXT_CHARS) -> str:
    """Last n characters, trimmed forward to a word boundary."""
    if len(text) <= n:
        return text
    cut = text[-n:]
    space = cut.find(" ")
    return cut[space + 1:].strip() if space != -1 else cut.strip()


def head_context(text: str, n=CONTEXT_CHARS) -> str:
    """First n characters, trimmed back to a word boundary."""
    if len(text) <= n:
        return text
    cut = text[:n]
    space = cut.rfind(" ")
    return cut[:space].strip() if space != -1 else cut.strip()


# ---------------------------------------------------------------------------
# Chapter loading
# ---------------------------------------------------------------------------

class SourceLibrary:
    """Lazily loads and cleans chapter files, keyed by (book, chapter)."""

    def __init__(self, root: str):
        self.root = root
        self._chapters: dict[tuple[str, str], dict | None] = {}
        self._book_heads: dict[str, set] = {}
        self._index: dict[str, dict[int, str]] = {}
        for book, meta in BOOKS.items():
            paths = sorted(glob.glob(os.path.join(root, "sources", meta["dir"], "*.txt")))
            # Chapter number comes from the filename prefix ("38-hernia.txt" -> 38),
            # compared numerically so "01" and "1" are the same chapter.
            numbered = {}
            for path in paths:
                m = re.match(r"(\d+)", os.path.basename(path))
                if m:
                    numbered[int(m.group(1))] = path
            self._index[book] = numbered

    def book_heads(self, book: str, min_pages=8) -> set:
        """Furniture repeated across the whole book, not just one chapter.

        The book/part title ("A MANUAL ON CLINICAL SURGERY", "PART 11 |
        ABDOMINAL") recurs on hundreds of pages, so a high threshold over every
        available chapter identifies it with no risk of eating a real heading -
        which is what makes it safe to delete from mid-page too.
        """
        if book not in self._book_heads:
            counts = collections.Counter()
            for path in self._index.get(book, {}).values():
                with open(path, encoding="utf-8", errors="replace") as fh:
                    counts.update(head_signature_counts(split_pages(fh.read())))
            self._book_heads[book] = {s for s, n in counts.items() if n >= min_pages}
        return self._book_heads[book]

    def chapter(self, book: str, chapter: str):
        key = (book, chapter)
        if key in self._chapters:
            return self._chapters[key]

        path = self._index.get(book, {}).get(int(chapter))
        if not path:
            self._chapters[key] = None
            return None

        with open(path, encoding="utf-8", errors="replace") as fh:
            raw = fh.read()
        pages = split_pages(raw)
        heads = collect_running_heads(pages)

        book_heads = self.book_heads(book)
        cleaned = [(num, clean_text(body, num, heads, book_heads)) for num, body in pages]
        by_page = {num: i for i, (num, _) in enumerate(cleaned) if num is not None}
        data = {"path": path, "pages": cleaned, "by_page": by_page}
        self._chapters[key] = data
        return data

    def page(self, book: str, chapter: str, page: int):
        """Return (text, before, after) for a printed page, or None if absent.

        `before`/`after` come from the physically adjacent entries in the file, but
        only when they are the expected neighbouring printed page or an unnumbered
        page (which is still physically adjacent in the book).  A numbering jump
        means the neighbour is not really adjacent, so the context stays empty.
        """
        data = self.chapter(book, chapter)
        if not data:
            return None
        idx = data["by_page"].get(page)
        if idx is None:
            return None
        pages = data["pages"]

        def neighbour(j: int, expected: int) -> str:
            if not 0 <= j < len(pages):
                return ""
            num, text = pages[j]
            if num is None or num == expected:
                return text
            return ""

        before = neighbour(idx - 1, page - 1)
        after = neighbour(idx + 1, page + 1)
        return pages[idx][1], tail_context(before), head_context(after)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("guides", nargs="*", help="guide HTML paths (default reference/*.html)")
    parser.add_argument("--root", default=HERE, help="project root holding sources/ and dist/")
    parser.add_argument("--out", default=None, help="output JSON path (default <root>/dist/citations.json)")
    parser.add_argument("--context", type=int, default=CONTEXT_CHARS, help="context characters")
    args = parser.parse_args(argv)

    # Chip names echoed in the summary contain middots/en-dashes; the Windows
    # console defaults to cp1252 and would raise on them.
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

    root = os.path.abspath(args.root)
    guides = [os.path.abspath(p) for p in args.guides] or sorted(
        glob.glob(os.path.join(root, "reference", "*.html"))
    )
    out_path = os.path.abspath(args.out or os.path.join(root, "dist", "citations.json"))

    if not guides:
        print("no guide files found", file=sys.stderr)
        return 1

    library = SourceLibrary(root)
    citations: dict[str, dict] = {}
    pages_out: dict[str, dict] = {}
    unresolved: list[str] = []          # (chip, reason)
    collisions: list[str] = []
    chip_count = 0
    unknown_books = set()

    for guide in guides:
        with open(guide, encoding="utf-8", errors="replace") as fh:
            markup = fh.read()
        for book_cls, inner in CITE_RE.findall(markup):
            chip_count += 1
            book = book_cls.lower()
            text = chip_text(inner)
            if book not in BOOKS:
                unknown_books.add(book)
                unresolved.append(f"{text}  [unknown book id '{book}']")
                continue

            key = citation_key(book, text)
            refs, chapters = parse_chip(book, text)
            if not refs:
                unresolved.append(f"{text}  [no page reference parsed]")
                continue

            page_keys = []
            for chapter, page in refs:
                page_key = f"{book}-{page}"
                if page_key not in pages_out:
                    resolved = library.page(book, chapter, page)
                    if resolved is None:
                        reason = (
                            f"chapter {chapter} not found under sources/{BOOKS[book]['dir']}/"
                            if library.chapter(book, chapter) is None
                            else f"printed page {page} not in chapter {chapter}"
                        )
                        unresolved.append(f"{text}  [{reason}]")
                        continue
                    body, before, after = resolved
                    pages_out[page_key] = {
                        "book": book,
                        "page": page,
                        "text": body,
                        "before": before,
                        "after": after,
                    }
                if page_key not in page_keys:
                    page_keys.append(page_key)

            if not page_keys:
                continue
            entry = {"book": book, "chapter": chapters[0], "pages": page_keys}
            if key in citations and citations[key] != entry:
                # Two different chips munge to the same key (e.g. a comma pair and
                # a range with the same endpoints) - the browser could not tell
                # them apart, so say so loudly instead of silently overwriting.
                collisions.append(f"{key}: {citations[key]} vs {entry} ({text})")
            citations[key] = entry

    payload = {
        "books": {b: {"title": m["title"], "edition": m["edition"]} for b, m in BOOKS.items()},
        "pages": dict(sorted(pages_out.items())),
        "citations": dict(sorted(citations.items())),
    }

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=1, sort_keys=False)
        fh.write("\n")

    size = os.path.getsize(out_path)
    print(f"guides scanned      : {len(guides)}")
    for g in guides:
        print(f"  - {os.path.relpath(g, root)}")
    print(f"citation chips      : {chip_count}")
    print(f"unique citations    : {len(citations)}")
    print(f"unique pages        : {len(pages_out)}")
    print(f"unresolved refs     : {len(unresolved)}")
    for item in unresolved:
        print(f"  ! {item}")
    if collisions:
        print(f"key collisions      : {len(collisions)}")
        for item in collisions:
            print(f"  ! {item}")
    if unknown_books:
        print(f"unknown book ids    : {', '.join(sorted(unknown_books))}")
    print(f"output              : {out_path} ({size:,} bytes, {size / 1024:.1f} KiB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
