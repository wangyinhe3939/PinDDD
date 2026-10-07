"""Headless Finder layout for the approved 768 x 466 point artwork."""
from pathlib import Path

app = Path(defines['app']).resolve()
assert app.is_dir() and app.name == 'PinDDD.app'
format = 'UDZO'
compression_level = 9
files = [str(app)]
symlinks = {'Applications': '/Applications'}
background = str(Path(defines['background']).resolve())
window_rect = ((0, 0), (768, 590))
icon_size = 128
text_size = 13
icon_locations = {
    'PinDDD.app': (185, 232),
    'Applications': (579, 232),
    '.background.png': (2000, 2000),
    '.VolumeIcon.icns': (2200, 2000),
}
show_status_bar = False
show_tab_view = False
show_toolbar = False
show_pathbar = False
show_sidebar = False
