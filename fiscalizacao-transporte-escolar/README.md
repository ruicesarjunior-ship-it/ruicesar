# Fiscalização do Transporte Escolar — aplicativo de campo

Aplicativo web (PWA) para uso pela equipe do Ministério Público e pelos policiais
militares de apoio durante a fiscalização do transporte escolar. Roda no celular,
**funciona sem internet**, registra fotos de cada veículo e gera, ao final, o
relatório com todas as irregularidades apontadas — no mesmo padrão do
*Relatório de Fiscalização nº 01/2026*.

## O que o aplicativo faz

- **Cadastro da fiscalização**: nº do relatório, data, horário, município, local,
  promotoria, promotor(a), órgão de apoio e equipe.
- **Ficha por veículo**: placa (com validação e alerta de placa repetida), tipo,
  marca/modelo, lotação, escolares a bordo, permissionário, rota/escola,
  dados do condutor e do monitor.
- **Registro fotográfico**: fotos pela câmera ou pela galeria, com legenda,
  comprimidas automaticamente no aparelho. Cada veículo fiscalizado fica
  identificado pela placa e pelas suas fotos.
- **Checklist com 35 itens**, agrupados em documentação do condutor, documentação
  do veículo, equipamentos e identificação, conservação e operação. Cada item é
  marcado como **Conforme / Irregular / N/A** e traz a base normativa.
- **Relatório final** com síntese estatística, ranking das irregularidades mais
  frequentes, a relação de todos os veículos abordados (com o texto das
  observações montado automaticamente), conclusão/providências e anexo
  fotográfico. Exportação em **PDF (impressão)**, **.doc (Word, editável)** e
  **CSV (planilha)**.
- **Backup e consolidação da equipe**: cada agente exporta um arquivo `.json` e o
  coordenador importa todos; veículos com a mesma placa são consolidados,
  prevalecendo a versão mais recente.

## Itens fiscalizados

Cobre a documentação exigida para circulação e as condições de transporte:
CNH categoria D, CRLV, curso especializado (CETE), autorização para exercer a
atividade, inspeção semestral de segurança, faixa amarela "ESCOLAR", tacógrafo
(e laudo), cintos de segurança para todos, faróis/sistema de iluminação, exame
psicotécnico, matrícula no DETRAN, placas legíveis, lotação, monitor exigido pelo
Município e demais itens de conservação e segurança.

Os itens ficam em `js/checklist.js` e podem ser alterados livremente — inclusive
para incluir exigências específicas da Prefeitura. Cada item tem:

```js
{
  id: 'faixa_escolar',
  grupo: 'equipamentos',
  titulo: 'Faixa amarela horizontal com o dístico "ESCOLAR"',
  frase: 'ausência de faixa lateral amarela de identificação escolar', // vai ao relatório
  base: 'CTB, art. 136, III',
  gravidade: 'grave',
}
```

> **Observação sobre as citações legais**: as referências aos arts. 136 a 139 do
> CTB foram conferidas item a item. As remissões genéricas aos arts. 230 e 231
> (infrações) devem ter o inciso confirmado antes do encaminhamento oficial —
> basta editar o campo `base` do item correspondente.

## Como colocar no ar para a equipe

O aplicativo é estático (HTML/CSS/JS puros, sem servidor e sem banco externo).

**Opção 1 — GitHub Pages (recomendada, sem custo).** No repositório, vá em
*Settings → Pages → Build and deployment → Source: **Deploy from a branch***,
escolha a branch em que este código está e a pasta `/ (root)`. Em poucos minutos o
aplicativo fica disponível em
`https://<usuário>.github.io/<repositório>/fiscalizacao-transporte-escolar/` —
basta enviar esse endereço à equipe por WhatsApp.

**Opção 2 — qualquer hospedagem estática** (Netlify, Vercel, servidor da
Promotoria): basta publicar o conteúdo desta pasta.

**Opção 3 — teste local**:

```bash
cd fiscalizacao-transporte-escolar
python3 -m http.server 8000
# abra http://localhost:8000 no navegador
```

> É necessário abrir por `http://` ou `https://` — abrir o arquivo direto do
> disco (`file://`) bloqueia os módulos JavaScript e o modo offline.

## Como instalar no celular

1. Abra o endereço no **Chrome** (Android) ou **Safari** (iPhone).
2. Android: menu ⋮ → *Adicionar à tela inicial* / *Instalar aplicativo*.
   iPhone: botão Compartilhar → *Adicionar à Tela de Início*.
3. Depois de aberto uma vez, o aplicativo funciona **sem sinal de internet**.

## Roteiro de uso em campo

1. **Antes de sair**: em *Dados*, preencha número do relatório, data, município,
   local, promotoria e promotor(a). Em *Início*, cada agente escreve seu nome/posto.
2. **Em cada veículo**: *Veículos → Novo* → digite a placa → fotografe a placa, a
   lateral com a faixa, o interior e cada irregularidade → percorra o checklist
   marcando apenas o que estiver irregular → use **✓ Tudo conforme** para fechar
   os itens restantes → *Salvar e próximo veículo*.
3. **Ao final do dia**: cada agente vai em *Backup → Exportar com fotos* e envia o
   arquivo ao coordenador.
4. **No gabinete**: o coordenador importa os arquivos em *Backup*, revisa em
   *Dados* o texto de conclusão (há um modelo pronto no botão
   *Inserir modelo de conclusão*) e emite o relatório em *Relatório*.

## Privacidade e cuidados

- Os dados ficam **somente no aparelho** (IndexedDB). Nada é enviado a servidores.
- Limpar os dados de navegação do celular apaga a fiscalização — **exporte backup
  todo dia**.
- O relatório contém dados pessoais de condutores; trate o arquivo conforme a LGPD
  e as normas de sigilo do Ministério Público.

## Estrutura dos arquivos

```
index.html               tela única do aplicativo
css/estilos.css          interface mobile-first
js/app.js                navegação e telas
js/checklist.js          itens fiscalizados (editável)
js/store.js              modelo de dados e regras (placas, irregularidades, estatísticas)
js/db.js                 armazenamento local (IndexedDB)
js/fotos.js              captura e compressão das imagens
js/relatorio.js          montagem do relatório, CSS de impressão e CSV
js/backup.js             exportação/importação e consolidação da equipe
sw.js                    funcionamento offline
```
