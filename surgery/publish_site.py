"""
Assemble the deployable site for rx.harnar.in.

Run build.py first (with --pdf if the PDF changed), then:

    python publish_site.py ../../rx

What goes in is deliberately narrow. The site itself, the sources needed to rebuild it, and
nothing else. In particular the extracted textbook text under surgery/sources/ stays out:
it is verbatim S Das, Bailey & Love and SRB, it is not needed to serve or rebuild the site,
and a repository is a bad place to keep someone else's book.
"""

import pathlib
import re
import shutil
import sys

ROOT = pathlib.Path(__file__).resolve().parent
DIST = ROOT / "dist"

# published name -> file produced by build.py
def site_files() -> dict:
    """What gets served, discovered from dist/ rather than listed by hand.

    This used to be a literal dict naming case 01's three files. That silently stopped being
    right the moment a second case existed: the hub would link cases whose body fragment and
    PDF had never been copied, and every one of them would 404.

    PDFs are published without their number prefix, because that is the name the hub asks
    for: dist/02-thyroid-swelling.pdf is served as thyroid-swelling.pdf.
    """
    files = {
        "index.html": DIST / "artifact" / "case-files.html",
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
VERCEL = """{
  "trailingSlash": false,
  "headers": [
    {
      "source": "/(.*)\.pdf",
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
    print(f"\nsite assembled in {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
