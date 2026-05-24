# WebAPI — Aglutinação de Registros Diários

**Pacote base sugerido:** `webapi/src/registro-diario/` (config + períodos)  
**Alternativa:** `webapi/src/instituicao/` para períodos se preferir colocar junto de institution settings.

---

## 1. Prisma Schema

Arquivo: `webapi/prisma/schema.prisma`  
Replicar em `worker/prisma/schema.prisma`.

### 1.1 Enum

```prisma
enum TipoAglutinacaoRegistro {
  tempo_permanencia
  tempo_permanencia_periodo
  entrada_saida
}
```

### 1.2 INSInstituicao

Adicionar após `INSSyncRegistrosDiarios` / `INSTempoSync`:

```prisma
/// Modo de agregação de passagens em registros diários (RPD).
INSAglutinacaoRegistros TipoAglutinacaoRegistro @default(entrada_saida)

/// Sync agendado de frequências (RPD) ao ERP educacional — ver sync-freq-educacional.md
INSSyncFreqEducacional    Boolean @default(false)
INSTempoFreqEducacional   String  @default("58 23 * * *")

periodosRegistro PERPeriodosConfig[]
```

### 1.3 PERPeriodosConfig (novo)

```prisma
model PERPeriodosConfig {
  PERCodigo                   Int            @id @default(autoincrement())
  PERNome                     String
  /// Horário local da instituição, formato "HH:mm" (24h).
  PERHorarioInicio            String
  PERHorarioFim               String
  /// Minutos antes do início em que entradas entram no período.
  PERToleranciaEntradaMinutos Int            @default(0)
  /// Minutos após o fim em que saídas entram no período.
  PERToleranciaSaidaMinutos   Int            @default(0)
  INSInstituicaoCodigo        Int
  instituicao                 INSInstituicao @relation(fields: [INSInstituicaoCodigo], references: [INSCodigo], onDelete: Cascade)
  registrosDiarios            RPDRegistrosDiarios[]
  createdAt                   DateTime       @default(now())
  updatedAt                   DateTime       @updatedAt

  @@index([INSInstituicaoCodigo])
}
```

### 1.4 RPDRegistrosDiarios (alteração)

```prisma
model RPDRegistrosDiarios {
  // ... campos existentes ...
  /// Índice da janela no dia (1..N). Modo entrada_saida usa sempre 1.
  RPDJanelaIndice      Int            @default(1)
  /// Período de origem (modo tempo_permanencia_periodo).
  PERCodigo            Int?
  periodo              PERPeriodosConfig? @relation(fields: [PERCodigo], references: [PERCodigo], onDelete: SetNull)

  /// Auditoria — operações manuais (ver manutencao-registros.md)
  USRCodigoCriacao     Int?
  usuarioCriacao       USRUsuario? @relation("RpdCriacao", fields: [USRCodigoCriacao], references: [USRCodigo], onDelete: SetNull)
  USRCodigoAlteracao   Int?
  usuarioAlteracao     USRUsuario? @relation("RpdAlteracao", fields: [USRCodigoAlteracao], references: [USRCodigo], onDelete: SetNull)
  RPDAlteradoEm        DateTime?

  @@unique([INSInstituicaoCodigo, PESCodigo, RPDData, RPDJanelaIndice])
  // remover @@unique([INSInstituicaoCodigo, PESCodigo, RPDData])
}
```

### 1.5 Migration

```bash
cd webapi
npx prisma migrate dev --name aglutinacao_registros_diarios
cd ../worker
npx prisma generate
```

**SQL pós-migration (dados existentes):**

```sql
UPDATE "RPDRegistrosDiarios" SET "RPDJanelaIndice" = 1 WHERE "RPDJanelaIndice" IS NULL;
```

---

## 2. DTOs

### 2.1 Instituicao — `instituicao.dto.ts`

