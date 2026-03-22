"""
Editor de templates .docx para promoções de arquivamento do MPBA.

Estratégia em duas camadas:
  1. Variáveis nomeadas #{var}: substituição direta no XML do ZIP (string replace),
     pois o texto pode estar fragmentado em vários <w:r> no Word.
  2. Zonas vermelhas e remoção de blocos: python-docx, que preserva corretamente
     cabeçalhos, rodapés, imagens e toda a formatação do template.

REGRA ABSOLUTA: nunca toca em header1.xml, footer1.xml, media/, _rels/, etc.
"""
from __future__ import annotations

import re
import shutil
import zipfile
from pathlib import Path
from typing import Any

from docx import Document
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
from lxml import etree

# ---------------------------------------------------------------------------
# Constantes
# ---------------------------------------------------------------------------

XML_SPACE = "{http://www.w3.org/XML/1998/namespace}space"
W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"

BLOCK_MARKER_RE = re.compile(
    r"\[(HIPÓTESE|HIPOTESE|OU\s*[–\-]|OMITIR)", re.IGNORECASE
)

INSTRUCTION_ONLY_RE = re.compile(
    r"^\s*\[[^\]]*\]\s*$", re.IGNORECASE
)

# ---------------------------------------------------------------------------
# Extração de zonas vermelhas (lxml — somente leitura)
# ---------------------------------------------------------------------------

def _w(tag: str) -> str:
    return f"{{{W}}}{tag}"


def _is_red_elem(run_elem: etree._Element) -> bool:
    rpr = run_elem.find(_w("rPr"))
    if rpr is None:
        return False
    color = rpr.find(_w("color"))
    if color is None:
        return False
    val = color.get(_w("val"), color.get("val", ""))
    return val.upper() == "FF0000"


