import json

with open('pdf_index.json', encoding='utf-8') as f:
    data = json.load(f)

print(f"Books indexed: {len(data)}")
print(f"Total pages: {sum(len(book['pages']) for book in data.values())}")
print("\nBooks:")
for book in data.values():
    print(f"  - {book['name']} ({len(book['pages'])} pages)")
