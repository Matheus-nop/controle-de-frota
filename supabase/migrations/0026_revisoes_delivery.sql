-- =====================================================================
-- Migração 0026: as listas de inspeção L, MP1 e MP2 do Delivery,
-- transcritas do Manual de Garantia e Manutenção da VW (páginas 4-09 a 4-13)
-- (idempotente; rode no SQL Editor depois da 0025)
-- =====================================================================
--
-- O QUE ISTO COMPLETA
--
-- A 0025 entrou com os intervalos e com tudo o que é TROCADO, mas deixou os
-- tipos de revisão com uma linha só, mandando seguir a lista do manual — as
-- páginas com as listas ainda não tinham sido lidas. Agora foram.
--
-- "Revisão de lubrificação" é o tipo L: daí a letra. Está nas páginas 4-09 e
-- 4-10. A MP1 está na 4-11 e 4-12.
--
-- POR QUE O ÓLEO DO MOTOR SAIU DA LISTA DE 20.000 km
--
-- A 0025 tinha uma regra de 20.000 km só para "trocar óleo do motor e filtro".
-- Ela virou duplicata: as três listas do manual — L, MP1 e MP2 — já trazem
-- "Óleo do motor e filtro de óleo: trocar" no corpo, e toda revisão é uma das
-- três (L cai a cada 40.000 a partir dos 20.000, MP1 e MP2 a cada 80.000,
-- defasadas; a união cobre cada 20.000 km sem buraco). Mantê-la faria a ordem
-- de serviço imprimir a mesma troca duas vezes, e papel com item repetido é
-- papel que a oficina para de ler com atenção. Por isso a regra é apagada
-- aqui.
--
-- POR QUE OS TRABALHOS COMPLEMENTARES CONTINUAM SEPARADOS
--
-- O manual escreve várias linhas de forma condicional — "verificar se a
-- quilometragem atual requer a troca de óleo". Quem responde a essa pergunta é
-- a tabela de intervalos da página 4-21, que virou as regras da 0025. As duas
-- coisas se completam em vez de brigar: a lista diz o que conferir, e a regra
-- do intervalo diz o que, naquele km, efetivamente vence. Por isso os itens
-- complementares passam a começar com "VENCE NESTA REVISÃO", para a oficina
-- ler o papel sem achar que é repetição.
--
-- O QUE A MP2 REVELOU SOBRE AS DUPLICATAS
--
-- A MP2 (páginas 4-13 a 4-15) cai exatamente nos mesmos marcos da regra de
-- 80.000 km: as duas são "a cada 80.000 a partir dos 80.000". E a lista da MP2
-- já manda, sem condicional, trocar o líquido de arrefecimento, trocar a
-- correia e trocar o fluido da embreagem — que eram três dos quatro itens
-- daquela regra. Ficaram duplicados, e por isso saem daqui. Sobra o óleo do
-- diferencial, que na MP2 aparece como "verificar SE a quilometragem requer a
-- troca": esse a regra de intervalo responde, em vez de repetir.
--
-- O filtro de ar da cabine é o caso contrário e fica: a tabela da 4-21 manda
-- trocar a cada 40.000 km, o que inclui os marcos de MP2 — mas a lista da MP2
-- não menciona o item (a da MP1 menciona). Perder a troca em metade dos marcos
-- seria pior do que repetir a linha nos marcos de MP1, então a regra fica.

-- ---------------------------------------------------------------------
-- Fora a duplicata do óleo do motor
-- ---------------------------------------------------------------------
delete from public.escopos_manutencao
 where modelo ilike '%DELIVERY%' and km_intervalo = 20000 and km_inicio = 0;

-- ---------------------------------------------------------------------
-- As listas de inspeção, uma por tipo de revisão
-- ---------------------------------------------------------------------
insert into public.escopos_manutencao (modelo, km_intervalo, km_inicio, itens, observacao)
select v.modelo, p.km_intervalo, p.km_inicio, p.itens, p.observacao
from (select distinct modelo from public.veiculos
       where modelo ilike '%DELIVERY%') v
