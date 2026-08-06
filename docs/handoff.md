
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
| `/roteiro/chegada` | Registrar chegada (valida km ≥ saída e ≤ 600, pendência, foto) | todos |
| `/checklist` | Checklist semanal (réplica do Google Forms: 7 seções, avaria condicional, bloqueio, fotos) | todos |
| `/ocorrencia` | Relatar dano/acidente/avaria com foto obrigatória | todos |
| `/ocorrencias` | Fila de ocorrências: tratar, resolver, virar manutenção | GESTOR |
| `/historico` | Tudo que a equipe registrou, com as fotos, por veículo e período | GESTOR |
| `/alertas` | O que precisa de atenção agora, com o botão que resolve cada caso | GESTOR |
| `/manutencao` | Abrir manutenção, registrar andamento, anexar nota fiscal | GESTOR |
| `/veiculos` | Gestão de veículos (km, revisão, consumo, combustível, status, responsável) | GESTOR |
| `/login` | Login por usuário + senha | público |
| `/api/health` | Health-check do Supabase | público |

### Automações ativas (triggers no banco)
- `trg_km_roteiro` / `trg_km_checklist` — atualizam `veiculos.km_atual` sozinhos.
- `trg_bloqueio_checklist` — checklist "não apto" bloqueia o veículo; "apto" libera.

### Acesso e papéis
- **Gestor** entra com e-mail real completo → vai para `/`.
- **Técnico** entra só com o usuário (ex.: `igor`) → o app completa com
  `@frota.local` → vai para `/campo`. O proxy (`lib/supabase/middleware.ts`)
  bloqueia técnico em `/` e `/veiculos`. A RLS já isola os dados por pessoa.
- 13 técnicos cadastrados e vinculados a logins internos.

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

### Fuso horário (feito no app, **migration pendente no banco**)
O banco guarda `timestamptz` (UTC) e tudo era datado em UTC — 3h adiantado, e o
lançamento da noite caía no dia seguinte. Corrigido em dois andares:
- **App:** `lib/frota/tempo.ts` (`diaDe`, `horaDe`, `diaHoraDe`, `hojeBR`,
  `diaISO`, `intervaloUTC`), com `Intl.DateTimeFormat` em `America/Sao_Paulo` —
  zona nomeada, não offset `-3`, para o horário de verão se ajustar sozinho.
  Já mergeado.
- **Banco:** `0009_fuso_horario.sql` cria `dia_br()`/`hoje_br()` e refaz
  `v_roteiros.situacao` e `v_alertas_ativos`, que faziam `::date` em UTC.
  **Colar no SQL editor.** Sem ela, das 21h à meia-noite todo veículo na rua
  vira "roteiro sem fechamento" (alerta crítico) e a coluna
  "CONCLUÍDO - DIA SEGUINTE" acusa quem voltou às 23h do mesmo dia e cala sobre
  quem virou a noite de verdade.
- Não há ordem obrigatória entre os dois: o código não depende da migration.
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
