-- =====================================================================
-- Migração 0023: os planos de manutenção dos Bongos, do manual oficial
-- (idempotente; rode no SQL Editor depois da 0022)
-- =====================================================================
--
-- DE ONDE VEIO
--
-- O manual do proprietário do Bongo não traz o plano — ele fica no "Manual de
-- Garantia e Manutenção", um segundo livreto. A Kia publica os dois em PDF:
--
--   até o ano-modelo 2025:  kia-manual-proprietario-digital-bongo-ate-2025.pdf
--   a partir de 2026:       kia-manual-proprietario-digital-bongo-a-partir-2026.pdf
--
-- em kiasiteblob.kia.com.br/site/Manuais de Garantia e Manutenção/. São os
-- documentos oficiais, com marca-d'água "Versão Digital" e o ano-modelo.
--
-- COMO A KIA ORGANIZA O PLANO, E COMO ISSO VIRA REGRA AQUI
--
-- A Kia não lista "a cada X km" item por item: ela define TIPOS de revisão e um
-- ciclo. Até 2025 são três tipos, a cada 10.000 km, no ciclo
--
--   A  B  A  C  A  B  A  B  A  C   (1ª a 10ª, e o bloco se repete)
--
-- ou seja: A nas revisões ímpares (10, 30, 50, 70, 90 mil), B nas 20, 60 e 80
-- mil, C nas 40 e 100 mil — tudo dentro de um ciclo de 100.000 km.
--
-- Traduzindo para as regras daqui:
--   • o que é feito em A, B e C          → a cada 10.000 km
--   • o que só é feito em B e C          → a cada 20.000 km (as revisões pares)
--   • o que só é feito em C              → 40.000 e 100.000 dentro do ciclo,
--                                          que são duas regras de 100.000 km,
--                                          uma começando aos 40 e outra aos 100
--
-- A partir de 2026 são dois tipos, a cada 15.000 km, no ciclo A A B — a revisão
-- B cai de três em três, ou seja, a cada 45.000 km. Encaixa direto.
--
-- O QUE FICOU DE FORA, E POR QUÊ
--
-- O manual avisa: "o plano se aplica a todas as versões; alguns itens podem não
-- se aplicar ao seu veículo". O Bongo é DIESEL, então não entraram as linhas de
-- vela de ignição, válvulas injetoras de gasolina/flex, filtro de combustível da
-- bomba (gasolina), partida a frio (flex) e inspeção de emissão por gasolina —
-- no lugar dela entra a inspeção de opacidade, que é a do diesel. As linhas de
-- 4x4 (caixa de transferência e diferencial dianteiro) também ficaram de fora;
-- se algum Bongo da frota for 4x4, elas voltam.

-- ---------------------------------------------------------------------
-- KIA BONGO, até o ano-modelo 2025 — a cada 10.000 km ou 12 meses
-- ---------------------------------------------------------------------
insert into public.escopos_manutencao (modelo, km_intervalo, km_inicio, itens, observacao)
select v.modelo, p.km_intervalo, p.km_inicio, p.itens, p.observacao
from (select distinct modelo from public.veiculos
       where modelo ilike '%BONGO%' and modelo not ilike '%2026%') v
