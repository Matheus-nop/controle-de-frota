
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

Todas as rotas de uso diário moram em `app/(app)/`, que aplica a casca comum.
`/login` e `/manutencao/ordem` ficam fora dela.

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

As contas ficam em `app/(app)/relatorios/dados.ts`, fora do JSX — é a parte que
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

### Aparência (feito)
O app tinha um desenho por tela: estilo em linha na maioria, três blocos de CSS
injetado (painel, ponto, relatórios) com cópias dos mesmos tokens, e nenhuma
barra superior ou navegação — cada página se resolvia sozinha e cada uma tinha
o seu botão azul.

Agora o design system é **o mesmo do app de Roteiros**, porque é a mesma equipe
alternando entre os dois no mesmo dia:

- `app/globals.css` — o `@theme` da marca (`brand-*` do azul do logotipo,
  `acento-*` do âmbar da engrenagem, `acao-*` da ação primária) e os utilitários
  `.campo`, `.rotulo`, `.tabela`, `.toque`, `.placa`. Espelha
  `roteiros/src/index.css`.
- `components/ui.tsx` — o kit: Botao, BotaoLink, Cartao, Pagina, Contador,
  Modal, Confirmar, Badge, Campo, Input, Select, Textarea, Vazio, Aviso, Placa.
- `components/Logo.tsx` — logomarca do grupo, o símbolo do sistema (o veículo
  sobre a estrada) e o lockup da barra superior.
- `components/Casca.tsx` — barra superior com o gradiente da marca, abas por
  papel no desktop, gaveta no celular, menu do usuário e a caixinha "Sistemas",
  que alcança Roteiros e Estoque.
- Ícones: `lucide-react`, no lugar dos emojis — emoji muda de desenho conforme
  o aparelho, e era a única pista do tipo no cartão de alerta.

**Route group `app/(app)/`.** É ele que aplica a casca. O endereço das telas não
mudou (`(app)` não entra na URL). Ficam de fora, de propósito, `/login` e
`/manutencao/ordem` — a ordem de serviço é uma folha A4 que vai para a oficina.

**Duas variáveis novas**, opcionais: `NEXT_PUBLIC_URL_ROTEIROS` e
`NEXT_PUBLIC_URL_ESTOQUE`. Vazias, o item some da caixinha "Sistemas"; vazias as
duas, a caixinha inteira some. No Vercel: Settings → Environment Variables.

Regra que passa a valer: **nada de estilo em linha nem de `<style>` por tela.**
Peça nova é peça no kit.

### Número em português (feito, 2026-09-09)
Na primeira apresentação ao gestor, a abertura de uma manutenção com `30.000` de
km e `3.000,00` de orçamento gravou **30 e 3**. Mil vezes menos, sem aviso, e a
ordem de serviço saiu impressa com "R$ 3,00" para a oficina.

A causa eram dois parsers ingênuos copiados por quatro telas:

```
parseInt("30.000", 10)                     -> 30   (o ponto corta o número)
parseFloat("3.000,00".replace(",", "."))   -> 3    (o replace troca a PRIMEIRA
                                                    vírgula: vira "3.000.00")
```

Agora a conversão mora em **`lib/frota/numero.ts`** (`paraDecimal`,
`paraInteiro`, `emKm`, `emReais`, `emKmPorLitro`). A regra de desempate: quando
o último separador tem exatamente três dígitos depois dele, ele é milhar, não
decimal — `30.000` e `30,000` valem trinta mil; `3.000,00` vale três mil.
Quilometragem corta a casa decimal em vez de arredondar, porque o hodômetro de
quem digitou `66402,5` marca 66402, e é contra esse número que a próxima saída
é validada.

E o kit ganhou **`CampoNumero`**, que substituiu todo `<input type="number">` de
km e dinheiro. Ele é campo de texto com `inputMode` (o teclado numérico do
celular continua abrindo) e **mostra embaixo o número que vai ser gravado**:
digitou `30.000`, lê-se "30.000 km" logo abaixo. É a parte que mais importa —
`30.000` só é ambíguo até alguém ver a interpretação antes de salvar. Texto que
não vira número avisa em vermelho, em vez de virar nulo caladamente.

