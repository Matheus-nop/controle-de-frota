-- =====================================================================
-- Migração 0016: o Bongo 2025/2026 tem plano de manutenção próprio
-- (idempotente; rode no SQL Editor depois da 0015)
-- =====================================================================
--
-- O QUE ACONTECEU
--
-- A Kia esticou o intervalo de revisão do Bongo K2500 a partir do ano-modelo
-- 2026, junto com a garantia:
--
--   até 2025/2026 (MY2025) — primeira revisão aos 10.000 km ou 12 meses,
--                            e a cada 10.000 km depois
--   a partir de 2026 (MY2026) — primeira revisão aos 15.000 km ou 12 meses,
--                               e a cada 15.000 km depois
--
-- Fonte: kia.com.br/revisoes e o anúncio do Bongo K2500 4x4 2025/2026.
--
-- POR QUE ISSO É PROBLEMA AQUI
--
-- A frota tem três Bongos, e eles NÃO seguem o mesmo plano:
--
--   TTB0J08 (Igor)       2024/2025  -> 10.000 km
--   TTX1H09 (Alexandre)  2024/2025  -> 10.000 km
--   TTZ7I26 (Rafael)     2025/2026  -> 15.000 km
--
-- O escopo de manutenção (0015) é por MODELO, e os três estão cadastrados como
-- "KIA BONGO". Do jeito que está, os três leriam o mesmo plano: ou o do Rafael
-- iria à oficina 50% mais vezes do que o fabricante manda, ou os outros dois
-- iriam de menos — e "de menos" em revisão é garantia perdida.
--
-- A SAÍDA, E POR QUE ESTA
--
-- O modelo é a chave do escopo. Separar o do Rafael num modelo próprio resolve
-- hoje, sem mexer no schema, e deixa a diferença visível na tela em vez de
-- escondida numa exceção. Duas colunas na tela de escopo, dois planos, cada
-- veículo no seu.
--
-- A alternativa era escopo com exceção por placa, que foi descartada quando o
-- escopo foi desenhado — não havia caso real. Agora há um. Se aparecer um
-- segundo, vale reabrir: a exceção por placa passa a pagar o próprio custo.
--
-- Nada se perde: `ano` continua 2025/2026 e a placa não muda. O que muda é o
-- nome do modelo, que é o rótulo do plano de manutenção.

-- Renomeia SÓ se ainda estiver como "KIA BONGO" e o ano confirmar. Sem a
-- checagem do ano, um erro de digitação na placa renomearia o veículo errado —
-- e o veículo errado passaria a seguir o plano errado, que é o defeito que esta
-- migração existe para consertar.
update veiculos
   set modelo = 'KIA BONGO 2026'
 where placa = 'TTZ7I26'
   and modelo = 'KIA BONGO'
   and ano like '%2026%';

-- ---------------------------------------------------------------------
-- Conferência: os três Bongos e o plano de cada um
-- ---------------------------------------------------------------------
-- Espera-se dois modelos distintos. Se os três aparecerem como "KIA BONGO", o
-- update não pegou — confira a placa e o ano do veículo do Rafael.
select
  v.placa,
  v.ano,
  v.modelo,
  t.nome as responsavel,
  case v.modelo
    when 'KIA BONGO 2026' then 'a cada 15.000 km (Kia, MY2026+)'
    when 'KIA BONGO'      then 'a cada 10.000 km (Kia, até MY2025)'
    else '—'
  end as intervalo_do_fabricante,
  (select count(*) from escopos_manutencao e where e.modelo = v.modelo and e.ativo) as regras_cadastradas
from veiculos v
left join tecnicos t on t.id = v.responsavel_id
where v.modelo like 'KIA BONGO%'
order by v.ano, v.placa;
