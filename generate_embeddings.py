import json
import os
import numpy as np
from sentence_transformers import SentenceTransformer
import time
import base64

# Configuration
INPUT_INDEX = 'pdf_index.json'
OUTPUT_VECTORS_BIN = 'vector_index.bin'
OUTPUT_VECTORS_JS = 'vector_index.js'
OUTPUT_METADATA_JSON = 'vector_metadata.json'
OUTPUT_METADATA_JS = 'vector_metadata.js'
MODEL_NAME = 'all-MiniLM-L6-v2'

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
            context_text = f"Book: {book['name']}. Subject: {book['subject']}. Content: {page['text']}"
            texts_to_embed.append(context_text)
            all_pages_data.append({
                'filename': filename,
                'book': book['name'],
                'subject': book['subject'],
                'icon': book['icon'],
                'page': page['page'],
                'snippet': page['text'][:200] + '...'
            })

    print(f"Generating embeddings for {len(texts_to_embed)} pages...")
    start_time = time.time()
    
    # Generate embeddings
    embeddings = model.encode(texts_to_embed, show_progress_bar=True, convert_to_numpy=True)
    embeddings = embeddings.astype('float32')
    
    # 1. Save Binary (for standard fetch)
    embeddings.tofile(OUTPUT_VECTORS_BIN)
    
    # 2. Save JS-wrapped Base64 (for local file/CORS bypass)
    # Browsers have limits on script size, but 3.7MB is usually okay.
    # We'll export it as a base64 string that can be decoded to a Float32Array.
    v_base64 = base64.b64encode(embeddings.tobytes()).decode('utf-8')
    with open(OUTPUT_VECTORS_JS, 'w', encoding='utf-8') as f:
        f.write(f"const VECTOR_INDEX_BASE64 = '{v_base64}';")

    # 3. Save Metadata JSON
    with open(OUTPUT_METADATA_JSON, 'w', encoding='utf-8') as f:
        json.dump(all_pages_data, f, indent=2)
        
    # 4. Save Metadata JS
    with open(OUTPUT_METADATA_JS, 'w', encoding='utf-8') as f:
        f.write(f"const VECTOR_METADATA = {json.dumps(all_pages_data)};")

    duration = time.time() - start_time
    print(f"\n[SUCCESS] Semantic Indexing Complete!")
    print(f"  Vectors: {OUTPUT_VECTORS_BIN} & {OUTPUT_VECTORS_JS}")
    print(f"  Metadata: {OUTPUT_METADATA_JSON} & {OUTPUT_METADATA_JS}")
    print(f"  Total pages: {len(all_pages_data)}")
    print(f"  Time taken: {duration:.2f} seconds")

if __name__ == "__main__":
    generate_embeddings()
