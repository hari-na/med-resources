"""Search the three textbooks properly, and say which page a claim is on.

Plain grep over the extracted text is unreliable, and has already produced wrong claims in
the guides. Three things defeat it:

  - Bailey & Love 28e's font maps the ff/fi/fl ligature to a bare "f", so "fistula" is stored
    as "fstula" and "FNAC" as "fnac". Searching the correct spelling finds nothing.
  - Words break across lines, so the text holds "pos terior" and "exter nal".
  - Hyphenation leaves "dyspha-" at a line end and "gia" at the start of the next.

A failed search then reads as "the book does not say this", which is how an absence claim
ends up in a study guide that is wrong. This normalises the corpus and the query the same
way, and searches a whitespace-stripped form as well, so none of the three can hide a hit.

    python booksearch.py "fistula in ano"            # all three books
    python booksearch.py --book bailey "Rutherford"  # one book
    python booksearch.py --absent "Pemberton"        # is it genuinely absent?
    python booksearch.py --page bailey 1561          # print a page
    python booksearch.py --headings bailey 86        # section headings in a chapter

Exit code is 1 when `--absent` finds the term, so it can gate a build.
"""

import argparse
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
SOURCES = HERE / "sources"
PAGE_RE = re.compile(r"\[\[ book p\.(-?\d+) \| pdf p\.(\d+) \]\]")

try:
    from ligature_repairs import LIGATURE_REPAIRS
except ImportError:
    # Python's isolated mode (-I, which also implies -P) drops this script's own directory
    # from sys.path, so the import fails even though the file is sitting next to it. The
    # old bare "except Exception: LIGATURE_REPAIRS = {}" then searched the Bailey text with
    # its ligature damage intact and said nothing, which makes every --absent result on a
    # word containing ff, fi or fl quietly wrong. Put the directory back, and if it is
    # genuinely missing, say so.
    sys.path.insert(0, str(HERE))
    try:
        from ligature_repairs import LIGATURE_REPAIRS
    except ImportError:
        print("warning: ligature_repairs.py not found. The Bailey text will be searched "
              "with its ligature damage intact, so results for any word containing ff, fi "
              "or fl, and every --absent check, are unreliable. Run derive_ligatures.py.",
              file=sys.stderr)
        LIGATURE_REPAIRS = {}

_LIG_RE = (
    re.compile(r"\b(" + "|".join(sorted(LIGATURE_REPAIRS, key=len, reverse=True)) + r")\b")
    if LIGATURE_REPAIRS else None
)


_LIG_RE_ANY = (
    re.compile(r"\b(" + "|".join(sorted(LIGATURE_REPAIRS, key=len, reverse=True)) + r")\b",
               re.IGNORECASE)
    if LIGATURE_REPAIRS else None
)


def normalise(text: str) -> str:
    """Lowercase, mend hyphenation and ligature loss, collapse whitespace."""
    t = text.lower()
    t = t.replace("­", "")                       # soft hyphen
    t = re.sub(r"-\s*\n\s*", "", t)                   # dyspha-\ngia -> dysphagia
    t = re.sub(r"\s+", " ", t)
    if _LIG_RE:
        t = _LIG_RE.sub(lambda m: LIGATURE_REPAIRS[m.group(0)], t)
    return t


def mend(text: str) -> str:
    """Repair the ligature loss for reading, keeping the line breaks and the capitals.

    normalise() is for matching, so it lowercases and collapses whitespace. When a page
    is printed for someone to read, the layout matters and so does the difference
    between "fat" the word and "Fat" at the start of a sentence.
    """
    if not _LIG_RE_ANY:
        return text

    def one(m):
        word = m.group(0)
        fixed = LIGATURE_REPAIRS[word.lower()]
        if word.isupper():
            return fixed.upper()
        if word[:1].isupper():
            return fixed[:1].upper() + fixed[1:]
        return fixed

    return _LIG_RE_ANY.sub(one, text)


def tighten(text: str) -> str:
    """Everything a human would read as letters, with no spacing at all."""
    return re.sub(r"[^a-z0-9]", "", normalise(text))


class Page:
    __slots__ = ("book", "chapter", "page", "raw", "norm", "tight")

    def __init__(self, book, chapter, page, raw):
        self.book, self.chapter, self.page, self.raw = book, chapter, page, raw
        self.norm = normalise(raw)
        self.tight = tighten(raw)

    def __repr__(self):
        return f"{self.book} {self.chapter} p.{self.page}"


def load(books=None):
    pages = []
    for folder in sorted(SOURCES.iterdir()):
        if not folder.is_dir() or (books and folder.name not in books):
            continue
        for path in sorted(folder.glob("*.txt")):
            text = path.read_text(encoding="utf-8", errors="replace")
            marks = list(PAGE_RE.finditer(text))
            for i, m in enumerate(marks):
                end = marks[i + 1].start() if i + 1 < len(marks) else len(text)
                pages.append(Page(folder.name, path.stem, int(m.group(1)),
                                  text[m.end():end]))
    return pages


