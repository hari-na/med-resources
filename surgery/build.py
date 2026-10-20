"""
Build portable study documents.

Source documents in reference/ link the shared stylesheet, so there is one place to
change the design. Students read these on their own devices, often as a single file
sent to them, so the built copies in dist/ inline that stylesheet and depend on
nothing. Run after editing any reference document or the stylesheet:

    python build.py
"""

import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent
CSS = ROOT / "assets" / "study.css"
SRC = ROOT / "reference"
OUT = ROOT / "dist"

LINK = re.compile(
    r'[ \t]*<link[^>]+href=["\'][^"\']*assets/study\.css["\'][^>]*>[ \t]*\n?',
    re.IGNORECASE,
)
SCRIPT_SRC = re.compile(
    r'[ \t]*<script[^>]+src=["\'][^"\']*assets/reader\.js["\'][^>]*>\s*</script>[ \t]*\n?',
    re.IGNORECASE,
)
WRAP = re.compile(r'(<div class="wrap">.*</div>)\s*<script', re.DOTALL)



# A citation chip must never split across two lines, but a run of chips sits with no
# whitespace between them, so the line had nowhere to break and the page grew wider
# than the phone instead. This puts a zero-width space before each chip: a break
# opportunity outside the chip, so a chip that will not fit moves to the next line
# whole. It goes in here rather than in the reference files so the source stays
# readable, and it is outside the element, so the chip's own text is unchanged and
# the citation keys still match.
CHIP_START = re.compile(r'(?<!​)<cite class="src')

def space_chips(html: str) -> str:
    return CHIP_START.sub(lambda m: "​" + m.group(0), html)

def main() -> int:
    if not CSS.exists():
        print(f"missing stylesheet: {CSS}", file=sys.stderr)
        return 1

    css = CSS.read_text(encoding="utf-8")
    pages = sorted(SRC.glob("*.html"))
    if not pages:
        print("no documents in reference/", file=sys.stderr)
        return 1

    js = (ROOT / "assets" / "reader.js").read_text(encoding="utf-8")

    OUT.mkdir(exist_ok=True)
    for page in pages:
        html = space_chips(page.read_text(encoding="utf-8"))
        if not LINK.search(html):
            print(f"  !  {page.name}: no stylesheet link found, copied unchanged")
            inlined = html
        else:
            # a function replacement, because re.sub reads backslashes in a string
            # replacement as escapes and the script contains regex literals like \s
            inlined = LINK.sub(lambda _m: f"<style>\n{css}\n</style>\n", html, count=1)
        inlined = SCRIPT_SRC.sub(lambda _m: f"<script>\n{js}\n</script>\n", inlined, count=1)
        target = OUT / page.name
        target.write_text(inlined, encoding="utf-8")
        print(f"  ok {page.name}  ->  dist/{page.name}  ({len(inlined) // 1024} KB)")

        # the artifact cannot link out to a published sibling file (claude.ai refuses to
        # serve it as a top-level document), so it fetches the document's body instead and
        # renders it inside its own page, where the reading settings can reach it
        m = WRAP.search(html)
        if m:
            body = OUT / (page.stem + ".body.html")
            body.write_text(m.group(1), encoding="utf-8")
            print(f"     body for artifact -> dist/{body.name}  ({len(m.group(1)) // 1024} KB)")
        else:
            print(f"  !  {page.name}: could not isolate .wrap for the artifact body")

    print(f"\n{len(pages)} document(s) built into {OUT}")
    build_print_sources(pages)
    if "--pdf" in sys.argv:
        render_pdfs(pages)
    else:
        print("  (pass --pdf to re-render the PDFs with headless Chrome)")
    # last, so the preview picks up a PDF rendered in this same run
    build_preview()
    return 0


# A closed <details> is hidden by the browser in a way CSS cannot override, so a PDF rendered
# from the ordinary document silently loses every viva answer and every discrepancy. The page
# carries a beforeprint handler for people printing from a browser, but headless Chrome does
# not reliably fire that, so the PDF is rendered from a variant with every details element
# already open. Readers never see these files.

DETAILS = re.compile(r"<details(?![^>]*\bopen\b)", re.IGNORECASE)


def build_print_sources(pages) -> None:
    pdir = OUT / "print"
    pdir.mkdir(parents=True, exist_ok=True)
    for page in pages:
        html = (OUT / page.name).read_text(encoding="utf-8")
        opened, n = DETAILS.subn("<details open", html)
        (pdir / page.name).write_text(opened, encoding="utf-8")
        print(f"  print source: dist/print/{page.name}  ({n} details opened)")


CHROME_CANDIDATES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
]


def render_pdfs(pages) -> None:
    browser = next((c for c in CHROME_CANDIDATES if pathlib.Path(c).exists()), None)
    if not browser:
        print("  !  no Chrome or Edge found; skipping PDF", file=sys.stderr)
        return
    for page in pages:
        src = (OUT / "print" / page.name).resolve()
        dst = (OUT / page.with_suffix(".pdf").name).resolve()
        subprocess.run(
            [browser, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
             f"--print-to-pdf={dst}", src.as_uri()],
            check=False, capture_output=True, timeout=180,
        )
        if dst.exists():
            print(f"  pdf: dist/{dst.name}  ({dst.stat().st_size // 1024} KB)")
        else:
            print(f"  !  PDF not produced for {page.name}", file=sys.stderr)