cross join (values

  -- REVISÃO L (de lubrificação) — manual VW, páginas 4-09 e 4-10
  (40000, 20000, array[
    'Códigos de falha: verificar se há falhas ativas com a ferramenta de diagnóstico, corrigir se necessário',
    'Alavanca externa de liberação da cabine: lubrificar',
    'Sistema de arrefecimento: verificar o nível do líquido e a concentração de aditivo com refratômetro digital e corrigir, se necessário',
    'Lonas dos freios: verificar desgaste e funcionamento do ajustador automático',
    'Compressor de ar: verificar carregamento do sistema e ruído anormal',
    'Pneus: verificar quanto a desgaste',
    'Iluminação externa (direcionais, lanternas, luz alta e baixa, freio, ré e emergência): verificar funcionamento',
    'Óleo do motor e filtro de óleo: trocar',
    'Tubulação entre o filtro de ar e o motor: verificar estado, montagem e fixações das mangueiras e tubulações',
    'Filtro separador de água do combustível: trocar elemento',
    'Tubulações de combustível e suas fixações: inspecionar e corrigir, se necessário',
    'Válvulas do motor: verificar se a quilometragem atual requer a regulagem de válvulas',
    'Cabine: lubrificar com graxa a região entre a placa de atrito da barra de torção e a cabine',
    'Caixa de mudanças: verificar se a quilometragem requer a troca de óleo; caso contrário, verificar nível, vazamentos e limpar respiro',
    'Embreagem: verificar vazamentos, nível de fluido e corrigir, se necessário (somente caixa mecânica)',
    'Eixo dianteiro e traseiro (manga de eixo, suspensões, pinos dos olhais e jumelos, eixo S came e ajustadores, árvores de transmissão, travas da cabine e articulações): lubrificar',
    'Terminais esféricos da direção: verificar folga e estado das coifas',
    'Pinos-mestre do eixo dianteiro: lubrificar',
    'Direção hidráulica: verificar vazamentos e nível do fluido',
    'Grampos de suporte das molas, inclusive 3º eixo (se equipado): verificar fixação e reapertar',
    'Cubo com rolamento unitizado das rodas traseiras: verificar se a quilometragem requer a verificação de ruído e vibração com as rodas livres do solo',
    'Eixo traseiro (diferencial e cubo de roda): verificar se a quilometragem requer a troca de óleo; caso contrário, verificar nível, vazamentos, limpar respiro e verificar posição de montagem',
    'Trava e alarme da cabine: verificar funcionamento',
    'Terminais elétricos das baterias, motor de partida, alternador, conexões à massa, sensores e chicotes: verificar fixações, tensão e interferências que possam causar curto-circuito. Corrigir se necessário',
    'Teste de rodagem: ligar o motor, aguardar o carregamento dos reservatórios de ar, verificar freio de serviço e de estacionamento, e rodar observando direção, freio motor, instrumentos do painel, sistema elétrico, embreagem, caixa de mudanças e rendimento do motor',
    'Indicador da próxima manutenção: ajustar a quilometragem da próxima parada e o grupo de aplicação, com a ferramenta de diagnóstico'
  ],
   'Revisão L (de lubrificação) do manual VW, páginas 4-09 e 4-10. No Grupo III (Severo) cai a cada 40.000 km, começando aos 20.000 — 20, 60, 100, 140 mil...'),

  -- REVISÃO MP1 — manual VW, páginas 4-11 e 4-12
  (80000, 40000, array[
    'Códigos de falha: verificar se há falhas ativas com a ferramenta de diagnóstico, corrigir se necessário',
    'Alavanca externa de liberação da cabine: lubrificar',
    'Pré-filtro de ar do motor: limpar',
    'Sistema de arrefecimento: verificar o nível do líquido e a concentração de aditivo com refratômetro digital e corrigir, se necessário',
    'Filtro de ARLA 32 do sistema SCR: trocar elemento',
    'Filtro de ar da cabine: trocar elemento',
    'Filtro separador de água do combustível: trocar elemento',
    'Tanque de combustível: reapertar as cintas de fixação e verificar vedação do bocal de enchimento',
    'Lonas dos freios: verificar desgaste e funcionamento do ajustador automático',
    'Compressor de ar: verificar carregamento do sistema e ruído anormal',
    'Pneus: verificar quanto a desgaste',
    'Iluminação externa (direcionais, lanternas, luz alta e baixa, freio, ré e emergência): verificar funcionamento',
    'Filtro de ar do motor: trocar elemento',
    'Óleo do motor e filtro de óleo: trocar',
    'Correia e tensor da correia do motor: verificar estado, tensão e fixações',
    'Tubulação entre o filtro de ar e o motor: verificar estado, montagem e fixações das mangueiras e tubulações',
    'Coxins do motor: reapertar',
    'Tubulações de combustível e suas fixações: inspecionar e corrigir, se necessário',
    'Filtro principal de combustível: trocar elemento',
    'Válvulas do motor: verificar se a quilometragem atual requer a regulagem de válvulas',
    'Caixa de mudanças: verificar se a quilometragem requer a troca de óleo; caso contrário, verificar nível, vazamentos e limpar respiro',
    'Eixo dianteiro e traseiro (manga de eixo, suspensões, pinos dos olhais e jumelos, eixo S came e ajustadores, árvores de transmissão, travas da cabine e articulações): lubrificar',
    'Grampos e suportes das molas, inclusive 3º eixo (se equipado): verificar fixação e reapertar',
    'Suspensões dianteira e traseira (amortecedores, jumelos, olhais das molas e barras estabilizadoras): reapertar',
    'Coluna de direção (cruzeta): verificar fixação',
    'Terminais esféricos da direção: verificar folga e estado das coifas',
    'Caixa de direção: reapertar',
    'Pinos-mestre do eixo dianteiro: lubrificar',
    'Direção hidráulica: verificar vazamentos e nível do fluido',
    'Cubo com rolamento unitizado das rodas traseiras: verificar se a quilometragem requer a verificação de ruído e vibração com as rodas livres do solo',
    'Eixo traseiro (diferencial e cubo de roda): verificar se a quilometragem requer a troca de óleo; caso contrário, verificar nível, limpar respiro e verificar posição de montagem',
    'Trava e alarme da cabine: verificar funcionamento',
    'Teste de rodagem: ligar o motor, aguardar o carregamento dos reservatórios de ar, verificar freio de serviço e de estacionamento, e rodar observando direção, freio motor, instrumentos do painel, sistema elétrico, embreagem, caixa de mudanças e rendimento do motor',
    'Indicador da próxima manutenção: ajustar a quilometragem da próxima parada e o grupo de aplicação, com a ferramenta de diagnóstico'
  ],
   'Revisão MP1 do manual VW, páginas 4-11 e 4-12. No Grupo III (Severo) cai a cada 80.000 km, começando aos 40.000 — 40, 120, 200, 280 mil...'),

  -- REVISÃO MP2 — manual VW, páginas 4-13, 4-14 e 4-15
  (80000, 80000, array[
    'Códigos de falha: verificar se há falhas ativas com a ferramenta de diagnóstico, corrigir se necessário',
    'Alavanca externa de liberação da cabine: lubrificar',
    'Pré-filtro de ar do motor: limpar',
    'Sistema de arrefecimento: verificar se a quilometragem requer a troca do líquido; caso contrário, verificar nível e concentração de aditivo com refratômetro digital e corrigir, se necessário',
    'Filtro de ARLA 32 do sistema SCR: trocar elemento',
    'Filtro separador de água do combustível: trocar elemento',
    'Tanque de combustível: reapertar as cintas de fixação e verificar vedação do bocal de enchimento',
    'Lonas dos freios: verificar desgaste e funcionamento do ajustador automático',
    'Compressor de ar: verificar carregamento do sistema e ruído anormal',
    'Cubo com rolamento unitizado das rodas dianteiras: verificar ruído e vibração com as rodas livres do solo',
    'Pneus: verificar quanto a desgaste',
    'Iluminação externa (direcionais, lanternas, luz alta e baixa, freio e emergência): verificar funcionamento',
    'Filtro de ar do motor: trocar elemento',
    'Óleo do motor e filtro de óleo: trocar',
    'Correia e tensor da correia do motor: trocar a correia e verificar o estado do tensor',
    'Tubulação entre o filtro de ar e o motor: verificar estado, montagem e fixação das mangueiras e tubulações',
    'Tubulações de combustível e suas fixações: inspecionar e corrigir, se necessário',
    'Coxins do motor: reapertar',
    'Filtro principal de combustível: trocar elemento',
    'Válvulas do motor: verificar se a quilometragem atual requer a regulagem de válvulas',
    'Cabine: lubrificar com graxa a região entre a placa de atrito da barra de torção e a cabine',
    'Caixa de mudanças: verificar se a quilometragem requer a troca de óleo; caso contrário, verificar nível, vazamentos e limpar respiro',
    'Embreagem: trocar fluido e verificar vazamentos (somente caixa mecânica)',
    'Fluido hidráulico da caixa automatizada: verificar se a quilometragem requer a troca do fluido do conjunto hidráulico, conforme a tabela de revisões',
    'Filtro coalescente de ar: trocar elemento',
    'Sistema de arrefecimento: trocar o líquido',
    'Suspensões dianteira e traseira (amortecedores, jumelos, olhais das molas e barras estabilizadoras): reapertar',
    'Eixo dianteiro e traseiro (manga de eixo, suspensões, pinos dos olhais e jumelos, eixo S came e ajustadores, árvores de transmissão, travas da cabine e articulações): lubrificar',
    'Terminais esféricos da direção: verificar folga e estado das coifas',
    'Caixa de direção: reapertar',
    'Pinos-mestre do eixo dianteiro: lubrificar',
    'Manga do eixo dianteiro: verificar folga',
    'Grampos e suportes das molas, inclusive 3º eixo (se equipado): verificar fixação e reapertar',
    'Coluna de direção (cruzeta): verificar fixação',
    'Direção hidráulica: verificar vazamentos e nível do fluido',
    'Eixo traseiro (diferencial e cubo de roda): verificar se a quilometragem requer a troca de óleo; caso contrário, verificar nível, vazamentos, limpar respiro e verificar posição de montagem',
    'Árvore de transmissão (cruzeta): verificar quanto a folga e desgaste',
    'Eixo came e ajustadores dos freios dianteiros e traseiros: remover e revisar',
    'Trava e alarme da cabine: verificar funcionamento',
    'Terminais elétricos das baterias, motor de partida, alternador, conexões à massa, sensores e chicotes: verificar fixações, tensão e interferências que possam causar curto-circuito. Corrigir se necessário',
    'Teste de rodagem: ligar o motor, aguardar o carregamento dos reservatórios de ar, verificar freio de serviço e de estacionamento, e rodar observando direção, freio motor, instrumentos do painel, sistema elétrico, embreagem, caixa de mudanças e rendimento do motor',
    'Indicador da próxima manutenção: ajustar a quilometragem da próxima parada e o grupo de aplicação, com a ferramenta de diagnóstico'
  ],
   'Revisão MP2 do manual VW, páginas 4-13 a 4-15. A mais completa das três. No Grupo III (Severo) cai a cada 80.000 km, começando aos 80.000 — 80, 160, 240, 320 mil...')

) as p(km_intervalo, km_inicio, itens, observacao)
on conflict (modelo, km_intervalo, km_inicio) do update
  set itens = excluded.itens, observacao = excluded.observacao, ativo = true;

