#!/usr/bin/env python3
"""
Monitor de pasta para processamento automático de procedimentos
extrajudiciais do MPBA.

Uso:
    python monitor.py [--pasta PASTA]

Fluxo:
    1. Aguarda arquivos na pasta `entrada/` (.docx, .pdf, .txt)
    2. Ao detectar novo arquivo, chama o analisador (Claude API)
    3. Salva o .docx gerado em `saida/`
    4. Move o arquivo de entrada para `processados/`
"""
from __future__ import annotations

import argparse
import logging
import shutil
import sys
import time
from pathlib import Path

from watchdog.events import FileSystemEventHandler, FileSystemEvent
from watchdog.observers import Observer

from config import settings
from analyzer import process_file

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[
        logging.StreamHandler(sys.stdout),
    ],
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Extensões suportadas
# ---------------------------------------------------------------------------

SUPPORTED_EXTENSIONS = {".docx", ".pdf", ".txt", ".text"}

# Arquivos que devem ser ignorados
IGNORED_PATTERNS = {".gitkeep", ".DS_Store", "Thumbs.db"}

# Tempo de espera após detecção para garantir que o arquivo foi totalmente copiado
STABILIZE_DELAY_SECONDS = 2.0


# ---------------------------------------------------------------------------
# Handler do watchdog
# ---------------------------------------------------------------------------

class ProcedimentoHandler(FileSystemEventHandler):
    """Detecta novos arquivos e aciona o processamento."""

    def __init__(self, watch_path: Path) -> None:
        super().__init__()
        self.watch_path = watch_path
        self._processing: set[Path] = set()

    def on_created(self, event: FileSystemEvent) -> None:
        if event.is_directory:
            return
        self._handle(Path(event.src_path))

    def on_moved(self, event: FileSystemEvent) -> None:
        """Cobre casos de move/rename para a pasta (ex: download concluído)."""
        if event.is_directory:
            return
        self._handle(Path(event.dest_path))

    def _handle(self, filepath: Path) -> None:
        if filepath.name in IGNORED_PATTERNS:
            return
        if filepath.suffix.lower() not in SUPPORTED_EXTENSIONS:
            logger.debug("Ignorado (extensão não suportada): %s", filepath.name)
            return
        if filepath in self._processing:
            return

        self._processing.add(filepath)
        try:
            _wait_for_stable(filepath)
            if not filepath.exists():
                return
            _process_and_move(filepath)
        finally:
            self._processing.discard(filepath)


def _wait_for_stable(filepath: Path, timeout: float = 30.0) -> None:
    """Aguarda o arquivo parar de crescer (garantia de cópia completa)."""
    previous_size = -1
    elapsed = 0.0
    while elapsed < timeout:
        try:
            current_size = filepath.stat().st_size
        except FileNotFoundError:
            return
        if current_size == previous_size and current_size > 0:
            return
        previous_size = current_size
        time.sleep(STABILIZE_DELAY_SECONDS)
        elapsed += STABILIZE_DELAY_SECONDS


def _process_and_move(filepath: Path) -> None:
    """Processa o arquivo e o move para processados/."""
    logger.info("─" * 60)
    logger.info("Novo arquivo detectado: %s", filepath.name)

    result = process_file(filepath)
    status = result.get("status")

    if status == "sucesso":
        output = result.get("output")
        val = result.get("validation", {})
        logger.info("✓ Documento gerado: %s", Path(output).name if output else "?")
        if val.get("warnings"):
            for w in val["warnings"]:
                logger.warning("  Aviso: %s", w)

    elif status == "nao_viavel":
        logger.info("ℹ Arquivamento não viável: %s", result.get("message", ""))
        logger.info("  Relatório de análise salvo em saida/")

    elif status == "modelo_ausente":
        logger.warning("⚠ %s", result.get("message", ""))
        logger.warning(
            "  Análise salva. Adicione o template .docx na pasta '%s' e reprocesse.",
            settings.pasta_modelos,
        )

    else:
        logger.error("✗ Erro ao processar: %s", result.get("message", "Erro desconhecido"))

    # Move para processados
    dest = settings.pasta_processados / filepath.name
    # Garante nome único caso já exista
    if dest.exists():
        stem = filepath.stem
        suffix = filepath.suffix
        ts = str(int(time.time()))
        dest = settings.pasta_processados / f"{stem}_{ts}{suffix}"
    try:
        shutil.move(str(filepath), dest)
        logger.info("Arquivo movido para processados/: %s", dest.name)
    except Exception as e:
        logger.warning("Não foi possível mover o arquivo para processados: %s", e)

    logger.info("─" * 60)


