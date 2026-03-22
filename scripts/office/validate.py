#!/usr/bin/env python3
"""
Valida se um arquivo .docx é um ZIP válido contendo os arquivos obrigatórios
do formato OOXML (Word 2007+).

Uso:
    python scripts/office/validate.py <arquivo.docx>
"""
import sys
import zipfile
from pathlib import Path


REQUIRED_FILES = [
    "[Content_Types].xml",
    "word/document.xml",
]

IMPORTANT_FILES = [
    "word/styles.xml",
    "word/_rels/document.xml.rels",
]


def validate(docx_path: str | Path) -> dict:
    """
    Valida o .docx e retorna dict com:
        ok: bool
        errors: list[str]
        warnings: list[str]
        info: dict
    """
    docx_path = Path(docx_path)
    errors: list[str] = []
    warnings: list[str] = []
    info: dict = {}

    if not docx_path.exists():
        return {"ok": False, "errors": [f"Arquivo não encontrado: {docx_path}"], "warnings": [], "info": {}}

    # Verifica se é ZIP válido
    if not zipfile.is_zipfile(docx_path):
        return {"ok": False, "errors": ["Arquivo não é um ZIP válido (corrompido?)"], "warnings": [], "info": {}}

    with zipfile.ZipFile(docx_path, "r") as zf:
        names = zf.namelist()
        info["total_files"] = len(names)
        info["size_bytes"] = docx_path.stat().st_size

        for req in REQUIRED_FILES:
            if req not in names:
                errors.append(f"Arquivo obrigatório ausente: {req}")

        for imp in IMPORTANT_FILES:
            if imp not in names:
                warnings.append(f"Arquivo importante ausente: {imp}")

        has_media = any(n.startswith("word/media/") for n in names)
        info["has_media"] = has_media
        if not has_media:
            warnings.append("Nenhum arquivo de mídia encontrado (cabeçalho/brasão pode estar ausente)")

        has_header = any("header" in n for n in names)
        info["has_header"] = has_header
        if not has_header:
            warnings.append("Nenhum header encontrado")

        # Verifica document.xml legível
        if "word/document.xml" in names:
            try:
                content = zf.read("word/document.xml")
                info["document_xml_size"] = len(content)
                if b"<w:document" not in content and b"<w:body" not in content:
                    warnings.append("word/document.xml pode estar mal-formado")
            except Exception as e:
                errors.append(f"Erro ao ler word/document.xml: {e}")

    return {"ok": len(errors) == 0, "errors": errors, "warnings": warnings, "info": info}


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Uso: python validate.py <arquivo.docx>")
        sys.exit(1)

    result = validate(sys.argv[1])

    if result["ok"]:
        print("✓ Arquivo válido")
    else:
        print("✗ Arquivo inválido")

    for err in result["errors"]:
        print(f"  ERRO: {err}")
    for warn in result["warnings"]:
        print(f"  AVISO: {warn}")

    info = result["info"]
    if info:
        print(f"  Arquivos: {info.get('total_files', '?')} | "
              f"Tamanho: {info.get('size_bytes', 0) // 1024} KB | "
              f"Mídia: {'sim' if info.get('has_media') else 'não'} | "
              f"Header: {'sim' if info.get('has_header') else 'não'}")

    sys.exit(0 if result["ok"] else 1)
