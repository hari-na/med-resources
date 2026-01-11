# Medical Exam Resources - PDF Search

A comprehensive medical exam preparation website with **instant PDF search** across all textbooks.

## 🚀 Features

### 1. **Instant PDF Search**
- Search across **8 medical textbooks** (2000+ pages) in real-time
- Find any topic, case, symptom, or condition instantly
- See exact page numbers and context snippets
- Click to jump directly to the relevant page in the PDF

### 2. **Organized Resources**
- Subject-specific case lists (OBG, Pediatrics, Medicine, Surgery, Ophthalmology, ENT)
- Quick-jump links to photo galleries
- Textbook links for each subject

### 3. **Last-Minute Exam Prep Friendly**
- Clean, intuitive interface
- Quick search suggestions
- Mobile-responsive design
- No login required

## 📚 Included Textbooks

1. **Sharmila Clinical OBG** (682 pages)
2. **Aruchamy Clinical Pediatrics** (1000+ pages)
3. **Kundu Clinical Manual** (Medicine)
4. **Baloor Clinical Manual** (Medicine)
5. **Rajamahendran Long Cases** (Surgery)
6. **Rajamahendran Short Cases** (Surgery)
7. **Dadapeer Ophthalmology**
8. **Vikas Sinha ENT**

## 🔧 Setup

### First Time Setup

1. **Download PDFs** (if not already done):
   ```bash
   python download_pdfs.py
   ```

2. **Index PDFs for Search** (one-time, takes ~5-10 minutes):
   ```bash
   python index_pdfs.py
   ```
   This creates `pdf_index.json` which powers the search feature.

3. **Open the website**:
   - Simply open `index.html` in your browser
   - Or use a local server:
     ```bash
     python -m http.server 8000
     ```
   - Then visit `http://localhost:8000`

## 🔍 How to Use

### Main Page (`index.html`)
- Browse case lists by subject
- View original textbook index photos
- Click textbook links to open PDFs

### Search Page (`search.html`)
- Type any medical term, case, or symptom
- See results instantly with page numbers
- Click "Open PDF" to jump to the exact page
- Use quick search buttons for common topics

## 📁 File Structure

```
swarna-med-exam-help/
├── index.html              # Main resources page
├── search.html             # PDF search page
├── style.css               # Styles
├── script.js               # Interactive features
├── pdfs/                   # All textbook PDFs
│   ├── Sharmila_OBG.pdf
│   ├── Aruchamy_Pediatrics.pdf
│   └── ...
├── pdf_index.json          # Search index (generated)
├── index_pdfs.py           # PDF indexing script
├── download_pdfs.py        # PDF download script
└── resources.md            # Original markdown guide
```

## 🎯 Perfect For

- **Last-minute exam prep** - Find topics quickly
- **Case review** - Search for specific cases across all books
- **Quick reference** - Jump to exact pages instantly
- **Offline study** - All PDFs hosted locally

## 💡 Tips

1. **Search Tips**:
   - Use specific terms: "anemia pregnancy" instead of just "anemia"
   - Try different spellings: "oedema" vs "edema"
   - Use medical terms: "MI" or "myocardial infarction"

2. **For Best Performance**:
   - Keep `pdf_index.json` in the same folder
   - Don't move PDFs after indexing
   - Re-run indexing if you add new PDFs

3. **Mobile Use**:
   - Works great on phones and tablets
   - PDFs open in your device's PDF viewer
   - Search is fully responsive

## 🚀 Deployment

### GitHub Pages
1. Push to GitHub
2. Enable Pages in Settings
3. Done! Your site is live

### Vercel (Recommended)
1. Import repository
2. Framework: "Other"
3. Build Command: (leave empty)
4. Deploy!

## 📝 License

Educational use only. Textbooks belong to their respective authors.

---

**Made with ❤️ for medical students preparing for exams**
