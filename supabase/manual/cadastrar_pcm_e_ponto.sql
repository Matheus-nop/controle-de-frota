-- MODELO — cadastro de acesso para PCM e time de PONTO.
--
-- NÃO É MIGRAÇÃO. Não colar como está: tem senha dentro. Copie o bloco,
-- troque nome/usuário/senha, cole no SQL editor do Supabase e não commite
-- o arquivo preenchido.
--
-- Por que é manual: criar usuário mexe em `auth.users`, que é do GoTrue.
-- Uma migração versionada com senha em texto entraria no repositório público.
--
-- Login: o time não tem e-mail corporativo, então o usuário interno é
-- `primeiro.ultimo@frota.local` e a tela de login completa o `@frota.local`
-- sozinha — a pessoa digita só `marcia.souza`.
--
-- Papéis disponíveis: 'TECNICO', 'GESTOR', 'PCM', 'PONTO'.
--   PCM   — abre e fecha manutenção da frota inteira, vê checklists e alertas.
--   PONTO — só lê o horário de saída e chegada dos roteiros, em /ponto.
--
-- ATENÇÃO ao `coalesce('')` nas colunas de token: elas são `not null` sem
-- default no GoTrue. Usuário criado por SQL sem elas faz o login responder
-- `{}` — foi exatamente o erro de 2026-08 com o primeiro lote de técnicos.

-- ===========================================================================
-- 1. Uma pessoa por bloco. Repita trocando as três primeiras linhas.
-- ===========================================================================
do $$
declare
  v_nome    text := 'Márcia Souza';        -- como aparece no app
  v_usuario text := 'marcia.souza';        -- o que a pessoa digita no login
  v_senha   text := 'TrocarEsta2026';      -- troque, e mande por canal privado
  v_papel   text := 'PCM';                 -- 'PCM' ou 'PONTO'
  v_user_id uuid;
begin
  insert into auth.users (
    instance_id, id, aud, role,
    email, encrypted_password, email_confirmed_at,
    created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change, email_change_token_new
  ) values (
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
    lower(v_usuario) || '@frota.local',
    extensions.crypt(v_senha, extensions.gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    '', '', '', ''
  )
  returning id into v_user_id;

  -- o cadastro de pessoa: é daqui que sai o nome em toda tela
  insert into public.tecnicos (user_id, nome, papel, ativo)
  values (v_user_id, v_nome, v_papel, true);

  raise notice 'criado: % (%) papel %', v_nome, lower(v_usuario) || '@frota.local', v_papel;
end $$;

-- ===========================================================================
-- 2. Conferir quem existe e com qual papel
-- ===========================================================================
-- select t.nome, t.papel, t.ativo, u.email
--   from public.tecnicos t
--   left join auth.users u on u.id = t.user_id
--  order by t.papel, t.nome;

-- ===========================================================================
-- 3. Promover alguém que JÁ tem login (não cria usuário novo)
-- ===========================================================================
-- update public.tecnicos set papel = 'PCM'   where nome = 'Márcia Souza';
-- update public.tecnicos set papel = 'PONTO' where nome = 'Fulano de Tal';

-- ===========================================================================
-- 4. Trocar a senha de alguém
-- ===========================================================================
-- update auth.users
--    set encrypted_password = extensions.crypt('NovaSenha2026', extensions.gen_salt('bf')),
--        updated_at = now()
--  where email = 'marcia.souza@frota.local';
