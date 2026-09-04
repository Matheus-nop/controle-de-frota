
[handoff.md](https://github.com/user-attachments/files/30517772/handoff.md)
# Handoff — Controle de Frota (estado atual e próximos passos)

Documento para abrir uma sessão nova já com o contexto. Leia junto com o
`CLAUDE.md` e o `docs/plano-fase-3.md`.

## Onde o projeto está

**No ar e em uso:** app Next.js 16 (App Router, TypeScript) + Supabase, publicado
na Vercel. Login por usuário/senha. Painel do gestor e app de campo funcionando.

- Repositório: `Matheus-nop/controle-de-frota` (público)
- Produção: `https://controle-de-frota-theta.vercel.app`
- Supabase: projeto `mlfhqodgzpkqiisukoyt`

### Fases concluídas
- [x] **Fase 1** — schema (5 tabelas, 3 views)
- [x] **Fase 2** — auth e RLS (papéis TECNICO/GESTOR, `is_gestor()`, `current_tecnico_id()`)
- [x] **Fase 3** — painel plugado ao Supabase + redesign corporativo
- [x] **Fase 4** — app de campo (saída, chegada, checklist, tudo com foto)
- [~] **Fase 5** — automações (parcial: km automático e bloqueio por checklist)

### O que já existe (rotas)
| Rota | O que faz | Quem acessa |
|---|---|---|
| `/` | Painel do gestor: kanban de operação, frota, custos, manutenções, relatórios (CSV/PDF), ficha do veículo | GESTOR |
| `/campo` | Tela simples do técnico: 3 botões grandes + "na rua agora" | todos |
| `/roteiro/saida` | Registrar saída (valida km, um roteiro aberto por veículo, foto do painel) | todos |
| `/roteiro/chegada` | Registrar chegada (km ≥ saída; acima de 600 km pede confirmação, acima de 5.000 barra) | todos |
| `/checklist` | Checklist semanal (réplica do Google Forms: 7 seções, avaria condicional, bloqueio, fotos) | todos |
| `/ocorrencia` | Relatar dano/acidente/avaria com foto obrigatória | todos |
| `/ocorrencias` | Fila de ocorrências: tratar, resolver, virar manutenção | GESTOR |
| `/historico` | Tudo que a equipe registrou, com as fotos, por veículo e período | GESTOR, PCM |
| `/alertas` | O que precisa de atenção agora, com o botão que resolve cada caso | GESTOR, PCM |
| `/manutencao` | Abrir manutenção, registrar andamento, anexar nota fiscal | GESTOR, PCM |
| `/manutencao/ordem?id=` | Ordem de serviço em A4 para imprimir e mandar com o veículo | GESTOR, PCM |
| `/ponto` | Conferência de horário de saída e chegada, com CSV | GESTOR, PONTO |
| `/veiculos` | Gestão de veículos (km, revisão, consumo, combustível, status, responsável) | GESTOR |
| `/usuarios` | Cadastro de acesso: vincular login a pessoa, papel, desligar | GESTOR |
| `/relatorios` | Cinco relatórios com período e CSV: combustível, km, técnicos, manutenções, ocorrências | GESTOR |
| `/login` | Login por usuário + senha | público |
| `/api/health` | Health-check do Supabase | público |

### Automações ativas (triggers no banco)
- `trg_km_roteiro` / `trg_km_checklist` — atualizam `veiculos.km_atual` sozinhos.
- `trg_bloqueio_checklist` — checklist "não apto" bloqueia o veículo; "apto" libera.

### Acesso e papéis
Quatro papéis, na coluna `tecnicos.papel`. Cada um cai numa tela inicial e o
proxy (`lib/supabase/middleware.ts`) devolve quem bater na porta errada. A RLS
é quem isola os dados de verdade — o proxy só evita tela inútil.

| Papel | Entra em | Pode |
|---|---|---|
| `GESTOR` | `/` | tudo |
| `PCM` | `/` | manutenção (abrir, fechar, imprimir OS), checklists, alertas, histórico. Não cadastra veículo nem lança roteiro |
| `PONTO` | `/ponto` | só leitura do horário dos roteiros. Não escreve em nada |
| `TECNICO` | `/campo` | os roteiros dele, checklist, ocorrência |

- **Gestor** entra com e-mail real completo; os demais entram só com o usuário
  (ex.: `igor`) e o app completa com `@frota.local`.
- 13 técnicos cadastrados e vinculados a logins internos.
#### Como se cadastra alguém (decisão de 2026-09)
Em duas etapas, e as duas são obrigatórias:

1. **O login, no painel do Supabase.** Authentication → Add user → Create new
   user. E-mail interno `primeiro.ultimo@frota.local` para quem não tem e-mail
   de verdade, senha de 8+ caracteres, e **marcar `Auto Confirm User`** — sem
   isso o GoTrue espera uma confirmação que nunca chega num `@frota.local` e o
   login não entra.
2. **A pessoa, na tela `/usuarios`.** O login novo aparece em "Logins
   aguardando cadastro"; o gestor dá nome e papel. Sem esta etapa a pessoa
   entra no app e **não é ninguém**: todo nome de roteiro, checklist e
   manutenção é FK para `tecnicos`, e quem não tem essa linha cai em `/campo`
   sem conseguir lançar nada.

Quem já está no cadastro sem login (técnico antigo, gente vinda da planilha)
aparece numa lista à parte no passo 2 — escolher ali evita a mesma pessoa
virar dois registros e partir o histórico em dois.

A lista de logins pendentes vem de `logins_sem_pessoa()`
(`supabase/migrations/0012_logins_sem_pessoa.sql`), `security definer` porque
`auth.users` não é exposta ao PostgREST — e com checagem de gestor na primeira
linha do corpo, provada em `supabase/tests/logins_sem_pessoa.test.sql`.

`supabase/manual/cadastrar_pcm_e_ponto.sql` continua no repositório como plano
B para o **primeiro** gestor, quando ainda não há ninguém logado para cadastrar.

#### O caminho opcional: criar login pelo próprio app
Existe pronto, desligado por falta de uma variável. Se um dia
`SUPABASE_SERVICE_ROLE_KEY` for configurada no ambiente do app (Vercel →
Settings → Environment Variables; valor em Supabase → Project Settings → API →
`service_role`), a tela `/usuarios` passa a criar login e trocar senha
sozinha — ela pergunta ao servidor o que pode oferecer e se ajusta.

Se for configurar um dia, dois cuidados:
- **sem** o prefixo `NEXT_PUBLIC_` — com ele o Next embute a chave no bundle
  que vai para o navegador, e ela ignora a RLS;
- importada só em `lib/supabase/admin.ts`, usado apenas por `app/api/`.

A chave executa a ação; quem autoriza é o cookie de sessão — `/api/usuarios`
confirma que o chamador é `GESTOR` antes de qualquer coisa.

**Enquanto ela não existir**, uma coisa fica pela metade e a tela avisa: desligar
alguém tira a pessoa das listas do app, mas não bloqueia o login. Para ela parar
de entrar de verdade: Supabase → Authentication → o usuário → Ban user.

### Storage (buckets públicos)
`checklists` (fotos do checklist) · `roteiros` (foto do painel/hodômetro) ·
`manutencoes` (nota fiscal) · `ocorrencias` (fotos do dano). Policy de INSERT
para `authenticated` em cada um.

### Ocorrências (feito)
Tabela `ocorrencias` (migration `0005`) + bucket (`0006`) + prova de RLS em
`supabase/tests/rls_ocorrencias.test.sql`.
- O técnico relata em `/ocorrencia`: veículo, tipo, gravidade, descrição e
  **foto obrigatória**. O relato sai sempre no nome de quem está logado — é o
  que a RLS deixa gravar.
- O gestor trata em `/ocorrencias`: muda status, escreve a resolução e tem o
  botão **"Abrir manutenção desta ocorrência"**, que cria a OS já preenchida
  (origem `ACIDENTE/AVARIA`, prioridade vinda da gravidade) e guarda o vínculo
  em `ocorrencias.manutencao_id`.
- Diferença de propósito para o checklist: a avaria do checklist é uma resposta
  dentro da vistoria semanal; a ocorrência acontece a qualquer momento e tem
  vida própria (nasce aberta, morre resolvida).

### Histórico e fotos (feito)
Rota `/historico`: as três fontes de foto viram uma linha do tempo só.
- **Checklist** (semanais, avaria, bloqueio) · **roteiro** (painel/hodômetro de
  saída e chegada) · **ocorrência** (o dano). Sem migration: o dado já existia,
  faltava onde olhar.
- Filtro por veículo, período (padrão: últimos 30 dias), tipo de registro e
  "só com foto". Borda vermelha em checklist não apto, roteiro sem fechamento
  ou com pendência, e ocorrência grave.
- A ficha do veículo (modal do painel) manda pra cá com `?placa=XXX`.

### Alertas ativos (feito)
Migration `0007_alertas_ativos.sql`: a view `v_alertas_ativos` devolve **uma
linha por problema** — revisão (vencida/próxima), roteiro sem fechamento,
veículo parado e ocorrência grave em aberto. Nada gravado em tabela, nada de
job: a verdade é recalculada a cada consulta.
- Tela `/alertas`, e o botão no painel ganha o contador (fica vermelho quando
  há crítico). O painel lê a view em `lib/frota/data.ts`; se a migration não
  tiver rodado, o contador só não aparece.
- Cada alerta traz o botão que resolve o caso (roteiro → registrar chegada,
  revisão → abrir manutenção, ocorrência → tratar, parado → histórico).
- **Veículo que nunca saiu não é "parado", é sem histórico.** A regra exige um
  roteiro anterior como referência — senão, no dia seguinte ao reset dos dados
  de teste, a tela nasceria com a frota inteira em alerta.
- `supabase/tests/alertas_ativos.test.sql` cobre os quatro alertas, os quatro
  silêncios e o `security_invoker`.

### Fuso horário (feito)
O banco guarda `timestamptz` (UTC) e tudo era datado em UTC — 3h adiantado, e o
lançamento da noite caía no dia seguinte. Corrigido em dois andares:
- **App:** `lib/frota/tempo.ts` (`diaDe`, `horaDe`, `diaHoraDe`, `hojeBR`,
  `diaISO`, `intervaloUTC`), com `Intl.DateTimeFormat` em `America/Sao_Paulo` —
  zona nomeada, não offset `-3`, para o horário de verão se ajustar sozinho.
- **Banco:** `0009_fuso_horario.sql` cria `dia_br()`/`hoje_br()` e refaz
  `v_roteiros.situacao` e `v_alertas_ativos`, que faziam `::date` em UTC.
  **Aplicada em produção em 2026-08-06.** Sem ela, das 21h à meia-noite todo
  veículo na rua virava "roteiro sem fechamento" (alerta crítico) e a coluna
  "CONCLUÍDO - DIA SEGUINTE" acusava quem voltou às 23h do mesmo dia e calava
  sobre quem virou a noite de verdade.
- Não houve ordem obrigatória entre os dois: o código não depende da migration.
- **Nenhum dado mudou.** `timestamptz` guarda instante, e o instante sempre
  esteve certo. O que mudou é a resposta para "em que dia isso aconteceu?".
- `supabase/tests/fuso_horario.test.sql` prova os dois andares. Contra as views
  antigas ele falha em 3 das 8 asserções — é o que faz dele teste. **Não vai no
  SQL editor** (ver abaixo).

## Próximos passos (na ordem combinada)

### 1. Ir ao ar (quando decidir)

**A ordem importa mais que os passos.** O reset apaga lançamentos; a migração
insere lançamentos. Migrar e limpar depois joga fora o histórico que acabou de
entrar. A sequência abaixo já está na ordem segura: pré-voo → reset → migração
→ dados dos veículos → equipe.

**Passo 0 — corte da planilha.** Avisar a equipe que a planilha parou e que a
partir dali é o app. Sem esse corte, entram lançamentos na planilha depois da
exportação e eles se perdem.

**Passo 1 — pré-voo (só leitura).** Saber o que existe antes de apagar:

```sql
select 'veiculos' as o_que, count(*) as quantos from veiculos
union all select 'tecnicos ativos',        count(*) from tecnicos where ativo
union all select 'tecnicos ativos SEM login', count(*) from tecnicos where ativo and user_id is null
union all select 'roteiros',               count(*) from roteiros
union all select 'checklists',             count(*) from checklists
union all select 'manutencoes',            count(*) from manutencoes
union all select 'ocorrencias',            count(*) from ocorrencias
union all select 'veiculos fora de ATIVO', count(*) from veiculos where status <> 'ATIVO';
```

Se `veiculos` vier 0, o painel está exibindo o seed de demonstração e o cadastro
da frota precisa ser feito antes de tudo. `tecnicos ativos SEM login` maior que
zero significa técnico que não consegue relatar ocorrência (a tela exige vínculo
com o usuário logado).

**Passo 2 — reset dos lançamentos** (mantém os cadastros):

```sql
-- ordem obrigatória: ocorrencias antes de manutencoes (FK manutencao_id)
delete from ocorrencias;
delete from roteiros;
delete from checklists;
delete from manutencoes;

-- devolve a frota à operação sem ressuscitar o que foi vendido
update veiculos set status = 'ATIVO' where status in ('BLOQUEADO', 'MANUTENCAO');
```

Duas armadilhas que este roteiro já teve e não pode ter de volta:
- **Nada de `delete from roteiros_quarentena`** — essa tabela nunca foi criada
  (é dívida da Fase 1). No SQL editor cada script roda em uma transação, então
  a linha inválida aborta e desfaz o reset inteiro, sem avisar direito.
- **`MANUTENCAO` junto com `BLOQUEADO`** no update. Apagar `manutencoes` sem
  isso deixa o veículo preso fora da operação, sem nenhuma OS que explique.
  Se algum veículo estiver **de fato** na oficina, tire-o do update e abra a
  manutenção real depois.

**Passo 3 — fotos de teste no Storage.** Pelo painel (Storage → bucket →
selecionar → delete), nos quatro buckets: `checklists`, `roteiros`,
`manutencoes`, `ocorrencias`. Não apague por SQL em `storage.objects`: isso
remove o registro e deixa o arquivo órfão no bucket.

**Passo 3.5 — migrar o histórico da planilha.** Fecha a dívida da Fase 1.

1. Aplicar `0008_roteiros_quarentena.sql` (uma vez só).
2. Baixar a planilha do Google Sheets em `.xlsx` (Arquivo → Fazer download →
   Microsoft Excel) por cima de `dados-origem/CONTROLE_DE_FROTA.xlsx`. O export
   do Google traz **valores**, não fórmulas — verificado, o script lê direto.
3. `node scripts/migrar.mjs` (precisa de `npm install` antes; se não houver Node
   na máquina, o Claude roda com o Node portátil apontando para o arquivo).
4. **Ler o relatório.** Se listar "NOMES NAO MAPEADOS", alguém novo apareceu:
   decidir quem é e acrescentar ao mapa `TECNICOS` no topo do script antes de
   aplicar. O script nunca inventa pessoa — nome desconhecido vira quarentena.
5. Colar o `dados-origem/historico.sql` gerado no SQL editor.

O SQL é idempotente: rodar duas vezes não duplica. Números da planilha de
17/07, como referência do que esperar: 237 roteiros, 49 em quarentena, 10
técnicos, 32.571 km.

**Passo 4 — dados reais em `/veiculos`.** Km atual, próxima revisão, consumo e
preço do combustível de cada veículo. O **km atual é o mais importante**: toda
saída é validada contra ele, então um km errado ou trava o técnico no primeiro
uso ou deixa entrar hodômetro furado.

**Passo 5 — conferir `/alertas`.** Com os dados certos a tela deve ficar quase
vazia. Se estiver cheia, é sinal de que o passo 4 ficou pela metade — vale
resolver antes de mostrar para a equipe.

**Passo 6 — equipe.** Instalar o PWA e usar `/campo`. O técnico entra só com o
usuário (ex.: `igor`); o app completa com `@frota.local`.

### Km alto e conferência (feito)
O caso real: roteiro para Minas com 1.827 km recusado pelo app; o veículo ficou
"na rua" e o gestor teve que fechar por SQL. Aconteceu duas vezes (TTP8H79 e
TTZ7I26). O teto de 600 km tratava viagem longa e digitação errada como a mesma
coisa.

Agora são três faixas (`supabase/migrations/0010_km_alto.sql`):
- chegada menor que a saída → impossível, barra no banco;
- acima de **5.000 km** → é o hodômetro digitado no lugar do km, barra com uma
  mensagem que explica o que fazer;
- acima de **600 km** → passa. O técnico confirma e diz para onde foi; o roteiro
  nasce como `CONCLUÍDO - KM ALTO VERIFICAR` na coluna **Pendências** do painel,
  com a justificativa no cartão e um botão **✓ Km conferido**.

Conferido, grava `km_verificado_em` / `km_verificado_por` e sai da fila. A
situação continua sendo calculada na view — o que se grava é a decisão de quem
conferiu, não um número derivado. Prova: `supabase/tests/km_alto.test.sql`.

**Armadilha que apareceu em produção:** a coluna de conferência nasce nula, e
o histórico inteiro nasce junto com ela. No primeiro dia depois da 0010 a fila
de pendências encheu de roteiro antigo — inclusive um que o gestor já tinha
fechado à mão semanas antes. `0013_km_alto_historico.sql` marca como conferido
tudo que fechou antes de a regra existir. A regra vale daqui para a frente;
fila que acusa o passado é fila que se aprende a ignorar, e aí a viagem de
1.800 km que interessa passa batido no meio do lixo.

### Horários dos roteiros (feito)
Os horários sempre foram gravados; não apareciam em lugar nenhum depois do
fechamento. Agora `v_roteiros` entrega `hora_saida`, `hora_chegada` e
`duracao_min` prontos (fuso de São Paulo, como manda o 0009), e eles aparecem no
cartão de "Concluídos hoje", na ficha do veículo, no CSV de roteiros e na tela
`/ponto`.

### Ordem de serviço (feito)
`/manutencao/ordem?id=<uuid>` monta uma folha A4 para imprimir: cabeçalho com o
número da ordem, dados do veículo, o que fazer, e a metade de baixo em branco
para a oficina preencher à mão (serviços, peças, km de entrega, valor,
assinaturas). O link aparece no cartão da manutenção, na ficha do painel e num
aviso verde logo depois de abrir a ordem — que é quando o veículo ainda está
com quem vai levar. O papel não grava nada: o resultado volta para `/manutencao`.

### Relatórios (feito)
`/relatorios` — um período, cinco recortes, CSV em cada e impressão em A4:
combustível por veículo, km por dia/mês/veículo, deslocamentos por técnico,
manutenções e ocorrências.

Tela própria e não aba do painel porque as perguntas são opostas: o painel
responde "como está agora" e carrega a frota sem recorte de data; relatório
responde "o que aconteceu entre tal e tal dia", e sem período todo número vira
o acumulado de sempre, que não fecha mês.

As contas ficam em `app/relatorios/dados.ts`, fora do JSX — é a parte que
precisa estar certa. Duas convenções que valem para todas elas:
- o **custo do roteiro** vem pronto de `v_roteiros` (`custo_roteiro`), nunca
  recalculado no front: duas fontes para o mesmo número é o erro da planilha;
- o **dia do roteiro** sai de `diaDe(saida_em)` (fuso de São Paulo), o que
  impede o roteiro das 22h de cair no mês seguinte no relatório mensal.

Litros é **estimativa** pelo consumo cadastrado, não nota de posto — e fica
nulo, não zero, para veículo sem consumo cadastrado. Custo real dependeria de
registro de abastecimento, que continua na lista de ideias.

`/relatorios` é só do GESTOR: a RLS de `ocorrencias` não abre para PCM, que
veria a aba vazia e leria isso como "não houve ocorrência".

### Ideias mapeadas, ainda não priorizadas
- **Fotos históricas dos roteiros.** Não vieram na migração, por decisão de
  2026-08-03. Existem e são localizáveis (a `KM_DIARIO` guarda `LINHA_SAÍDA`
  apontando para `RESPOSTAS_ROTEIRO`; 274 dos 276 têm link), mas o link é de
  página do Drive e não de imagem — gravar direto faria a `/historico` mostrar
  274 imagens quebradas. Para trazer de verdade: baixar via
  `drive.google.com/uc?export=download&id=<ID>` e subir no bucket `roteiros`.
  O cabeçalho de `scripts/migrar.mjs` guarda o caminho completo.
- **Aba "Pendências" do painel lendo `roteiros_quarentena`.** A tabela existe e
  é populada pela migração, mas nenhuma tela mostra ainda. Hoje se consulta por
  SQL.
- Cadastro de CNH/documentos com alerta de vencimento.
- Registro de abastecimento para custo real (hoje o custo é estimado).

## Como trabalhar neste projeto

**Código: o Claude commita direto.** O 403 relatado nas primeiras sessões era o
credential helper do git, não o token — `gh auth setup-git` resolve, e o token do
`gh` tem escopo `repo` (push e admin no repositório). O fluxo:
1. Claude escreve o código e **valida com `npm run build`**.
2. Claude commita numa branch `claude/...` e abre PR.
3. O gestor revisa e faz o merge. A Vercel deploya sozinha (~2 min).

**Banco: continua manual.** Não há credencial do Supabase neste ambiente (a CLI
não está instalada e não há token). O Claude entrega o `.sql` e o gestor cola no
SQL editor. Rodar as migrations **antes** de fazer o merge do código que
depende delas.

**Só `supabase/migrations/` vai no SQL editor.** `supabase/tests/` é pgTAP, que
não está instalado no projeto — colar um `.test.sql` lá responde `function
plan(integer) does not exist` e não faz nada (aconteceu em 2026-08-06 com o
`fuso_horario.test.sql`). Os testes rodam com `supabase test db`, ou no PG
portátil local. Se um deles for colado por engano, não há estrago a desfazer: o
erro aborta antes de qualquer escrita, e o arquivo inteiro é `begin/rollback`.

**Node não está instalado na máquina.** Para validar o build, baixar o ZIP
oficial do Node e extrair num caminho **curto** (`%LocalAppData%\Temp\n22`). No
diretório de scratchpad da sessão o caminho passa dos 260 caracteres do MAX_PATH
e o npm falha **sem imprimir nada** (por dentro é o resolver de ESM não achando
o `#ansi-styles` do chalk). O PowerShell também está quebrado nesta máquina
(erro de .NET Framework) — usar o Bash.

**Armadilhas já encontradas** (evitar repetir):
- Next.js 16: usar `proxy.ts` (não `middleware.ts` na raiz) — Edge não suporta
  o cliente Supabase.
- Na Vercel, o Framework Preset precisa estar como **Next.js** (não "Other").

## Regras do projeto (do CLAUDE.md)
- Nada de cálculo derivado gravado em tabela — é view ou coluna gerada.
- Nome de pessoa nunca é texto livre: FK para `tecnicos`.
- Toda entrada de km é validada contra o km anterior do veículo.
- RLS ativa em todas as tabelas.
- Português nos campos, tabelas e UI.
- Vocabulário: **roteiro** (saída + chegada), **placa** (sem espaço/hífen),
  **técnico** (quem dirige), **gestor**. Não usar "viagem", "motorista", "trip".
