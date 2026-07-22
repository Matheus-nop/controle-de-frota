# Plano da Fase 3 — o painel plugado

Handoff para a sessão que vai construir a Fase 3. Leia junto com o
`docs/guia-claude-code-frota.md` (seção Fase 3) e o `CLAUDE.md`.

## Objetivo (do guia)
Portar o `painel-frota.jsx` (hoje com a constante `DADOS` embutida) para um app
Next.js que lê do Supabase. **Manter layout, CSS e componentes exatamente** — não
redesenhar. Trocar `DADOS` pelas views `v_roteiros`, `v_alertas`, `v_custo_veiculo`.
Trocar o `REF = '2026-07-17'` por `current_date`. A aba "Pendências" passa a ler
`roteiros_quarentena` + roteiros com `situacao = 'SEM FECHAMENTO'`.

## O que já está pronto (não refazer)
- Banco Supabase provisionado: 5 tabelas, 3 views, RLS ligada e provada (Fase 2).
- Matheus cadastrado como GESTOR, login vinculado. Ver [[estado-supabase]].
- Views prontas para o painel: `v_roteiros`, `v_alertas`, `v_custo_veiculo`.

## Pré-requisitos que ainda NÃO existem (instalar/criar no início)
1. **Node.js + npm** — não instalado. `winget install OpenJS.NodeJS.LTS`
   (abrir terminal novo depois, pro PATH pegar).
2. **App Next.js** — não existe (nem `package.json`). `create-next-app`
   com App Router + TypeScript + Tailwind.
3. **Cliente Supabase** — usar `@supabase/ssr` (server components + sessão por
   cookie) e `@supabase/supabase-js`.
4. **`.env.local`** — `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   (pegar no painel; a `anon` é segura no cliente — **nunca** a `service_role`).
5. **Login** — o painel é do gestor e a RLS exige usuário autenticado. Precisa de
   uma tela de login por magic link, senão as views voltam vazias (a RLS filtra
   tudo para um anônimo).

## O nó a decidir ANTES do painel: dados
O banco está **vazio**. A Fase 1 foi marcada concluída mas só o schema foi feito —
a **migração dos dados** da planilha nunca rodou:
- `scripts/migrar.ts` não existe (a pasta `scripts/` está vazia).
- A tabela `roteiros_quarentena` — que a aba "Pendências" lê — **não existe**.
- A planilha de origem está em `dados-origem/CONTROLE_DE_FROTA.xlsx` (gitignored).

Sem dados, o painel plugado nasce vazio e não dá pra validar de verdade. Duas frentes:
- **Mínimo para ver o painel render**: migration `0005_quarentena.sql` criando
  `roteiros_quarentena`, + semear um punhado de linhas reais (1-2 veículos, alguns
  roteiros) para desenvolver contra dados de verdade.
- **Completo (fecha a dívida da Fase 1)**: construir o `scripts/migrar.ts` conforme
  a spec do guia (normalizar placa, dedup de técnicos com PARADA para revisão,
  quarentena dos roteiros que violam constraint). É um trabalho à parte — merece a
  própria sessão/PR.

## Sequência sugerida (um PR por fatia)
1. **PR — scaffold**: Node + `create-next-app` + `@supabase/ssr` + `.env.local` +
   um health-check que confirma a conexão (build passa, `npm run dev` sobe).
2. **PR — dados**: `0005_quarentena.sql` + migração/seed dos dados. (Ou uma sessão
   dedicada ao `migrar.ts` completo.)
3. **PR — login**: tela de magic link + guarda de sessão no layout. Configurar as
   **redirect URLs** no Supabase (`http://localhost:3000/**` no dev) — é a config
   de magic link que ficou pendente da Fase 2.
4. **PR — painel**: portar o `painel-frota.jsx` para Server Components lendo das
   views. Mapear as colunas das views para o shape que o `DADOS` espera hoje —
   primeiro passo da sessão é LER o `painel-frota.jsx` e listar o que `DADOS` contém.

## Como validar (a prova da Fase 3)
`npm run dev`, logar como gestor → painel populado do banco. Depois, logar como um
técnico de teste → ver só os roteiros dele. É a RLS da Fase 2 aparecendo na tela.

## Cuidados
- Não redesenhar o painel. Layout idêntico; só troca a fonte dos dados.
- `custo_km`, `km_rodado`, `situacao` vêm prontos das views — não recalcular no front.
- Regra inviolável continua: nada de cálculo derivado gravado; português na UI.