```typescript
import { IsEnum } from 'class-validator';
import { TipoAglutinacaoRegistro } from '@prisma/client';

// Em CreateInstituicaoDto e UpdateInstituicaoDto:
@IsOptional()
@IsEnum(TipoAglutinacaoRegistro)
INSAglutinacaoRegistros?: TipoAglutinacaoRegistro;
```

### 2.2 Períodos — `dto/periodo-registro.dto.ts` (novo)

```typescript
export class CreatePeriodoRegistroDto {
  @IsString() @IsNotEmpty() @MaxLength(80)
  PERNome: string;

  @IsString() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  PERHorarioInicio: string;

  @IsString() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  PERHorarioFim: string;

  @IsInt() @Min(0) @Max(720)
  PERToleranciaEntradaMinutos: number;

  @IsInt() @Min(0) @Max(720)
  PERToleranciaSaidaMinutos: number;
}

export class UpdatePeriodoRegistroDto extends PartialType(CreatePeriodoRegistroDto) {}
```

---

## 3. REST API

### 3.1 Instituição (existente)

**`GET /instituicoes/:id`** — incluir no select/response:

```json
{
  "INSAglutinacaoRegistros": "entrada_saida",
  "INSSyncRegistrosDiarios": true,
  "INSTempoSync": "0 9,15,22 * * *",
  "INSSyncFreqEducacional": false,
  "INSTempoFreqEducacional": "58 23 * * *"
}
```

**`PUT /instituicoes/:id`** — aceitar `INSAglutinacaoRegistros`.

**Regra:** se `INSAglutinacaoRegistros !== tempo_permanencia_periodo` e existem períodos cadastrados, **não** apagar períodos (mantém para se reativar). Opcional: validar que modo período exige ≥1 período antes de salvar sync ativo.

### 3.2 Períodos — CRUD novo

Controller: `PeriodoRegistroController`  
Base path: **`/instituicoes/:instituicaoId/periodos-registro`**

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/` | Lista períodos ordenados por `PERHorarioInicio` |
| POST | `/` | Cria período (valida overlap) |
| PUT | `/:perCodigo` | Atualiza (valida overlap excluindo self) |
| DELETE | `/:perCodigo` | Remove período |

**Permissões:** mesmo guard das settings de instituição (SUPER_ADMIN / ADMIN com acesso à instituição).

**Response item:**

```json
{
  "PERCodigo": 1,
  "PERNome": "Manhã",
  "PERHorarioInicio": "05:00",
  "PERHorarioFim": "12:00",
  "PERToleranciaEntradaMinutos": 60,
  "PERToleranciaSaidaMinutos": 60
}
```

**Erro overlap (409 ou 400):**

```json
{
  "statusCode": 400,
  "message": "Há sobreposição de horário com o período \"Tarde\" (12:00–18:00).",
  "code": "PERIODO_OVERLAP"
}
```

---

## 4. Service — validação de overlap

Arquivo sugerido: `periodo-registro.service.ts`

```typescript
type PeriodoInterval = {
  PERCodigo?: number;
  PERHorarioInicio: string;
  PERHorarioFim: string;
  PERToleranciaEntradaMinutos: number;
  PERToleranciaSaidaMinutos: number;
};

/** Converte "HH:mm" para minutos desde meia-noite [0, 1440). */
function hhmmToMinutes(hhmm: string): number { /* ... */ }

/** Range efetivo em minutos; períodos noturnos (fim < início) tratados na v2 se necessário. */
function effectiveRange(p: PeriodoInterval): { start: number; end: number } {
  const start = hhmmToMinutes(p.PERHorarioInicio) - p.PERToleranciaEntradaMinutos;
  const end = hhmmToMinutes(p.PERHorarioFim) + p.PERToleranciaSaidaMinutos;
  return { start, end };
}

function rangesOverlap(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  // Borda tocando = overlap (PO: Manhã 12:00 + Tarde 12:00 bloqueia; use Tarde 12:01)
  return a.start <= b.end && b.start <= a.end;
}
```

**Validações adicionais:**

- `PERHorarioInicio !== PERHorarioFim` (duração mínima > 0).
- `PERNome` único por instituição (opcional, `@unique([INSInstituicaoCodigo, PERNome])`).

---

## 5. Módulo NestJS

```
webapi/src/registro-diario/
  periodo-registro.controller.ts
  periodo-registro.service.ts
  dto/periodo-registro.dto.ts
