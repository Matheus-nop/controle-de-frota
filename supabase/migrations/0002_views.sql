-- Gerado a partir de docs/guia-claude-code-frota.md
-- Revise antes de aplicar: supabase db push

-- substitui a aba KM_DIARIO
create view v_roteiros as
select r.*, v.placa, v.modelo, v.custo_km,
       ts.nome as tecnico_saida, tc.nome as tecnico_chegada,
       round(r.km_rodado * v.custo_km, 2) as custo_roteiro,
       case
         when r.chegada_em is null and r.saida_em::date = current_date then 'NA RUA'
         when r.chegada_em is null then 'SEM FECHAMENTO'
         when r.chegada_em::date > r.saida_em::date then 'CONCLUÍDO - DIA SEGUINTE'
         else 'CONCLUÍDO'
       end as situacao
from roteiros r
join veiculos v on v.id = r.veiculo_id
join tecnicos ts on ts.id = r.tecnico_saida_id
left join tecnicos tc on tc.id = r.tecnico_chegada_id;

-- substitui ALERTAS_FROTA
create view v_alertas as
select id, placa, modelo, km_atual, proxima_revisao_km,
       proxima_revisao_km - km_atual as falta_km,
       case
         when proxima_revisao_km is null then 'SEM REVISÃO PROGRAMADA'
         when km_atual >= proxima_revisao_km then 'REVISÃO VENCIDA'
         when proxima_revisao_km - km_atual <= 2000 then 'REVISÃO PRÓXIMA'
         else 'OK'
       end as alerta
from veiculos where status = 'ATIVO';

-- substitui RESUMO_CUSTO_FROTA
create view v_custo_veiculo as
select v.placa, v.modelo,
       sum(r.km_rodado) as km_total,
       round(sum(r.km_rodado * v.custo_km), 2) as custo_total,
       v.custo_km as custo_medio_km
from roteiros r join veiculos v on v.id = r.veiculo_id
where r.chegada_em is not null
group by v.id, v.placa, v.modelo, v.custo_km;
