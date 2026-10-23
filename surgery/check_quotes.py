"""Check that every quoted sentence really is on the page its citation chip names.

build_citations.py proves a chip resolves to a page. It does not prove the sentence in
quotation marks beside the chip is on that page, which is what a student checks when they
tap it. A quotation can be misattributed to the wrong page or the wrong chapter, or be a
paraphrase inside quotation marks, and all of those look fine to the existing check.

The first version of this answered yes or no, and that was useless. The three books are
OCR, S Das badly so, and a verbatim quotation often fails to match text that is plainly
the same passage: "low-risk" is extracted as "lowrisk", "gallbladder" breaks across a line
as "gallblad der", and the guide writes "1 to 2%" where the book prints "1-2%". A yes/no
match called 243 quotations missing, almost all of which were fine.

So this scores instead. Each sentence of a quotation is aligned against the best-matching
window of the cited page and given a similarity ratio, and that ratio is what separates
scan damage from a quotation that is not there:

    >= VERBATIM     the sentence is on that page, give or take the scan
    >= DAMAGED      recognisably the same text through bad OCR; expected in S Das
    <  DAMAGED      does not look like that page at all, and needs a person to read it

Scored against the whole cited page, not the narrowed excerpt the chip serves, because
those are two different questions. The second is reported separately as "window": the
quotation is on the right page but the served excerpt cuts it, which to a reader looks
like a misquotation.

    python check_quotes.py                 # triage summary and the suspect list
    python check_quotes.py --all           # every finding, not just the suspects
    python check_quotes.py --case 21       # one case
    python check_quotes.py --strict        # exit 1 if anything is suspect

A low score is a place to look, not proof of an error. Read the page before changing
anything: booksearch.py --page BOOK N
"""

from __future__ import annotations

import argparse
import collections
import difflib
import html as htmllib
import json
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import booksearch as bs  # noqa: E402  (after sys.path, so -I cannot break the import)

# Calibrated against known-good and known-bad quotations. Genuine ones, including the
# worst two-column mangling, score 0.79 to 1.00; sentences that are invented or on another
# page score 0.35 to 0.42. The gap is wide, and these sit in it.
VERBATIM = 0.95
DAMAGED = 0.62

BOOK = {"bl": "bailey", "das": "sdas", "srb": "srb"}
TAGS = re.compile(r"<[^>]+>")
CITE = re.compile(r"<cite class=\"src ([a-z]+)\"[^>]*>(.*?)</cite>", re.S)
# a bolded quotation followed by one or more chips
QUOTED = re.compile(
    r"<b>\s*[\"&]{1,6}(?:quot;)?(?P<q>[^<]{20,1400}?)[\"&]{1,6}(?:quot;)?\s*</b>\s*"
    r"(?P<cites>(?:<cite class=\"src [^\"]+\">[^<]*</cite>\s*)+)",
    re.S,
)
SENTENCE = re.compile(r"(?<=[.;:])\s+|\.\.\.|…")
WORD = re.compile(r"[a-z0-9]+")


SPAN = re.compile(r"<span class=\"ruling\"|<span|</span>")


def drop_rulings(html: str) -> str:
    """Remove the editorial rulings, which are the guide's words, not the books'.

    A ruling is the model answer: "I would not use ERCP to make the diagnosis..." It sits
    in quotation marks and is followed by citations, exactly like a book quotation, and no
    scoring can tell them apart because it is not supposed to be on the page. Nearly every
    one of the 700 suspects in the first scored run was one of these.
    """
    out, pos = [], 0
    for m in re.finditer(r"<span class=\"ruling\"[^>]*>", html):
        if m.start() < pos:
            continue
        out.append(html[pos:m.start()])
        # walk to the matching close, counting nested spans
        depth, i = 1, m.end()
        for t in SPAN.finditer(html, m.end()):
            if t.group(0).startswith("</"):
                depth -= 1
                if depth == 0:
                    i = t.end()
                    break
            else:
                depth += 1
        else:
            i = len(html)
        pos = i
    out.append(html[pos:])
    return "".join(out)


def plain(s: str) -> str:
    return re.sub(r"\s+", " ", htmllib.unescape(TAGS.sub(" ", s))).strip()


def tight(s: str) -> str:
    """Letters and digits only, so hyphenation and line breaks stop mattering."""
    return re.sub(r"[^a-z0-9]", "", s.lower())


def key_of(cls: str, text: str) -> str:
    digits = re.findall(r"\d+", plain(text))
    return cls.lower() + "-" + "-".join(digits) if digits else ""


