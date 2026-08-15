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
- **Registro fotográfico classificado**: o botão usado já define o tipo da foto
  (**documento** ou **veículo**), corrigível em cada imagem. As fotos são
  comprimidas no aparelho e ganham legenda opcional.
- **Checklist em dois modos**:
  - **Rápido** (padrão) — um toque marca a irregularidade. Os 15 itens de maior
    incidência ficam à vista; os demais entram por busca ou pelo expansor. Só o
    que foi tocado pede detalhe e vai ao relatório.
  - **Completo** — os 34 itens agrupados, cada um marcado como
    *Conforme / Irregular / N/A*, para quando se quiser atestar item a item.

  Todos os itens trazem a base normativa e a frase que entra no relatório.
- **Relatório final** com síntese estatística, ranking das irregularidades mais
  frequentes, a relação de todos os veículos abordados (com o texto das
  observações montado automaticamente), conclusão/providências e anexo
  fotográfico. Exportação em **PDF (impressão)**, **.doc (Word, editável)** e
  **CSV (planilha)**.
- **Pacote para IA (.zip)**: as fotos nomeadas por veículo, placa e tipo, mais
  `dados.json` (dados estruturados, com a base legal de cada irregularidade),
  `resumo.md` e um arquivo de instruções. É o formato para entregar a um
  assistente que vá extrair os dados dos documentos fotografados.
- **Sincronização da equipe (opcional)**: todos os agentes trabalham na mesma
  operação; cada aparelho grava offline e envia sozinho quando há sinal, e o
  coordenador acompanha ao vivo quantos veículos cada agente já fiscalizou.
- **Backup em arquivo**: alternativa para operações sem sinal — cada agente
  exporta um `.json` e o coordenador importa todos; veículos com a mesma placa
  são consolidados, prevalecendo a versão mais recente.

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

## Endereço do aplicativo

O aplicativo já está publicado:

**https://ruicesarjunior-ship-it.github.io/ruicesar/fiscalizacao/**

A publicação é automática a cada push neste branch, pelo workflow
`.github/workflows/publicar-fiscalizacao.yml`. O site do GitHub Pages é único por
repositório e hospeda também o app de expedição de ofícios (na raiz), por isso os
dois workflows montam o site inteiro — publicar um não derruba o outro.

O aplicativo é estático (HTML/CSS/JS puros, sem servidor e sem banco externo),
então também roda em **qualquer hospedagem estática** (Netlify, Vercel, servidor
da Promotoria): basta publicar o conteúdo desta pasta, ou o arquivo único gerado
por `node scripts/gerar-arquivo-unico.mjs`.

**Teste local**:

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

## Sincronização entre os inspetores

**Já está pronta e ligada** — não é preciso criar conta nem configurar nada. O
aplicativo usa o projeto Firebase que a Promotoria já mantém (o mesmo do sistema
de expedição de ofícios), configurado em [`js/config.js`](js/config.js).

**Os dados sobem cifrados.** As regras daquele banco não são administradas por
este aplicativo, e os registros contêm dados pessoais de condutores. Por isso:

- a chave de cifra é derivada da **senha da operação** (PBKDF2-SHA256, 150 mil
  iterações) e nunca sai do aparelho;
- cada registro é cifrado com **AES-GCM 256** antes de subir;
- o caminho no banco é o hash do código + senha, e as placas também viram hash —
  nem o endereço do nó revela o que há dentro.

Quem não tiver o código e a senha não encontra o nó e, se encontrar, lê apenas
bytes embaralhados. Verificado em teste: das 20 requisições de uma sincronização
completa, nenhuma levava dado legível.

Uso:

- O **coordenador** abre *Equipe*, define um **código** (ex.: `PRADO2026`) e uma
  **senha** da operação e toca em **Criar operação**.
- Em seguida usa **🔗 Enviar convite à equipe**: o aplicativo monta a mensagem com
  um link que já leva o servidor e o código da operação. A senha vai em mensagem
  separada — ela nunca entra no link.
