# Do painel ao sistema: guia para o Claude Code

Guia específico para o **Controle de Frota** — 9 veículos, 8 ativos, ~6 roteiros/dia,
2 técnicos por veículo em alguns dias, entrada por celular em campo.

O painel que já existe (`painel-frota.jsx`) é o front-end pronto com dados embutidos.
Este guia é sobre trocar esses dados embutidos por um banco de verdade, com login.

---

## Antes de abrir o Claude Code

Três coisas que só você pode fazer (envolvem conta e senha):

1. **Criar o projeto no Supabase** — supabase.com, plano free dá conta de 9 veículos folgado.
   Guarde a URL do projeto e as duas chaves (`anon` e `service_role`).
2. **Criar o repositório** no GitHub, vazio.
3. **Criar a conta na Vercel** e conectar ao GitHub.

Nunca cole a `service_role` no chat nem em arquivo versionado. Ela vai só no `.env.local`,
e o `.env.local` vai no `.gitignore` na primeira coisa que o Claude Code fizer.

Deixe também estes arquivos numa pasta do projeto:

```
/dados-origem/CONTROLE_DE_FROTA.xlsx     ← sua planilha atual
/painel-frota.jsx                        ← o painel que já fizemos
```

---

## A decisão que define o projeto

Sua planilha tem duas camadas misturadas: **o que aconteceu** (respostas dos Forms, imutáveis)
e **o que isso significa** (KM_DIARIO, CUSTO_FROTA, ALERTAS — tudo fórmula).

No banco, a segunda camada não é tabela. É *view* e *coluna gerada*. Isso importa porque hoje,
se alguém arrasta uma fórmula errado, o custo de 43 dias muda em silêncio. No Postgres,
`km_rodado` não pode estar errado — ele é `km_chegada - km_saida`, calculado na leitura.

A regra: **grave só o que o técnico digitou. Calcule o resto.**

---

## Fase 1 — Schema e migração

### Prompt de abertura

```
Vou construir um sistema de controle de frota. Stack: Next.js (App Router) +
TypeScript + Supabase (Postgres + Auth) + Tailwind. Deploy na Vercel.

Contexto: hoje isso roda numa planilha alimentada por Google Forms. São 9 veículos
(8 ativos), ~6 roteiros por dia, 5 a 8 técnicos. A planilha está em
/dados-origem/CONTROLE_DE_FROTA.xlsx.

Antes de escrever qualquer código: leia a planilha, me mostre as abas, e me diga
quais são fatos registrados e quais são cálculos derivados. Não crie tabela para
cálculo derivado — quero view ou coluna gerada. Só depois disso a gente escreve o schema.
```

Deixe ele ler antes de propor. Se ele já sair criando `CREATE TABLE alertas_frota`, corrija:
alerta é uma view sobre `veiculos`.

### O schema que você quer chegar

Cole isto como referência quando ele propuser o dele:

```sql
-- pessoas: mata o campo de texto livre que hoje gera
-- "RAFAEL AVILA" / "RAFAEL ÁVILA" / "RAFAEL ÁVILA - DOUGLAS DE SENA"
create table tecnicos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users unique,   -- null = técnico ainda sem login
  nome text not null,
  ativo boolean not null default true
);

create table veiculos (
  id uuid primary key default gen_random_uuid(),
  placa text not null unique,                   -- sem espaço, sem hífen: SRT9D55
  modelo text not null,
  ano text,
  responsavel_id uuid references tecnicos,
  km_atual integer,
  proxima_revisao_km integer,
  status text not null default 'ATIVO'
    check (status in ('ATIVO','MANUTENCAO','BLOQUEADO','VENDIDO')),
  consumo_km_l numeric(5,2),
  valor_combustivel numeric(6,2),
  obs text,
  -- custo por km deixa de ser fórmula arrastada e vira definição do banco
  custo_km numeric(8,4) generated always as
    (valor_combustivel / nullif(consumo_km_l, 0)) stored
);

create table roteiros (
  id uuid primary key default gen_random_uuid(),
  veiculo_id uuid not null references veiculos,
  -- saída
  tecnico_saida_id uuid not null references tecnicos,
  saida_em timestamptz not null,
  km_saida integer not null,
  obs_saida text,
  foto_painel_saida text,
  -- chegada (null enquanto o veículo está na rua)
  tecnico_chegada_id uuid references tecnicos,
  chegada_em timestamptz,
  km_chegada integer,
  obs_chegada text,
  foto_painel_chegada text,
  houve_pendencia boolean,
  descricao_pendencias text,

  km_rodado integer generated always as (km_chegada - km_saida) stored,

  -- as validações que a planilha não tem:
  constraint km_coerente check (km_chegada is null or km_chegada >= km_saida),
  constraint km_plausivel check (km_chegada is null or km_chegada - km_saida <= 600),
  constraint chegada_coerente check (chegada_em is null or chegada_em >= saida_em)
);

-- impede dois roteiros abertos para o mesmo veículo:
-- é o que hoje produz "CHEGADA SEM SAÍDA" e roteiro duplicado
create unique index um_roteiro_aberto_por_veiculo
  on roteiros (veiculo_id) where chegada_em is null;

create table manutencoes (
  id uuid primary key default gen_random_uuid(),
  veiculo_id uuid not null references veiculos,
  aberta_em date not null default current_date,
  km_abertura integer,
  origem text check (origem in ('CHECKLIST SEMANAL','ROTEIRO','ACIDENTE/AVARIA','PREVENTIVA PROGRAMADA','OUTRO')),
  tipo text check (tipo in ('PREVENTIVA','CORRETIVA')),
  descricao_problema text not null,
  prioridade text check (prioridade in ('BAIXA','MÉDIA','ALTA','EMERGENCIAL')),
  responsavel_id uuid references tecnicos,
  oficina text,
  orcamento numeric(10,2),
  status text not null default 'ABERTA'
    check (status in ('ABERTA','EM EXECUÇÃO','CONCLUÍDA','CANCELADA')),
  concluida_em date,
  valor_final numeric(10,2),
  servico_realizado text,
  pecas_trocadas text,
  proxima_revisao_km integer,
  nota_fiscal_url text
);

create table checklists (
  id uuid primary key default gen_random_uuid(),
  veiculo_id uuid not null references veiculos,
  tecnico_id uuid not null references tecnicos,
  data date not null default current_date,
  km_atual integer not null,
  itens jsonb not null,          -- {"pneus":true,"farois":true,"ar_condicionado":false,...}
  apto boolean not null,
  motivo_bloqueio text,
  descricao text,
  urgencia text check (urgencia in ('BAIXA','MÉDIA','ALTA','EMERGENCIAL')),
  foto_url text
);
```

