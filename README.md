# SchoolGuard

Monorepo OpenTurn / SchoolGuard — ERP educacional + controle de acesso físico.

## Deploy em produção

Assumindo que o banco PostgreSQL **já existe** e o `.env` de cada serviço está configurado.

### Tabela rápida

| Projeto | Migrations | Seed | Generate | Build | Start |
|---|---|---|---|---|---|
| **webapi** | `npx prisma migrate deploy` | `npm run db:seed` *(setup inicial)* | `npx prisma generate` | `npm run build` | `npm run start:prod` |
| **worker** | *(não — usa schema da webapi)* | *(não)* | via `npm run prisma:sync` **ou** dentro do `npm run build` | `npm run build` | `npm run start` |
| **remote-ui-gateway** | *(não)* | *(não)* | `npx prisma generate` *(manual)* | `npm run build` | `npm run start` |
| **webapp** | *(não)* | *(não)* | *(não)* | `npm run build` | `npm run start` |

### Ordem recomendada

```
1. webapi              → migrate deploy → seed (setup inicial) → generate → build → restart
2. worker              → prisma:sync (se schema mudou) → build → restart
3. remote-ui-gateway   → generate → build → restart (se schema mudou)
4. webapp              → build → restart
```

---

### webapi *(fonte da verdade do banco)*

```bash
cd webapi
npx prisma migrate deploy   # aplica migrations pendentes
npm run db:seed             # cria bases iniciais (cliente, instituições, SUPER_ROOT, IA)
npx prisma generate         # gera @prisma/client
npm run build
npm run start:prod
```

**Seed em produção:** as bases iniciais do sistema (cliente, instituições, usuário SUPER_ROOT, provedor/modelos de IA) são criadas pelo seed. O script é **idempotente** — registros já existentes são ignorados. Rode após `migrate deploy` no **primeiro deploy** ou quando precisar repor dados base. Após o seed, defina a senha do SUPER_ROOT via **Esqueci minha senha** na webapp.

**Nunca em produção:** `prisma migrate dev`, `prisma db push`.

---

### worker

```bash
cd worker
npm run prisma:sync   # copia schema da webapi + generate (se o schema mudou)
npm run build         # já roda prisma generate && tsc
npm run start
```

- Migrations **não** rodam aqui — apenas na webapi.
- Se o schema não mudou, `npm run build` sozinho costuma bastar (`postinstall` também roda `prisma generate`).

---

### remote-ui-gateway

```bash
cd projects/remote-ui-gateway
npx prisma generate   # obrigatório antes do build (não está no npm run build)
npm run build         # tsup — só compila TypeScript
npm run start
```

- **Sem migrations** — o banco é gerenciado pela webapi.
- Possui `prisma/schema.prisma` próprio (cópia parcial) e usa `PrismaClient` para validar sessões remotas.
- **Não possui** script `prisma:sync` como o worker — se o schema da webapi mudar (ex.: `RMTSessaoRemota`), atualize manualmente o `schema.prisma` local antes do `generate`.
- O `build` (`tsup`) **não** inclui `prisma generate`.

---

### webapp *(frontend)*

```bash
cd webapp
npm run build
npm run start
```

- Sem Prisma, sem migrations.

---

## Regras gerais

- Apenas a **webapi** aplica migrations (`migrate deploy`) e executa o seed (`db:seed`).
- **Worker** e **remote-ui-gateway** só precisam de `prisma generate` com schema alinhado à webapi.
- Em produção, use **somente** `migrate deploy` para schema — nunca `migrate dev` ou `db push`.
- O **seed** cria os dados base iniciais; pode ser reexecutado com segurança (idempotente).