O `type="number"` saiu por três motivos, não um: entendia o ponto como decimal,
mudava de valor sozinho quando a roda do mouse passava por cima, e apagava sem
avisar o que considerava inválido.

Telas alteradas: `/manutencao` (abertura e andamento), `/veiculos` (criar e
editar), `/checklist`, `/roteiro/saida`, `/roteiro/chegada` e a ordem de serviço.

**`km_abertura` passou a aparecer no painel "Registrar andamento"** de
`/manutencao`. Antes só existia no formulário de abrir, e uma manutenção com o km
errado só se corrigia no banco. É o número que mais chega errado — vem do
hodômetro anotado no pátio e às vezes só é conferido depois.

Pendente relacionado: o km do `/checklist` ainda não é validado contra o km
anterior do veículo, como a saída e a chegada são. A regra do CLAUDE.md pede
isso; ficou de fora desta correção por ser outro assunto.

### Ícone do app (feito, 2026-09-10)
O ícone do PWA era a logomarca do Grupo Nova Opção encolhida. Em 48px na tela
inicial ela é uma mancha escura ilegível — e, pior, seria a mesma mancha de
qualquer outro sistema do grupo. Ícone de app existe para diferenciar à
distância de um polegar, não para repetir a marca.

Agora o ícone é **o símbolo do sistema**: o veículo sobre a estrada, o mesmo
desenho do `Simbolo` em `components/Logo.tsx`. É a regra que o Roteiros já
segue — lá o símbolo do topo e o ícone da tela inicial são a mesma marca.

O veículo é **branco** sobre o azul, como o cubo do Estoque; a estrada âmbar é o
que amarra no pin do Roteiros. Vale registrar o que se descobriu no caminho: os
três ícones do grupo **não seguem um sistema único**. O Roteiros é gradiente com
um motivo âmbar sólido; o Estoque é azul chapado com traço branco. Chegou a
existir uma versão âmbar deste ícone, para casar com o Roteiros, mas ela
destoava do Estoque — foi decisão de 2026-09-10 manter o veículo branco, que
fica no meio e não briga com nenhum dos dois. Unificar os três de verdade é
trabalho de mexer nos três repositórios, e não foi feito.

O desenho encolheu (ocupa 330 de 512, contra os 400 da primeira tentativa) — em
32px o veículo grande virava uma mancha sem forma.

**Arquivos.** `public/icone.svg` é a fonte; os PNGs saem dele.

| arquivo | tamanho | para quê |
|---|---|---|
| `icon192.png` | 192 | manifesto, `purpose: any` |
| `icon512.png` | 512 | manifesto, `purpose: any` |
| `icon-maskable-512.png` | 512 | manifesto, `purpose: maskable` |
| `appleicon.png` | 180 | `apple-touch-icon` do iOS |

O **maskable é um arquivo à parte**, e tem que ser. O Android recorta o ícone na
forma do aparelho (círculo, quadrado, squircle) e só respeita o círculo central
de 80% do lado; por isso ele tem o fundo até a borda (sem canto arredondado) e o
desenho menor, dentro da zona segura. O manifesto antigo declarava o `icon512`
comum como maskable, o que corta as bordas do desenho.

**Se for mexer no desenho:** mude os três juntos — `components/Logo.tsx`
(`Simbolo`), `public/icone.svg` e os PNGs. O `Simbolo` usa o mesmo `<g
transform>` que o SVG do ícone, só que em viewBox 32 em vez de 512 (é a mesma
conta dividida por 16), justamente para que os dois não possam divergir sem
alguém perceber.

**O manifesto também ganhou** `id`, `scope`, `lang` e atalhos. O `id` importa: sem
ele o navegador identifica o app pela `start_url`, e mudar a start_url um dia
faria o celular tratar isto como app novo — dois ícones iguais na tela inicial e
a instalação antiga órfã.

### Avarias e escopo de manutenção (feito, 2026-09-10)
Cinco pedidos que saíram da reunião de apresentação. Quatro giram em torno de
avaria; o quinto é um módulo novo.

**O modelo de avaria mudou, e é a base dos outros.** O `checklists.itens`
guardava UMA avaria por vistoria (`itens.avaria`). Contar "ontem 2, hoje 3" era
impossível: o segundo dano do dia sobrescrevia o primeiro ou virava texto solto
na descrição. Agora o formulário grava `itens.avarias` (lista) e permite
adicionar quantas forem encontradas.