# ---------------------------------------------------------------------------
# Processamento dos arquivos já existentes na pasta
# ---------------------------------------------------------------------------

def process_existing_files(watch_path: Path) -> None:
    """Processa arquivos que já estão na pasta ao iniciar."""
    existing = [
        f for f in watch_path.iterdir()
        if f.is_file()
        and f.suffix.lower() in SUPPORTED_EXTENSIONS
        and f.name not in IGNORED_PATTERNS
    ]
    if not existing:
        return
    logger.info("Encontrados %d arquivo(s) existente(s) na pasta de entrada.", len(existing))
    for filepath in existing:
        _process_and_move(filepath)


# ---------------------------------------------------------------------------
# Verificação de configuração
# ---------------------------------------------------------------------------

def check_config() -> bool:
    """Verifica e imprime o status da configuração. Retorna True se OK."""
    issues = settings.validate()
    if issues:
        for issue in issues:
            logger.error("CONFIGURAÇÃO: %s", issue)
        return False

    # Verifica modelos
    modelos_encontrados = list(settings.pasta_modelos.glob("*.docx"))
    if not modelos_encontrados:
        logger.warning(
            "Nenhum template .docx encontrado em '%s'.",
            settings.pasta_modelos,
        )
        logger.warning(
            "Adicione os modelos Word do MPBA com os nomes:\n"
            "  - MODELO_-_NF_E_PA_-_ARQUIVAMENTO.docx\n"
            "  - MODELO_-_IC_E_PP_-_ARQUIVAMENTO_-_AUSENCIA_DE_DOLO_-_LAPSO_TEMPORAL_E_RESSARCIMENTO.docx\n"
            "  - MODELO_-_IC_E_PP_-_ARQUIVAMENTO_-_PRESCRICAO_E_RESSARCIMENTO.docx"
        )
    else:
        logger.info(
            "Templates encontrados (%d): %s",
            len(modelos_encontrados),
            ", ".join(m.name for m in modelos_encontrados),
        )

    return True


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Monitor de procedimentos extrajudiciais do MPBA"
    )
    parser.add_argument(
        "--pasta",
        type=Path,
        default=settings.pasta_entrada,
        help=f"Pasta a monitorar (padrão: {settings.pasta_entrada})",
    )
    parser.add_argument(
        "--processar-existentes",
        action="store_true",
        default=True,
        help="Processa arquivos já presentes na pasta ao iniciar (padrão: ativado)",
    )
    args = parser.parse_args()

    watch_path: Path = args.pasta
    watch_path.mkdir(parents=True, exist_ok=True)

    logger.info("=" * 60)
    logger.info("MONITOR DE PROCEDIMENTOS EXTRAJUDICIAIS — MPBA")
    logger.info("Promotor: RUI CÉSAR FARIAS DOS SANTOS JÚNIOR")
    logger.info("=" * 60)

    if not check_config():
        logger.error("Corrija os problemas de configuração antes de iniciar.")
        sys.exit(1)

    logger.info("Monitorando pasta: %s", watch_path.resolve())
    logger.info("Saída:             %s", settings.pasta_saida.resolve())
    logger.info("Templates:         %s", settings.pasta_modelos.resolve())
    logger.info("Modelo Claude:     %s", settings.claude_model)
    logger.info("Pressione Ctrl+C para encerrar.")
    logger.info("")

    # Processa arquivos existentes
    if args.processar_existentes:
        process_existing_files(watch_path)

    # Inicia observador
    event_handler = ProcedimentoHandler(watch_path)
    observer = Observer()
    observer.schedule(event_handler, str(watch_path), recursive=False)
    observer.start()

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        logger.info("Encerrando monitor...")
        observer.stop()

    observer.join()
    logger.info("Monitor encerrado.")


if __name__ == "__main__":
    main()