-- ---------------------------------------------------------------------
-- Os complementares, agora identificados como "o que vence neste km"
-- ---------------------------------------------------------------------
update public.escopos_manutencao set itens = array[
  'VENCE NESTA REVISÃO: trocar filtro de ar da cabine (a cada 40.000 km)']
 where modelo ilike '%DELIVERY%' and km_intervalo = 40000 and km_inicio = 0;

update public.escopos_manutencao set itens = array[
  'VENCE NESTA REVISÃO: regular válvulas do motor (a cada 60.000 km)']
 where modelo ilike '%DELIVERY%' and km_intervalo = 60000 and km_inicio = 0;

-- Só o diferencial: arrefecimento, correia e embreagem já entram na lista da
-- MP2 sem condicional, e a MP2 cai nestes mesmos marcos.
update public.escopos_manutencao set itens = array[
  'VENCE NESTA REVISÃO: trocar óleo do diferencial — mineral API-GL5 SAE 85W140 (80.000 km ou 48 meses)']
 where modelo ilike '%DELIVERY%' and km_intervalo = 80000 and km_inicio = 0;

update public.escopos_manutencao set itens = array[
  'VENCE NESTA REVISÃO: trocar fluido do conjunto hidráulico da caixa automatizada EATON — Tutela CS Speed (a cada 160.000 km)']
 where modelo ilike '%DELIVERY%' and km_intervalo = 160000 and km_inicio = 0;

