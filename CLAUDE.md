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
