# Como colocar o aplicativo no ar — passo a passo

> **Prefere não clicar em telas?** Há um script que faz quase tudo sozinho:
> veja [`CONFIGURACAO_AUTOMATICA.md`](CONFIGURACAO_AUTOMATICA.md). Este documento
> é o caminho manual, útil se algo falhar.

## Etapa A — publicar o endereço ✅ CONCLUÍDA

O aplicativo já está no ar:

```
https://ruicesarjunior-ship-it.github.io/ruicesar/fiscalizacao/
```

Abra no celular e use *Adicionar à tela inicial* para instalar. Não é preciso
mexer em configuração do GitHub: a publicação é automática a cada push no branch
`claude/school-transport-inspection-app-rj223v`, pelo workflow
`.github/workflows/publicar-fiscalizacao.yml`.

O site do Pages é único por repositório e hospeda os dois aplicativos:

| Endereço | Aplicativo |
| --- | --- |
| `/ruicesar/` | Expedição de ofícios |
| `/ruicesar/fiscalizacao/` | Fiscalização do transporte escolar |
| `/ruicesar/fiscalizacao/arquivo-unico.html` | Mesma fiscalização, em arquivo único |

Os dois workflows montam o site completo, então publicar um não derruba o outro.

---

Resta **uma** etapa, que exige o seu login e por isso não pode ser feita por mim:
**criar o banco** (Supabase), necessário apenas para a sincronização ao vivo.
Sem ela o aplicativo funciona por completo, com consolidação por arquivo.

---

## Etapa B — criar o banco da sincronização (≈ 8 minutos)

1. Acesse **supabase.com** → *Start your project* → entre com a conta Google ou
   GitHub. O plano gratuito atende com folga uma fiscalização municipal.
2. Clique em **New project**:
   - *Name*: `fiscalizacao-transporte-escolar`
   - *Database Password*: gere uma senha forte e guarde-a (é do banco, não é a
     senha da operação)
   - *Region*: **South America (São Paulo)**
   - **Create new project** e aguarde o provisionamento (~2 min).
3. No menu lateral, abra **SQL Editor** → **New query**.
4. Abra o arquivo [`supabase/schema.sql`](supabase/schema.sql) deste repositório,
   copie **todo** o conteúdo, cole no editor e clique em **Run**.
   Deve aparecer *Success. No rows returned*.
5. No menu lateral, abra **Project Settings** (engrenagem) → **API** e copie:
   - **Project URL** — algo como `https://abcdefgh.supabase.co`
   - Chave **`anon` `public`** — um texto longo começando com `eyJ...`

   > Nunca use nem divulgue a chave **`service_role`**. Ela dá acesso total.

6. Agora escolha **um** dos caminhos:

   **Caminho 1 — deixar tudo pronto para a equipe (recomendado).**
   Edite o arquivo `fiscalizacao-transporte-escolar/js/config.js` e preencha:

   ```js
   export const CONFIG = {
     SUPABASE_URL: 'https://abcdefgh.supabase.co',
     SUPABASE_ANON_KEY: 'eyJhbGciOi...',
     CODIGO_OPERACAO_PADRAO: '',
   };
   ```

   Salve e envie a alteração (ou me passe os dois valores no chat que eu edito,
   testo e envio — a chave `anon` é pública, pode ser compartilhada). A partir daí
   **nenhum policial precisa configurar nada**: basta abrir o endereço.

   **Caminho 2 — configurar cada aparelho à mão.**
   No aplicativo, aba **Equipe**, cole a *Project URL* e a chave *anon* nos dois
   campos e toque em *Salvar configuração*. Repita em cada celular.

---

## No dia da fiscalização

1. **No seu celular**: aba *Dados* → preencha número do relatório, data,
   município, local e seu nome. Aba *Equipe* → defina o **código da operação**
   (ex.: `PRADO2026`) e uma **senha**, e toque em **Criar operação**.
2. **Convide a equipe**: aba *Equipe* → **🔗 Enviar convite à equipe**. O
   aplicativo monta a mensagem com o link já configurado e as instruções; envie
   pelo grupo de WhatsApp. **Mande a senha da operação em mensagem separada.**
3. **Cada policial**: abre o link → *Adicionar à tela inicial* → aba *Equipe* →
   **Entrar na operação** → digita a senha → aba *Início* → escreve nome e posto.
4. **Em campo**: *Veículos → Novo*, placa, fotos, checklist, *Salvar e próximo*.
   Tudo sobe sozinho quando há sinal; sem sinal, fica na fila e sobe depois.
5. **No gabinete**: aba *Equipe* → confira o painel; aba *Relatório* → *Gerar* →
   *Imprimir / salvar PDF* ou *Baixar .doc*.

---

## Encerramento e LGPD

Concluído o relatório, apague os dados pessoais da nuvem: no Supabase,
*SQL Editor* → `delete from fiscalizacoes where codigo = 'PRADO2026';`
(as demais tabelas são apagadas em cascata). Os registros permanecem no aparelho
e no backup `.json` que o senhor exportar.
