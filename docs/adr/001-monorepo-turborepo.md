# ADR-001: Monorepo com Turborepo

**Status:** Accepted  
**Date:** 2025-01-01

## Contexto

O SmartPACS é composto de 3 aplicações distintas (api, web, edge-agent) e múltiplos pacotes compartilhados (types, eslint-config). Precisávamos de uma estratégia de organização de código que facilitasse o compartilhamento de tipos e configurações.

## Decisão

Usar Turborepo como orquestrador de monorepo com npm workspaces.

## Alternativas consideradas

1. **Nx** — mais poderoso, mas maior overhead de configuração
2. **Lerna** — legado, menor performance
3. **Repositórios separados** — dificulta compartilhamento de tipos

## Consequências

✅ Cache inteligente de builds (local e remoto)  
✅ `@smartpacs/types` compartilhado entre todos os projetos  
✅ Lint e type-check executam em paralelo  
✅ `npm run dev` inicia todos os serviços simultaneamente  
❌ Repositório maior, pull/clone mais lento  
