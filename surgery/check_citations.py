"""Verify every citation chip's page actually lies inside the chapter it names.

build_citations.py keys resolved pages as "<book>-<page>" with no chapter, so a chip
naming the wrong chapter silently reuses another chapter's page of the same number and
is reported as resolved. This checks chapter ranges independently.
"""
import re,sys,io,glob,os
sys.stdout=io.TextIOWrapper(sys.stdout.buffer,encoding='utf-8',errors='replace')
HERE=os.path.dirname(os.path.abspath(__file__))
DIRS={'das':'sdas','bl':'bailey','srb':'srb'}
ranges={}
for book,d in DIRS.items():
    for p in glob.glob(os.path.join('sources',d,'*.txt')):
        m=re.match(r'(\d+)',os.path.basename(p))
        if not m: continue
        nums=[int(x) for x in re.findall(r'\[\[ book p\.(\d+)',open(p,encoding='utf-8',errors='replace').read())]
        if nums: ranges[(book,int(m.group(1)))]=(min(nums),max(nums),set(nums))
# ---------------------------------------------------------------------------
# Tag balance
# ---------------------------------------------------------------------------
# An unclosed </cite> silently swallows the following prose into a citation chip,
# which then fails to resolve with a nonsense key. Cheap to catch here.

TAGS = ('div','dl','dt','dd','details','summary','span','table','tr','td','th',
        'cite','b','i','tbody','thead','footer','header','p')


def check_tags():
    bad = 0
    for g in sorted(glob.glob('reference/*.html')):
        probs = []
        html = open(g, encoding='utf-8').read()
        for t in TAGS:
            o = len(re.findall(r'<' + t + r'[ >]', html))
            c = len(re.findall(r'</' + t + r'>', html))
            if o != c and t != 'p':   # <p> is legitimately left unclosed in places
                probs.append(f'{t}: {o} open vs {c} close')
        if probs:
            bad += len(probs)
            print(f'  ! {os.path.basename(g)}: ' + '; '.join(probs))
    print(f'tag imbalances: {bad}')
    return bad


CITE=re.compile(r'<cite\s+class="src\s+([a-z]+)"\s*>(.*?)</cite>',re.S)
bad=0
for g in sorted(glob.glob('reference/*.html')):
    html=open(g,encoding='utf-8').read()
    for book,inner in CITE.findall(html):
        txt=re.sub(r'\s+',' ',re.sub(r'<[^>]+>','',inner)).replace('&middot;','.').replace('&ndash;','-').replace('&amp;','&')
        nums=[int(x) for x in re.findall(r'\d+',txt)]
        if len(nums)<2: continue
        ch,pages=nums[0],nums[1:]
        # a trailing "ch.N p.M" segment switches chapter; handle the simple two-chapter form
        segs=txt.split(';')
        pairs=[]
        cur=ch
        for i,s in enumerate(segs):
            o=re.search(r'ch\.\s*(\d+)',s)
            if o: cur=int(o.group(1))
            elif i==0: cur=ch
            for a,b in re.findall(r'p\.\s*(\d+)\s*(?:-\s*(\d+))?',s):
                for pg in range(int(a),int(b or a)+1): pairs.append((cur,pg))
        r=None
        for chap,pg in pairs:
            r=ranges.get((book,chap))
            if r is None:
                print(f'  ! {os.path.basename(g)}: {book} ch.{chap} has no source file  [{txt}]'); bad+=1; continue
            if pg not in r[2]:
                print(f'  ! {os.path.basename(g)}: {book} ch.{chap} p.{pg} outside chapter range {r[0]}-{r[1]}  [{txt}]'); bad+=1
print(f'\nchapter/page mismatches: {bad}')
print()
check_tags()
