# Regras de segurança do banco em nuvem (Firebase)

O app sincroniza o **banco de destinatários** entre computadores usando o
**Firebase Realtime Database** (plano gratuito Spark). Ao criar o banco, o
Firebase costuma deixá-lo em **modo de teste**, que permite que **qualquer
pessoa com o link leia e escreva** os dados. Isso deve ser fechado.

## Como aplicar a regra segura (2 minutos)

1. Acesse o [console do Firebase](https://console.firebase.google.com/) e abra
   o projeto **expedicao-promotorias**.
2. Menu lateral → **Realtime Database** → aba **Regras** (Rules).
3. Substitua todo o conteúdo por:

   ```json
   {
     "rules": {
       "mpba": {
         ".read": "auth != null",
         ".write": "auth != null"
       },
       "$outros": {
         ".read": false,
         ".write": false
       }
     }
   }
   ```

4. Clique em **Publicar** (Publish).

O mesmo conteúdo está no arquivo `firebase.rules.json` deste repositório.

## O que isso faz

- Só quem está **autenticado** consegue ler/escrever. O app faz **login anônimo
  automático** (Anonymous Auth), então continua funcionando normalmente para os
  servidores — sem senha, sem cadastro.
- Fecha o acesso público que o modo de teste deixava aberto.
- Bloqueia qualquer outro caminho do banco fora de `mpba`.

## Pré-requisito

O **Authentication → método Anônimo** precisa estar **ativado** (Console →
Authentication → Sign-in method → Anonymous → Ativar). Se ainda não estiver, o
login anônimo falha e a sincronização não conecta.
