-- =====================================================================
-- Fiscalização do Transporte Escolar — banco de sincronização da equipe
--
-- Como usar:
--   1. Crie um projeto gratuito em https://supabase.com
--   2. Abra "SQL Editor" → "New query", cole TODO este arquivo e execute
--   3. Em "Project Settings → API", copie a "Project URL" e a chave
--      "anon public" e informe-as na tela "Equipe" do aplicativo
--
-- Segurança: as tabelas ficam com RLS ligado e SEM nenhuma policy, ou seja,
-- são inacessíveis diretamente com a chave pública. Todo acesso passa pelas
-- funções abaixo, que exigem o código e a senha da operação. Quem tiver
-- apenas a chave anon não consegue ler nada.
-- =====================================================================

create extension if not exists pgcrypto;

-- --------------------------------------------------------------- tabelas

create table if not exists public.fiscalizacoes (
  id            uuid primary key default gen_random_uuid(),
  codigo        text unique not null,
  senha_hash    text not null,
  dados         jsonb not null,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.veiculos (
  id              uuid primary key default gen_random_uuid(),
  fiscalizacao_id uuid not null references public.fiscalizacoes(id) on delete cascade,
  chave           text not null,          -- placa normalizada (ou "local:<id>" sem placa)
  dados           jsonb not null,
  agente          text default '',
  atualizado_em   timestamptz not null default now(),
  unique (fiscalizacao_id, chave)
);
create index if not exists veiculos_sync_idx on public.veiculos (fiscalizacao_id, atualizado_em);

create table if not exists public.fotos (
  id              uuid primary key default gen_random_uuid(),
  fiscalizacao_id uuid not null references public.fiscalizacoes(id) on delete cascade,
  veiculo_chave   text not null,
  origem_id       text not null,          -- identidade da foto no aparelho de origem
  legenda         text default '',
  agente          text default '',
  imagem          bytea not null,
  criado_em       timestamptz not null default now(),
  enviado_em      timestamptz not null default now(),
  unique (fiscalizacao_id, origem_id)
);
create index if not exists fotos_sync_idx on public.fotos (fiscalizacao_id, enviado_em);

-- Lápides: permitem que a exclusão feita por um aparelho chegue aos demais.
create table if not exists public.removidos (
  fiscalizacao_id uuid not null references public.fiscalizacoes(id) on delete cascade,
  chave           text not null,
  removido_em     timestamptz not null default now(),
  primary key (fiscalizacao_id, chave)
);

alter table public.fiscalizacoes enable row level security;
alter table public.veiculos      enable row level security;
alter table public.fotos         enable row level security;
alter table public.removidos     enable row level security;

revoke all on public.fiscalizacoes, public.veiculos, public.fotos, public.removidos from anon, authenticated;

-- -------------------------------------------------------------- funções

create or replace function public.fisc_autenticar(p_codigo text, p_senha text)
returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid;
begin
  select id into v_id
    from public.fiscalizacoes
   where codigo = upper(btrim(p_codigo))
     and senha_hash = crypt(p_senha, senha_hash);
  if v_id is null then
    raise exception 'Código ou senha da operação inválidos.' using errcode = '28000';
  end if;
  return v_id;
end $$;

-- Cria a "sala" da operação. Falha se o código já existir.
create or replace function public.fisc_criar(p_codigo text, p_senha text, p_dados jsonb)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_codigo text := upper(btrim(p_codigo)); v_id uuid;
begin
  if length(v_codigo) < 4 then
    raise exception 'O código da operação deve ter ao menos 4 caracteres.';
  end if;
  if length(p_senha) < 4 then
    raise exception 'A senha da operação deve ter ao menos 4 caracteres.';
  end if;
  if exists (select 1 from public.fiscalizacoes where codigo = v_codigo) then
    raise exception 'Já existe uma operação com o código %.', v_codigo;
  end if;
  insert into public.fiscalizacoes (codigo, senha_hash, dados)
       values (v_codigo, crypt(p_senha, gen_salt('bf')), p_dados)
    returning id into v_id;
  return jsonb_build_object('id', v_id, 'codigo', v_codigo);
end $$;

-- Entrada de um novo aparelho: devolve os dados da fiscalização.
create or replace function public.fisc_entrar(p_codigo text, p_senha text)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid;
begin
  v_id := public.fisc_autenticar(p_codigo, p_senha);
  return jsonb_build_object(
    'id', v_id,
    'codigo', upper(btrim(p_codigo)),
    'fiscalizacao', (select dados from public.fiscalizacoes where id = v_id)
  );
end $$;

-- Sincronização: envia o que mudou no aparelho e recebe o que mudou na nuvem.
create or replace function public.fisc_sync(
  p_codigo    text,
  p_senha     text,
  p_fisc      jsonb default null,
  p_veiculos  jsonb default '[]'::jsonb,
  p_removidos jsonb default '[]'::jsonb,
  p_desde     timestamptz default null
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_id    uuid;
  v_agora timestamptz := clock_timestamp();
  v_desde timestamptz := coalesce(p_desde, '-infinity'::timestamptz);
begin
  v_id := public.fisc_autenticar(p_codigo, p_senha);

  -- Cabeçalho da fiscalização: prevalece a edição mais recente.
  if p_fisc is not null then
    update public.fiscalizacoes
       set dados = p_fisc, atualizado_em = v_agora
     where id = v_id
       and coalesce(dados->>'atualizadoEm', '') < coalesce(p_fisc->>'atualizadoEm', '');
  end if;

  -- Exclusões feitas neste aparelho.
  if jsonb_array_length(coalesce(p_removidos, '[]'::jsonb)) > 0 then
    insert into public.removidos (fiscalizacao_id, chave, removido_em)
    select v_id, x.chave, v_agora
      from jsonb_to_recordset(p_removidos) as x(chave text)
    on conflict (fiscalizacao_id, chave) do update set removido_em = v_agora;

    delete from public.veiculos
     where fiscalizacao_id = v_id
       and chave in (select x.chave from jsonb_to_recordset(p_removidos) as x(chave text));
  end if;

  -- Veículos enviados: vence sempre o registro editado por último.
  if jsonb_array_length(coalesce(p_veiculos, '[]'::jsonb)) > 0 then
    insert into public.veiculos (fiscalizacao_id, chave, dados, agente, atualizado_em)
    select v_id, x.chave, x.dados, coalesce(x.agente, ''), v_agora
      from jsonb_to_recordset(p_veiculos) as x(chave text, dados jsonb, agente text)
     where not exists (
             select 1 from public.removidos r
              where r.fiscalizacao_id = v_id and r.chave = x.chave
                and r.removido_em > (x.dados->>'atualizadoEm')::timestamptz)
    on conflict (fiscalizacao_id, chave) do update
       set dados = excluded.dados,
           agente = excluded.agente,
           atualizado_em = v_agora
     where coalesce(public.veiculos.dados->>'atualizadoEm', '')
         < coalesce(excluded.dados->>'atualizadoEm', '');
  end if;

  return jsonb_build_object(
    'servidorEm', v_agora,
    'fiscalizacao', (select dados from public.fiscalizacoes where id = v_id),
    'veiculos', coalesce((
        select jsonb_agg(jsonb_build_object('chave', chave, 'dados', dados, 'agente', agente))
          from public.veiculos
         where fiscalizacao_id = v_id and atualizado_em > v_desde), '[]'::jsonb),
    'removidos', coalesce((
        select jsonb_agg(chave)
          from public.removidos
         where fiscalizacao_id = v_id and removido_em > v_desde), '[]'::jsonb),
    'fotos', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', id, 'veiculoChave', veiculo_chave, 'origemId', origem_id,
                 'legenda', legenda, 'criadoEm', criado_em))
          from public.fotos
         where fiscalizacao_id = v_id and enviado_em > v_desde), '[]'::jsonb)
  );