- Cada **agente** abre o link, toca em **Entrar na operação** e digita apenas a
  senha — não precisa criar fiscalização: os dados vêm da nuvem.
- A partir daí a sincronização é automática: ao concluir cada veículo, a cada
  minuto, ao reabrir o aplicativo e assim que o sinal volta. O ícone na barra
  superior mostra `☁️` (em dia), `⬆️ n` (n registros na fila), `📴` (sem sinal)
  ou `⚠️` (erro).
- O **painel da equipe** mostra quantos veículos cada agente já enviou e o horário
  do último envio.

**Como os conflitos são resolvidos**: a identidade do veículo é a **placa**. Se
dois agentes abordarem o mesmo veículo, prevalece a edição mais recente; exclusões
feitas em um aparelho alcançam os demais. O relatório final é sempre montado a
partir do aparelho do coordenador, que numera os veículos na ordem em que os
recebeu.

**Se a sincronização acusar recusa do banco** (HTTP 403), as regras do Realtime
Database precisam liberar o ramo `fiscalizacao` para usuários autenticados. No
console do Firebase, em *Realtime Database → Regras*, o trecho é:

```json
{
  "rules": {
    "fiscalizacao": { ".read": "auth != null", ".write": "auth != null" }
  }
}
```

Isso é seguro aqui justamente porque o conteúdo já sobe cifrado: um usuário
anônimo qualquer só alcança bytes embaralhados.

**Banco próprio (opcional)**: para não usar o projeto compartilhado, crie um
projeto no [Supabase](https://supabase.com), rode `supabase/schema.sql` no
*SQL Editor* e preencha `SUPABASE_URL` e `SUPABASE_ANON_KEY` em `js/config.js` —
eles têm prioridade sobre o Firebase. Nesse caminho as tabelas ficam inacessíveis
pela chave pública (RLS ligado e sem policies) e todo acesso passa por funções que
exigem o código e a senha da operação, gravada com hash bcrypt.

Use uma senha própria por operação e não a divulgue fora da equipe. O tráfego é
HTTPS nos dois casos.

**Sinal ruim**: nada trava. O registro é gravado no aparelho e vai para a fila; as
fotos sobem no máximo 8 por rodada para não prender a sincronização, e é possível
desmarcar *"Enviar também as fotos"* para economizar dados — elas sobem depois,
quando marcar de novo.

## Roteiro de uso em campo

1. **Antes de sair**: em *Dados*, preencha número do relatório, data, município,
   local, promotoria e promotor(a). Em *Início*, cada agente escreve seu nome/posto.
2. **Em cada veículo**: *Veículos → Novo* → digite a placa → fotografe a placa, a
   lateral com a faixa, o interior e cada irregularidade → percorra o checklist
   marcando apenas o que estiver irregular → use **✓ Tudo conforme** para fechar
   os itens restantes → *Salvar e próximo veículo*.
3. **Ao final do dia**: com sincronização ativa, basta conferir em *Equipe* se a
   fila está zerada. Sem sincronização, cada agente vai em
   *Equipe → Exportar com fotos* e envia o arquivo ao coordenador.
4. **No gabinete**: o coordenador confere o painel (ou importa os arquivos),
   revisa em *Dados* o texto de conclusão (há um modelo pronto no botão
   *Inserir modelo de conclusão*) e emite o relatório em *Relatório*.

## Privacidade e cuidados

- Sem sincronização, os dados ficam **somente no aparelho** (IndexedDB).
- Com sincronização ativa, os dados dos condutores e as fotos passam a residir
  também no projeto Supabase do próprio usuário — avalie a adequação à LGPD e às
  normas internas antes de usar em operação real, e apague a operação da nuvem
  quando o relatório estiver concluído.
- Limpar os dados de navegação do celular apaga a fiscalização local — **exporte
  backup todo dia**, mesmo usando a nuvem.
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
js/backup.js             exportação/importação por arquivo
js/nuvem.js              sincronização da equipe (opcional)
js/config.js             endereço e chave do servidor (preencher uma vez)
supabase/schema.sql      banco e funções de acesso da sincronização
sw.js                    funcionamento offline
```