**As vistorias antigas não foram migradas, de propósito.** Vistoria é registro do
que alguém viu num dia, e reescrever isso para caber num formato novo é perder a
prova — que é para o que as fotos servem. Quem lê aceita as duas formas:
`lib/frota/avarias.ts` no app, `public.qtd_avarias()` no banco. **As duas têm que
concordar**: o alerta diz "3 avarias" e a tela precisa mostrar três. Mexeu numa,
mexa na outra — há um teste dos 11 formatos rodado nas duas linguagens.

| pedido | onde ficou |
|---|---|
| 1 · filtro de avarias no histórico | `/historico`: "só com avaria" + recorte por onde e por tipo |
| 2 · alerta comparando checklists | `v_alertas_ativos` ganhou o tipo `AVARIA` (migração 0014) |
| 3 · comparativo para evidência | `/comparativo` — duas vistorias lado a lado, com as fotos |
| 4 · escopo de manutenção | `/escopos` + migração 0015 |
| 5 · técnico vê o último checklist | cartão no topo do `/checklist`, ao escolher o veículo |

**O alerta de avaria** compara as duas últimas vistorias do veículo e dispara
quando a contagem sobe. Exige vistoria anterior (a primeira registra o que já
existia, não dano novo) e ignora vistoria com mais de 60 dias — alerta velho
ensina o gestor a ignorar a tela. Some sozinho quando a vistoria seguinte não
acusa aumento.

**O escopo de manutenção é por MODELO**, não por placa: a frota tem 9 veículos em
5 modelos, e três Kia Bongo com o mesmo plano digitado três vezes é uma chance em
três de sair diferente. Decisão de 2026-09-10, com o gestor.

A regra de km é **"a cada", e não "no"**: `km_intervalo` 20.000 vale aos 20, 40,
60, 80. Um marco puxa toda regra cujo intervalo o divide. É isso que resolve o
caso levantado na reunião — pastilha de freio não se troca a cada 10 ou 20 mil:
ela mora numa regra de 40.000 e aparece de 40 em 40, enquanto o óleo mora na de
10.000 e aparece em todas. Não existe repetição global; existe uma por linha.

O marco é comparado contra `veiculos.proxima_revisao_km`, e não contra o
hodômetro: 66.402 não é múltiplo de nada, e a revisão é planejada para o marco.
Quem abre a preventiva confirma o número na tela.

**`manutencoes.revisao_km` guarda só o marco** — uma decisão, não um cálculo. Os
itens NÃO são copiados para a manutenção: a ordem de serviço monta a lista na
hora, a partir do modelo e desse número. É a regra do projeto sobre não gravar
derivado, e tem uma consequência que vale saber: reimprimir uma ordem depois de o
plano mudar mostra o plano de agora.

### O Bongo 2025/2026 tem plano próprio (feito, 2026-09-10)
Pesquisando o plano dos fabricantes para preencher os escopos, apareceu um
problema na frota, e não na tabela: **os três Kia Bongo não seguem o mesmo
plano**. A Kia esticou o intervalo a partir do ano-modelo 2026.

| placa | responsável | ano | intervalo |
|---|---|---|---|
| TTB0J08 | Igor | 2024/2025 | 10.000 km |
| TTX1H09 | Alexandre | 2024/2025 | 10.000 km |
| TTZ7I26 | Rafael | **2025/2026** | **15.000 km** |

Fonte: kia.com.br/revisoes e o anúncio do Bongo K2500 4x4 2025/2026.

O escopo é por modelo, e os três estavam como "KIA BONGO" — os três leriam o
mesmo plano. Ou o do Rafael iria à oficina 50% mais vezes do que o fabricante
manda, ou os outros dois iriam de menos, e "de menos" em revisão é garantia
perdida.

**A migração 0016 renomeia o do Rafael para `KIA BONGO 2026`.** O modelo é a
chave do escopo; separar resolve sem mexer no schema e deixa a diferença visível
na tela em vez de escondida numa exceção. A tela de escopo passou a mostrar o ANO
de cada veículo ao lado da placa, para que dois blocos "KIA BONGO" não pareçam
engano de cadastro — sem isso alguém junta de volta.

