"""Check local artifact structure without controlling a browser."""
from html.parser import HTMLParser
from pathlib import Path
import re

class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = []
        self.assets = []
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if 'id' in attrs:
            self.ids.append(attrs['id'])
        for key in ('src', 'href'):
            val = attrs.get(key, '')
            if val.startswith('./') and val != './':
                self.assets.append(val)

root = Path(__file__).parent / 'dist'
parser = Page()
parser.feed((root / 'index.html').read_text(encoding='utf-8'))
assert len(parser.ids) == len(set(parser.ids)), 'Duplicate HTML IDs'
for asset in parser.assets:
    assert (root / asset[2:]).is_file(), asset
source = (root / 'app.mjs').read_text(encoding='utf-8')
for element in re.findall(r"\$\('([^']+)'\)", source):
    assert element in parser.ids, element
for state in ['empty', 'loading', 'error', 'result']:
    assert state + '-state' in parser.ids
assert (root / 'example.json').is_file()
print('HTML IDs, state panels, local assets and script references passed. Browser interaction not tested.')