Sobre `itens jsonb` no checklist: seu formulário tem ~12 perguntas de sim/não que mudam com
o tempo. Coluna para cada uma vira migration toda vez que você acrescenta um item. JSONB
aceita a mudança sem alterar o schema.

### As views que substituem as abas calculadas

```sql
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
```

### Migrar os dados

```
Escreva um script de migração (scripts/migrar.ts) que lê a planilha em
/dados-origem/ e popula o Supabase. Requisitos:

1. Normalize placa removendo espaços e hífens. Atenção: a aba CADASTRO_VEICULOS
   usa "SRT 9D55" e a KM_DIARIO usa "STRADA - SRT 9D55". Mesmo veículo.

2. Técnicos vêm de texto livre e estão sujos. Antes de inserir, gere um
   /dados-origem/tecnicos-dedup.json com o mapa de cada variação encontrada para
   um nome canônico, e PARE para eu revisar. Não adivinhe sozinho:
   "RAFAEL ÁVILA - DOUGLAS DE SENA" são duas pessoas num roteiro só, não uma pessoa.

3. Roteiros que violarem as constraints (km alto, chegada sem saída) NÃO devem ser
   descartados nem forçados. Grave em uma tabela roteiros_quarentena com o motivo,
   e me mostre o total no fim.

4. O script tem que ser idempotente: rodar duas vezes não duplica nada.
```

O ponto 2 é o que evita você começar o sistema novo já com a sujeira do antigo.
O ponto 3 importa porque são ~40 registros dos seus 286 — 14% dos dados.
Quarentena deixa você decidir caso a caso depois, sem travar a migração.

---

## Fase 2 — Login e permissão

Dois papéis: **técnico** (lança e vê o próprio) e **gestor** (vê tudo, edita cadastro).

```
Configure Supabase Auth com magic link por e-mail — técnico em campo não vai
lembrar senha, e magic link evita eu ter que gerenciar reset.

Papel fica em tecnicos.papel ('TECNICO' | 'GESTOR'). Escreva as políticas de RLS:

- roteiros: técnico faz select/insert/update só onde tecnico_saida_id ou
  tecnico_chegada_id for o dele. Gestor vê tudo.
- veiculos: todos leem. Só gestor escreve.
- checklists: técnico insere e lê os próprios. Gestor vê todos.
- manutencoes: técnico só lê. Gestor escreve.

Importante: escreva um teste para cada política que prove que um técnico NÃO
consegue ler o roteiro de outro. RLS mal escrita falha aberta e ninguém percebe.
```

Peça o teste. RLS que não foi testada normalmente está errada.

---

## Fase 3 — O painel plugado

Aqui o trabalho é pequeno, porque o layout já existe.

```
Em /painel-frota.jsx tem o painel pronto, hoje com a constante DADOS embutida.
Porte ele para o app Next.js:

- Mantenha exatamente o layout, o CSS e os componentes. Não redesenhe.
- Troque DADOS por Server Components buscando das views v_roteiros, v_alertas
  e v_custo_veiculo.
- REF é uma constante '2026-07-17' — troque por current_date.
- A aba "Pendências" passa a ler roteiros_quarentena + roteiros com
  situacao = 'SEM FECHAMENTO'.
```

---

## Fase 4 — O app do técnico (PWA)

