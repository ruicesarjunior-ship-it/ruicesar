# Como colocar o aplicativo no ar — passo a passo

> **As duas etapas já estão concluídas.** Este documento registra como ficou e o
> que conferir se algo falhar. Para trocar o banco por um projeto Supabase
> próprio, veja [`CONFIGURACAO_AUTOMATICA.md`](CONFIGURACAO_AUTOMATICA.md).

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

## Etapa B — sincronização ao vivo ✅ CONCLUÍDA

Nada a criar: o aplicativo usa o projeto Firebase que a Promotoria já mantém — o
mesmo do sistema de expedição de ofícios. Os registros sobem **cifrados no
aparelho**, com chave derivada da senha da operação (ver `js/nuvem-firebase.js`).

**Único ponto a conferir**, caso a sincronização acuse recusa do banco (403): no
console do Firebase, em *Realtime Database → Regras*, o ramo `fiscalizacao` deve
estar liberado para usuários autenticados:

```json
{
  "rules": {
    "fiscalizacao": { ".read": "auth != null", ".write": "auth != null" }
  }
}
```

(Preserve as regras que já existirem para o app de ofícios.)

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

Concluído o relatório, apague os dados da nuvem. No console do Firebase, em
*Realtime Database*, abra o ramo `fiscalizacao` e exclua o nó da operação (o nome
é um código longo — se houver mais de um, exclua o ramo `fiscalizacao` inteiro
depois de encerrar todas as operações). Os registros permanecem nos aparelhos e
no backup `.json` exportado.

Ainda que o conteúdo esteja cifrado e ilegível sem a senha da operação, apagar ao
final é boa prática de minimização de dados — e o espaço do banco é compartilhado
com o sistema de expedição de ofícios.
