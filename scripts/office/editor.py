"""
Editor de templates .docx para promoções de arquivamento do MPBA.

Operações suportadas:
  - Substituir texto vermelho (w:color FF0000) pelo conteúdo do caso
  - Remover blocos de hipóteses não aplicáveis (marcadores [HIPÓTESE...])
  - Remover instruções internas entre colchetes
  - Substituir variáveis nomeadas #{variavel}
  - Tratar blocos condicionais (ressarcimento, reforço lapso)

REGRA ABSOLUTA: só edita word/document.xml — nunca toca em outros arquivos.
"""
from __future__ import annotations

import copy
import re
import shutil
import tempfile
from pathlib import Path
from typing import Any

from lxml import etree

from scripts.office.unpack import unpack
from scripts.office.pack import pack

# ---------------------------------------------------------------------------
# Namespace Word
# ---------------------------------------------------------------------------
W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
XML_SPACE = "{http://www.w3.org/XML/1998/namespace}space"


def _w(tag: str) -> str:
    return f"{{{W}}}{tag}"


# ---------------------------------------------------------------------------
# Helpers de leitura
# ---------------------------------------------------------------------------

def _get_run_text(run: etree._Element) -> str:
    t = run.find(_w("t"))
    return (t.text or "") if t is not None else ""


def _is_red_run(run: etree._Element) -> bool:
    rpr = run.find(_w("rPr"))
    if rpr is None:
        return False
    color = rpr.find(_w("color"))
    if color is None:
        return False
    val = color.get(_w("val"), color.get("val", ""))
    return val.upper() == "FF0000"


def _get_para_full_text(para: etree._Element) -> str:
    """Texto completo do parágrafo (todos os runs)."""
    parts = []
    for run in para.iter(_w("r")):
        t = run.find(_w("t"))
        if t is not None and t.text:
            parts.append(t.text)
    return "".join(parts)


def _get_para_red_text(para: etree._Element) -> str:
    """Apenas o texto dos runs vermelhos do parágrafo."""
    parts = []
    for run in para.iter(_w("r")):
        if _is_red_run(run):
            t = run.find(_w("t"))
            if t is not None and t.text:
                parts.append(t.text)
    return "".join(parts)


def _para_has_red(para: etree._Element) -> bool:
    for run in para.iter(_w("r")):
        if _is_red_run(run):
            t = run.find(_w("t"))
            if t is not None and t.text and t.text.strip():
                return True
    return False


# ---------------------------------------------------------------------------
# Extração de zonas vermelhas
# ---------------------------------------------------------------------------

def extract_red_zones(doc_xml_path: str | Path) -> list[dict]:
    """
    Retorna lista de zonas com texto vermelho no template.
    Cada zona:
        zone_id       : int  (índice sequencial)
        para_index    : int  (índice do parágrafo no body)
        red_text      : str  (texto vermelho concatenado)
        context_before: str  (texto preto antes do vermelho, mesmo parágrafo)
        context_after : str  (texto preto depois do vermelho, mesmo parágrafo)
        is_full_para  : bool (parágrafo inteiramente vermelho)
    """
    tree = etree.parse(str(doc_xml_path))
    root = tree.getroot()
    body = root.find(_w("body"))
    if body is None:
        return []

    zones: list[dict] = []
    zone_id = 0

    para_children = [c for c in body if c.tag == _w("p")]

    for para_idx, para in enumerate(para_children):
        before_parts: list[str] = []
        red_parts: list[str] = []
        after_parts: list[str] = []
        seen_red = False

        for run in para:  # apenas filhos diretos (não itera hyperlinks profundo)
            if run.tag == _w("r"):
                text = _get_run_text(run)
                if _is_red_run(run):
                    red_parts.append(text)
                    seen_red = True
                elif not seen_red:
                    before_parts.append(text)
                else:
                    after_parts.append(text)
            elif run.tag == _w("hyperlink"):
                # trata runs dentro de hyperlinks
                for inner_run in run:
                    if inner_run.tag != _w("r"):
                        continue
                    text = _get_run_text(inner_run)
                    if _is_red_run(inner_run):
                        red_parts.append(text)
                        seen_red = True
                    elif not seen_red:
                        before_parts.append(text)
                    else:
                        after_parts.append(text)

        red_text = "".join(red_parts).strip()
        if not red_text:
            continue

        ctx_before = "".join(before_parts).strip()
        ctx_after = "".join(after_parts).strip()
        is_full = not bool(ctx_before) and not bool(ctx_after)

        zones.append(
            {
                "zone_id": zone_id,
                "para_index": para_idx,
                "red_text": red_text,
                "context_before": ctx_before,
                "context_after": ctx_after,
                "is_full_para": is_full,
            }
        )
        zone_id += 1

    return zones