```

Registrar em `registro-diario.module.ts`:

```typescript
controllers: [RegistroDiarioController, PeriodoRegistroController],
providers: [RegistroDiarioService, PeriodoRegistroService, ...],
```

---

## 6. InstituicaoService

Em `update()`:

- Persistir `INSAglutinacaoRegistros` quando presente no DTO.
- Não publicar evento Redis extra (worker lê config no próximo job).

**Opcional (fase 4):** endpoint admin de reprocessamento em massa — **fora de escopo** (PO: só passagens novas ao mudar modo).

---

## 7. GenneraAttendanceService

**Fase 6 (multi-janela):** ver snippet abaixo.  
**Fase 7 (completo):** ver **[gennera-frequencias.md](./gennera-frequencias.md)** — filtros matrícula, `ENVIADO`/`ERRO`, `RPDResponseRequest`, `lancamentoHorarioManual`, intervalo fixo.

Arquivo: `gennera-attendance.service.ts`

**Antes:** `registrosPorPes = Map<PESCodigo, single RPD>`

**Depois:**

```typescript
const registrosPorPesDia = new Map<number, RPDRegistrosDiarios[]>();
for (const reg of registrosDia) {
  const list = registrosPorPesDia.get(reg.PESCodigo) ?? [];
  list.push(reg);
  registrosPorPesDia.set(reg.PESCodigo, list);
}

for (const pessoa of pessoasAlvo) {
  const janelas = (registrosPorPesDia.get(pessoa.PESCodigo) ?? [])
    .filter(r => r.RPDDataEntrada && r.RPDDataSaida)
    .sort((a, b) => a.RPDJanelaIndice - b.RPDJanelaIndice);

  for (const reg of janelas) {
    await client.post(`/persons/${pessoa.PESIdExterno}/attendances/interval`, payload);
  }
}
```

**Gennera / ERP:** pular janelas onde `RPDDataEntrada == null` **ou** `RPDDataSaida == null` (janelas incompletas ou SAIDA órfã).

---

## 9. Manutenção, sync e permissões

Detalhamento completo: **[manutencao-registros.md](./manutencao-registros.md)**

### 9.1 Permissões — sem alteração para GESTOR

```typescript
// GESTOR — inalterado
[GrupoAcesso.GESTOR]: {
  registroDiario: A(['read', 'execute']),
},

