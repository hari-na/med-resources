"""Derive the Bailey & Love ligature repair table from evidence.

The 28th edition PDF maps its ff/fi/fl/ffi/ffl ligature glyphs to a bare "f", so the
extracted text reads "fstula" for fistula, "difcult" for difficult and "sufcient" for
sufficient. Unicode normalisation cannot fix this: the other letters never reach the text
layer at all.

Three earlier attempts each certified bad output, so the reasons are recorded here.

  1. A hand-written list of about 80 words. It left more than six thousand occurrences
     unrepaired, and was verified against itself: checking the repaired text for the words
     that had just been repaired of course found none left.

  2. Deriving the list from the other two books, but treating any word seen twice in them
     as real. S Das and SRB are themselves OCR, and their own scan damage includes "fow"
     11 times. "fow" therefore counted as a real word and 298 occurrences of it in Bailey
     were published broken. Hence KNOWN_MIN and the damaged_vocabulary() screen below.

  3. The same, but restoring only one letter. The ffi and ffl glyphs drop two, so every
     word like "sufcient" and "difcult" was missed. Hence RESTORATIONS below.

A Bailey word qualifies for repair only when all of these hold:

  - it is not itself a known word, so "fat", "often" and "left" are never touched;
  - replacing one "f" with "ff", "fi", "fl", "ffi" or "ffl" produces a known word;
  - exactly one such replacement does, so there is nothing to guess between.

"Known" means a word in the English wordlist, or one seen at least KNOWN_MIN times in
S Das or SRB (which supply the medical vocabulary the wordlist lacks, such as
"proinflammatory"), minus any word the screen finds to be scan damage itself.

Repairs resting only on a single occurrence in the clean books, with no wordlist entry
behind them, are printed as thin evidence so they can be read by eye.

Usage, after re-extracting the sources:

    python derive_ligatures.py path/to/words_alpha.txt

The wordlist is not vendored in this repository. It is the public domain list from
https://github.com/dwyl/english-words (words_alpha.txt). Only the generated
ligature_repairs.py is committed, so the build does not depend on the download.
"""

import collections
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
WORD = re.compile(r"[a-z]{3,}")

# books without the fault, used for the medical vocabulary the wordlist lacks
CLEAN = ("sdas", "srb")
BROKEN = "bailey"

# what a single surviving "f" may stand for
RESTORATIONS = ("ff", "fi", "fl", "ffi", "ffl")

# a word not in the wordlist must appear at least this often in the clean books to count
# as real. One occurrence is allowed, but such repairs are reported as thin evidence.
KNOWN_MIN = 1

# when two restorations are both "known", the clean books decide by how much more often
# they use one. The winner needs WINNER_MIN occurrences of its own, so that a single OCR
# artefact can never carry a repair.
WINNER_RATIO = 3
WINNER_MIN = 2

# a clean-book word is scan damage itself when restoring it yields a word this many times
# more common. "fow" 11 against "flow" 292 is caught by this; "fat" against "fiat" is not.
DAMAGE_RATIO = 10

# The few the evidence cannot settle, resolved by hand against the real spellings.
# These are the whole hand-written part of the table, and each one says why.
OVERRIDES = {
    "gastrografn": "gastrografin",  # Gastrografin, one f, per the Bracco trade name
    "wolfan": "wolffian",           # Wolffian duct, two f, after Caspar Friedrich Wolff
    # "classifl" is a single piece of OCR noise in the clean books, and KNOWN_MIN of 1
    # admitted it, so the derivation picked it over the right answer. This is a
    # hyphenation fragment of "classifi-cation", like "fcation" and "classifca".
    "classif": "classifi",
    # "fistulation" is in neither the wordlist nor the clean books, so there is no
    # evidence to reach it, but the guides use the word and the sense is not in doubt.
    "fstulation": "fistulation",
}


def vocabulary(folders) -> collections.Counter:
    seen = collections.Counter()
    for folder in folders:
        for path in (HERE / "sources" / folder).glob("*.txt"):
            seen.update(WORD.findall(path.read_text(encoding="utf-8", errors="replace").lower()))
    return seen


