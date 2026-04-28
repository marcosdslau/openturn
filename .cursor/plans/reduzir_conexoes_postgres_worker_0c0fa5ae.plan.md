---
name: Reduzir conexoes Postgres worker
overview: Combinar PgBouncer (transaction mode) na frente do Postgres com cache em memoria das checagens repetidas no consumer e backoff configuravel para requeues, eliminando hot-loops de queries e desacoplando o numero de conexoes fisicas do numero de processos worker.
todos:
  - id: cache-instituicao
    content: Adicionar cache em memoria de INSAtivo/INSWorkerAtivo no consumer; popular em reconcileInstitutions e handleRefreshMessage; usar em isInstitutionWorkerConsuming
    status: pending
  - id: cache-rotina
    content: Adicionar cache em memoria de ROTPermiteParalelismo (Map por inst:rotina) e canal Redis rotina:refresh para invalidacao quando webapi atualizar a rotina
    status: pending
  - id: backoff-defer
    content: Implementar ROTINA_CAPACITY_DEFER_MS via republish na retry exchange com header x-capacity-deferred (sem incrementar retry count) em vez de republicar imediato em republishToTenantMainQueue
    status: pending
  - id: pgbouncer-compose
    content: Adicionar servico pgbouncer (edoburu/pgbouncer, transaction mode, default_pool_size 20) ao docker-compose.yml
    status: pending
  - id: pgbouncer-urls
    content: Atualizar DATABASE_URL da api e worker para apontar para pgbouncer:6432 com ?pgbouncer=true&connection_limit=15; adicionar DIRECT_URL para migrations
    status: pending
  - id: schema-direct-url
    content: Adicionar directUrl no datasource do schema.prisma para migrate/introspect bypassarem o PgBouncer
    status: pending
  - id: validar-transactions
    content: Auditar usos de $transaction na webapi para confirmar compatibilidade com PgBouncer transaction mode (nenhum $transaction interativo de longa duracao)
    status: pending
isProject: false
---

## Diagnostico (resumido)

A "explosao de conexoes" em loops de requeue tem **duas origens**, nao o numero de PrismaClients:

1. **Queries redundantes por mensagem.** Em [worker/src/rotina-consumer.ts](worker/src/rotina-consumer.ts) cada `onMessage` faz 2-4 queries Prisma **antes** de decidir se vai executar — e em loops de requeue isso multiplica:
   - `prisma.iNSInstituicao.findUnique` em `isInstitutionWorkerConsuming` (linha 599)
   - `prisma.rOTExecucaoLog.findFirst` (linha 449) — pra checar `CANCELADO`
   - `prisma.iNSInstituicao.findUnique` em `loadTenantLimit` (linha 607, fallback)
   - `prisma.rOTRotina.findFirst` em `ROTPermiteParalelismo` (linha 478)
2. **N processos worker × `connection_limit=8`** = N×8 conexoes fisicas no Postgres. Sem pooler externo, escala linear com workers.

A sugestao "abrir e fechar PrismaClient por job" **nao se aplica**: o child process nao tem Prisma (usa RPC/IPC pro pai em [process-manager.ts](worker/src/engine/process-manager.ts)), e `new PrismaClient()` por job custaria 100-300ms de inicializacao do query engine + handshake — pioraria o quadro.

## Estrategia em 3 camadas

### 1. Cache em memoria no consumer (alto impacto, baixo custo)

Eliminar as queries repetidas por mensagem. Ja existe a infraestrutura: o canal Redis `instituicao:refresh` notifica mudancas e o `tenantLimits` Map ja cacheia o limite. Falta cachear:

- **`INSAtivo` + `INSWorkerAtivo`** por `instituicaoCodigo` — usar no `isInstitutionWorkerConsuming` em vez de query.
- **`ROTPermiteParalelismo`** por `(instituicaoCodigo, rotinaCodigo)` — usar antes de chamar `tryAcquireRotinaSerialSlot`.

Ambos invalidados por `handleRefreshMessage` (instituicao) e por um novo canal `rotina:refresh` (rotina) — disparado pela webapi quando uma rotina e atualizada.

Em [worker/src/rotina-consumer.ts](worker/src/rotina-consumer.ts):

