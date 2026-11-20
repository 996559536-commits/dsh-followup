"""Fetch the named official registry sources; do not execute downloaded code."""
import concurrent.futures, json, pathlib, urllib.request, time

root = pathlib.Path(__file__).resolve().parents[1]
names = ['button', 'input', 'textarea', 'badge', 'tabs', 'sheet', 'select', 'checkbox', 'table', 'popover', 'calendar', 'label']

def fetch(name):
    url = f'https://ui.shadcn.com/r/styles/new-york/{name}.json'
    cached = root / 'vendor/shadcn' / f'{name}.json'
    if cached.exists(): return name, json.loads(cached.read_text())
    for attempt in range(4):
        try:
            opener = urllib.request.build_opener(urllib.request.ProxyHandler({})) if attempt % 2 == 0 else urllib.request.build_opener()
            with opener.open(url, timeout=30) as response:
                return name, json.load(response)
        except Exception:
            if attempt == 3: raise
            time.sleep(1)

deps = set()
for name, value in concurrent.futures.ThreadPoolExecutor(max_workers=4).map(fetch, names):
    folder = root / 'vendor/shadcn'
    folder.mkdir(parents=True, exist_ok=True)
    (folder / f'{name}.json').write_text(json.dumps(value, ensure_ascii=False, indent=2))
    deps.update(value.get('dependencies', []))
    for file in value['files']:
        target = root / 'src/client/components/ui' / pathlib.Path(file['path']).name
        target.parent.mkdir(parents=True, exist_ok=True)
        source = file['content'].replace('@/lib/utils', '../../utils').replace('@/components/ui/', './')
        target.write_text(f'// Source: https://ui.shadcn.com/r/styles/new-york/{name}.json (MIT)\n' + source)
    print(name, 'imported')
print('REGISTRY DEPENDENCIES', sorted(deps))
