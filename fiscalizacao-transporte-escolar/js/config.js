/**
 * Configuração do servidor de sincronização.
 *
 * Preencha os dois valores abaixo UMA VEZ, no lugar onde o aplicativo está
 * publicado. Feito isso, todo celular que abrir o endereço já vem configurado:
 * a equipe só precisa do código e da senha da operação.
 *
 * Onde encontrar (projeto Supabase → Project Settings → API):
 *   SUPABASE_URL       = "Project URL"        (ex.: https://abcdefgh.supabase.co)
 *   SUPABASE_ANON_KEY  = chave "anon public"  (começa com eyJ...)
 *
 * A chave "anon public" é pública por natureza — pode ficar no código e no link
 * enviado à equipe. Ela sozinha não dá acesso a nada: as tabelas estão fechadas
 * e todo acesso exige o código e a senha da operação.
 *
 * NUNCA coloque aqui a chave "service_role".
 *
 * Deixando em branco, o aplicativo funciona normalmente sem sincronização, e o
 * servidor pode ser configurado à mão na aba "Equipe" de cada aparelho.
 */

export const CONFIG = {
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: '',

  // Opcional: código sugerido da operação (a senha nunca fica no código).
  CODIGO_OPERACAO_PADRAO: '',
};