# A line from the other column can land in the middle of a sentence, so the words of a
# phrase are on the page in order but not adjacent. One interleaved line is about ten
# words, and ten is also tight enough not to match unrelated prose: at 15 this started
# matching "the treatment of enuresis consists..." for a sentence about TURP.
GAP_WORDS = 10


TOKEN = re.compile(r"[a-z0-9]+")


def loose_find(page, phrase):
    """Where a phrase sits on a page, tolerating the extraction's interleaved columns.

    Bailey is printed in two columns and the extraction takes them line by line, so
    p.1530 reads "...The treatment assessment with cystoscopy and pressure studies
    including consists of fluid restriction." An exact search for "the treatment consists
    of fluid restriction" finds nothing, and that is a sentence the guide quotes. Matching
    the words in order, allowing a bounded amount of intruding text, finds it.

    Tokenising matters here: splitting on whitespace leaves "restriction." which never
    equals "restriction", so the first version of this found nothing at all.

    Returns the character offset of the first matching word, or -1.
    """
    want = TOKEN.findall(normalise(phrase))
    if len(want) < 3:
        return -1
    have = [(m.group(0), m.start()) for m in TOKEN.finditer(page.norm)]
    if len(have) < len(want):
        return -1
    limit = len(want) + GAP_WORDS
    for start in range(len(have)):
        if have[start][0] != want[0]:
            continue
        i, j = start + 1, 1
        while i < len(have) and j < len(want) and i - start <= limit:
            if have[i][0] == want[j]:
                j += 1
            i += 1
        if j == len(want):
            return have[start][1]
    return -1


def search(pages, phrase, limit=40, loose=True):
    want, want_tight = normalise(phrase), tighten(phrase)
    hits = []
    for p in pages:
        at = p.norm.find(want)
        if at == -1 and want_tight and want_tight in p.tight:
            at = 0                                    # split across lines; show the page top
        if at == -1 and loose:
            at = loose_find(p, phrase)
        if at != -1:
            hits.append((p, at))
            if len(hits) >= limit:
                break
    return hits


def main(argv=None) -> int:
    # The books are full of characters the Windows console cannot encode, and a crash here
    # reads as "the search found nothing", which is the failure mode this tool exists to stop.
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("phrase", nargs="*", help="what to look for")
    ap.add_argument("--book", action="append", help="limit to a book (sdas, bailey, srb)")
    ap.add_argument("--absent", metavar="TERM",
                    help="assert the term is absent; exits 1 if it is present")
    ap.add_argument("--page", nargs=2, metavar=("BOOK", "N"), help="print one printed page")
    ap.add_argument("--headings", nargs=2, metavar=("BOOK", "CH"),
                    help="headings in a chapter, with their pages")
    ap.add_argument("--context", type=int, default=240, help="characters of context")
    a = ap.parse_args(argv)

    pages = load(a.book)
    if not pages:
        print("no extracted sources found; run extract_sources.py", file=sys.stderr)
        return 2

    if a.page:
        book, n = a.page[0], int(a.page[1])
        for p in pages:
            if p.book == book and p.page == n:
                print(f"=== {p.book} {p.chapter} book p.{p.page} ===")
                print(mend(p.raw.strip()))
                return 0
        print(f"no page {n} in {book}", file=sys.stderr)
        return 2

    if a.headings:
        book, ch = a.headings[0], a.headings[1].zfill(2)
        seen = set()
        for p in pages:
            if p.book != book or not p.chapter.startswith(ch):
                continue
            for line in p.raw.splitlines():
                s = line.strip()
                if 3 < len(s) < 60 and (s.isupper() or re.match(r"^[A-Z][a-z]+( [A-Za-z'’\-]+){0,5}$", s)):
                    if s.lower() not in seen:
                        seen.add(s.lower())
                        print(f"  p.{p.page:5d}  {s}")
        return 0

    if a.absent:
        # loose matching on purpose: the cost of a false "absent" is a claim in the guide
        # that a book does not say something it does say, which is worse than a false hit
        hits = search(pages, a.absent, limit=6, loose=True)
        if hits:
            print(f"  NOT ABSENT: '{a.absent}' appears in:")
            for p, _ in hits:
                print(f"    {p.book} {p.chapter} p.{p.page}")
            return 1
        print(f"  absent: '{a.absent}' is not in {', '.join(sorted({p.book for p in pages}))}")
        return 0

    if not a.phrase:
        ap.print_help()
        return 2

    phrase = " ".join(a.phrase)
    hits = search(pages, phrase)
    if not hits:
        print(f"  no hit for '{phrase}'")
        return 1
    print(f"  {len(hits)} hit(s) for '{phrase}'\n")
    for p, at in hits:
        lo = max(0, at - a.context // 2)
        print(f"  {p.book:7s} {p.chapter:34s} book p.{p.page}")
        print(f"      …{p.norm[lo:lo + a.context]}…\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