# ---------------------------------------------------------------------------
# Aplicação de substituições
# ---------------------------------------------------------------------------

def _replace_red_in_para(para: etree._Element, new_text: str) -> None:
    """
    Substitui todo o texto vermelho do parágrafo por new_text.
    Preserva o primeiro run vermelho (sem a cor) e remove os demais.
    """
    red_runs: list[tuple[etree._Element, etree._Element]] = []  # (parent, run)

    def collect(parent: etree._Element) -> None:
        for child in list(parent):
            if child.tag == _w("r") and _is_red_run(child):
                red_runs.append((parent, child))
            elif child.tag == _w("hyperlink"):
                collect(child)

    collect(para)

    if not red_runs:
        return

    # Primeiro run vermelho → recebe o novo texto
    first_parent, first_run = red_runs[0]
    t = first_run.find(_w("t"))
    if t is None:
        t = etree.SubElement(first_run, _w("t"))
    t.text = new_text
    if new_text and (new_text.startswith(" ") or new_text.endswith(" ")):
        t.set(XML_SPACE, "preserve")
    else:
        t.attrib.pop(XML_SPACE, None)

    # Remove a cor vermelha do rPr
    rpr = first_run.find(_w("rPr"))
    if rpr is not None:
        color = rpr.find(_w("color"))
        if color is not None:
            rpr.remove(color)

    # Remove os demais runs vermelhos
    for parent, run in red_runs[1:]:
        try:
            parent.remove(run)
        except ValueError:
            pass


def _insert_paragraphs_after(
    body: etree._Element,
    ref_para: etree._Element,
    texts: list[str],
) -> None:
    """
    Insere novos parágrafos após ref_para, copiando seu estilo (pPr).
    Cada texto em texts vira um parágrafo novo.
    """
    insert_idx = list(body).index(ref_para) + 1
    for i, text in enumerate(texts):
        new_para = etree.Element(_w("p"))
        # Copia pPr do parágrafo original
        orig_ppr = ref_para.find(_w("pPr"))
        if orig_ppr is not None:
            new_para.append(copy.deepcopy(orig_ppr))
        # Copia rPr do primeiro run vermelho original (sem a cor)
        orig_rpr = None
        for run in ref_para.iter(_w("r")):
            if _is_red_run(run):
                orig_rpr = run.find(_w("rPr"))
                break
        new_run = etree.SubElement(new_para, _w("r"))
        if orig_rpr is not None:
            new_rpr = copy.deepcopy(orig_rpr)
            color = new_rpr.find(_w("color"))
            if color is not None:
                new_rpr.remove(color)
            new_run.append(new_rpr)
        new_t = etree.SubElement(new_run, _w("t"))
        new_t.text = text
        if text and (text.startswith(" ") or text.endswith(" ")):
            new_t.set(XML_SPACE, "preserve")
        body.insert(insert_idx + i, new_para)


def apply_zone_replacements(
    doc_xml_path: str | Path,
    zones: list[dict],
    replacements: dict[int, str],
    output_path: str | Path,
) -> None:
    """
    Aplica replacements nas zonas.
    replacements: {zone_id: novo_texto}
    Se novo_texto contiver \\n\\n, insere parágrafos adicionais após o original.
    """
    tree = etree.parse(str(doc_xml_path))
    root = tree.getroot()
    body = root.find(_w("body"))
    para_children = [c for c in body if c.tag == _w("p")]

    zone_by_id = {z["zone_id"]: z for z in zones}

    for zone_id, new_text in replacements.items():
        zone = zone_by_id.get(zone_id)
        if zone is None:
            continue
        para_idx = zone["para_index"]
        if para_idx >= len(para_children):
            continue
        para = para_children[para_idx]

        paragraphs = [p.strip() for p in new_text.split("\n\n") if p.strip()]
        if not paragraphs:
            paragraphs = [new_text]

        _replace_red_in_para(para, paragraphs[0])

        if len(paragraphs) > 1:
            _insert_paragraphs_after(body, para, paragraphs[1:])

    _save_xml(tree, output_path)


