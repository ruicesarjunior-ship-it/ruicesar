/**
 * Configuração do servidor de sincronização.
 *
 * Já vem preenchida com o projeto Firebase que a Promotoria mantém — o mesmo
 * usado pelo aplicativo de expedição de ofícios. Não é preciso criar nada: todo
 * celular que abrir o endereço já sincroniza, bastando o código e a senha da
 * operação.
 *
 * Sobre a chave abaixo: numa aplicação Firebase de navegador a `apiKey` é
 * pública por natureza — identifica o projeto, não autoriza acesso. A proteção
 * dos dados não depende dela: os registros sobem cifrados com AES-GCM, com
 * chave derivada da SENHA da operação, que nunca sai do aparelho. Ver
 * js/nuvem-firebase.js.
 *
 * Alternativa: para usar um banco próprio no Supabase, preencha SUPABASE_URL e
 * SUPABASE_ANON_KEY (ver supabase/schema.sql). Preenchidos, eles têm prioridade.
 * NUNCA coloque aqui a chave "service_role" do Supabase.
 */

export const CONFIG = {
  FIREBASE: {
    apiKey: 'AIzaSyBFZFZMSPYnVpZgAr6x-H4_eilbxdkvxdI',
    authDomain: 'expedicao-promotorias.firebaseapp.com',
    databaseURL: 'https://expedicao-promotorias-default-rtdb.firebaseio.com',
    projectId: 'expedicao-promotorias',
  },

  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: '',

  // Opcional: código sugerido da operação (a senha nunca fica no código).
  CODIGO_OPERACAO_PADRAO: '',
};
