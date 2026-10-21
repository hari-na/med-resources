"""Check that every quoted sentence is in the passage its citation chip actually serves.

The citation system can be wrong in two different ways, and only one of them was being
checked. build_citations.py proves that every chip resolves to a page, which catches a
chip pointing at a page that does not exist. It does not prove that the sentence in
quotation marks beside the chip is on that page, which is what a student checks when they
tap it. A quotation can be misattributed to the wrong page, to the wrong chapter, or to a
real page whose narrowed window happens to exclude the sentence, and all three look fine
to the existing check.

Matching has to tolerate the extraction. Bailey is set in two columns and the text is
taken line by line, so a line from the other column lands in the middle of a sentence:
"the treatment consists of fluid restriction" is genuinely on p.1530 and an exact search
finds nothing. So a quote counts as found when its words appear in order with a bounded
amount of intruding text, the same rule booksearch.py uses.

    python check_quotes.py            # report
    python check_quotes.py --strict   # exit 1 if anything is unfound

What it can and cannot prove, because the number it prints is easy to misread:

  It can show that a quotation IS where the chip says it is. A pass is meaningful.

  It cannot show that one is not. Most of what it reports unfound is the extraction, not
  the guide. S Das is the worst scanned of the three and about half its quotations fail
  here while their neighbours in the same quotation pass, which is what OCR damage looks
  like rather than misattribution. Number formatting does it too: the guide writes
  "1 to 2%" where the book prints "1-2%", and stripping punctuation makes those "1to2"
  and "12". So treat the list as somewhere to look, not as a count of errors.

It reports rather than failing the build, for that reason. Checking a specific quotation
properly means reading the page: booksearch.py --page BOOK N.
"""

from __future__ import annotations

import collections
import html as htmllib
import json
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
TOKEN = re.compile(r"[a-z0-9]+")
GAP_WORDS = 12          # one interleaved line, with a little slack

# a quoted span sitting immediately before one or more citation chips
QUOTE_THEN_CITE = re.compile(
    r"<b>\s*&quot;(?P<q>.{20,1200}?)&quot;\s*</b>\s*(?P<cites>(?:<cite class=\"src [^\"]+\">.*?</cite>\s*)+)",
    re.S,
)
CITE = re.compile(r"<cite class=\"src ([a-z]+)\"[^>]*>(.*?)</cite>", re.S)
TAGS = re.compile(r"<[^>]+>")


def plain(s: str) -> str:
    s = TAGS.sub(" ", s)
    s = htmllib.unescape(s)
    return re.sub(r"\s+", " ", s).strip()


def key_of(cls: str, text: str) -> str:
    digits = re.findall(r"\d+", plain(text))
    return cls.lower() + "-" + "-".join(digits) if digits else ""


def tight(s: str) -> str:
    """Letters and digits only.

    Comparing word by word does not work here. The extraction loses the hyphen in
    "low-risk" and prints "lowrisk", and it breaks "gallbladder" across a line as
    "gallblad der", so token equality fails on text that is plainly the same. Stripping
    everything but letters and digits makes both of those identical.
    """
    return re.sub(r"[^a-z0-9]", "", s.lower())


MAX_INTRUSION = 400     # characters a line from the other column can insert


def found(haystack: str, needle: str) -> bool:
    """Is this quote in this text, allowing for how the pages were extracted?"""
    hay, need = tight(haystack), tight(needle)
    if len(need) < 20 or not hay:
        return False
    if need in hay:
        return True
    # Bailey is set in two columns and is taken line by line, so a line from the other
    # column can land in the middle of a sentence. Match the quote in pieces, in order,
    # allowing a bounded amount of intruding text between them.
    step = 30
    chunks = [need[i:i + step] for i in range(0, len(need), step)]
    chunks = [c for c in chunks if len(c) >= 15]
    if not chunks:
        return False
    pos = 0
    for n, chunk in enumerate(chunks):
        at = hay.find(chunk, pos)
        if at == -1:
            return False
        if n and at - pos > MAX_INTRUSION:
            return False
        pos = at + len(chunk)
    return True


def main(argv) -> int:
    data = json.loads((HERE / "dist" / "citations.json").read_text(encoding="utf-8"))
    cites, pages = data["citations"], data["pages"]

    served = {}
    for key, c in cites.items():
        served[key] = " ".join(pages[p]["text"] for p in c["pages"] if p in pages)

    total, missing = 0, []
    by_file = collections.Counter()
    for path in sorted((HERE / "reference").glob("*.html")):
        raw = path.read_text(encoding="utf-8")
        # the quotes are written with real quote marks, so look for those too
        for m in re.finditer(
            r"<b>\s*[\"&]{1,6}(?:quot;)?(?P<q>[^<]{20,1200}?)[\"&]{1,6}(?:quot;)?\s*</b>\s*"
            r"(?P<cites>(?:<cite class=\"src [^\"]+\">[^<]*</cite>\s*)+)",
            raw, re.S,
        ):
            quote = plain(m.group("q"))
            keys = [key_of(cls, txt) for cls, txt in CITE.findall(m.group("cites"))]
            keys = [k for k in keys if k]
            if not keys or len(TOKEN.findall(quote)) < 5:
                continue
            total += 1
            # Check sentence by sentence. A quotation often joins parts of a page that are
            # paragraphs apart, with or without an ellipsis, and the guide elides freely
            # inside a quote. Requiring the whole span to be contiguous reported hundreds
            # of quotations as missing that are plainly on the page.
            parts = [f.strip() for f in re.split(r"(?<=[.;:])\s+|\.\.\.|…", quote)
                     if len(TOKEN.findall(f)) >= 6]
            parts = parts or [quote]
            if not any(all(found(served.get(k, ""), part) for part in parts) for k in keys):
                missing.append((path.name, keys, quote))
                by_file[path.name] += 1

    print(f"  quoted spans checked : {total}")
    print(f"  not in the passage their chip serves : {len(missing)}")
    if by_file:
        print("\n  by case:")
        for name, n in by_file.most_common():
            print(f"    {n:4}  {name}")
    if missing:
        print("\n  first 25:")
        for name, keys, q in missing[:25]:
            print(f"    {name} {','.join(keys)}")
            print(f"        {q[:110]}")
    if "--strict" in argv and missing:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
