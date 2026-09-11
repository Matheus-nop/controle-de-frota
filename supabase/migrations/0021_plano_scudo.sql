-- =====================================================================
-- Migração 0021: o plano de manutenção do Scudo, do manual
-- (idempotente; rode no SQL Editor depois da 0020)
-- =====================================================================
--
-- Lido do "Plano de Manutenção Programada" nas páginas G-12 e G-13 do manual do
-- Scudo, revisões 01ª a 12ª.
--
-- A BASE É 20.000 KM, E NÃO 10.000
--
-- É a diferença que mais importa entre este plano e o da Fiorino: lá a revisão
-- é a cada 10.000 km ou 12 meses; aqui é a cada 20.000 km ou 12 meses. As doze
-- revisões do livro cobrem 240.000 km.
--
-- Quem for conferir contra o papel: a coluna "01ª" do manual é o marco de
-- 20.000 km, a "02ª" é 40.000, e assim por diante.
--
-- O DIESEL AVISA ANTES
--
-- O manual registra que alguns modelos diesel monitoram a degradação do óleo e
-- acendem luz no painel. Quando ela acende, o óleo e o filtro saem na hora,
-- sem esperar o km — está na observação da regra de 20.000.

insert into public.escopos_manutencao (modelo, km_intervalo, km_inicio, itens, observacao)
select v.modelo, p.km_intervalo, p.km_inicio, p.itens, p.observacao
from (select distinct modelo from public.veiculos where modelo ilike '%SCUDO%') v
cross join (values
  (20000, 0, array[
    'Trocar óleo do motor e filtro de óleo (*)',
    'Trocar filtro de combustível (*)',
    'Trocar elemento do filtro de ar do motor (*)',
    'Verificar níveis dos líquidos e fluidos dos sistemas de freio, lavador dos vidros etc.',
    'Verificar líquido de arrefecimento do motor (nível e contaminação)',
    'Verificar pastilhas e discos de freio dianteiros e traseiros — trocar as pastilhas se a espessura útil for menor que 5 mm (*) (**)',
    'Verificar tubulações de arrefecimento, escapamento, alimentação de combustível e freios; borrachas da parte inferior, coifas, guarnições, mangueiras e pneus (desgaste e pressão); suspensões, caixa de direção e junta homocinética (*)',
    'Verificar esguicho e palhetas do para-brisa, cintos de segurança, vidros elétricos, travas das portas, elétrica e eletrônica, iluminação interna, externa e sinalização, painel de instrumentos',
    'Verificar estado da bateria com equipamento de diagnóstico homologado pela Stellantis (*)',
    'Verificar filtro do ar-condicionado (*)',
    'Verificar sistema de ventilação do cárter do motor (blow by) (*)',
    'Verificar funcionamento do freio de estacionamento; regular se necessário',
    'Verificar estado e estanqueidade do motor e do câmbio (*)'
  ],
   'Revisão básica do Scudo, a cada 20.000 km ou 12 meses — o que vier primeiro. ' ||
   'Tolerância do manual: 1.000 km ou 30 dias, para mais ou para menos. ' ||
   'DIESEL: se a luz de degradação do óleo acender no painel, o óleo e o filtro saem na hora, sem esperar o km. ' ||
   'Os itens com (*) valem pela METADE do prazo em uso severo — estrada de terra, poeira, lama ou entrega de porta em porta. ' ||
   'O (**) pede, em estrada poeirenta, olhar discos e pastilhas quanto a terra, galho e barro, e limpar se precisar.'),

  (20000, 40000, array[
    'Aspecto geral da carroceria: perfurações por corrosão, pontos de ferrugem e bolhas na pintura'
  ],
   'No manual só entra a partir da 2ª revisão — veículo com 20.000 km ainda não tem o que inspecionar de corrosão.'),

  (40000, 0, array[
    'Verificar sistema de injeção/ignição do motor com equipamento de diagnóstico',
    'Verificar nível de emissões dos gases de escapamento',
    'Trocar fluido de freio',
    'Verificar correia dentada do comando da distribuição (***) (****)'
  ],
   'O fluido de freio é a cada 40.000 km ou 24 meses, o que vier primeiro. ' ||
   'O (****) é um alerta que vale ouro: se na verificação aparecer contaminante mineral (poeira) na correia dentada, nos rolamentos tensores ou nas polias, isso é sinal de que o veículo está em uso severo — e o plano inteiro passa a valer pela metade.'),

  (60000, 40000, array[
    'Verificar correias dos órgãos auxiliares do motor (*)'
  ],
   'Cai na 2ª, 5ª, 8ª e 11ª revisões — sempre 20.000 km antes de cada troca das correias.'),

  (60000, 0, array[
    'Trocar correias dos órgãos auxiliares do motor (*)'
  ],
   'A cada 60.000 km ou 48 meses, o que vier primeiro.'),

  (120000, 0, array[
    'Trocar correia dentada do comando da distribuição (***) (****)'
  ],
   'A cada 120.000 km ou 48 meses, o que vier primeiro. Em atmosfera empoeirada, poluída com partículas metálicas ou com maresia, o prazo encurta — ver "Utilização Severa do Veículo" no manual.'),

  (240000, 0, array[
    'Trocar líquido do sistema de arrefecimento do motor (*)'
  ],
   'A cada 240.000 km ou 120 meses, o que vier primeiro.')
) as p(km_intervalo, km_inicio, itens, observacao)
on conflict (modelo, km_intervalo, km_inicio) do update
  set itens = excluded.itens,
      observacao = excluded.observacao,
      ativo = true;

-- ---------------------------------------------------------------------
-- Conferência: o que cada revisão do Scudo vai imprimir na ordem
-- ---------------------------------------------------------------------
select
  m.marco / 1000 || '.000 km' as marco,
  (m.marco / 20000) || 'ª revisão' as no_manual,
  count(*) as itens
from public.escopos_manutencao e
cross join lateral unnest(e.itens) as i
cross join (values (20000),(40000),(60000),(80000),(100000),(120000),(160000),(220000),(240000)) as m(marco)
where e.ativo
  and e.modelo ilike '%SCUDO%'
  and m.marco >= e.km_inicio
  and (m.marco - e.km_inicio) % e.km_intervalo = 0
group by m.marco
order by m.marco;