def score(hay: str, need: str) -> float:
    """How much of this sentence appears, in order, in this text. 0 to 1.

    Coverage rather than similarity. SequenceMatcher's ratio is symmetric, which punishes
    the thing the extraction does most: Bailey is set in two columns and taken line by
    line, so a whole line from the other column lands in the middle of a sentence. "The
    treatment consists of fluid restriction" is on p.1530 with about sixty characters of
    another column inside it, and scored 0.74 by similarity. Measuring how much of the
    sentence is present, in order, scores it 1.0, while a sentence that is genuinely not
    on the page still scores low because little of it matches.

    Scored against a window around the anchor rather than the whole page, so a long page
    cannot accumulate a spurious match out of scattered common fragments.
    """
    if len(need) < 12 or not hay:
        return 0.0
    sm = difflib.SequenceMatcher(None, need, hay, autojunk=False)
    m = sm.find_longest_match(0, len(need), 0, len(hay))
    if m.size < 8:
        return 0.0
    lo = max(0, m.b - m.a - 40)
    window = hay[lo:lo + int(len(need) * 2.2) + 80]
    blocks = difflib.SequenceMatcher(None, need, window, autojunk=False).get_matching_blocks()
    # ignore one- and two-character coincidences
    covered = sum(b.size for b in blocks if b.size >= 3)
    return min(1.0, covered / len(need))


def load_pages():
    """Full text of every printed page, mended, and the excerpt each citation serves."""
    full = collections.defaultdict(str)
    for p in bs.load(None):
        full[(p.book, p.page)] += " " + p.norm

    data = json.loads((HERE / "dist" / "citations.json").read_text(encoding="utf-8"))
    served = {}
    for key, c in data["citations"].items():
        served[key] = " ".join(
            data["pages"][p]["text"] for p in c["pages"] if p in data["pages"]
        )
    return full, served


def pages_for(key: str, full) -> str:
    cls = key.split("-")[0]
    book = BOOK.get(cls, cls)
    return " ".join(full.get((book, int(n)), "") for n in key.split("-")[1:] if n.isdigit())


def findings(only_case=None):
    full, served = load_pages()
    page_cache, served_cache = {}, {}
    out = []
    for path in sorted((HERE / "reference").glob("*.html")):
        if only_case and not path.name.startswith(only_case):
            continue
        raw = drop_rulings(path.read_text(encoding="utf-8"))
        for m in QUOTED.finditer(raw):
            quote = plain(m.group("q"))
            keys = [k for k in (key_of(c, t) for c, t in CITE.findall(m.group("cites"))) if k]
            if not keys or len(WORD.findall(quote)) < 6:
                continue
            sentences = [s.strip() for s in SENTENCE.split(quote)
                         if len(WORD.findall(s)) >= 6] or [quote]
            for sentence in sentences:
                need = tight(sentence)
                best_page = best_window = 0.0
                for k in keys:
                    if k not in page_cache:
                        page_cache[k] = tight(pages_for(k, full))
                        served_cache[k] = tight(served.get(k, ""))
                    best_page = max(best_page, score(page_cache[k], need))
                    best_window = max(best_window, score(served_cache[k], need))
                out.append({"case": path.name, "keys": keys, "sentence": sentence,
                            "page": best_page, "window": best_window})
    return out


def verdict(f) -> str:
    if f["page"] < DAMAGED:
        return "suspect"
    if f["window"] < DAMAGED:
        return "window"
    return "verbatim" if f["page"] >= VERBATIM else "damaged"


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--case", help="only this case, by its leading number")
    ap.add_argument("--all", action="store_true", help="list every finding")
    ap.add_argument("--strict", action="store_true", help="exit 1 if anything is suspect")
    a = ap.parse_args(argv)

    fs = findings(a.case)
    tally = collections.Counter(verdict(f) for f in fs)
    by_book = collections.Counter(
        f["keys"][0].split("-")[0] for f in fs if verdict(f) == "suspect")

    print(f"  sentences checked : {len(fs)}")
    print(f"    verbatim on the cited page             : {tally['verbatim']}")
    print(f"    recognisable through bad OCR           : {tally['damaged']}")
    print(f"    on the page, cut by the excerpt window : {tally['window']}")
    print(f"    SUSPECT, does not look like that page  : {tally['suspect']}")
    if by_book:
        print("    suspects by book :",
              ", ".join(f"{b} {n}" for b, n in by_book.most_common()))

    show = fs if a.all else [f for f in fs if verdict(f) == "suspect"]
    if show:
        print()
        for f in sorted(show, key=lambda x: x["page"]):
            print(f"  [{verdict(f):8}] page {f['page']:.2f} window {f['window']:.2f}  "
                  f"{f['case']} {','.join(f['keys'])}")
            print(f"             {f['sentence'][:120]}")
    return 1 if (a.strict and tally["suspect"]) else 0


if __name__ == "__main__":
    raise SystemExit(main())