# ---------------------------------------------------------------------------
# Substituição de variáveis nomeadas #{variavel}
# ---------------------------------------------------------------------------

def replace_named_vars(
    doc_xml_path: str | Path,
    variables: dict[str, str],
    output_path: str | Path,
) -> None:
    """
    Substitui #{variavel} e também nomes literais como MARCO AURÉLIO RUBICK DA SILVA.
    Atua no texto XML como string (mais robusto para placeholders que
    podem estar fragmentados em múltiplos runs).
    """
    xml_bytes = Path(doc_xml_path).read_bytes()
    xml_str = xml_bytes.decode("utf-8")

    for var_name, value in variables.items():
        # Placeholder #{variavel}
        placeholder = f"#{{{var_name}}}"
        xml_str = xml_str.replace(placeholder, value)
        # Também tenta sem chaves: #variavel
        xml_str = xml_str.replace(f"#{var_name}", value)

    Path(output_path).write_bytes(xml_str.encode("utf-8"))


# ---------------------------------------------------------------------------
# Remoção de blocos de hipóteses
# ---------------------------------------------------------------------------

BLOCK_MARKER_PATTERNS = [
    r"\[HIPÓTESE",
    r"\[HIPOTESE",
    r"\[OU\s*[–-]",
    r"\[OU –",
    r"\[OU -",
]


def _para_is_block_marker(para: etree._Element) -> bool:
    text = _get_para_full_text(para)
    for pattern in BLOCK_MARKER_PATTERNS:
        if re.search(pattern, text, re.IGNORECASE):
            return True
    return False


def _para_marker_text(para: etree._Element) -> str:
    return _get_para_full_text(para)


def remove_hypothesis_blocks(
    doc_xml_path: str | Path,
    keep_markers: list[str],
    output_path: str | Path,
) -> None:
    """
    Remove blocos de hipóteses NÃO listados em keep_markers.
    keep_markers: lista de fragmentos de texto que identificam hipóteses a MANTER.
        Ex: ["H4", "AUSÊNCIA DE ELEMENTOS", "notificação prévia"]

    Algoritmo:
        1. Encontra todos os parágrafos marcadores (contêm [HIPÓTESE...] ou [OU –...])
        2. Agrupa parágrafos entre marcadores em blocos
        3. Remove os blocos cujo marcador NÃO está em keep_markers
    """
    tree = etree.parse(str(doc_xml_path))
    root = tree.getroot()
    body = root.find(_w("body"))
    children = list(body)

    # Encontra índices de marcadores
    marker_indices: list[int] = []
    for i, child in enumerate(children):
        if child.tag == _w("p") and _para_is_block_marker(child):
            marker_indices.append(i)

    if not marker_indices:
        _save_xml(tree, output_path)
        return

    # Constrói blocos: (start_idx, end_idx_exclusive, marker_text)
    blocks: list[tuple[int, int, str]] = []
    for j, start in enumerate(marker_indices):
        end = marker_indices[j + 1] if j + 1 < len(marker_indices) else len(children)
        marker_text = _para_marker_text(children[start])
        blocks.append((start, end, marker_text))

    # Determina quais remover
    to_remove: set[int] = set()
    for start, end, marker_text in blocks:
        should_keep = any(
            k.lower() in marker_text.lower() for k in keep_markers
        )
        if not should_keep:
            for idx in range(start, end):
                to_remove.add(idx)

    # Remove (de trás para frente para não invalidar índices)
    for idx in sorted(to_remove, reverse=True):
        try:
            body.remove(children[idx])
        except ValueError:
            pass

    _save_xml(tree, output_path)