end $$;

create or replace function public.fisc_foto_enviar(
  p_codigo text, p_senha text, p_veiculo_chave text,
  p_origem_id text, p_legenda text, p_agente text, p_imagem text
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid;
begin
  v_id := public.fisc_autenticar(p_codigo, p_senha);
  insert into public.fotos (fiscalizacao_id, veiculo_chave, origem_id, legenda, agente, imagem)
       values (v_id, p_veiculo_chave, p_origem_id, coalesce(p_legenda, ''), coalesce(p_agente, ''),
               decode(p_imagem, 'base64'))
  on conflict (fiscalizacao_id, origem_id) do update
     set legenda = excluded.legenda, enviado_em = clock_timestamp();
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.fisc_foto_baixar(p_codigo text, p_senha text, p_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid;
begin
  v_id := public.fisc_autenticar(p_codigo, p_senha);
  return (
    select jsonb_build_object(
      'id', id, 'veiculoChave', veiculo_chave, 'origemId', origem_id,
      'legenda', legenda, 'criadoEm', criado_em, 'imagem', encode(imagem, 'base64'))
      from public.fotos where id = p_id and fiscalizacao_id = v_id);
end $$;

-- Painel do coordenador: produção por agente.
create or replace function public.fisc_painel(p_codigo text, p_senha text)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid;
begin
  v_id := public.fisc_autenticar(p_codigo, p_senha);
  return jsonb_build_object(
    'veiculos', (select count(*) from public.veiculos where fiscalizacao_id = v_id),
    'fotos',    (select count(*) from public.fotos    where fiscalizacao_id = v_id),
    'atualizadoEm', (select max(atualizado_em) from public.veiculos where fiscalizacao_id = v_id),
    'agentes', coalesce((
      select jsonb_agg(t order by t.veiculos desc)
        from (
          select coalesce(nullif(btrim(agente), ''), '(sem identificação)') as agente,
                 count(*) as veiculos,
                 max(atualizado_em) as ultimo
            from public.veiculos
           where fiscalizacao_id = v_id
           group by 1) t), '[]'::jsonb)
  );
end $$;

-- ---------------------------------------------------------------- grants

grant execute on function
  public.fisc_criar(text, text, jsonb),
  public.fisc_entrar(text, text),
  public.fisc_sync(text, text, jsonb, jsonb, jsonb, timestamptz),
  public.fisc_foto_enviar(text, text, text, text, text, text, text),
  public.fisc_foto_baixar(text, text, uuid),
  public.fisc_painel(text, text)
to anon, authenticated;

-- O Postgres concede EXECUTE a PUBLIC por padrão; a função interna de
-- verificação de senha não deve ficar exposta na API.
revoke execute on function public.fisc_autenticar(text, text) from public, anon, authenticated;
