"""
Assemble the deployable site for rx.harnar.in.

Run build.py first (with --pdf if the PDF changed), then:

    python publish_site.py ../../rx

What goes in is deliberately narrow. The site itself, the sources needed to rebuild it, and
nothing else. In particular the extracted textbook text under surgery/sources/ stays out:
it is verbatim S Das, Bailey & Love and SRB, it is not needed to serve or rebuild the site,
and a repository is a bad place to keep someone else's book.
"""

import json
import pathlib
import re
import shutil
import sys

ROOT = pathlib.Path(__file__).resolve().parent
DIST = ROOT / "dist"

# published name -> file produced by build.py

CITE_KEY_RE = re.compile(r'<cite\s+class="src\s+([a-z0-9_-]+)"\s*>(.*?)</cite>', re.I | re.S)
DIGITS_RE = re.compile(r"\d+")
TAG_RE = re.compile(r"<[^>]+>")


def check_citations(out: pathlib.Path) -> bool:
    """Every chip in the published fragments must have an entry in citations.json.

    The key the browser derives is the chip's book class plus every run of digits in its text,
    joined by hyphens, which is what reader.js computes at runtime. Recomputing it here is the
    only way to know the published pages and the published citation data agree.
    """
    cj = out / "citations.json"
    if not cj.exists():
        print("  !  citations.json is missing; refusing to publish", file=sys.stderr)
        return False

    data = json.loads(cj.read_text(encoding="utf-8"))
    known = set(data.get("citations", {}))
    if not known:
        print("  !  citations.json contains no citations at all.", file=sys.stderr)
        print("     That is what a build with no sources/ produces. Re-run "
              "build_citations.py with the textbooks present.", file=sys.stderr)
        return False

    missing, chips = {}, 0
    for frag in sorted(out.glob("*.body.html")):
        html = frag.read_text(encoding="utf-8", errors="replace")
        for cls, inner in CITE_KEY_RE.findall(html):
            chips += 1
            text = TAG_RE.sub("", inner).replace("&middot;", "\u00b7").replace("&amp;", "&")
            key = "-".join([cls.lower()] + DIGITS_RE.findall(text))
            if key not in known:
                missing.setdefault(frag.name, []).append(text.strip())

    if missing:
        total = sum(len(v) for v in missing.values())
        print(f"  !  {total} citation chip(s) have no entry in citations.json, so they would "
              f"be dead on the site:", file=sys.stderr)
        for name, items in list(missing.items())[:5]:
            print(f"       {name}: {len(items)}, e.g. {items[0]!r}", file=sys.stderr)
        print("     Re-run build_citations.py, then build.py, then publish again.",
              file=sys.stderr)
        return False

    print(f"  citations: {chips} chips across {len(list(out.glob('*.body.html')))} cases, "
          f"all resolve")
    return True

def site_files() -> dict:
    """What gets served, discovered from dist/ rather than listed by hand.

    This used to be a literal dict naming case 01's three files. That silently stopped being
    right the moment a second case existed: the hub would link cases whose body fragment and
    PDF had never been copied, and every one of them would 404.

    PDFs are published without their number prefix, because that is the name the hub asks
    for: dist/02-thyroid-swelling.pdf is served as thyroid-swelling.pdf.
    """
    # index.html must be the wrapped document, not the bare artifact fragment. Shipping the
    # fragment is what put the site live with no doctype and no viewport meta, so phones laid
    # it out at about 980px and shrank it. build.py writes both; this takes the right one.
    files = {
        "index.html": DIST / "artifact" / "index.html",
        "citations.json": DIST / "citations.json",
    }
    for body in sorted(DIST.glob("*.body.html")):
        files[body.name] = body
    for pdf in sorted(DIST.glob("*.pdf")):
        files[re.sub(r"^\d+-", "", pdf.name)] = pdf

    # kept because the standalone guide has been linked directly; the hub uses the fragments
    first = sorted(DIST.glob("[0-9][0-9]-*.html"))
    first = [p for p in first if not p.name.endswith(".body.html")]
    if first:
        files["guide.html"] = first[0]
    return files


