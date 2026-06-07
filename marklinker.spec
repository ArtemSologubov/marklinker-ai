# -*- mode: python ; coding: utf-8 -*-
# MarkLinker AI v1.5.1 - PyInstaller Windows build spec
#
# Run from repo root:
#   python -m PyInstaller marklinker.spec --noconfirm

import os
from PyInstaller.utils.hooks import collect_all

block_cipher = None

# Collect all PyMuPDF binaries and data automatically
fitz_datas, fitz_binaries, fitz_hiddenimports = collect_all('pymupdf')

a = Analysis(
    ['backend/app.py'],
    pathex=[os.path.abspath('backend')],  # so 'parser' module resolves
    binaries=fitz_binaries,
    datas=[
        ('frontend',                  'frontend'),          # HTML/CSS/JS
        ('backend/subject_boards.json', 'backend'),         # board config
        *fitz_datas,
    ],
    hiddenimports=[
        'parser',         # backend/parser.py (local module)
        'flask',
        'flask_cors',
        'jinja2',
        'werkzeug',
        'werkzeug.serving',
        'werkzeug.debug',
        'click',
        'bs4',
        'bs4.builder',
        'bs4.builder._htmlparser',
        'soupsieve',
        'fitz',
        *fitz_hiddenimports,
    ],
    hookspath=[],
    runtime_hooks=[],
    excludes=[],
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='MarkLinkerAI',
    debug=False,
    strip=False,
    upx=True,
    console=True,   # keep console visible so errors are easy to diagnose
    icon=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='MarkLinkerAI',
)
