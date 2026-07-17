# Controle de Frota

Sistema de gestão de frota para equipe de campo. Substitui a planilha
`CONTROLE_DE_FROTA.xlsx` alimentada por Google Forms.

Escala real: 9 veículos (8 ativos), ~6 roteiros por dia, ~8 técnicos.

## O que já existe aqui

```
CLAUDE.md                      contexto e regras do projeto (o Claude Code lê isto)
docs/guia-claude-code-frota.md o passo a passo, com os prompts de cada fase
painel-frota.jsx               painel pronto, com dados ainda embutidos
supabase/migrations/           schema e views, revisar antes de aplicar
dados-origem/                  a planilha atual, para a migração
.env.local.example             copie para .env.local e preencha
```

Ainda não existe: app Next.js, auth, PWA. É o que as fases 1 a 5 constroem.

## Começar

1. Crie o projeto no Supabase, o repositório no GitHub e a conta na Vercel.
2. `cp .env.local.example .env.local` e preencha com as chaves do Supabase.
3. Abra o Claude Code nesta pasta e diga:

   > Leia o CLAUDE.md e o docs/guia-claude-code-frota.md. Estamos começando a
   > Fase 1. Leia a planilha em dados-origem/ e me mostre o plano antes de
   > escrever qualquer código.

4. Siga uma fase por sessão. Marque no CLAUDE.md ao fechar cada uma.

## Onde está o valor

A Fase 4 (PWA do técnico) é a que paga o projeto. Hoje ~14% dos roteiros chegam
quebrados — saída sem chegada, chegada sem saída, hodômetro impossível — porque
o formulário não sabe quem é o técnico nem qual o estado do veículo. O app sabe.
