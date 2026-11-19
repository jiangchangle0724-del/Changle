"""The design photos cut out (rembg's isnet-general-use, run here on the processor): <work>/<view>_cut.png
for front and back, the alpha the fitting and the baking use.

usage: python3 cutout.py <photos dir with front.png, back.png> <work dir>"""
import sys
from PIL import Image
from rembg import remove, new_session

photos, work = sys.argv[1], sys.argv[2]
s = new_session('isnet-general-use')
for view in ('front', 'back'):
    remove(Image.open(f'{photos}/{view}.png').convert('RGB'), session=s).save(f'{work}/{view}_cut.png')
    print(view, 'cut out')
