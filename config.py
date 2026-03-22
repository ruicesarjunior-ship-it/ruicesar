"""Configurações do sistema carregadas do .env"""
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).parent


class Settings:
    anthropic_api_key: str = os.getenv("ANTHROPIC_API_KEY", "")
    claude_model: str = os.getenv("CLAUDE_MODEL", "claude-opus-4-6")

    pasta_entrada: Path = BASE_DIR / os.getenv("PASTA_ENTRADA", "entrada")
    pasta_saida: Path = BASE_DIR / os.getenv("PASTA_SAIDA", "saida")
    pasta_modelos: Path = BASE_DIR / os.getenv("PASTA_MODELOS", "modelos")
    pasta_processados: Path = BASE_DIR / os.getenv("PASTA_PROCESSADOS", "processados")

    cidade_orgao: str = os.getenv("CIDADE_ORGAO", "Salvador")

    NOMES_MODELOS = {
        "NF_PA": "MODELO_-_NF_E_PA_-_ARQUIVAMENTO.docx",
        "IC_PP_DOLO": (
            "MODELO_-_IC_E_PP_-_ARQUIVAMENTO_-_"
            "AUSENCIA_DE_DOLO_-_LAPSO_TEMPORAL_E_RESSARCIMENTO.docx"
        ),
        "IC_PP_PRESCRICAO": (
            "MODELO_-_IC_E_PP_-_ARQUIVAMENTO_-_"
            "PRESCRICAO_E_RESSARCIMENTO.docx"
        ),
    }

    # Também tenta nomes com acentos (como fornecidos pelo usuário)
    NOMES_MODELOS_ALTERNATIVOS = {
        "NF_PA": "MODELO_-_NF_E_PA_-_ARQUIVAMENTO.docx",
        "IC_PP_DOLO": (
            "MODELO_-_IC_E_PP_-_ARQUIVAMENTO_-_"
            "AUSÊNCIA_DE_DOLO_-_LAPSO_TEMPORAL_E_RESSARCIMENTO.docx"
        ),
        "IC_PP_PRESCRICAO": (
            "MODELO_-_IC_E_PP_-_ARQUIVAMENTO_-_"
            "PRESCRIÇÃO_E_RESSARCIMENTO.docx"
        ),
    }

    def get_template_path(self, modelo_key: str) -> Path | None:
        """Retorna o caminho do template .docx ou None se não encontrado."""
        for names in (self.NOMES_MODELOS, self.NOMES_MODELOS_ALTERNATIVOS):
            nome = names.get(modelo_key)
            if nome:
                path = self.pasta_modelos / nome
                if path.exists():
                    return path
        # Busca fuzzy: qualquer .docx na pasta modelos que contenha palavras-chave
        keywords = {
            "NF_PA": ["NF", "PA", "ARQUIVAMENTO"],
            "IC_PP_DOLO": ["IC", "PP", "DOLO"],
            "IC_PP_PRESCRICAO": ["IC", "PP", "PRESCRI"],
        }
        kws = keywords.get(modelo_key, [])
        for docx in self.pasta_modelos.glob("*.docx"):
            nome_upper = docx.name.upper()
            if all(k in nome_upper for k in kws):
                return docx
        return None

    def validate(self) -> list[str]:
        """Retorna lista de problemas de configuração."""
        issues = []
        if not self.anthropic_api_key:
            issues.append("ANTHROPIC_API_KEY não definida no .env")
        for folder in (
            self.pasta_entrada,
            self.pasta_saida,
            self.pasta_modelos,
            self.pasta_processados,
        ):
            folder.mkdir(parents=True, exist_ok=True)
        return issues


settings = Settings()
