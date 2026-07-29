
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
`manutencoes` (nota fiscal). Policy de INSERT para `authenticated` em cada um.

## Próximos passos (na ordem combinada)

### 1. Ocorrências (dano / acidente) — PRÓXIMO
Técnico relata ocorrência no veículo pelo app de campo, com foto.
- Migration nova: tabela `ocorrencias` (veiculo_id, tecnico_id, tipo
  [DANO/ACIDENTE/AVARIA/OUTRO], data, descricao, gravidade, fotos jsonb,
  status, resolvida_em) + RLS no mesmo modelo de `roteiros`.
- Tela `/ocorrencia` (registro, com câmera) e entrada na tela `/campo`.
- Ocorrência grave deve poder virar manutenção (link para `/manutencao`).

### 2. Histórico de checklists e fotos
Área do gestor para consultar tudo que a equipe registrou.
- Ver **checklists por veículo**, com as fotos (semanais, avaria, bloqueio).
- Ver **fotos dos roteiros** (painel/hodômetro de saída e chegada).
- Sugestão: rota `/historico` com filtro por veículo e período, e galeria
  de fotos na ficha do veículo (modal do painel).

### 3. Ir ao ar (quando decidir)
- Rodar o **reset dos dados de teste** (apaga lançamentos, mantém cadastros):
  `delete from roteiros; delete from checklists; delete from roteiros_quarentena;
  delete from manutencoes; update veiculos set status='ATIVO' where status='BLOQUEADO';`
  e limpar as fotos de teste no Storage.
- Conferir em `/veiculos` os dados reais de cada veículo (km, revisão, consumo,
  preço do combustível) — hoje ainda vêm do seed de demonstração.
- Treinar a equipe: instalar o app (PWA) e usar `/campo`.

### Ideias mapeadas, ainda não priorizadas
- Migração dos dados históricos da planilha (`scripts/migrar.ts` nunca foi feito;
  o painel usa `lib/frota/seed.ts` como fallback quando o banco está vazio).
- Alertas ativos (revisão vencida, veículo parado, roteiro sem fechamento).
- Cadastro de CNH/documentos com alerta de vencimento.
- Registro de abastecimento para custo real (hoje o custo é estimado).

## Como trabalhar neste projeto

**Importante:** a sessão do Claude Code **não tem permissão de escrita** no
repositório (todo push dá 403). O fluxo que funciona:
1. Claude escreve o código e **valida com `npm run build`** no ambiente dele.
2. Claude entrega o conteúdo do arquivo (ou envia o arquivo).
3. O gestor cola/sobe pelo **GitHub web** (Create new file / Upload files).
4. A Vercel faz o deploy sozinha (~2 min).

**Armadilhas já encontradas** (evitar repetir):
- Arquivo baixado repetido ganha `(1)` no nome e sobe duplicado — apagar o
  antigo dos Downloads antes de baixar.
- Hífen some do nome do arquivo no upload (`logo-white.png` → `logowhite.png`).
- "Create new file" dentro de uma subpasta cria o caminho a partir dela.
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