SITE_FILES = {}   # filled in main(), once dist/ has been built

# kept so the site can be rebuilt from the repository alone
SRC_DIRS = ["assets", "reference", "app"]
SRC_FILES = ["build.py", "build_citations.py", "publish_site.py",
             "README.md", "MISSION.md", "RESOURCES.md", "BACKLOG.md"]

# cleanUrls was stripping .html and 308-redirecting, which put an extra round trip on the
# guide fetch for no benefit; this site has no pretty URLs to gain.
#
# Raw string, and the backslash is doubled, because this is JSON and not a Python regex. The
# `source` values are regular expressions, so matching a literal dot needs a backslash in the
# pattern, which in turn has to be escaped for JSON: "\\." in the file. Writing "\." produced
# a file no JSON parser would accept, Vercel rejected every build with "Invalid vercel.json
# file provided", and because a failed build leaves the previous deployment serving, the site
# went on looking fine while silently being hours out of date.
VERCEL = r"""{
  "trailingSlash": false,
  "headers": [
    {
      "source": "/(.*)\\.pdf",
      "headers": [{ "key": "Cache-Control", "value": "public, max-age=3600" }]
    },
    {
      "source": "/(.*)",
      "headers": [{ "key": "X-Content-Type-Options", "value": "nosniff" }]
    }
  ]
}
"""

GITIGNORE = """# the textbooks themselves, and the text extracted from them, are not ours to publish
pdfs/
src/sources/

__pycache__/
*.py[cod]
.DS_Store
Thumbs.db
desktop.ini
.vercel
node_modules/
"""


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__, file=sys.stderr)
        return 1
    out = pathlib.Path(sys.argv[1]).resolve()

    files = site_files()
    missing = [str(p) for p in files.values() if not p.exists()]
    if missing:
        print("build these first (python build.py --pdf):", file=sys.stderr)
        for m in missing:
            print("  " + m, file=sys.stderr)
        return 1

    out.mkdir(parents=True, exist_ok=True)
    for name, src in files.items():
        shutil.copy2(src, out / name)
        print(f"  site: {name}  ({src.stat().st_size // 1024} KB)")

    src_out = out / "src"
    for d in SRC_DIRS:
        target = src_out / d
        if target.exists():
            shutil.rmtree(target)
        shutil.copytree(ROOT / d, target)
        print(f"  src/{d}/")
    src_out.mkdir(parents=True, exist_ok=True)
    for f in SRC_FILES:
        if (ROOT / f).exists():
            shutil.copy2(ROOT / f, src_out / f)

    (out / "vercel.json").write_text(VERCEL, encoding="utf-8")
    (out / ".gitignore").write_text(GITIGNORE, encoding="utf-8")

    # Every JSON file we serve has to parse, checked here rather than discovered in
    # production. A malformed vercel.json fails the Vercel build, and a failed build leaves
    # the previous deployment up, so the site keeps answering with stale content and nothing
    # about it looks broken. That cost about twelve hours of silently undeployed work once.
    for name in ("vercel.json", "citations.json"):
        path = out / name
        if not path.exists():
            continue
        try:
            json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            print(f"  !  {name} is not valid JSON: {exc}", file=sys.stderr)
            print("     refusing to publish; Vercel would reject the build and keep "
                  "serving the previous deployment", file=sys.stderr)
            return 1

    # Is the citation layer actually current for the pages being shipped?
    #
    # build.py never calls build_citations.py, and nothing compared the two, so editing a case
    # and publishing left every new chip inert: the reader marks a chip clickable only when its
    # key is in citations.json, and a missing key fails silently. Worse, a build run without
    # sources/ writes a valid file with zero citations in it, which would publish happily.
    if not check_citations(out):
        return 1
    print(f"\nsite assembled in {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