cross join (values
  (10000, 0, array[
    'Trocar óleo do motor e filtro de óleo',
    'Trocar filtro de combustível (diesel)',
    'Inspecionar correias acionadoras',
    'Inspecionar elemento do filtro de ar',
    'Inspecionar filtro anti-pólen do sistema de climatização',
    'Inspecionar nível e densidade do eletrólito e as condições da bateria',
    'Inspecionar sistema de arrefecimento: radiador, tampa, conexões e mangueiras',
    'Inspecionar mangueiras e conexões do sistema de ar quente',
    'Inspecionar compressor do ar-condicionado',
    'Inspecionar componentes do sistema de controle de emissões',
    'Inspecionar tubos, mangueiras e conexões de combustível e admissão',
    'Inspecionar tubos, mangueiras e conexões do sistema de vácuo, respiro do cárter e EGR',
    'Inspecionar tubos, mangueiras e conexões do sistema canister e tampa do bocal do tanque',
    'Inspecionar fluido da direção hidráulica',
    'Inspecionar óleo da transmissão manual',
    'Inspecionar óleo do diferencial traseiro',
    'Inspecionar coifas das juntas homocinéticas',
    'Inspecionar juntas esféricas da suspensão dianteira',
    'Inspecionar tubos, mangueiras e conexões do sistema de freios',
    'Inspecionar tanque de ureia/ARLA 32, tampa de abastecimento, tubos, mangueiras e conexões',
    'Inspecionar sistema de escapamento: tubos, silencioso, sensores, módulos, DPF, catalisador e conexões',
    'Inspecionar estado geral e pressão dos pneus',
    'Inspecionar freio a disco',
    'Inspecionar freio a tambor',
    'Verificar fixações da carroceria e dos agregados e integridade do chassi (trincas e rachaduras)',
    'Inspecionar opacidade pelo método de aceleração livre (diesel)',
    'Inspecionar rotação de marcha lenta',
    'Verificar os sistemas com o equipamento de diagnóstico',
    'Registrar a execução da revisão no equipamento de diagnóstico KDS',
    'Testar todos os sistemas elétricos do veículo',
    'Inspecionar pedais de freio e embreagem',
    'Inspecionar operação da direção e da caixa de direção',
    'Inspecionar eficiência do resfriamento do ar-condicionado',
    'Ajustar portas e tampas',
    'Torquear porcas de rodas',
    'Alinhar a direção e balancear as rodas'
  ],
   'Revisão tipo A do plano Kia, a cada 10.000 km ou 12 meses — o que vier primeiro. ' ||
   'ATENÇÃO: a Kia exclui o veículo da garantia se alguma revisão do plano não for feita dentro da faixa de km e/ou tempo, e o controle de manutenção precisa estar carimbado por concessionário. ' ||
   'Em uso severo os prazos caem pela METADE: rodar menos de 5.000 km em 6 meses, região de muita poeira, marcha lenta prolongada, trânsito intenso ou percursos curtos frequentes. ' ||
   'Em estrada de terra ou muita poeira, o elemento do filtro de ar deve ser inspecionado a cada 1.000 km e trocado a cada 5.000 km. ' ||
   'O desgaste das pastilhas de freio deve ser acompanhado a cada 2.500 km, fora do plano.'),

  (20000, 0, array[
    'Trocar elemento do filtro de ar',
    'Trocar filtro anti-pólen do sistema de climatização',
    'Inspecionar unidade de servo freio e mangueiras',
    'Inspecionar sistema de direção hidráulica e mangueiras',
    'Inspecionar bicos injetores (diesel)',
    'Lubrificar eixo cardan e juntas',
    'Inspecionar articulações e terminais da direção',
    'Inspecionar alinhamento dos faróis',
    'Lubrificar dobradiças e fechos'
  ],
   'O que o plano Kia acrescenta nas revisões B e C — as revisões pares. ' ||
   'Se a ordem trouxer "inspecionar" e "trocar" o mesmo filtro, vale a troca.'),

  (40000, 0, array[
    'Trocar fluido de freio e do sistema de embreagem'
  ],
   'A cada 40.000 km ou 2 anos, o que vier primeiro. Com carga constante, serra ou clima úmido, a Kia manda trocar anualmente.'),

  (60000, 0, array[
    'Trocar correias acionadoras',
    'Trocar filtro de ar do tanque de combustível'
  ],
   'As correias são a cada 60.000 km ou 3 anos, o que vier primeiro. O manual avisa que correia rompida causa dano extenso ao motor e exclui a garantia.'),

  (80000, 0, array[
    'Ajustar folga de válvulas (somente com ajuste mecânico)',
    'Trocar líquido de arrefecimento'
  ],
   'O líquido de arrefecimento é a cada 80.000 km ou 4 anos, o que vier primeiro.'),

  (100000, 40000, array['Trocar óleo do diferencial traseiro'],
   'Revisão tipo C do plano Kia: cai aos 40.000 km e se repete a cada 100.000 (140, 240 mil...). Nas demais revisões o óleo é só inspecionado.'),

  (100000, 100000, array['Trocar óleo do diferencial traseiro'],
   'A outra revisão tipo C do ciclo Kia: 100.000 km, e a cada 100.000 depois disso (200, 300 mil...).')
) as p(km_intervalo, km_inicio, itens, observacao)
on conflict (modelo, km_intervalo, km_inicio) do update
  set itens = excluded.itens, observacao = excluded.observacao, ativo = true;

