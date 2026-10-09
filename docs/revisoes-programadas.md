# Revisões programadas e pacotes de revisão gratuita

Como a frota agenda um serviço que ainda não aconteceu, e como não perde as
revisões que o prestador já deu.

## O problema que isto resolve

A frota comprou alinhamento e balanceamento na FULL PNEUS e o prestador deu
direito a **seis revisões gratuitas**. Antes disto, nada no sistema sabia que
esse saldo existia:

- uma manutenção só passava a existir **depois** de o veículo parar;
- o alerta de revisão só comparava o hodômetro com `proxima_revisao_km`.

O desfecho previsível é o benefício vencer sem ser usado — paga-se por sete
serviços e usam-se dois. O mesmo vale para qualquer coisa que um prestador
venda em pacote: geometria de suspensão, troca de óleo com retorno,
higienização de ar-condicionado.

## O vocabulário

- **pacote**: o que o prestador vendeu junto com o serviço. Tem prestador,
  serviço, quantas revisões gratuitas, a cadência recomendada e a validade.
- **revisão gratuita**: uma das revisões do pacote. Quando usada, é uma
  manutenção comum apontando para o pacote.
- **agendada**: situação nova da manutenção. Existe antes de acontecer, com dia
  marcado com a oficina.

## As duas peças, e por que são duas

### 1. Agendar

`manutencoes.agendada_para` (data) e a situação `AGENDADA`.

Isto é o que faltava para "revisão programada" querer dizer alguma coisa: até
aqui, manutenção só nascia quando o veículo já estava parado. Uma manutenção
agendada **não bloqueia o veículo** — ele continua rodando até o dia chegar.

Serve para qualquer serviço marcado, com ou sem pacote.

### 2. O pacote

`pacotes_revisao`, e `manutencoes.pacote_id` ligando cada revisão usada ao
pacote que a pagou.

## A regra que sustenta tudo: o saldo é contagem, não contador

**"Quantas sobram" nunca é gravado.** É contagem das manutenções que apontam
para o pacote, feita pela view `v_pacotes_revisao`.

A consequência prática importa mais do que a regra: **cancelar uma manutenção
devolve a revisão sozinha**. Agendou, o veículo não pôde ir, cancelou — o
prestador não gastou nada, e ninguém precisa lembrar de somar de volta. Um
contador gravado teria duas fontes de verdade que divergem no primeiro
cancelamento.

A view também calcula a **próxima prevista**, contando a partir da última
revisão usada (ou da contratação, se nenhuma foi usada ainda). Com as duas
cadências preenchidas — km e dias — vale o que chegar primeiro, que é como a
oficina fala.

## O fluxo, do balcão ao papel

1. **Comprou o serviço com pacote?** Cadastre em **Revisões** → *Novo pacote*:
   prestador, serviço, quantas gratuitas, a cadência que ele recomendou e até
   quando vale. O km da contratação em branco usa o hodômetro de agora.
2. **O sistema avisa.** Quando a próxima vencer (por km ou por data), ou quando
   o pacote estiver perto de expirar com saldo, aparece em **Alertas**.
3. **Marcou com a oficina?** Em **Revisões**, *Agendar revisão*. Cria uma
   manutenção `AGENDADA` com o dia combinado, já apontando para o pacote. O
   saldo cai na hora.
4. **O dia chegou.** O alerta avisa. Leve a ordem de serviço impressa.
5. **Voltou da oficina.** Em **Manutenção**, mude a situação para `CONCLUÍDA` e
   lance o que foi feito. Se não foi, `CANCELADA` — e a revisão volta para o
   saldo.

## Os alertas

Dois ramos novos em `v_alertas_com_ciencia` (migração 0027).

### `AGENDADA`

Aparece quando o dia marcado está a até 7 dias, e vira **CRÍTICO** quando
passou. **Some sozinho** quando a manutenção deixa de estar agendada — ninguém
precisa dar ciência; abrir ou concluir já resolve.

### `REVISÃO GRATUITA`

Aparece quando o pacote tem saldo **e** uma destas é verdade:

| condição | o que significa |
|---|---|
| a próxima venceu por data | passou do intervalo em dias |
| a próxima venceu por km | o hodômetro passou do previsto |
| faltam 45 dias ou menos para o pacote expirar | dinheiro prestes a virar pó |

Vira **CRÍTICO** a 15 dias do vencimento. Some quando o saldo zera, quando o
pacote é encerrado, ou quando ele expira — alerta sobre o que não tem mais
conserto só ensina a ignorar a tela.

### A ciência vale para o ciclo atual, e só ele

A referência do alerta carrega **quantas revisões já foram usadas**:
`pacote:<id>:3`. Então dar ciência cala o alerta de agora, mas assim que uma
revisão é usada a referência muda para `:4` e o alerta do próximo ciclo aparece
limpo. Sem isso, uma ciência silenciaria o pacote para sempre.

## Quem pode o quê

Mesma regra dos escopos: **todos leem, gestor e PCM mexem**. O técnico vê os
pacotes do veículo que dirige mas não cadastra, não altera e não apaga.

Provado em `supabase/tests/revisoes_programadas.test.sql`, que verifica o
bloqueio do técnico **e** o sucesso do gestor no mesmo ponto — senão estaria
provando que ninguém consegue, e não que a política separa os papéis.

## Onde fica cada coisa

| | |
|---|---|
| `supabase/migrations/0027_revisoes_programadas.sql` | tabela, view do saldo, RLS e os dois ramos de alerta |
| `supabase/tests/revisoes_programadas.test.sql` | 16 asserções: saldo, ciclo da ciência, alertas e RLS |
| `lib/frota/pacote.ts` | classificação e texto em português. **Não recalcula saldo** — lê o que a view já disse |
| `app/(app)/revisoes/page.tsx` | a tela: pacotes, saldo, cadastrar e agendar |
| `app/(app)/manutencao/page.tsx` | a situação `AGENDADA`, o filtro e o campo de remarcar |

## O que ficou de fora, de propósito

- **O app de Roteiros não sabe de nada disto.** Um veículo agendado para a
  oficina na terça continua podendo ser escalado para um roteiro na terça. Os
  dois sistemas têm bancos Supabase separados e cadastros de veículo
  independentes (lá o veículo é `KIA - TTB0J08`, aqui é a placa), e ligar os
  dois é uma decisão de arquitetura que ainda não foi tomada. Por enquanto,
  quem planeja o roteiro precisa olhar a tela de Revisões.
- **Não existe lembrete por e-mail nem push.** O alerta vive no app. Numa frota
  de nove veículos com o gestor abrindo o painel todo dia, isso basta; se um
  dia não bastar, o ramo de alerta já é o lugar certo para pendurar o envio.
