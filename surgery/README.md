# Surgery case files

Study material for MBBS final-year general surgery, built from three books:

| Source | Edition | Used for |
|---|---|---|
| S Das, *A Manual on Clinical Surgery* | 13e (2018) | History and examination, the clinical method |
| Bailey & Love, *Short Practice of Surgery* | 26e | Mechanism, evidence, investigations, management |
| SRB, *Manual of Surgery* | 6e | Exam-oriented classification and named varieties |

Where the books disagree, both positions appear in an amber box with a note saying which to
answer in an exam. Those disagreements are the most useful content here.

## Layout

```
surgery/
├── reference/     source documents, linking ../assets/study.css
├── assets/        the one stylesheet every document shares
├── app/           case-files.html, the published artifact
├── dist/          built output: self-contained HTML, PDF, and preview/
└── sources/       the books split to text per chapter, with page markers
```

`sources/` holds each chapter as plain text with every page marked
`[[ book p.N | pdf p.N ]]`, which is where the exact page citations come from.

## Rebuilding

```bash
python build.py --pdf
```

This does four things:

1. inlines the stylesheet into `dist/*.html`, so each document is one portable file;
2. writes `dist/print/*.html`, a copy with every `<details>` forced open;
3. renders the PDF from that print copy with headless Chrome or Edge;
4. refreshes `dist/preview/`, a local mirror of the published artifact.

Drop `--pdf` to skip step 3 when you are only changing text.

### Why step 2 exists

Viva answers and the discrepancy notes are `<details>` elements, collapsed on screen so the
page reads clean. A browser hides the contents of a closed `<details>` in a way CSS cannot
override, so a PDF rendered from the ordinary document loses every answer. The document
carries a `beforeprint` handler that opens them, which covers printing from a browser, but
headless Chrome does not reliably fire it, hence the pre-opened copy.

In print the discrepancies set as small asterisked footnotes rather than boxes, and the
expand control is hidden.

## Checking it before publishing

Serve the repo and open the preview, which resolves the relative links the same way the
published artifact does:

```bash
python -m http.server 8765
```

Then visit `http://localhost:8765/surgery/dist/preview/index.html`.
