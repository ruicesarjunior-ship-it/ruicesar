#!/usr/bin/env python3
"""
Desempacota um arquivo .docx (ZIP) para um diretório.

Uso:
    python scripts/office/unpack.py <arquivo.docx> <diretorio_saida>
"""
import sys
import shutil
import zipfile
from pathlib import Path


def unpack(docx_path: str | Path, output_dir: str | Path) -> Path:
    """Extrai o .docx para output_dir, sobrescrevendo se já existir."""
    docx_path = Path(docx_path)
    output_dir = Path(output_dir)

    if not docx_path.exists():
        raise FileNotFoundError(f"Arquivo não encontrado: {docx_path}")

    if output_dir.exists():
        shutil.rmtree(output_dir)
    output_dir.mkdir(parents=True)

    with zipfile.ZipFile(docx_path, "r") as zf:
        zf.extractall(output_dir)

    return output_dir


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Uso: python unpack.py <arquivo.docx> <diretorio_saida>")
        sys.exit(1)
    result = unpack(sys.argv[1], sys.argv[2])
    print(f"Desempacotado em: {result}")