def extract_red_zones(doc_xml_path: str | Path) -> list[dict]:
    """
    Extrai zonas de texto vermelho do document.xml.
    Retorna lista de dicts com zone_id, para_index, red_text, context_before,
    context_after, is_full_para.
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
        before: list[str] = []
        red: list[str] = []
        after: list[str] = []
        seen_red = False

        def _collect(parent: etree._Element) -> None:
            nonlocal seen_red
            for child in parent:
                if child.tag == _w("r"):
                    t = child.find(_w("t"))
                    text = (t.text or "") if t is not None else ""
                    if _is_red_elem(child):
                        red.append(text)
                        seen_red = True
                    elif not seen_red:
                        before.append(text)
                    else:
                        after.append(text)
                elif child.tag == _w("hyperlink"):
                    _collect(child)

        _collect(para)

        red_text = "".join(red).strip()
        if not red_text:
            continue

        ctx_before = "".join(before).strip()
        ctx_after = "".join(after).strip()

        zones.append(
            {
                "zone_id": zone_id,
                "para_index": para_idx,
                "red_text": red_text,
                "context_before": ctx_before,
                "context_after": ctx_after,
                "is_full_para": not bool(ctx_before) and not bool(ctx_after),
            }
        )
        zone_id += 1

    return zones


# ---------------------------------------------------------------------------
# Substituição de variáveis nomeadas — diretamente no ZIP (string replace)
# ---------------------------------------------------------------------------

def _escape_xml(text: str) -> str:
    return (
        text.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;")
    )


def apply_named_vars_to_zip(
    docx_path: str | Path,
    variables: dict[str, str],
) -> None:
    """
    Substitui #{variavel} e literais extras em TODOS os XML do ZIP.
    Opera diretamente nos bytes — não usa lxml — preservando namespaces intactos.
    Isso cobre cabeçalhos, rodapés e qualquer outra parte do documento.
    """
    docx_path = Path(docx_path)
    tmp_path = docx_path.with_suffix(".tmp.docx")

    with zipfile.ZipFile(docx_path, "r") as zin, \
         zipfile.ZipFile(tmp_path, "w", zipfile.ZIP_DEFLATED) as zout:

        for item in zin.infolist():
            data = zin.read(item.filename)

            if item.filename.endswith(".xml") or item.filename.endswith(".rels"):
                try:
                    text = data.decode("utf-8")
                    for var_name, value in variables.items():
                        escaped = _escape_xml(value)
                        text = text.replace(f"#{{{var_name}}}", escaped)
                        text = text.replace(f"#{var_name}", escaped)
                    data = text.encode("utf-8")
                except UnicodeDecodeError:
                    pass  # arquivo binário, não toca

            zout.writestr(item, data)

    shutil.move(str(tmp_path), str(docx_path))


# ---------------------------------------------------------------------------
# Manipulação via python-docx
# ---------------------------------------------------------------------------

def _is_red_run(run) -> bool:  # run = python-docx Run
    rpr = run._element.find(qn("w:rPr"))
    if rpr is None:
        return False
    color = rpr.find(qn("w:color"))
    if color is None:
        return False
    val = color.get(qn("w:val"), "")
    return val.upper() == "FF0000"


def _make_run_black(run) -> None:
    rpr = run._element.find(qn("w:rPr"))
    if rpr is not None:
        color = rpr.find(qn("w:color"))
        if color is not None and color.get(qn("w:val"), "").upper() == "FF0000":
            rpr.remove(color)


def _set_run_text(run, text: str) -> None:
    t_elem = run._element.find(qn("w:t"))
    if t_elem is None:
        t_elem = OxmlElement("w:t")
        run._element.append(t_elem)
    t_elem.text = text
    if text and (text.startswith(" ") or text.endswith(" ")):
        t_elem.set(XML_SPACE, "preserve")
    else:
        t_elem.attrib.pop(XML_SPACE, None)


def _get_all_paragraphs(doc: Document) -> list:
    """Retorna todos os parágrafos do corpo (não inclui header/footer)."""
    paras = list(doc.paragraphs)
    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                paras.extend(cell.paragraphs)
    return paras


def _get_para_text(para) -> str:
    return "".join(r.text or "" for r in para.runs)


def _para_is_block_marker(text: str) -> bool:
    return bool(BLOCK_MARKER_RE.search(text))


def _para_is_instruction_only(text: str) -> bool:
    return bool(INSTRUCTION_ONLY_RE.match(text.strip())) and text.strip() != ""


def _process_red_runs(para, red_text_map: dict[str, str]) -> None:
    """Substitui texto vermelho no parágrafo pelo conteúdo do caso."""
    red_runs = [r for r in para.runs if _is_red_run(r)]
    if not red_runs:
        return

    red_text = "".join(r.text or "" for r in red_runs).strip()
    replacement = red_text_map.get(red_text)

    if replacement is None:
        # Tenta correspondência parcial (para textos levemente diferentes)
        for key, val in red_text_map.items():
            if key and red_text and (key in red_text or red_text in key):
                replacement = val
                break

    if replacement is None:
        # Sem correspondência: apenas torna preto
        for run in red_runs:
            _make_run_black(run)
        return

    # Divide replacement em parágrafos (\\n\\n)
    paragraphs = [p.strip() for p in replacement.split("\n\n") if p.strip()]
    if not paragraphs:
        paragraphs = [replacement]

    # Substitui primeiro run vermelho com o primeiro parágrafo
    _set_run_text(red_runs[0], paragraphs[0])
    _make_run_black(red_runs[0])

    # Remove os demais runs vermelhos
    for run in red_runs[1:]:
        run._element.getparent().remove(run._element)

    # Insere parágrafos adicionais após este
    if len(paragraphs) > 1:
        parent = para._element.getparent()
        insert_idx = list(parent).index(para._element) + 1
        for i, extra_text in enumerate(paragraphs[1:]):
            from copy import deepcopy
            new_para_elem = deepcopy(para._element)
            # Limpa runs do novo parágrafo e adiciona o texto
            for r in new_para_elem.findall(f".//{qn('w:r')}"):
                new_para_elem.remove(r) if r.getparent() is new_para_elem else None
            # Cria run simples com o texto extra
            new_run = OxmlElement("w:r")
            # Copia rPr do run original (sem a cor)
            orig_rpr = red_runs[0]._element.find(qn("w:rPr"))
            if orig_rpr is not None:
                from copy import deepcopy as dc
                new_rpr = dc(orig_rpr)
                c = new_rpr.find(qn("w:color"))
                if c is not None:
                    new_rpr.remove(c)
                new_run.append(new_rpr)
            new_t = OxmlElement("w:t")
            new_t.text = extra_text
            new_run.append(new_t)
            new_para_elem.append(new_run)
            parent.insert(insert_idx + i, new_para_elem)


def _remove_paragraphs(paras_to_remove: list) -> None:
    for elem in paras_to_remove:
        parent = elem.getparent()
        if parent is not None:
            try:
                parent.remove(elem)
            except ValueError:
                pass


def process_document_with_docx(
    docx_path: str | Path,
    red_text_map: dict[str, str],
    keep_hypothesis_markers: list[str],
) -> None:
    """
    Abre o .docx com python-docx, processa parágrafos e salva no mesmo path.
    Preserva cabeçalho, rodapé, brasão e toda a estrutura do template.
    """
    doc = Document(str(docx_path))
    paras = _get_all_paragraphs(doc)

    # Identifica blocos de hipóteses (parágrafos marcadores e seus blocos)
    # Estratégia: agrupa parágrafos por bloco de hipótese
    marker_indices: list[int] = []
    for i, para in enumerate(paras):
        text = _get_para_text(para)
        if _para_is_block_marker(text):
            marker_indices.append(i)

    # Determina quais parágrafos remover por hipótese
    to_remove_indices: set[int] = set()
    if marker_indices:
        for j, start in enumerate(marker_indices):
            end = marker_indices[j + 1] if j + 1 < len(marker_indices) else len(paras)
            marker_text = _get_para_text(paras[start])
            should_keep = bool(keep_hypothesis_markers) and any(
                k.lower() in marker_text.lower() for k in keep_hypothesis_markers
            )
            if not should_keep:
                for idx in range(start, end):
                    to_remove_indices.add(idx)

    # Processa parágrafos
    paras_to_remove: list = []
    for i, para in enumerate(paras):
        if i in to_remove_indices:
            paras_to_remove.append(para._element)
            continue

        text = _get_para_text(para).strip()

        # Remove instruções internas entre colchetes
        if _para_is_instruction_only(text):
            paras_to_remove.append(para._element)
            continue

        # Substitui zonas vermelhas
        _process_red_runs(para, red_text_map)

    _remove_paragraphs(paras_to_remove)
    doc.save(str(docx_path))


# ---------------------------------------------------------------------------
# Pipeline completo
# ---------------------------------------------------------------------------

def apply_analysis_to_template(
    template_docx: str | Path,
    output_docx: str | Path,
    analysis: dict[str, Any],
) -> Path:
    """
    Gera o documento final a partir do template.

    analysis deve conter:
        zone_replacements          : dict[int, str]
        named_vars                 : dict[str, str]
        extra_named_replacements   : dict[str, str]
        keep_hypothesis_markers    : list[str]
        _zones                     : list[dict]
    """
    template_docx = Path(template_docx)
    output_docx = Path(output_docx)
    output_docx.parent.mkdir(parents=True, exist_ok=True)

    # Copia o template para o destino
    shutil.copy(template_docx, output_docx)

    # Passo 1 — substitui variáveis nomeadas diretamente no ZIP
    named_vars = {
        **(analysis.get("named_vars") or {}),
        **(analysis.get("extra_named_replacements") or {}),
    }
    if named_vars:
        apply_named_vars_to_zip(output_docx, named_vars)

    # Passo 2 — monta mapa de texto vermelho → substituição
    zones = analysis.get("_zones") or []
    zone_replacements = analysis.get("zone_replacements") or {}
    red_text_map: dict[str, str] = {}
    for zone in zones:
        zid = zone["zone_id"]
        if zid in zone_replacements:
            red_text_map[zone["red_text"]] = zone_replacements[zid]

    # Também inclui conteúdo direto da análise como fallback
    conteudo = analysis.get("conteudo") or {}
    content_fields = [
        "paragrafo_objeto", "paragrafo_narrativa", "paragrafo_transicao",
        "paragrafo_aplicacao", "paragrafo_prescricao", "paragrafo_ressarcimento",
    ]
    for zone in zones:
        zid = zone["zone_id"]
        if zid not in zone_replacements:
            ctx = (zone["context_before"] + " " + zone["context_after"]).lower()
            for field in content_fields:
                keywords = {
                    "paragrafo_objeto": ["objeto", "portaria", "instaurado"],
                    "paragrafo_narrativa": ["diligências", "fatos", "relatório", "notícia"],
                    "paragrafo_transicao": ["perspectiva", "viabilizar", "verificar"],
                    "paragrafo_aplicacao": ["concreto", "anos", "lapso", "presente"],
                    "paragrafo_prescricao": ["prescrição", "prescricional"],
                    "paragrafo_ressarcimento": ["ressarcimento", "erário", "dano"],
                }
                if any(k in ctx for k in keywords.get(field, [])):
                    val = conteudo.get(field)
                    if val:
                        red_text_map[zone["red_text"]] = val
                        break

    # Passo 3 — processa com python-docx (preserva header/footer/brasão)
    keep_markers = analysis.get("keep_hypothesis_markers") or []
    process_document_with_docx(output_docx, red_text_map, keep_markers)

    return output_docx
