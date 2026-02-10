# Estratégia de Tenant e Navegação - OpenTurn

O OpenTurn utiliza uma arquitetura multi-tenant com uma abordagem "Instituição-Primeiro" para navegação e segurança de dados.

## Navegação no Frontend

Todas as páginas específicas de uma instituição são prefixadas com o código da instituição.

**Padrão de URL**: `https://app.openturn.com.br/instituicao/:codigoInstituicao/*`

### Provider de Contexto de Tenant
Um Contexto React (`TenantContext`) será responsável por:
1. Extrair `:codigoInstituicao` da URL.
2. Armazenar os detalhes da instituição atual.
3. Fornecer um cliente de API escopado que injeta automaticamente o cabeçalho do tenant nas requisições.

## Injeção de ID de Tenant no Backend

O Backend (NestJS) utiliza um Middleware ou Interceptor para capturar o cabeçalho do tenant ou parâmetro de URL e propagá-lo através do ciclo de vida da requisição.

## Row-Level Security (RLS) no Banco de Dados

Utilizamos RLS do PostgreSQL para garantir isolamento de dados ao nível de hardware.

### Passos de Implementação:
1. **Coluna**: Todas as tabelas (exceto `GlobalClient`) contêm `INSInstituicaoCodigo`.
2. **Função de Tenant Atual**: Uma função PG `current_tenant()` retorna o código da instituição ativa de uma variável de sessão.
3. **Políticas**:
   ```sql
   CREATE POLICY tenant_isolation_policy ON "Table"
   USING ("INSInstituicaoCodigo" = current_setting('app.current_tenant')::integer);
   ```

### Integração com Prisma:
Como o Prisma não suporta nativamente variáveis de sessão RLS de forma global, utilizamos um Prisma Middleware ou `$extends` para executar `SET app.current_tenant = X` antes de cada query dentro de uma transação ou pool de conexão.

## Fluxo de Autorização
1. Usuário faz login.
2. O JWT contém `userId` e `availableInstitutions` (com funções/roles).
3. Super Root/Super Admin podem trocar o contexto para qualquer instituição.
4. Admin do Cliente pode alternar entre as instituições de seu cliente.
5. Gestor/Operação estão travados em sua instituição específica.

## Rotinas e Webhooks por Tenant

Todas as rotinas dinâmicas (`ROTRotina`) e seus logs de execução (`ROTExecucaoLog`) são isoladas por `INSInstituicaoCodigo` via RLS, seguindo a mesma estratégia das demais tabelas.

### Isolamento de Webhooks

A URL base dos webhooks inclui o código da instituição, garantindo que cada chamada seja roteada para o tenant correto:

```
/instituicao/:codigoInstituicao/webhook/:path
```

| Componente | Exemplo | Descrição |
|-----------|---------|-----------|
| Base fixa | `/instituicao/123/webhook/` | Identifica o tenant automaticamente |
| Path customizável | `sync-alunos` | Definido na criação da rotina |
| URL completa | `/instituicao/123/webhook/sync-alunos` | Rota final do webhook |

### Regras de Tenant para Rotinas

1. **Criação**: Rotinas só podem ser criadas por usuários com grupo `GESTOR` ou superior na instituição.
2. **Execução**: O Execution Engine injeta o `codigoInstituicao` no contexto da sandbox antes da execução.
3. **CronJobs**: O scheduler carrega apenas rotinas ativas da instituição, com RLS aplicado.
4. **Logs**: Cada execução é registrada com o `INSInstituicaoCodigo`, visível apenas para a instituição dona.
