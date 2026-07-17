-- Fase 2 — auth: papel do tecnico + funcoes auxiliares para a RLS
-- Revise antes de aplicar: supabase db push

-- Papel do tecnico. Default TECNICO: qualquer pessoa nova entra como tecnico,
-- e um gestor e promovido manualmente (update papel = 'GESTOR').
alter table public.tecnicos
  add column papel text not null default 'TECNICO'
    check (papel in ('TECNICO', 'GESTOR'));

-- ---------------------------------------------------------------------------
-- Funcoes que a RLS usa para saber QUEM esta logado.
--
-- security definer + search_path travado: rodam como dono (postgres), entao
-- leem a tabela tecnicos sem cair na RLS da propria tecnicos (evita recursao).
-- stable: o resultado nao muda dentro da mesma query.
-- ---------------------------------------------------------------------------

-- id do tecnico correspondente ao usuario logado (null se nao houver)
create or replace function public.current_tecnico_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.tecnicos where user_id = auth.uid()
$$;

-- true se o usuario logado for gestor
create or replace function public.is_gestor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tecnicos
    where user_id = auth.uid() and papel = 'GESTOR'
  )
$$;

grant execute on function public.current_tecnico_id() to authenticated;
grant execute on function public.is_gestor() to authenticated;
