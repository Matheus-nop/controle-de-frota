-- Conserto do 0010: a regra do km alto não pode acusar o passado.
-- Revise antes de aplicar: supabase db push (ou cole no SQL editor do Supabase).
--
-- O que aconteceu: 0010 fez a `situacao` marcar como "KM ALTO VERIFICAR" todo
-- roteiro com mais de 600 km e `km_verificado_em` nulo. Só que TODO roteiro
-- que já existia tem esse campo nulo — ele acabou de ser criado. Resultado: a
-- coluna Pendências do painel encheu de roteiro antigo, incluindo o do
-- Alexandre no TTZ7I26, que o gestor já tinha fechado à mão e resolvido.
--
-- Isso é pior do que parece. A fila de pendências só funciona enquanto o que
-- está nela precisa mesmo de ação. Um punhado de roteiro velho lá dentro
-- ensina o gestor a ignorar a fila — e aí a próxima viagem de 1.800 km, a que
-- interessa, passa batido no meio do lixo.
--
-- A regra vale daqui para a frente. O que já estava fechado antes dela existir
-- entra como conferido: aquele km já passou pelo olho de alguém quando o
-- roteiro foi fechado, e nenhum deles está esperando decisão.
--
-- `km_verificado_por` fica NULO de propósito nesses: ninguém conferiu um por
-- um, foi a carga histórica. Nulo aqui quer dizer "veio de antes da regra", e
-- é mais honesto do que carimbar o nome do gestor em 40 roteiros que ele não
-- olhou. A tela mostra o nome quando existe.

-- ---------------------------------------------------------------------------
-- 1. Antes de rodar, se quiser ver o que vai ser marcado:
--
--   select placa, saida_em::date as dia, tecnico_saida, km_rodado, situacao
--     from v_roteiros
--    where situacao = 'CONCLUÍDO - KM ALTO VERIFICAR'
--    order by km_rodado desc;
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 2. A carga. O corte é o dia em que a regra entrou no ar (2026-09-04): tudo
--    que fechou ANTES disso é história e sai da fila; o que fechar a partir
--    daí segue a regra nova e continua pedindo conferência.
--
--    Idempotente por dois motivos: o corte é uma data fixa, não `now()`, e o
--    `is null` impede sobrescrever a conferência de quem já clicou no botão.
-- ---------------------------------------------------------------------------
update public.roteiros
   set km_verificado_em = timestamptz '2026-09-04 00:00:00-03'
 where chegada_em is not null
   and km_verificado_em is null
   and chegada_em < timestamptz '2026-09-04 00:00:00-03';

comment on column public.roteiros.km_verificado_em is
  'Quando alguém conferiu um km acima de 600. Nulo = ainda na fila de '
  'pendências do painel. Preenchido com km_verificado_por nulo = carga '
  'histórica da migration 0013, anterior à regra.';

comment on column public.roteiros.km_verificado_por is
  'Quem conferiu. Nulo junto com km_verificado_em preenchido significa carga '
  'histórica (migration 0013), não uma pessoa.';

-- ---------------------------------------------------------------------------
-- 3. Depois de rodar, confira o que sobrou na fila:
--
--   select placa, saida_em::date as dia, tecnico_saida, km_rodado
--     from v_roteiros
--    where situacao = 'CONCLUÍDO - KM ALTO VERIFICAR';
--
--    O esperado é vazio, ou só roteiro fechado de hoje em diante.
--
--    Se sobrar algum que você já resolveu à mão — caso do fechamento manual
--    onde a `chegada_em` gravada é a data de HOJE e não a da viagem — marque
--    aquele, pelo id que a consulta acima devolve:
--
--   update roteiros set km_verificado_em = now()
--    where id = 'cole-o-id-aqui';
-- ---------------------------------------------------------------------------