def restorations(word: str, known) -> set:
    """Every known word reachable by expanding exactly one "f" of this word."""
    out = set()
    for i, ch in enumerate(word):
        if ch != "f":
            continue
        for restored in RESTORATIONS:
            candidate = word[:i] + restored + word[i + 1:]
            if candidate in known:
                out.add(candidate)
    return out


def damaged_vocabulary(clean: collections.Counter) -> set:
    """Clean-book words that are themselves ligature damage, by their own frequency."""
    return {
        word
        for word, count in clean.items()
        if any(clean.get(c, 0) >= DAMAGE_RATIO * count for c in restorations(word, clean))
    }


def derive(wordlist: set):
    clean = vocabulary(CLEAN)
    damaged = damaged_vocabulary(clean)
    known = (wordlist | {w for w, n in clean.items() if n >= KNOWN_MIN}) - damaged
    broken = vocabulary([BROKEN])

    repairs, ambiguous, thin = {}, [], []
    for word, count in broken.items():
        if word in known or "f" not in word:
            continue
        candidates = restorations(word, known)
        if len(candidates) > 1:
            # The wordlist is a broad net and carries junk of its own ("inffuence",
            # "fiexor", "ffll"), which would otherwise leave the real word unreachable.
            # The clean books are real surgical English, so the candidate they use far
            # more often wins: "flexor" 164 against "fiexor" 1. The junk is always a
            # single OCR artefact, so WINNER_MIN stops a lone occurrence winning
            # anything, and both stay unrepaired when neither dominates ("puff" 2
            # against "puffi" 1).
            top = max(candidates, key=lambda c: clean.get(c, 0))
            rest = [clean.get(c, 0) for c in candidates if c != top]
            if clean.get(top, 0) >= WINNER_MIN and all(
                clean.get(top, 0) >= WINNER_RATIO * n for n in rest
            ):
                candidates = {top}
        if word in OVERRIDES:
            repairs[word] = OVERRIDES[word]
        elif len(candidates) == 1:
            repairs[word] = candidates.pop()
        elif candidates:
            ambiguous.append((word, sorted(candidates), count))
            continue
        else:
            continue
        target = repairs[word]
        if target not in wordlist and clean.get(target, 0) < 2:
            thin.append((word, target, count, clean.get(target, 0)))
    return repairs, ambiguous, thin, broken, damaged


def main(argv) -> int:
    if len(argv) != 2:
        print(__doc__.strip().splitlines()[-6], file=sys.stderr)
        print("usage: python derive_ligatures.py path/to/words_alpha.txt", file=sys.stderr)
        return 2
    path = pathlib.Path(argv[1])
    if not path.is_file():
        print(f"wordlist not found: {path}", file=sys.stderr)
        return 2
    wordlist = {
        w for w in path.read_text(encoding="utf-8", errors="replace").lower().split() if len(w) >= 3
    }

    repairs, ambiguous, thin, broken, damaged = derive(wordlist)
    occurrences = sum(broken[w] for w in repairs)

    out = HERE / "ligature_repairs.py"
    out.write_text(
        '"""Generated by derive_ligatures.py. Do not edit by hand.\n\n'
        f"{len(repairs)} word types, {occurrences} occurrences in the extracted Bailey & Love\n"
        'text. See derive_ligatures.py for how these are established, and why the three\n'
        'earlier versions of this table were wrong.\n"""\n\n'
        "LIGATURE_REPAIRS = {\n"
        + "".join(f'    "{w}": "{r}",\n' for w, r in sorted(repairs.items()))
        + "}\n",
        encoding="utf-8",
    )

    print(f"  wordlist        : {len(wordlist):,} words from {path.name}")
    print(f"  scan damage in the clean books, excluded: {len(damaged)} ({', '.join(sorted(damaged))})")
    print(f"  repairs derived : {len(repairs)} word types, {occurrences:,} occurrences")
    print(f"  ambiguous       : {len(ambiguous)} (left alone)")
    for word, cands, n in sorted(ambiguous, key=lambda x: -x[2])[:10]:
        print(f"    {word} -> {cands} ({n})")
    print(f"  thin evidence   : {len(thin)} (one clean-book occurrence, no wordlist entry)")
    for word, target, n, seen in sorted(thin, key=lambda x: -x[2]):
        print(f"    {word} -> {target} (bailey {n}, clean {seen})")
    print(f"  written         : {out.relative_to(HERE)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
