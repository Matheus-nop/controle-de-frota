-- =====================================================================
-- Migração 0025: o plano de manutenção do VW Delivery 9.170,
-- do Manual de Garantia e Manutenção da VW Caminhões e Ônibus
-- (idempotente; rode no SQL Editor depois da 0024)
-- =====================================================================
--
-- DE ONDE VEIO
--
-- A VW não publica este plano na internet. Ele está no "Manual de Garantia e
-- Manutenção" — o único livreto que a VW continuou entregando impresso junto
-- com o caminhão depois que o manual de bordo virou digital. Páginas 4-16 a
-- 4-22, capítulo "Serviço de manutenção".
--
-- COMO A VW ORGANIZA, E POR QUE O GRUPO IMPORTA TANTO
--
-- Diferente da Fiat e da Kia, a VW não tem um intervalo só: ela define quatro
-- GRUPOS DE APLICAÇÃO, e o mesmo caminhão tem plano diferente em cada um.
--
--   Grupo I  Rodoviário  revisão a cada 40.000 km
--   Grupo II Misto       revisão a cada 30.000 km
--   Grupo III Severo     revisão a cada 20.000 km   <— o nosso
--   Grupo IV Especial    por hora de motor, não por km
--
-- A frota entrega equipamento de locação na cidade: trânsito, percurso curto,
-- muita parada, obra. É Grupo III, Severo — decidido pelo gestor. Se um dia a
-- aplicação mudar, é esta migração que muda, e todos os números junto.
--
-- O CICLO DE REVISÕES
--
-- As revisões se alternam em quatro tipos que se repetem:  L · MP1 · L · MP2.
-- No Severo, com revisão a cada 20.000 km, isso cai assim:
--
--   L    20, 60, 100, 140...   a cada 40.000, começando aos 20.000
--   MP1  40, 120, 200, 280...  a cada 80.000, começando aos 40.000
--   MP2  80, 160, 240, 320...  a cada 80.000, começando aos 80.000
--
-- que é exatamente o que o km_inicio da 0020 sabe representar.
--
-- O QUE ESTA MIGRAÇÃO COBRE, E O QUE FALTA
--
-- Tudo o que é TROCADO está aqui: a tabela "Intervalos para troca de óleo dos
-- agregados" (página 4-21) lista item por item, com o intervalo de cada grupo.
-- É texto, não depende de interpretar pontinho em coluna estreita, e foi
-- conferida contra a tabela de revisões da 4-16: a regulagem de válvulas marca
-- 60, 120, 180, 240, 300 e 360 mil na coluna Severo — exatamente o "a cada
-- 60.000" da 4-21.
--
-- O que NÃO está aqui é a lista de INSPEÇÕES de cada tipo de revisão (o que o
-- mecânico confere numa L, numa MP1 e numa MP2 além de trocar). Essas páginas
-- do manual ainda não foram lidas. Por isso cada tipo entra com uma linha que
-- manda seguir a lista do manual, em vez de a ordem de serviço sair em branco
-- fingindo que a revisão é só a troca.
--
-- O assentamento (entre 1.000 e 5.000 km) ficou de fora de propósito: é uma
-- revisão única de amaciamento, não um intervalo que se repete, e o caminhão
-- da frota passou disso faz tempo.

insert into public.escopos_manutencao (modelo, km_intervalo, km_inicio, itens, observacao)
select v.modelo, p.km_intervalo, p.km_inicio, p.itens, p.observacao
from (select distinct modelo from public.veiculos
       where modelo ilike '%DELIVERY%') v
