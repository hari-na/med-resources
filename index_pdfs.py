"""
PDF Text Extraction and Indexing Script
Extracts text from all PDFs and creates a searchable index
"""

import os
import json
from pypdf import PdfReader
import re

def clean_text(text):
    """Clean and normalize text for better searching"""
    # Remove excessive whitespace
    text = re.sub(r'\s+', ' ', text)
    return text.strip()

def extract_pdf_content(pdf_path, book_name):
    """Extract text from PDF with page numbers"""
    print(f"Processing {book_name}...")
    
    try:
        reader = PdfReader(pdf_path)
        pages_data = []
        
        total_pages = len(reader.pages)
        print(f"  Total pages: {total_pages}")
        
        for page_num, page in enumerate(reader.pages, start=1):
            try:
                text = page.extract_text()
                if text and text.strip():
                    cleaned_text = clean_text(text)
                    pages_data.append({
                        'page': page_num,
                        'text': cleaned_text[:2000]  # Store first 2000 chars per page for preview
                    })
                    
                if page_num % 50 == 0:
                    print(f"  Processed {page_num}/{total_pages} pages...")
                    
            except Exception as e:
                print(f"  Error on page {page_num}: {e}")
                continue
        
        print(f"  [OK] Completed: {len(pages_data)} pages extracted")
        return pages_data
        
    except Exception as e:
        print(f"  [ERROR] Failed to process {book_name}: {e}")
        return []

def create_search_index():
    """Create searchable index from all PDFs"""
    
    books = {
        'Sharmila_OBG.pdf': {
            'name': 'Sharmila Clinical OBG',
            'subject': 'Obstetrics & Gynaecology',
            'icon': '🤰'
        },
        'Aruchamy_Pediatrics.pdf': {
            'name': 'Aruchamy Clinical Pediatrics',
            'subject': 'Pediatrics',
            'icon': '👶'
        },
        'Kundu_Medicine.pdf': {
            'name': 'Kundu Clinical Manual',
            'subject': 'General Medicine',
            'icon': '🏥'
        },
        'Baloor_Medicine.pdf': {
            'name': 'Baloor Clinical Manual',
            'subject': 'General Medicine',
            'icon': '🏥'
        },
        'Rajamahendran_Long.pdf': {
            'name': 'Rajamahendran Long Cases',
            'subject': 'General Surgery',
            'icon': '🔪'
        },
        'Rajamahendran_Short.pdf': {
            'name': 'Rajamahendran Short Cases',
            'subject': 'General Surgery',
            'icon': '🔪'
        },
        'Dadapeer_Ophthal.pdf': {
            'name': 'Dadapeer Ophthalmology',
            'subject': 'Ophthalmology',
            'icon': '👁️'
        },
        'Vikas_Sinha_ENT.pdf': {
            'name': 'Vikas Sinha ENT',
            'subject': 'ENT',
            'icon': '👂'
        }
    }
    
    index = {}
    
    for filename, metadata in books.items():
        pdf_path = os.path.join('pdfs', filename)
        
        if not os.path.exists(pdf_path):
            print(f"[WARN] Skipping {filename} - file not found")
            continue
        
        pages = extract_pdf_content(pdf_path, metadata['name'])
        
        if pages:
            index[filename] = {
                **metadata,
                'filename': filename,
                'pages': pages,
                'total_pages': len(pages)
            }
    
    # Save index to JSON
    output_file_json = 'pdf_index.json'
    with open(output_file_json, 'w', encoding='utf-8') as f:
        json.dump(index, f, ensure_ascii=False, indent=2)
    
    # Save index as JS variable for local file compatibility
    output_file_js = 'pdf_index.js'
    with open(output_file_js, 'w', encoding='utf-8') as f:
        f.write('const PDF_INDEX = ' + json.dumps(index, ensure_ascii=False) + ';')
    
    print(f"\n[SUCCESS] Index created successfully!")
    print(f"  JSON file: {output_file_json}")
    print(f"  JS file: {output_file_js} (for local usage)")
    print(f"  Total books indexed: {len(index)}")
    print(f"  Total pages indexed: {sum(book['total_pages'] for book in index.values())}")
    
    return index

if __name__ == '__main__':
    print("=" * 60)
    print("PDF INDEXING FOR MEDICAL EXAM RESOURCES")
    print("=" * 60)
    print()
    
    create_search_index()
    
    print()
    print("=" * 60)
    print("Indexing complete! You can now search across all textbooks.")
    print("=" * 60)
