#!/usr/bin/env python3
"""Allege les images du site sans changer leur chemin ni leurs dimensions.

- JPEG : re-encodage progressif qualite 82, metadonnees retirees.
- PNG : metadonnees retirees, recompression maximale.
Le fichier n'est remplace que si la nouvelle version est plus legere.
"""
from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOSSIERS = ["assets", "."]
IGNORES = {".git", "node_modules", "image-search", ".print-build", "carte-a4-pages"}


def fichiers():
    vus = set()
    for base in DOSSIERS:
        for p in (ROOT / base).rglob("*"):
            if not p.is_file() or p.suffix.lower() not in {".jpg", ".jpeg", ".png"}:
                continue
            if IGNORES & set(p.relative_to(ROOT).parts):
                continue
            if p not in vus:
                vus.add(p)
                yield p


def main() -> None:
    avant = apres = 0
    modifies = 0
    for p in sorted(fichiers()):
        taille = p.stat().st_size
        avant += taille
        suffixe = p.suffix.lower()
        with tempfile.NamedTemporaryFile(suffix=suffixe, delete=False) as tmp:
            sortie = Path(tmp.name)
        if suffixe == ".png":
            cmd = ["convert", str(p), "-strip",
                   "-define", "png:compression-level=9",
                   "-define", "png:compression-filter=5",
                   "-define", "png:compression-strategy=1", str(sortie)]
        else:
            cmd = ["convert", str(p), "-strip", "-interlace", "Plane",
                   "-sampling-factor", "4:2:0", "-quality", "82", str(sortie)]
        try:
            subprocess.run(cmd, check=True, capture_output=True)
        except subprocess.CalledProcessError:
            sortie.unlink(missing_ok=True)
            apres += taille
            continue
        neuf = sortie.stat().st_size
        if 0 < neuf < taille * 0.97:
            sortie.replace(p)
            apres += neuf
            modifies += 1
        else:
            sortie.unlink(missing_ok=True)
            apres += taille
    print(f"{modifies} fichiers alleges : {avant/1e6:.1f} Mo -> {apres/1e6:.1f} Mo "
          f"({100*(avant-apres)/max(avant,1):.1f} % de gagne)")


if __name__ == "__main__":
    main()
