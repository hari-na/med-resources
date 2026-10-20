"""Put a "Before you touch the patient" box at the head of every examination section.

Across all 25 cases there was not one mention of a chaperone, of consent to examine, of
privacy or of draping, and gloves appeared once. In an Indian practical that loses marks
on manner before a single sign is found, and outside the exam it is a professional
failure. The bedside tutor on the review panel raised it; the material is Bailey & Love's
own, so none of this has to be flagged as outside the books.

Sources used, all Bailey & Love 28e:
  ch.35 p.472   the sequence: hand hygiene, introduce, chaperone, explain, verbal consent
  ch.21 p.285   respect and dignity, and a chaperone especially for intimate examinations
  ch.63 p.1051  permission, ensured privacy, a relative as chaperone for the abdomen
  ch.80 p.1419  the rectal examination: informed patient, private room, chaperone, good light

Run it once; it refuses to add a second box to a file that already has one.

    python add_consent_box.py
"""

import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
REF = HERE / "reference"

MARK = 'class="tag">Before you touch the patient<'

COMMON = """
  <div class="pearl">
    <span class="tag">Before you touch the patient</span>
    <b>The examiner is marking this before you have found anything.</b> Bailey &amp; Love gives
    it as a sequence: <b>"ensure you have followed appropriate hand hygiene guidance. Introduce
    yourself and check the patient's name and date of birth. Request presence of a chaperone as
    appropriate. Explain what you are going to do, obtain verbal consent and ensure that the
    patient is comfortable."</b><cite class="src bl">B&amp;L 35 &middot; p.472</cite> And the
    standard it is held to: <b>"patients should be treated with respect and dignity, receive a
    clear explanation of the examination undertaken and be kept as comfortable as possible. A
    chaperone should be present, especially for intimate
    examinations."</b><cite class="src bl">B&amp;L 21 &middot; p.285</cite>
    <br><br><span class="label">Do it, and be heard doing it</span><b>Wash your hands. Introduce
    yourself. Say what you want to examine and why, and ask permission. Ask for a chaperone where
    the examination is intimate. Expose what you need and cover the rest. Warm your hands.</b>
    Tell the patient what each step will feel like and that they can ask you to stop, examine the
    tender part last, and watch their face rather than only your hands. Cover them and thank them
    before you turn to the examiner.{extra}
  </div>
"""

INTIMATE = """
    <br><br><span class="label out">This one is intimate, so the chaperone is not a courtesy</span>
    B&amp;L's wording is <b>"especially for intimate examinations"</b>, and it adds that this
    <b>"should be part of a local guideline or
    policy"</b>.<cite class="src bl">B&amp;L 21 &middot; p.285</cite> Offer a chaperone whatever
    your sex and the patient's, say that you have offered, and say you would record it. For a
    child, explain it to the child and ask the parent. If consent is refused, say that you would
    explain again, offer a chaperone, document the refusal, and <b>not proceed</b>. Examiners ask
    what you would do if she declined, and that is the whole answer."""

RECTAL = """
    <br><br><span class="label out">And for the rectal examination specifically</span>
    B&amp;L names the four things it needs before the finger goes anywhere: <b>"it requires a
    relaxed patient who is informed of what the examination will entail, a private environment, a
    chaperone (for the security of both parties) and good
    light."</b><cite class="src bl">B&amp;L 80 &middot; p.1419</cite> Say all four aloud. "I would
    do a PR" without them is where candidates lose this station."""

ABDOMEN = """
    <br><br><span class="label">For the abdomen, privacy is part of the examination</span>
    B&amp;L asks for <b>permission to begin the consultation in ensured privacy</b>, and notes
    that <b>"if a patient is still uncomfortable or reticent, the presence of a close family
    member as a chaperone can help. A tense patient without a relaxed abdominal wall will
    substantively affect the accuracy of the clinical
    examination."</b><cite class="src bl">B&amp;L 63 &middot; p.1051</cite> So this is not only
    manners: an embarrassed patient guards, and a guarded abdomen hides the sign you are after."""

EXTRA = {
    "01": INTIMATE, "03": INTIMATE, "17": INTIMATE, "18": INTIMATE,
    "19": INTIMATE, "21": INTIMATE, "23": INTIMATE,
    "24": INTIMATE + RECTAL, "25": INTIMATE + RECTAL,
    "04": ABDOMEN, "05": ABDOMEN, "06": ABDOMEN, "07": ABDOMEN,
}

# the heading each case's examination section is under; a few call it something else
HEAD = re.compile(r"<h2><span class=\"n\">\d+</span>[^<]*[Ee]xamination[^<]*</h2>")
# cases whose examination lives under a differently named heading
FALLBACK = {
    "10": r"<h2><span class=\"n\">\d+</span>[^<]*(?:ulcer itself|describe)[^<]*</h2>",
    "12": r"<h2><span class=\"n\">\d+</span>[^<]*(?:signs|lump)[^<]*</h2>",
    "14": r"<h2><span class=\"n\">\d+</span>[^<]*(?:triangle|approach|lump)[^<]*</h2>",
    "19": r"<h2><span class=\"n\">\d+</span>[^<]*(?:feel|find|locate)[^<]*</h2>",
}


def main() -> int:
    added, skipped, missed = 0, [], []
    for path in sorted(REF.glob("*.html")):
        num = path.name[:2]
        html = path.read_text(encoding="utf-8")
        if MARK in html:
            skipped.append(path.name)
            continue

        m = HEAD.search(html)
        if not m and num in FALLBACK:
            m = re.search(FALLBACK[num], html)
        if not m:
            missed.append(path.name)
            continue

        block = COMMON.format(extra=EXTRA.get(num, ""))
        at = m.end()
        path.write_text(html[:at] + "\n" + block + html[at:], encoding="utf-8")
        added += 1
        print(f"  added to {path.name}  (after {m.group(0)[:60]}...)")

    print(f"\n  added {added}, already had one {len(skipped)}, no examination heading found "
          f"{len(missed)}")
    for n in missed:
        print(f"    {n}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
