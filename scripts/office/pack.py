#!/usr/bin/env python3
"""
Empacota um diretório desempacotado de volta para .docx.

Garante que o arquivo [Content_Types].xml seja o primeiro na ordem do ZIP
(requisito do formato OOXML), usando o original como referência de ordem.

Uso:
    python scripts/office/pack.py <diretorio> <saida.docx> [--original original.docx]
"""
import sys
import zipfile
import argparse
from pathlib import Path


def pack(
    unpacked_dir: str | Path,
    output_path: str | Path,
    original_docx: str | Path | None = None,
) -> Path:
    """
    Empacota unpacked_dir em output_path.

    Se original_docx for fornecido, usa a ordem de arquivos do original
    para garantir compatibilidade máxima (especialmente o Content_Types.xml
    que deve ser o primeiro entry do ZIP).
    """
    unpacked_dir = Path(unpacked_dir)
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Monta lista de arquivos do diretório desempacotado
    all_files = sorted(unpacked_dir.rglob("*"))
    file_paths = [f for f in all_files if f.is_file()]

    # Se tiver original, usa sua ordem como referência
    ordered_arcnames: list[str] = []
    if original_docx and Path(original_docx).exists():
        with zipfile.ZipFile(original_docx, "r") as orig_zf:
            ordered_arcnames = orig_zf.namelist()

    def sort_key(filepath: Path) -> int:
        arcname = str(filepath.relative_to(unpacked_dir))
        # Normaliza separador
        arcname_norm = arcname.replace("\\", "/")
        try:
            return ordered_arcnames.index(arcname_norm)
        except ValueError:
            return len(ordered_arcnames) + 1

    file_paths.sort(key=sort_key)

    with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for filepath in file_paths:
            arcname = str(filepath.relative_to(unpacked_dir)).replace("\\", "/")
            zf.write(filepath, arcname)

    return output_path


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Empacota diretório em .docx")
    parser.add_argument("diretorio", help="Diretório desempacotado")
    parser.add_argument("saida", help="Arquivo .docx de saída")
    parser.add_argument("--original", help="Arquivo .docx original (referência de ordem)")
    args = parser.parse_args()

    result = pack(args.diretorio, args.saida, args.original)
    print(f"Empacotado em: {result}")
