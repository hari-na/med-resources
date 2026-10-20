# Backlog

Things agreed but not built yet, newest first.

---

## Citations that open the source page

**Status:** specified, not started. Depends on the artifact being able to open PDFs at all
(see below).

When Hitha taps a citation chip, `S Das 38 · p.597`, it should take her to that page of that
book, ideally in a new tab, with the sourced lines highlighted.

**Why it is worth building.** The citations currently ask her to trust them, or to go and find
the page herself in a 650-page PDF. If tapping one lands on the page, the study guide stops
being a summary she has to believe and becomes a way into the books. That matters most for the
discrepancies, where she may well want to read both books' wording for herself before deciding
what to say to an examiner.

**What we already have.** Every chapter is split to text under `surgery/sources/<book>/` with
each page marked `[[ book p.N | pdf p.N ]]`, and the book-to-PDF page offsets are known and
verified:

| Book | Offset (pdf page − book page) |
|---|---|
| S Das 13e | +4 |
| Bailey & Love 26e | +17 |
| SRB 6e | +12 |

So a chip reading `Das 38 · p.597` already resolves to PDF page 601 without further work.

**What is unresolved.**

- *Where the PDFs live.* They are 200–425 MB each. Publishing them beside the artifact is not
  realistic. Options: keep them local and open `file:///…#page=N` (works only on the machine
  that holds them); host them somewhere the artifact can reach; or extract just the cited pages
  per case into a small per-case PDF, which would be a few megabytes and could ship with the
  artifact.
- *Highlighting.* `#page=N` is widely supported by PDF viewers; highlighting a specific line is
  not, and no standard URL fragment does it. Realistic approaches: pre-burn a highlight
  rectangle onto the extracted page at build time (PyMuPDF can do this, and we already know the
  text spans), or render the cited page to an image with the lines marked and show that instead
  of a PDF.
- *Which is better for her.* An image of the page with the lines marked may actually beat a PDF, it opens instantly on an iPad, needs no viewer, and can sit in a panel beside the text
  rather than replacing it. Worth deciding before building.

**Decided approach** (user, 19 Oct): no new tab or window. Tapping a citation opens a **pane
in the same page**, beside or over the guide, showing the source page with the quoted lines
highlighted. Keeping the reader in place matters, the point of checking a citation is to
glance at it and carry on reading, and a new tab breaks that.

**Build plan that follows from it.** At build time, for each distinct citation in a case:

1. resolve chip → PDF page using the offsets above;
2. find the quoted span on that page with PyMuPDF's `search_for`, which returns rectangles;
3. draw a highlight annotation over those rectangles;
4. render the page to a PNG or WebP at about 150 dpi into `dist/pages/<book>-<page>.png`;
5. write `dist/pages/index.json` mapping each citation id to its image and the quoted text.

The guide then needs only an `<img>` in a slide-over pane, no PDF viewer, no hosting of
650 MB books, works offline, and the highlight is burned in rather than hoped for. Each page
image should come to roughly 100–200 KB, so a case with 60 citations is a few megabytes,
which can publish beside the artifact.

Two details to settle when building it: several citations land on the same page, so the
images should be deduplicated by page and the highlight drawn per citation (or one image per
citation, which is simpler but larger); and a citation spanning two pages needs either two
images in the pane or a stitched one.

---

## Study guide and PDF do not open from the artifact

**Status:** known broken, reported by the user.

The artifact links to `study-guide.html` and `inguinal-hernia.pdf`, both published beside it.
Neither opens. The likely cause is that the viewer sandbox intercepts only absolute `https://`
links and does not navigate to a relative sibling path.

Two fixes worth trying, in order:

1. Render the study guide as a view **inside** the artifact rather than a link out. Reliable,
   but the guide carries its own stylesheet, so its rules need scoping under a wrapper class to
   avoid colliding with the app's.
2. For the PDF, use the `downloads` capability to hand the file to the viewer, which is a
   supported path and does not depend on navigation. Costs about 830 KB of base64 in the page.

Until this is fixed, both files are delivered locally from `surgery/dist/`.
