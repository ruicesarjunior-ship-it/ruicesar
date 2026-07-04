# MPBA — Expedição Consolidada de Ofícios

App web (100% navegador) para consolidar despachos ministeriais e gerar ofícios,
certidões de expedição, e-mails (.eml) e checklist para as Promotorias de Justiça
de **Prado**, **Nova Viçosa** e **Alcobaça** (MPBA).

Versão funcional do artefato original — agora roda como uma aplicação React real
(Vite), sem depender do runtime de artefatos do Claude.

## O que mudou em relação ao artefato

| Recurso do artefato | Nesta versão |
| --- | --- |
| `window.storage` (runtime de artefato) | `localStorage` do navegador |
| Anthropic sem chave (injeção do runtime) | Chave da API configurável na tela **Config** (chamada direta ao navegador) |
| Casca `.docx` timbrada baixada do Google Drive via MCP | **Timbre oficial embutido** no app (`public/casca.docx`) |
| Salvar no Google Drive via MCP | Removido — entrega via **download ZIP** |
| `import` de JSZip por CDN | Dependência npm |

O ofício e a certidão são gerados **com o timbre oficial do MPBA** (cabeçalho +
imagem preservados do modelo `CASCA_TIMBRADA_MPBA`).

## Como rodar

```bash
cd web
npm install
npm run dev      # abre em http://localhost:5173
```

Para gerar a versão estática (hospedável em qualquer servidor de arquivos):

```bash
npm run build    # saída em web/dist
npm run preview  # serve o build localmente
```

> Observação: precisa ser servido por HTTP (dev server ou hospedagem). Abrir o
> `index.html` direto pelo `file://` não funciona por causa do carregamento do
> modelo `.docx` e dos módulos ES.

## Configuração da IA (opcional)

A extração automática de despachos em PDF usa a API da Anthropic.

1. Clique em **Config** no topo.
2. Cole sua chave `sk-ant-...` e escolha o modelo.
3. A chave fica **apenas no `localStorage` do seu navegador** e é enviada direto
   para `api.anthropic.com` — não passa por nenhum servidor intermediário.

Se preferir não usar IA, desmarque "Usar extração automática por IA": cada
despacho é então preenchido manualmente (número do processo, tipo, teor e
destinatários) pelo botão **Preencher manual** na fila. Mesmo com a IA ligada,
qualquer despacho pode ter seus dados editados/sobrescritos manualmente.

## Formato do ofício

O ofício segue o modelo oficial da Promotoria (Times New Roman 11pt, com timbre):
número no formato `NNN.AAAA`, vocativo + autoridade + órgão + endereço do
destinatário, `Assunto:` e `Referência:`, corpo "de ordem do" Promotor de Justiça,
e assinatura do **servidor** (com cargo) "(assinado eletronicamente)". A data sai
como "data da assinatura eletrônica".

Quando o mesmo destinatário recebe diligências de **vários procedimentos**, elas
são **juntadas em um único ofício** (lista numerada de referências).

## Extração por IA (multi-PDF)

Você pode jogar vários PDFs de uma vez: **despachos isolados, procedimento(s)
inteiro(s), juntos ou separados**. A IA:

- **agrupa por número de procedimento**;
- localiza o **último despacho** de cada procedimento;
- segue remissões do tipo *"reitere-se"* / *"cumpra-se o despacho anterior"* para
  identificar os comandos realmente a cumprir;
- extrai destinatários, assunto sintético, tipo e teor.

PDFs **digitais** têm o texto lido no próprio navegador (sem limite prático de
páginas, mais barato). PDFs **escaneados** (sem texto) caem automaticamente no
modo imagem da IA.

## Fluxo de uso

1. **Configurar** — comarca, servidor responsável (assina "de ordem do" Promotor),
   número inicial do ofício, ano e data da certidão.
2. **Arquivos** — arraste os PDFs (despachos e/ou procedimentos). Opcionalmente
   preencha os dados manualmente em cada um.
3. **Processar** — a IA agrupa por procedimento e extrai os dados; destinatários
   não encontrados no banco vão para uma etapa de revisão (já pré-preenchida).
4. **Resultado** — ofícios consolidados por destinatário, certidões por procedimento,
   e download do **ZIP** com:
   - `1_oficios/` — `.docx` timbrados (um por destinatário, para envio)
     - `1_oficios/por_procedimento/<nº>/` — subpasta por procedimento com cópias
       de **todos os ofícios que o citam + a certidão**, para o servidor juntar
       nos respectivos autos
   - `2_certidoes/` — `.docx` timbrados
   - `3_emails_outlook/` — `.eml` (duplo clique abre no Outlook preenchido)
   - `0_CHECKLIST.txt`

## Dados

- **Banco de destinatários** e **servidores** ficam no `localStorage` e podem ser
  gerenciados pelos botões no topo. Vêm pré-carregados com os dados das três comarcas.

## Recursos de qualidade e produtividade

- **Numeração automática contínua** — o app lembra o último nº de ofício usado por
  comarca/ano e já sugere o próximo na tela de configuração (com botão "Usar NNN").
- **Histórico de expedições** — cada ZIP baixado é registrado (data, comarca,
  servidor, ofícios com nº/destinatário/procedimentos, certidões) e pode ser
  consultado no botão **Histórico**. Alimenta a numeração automática.
- **Conferência antes de gerar** — a tela de resultado destaca pendências: ofícios
  **sem e-mail** (o `.eml` sairia sem destinatário), **sem endereço** e os que
  precisam ser **conferidos** (destinatário preenchido à mão ou por encaminhamento).
- **Confiança do destinatário** — cada ofício mostra se o destinatário veio **do
  banco** (seguro), foi **preenchido manualmente** (conferir) ou é um
  **encaminhamento** via órgão que abarca.
- **Prévia e edição do ofício** — botão **Ver / editar** em cada ofício abre a
  prévia do texto e permite ajustar destinatário, assunto, teor e prazo antes de
  gerar o `.docx`.
- **Aprendizado de destinatários** — quando o servidor corrige/identifica um
  destinatário que a IA não achou, a associação é memorizada e aplicada
  automaticamente nas próximas expedições.
- **Uso estimado da IA** — a tela de configuração mostra a estimativa de tokens de
  entrada consumidos no mês.
- **Funciona offline / instalável (PWA)** — após a primeira visita, o app abre sem
  internet (menos a IA e a sincronização em nuvem) e pode ser "instalado" na tela
  inicial do celular.

## Sincronização em nuvem (Firebase) — segurança

O banco de destinatários sincroniza entre computadores pelo Firebase Realtime
Database (grátis). Aplique a **regra de segurança** para fechar o acesso público
do modo de teste: veja [`FIREBASE-REGRAS.md`](./FIREBASE-REGRAS.md)
(arquivo de regras pronto em `firebase.rules.json`).

## Atualizar o timbre

Para trocar o modelo timbrado, substitua `web/public/casca.docx` por outro `.docx`
que contenha `<w:body>...<w:sectPr` e o estilo de parágrafo `Standard`. O corpo é
substituído programaticamente; cabeçalho/rodapé/timbre são preservados.
