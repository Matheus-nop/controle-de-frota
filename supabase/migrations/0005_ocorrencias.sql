-- Ocorrencias — dano / acidente / avaria relatado pelo tecnico no app de campo.
-- Revise antes de aplicar: supabase db push (ou cole no SQL editor do Supabase).
--
-- Por que uma tabela nova e nao um campo no checklist: a avaria do checklist e
-- uma resposta dentro da vistoria semanal. A ocorrencia acontece a qualquer
-- momento (bateu, riscou, quebrou na rua) e tem vida propria — nasce aberta e
-- morre resolvida, podendo virar manutencao no meio do caminho.
--
-- Nada de calculo derivado gravado aqui: `status` e `resolvida_em` sao fatos
-- lancados por gente, nao numeros calculados.

create table public.ocorrencias (
  id uuid primary key default gen_random_uuid(),
  veiculo_id uuid not null references public.veiculos,
  -- quem relatou. FK para tecnicos, nunca texto livre.
  tecnico_id uuid not null references public.tecnicos,

  tipo text not null check (tipo in ('DANO','ACIDENTE','AVARIA','OUTRO')),
  data date not null default current_date,          -- quando aconteceu
  registrada_em timestamptz not null default now(), -- quando entrou no sistema
  local text,
  descricao text not null,
  gravidade text not null check (gravidade in ('LEVE','MODERADA','GRAVE')),
  terceiros boolean not null default false,         -- envolveu outro veiculo/pessoa
  fotos jsonb not null default '[]'::jsonb,         -- ["url", ...] no bucket ocorrencias

  status text not null default 'ABERTA'
    check (status in ('ABERTA','EM ANÁLISE','RESOLVIDA','CANCELADA')),
  resolvida_em date,
  resolucao text,
  -- preenchido quando o gestor transforma a ocorrencia em manutencao
  manutencao_id uuid references public.manutencoes,

  constraint fotos_e_lista check (jsonb_typeof(fotos) = 'array'),
  -- so ocorrencia encerrada tem data de encerramento
  constraint resolucao_coerente
    check (resolvida_em is null or status in ('RESOLVIDA','CANCELADA'))
);

-- ficha do veiculo: as ocorrencias dele, da mais recente para a mais antiga
create index ocorrencias_veiculo_idx on public.ocorrencias (veiculo_id, data desc);
-- a fila do gestor: o que ainda esta em aberto
create index ocorrencias_abertas_idx on public.ocorrencias (status)
  where status in ('ABERTA','EM ANÁLISE');

-- ===========================================================================
-- RLS — mesmo modelo de roteiros na leitura e na insercao: o tecnico so
-- enxerga e so lanca o que e dele; o gestor ve e mexe em tudo.
--
-- A diferenca deliberada esta no UPDATE: em roteiros o tecnico precisa voltar
-- na linha para registrar a chegada. Aqui nao ha segundo passo do tecnico —
-- classificar, resolver e converter em manutencao e trabalho do gestor. Entao
-- o UPDATE e do gestor, como ja acontece em checklists.
-- ===========================================================================
grant select, insert, update, delete on public.ocorrencias to authenticated;

alter table public.ocorrencias enable row level security;

create policy ocorrencias_select on public.ocorrencias
  for select to authenticated
  using (public.is_gestor() or tecnico_id = public.current_tecnico_id());

-- o tecnico so relata em nome dele mesmo
create policy ocorrencias_insert on public.ocorrencias
  for insert to authenticated
  with check (public.is_gestor() or tecnico_id = public.current_tecnico_id());

create policy ocorrencias_update on public.ocorrencias
  for update to authenticated
  using (public.is_gestor()) with check (public.is_gestor());

create policy ocorrencias_delete on public.ocorrencias
  for delete to authenticated using (public.is_gestor());