# ---------------------------------------------------------------------------
# Remoção de instruções internas entre colchetes
# ---------------------------------------------------------------------------

INSTRUCTION_BRACKET_PATTERN = re.compile(
    r"\[(?:Objeto do Procedimento|TRABALHAR BEM|HIPÓTESE|HIPOTESE|OU\s*[–\-])[^\]]*\]",
    re.IGNORECASE,
)


def remove_instruction_brackets(
    doc_xml_path: str | Path,
    output_path: str | Path,
) -> None:
    """
    Remove parágrafos que contenham APENAS instruções internas entre colchetes
    (ex: [Objeto do Procedimento. Consta da Portaria]).
    Se o parágrafo tiver texto além da instrução, apenas remove o texto da instrução.
    """
    tree = etree.parse(str(doc_xml_path))
    root = tree.getroot()
    body = root.find(_w("body"))
    children = list(body)

    to_remove: list[etree._Element] = []

    for para in children:
        if para.tag != _w("p"):
            continue
        full_text = _get_para_full_text(para)
        if not full_text.strip():
            continue

        stripped = INSTRUCTION_BRACKET_PATTERN.sub("", full_text).strip()
        if not stripped:
            # Parágrafo inteiramente instrução → remove
            to_remove.append(para)

    for para in to_remove:
        try:
            body.remove(para)
        except ValueError:
            pass

    _save_xml(tree, output_path)


# ---------------------------------------------------------------------------
# Pipeline completo de edição do template
# ---------------------------------------------------------------------------

def apply_analysis_to_template(
    template_docx: str | Path,
    output_docx: str | Path,
    analysis: dict[str, Any],
) -> Path:
    """
    Aplica a análise do Claude ao template e gera o documento final.

    analysis deve conter:
        zone_replacements : dict[int, str]   — substituições por zone_id
        named_vars        : dict[str, str]   — variáveis #{nome}
        keep_hypothesis_markers : list[str]  — marcadores de hipóteses a manter
        extra_named_replacements: dict[str, str]  — substituições literais extras
    """
    template_docx = Path(template_docx)
    output_docx = Path(output_docx)

    # Trabalha em diretório temporário
    with tempfile.TemporaryDirectory(prefix="mpba_docx_") as tmp:
        tmp = Path(tmp)
        unpacked = tmp / "unpacked"
        unpack(template_docx, unpacked)

        doc_xml = unpacked / "word" / "document.xml"
        work_xml = unpacked / "word" / "document_work.xml"

        # Passo 1 — substituições de variáveis nomeadas (string replace)
        named_vars = analysis.get("named_vars", {})
        extra = analysis.get("extra_named_replacements", {})
        all_vars = {**named_vars, **extra}
        if all_vars:
            replace_named_vars(doc_xml, all_vars, work_xml)
            shutil.copy(work_xml, doc_xml)

        # Passo 2 — remove blocos de hipóteses não aplicáveis
        keep_markers = analysis.get("keep_hypothesis_markers", [])
        if keep_markers is not None:  # None = não mexe nos blocos
            remove_hypothesis_blocks(doc_xml, keep_markers, work_xml)
            shutil.copy(work_xml, doc_xml)

        # Passo 3 — substitui zonas vermelhas
        zones = analysis.get("_zones", [])
        zone_replacements = analysis.get("zone_replacements", {})
        if zones and zone_replacements:
            apply_zone_replacements(doc_xml, zones, zone_replacements, work_xml)
            shutil.copy(work_xml, doc_xml)

        # Passo 4 — remove instruções internas entre colchetes
        remove_instruction_brackets(doc_xml, work_xml)
        shutil.copy(work_xml, doc_xml)

        # Passo 5 — empacota
        pack(unpacked, output_docx, original_docx=template_docx)

    return output_docx


# ---------------------------------------------------------------------------
# Helper de serialização
# ---------------------------------------------------------------------------

def _save_xml(tree: etree._ElementTree, output_path: str | Path) -> None:
    tree.write(
        str(output_path),
        xml_declaration=True,
        encoding="UTF-8",
        standalone=True,
    )