cross join (values

  -- Toda revisão, a cada 20.000 km no Severo.
  (20000, 0, array[
    'Trocar óleo do motor e elemento filtrante (mineral API-CI4 SAE 15W40 ou superior)'
  ],
   'Revisão do plano VW, Grupo III (Severo): a cada 20.000 km ou 6 meses, o que ocorrer primeiro. O motor é o Cummins ISF 3.8 Euro 5. ATENÇÃO: fazer a revisão dentro do prazo é condição para o caminhão continuar com cobertura de garantia.'),

  -- Os tipos de revisão. Enquanto a lista de inspeções do manual não for lida,
  -- estas linhas dizem à oficina qual lista seguir — sem inventar itens.
  (40000, 20000, array[
    'Revisão tipo L — seguir a lista de inspeção do tipo L no manual VW'
  ],
   'A revisão L cai a cada 40.000 km no Severo (20, 60, 100 mil...), alternando com as MP. A lista de inspeção ainda não foi transcrita do manual.'),

  (80000, 40000, array[
    'Revisão tipo MP1 — seguir a lista de inspeção do tipo MP1 no manual VW'
  ],
   'A MP1 cai a cada 80.000 km no Severo, começando aos 40.000 (40, 120, 200 mil...). A lista de inspeção ainda não foi transcrita do manual.'),

  (80000, 80000, array[
    'Revisão tipo MP2 — seguir a lista de inspeção do tipo MP2 no manual VW'
  ],
   'A MP2 cai a cada 80.000 km no Severo, começando aos 80.000 (80, 160, 240 mil...). É a mais completa das três. A lista de inspeção ainda não foi transcrita do manual.'),

  -- Os trabalhos complementares, um a um, com o intervalo do Grupo III.
  (40000, 0, array[
    'Trocar filtro de ar da cabine'
  ],
   'A cada 40.000 km no Severo.'),

  (60000, 0, array[
    'Regular válvulas do motor'
  ],
   'A cada 60.000 km no Severo.'),

  (80000, 0, array[
    'Trocar óleo do diferencial (mineral API-GL5 SAE 85W140)',
    'Trocar fluido da embreagem',
    'Trocar líquido de arrefecimento',
    'Trocar correia do motor e verificar o estado do tensor'
  ],
   'A cada 80.000 km no Severo. Diferencial: 80.000 km ou 48 meses. Embreagem e arrefecimento: 80.000 km ou 24 meses — o que ocorrer primeiro. A correia é por km.'),

  (160000, 0, array[
    'Trocar fluido do conjunto hidráulico da caixa de mudanças automatizada EATON (Tutela CS Speed)'
  ],
   'A cada 160.000 km no Severo. Só se a caixa for a automatizada EATON EAO 6106A.'),

  (200000, 0, array[
    'Trocar óleo da caixa de mudanças EATON (mineral API GL3 ou GL4 SAE 80W90)'
  ],
   'A cada 200.000 km ou 12 meses no Severo, o que ocorrer primeiro.'),

  (260000, 0, array[
    'Verificar ruído e vibração do cubo com rolamento unitizado das rodas traseiras'
  ],
   'A cada 260.000 km no Severo.')

) as p(km_intervalo, km_inicio, itens, observacao)
on conflict (modelo, km_intervalo, km_inicio) do update
  set itens = excluded.itens, observacao = excluded.observacao, ativo = true;

-- ---------------------------------------------------------------------
-- Conferência
-- ---------------------------------------------------------------------
-- Primeiro: o Delivery está cadastrado? Sem veículo, o insert acima não cria
-- nada, e o silêncio pareceria sucesso.
select count(*) as veiculos_delivery from public.veiculos where modelo ilike '%DELIVERY%';

-- Depois: o que cada revisão vai imprimir, até os 320.000 km.
select
  e.modelo,
  m.marco / 1000 || '.000 km' as marco,
  count(*) as itens
from public.escopos_manutencao e
cross join lateral unnest(e.itens) as i
cross join (select generate_series(20000, 320000, 20000) as marco) as m
where e.ativo
  and e.modelo ilike '%DELIVERY%'
  and m.marco >= e.km_inicio
  and (m.marco - e.km_inicio) % e.km_intervalo = 0
group by e.modelo, m.marco
order by e.modelo, m.marco;