A alternativa, escopo com exceção por placa, foi descartada quando o escopo foi
desenhado (não havia caso real) e **vale reabrir se aparecer um segundo caso**.

**Veículo novo do mesmo tipo:** cadastre com o nome do modelo que corresponde ao
plano dele, não ao que está escrito no documento. Bongo 2026 ou mais novo é
`KIA BONGO 2026`.

### Escopos ainda por preencher
Os intervalos foram levantados; **as listas de serviço não**. A Kia manda
consultar o Manual de Garantia e Manutenção para saber os itens de cada revisão,
e os manuais da Fiat em PDF recusam acesso automatizado. Deduzir item de revisão
a partir de site de oficina produziria uma tabela plausível e errada — que iria
impressa na OS, para a oficina seguir, em freio e correia.

Intervalos levantados, para conferir contra o manual:

| modelo | intervalo | confiança |
|---|---|---|
| KIA BONGO até MY2025 | 10.000 km / 12 meses | montadora |
| KIA BONGO 2026 | 15.000 km / 12 meses | montadora |
| FIORINO flex | 10.000 km / 12 meses | terceiros |
| FIORINO diesel | 20.000 km / 12 meses | terceiros |
| VW DELIVERY 9.170 | amaciamento 1.000–5.000 km, depois 20.000 km | terceiros |
| STRADA, SCUDO | não levantado | — |

O caminho combinado: o PCM tira foto das páginas do plano de manutenção dos
manuais (estão na porta-luvas; a concessionária tem todos) e elas viram SQL.

### O gestor reclassifica foto de vistoria (feito, 2026-09-11)
Na primeira semana de uso apareceu o caso: o técnico mandou **onze fotos, todas
marcadas como semanal**, e várias eram dano — farol quebrado, porta amassada. A
vistoria ficou com zero avaria. Consequência em cadeia: o alerta de avaria nova
não dispara, o comparativo da semana seguinte não tem com o que comparar, e o
filtro de avaria não acha nada.

Pedir para o técnico refazer não resolve — ele entregou o veículo e foi para a
rua. Quem consegue olhar a foto e dizer "isto é a traseira amassada" é o gestor,
depois, na mesa.

**Onde:** `/historico`, botão **Reclassificar fotos** no cartão de qualquer
checklist. Abre com as fotos semanais daquela vistoria; o gestor marca as que são
dano, diz onde e o tipo, e elas viram uma avaria.

**Isto não é reescrever o passado, e a diferença importa.** A foto continua a
mesma, tirada na mesma hora, e nada se apaga: as duas funções
(`reclassificarComoAvaria`, `desfazerReclassificacao`, em `lib/frota/avarias.ts`)
só movem URLs entre `fotos_semanais` e `avarias` do mesmo registro. E a mudança
fica **assinada**: `reclassificada_por` e `reclassificada_em` em toda avaria
criada assim.

A marca aparece em todo lugar que mostra a avaria — histórico ("avaria
(reclassificada)"), comparativo (crachá com o nome de quem marcou) e no cartão do
técnico ("marcada pelo gestor"). Numa discussão sobre quando o dano apareceu,
"o técnico registrou na rua" e "o gestor reconheceu depois" não valem a mesma
coisa, e a tela não esconde isso.

**Sem migração.** A policy `checklists_update` já é `is_gestor()` desde a 0004 —
o PCM lê o histórico mas não reclassifica, e recebe um aviso em português em vez
de erro de RLS.

**Desfazer só desfaz o que o gestor fez.** Avaria registrada em campo pelo
técnico não se apaga por essa tela: corrigir o que outra pessoa viu na rua é
outra conversa.

**Um defeito que o teste pegou antes de sair:** `listaDeAvarias` devolvia a
referência da lista de dentro do `itens`, e o `push` da reclassificação escrevia
no objeto que veio de fora. Reclassificar duas fotos em seguida deixava a
primeira versão com a avaria da segunda. Só apareceu porque o teste conferia o
total de fotos antes e depois — a soma dava 6 onde havia 5. Hoje a função copia,
e essa conferência de total virou caso permanente.

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
