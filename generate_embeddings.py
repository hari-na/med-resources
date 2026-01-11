import json
import os
import numpy as np
from sentence_transformers import SentenceTransformer
import time

# Configuration
INPUT_INDEX = 'pdf_index.json'
OUTPUT_VECTORS = 'vector_index.bin'
OUTPUT_METADATA = 'vector_metadata.json'
MODEL_NAME = 'all-MiniLM-L6-v2'  # 384 dimensions, very fast and compatible with transformers.js

def generate_embeddings():
    print(f"--- AI Semantic Indexing Started ---")
    print(f"Loading model: {MODEL_NAME}...")
    model = SentenceTransformer(MODEL_NAME)
    
    if not os.path.exists(INPUT_INDEX):
        print(f"Error: {INPUT_INDEX} not found. Please run index_pdfs.py first.")
        return

    with open(INPUT_INDEX, 'r', encoding='utf-8') as f:
        pdf_index = json.load(f)

    all_pages_data = []
    texts_to_embed = []

    print("Preparing text for embedding...")
    for filename, book in pdf_index.items():
        for page in book['pages']:
            # Combine book name, subject and page text for better semantic context
            context_text = f"Book: {book['name']}. Subject: {book['subject']}. Content: {page['text']}"
            
            texts_to_embed.append(context_text)
            all_pages_data.append({
                'filename': filename,
                'book': book['name'],
                'subject': book['subject'],
                'icon': book['icon'],
                'page': page['page'],
                # We store a short snippet for display without needing the full index
                'snippet': page['text'][:200] + '...'
            })

    print(f"Generating embeddings for {len(texts_to_embed)} pages. This may take a few minutes...")
    start_time = time.time()
    
    # Generate embeddings
    embeddings = model.encode(texts_to_embed, show_progress_bar=True, convert_to_numpy=True)
    
    # Save vectors as Float32 binary for high-performance loading in browser
    embeddings = embeddings.astype('float32')
    embeddings.tofile(OUTPUT_VECTORS)
    
    # Save metadata
    with open(OUTPUT_METADATA, 'w', encoding='utf-8') as f:
        json.dump(all_pages_data, f, indent=2)

    duration = time.time() - start_time
    print(f"\n[SUCCESS] Semantic Indexing Complete!")
    print(f"  Vectors saved: {OUTPUT_VECTORS} ({os.path.getsize(OUTPUT_VECTORS) / 1024 / 1024:.2f} MB)")
    print(f"  Metadata saved: {OUTPUT_METADATA}")
    print(f"  Total pages: {len(all_pages_data)}")
    print(f"  Time taken: {duration:.2f} seconds")
    print("\nNext step: Update search.html to use Transformers.js and these vectors.")

if __name__ == "__main__":
    generate_embeddings()