# The artifact is published from app/case-files.html with the study guide and PDF beside it.
# The artifact viewer wraps a published page in its own skeleton, so to see locally what the
# published page will look like, that skeleton has to be reproduced here. Serve dist/preview/
# over http and the relative links resolve exactly as they do once published.

# The document wrapper for anywhere this page is served as a page in its own right.
#
# It used to be applied to the local preview only, while the copy published to the website got
# none of it. So every local test ran against a page with a correct viewport and the live site
# had no viewport tag at all: phones laid it out at about 980px and shrank it to roughly 38%,
# and every `max-width:640px` rule in the stylesheet was dead. That is the whole of the
# "it looks wrong on iPhone" report.
#
# `viewport-fit=cover` is on so the `env(safe-area-inset-*)` rules already in the stylesheet
# start working on a notched phone; the hub's own padding accounts for the top inset.
def skeleton(title: str = "Surgery Case Files") -> str:
    return (
        '<!doctype html>\n<html lang="en">\n<head>\n'
        '<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
        '<meta name="color-scheme" content="light dark">\n'
        f"<title>{title}</title>\n"
        "<style>:root{color-scheme:light dark}body{margin:0;font:14px system-ui}"
        "img{max-width:100%}[hidden]{display:none!important}</style>\n"
        "</head>\n<body>\n"
    )


TITLE_RE = re.compile(r"<title>(.*?)</title>", re.I | re.S)


def as_document(body_html: str) -> str:
    """Wrap the artifact body in a real document, lifting its <title> into the head."""
    m = TITLE_RE.search(body_html)
    title = m.group(1).strip() if m else "Surgery Case Files"
    if m:
        body_html = body_html[:m.start()] + body_html[m.end():]
    # the claude-only meta means nothing to a browser and is misleading in served HTML
    body_html = re.sub(r'<meta name="claude:[^>]*>\s*', "", body_html, count=1)
    return skeleton(title) + body_html + "\n</body>\n</html>\n"


SKELETON_HEAD = skeleton()

def sidecars() -> dict:
    """published name -> file in dist/, discovered rather than listed.

    This used to name case 01's two files, which meant the local preview 404ed for every other
    case the hub linked. The two naming rules match publish_site.py: the body fragment keeps its
    number prefix, the PDF loses it, because that is the name the hub asks for.
    """
    out = {}
    for body in sorted(OUT.glob("*.body.html")):
        out[body.name] = body.name
    for pdf in sorted(OUT.glob("*.pdf")):
        out[re.sub(r"^\d+-", "", pdf.name)] = pdf.name
    # The reader fetches this for the citation panes. It was not copied before, so a preview
    # directory left over from an earlier run served whatever citations.json was last put
    # there by hand: on 2026-10-20 that was a file from before the 28th-edition rebuild, with
    # 63 citations all in B&L chapter 60. Checking the panes locally read the old build.
    if (OUT / "citations.json").exists():
        out["citations.json"] = "citations.json"
    return out


def build_artifact() -> pathlib.Path | None:
    """Assemble the page that gets published, with the guide's stylesheet and the reader
    module inlined. The artifact cannot link out to its own sibling files, so everything it
    needs to render the guide has to travel in the page itself."""
    src = ROOT / "app" / "case-files.html"
    if not src.exists():
        return None
    html = src.read_text(encoding="utf-8")
    css = (ROOT / "assets" / "study.css").read_text(encoding="utf-8")
    js = (ROOT / "assets" / "reader.js").read_text(encoding="utf-8")
    html = html.replace("/* INJECT:GUIDE_CSS */", css)
    html = html.replace("/* INJECT:READER_JS */", js)
    art = OUT / "artifact"
    art.mkdir(parents=True, exist_ok=True)
    out = art / "case-files.html"
    out.write_text(html, encoding="utf-8")

    # The same page as a standalone document, which is what the website serves. Kept separate
    # so the artifact copy stays a bare fragment for the artifact viewer's own skeleton.
    doc = art / "index.html"
    doc.write_text(as_document(html), encoding="utf-8")

    print(f"  artifact page -> dist/artifact/{out.name}  ({len(html) // 1024} KB)")
    print(f"  served document -> dist/artifact/{doc.name}  (doctype + viewport)")
    return out


def build_preview() -> None:
    app = build_artifact()
    if not app:
        return
    preview = OUT / "preview"
    preview.mkdir(parents=True, exist_ok=True)
    # byte-identical to what the website serves, so a local test means something
    (preview / "index.html").write_bytes((OUT / "artifact" / "index.html").read_bytes())
    missing = []
    for published, built in sidecars().items():
        src = OUT / built
        if src.exists():
            (preview / published).write_bytes(src.read_bytes())
        else:
            missing.append(built)
    print(f"  preview -> dist/preview/  (serve it to check the artifact locally)")
    if missing:
        print(f"  !  missing from dist/: {', '.join(missing)}")
        print("     the PDF is produced with headless Chrome; see README in this folder")


if __name__ == "__main__":
    raise SystemExit(main())
