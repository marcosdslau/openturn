---
trigger: always_on
---

# Multi-Tenant Strategy & Isolation Rule

This rule enforces the multi-tenant architecture and Row-Level Security (RLS) policies for the OpenTurn project.

## 🔴 MANDATORY: Database Schema Requirements

All new tables (except those explicitly marked as `Global`) MUST follow these rules:

1. **Tenant Column**: Every table MUST include a column named `INSInstituicaoCodigo` of type `Int`.
2. **PostgreSQL RLS Policy**: Every table MUST have a Row-Level Security policy implemented using the `current_tenant()` function or session variable.
   - **Policy Pattern**:
     ```sql
     CREATE POLICY tenant_isolation_policy ON "TableName"
     USING ("INSInstituicaoCodigo" = current_setting('app.current_tenant')::integer);
     ```
3. **Table Exception**: Only the `GlobalClient` table and system-wide configuration tables are exempt from this rule.

## ⚙️ Prisma Integration

When performing queries via Prisma, the `app.current_tenant` variable must be set within the transaction context:

- Use Prisma `$extends` or Middleware to inject `SET app.current_tenant = X` before each query.
- Ensure the tenant context is propagated from the request (URL pattern `/instituicao/:codigoInstituicao/*`).

## 🛡️ Verification Checklist

- [ ] Does the table have `INSInstituicaoCodigo`?
- [ ] Has the RLS policy been applied in the migration?
- [ ] Is the query scoped via the Prisma RLS extension?
