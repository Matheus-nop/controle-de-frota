-- O PCM passa a cadastrar veículo.
-- Revise antes de aplicar: cole no SQL editor do Supabase.
--
-- Desde a 0011 o PCM já EDITA veículo: era preciso, porque abrir manutenção
-- põe o veículo em MANUTENÇÃO e sem isso a ordem seria aberta com o veículo
-- continuando disponível no painel. O que ficou de fora naquele dia foi o
-- cadastro — "cadastrar e apagar veículo continua sendo só do gestor", diz lá.
--
-- Cadastrar precisa entrar porque quem conhece o veículo que chega é o PCM: é
-- ele que abre a ordem, lê o manual e sabe o intervalo de revisão do modelo.
-- Deixar o cadastro no gestor é parar a pessoa que tem o dado na mão na frente
-- de quem vai ter que pedir o dado a ela.
--
-- Apagar continua só do gestor, e de propósito: cadastro errado se conserta
-- editando; apagar leva junto o histórico de quem rodou com o veículo.
-- `tecnicos` também continua fechada — quem define papel é o gestor, e um PCM
-- que pudesse editar `tecnicos` poderia se promover.

-- A política é derrubada e recriada inteira: `alter policy` não aceita
-- acrescentar um `or` a um `with check` que já existe. O `if exists` deixa a
-- migração rodar duas vezes sem quebrar.
drop policy if exists veiculos_insert on public.veiculos;
create policy veiculos_insert on public.veiculos
  for insert to authenticated
  with check (public.is_gestor() or public.tem_papel('PCM'));

-- As outras três ficam como estão, e ficam escritas aqui para quem ler esta
-- migração não precisar abrir a 0004 e a 0011 para saber o que sobrou de fora:
--   veiculos_select — todos leem (a tela de saída precisa da lista);
--   veiculos_update — gestor ou PCM, desde a 0011;
--   veiculos_delete — só gestor.