update public.escopos_manutencao set itens = array[
  'VENCE NESTA REVISÃO: trocar óleo da caixa de mudanças EATON — mineral API GL3 ou GL4 SAE 80W90 (200.000 km ou 12 meses)']
 where modelo ilike '%DELIVERY%' and km_intervalo = 200000 and km_inicio = 0;

update public.escopos_manutencao set itens = array[
  'VENCE NESTA REVISÃO: verificar ruído e vibração do cubo com rolamento unitizado das rodas traseiras (a cada 260.000 km)']
 where modelo ilike '%DELIVERY%' and km_intervalo = 260000 and km_inicio = 0;

-- ---------------------------------------------------------------------
-- Conferência
-- ---------------------------------------------------------------------
select
  case
    when e.km_intervalo = 40000 and e.km_inicio = 20000 then 'L'
    when e.km_intervalo = 80000 and e.km_inicio = 40000 then 'MP1'
    when e.km_intervalo = 80000 and e.km_inicio = 80000 then 'MP2'
    else 'complementar ' || e.km_intervalo / 1000 || 'k'
  end as regra,
  cardinality(e.itens) as itens
from public.escopos_manutencao e
where e.modelo ilike '%DELIVERY%' and e.ativo
order by e.km_inicio desc, e.km_intervalo;
