# Configuração automática — sem cliques em telas

Existe um script que faz sozinho tudo o que restava: cria o projeto no Supabase,
executa o `schema.sql`, lê a chave pública, preenche o `js/config.js` e (se você
quiser) liga o GitHub Pages.

Ele roda **no seu computador**, porque precisa das suas credenciais — que assim
nunca saem da sua máquina.

---

## Opção 1 — rodar o script você mesmo (≈ 3 minutos)

**Pré-requisito**: Node.js 18 ou superior ([nodejs.org](https://nodejs.org) →
botão LTS). Para conferir se já tem: abra o terminal (Windows: *Prompt de
Comando*) e digite `node -v`.

1. Baixe o repositório, se ainda não tiver:

   ```bash
   git clone https://github.com/ruicesarjunior-ship-it/ruicesar.git
   cd ruicesar/fiscalizacao-transporte-escolar
   git checkout claude/school-transport-inspection-app-rj223v
   ```

2. Crie a conta no Supabase (só isso é manual, é a **sua** conta):
   [supabase.com](https://supabase.com) → *Start your project*.

3. Gere um token pessoal em
   [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens)
   → *Generate new token* → copie (começa com `sbp_`).

4. Rode:

   ```bash
   node scripts/configurar.mjs
   ```

   Cole o token quando for pedido. O script mostra cada etapa e, se alguma falhar,
   diz exatamente o que fazer à mão — nada fica pela metade.

5. Ao final, envie a configuração:

   ```bash
   git add js/config.js && git commit -m "Configura servidor de sincronização" && git push
   ```

**Sobre o token**: dá acesso administrativo à sua conta Supabase. O script o usa
apenas em chamadas à API oficial e **não o grava em disco**. Depois de configurar,
você pode revogá-lo na mesma página de tokens — o aplicativo não precisa dele para
funcionar.

---

## Opção 2 — pedir a um Claude que rode no seu computador

Se você usa o Claude Code no seu computador (ou o Claude no Chrome), abra-o na
pasta do projeto e cole exatamente isto:

> Estou na pasta do aplicativo `fiscalizacao-transporte-escolar`, no branch
> `claude/school-transport-inspection-app-rj223v`. Execute
> `node scripts/configurar.mjs` para configurar o servidor de sincronização,
> acompanhe a saída, resolva o que falhar, confirme que `js/config.js` ficou
> preenchido com a URL e a chave `anon` (nunca a `service_role`), rode um teste
> abrindo o app com `python3 -m http.server 8000` e criando uma operação de teste,
> e ao final faça commit e push apenas do `js/config.js`. Não versione o arquivo
> `senha-do-banco.txt`.

Essa sessão tem acesso ao seu computador e ao seu navegador já autenticado; a
sessão da nuvem (onde o aplicativo foi desenvolvido) não tem.

---

## Opção 3 — me passar apenas os dois valores públicos

Crie a conta e o projeto no Supabase, rode o `supabase/schema.sql` no *SQL Editor*
e me mande no chat, da tela *Project Settings → API*:

- a **Project URL** (`https://xxxx.supabase.co`)
- a chave **`anon` `public`** (começa com `eyJ`)

Eu preencho o `js/config.js`, testo e envio. Esses dois valores são públicos por
natureza — ficam visíveis no código do aplicativo de qualquer forma.

**Nunca** me envie (nem publique) a chave `service_role` nem o token `sbp_`.