```typescript
private readonly tenantStatus = new Map<number, { ativo: boolean; workerAtivo: boolean }>();
private readonly rotinaSerialCache = new Map<string, boolean>(); // key: `${inst}:${rotina}`

private isInstitutionWorkerConsumingCached(instCodigo: number): boolean | undefined {
    const s = this.tenantStatus.get(instCodigo);
    return s ? s.ativo && s.workerAtivo : undefined; // undefined = miss, busca do db 1x
}
```

`reconcileInstitutions` ja faz `findMany` que retorna esses campos — basta popular o cache la (linhas 351-377). `handleRefreshMessage` (linha 326) tambem ja recebe esses campos no payload.

### 2. Backoff anti hot-loop (impacto medio, custo trivial)

Aplicar o `ROTINA_CAPACITY_DEFER_MS` que ja esta no [worker/.env](worker/.env) mas nunca e lido. Hoje, quando nao ha vaga, `republishToTenantMainQueue` ([rotina-consumer.ts](worker/src/rotina-consumer.ts) linha 707) republica imediatamente sem delay, gerando ciclo apertado de queries.

Opcoes (escolher 1):
- **Mais simples**: `await sleep(deferMs)` antes do `ch.publish` no republish, somente quando o cache em memoria detectar que **ainda nao ha vaga** (consultar `redis.zcard` localmente apos a falha do `tryAcquireTenantSlot`).
- **Mais correto**: republicar via `getJobsRetryExchange` com `expiration: deferMs` (igual `republishWithDelay` ja faz para serial backoff em linha 726), mas com header proprio `x-capacity-deferred: true` que `onRetryQueueMessage` reconhece para nao incrementar `RETRY_HEADER`.

A segunda opcao e melhor: nao bloqueia o canal e o RabbitMQ entrega depois de `deferMs`, sem queries no meio.

### 3. PgBouncer em transaction mode (alto impacto, requer infra)

Adicionar PgBouncer ao [docker-compose.yml](docker-compose.yml) como pooler entre webapi/worker e Postgres. Permite ter `connection_limit=15-20` por servico (Prisma) com so ~10-20 conexoes fisicas reais no Postgres total.

Acrescimo no `docker-compose.yml`:

```yaml
  pgbouncer:
    image: edoburu/pgbouncer:latest
    container_name: openturn-pgbouncer
    restart: always
    environment:
      DB_USER: openturn_user
      DB_PASSWORD: openturn_password
      DB_HOST: db
      DB_NAME: openturn_db
      POOL_MODE: transaction
      MAX_CLIENT_CONN: 200
      DEFAULT_POOL_SIZE: 20
      RESERVE_POOL_SIZE: 5
      AUTH_TYPE: scram-sha-256
    ports:
      - "6432:6432"
    depends_on:
      db:
        condition: service_healthy
```

E ajustar a `DATABASE_URL` da `api` e `worker` para apontar para `pgbouncer:6432` com **`?pgbouncer=true`** (desabilita prepared statements no Prisma — necessario em transaction mode):

```
DATABASE_URL: postgresql://openturn_user:openturn_password@pgbouncer:6432/openturn_db?schema=public&pgbouncer=true&connection_limit=15
```

**Importante:** `?pgbouncer=true` so funciona porque o codigo nao usa `$transaction` interativo nem queries raw com prepared statements no `worker`. Verifiquei via grep e nao ha uso. Na `webapi` ha `$transaction` em alguns services — em transaction mode do PgBouncer eles continuam funcionando porque o Prisma serializa as queries em uma unica connection emprestada do pool, mas precisa garantir que sao `$transaction(callback)` e nao `$transaction([promises])` longos.

Para **migrations** (`prisma migrate`), continuar usando a URL **direta** do Postgres (nao pode passar por PgBouncer em transaction mode). Adicionar variavel separada `DIRECT_URL` no schema:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL") // para migrate/introspect
}
```

## Ordem de implementacao recomendada

1. **Cache em memoria** + **backoff configuravel** primeiro (so codigo, rollback trivial, ganho imediato em loops de requeue mesmo sem PgBouncer).
2. **PgBouncer** depois (mudanca de infra, valida em DEV, ajusta `connection_limit` e observa metricas).

## Resultado esperado

- **Sem PgBouncer (so cache+backoff)**: queries por mensagem caem de 2-4 para 0-1 em loops de requeue; hot-loop substituido por delay configuravel. Provavelmente resolve o caso de "1-2 workers".
- **Com PgBouncer**: conexoes fisicas no Postgres deixam de escalar com numero de workers. 5 workers × 8 = 40 conexoes ativas viram ~20 conexoes fisicas multiplexadas.
