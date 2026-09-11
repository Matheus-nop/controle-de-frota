-- =====================================================================
-- Migração 0020: o plano de manutenção da Fiorino, do manual
-- (idempotente; rode no SQL Editor depois da 0019)
-- =====================================================================
--
-- Lido do "Plano de Manutenção Programada — versões com motor FIRE 1.4 8V",
-- páginas F-12 a F-14 do manual da Fiorino, revisões 01ª a 18ª.
--
-- POR QUE FALTAVA UMA COLUNA
--
-- A 0015 resolve o escopo por "a cada N km": o marco puxa toda regra cujo
-- intervalo o divide. Isso cobre quase tudo, e não cobre dois itens do manual:
--
--   • Verificar o elemento do filtro de ar cai nas revisões ÍMPARES — 10, 30,
--     50 mil. É "a cada 20.000 km, mas começando aos 10.000".
--   • Verificar visualmente a correia dentada cai na 4ª, 10ª e 16ª — 40, 100 e
--     160 mil, sempre 20.000 km antes de cada troca de correia (60, 120, 180).
--
-- Sem `km_inicio` os dois teriam que ser torcidos para caber: ou entram no km
-- errado, ou somem do plano. Torcer o dado para caber no modelo é como se perde
-- a confiança na ordem de serviço — e a ordem é o que a oficina segue.
--
-- A REGRA, AGORA, EM UMA FRASE
--
--   Um marco puxa a regra quando marco >= km_inicio e (marco - km_inicio) é
--   múltiplo de km_intervalo.
--
-- Com `km_inicio = 0` é exatamente o que já era. Mexeu aqui, mexa em
-- `lib/frota/escopo.ts`: as duas TÊM que concordar.

alter table public.escopos_manutencao
  add column if not exists km_inicio integer not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'escopos_inicio_nao_negativo') then
    alter table public.escopos_manutencao
      add constraint escopos_inicio_nao_negativo check (km_inicio >= 0);
  end if;
  -- A unicidade passa a incluir o início: "a cada 20.000" e "a cada 20.000 a
  -- partir de 10.000" são duas regras diferentes do mesmo modelo.
  if exists (select 1 from pg_constraint where conname = 'escopos_modelo_km') then
    alter table public.escopos_manutencao drop constraint escopos_modelo_km;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'escopos_modelo_km_inicio') then
    alter table public.escopos_manutencao
      add constraint escopos_modelo_km_inicio unique (modelo, km_intervalo, km_inicio);
  end if;
end $$;

comment on column public.escopos_manutencao.km_inicio is
  'Em que km a regra começa a valer. 0 = a cada N km desde o começo; 10000 com intervalo 20000 = 10, 30, 50 mil.';

