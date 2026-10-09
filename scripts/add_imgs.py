import re,sys,json
add=json.load(open(sys.argv[1]))
p="/app/frontend/src/catalogueGallery.js"; s=open(p).read()
for slug,ids in add.items():
    key=f'"{slug}"' if not re.match(r'^[a-z]+$',slug) else slug
    m=re.search(r'^(\s*'+re.escape(key)+r': \[)(.*?)(\],)$',s,re.M)
    cur=re.findall(r'"(photo-[^"]+)"',m.group(2))
    new=cur+[f"photo-{i}" for i in ids if f"photo-{i}" not in cur]
    s=s[:m.start()]+m.group(1)+", ".join(f'"{x}"' for x in new)+m.group(3)+s[m.end():]
open(p,"w").write(s); print("ok")
