-- A ponte entre o Authentication do Supabase e o cadastro de pessoas.
-- Revise antes de aplicar: supabase db push (ou cole no SQL editor do Supabase).
--
-- Decisão do gestor: criar login continua sendo no painel do Supabase
-- (Authentication → Add user, e-mail + senha), não no app. Isso evita ter que
-- pôr a chave `service_role` no ambiente do Vercel.
--
-- Só que criar o login resolve METADE. O app não conhece ninguém por e-mail:
-- todo nome que aparece em roteiro, checklist e manutenção é FK para
-- `tecnicos`. Um login sem linha em `tecnicos` entra no sistema e não é
-- ninguém — sem nome, sem papel, caindo em /campo sem conseguir lançar nada.
--
-- Esta função é a lista do que está pela metade: logins criados no Supabase
-- que ainda não viraram pessoa. A tela /usuarios lê daqui e o gestor completa
-- o cadastro com nome e papel.
--
-- Por que função e não view: `auth.users` não é exposta ao PostgREST e
-- `authenticated` não tem select nela. A função roda como dono (security
-- definer) para poder ler, e a PRIMEIRA coisa que faz é conferir se quem
-- chamou é gestor — sem isso qualquer técnico logado listaria o e-mail de
-- todo mundo.

create or replace function public.logins_sem_pessoa()
returns table (user_id uuid, email text, criado_em timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_gestor() then
    raise exception 'Apenas o gestor lista logins.' using errcode = '42501';
  end if;

  return query
    select u.id, u.email::text, u.created_at
      from auth.users u
      left join public.tecnicos t on t.user_id = u.id
     where t.id is null
     order by u.created_at desc;
end;
$$;

grant execute on function public.logins_sem_pessoa() to authenticated;

-- ---------------------------------------------------------------------------
-- O outro lado: o e-mail de quem JÁ tem cadastro, para a tela mostrar com que
-- usuário a pessoa entra. Mesma proteção — gestor e mais ninguém.
--
-- `tecnicos.user_id` é público (a RLS de tecnicos deixa todo mundo ler o
-- cadastro, porque o painel precisa do nome), mas o e-mail não está lá e não
-- vai passar a estar: dado de login mora no auth, e sai daqui sob demanda.
-- ---------------------------------------------------------------------------
create or replace function public.emails_do_time()
returns table (user_id uuid, email text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_gestor() then
    raise exception 'Apenas o gestor lista e-mails.' using errcode = '42501';
  end if;

  return query
    select u.id, u.email::text
      from auth.users u
      join public.tecnicos t on t.user_id = u.id;
end;
$$;

grant execute on function public.emails_do_time() to authenticated;
