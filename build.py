#!/usr/bin/env python3
"""Reconstruye index.html (la pagina completa, en un solo archivo) a partir de
page_head.html, core.js, ui.js y subcircuito.json.

Uso:  python3 build.py [otro_subcircuito.json]
"""
import os, sys

root = os.path.dirname(os.path.abspath(__file__))
data_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(root, "subcircuito.json")
rd = lambda p: open(os.path.join(root, p), encoding="utf-8").read()

head, core, ui = rd("page_head.html"), rd("core.js"), rd("ui.js")
data = open(data_path, encoding="utf-8").read().strip()
assert "</" not in data, "el JSON no debe contener '</'"
k = head.rindex("<script>")
page = head[:k] + '<script type="application/json" id="connData">' + data + "</script>\n" + head[k:] + core + ui
out = os.path.join(root, "index.html")
open(out, "w", encoding="utf-8").write(page)
print(f"Listo: {out} ({len(page) / 1e3:.0f} KB)")