// ADMIN — já possui create/update/delete/execute
[GrupoAcesso.ADMIN]: {
  registroDiario: A(['read', 'create', 'update', 'delete', 'execute']),
},
```

| Endpoint | Gestor | Admin+ |
|----------|--------|--------|
| POST `/sync`, `/reprocessar-periodo` | ✓ execute | ✓ |
| GET `/manutencao`, POST criar-manual, PATCH, DELETE | ✗ | ✓ |

Espelhar guards em `webapp/src/lib/permissions.ts` + helpers `canExecuteRegistroDiario` / `canWriteRegistroDiario`.

### 9.2 Endpoints adicionais — `RegistroDiarioController`

| Método | Rota | Permissão |
|--------|------|-----------|
| POST | `/sync` | execute |
| POST | `/reprocessar-periodo` | execute |
| GET | `/manutencao` | read |
| POST | `/manutencao/preview-criacao` | create |
| POST | `/manutencao/criar-manual` | create |
| POST | `/manutencao/excluir` | delete |
| PATCH | `/manutencao/alterar` | update |
| PATCH | `/:rpdCodigo` | update |
| DELETE | `/:rpdCodigo` | delete |

**`POST /sync`:** injeta `RotinaQueueService`, retorna `{ jobId }`.

**`POST /reprocessar-periodo`:** delete RPDs no intervalo → reset `REGProcessado` → publish sync job.

**`GET /registro-diario` (existente):** incluir no `include`:

```typescript
usuarioCriacao: { select: { USRCodigo: true, USRNome: true } },
usuarioAlteracao: { select: { USRCodigo: true, USRNome: true } },
```

### 9.3 DTOs manutenção — `dto/registro-diario-manutencao.dto.ts`

Ver §9 de `manutencao-registros.md`.

### 9.4 Service — `registro-diario-manutencao.service.ts`

Responsabilidades:

- `triggerSync(instituicaoCodigo)`
- `reprocessarPeriodo(instituicaoCodigo, dto)`
- `findManutencao(instituicaoCodigo, query)` — filtros datetime + multi pessoa + curso/série/turma + entradas/saídas vazias
- `previewCriacaoManual(...)`
- `criarManual(...)` — por (pessoa, dia): delete all RPDs + insert N janelas (`janelasDesejadas[]`) + marcar passagens
- `excluirBulk(rpdCodigos)`
- `alterarBulk(dto)` — set alteração + `RPDStatus = MANUAL`
- `updateOne(rpdCodigo, dto, userId)`
- `deleteOne(rpdCodigo)`

---

## 10. Testes unitários (webapi)

| Caso | Esperado |
|------|----------|
| Criar Manhã 08:00–12:20 + Tarde 12:00–18:00 | 400 PERIODO_OVERLAP |
| Criar Manhã 08:00–12:00 + Tarde 12:00–18:00 | 400 PERIODO_OVERLAP (borda) |
| Criar Manhã 08:00–12:00 + Tarde 12:01–18:00 | OK |
| Update período sem alterar horários | OK |
| DELETE período referenciado em RPD | PERCodigo SET NULL (onDelete) |
| POST criar-manual | USRCodigoCriacao preenchido; passagens marcadas processadas |
| POST reprocessar-periodo | RPDs removidos; REGProcessado resetado |
| GESTOR POST sync / reprocessar | 200 |
| GESTOR POST criar-manual | 403 |
| ADMIN POST criar-manual 3 janelas | 3 RPDs/pessoa/dia |

---

## 11. Checklist de arquivos

- [ ] `webapi/prisma/schema.prisma`
- [ ] `webapi/prisma/migrations/...`
- [ ] `worker/prisma/schema.prisma`
- [ ] `webapi/src/instituicao/dto/instituicao.dto.ts`
- [ ] `webapi/src/instituicao/instituicao.service.ts`
- [ ] `webapi/src/registro-diario/periodo-registro.*`
- [ ] `webapi/src/registro-diario/registro-diario-manutencao.service.ts`
- [ ] `webapi/src/registro-diario/dto/registro-diario-manutencao.dto.ts`
- [ ] `webapi/src/registro-diario/registro-diario.controller.ts`
- [ ] `webapi/src/registro-diario/registro-diario.module.ts`
- [ ] `webapi/src/auth/permission-matrix.ts`
- [ ] `webapi/src/registro-diario/gennera-attendance.service.ts` (fase 6)

---

## 12. Sync frequências ERP (Fase 8)

Documento completo: **[sync-freq-educacional.md](./sync-freq-educacional.md)**

### 12.1 Novos arquivos

| Arquivo | Descrição |
|---------|-----------|
| `freq-educacional-sync.scheduler.ts` | Cron por instituição (`INSSyncFreqEducacional`) |
| `rotina/queue/rotina-job.dto.ts` | `InternalJobKind` + `internalKind` |
| `rotina/queue/rotina-queue.service.ts` | `publishInternalJob`, `publishFreqEducacionalSyncJob` |

### 12.2 DTO — campos adicionais

```typescript
INSSyncFreqEducacional?: boolean;
INSTempoFreqEducacional?: string; // CRON_5_OR_6_FIELDS, default "58 23 * * *"
```

### 12.3 `instituicao.service.ts`

Publicar `channelSyncSchedulerRefresh()` quando qualquer campo de sync (RPD ou freq ERP) for alterado.