-- ---------------------------------------------------------------------
-- O plano
-- ---------------------------------------------------------------------
-- O modelo sai de `veiculos`, e não de um texto digitado aqui: o escopo casa
-- por igualdade com `veiculos.modelo`, e "FIAT FIORINO" cadastrado à mão
-- enquanto a frota tem "FIORINO" é um plano que nunca aparece em ordem nenhuma.
--
-- `on conflict do update` para poder rodar duas vezes — e para corrigir a lista
-- reaplicando o arquivo. Atenção: isso SOBRESCREVE o que tiver sido editado na
-- tela para estes intervalos. Editou na tela e quer manter, não reaplique.
insert into public.escopos_manutencao (modelo, km_intervalo, km_inicio, itens, observacao)
select v.modelo, p.km_intervalo, p.km_inicio, p.itens, p.observacao
from (select distinct modelo from public.veiculos where modelo ilike '%FIORINO%') v
cross join (values
  (10000, 0, array[
    'Trocar óleo do motor e filtro de óleo (*)',
    'Verificar níveis de todos os fluidos: freio, embreagem, lavador do para-brisa, direção hidráulica e arrefecimento (nível e contaminação)',
    'Verificar pastilhas de freio dianteiras — trocar se a espessura útil for menor que 5 mm (*)',
    'Verificar escapamento, tubulações de combustível e de freio, borrachas da parte inferior, coifas, guarnições, mangueiras, pneus (desgaste e pressão), suspensão, caixa de direção e junta homocinética',
    'Verificar esguicho e palhetas do para-brisa, cintos de segurança, vidros elétricos, travas das portas, elétrica e eletrônica, carga de bateria e terminais, iluminação interna e externa e painel de instrumentos',
    'Verificar filtro do ar-condicionado (*)',
    'Verificar e, se necessário, regular o freio de estacionamento (***)',
    'Revisão de carroceria: danos e proteções inferiores',
    'Limpar externamente as fechaduras das portas laterais'
  ],
   'Revisão básica, a cada 10.000 km ou 12 meses — o que vier primeiro. ' ||
   'Tolerância do manual: 1.000 km ou 30 dias, para mais ou para menos. ' ||
   'Os itens com (*) valem pela METADE do prazo em uso severo: estrada de terra, poeira, lama, reboque ou entrega de porta em porta. ' ||
   'O (***) pede a rede Fiat para limpeza do freio traseiro quando o veículo roda em terreno não pavimentado.'),

  (20000, 0, array[
    'Trocar filtro de combustível (*)',
    'Trocar elemento do filtro de ar do motor (*)',
    'Verificar correias dos órgãos auxiliares (**)'
  ],
   'No manual, a verificação das correias dos órgãos auxiliares pula as revisões em que a correia é TROCADA (60, 120 e 180 mil). Aqui ela aparece junto: se a ordem trouxer as duas linhas, vale a troca. ' ||
   'O (**) pede controle dos rolamentos e das correias a cada 10.000 km quando o veículo roda em estrada poeirenta.'),

  (20000, 10000, array[
    'Verificar elemento do filtro de ar do motor (*)'
  ],
   'Cai nas revisões ímpares — 10, 30, 50 mil. Nas pares o elemento é trocado, e não verificado.'),

  (30000, 0, array[
    'Verificar folga de válvulas',
    'Verificar cabos das velas de ignição',
    'Verificar sistema de injeção/ignição com equipamento de diagnóstico',
    'Trocar velas de ignição'
  ],
   'A troca das velas é a cada 30.000 km independentemente do tempo.'),

  (40000, 0, array[
    'Verificar sistema de ventilação do cárter do motor (blow-by)',
    'Trocar fluido de freio — e o da embreagem hidráulica, quando houver',
    'Verificar nível do óleo da caixa de câmbio mecânico'
  ],
   'O fluido de freio é a cada 40.000 km ou 24 meses, o que vier primeiro. ' ||
   'O nível do óleo do câmbio está no manual na 4ª, 8ª e 16ª revisões; aqui ficou a cada 40.000 km, que inclui a 12ª — conferir nível a mais não custa serviço.'),

  (50000, 0, array[
    'Verificar sistema evaporativo do tanque de combustível (*)'
  ], null),

  (60000, 40000, array[
    'Verificar visualmente a correia dentada do comando de válvulas (**)'
  ],
   'Cai na 4ª, 10ª e 16ª revisões — sempre 20.000 km antes de cada troca da correia.'),

  (60000, 0, array[
    'Trocar correia dos órgãos auxiliares (*)',
    'Trocar correia dentada do comando de válvulas (*)',
    'Verificar e, se necessário, trocar lonas e tambores de freio traseiros (*) (***)'
  ],
   'As duas correias são a cada 60.000 km ou 48 meses, o que vier primeiro. Correia dentada arrebentada em motor deste tipo entorta válvula: aqui o prazo não se estica.'),

  (120000, 0, array[
    'Trocar óleo da caixa de câmbio mecânico'
  ], null),

  (240000, 0, array[
    'Trocar líquido de arrefecimento do motor'
  ],
   'A cada 240.000 km ou 10 anos, o que vier primeiro.')
) as p(km_intervalo, km_inicio, itens, observacao)
on conflict (modelo, km_intervalo, km_inicio) do update
  set itens = excluded.itens,
      observacao = excluded.observacao,
      ativo = true;

-- ---------------------------------------------------------------------
-- Conferência: o que cada revisão da Fiorino vai imprimir na ordem
-- ---------------------------------------------------------------------
select
  m.marco / 1000 || '.000 km' as revisao,
  count(*) as itens,
  string_agg(i, ' · ' order by e.km_intervalo, i) as escopo
from public.escopos_manutencao e
cross join lateral unnest(e.itens) as i
cross join (values (10000),(20000),(30000),(40000),(50000),(60000),(120000),(240000)) as m(marco)
where e.ativo
  and e.modelo ilike '%FIORINO%'
  and m.marco >= e.km_inicio
  and (m.marco - e.km_inicio) % e.km_intervalo = 0
group by m.marco
order by m.marco;