-- ---------------------------------------------------------------------
-- KIA BONGO 2026 — a cada 15.000 km ou 12 meses, ciclo A A B
-- ---------------------------------------------------------------------
insert into public.escopos_manutencao (modelo, km_intervalo, km_inicio, itens, observacao)
select v.modelo, p.km_intervalo, p.km_inicio, p.itens, p.observacao
from (select distinct modelo from public.veiculos where modelo ilike '%BONGO%2026%') v
cross join (values
  (15000, 0, array[
    'Trocar óleo do motor e filtro de óleo',
    'Trocar filtro de combustível (diesel)',
    'Trocar elemento do filtro de ar',
    'Aplicar o aditivo Kia Fuel Cleaner (via tanque)',
    'Lubrificar eixo cardan e juntas',
    'Lubrificar dobradiças e fechos',
    'Inspecionar correias acionadoras',
    'Inspecionar fluido de freio e do sistema de embreagem',
    'Inspecionar filtro de ar do tanque de combustível',
    'Inspecionar líquido de arrefecimento',
    'Inspecionar nível e densidade do eletrólito e as condições da bateria',
    'Inspecionar sistema de arrefecimento: radiador, tampa, conexões e mangueiras',
    'Inspecionar mangueiras e conexões do sistema de ar quente',
    'Inspecionar compressor do ar-condicionado',
    'Inspecionar unidade de servo freio e mangueiras',
    'Inspecionar sistema de direção hidráulica e mangueiras',
    'Inspecionar componentes do sistema de controle de emissões',
    'Inspecionar tubos, mangueiras e conexões de combustível e admissão',
    'Inspecionar tubos, mangueiras e conexões do sistema de vácuo, respiro do cárter e EGR',
    'Inspecionar tubos, mangueiras e conexões do sistema canister e tampa do bocal do tanque',
    'Inspecionar injetores de combustível (diesel)',
    'Inspecionar fluido da direção hidráulica',
    'Inspecionar filtro anti-pólen/poeira do sistema de climatização',
    'Inspecionar óleo da transmissão manual',
    'Inspecionar óleo do diferencial traseiro',
    'Inspecionar articulações e terminais da direção',
    'Inspecionar coifas das juntas homocinéticas',
    'Inspecionar juntas esféricas da suspensão dianteira',
    'Inspecionar tubos, mangueiras e conexões do sistema de freios',
    'Inspecionar tanque de ureia/ARLA 32, tampa de abastecimento, tubos, mangueiras, injetor/aquecedor e conexões',
    'Inspecionar sistema de escapamento: tubos, silencioso, sensores, módulos, DPF, catalisador e conexões',
    'Inspecionar estado geral e pressão dos pneus',
    'Inspecionar freio a disco',
    'Inspecionar freio a tambor',
    'Verificar fixações da carroceria e dos agregados e integridade do chassi (trincas e rachaduras)',
    'Inspecionar opacidade pelo método de aceleração livre (diesel)',
    'Inspecionar rotação de marcha lenta',
    'Verificar os sistemas com o equipamento de diagnóstico',
    'Registrar a execução da revisão no equipamento de diagnóstico KDS',
    'Testar todos os sistemas elétricos do veículo',
    'Inspecionar pedais de freio e embreagem',
    'Inspecionar operação da direção e da caixa de direção',
    'Inspecionar eficiência do resfriamento do ar-condicionado',
    'Inspecionar alinhamento dos faróis',
    'Ajustar portas e tampas',
    'Torquear porcas de rodas',
    'Alinhar a direção e balancear as rodas'
  ],
   'Revisão tipo A do plano Kia 2026, a cada 15.000 km ou 12 meses — o que vier primeiro. Tolerância de ±500 km ou ±1 mês. ' ||
   'ATENÇÃO: a Kia exclui o veículo da garantia se alguma revisão do plano não for feita dentro da faixa de km e/ou tempo, e o controle precisa estar carimbado por concessionário. ' ||
   'Em uso severo os prazos caem pela METADE: rodar menos de 5.000 km em 6 meses, região de muita poeira, marcha lenta prolongada, trânsito intenso ou percursos curtos frequentes. ' ||
   'Em estrada de terra ou muita poeira, o elemento do filtro de ar deve ser inspecionado a cada 1.000 km e trocado a cada 5.000 km. ' ||
   'O desgaste das pastilhas de freio deve ser acompanhado a cada 2.500 km, fora do plano. ' ||
   'Se o veículo for submerso até a altura do centro da roda, trocar o óleo do diferencial traseiro fora do plano.'),

  (45000, 0, array[
    'Trocar óleo do diferencial traseiro',
    'Trocar fluido de freio e do sistema de embreagem'
  ],
   'Revisão tipo B do plano Kia 2026, que cai de três em três revisões — 45, 90, 135 mil. ' ||
   'O fluido de freio é a cada 45.000 km ou 2 anos, o que vier primeiro; com carga constante, serra ou clima úmido, a Kia manda trocar anualmente.'),

  (60000, 0, array[
    'Trocar correias acionadoras',
    'Trocar filtro de ar do tanque de combustível'
  ],
   'As correias são a cada 60.000 km ou 3 anos, o que vier primeiro. O manual avisa que correia rompida causa dano extenso ao motor e exclui a garantia.'),

  (75000, 0, array[
    'Trocar líquido de arrefecimento'
  ],
   'A cada 75.000 km ou 4 anos, o que vier primeiro.')
) as p(km_intervalo, km_inicio, itens, observacao)
on conflict (modelo, km_intervalo, km_inicio) do update
  set itens = excluded.itens, observacao = excluded.observacao, ativo = true;

-- ---------------------------------------------------------------------
-- Conferência: o que cada revisão dos dois Bongos vai imprimir
-- ---------------------------------------------------------------------
select
  e.modelo,
  m.marco / 1000 || '.000 km' as marco,
  count(*) as itens
from public.escopos_manutencao e
cross join lateral unnest(e.itens) as i
cross join (values (10000),(15000),(20000),(30000),(40000),(45000),(60000),(75000),(80000),(90000),(100000),(120000)) as m(marco)
where e.ativo
  and e.modelo ilike '%BONGO%'
  and m.marco >= e.km_inicio
  and (m.marco - e.km_inicio) % e.km_intervalo = 0
group by e.modelo, m.marco
order by e.modelo, m.marco;
