-- =====================================================================
-- Migração 0022: o plano de manutenção da Strada, do manual
-- (idempotente; rode no SQL Editor depois da 0021)
-- =====================================================================
--
-- Lido das páginas F-15, F-16 e F-17 do manual da Strada — "Plano de Manutenção
-- Programada, versões com motor TURBO 200 e 1.3 Firefly", revisões 01ª a 18ª.
--
-- MOTOR TURBO 200, CONFIRMADO PELO GESTOR
--
-- A tabela do manual é compartilhada pelos dois motores, e várias linhas dizem
-- de qual delas se trata: o filtro de combustível do 1.3 Firefly é a cada
-- 20.000 km, o do TURBO 200 é a cada 10.000; as velas do Firefly são a cada
-- 40.000, as do TURBO 200 a cada 60.000. Aqui está cadastrado SÓ o que vale
-- para o TURBO 200 — cadastrar a linha do motor errado seria mandar a oficina
-- trocar peça fora de hora, com o papel do sistema dando razão a ela.
--
-- Se um dia entrar uma Strada 1.3 Firefly na frota, ela precisa de um modelo
-- próprio em `veiculos` (como o "KIA BONGO 2026" da 0016), e não de uma linha a
-- mais aqui.
--
-- NÃO EXISTE CORREIA DENTADA NESTE PLANO
--
-- E não é esquecimento: o TURBO 200 usa corrente de distribuição, que não tem
-- troca programada. A correia que aparece é a dos órgãos auxiliares.

insert into public.escopos_manutencao (modelo, km_intervalo, km_inicio, itens, observacao)
select v.modelo, p.km_intervalo, p.km_inicio, p.itens, p.observacao
from (select distinct modelo from public.veiculos where modelo ilike '%STRADA%') v
cross join (values
  (10000, 0, array[
    'Trocar óleo do motor e filtro de óleo (*)',
    'Trocar filtro de combustível (*)',
    'Verificar elemento do filtro de ar do motor (**)',
    'Verificar níveis dos líquidos e fluidos de todos os sistemas: arrefecimento do motor (nível e contaminação), freios, embreagem e lavador dos vidros',
    'Verificar pastilhas de freio dianteiras — trocar se a espessura útil for menor que 5 mm',
    'Verificar tubulações de escapamento, alimentação de combustível e freios; borrachas da parte inferior, coifas, guarnições, mangueiras e pneus (desgaste e pressão); suspensões, caixa de direção e junta homocinética',
    'Verificar freio de estacionamento; regular se necessário (***)',
    'Verificar esguicho e palhetas dos vidros traseiros e do para-brisa, cintos de segurança, vidros elétricos, travas das portas, elétrica e eletrônica, iluminação interna, externa e sinalização, painel de instrumentos e estado da bateria',
    'Verificar filtro do ar-condicionado (*)',
    'Verificar sistema de injeção/ignição com equipamento de diagnóstico e RESETAR O AVISO DE REVISÕES do painel',
    'Revisão de carroceria: danos, inclusive nas proteções inferiores'
  ],
   'Revisão básica da Strada TURBO 200, a cada 10.000 km ou 12 meses — o que vier primeiro. ' ||
   'Tolerância do manual: 1.000 km ou 30 dias, para mais ou para menos. ' ||
   'A verificação do filtro de ar não aparece nas revisões de 30 em 30 mil porque nelas o elemento é TROCADO; se a ordem trouxer as duas linhas, vale a troca. ' ||
   'O (**) manda trocar o elemento do filtro de ar em TODAS as revisões quando o veículo roda em estrada poeirenta, arenosa ou lamacenta. ' ||
   'Os itens com (*) valem pela METADE do prazo em uso severo — estrada de terra, reboque, táxi, entrega de porta em porta ou longa inatividade. ' ||
   'O (***) pede a rede Fiat para limpeza, lubrificação e regulagem do freio quando o veículo roda em terreno não pavimentado.'),

  (20000, 0, array[
    'Verificar correia dos órgãos auxiliares do motor (*)'
  ], null),

  (30000, 0, array[
    'Trocar elemento do filtro de ar do motor (**)'
  ], null),

  (40000, 0, array[
    'Trocar fluido de freio',
    'Verificar nível do óleo da caixa de câmbio mecânico (se equipado)'
  ],
   'O fluido de freio é a cada 40.000 km ou 24 meses, o que vier primeiro.'),

  (50000, 0, array[
    'Verificar nível de emissões dos gases de escapamento',
    'Verificar sistema evaporativo do tanque de combustível (*) (****)'
  ],
   'O (****) manda trocar o pré-filtro do canister (filtro + tubo) a cada 10.000 km quando o veículo roda em estrada poeirenta. Excesso de poeira nesse componente faz o veículo se comportar de forma irregular.'),

  (60000, 0, array[
    'Trocar velas de ignição',
    'Verificar e, se necessário, trocar lonas de freio traseiras — trocar se alguma estiver com menos de 2 mm (*) (***)'
  ],
   'As velas do TURBO 200 são a cada 60.000 km, independentemente do tempo. No 1.3 Firefly seriam 40.000 — não é o caso desta frota.'),

  (120000, 0, array[
    'Inspecionar e, se necessário, trocar a válvula PRV (*)',
    'Trocar correia dos órgãos auxiliares do motor (*)',
    'Trocar óleo da caixa de câmbio mecânico (se equipado)'
  ],
   'A correia dos órgãos auxiliares do TURBO 200 é a cada 120.000 km ou 6 anos, o que vier primeiro. ' ||
   'No manual estes três caem numa revisão só, lá no fim da tabela; a leitura da coluna tem a margem de erro de uma foto de página encadernada, então confira contra o livro antes da primeira ordem que chegar nesse marco.'),

  (240000, 0, array[
    'Trocar líquido de arrefecimento do motor (*)'
  ],
   'A cada 240.000 km ou 120 meses, o que vier primeiro.')
) as p(km_intervalo, km_inicio, itens, observacao)
on conflict (modelo, km_intervalo, km_inicio) do update
  set itens = excluded.itens,
      observacao = excluded.observacao,
      ativo = true;

-- ---------------------------------------------------------------------
-- Conferência: o que cada revisão da Strada vai imprimir na ordem
-- ---------------------------------------------------------------------
select
  m.marco / 1000 || '.000 km' as marco,
  (m.marco / 10000) || 'ª revisão' as no_manual,
  count(*) as itens
from public.escopos_manutencao e
cross join lateral unnest(e.itens) as i
cross join (values (10000),(20000),(30000),(40000),(50000),(60000),(100000),(120000),(180000),(240000)) as m(marco)
where e.ativo
  and e.modelo ilike '%STRADA%'
  and m.marco >= e.km_inicio
  and (m.marco - e.km_inicio) % e.km_intervalo = 0
group by m.marco
order by m.marco;