Esta é a fase que resolve seu problema de verdade — e a que mais exige disciplina,
porque é onde dá vontade de recriar o formulário do Google como está.

```
Crie a área /campo, mobile-first, PWA instalável. Fluxo de UMA tela:

O técnico abre e vê o estado dele:
- Se não tem roteiro aberto → botão grande "Registrar saída"
- Se tem roteiro aberto → o card do roteiro + botão "Registrar chegada"

O app decide isso. O técnico não escolhe "qual etapa desejo registrar" —
essa pergunta existe hoje só porque o Google Forms não sabe o estado dele.

Na saída: veículo (select, só ATIVO), km (numérico, teclado numérico, validado
contra o km_atual do veículo — não aceita menor), foto do painel, obs.
Técnico e horário vêm da sessão, não são digitados.

Na chegada: km (validado contra km_saida, avisa acima de 600 antes de enviar),
foto, houve pendência, descrição.

Offline: os técnicos ficam sem sinal. Fila em IndexedDB, sincroniza quando volta.
A tela mostra "3 registros aguardando envio" quando tem fila.
```

O offline não é luxo. Se o app falhar sem sinal, o técnico volta para o WhatsApp
e você perde o dado do mesmo jeito que perde hoje.

---

## Fase 5 — As automações

É aqui que o sistema passa a valer mais que a planilha, porque ele passa a agir:

```
Supabase Edge Functions com cron:

1. Todo dia 18h: roteiros com chegada_em null e saida_em de hoje →
   notifica o técnico. 20h sem resposta → notifica o gestor.
   (São 30 roteiros perdidos em 43 dias hoje. Isso zera.)

2. Após concluir roteiro: atualiza veiculos.km_atual com km_chegada.
   Se km_atual >= proxima_revisao_km → abre manutenção PREVENTIVA
   automaticamente com origem 'PREVENTIVA PROGRAMADA'.
   (O KIA TTB0J08 passou 545 km da revisão sem ninguém abrir nada.)

3. Segunda 8h: técnico sem checklist na semana anterior → lembrete.
```

---

## O CLAUDE.md

Crie na raiz. É o que impede o Claude Code de esquecer as decisões entre sessões:

```markdown
# Controle de Frota

Sistema de gestão de frota para equipe de campo. Substitui planilha + Google Forms.
Escala real: 9 veículos, ~6 roteiros/dia, ~8 técnicos. Não otimize para escala maior.

## Stack
Next.js App Router · TypeScript · Supabase (Postgres, Auth, Storage) · Tailwind · Vercel

## Regras invioláveis
- Nada de cálculo derivado gravado em tabela. km_rodado, custo_km e situação
  são coluna gerada ou view. Se precisar de um número novo, é view.
- Nome de pessoa nunca é texto livre. FK para tecnicos, sempre.
- Toda entrada de km é validada contra o km anterior do veículo.
- RLS ativa em todas as tabelas. Política nova exige teste que prove o bloqueio.
- Português nos campos, tabelas e UI. É o idioma de quem usa.

## Vocabulário do domínio
- **roteiro**: uma saída + a chegada correspondente. É a unidade de trabalho.
- **placa**: sempre normalizada, sem espaço nem hífen (SRT9D55).
- **técnico**: quem dirige. **gestor**: quem administra a frota.
- **checklist**: vistoria semanal do veículo.
- Não use "viagem", "corrida", "motorista", "driver", "trip". A equipe não fala assim.

## Estado
- [x] Fase 1 — schema e migração
- [ ] Fase 2 — auth e RLS
- [ ] Fase 3 — painel
- [ ] Fase 4 — PWA de campo
- [ ] Fase 5 — automações
```

Marque as fases conforme fecha. Comece cada sessão nova com
"leia o CLAUDE.md e me diga em que fase estamos".

---

## Como conduzir

**Uma fase por sessão.** Contexto longo degrada. Terminou a fase, commitou,
atualizou o CLAUDE.md, sessão nova.

**Peça o plano antes do código.** "Me mostre o plano, não escreva nada ainda."
É onde você pega o erro barato.

**Quando ele errar, diga o porquê, não só o quê.** "Está errado, técnico é FK"
ensina menos que "técnico não pode ser texto porque a planilha atual tem 4 grafias
do mesmo nome e isso quebrou o relatório por técnico".

**Desconfie de concordância rápida.** Se você questionar uma decisão boa dele e ele
recuar na hora, insista: "não quero que você concorde comigo, quero saber se eu estou
errado". A decisão técnica certa tem que sobreviver ao seu palpite.

**Não migre tudo de uma vez.** Rode o sistema novo em paralelo com a planilha por
duas semanas. Compare o km do mês dos dois. Se bater, desliga o Forms.

---

## Ordem de valor

Se o tempo apertar, a Fase 4 é a que paga o projeto. O painel é bonito e útil,
mas o problema real não é *ver* os dados — é que 14% deles chegam quebrados,
porque o Google Forms não sabe quem é o técnico, qual o estado do veículo, nem
que 3.184 km num dia é impossível.

O app sabe. É isso que você está comprando.
