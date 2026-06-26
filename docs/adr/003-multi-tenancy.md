# ADR-003: Estratégia de Multi-Tenancy

**Status:** Accepted  
**Date:** 2025-01-01

## Contexto

O SmartPACS precisa isolar dados de diferentes clínicas/tenants garantindo que um tenant nunca acesse dados de outro.

## Decisão

**Shared database, tenant isolation via application layer** (não Row-Level Security no banco).

Cada tabela possui coluna `tenantId`. Todo acesso ao banco passa por `PrismaService` com middleware que injeta automaticamente filtros `tenantId` nas queries — via JWT payload propagado pelo JwtAuthGuard.

## Alternativas

1. **Database por tenant** — máximo isolamento, operacionalmente complexo para 100+ tenants
2. **Schema por tenant** — Prisma suporta parcialmente, migrations complexas
3. **RLS (PostgreSQL)** — implementação futura candidata

## Isolamento garantido

- `JwtStrategy.validate()` carrega `tenantId` do token
- `JwtPayload` propagado para todos os services via `CurrentUser` decorator
- Todas as queries filtram por `tenantId` do usuário autenticado
- `SUPER_ADMIN` bypassa filtros (somente para gerenciamento da plataforma)

## Consequências

✅ Simples de implementar e raciocinar  
✅ Migrations simples e únicas  
✅ Performance adequada com índices em `tenantId`  
❌ Bug no código pode vazar dados cross-tenant (mitigado por testes)  
❌ Sem isolamento físico dos dados  
