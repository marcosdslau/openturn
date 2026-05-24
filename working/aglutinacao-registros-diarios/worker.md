# Worker — Aglutinação de Registros Diários

**Arquivos principais:**

- `worker/src/rotina-consumer.ts` — `processRegistroDiarioAggregation`
- `worker/src/registro-diario-aggregation.helpers.ts` — algoritmos puros
- `worker/src/registro-diario-aggregation.selftest.ts` — testes

---

## 1. Refatoração de `processRegistroDiarioAggregation`

### 1.1 Fluxo geral

```typescript
private async processRegistroDiarioAggregation(instituicaoCodigo: number) {
  const inst = await this.prisma.iNSInstituicao.findUnique({
    where: { INSCodigo: instituicaoCodigo },
    select: {
      INSAglutinacaoRegistros: true,
      INSFusoHorario: true,
    },
  });
  const modo = inst?.INSAglutinacaoRegistros ?? 'entrada_saida';

  const pendentes = await this.prisma.rEGRegistroPassagem.findMany({
    where: { INSInstituicaoCodigo: instituicaoCodigo, REGProcessado: false },
    select: { REGCodigo: true, PESCodigo: true, REGDataHora: true, REGAcao: true },
    orderBy: { REGDataHora: 'asc' },
  });
  if (pendentes.length === 0) return;

  const dayKeys = extractAffectedDayKeys(pendentes);
  const allPassagens = await loadPassagensForDayKeys(instituicaoCodigo, dayKeys);

  let periodos: PeriodoConfig[] = [];
  if (modo === 'tempo_permanencia_periodo') {
    periodos = await this.prisma.pERPeriodosConfig.findMany({
      where: { INSInstituicaoCodigo: instituicaoCodigo },
      orderBy: { PERHorarioInicio: 'asc' },
    });
    if (periodos.length === 0) {
      console.warn(workerLogLine(`[INTERNAL] inst=${instituicaoCodigo} modo periodo sem PER cadastrados — skip`));
      return;
    }
  }

  let janelas: JanelaAgregada[];
  switch (modo) {
    case 'tempo_permanencia':
      janelas = aggregateTempoPermanencia(allPassagens);
      break;
    case 'tempo_permanencia_periodo':
      janelas = aggregateTempoPermanenciaPeriodo(allPassagens, periodos, inst!.INSFusoHorario);
      break;
    case 'entrada_saida':
    default:
      janelas = aggregateEntradaSaida(allPassagens);
      break;
  }

  await this.persistJanelas(instituicaoCodigo, janelas);
}
```

### 1.2 Tipos — `registro-diario-aggregation.helpers.ts`

```typescript
export type JanelaAgregada = {
  PESCodigo: number;
  dataLocal: Date;           // meio-dia UTC do dia civil (padrão existente)
  RPDJanelaIndice: number;
  RPDDataEntrada: Date | null;
  RPDDataSaida: Date | null;
  PERCodigo?: number | null;
  codigosPassagem: number[]; // REGCodigo incluídos nesta janela
};

export type PeriodoConfig = {
  PERCodigo: number;
  PERHorarioInicio: string;
  PERHorarioFim: string;
  PERToleranciaEntradaMinutos: number;
  PERToleranciaSaidaMinutos: number;
};
```

---

## 2. Algoritmo `aggregateEntradaSaida`

Equivalente ao `buildPassagemDayGroups` atual, mas retorna `JanelaAgregada[]` com `RPDJanelaIndice = 1`.

```typescript
export function aggregateEntradaSaida(passagens: PassagemParaAgregacao[]): JanelaAgregada[] {
  const groups = buildPassagemDayGroups(passagens);
  return [...groups.values()].map((g) => ({
    PESCodigo: g.PESCodigo,
    dataLocal: g.dataLocal,
    RPDJanelaIndice: 1,
    RPDDataEntrada: g.minEntrada,
    RPDDataSaida: g.maxSaida,
    PERCodigo: null,
    codigosPassagem: g.codigos,
  }));
}
```

---

## 3. Algoritmo `aggregateTempoPermanencia`

```typescript
type WindowState = {
  entrada: Date | null;
  saida: Date | null;
  codigos: number[];
};

export function aggregateTempoPermanencia(passagens: PassagemParaAgregacao[]): JanelaAgregada[] {
  const byPersonDay = groupPassagensByPersonDay(passagens);
  const result: JanelaAgregada[] = [];

  for (const [key, rows] of byPersonDay) {
    const sorted = [...rows].sort((a, b) => a.REGDataHora.getTime() - b.REGDataHora.getTime());
    let current: WindowState | null = null;
    const windows: WindowState[] = [];

    for (const p of sorted) {
      if (p.REGAcao === AcaoPassagem.ENTRADA) {
        if (current && current.saida != null) {
          windows.push(current);
          current = { entrada: p.REGDataHora, saida: null, codigos: [p.REGCodigo] };
        } else if (!current) {
          current = { entrada: p.REGDataHora, saida: null, codigos: [p.REGCodigo] };
        } else {
          // P1-A: primeira ENTRADA cronológica mantém início
          current.codigos.push(p.REGCodigo);
        }
      } else {
        if (current) {
          current.codigos.push(p.REGCodigo);
          if (!current.saida || p.REGDataHora > current.saida) {
            current.saida = p.REGDataHora;
          }
        } else {
          // P3-B: SAIDA órfã
          windows.push({ entrada: null, saida: p.REGDataHora, codigos: [p.REGCodigo] });
        }
      }
    }
    if (current) windows.push(current);

    const { PESCodigo, dataLocal } = parsePersonDayKey(key);
    windows.forEach((w, idx) => {
      result.push({
        PESCodigo,
        dataLocal,
        RPDJanelaIndice: idx + 1,
        RPDDataEntrada: w.entrada,
        RPDDataSaida: w.saida,
        PERCodigo: null,
        codigosPassagem: w.codigos,
      });
    });
  }
  return result;
}
```

**Selftests (ver edge-cases-ordenacao.md):**

- `17:03 E, 17:30 E, 20:36 S` → uma janela `17:03 ~ 20:36`
- `08:00 S, 10:00 E, 18:00 S` → `null ~ 08:00` + `10:00 ~ 18:00`

---

## 4. Algoritmo `aggregateTempoPermanenciaPeriodo`

### 4.1 Conversão de horário

Passagens estão em UTC no banco. Para comparar com períodos em horário local:

```typescript
function toLocalMinutes(regDataHora: Date, fusoHorario: number): number {
  // fusoHorario = offset UTC em horas (ex: -3)
  const localMs = regDataHora.getTime() + fusoHorario * 3600_000;
  const d = new Date(localMs);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}
```

> Confirmar com PO se `INSFusoHorario` é o offset correto (já usado em ControlID).

> Horários de período interpretados com `INSFusoHorario` (confirmado PO).

### 4.2 Captura por período e janela extra

```typescript
export function aggregateTempoPermanenciaPeriodo(
  passagens: PassagemParaAgregacao[],
  periodos: PeriodoConfig[],
  fusoHorario: number,
): JanelaAgregada[] {
  const byPersonDay = groupPassagensByPersonDay(passagens);
  const result: JanelaAgregada[] = [];

  for (const [key, rows] of byPersonDay) {
    const { PESCodigo, dataLocal } = parsePersonDayKey(key);
    const capturedCodigos = new Set<number>();
    let janelaIdx = 1;

    for (const periodo of periodos) {
      const { start, end } = periodEffectiveRange(periodo);
      const inPeriod = rows.filter((p) => {
        const mins = toLocalMinutes(p.REGDataHora, fusoHorario);
        return mins >= start && mins <= end;
      });
      if (inPeriod.length === 0) continue;

      inPeriod.forEach((p) => capturedCodigos.add(p.REGCodigo));
      result.push(buildMinMaxJanela(inPeriod, {
        PESCodigo,
        dataLocal,
        RPDJanelaIndice: janelaIdx++,
        PERCodigo: periodo.PERCodigo,
      }));
    }

    // Janela extra — passagens do dia não capturadas por nenhum período (PO)
    const orphan = rows.filter((p) => !capturedCodigos.has(p.REGCodigo));
    if (orphan.length > 0) {
      result.push(buildMinMaxJanela(orphan, {
        PESCodigo,
        dataLocal,
        RPDJanelaIndice: janelaIdx++,
        PERCodigo: null,
      }));
    }
  }
  return result;
}

function buildMinMaxJanela(
  passagens: PassagemParaAgregacao[],
  meta: Pick<JanelaAgregada, 'PESCodigo' | 'dataLocal' | 'RPDJanelaIndice' | 'PERCodigo'>,
): JanelaAgregada {
  let minEntrada: Date | null = null;
  let maxSaida: Date | null = null;
  const codigos: number[] = [];
  for (const p of passagens) {
    codigos.push(p.REGCodigo);
    if (p.REGAcao === AcaoPassagem.ENTRADA) {
      if (!minEntrada || p.REGDataHora < minEntrada) minEntrada = p.REGDataHora;
    } else {
      if (!maxSaida || p.REGDataHora > maxSaida) maxSaida = p.REGDataHora;
    }
  }
  return { ...meta, RPDDataEntrada: minEntrada, RPDDataSaida: maxSaida, codigosPassagem: codigos };
}
```

---

## 5. Persistência `persistJanelas`

```typescript
private async persistJanelas(instituicaoCodigo: number, janelas: JanelaAgregada[]) {
  const byDayPerson = groupJanelasByPersonDay(janelas);

  for (const [key, dayJanelas] of byDayPerson) {
    const { PESCodigo, dataLocal } = parsePersonDayKey(key);

    await this.prisma.$transaction(async (tx) => {
      await tx.rPDRegistrosDiarios.deleteMany({
        where: {
          INSInstituicaoCodigo: instituicaoCodigo,
          PESCodigo,
          RPDData: dataLocal,
        },
      });

      for (const j of dayJanelas.sort((a, b) => a.RPDJanelaIndice - b.RPDJanelaIndice)) {
        await tx.rPDRegistrosDiarios.create({
          data: {
            INSInstituicaoCodigo: instituicaoCodigo,
            PESCodigo: j.PESCodigo,
            RPDData: j.dataLocal,
            RPDJanelaIndice: j.RPDJanelaIndice,
            RPDDataEntrada: j.RPDDataEntrada,
            RPDDataSaida: j.RPDDataSaida,
            PERCodigo: j.PERCodigo ?? null,
          },
        });
      }

      const allCodigos = [...new Set(dayJanelas.flatMap((j) => j.codigosPassagem))];
      await tx.rEGRegistroPassagem.updateMany({
        where: { REGCodigo: { in: allCodigos } },
        data: { REGProcessado: true },
      });
    });
  }
}
```

**Nota:** deleteMany por (inst, pessoa, dia) garante consistência ao mudar número de janelas.

---

## 6. Selftests — casos obrigatórios

Adicionar em `registro-diario-aggregation.selftest.ts`:

### 6.1 Selftests — casos obrigatórios

| Caso | Assert |
|------|--------|
| 17:03 E, 17:30 E, 20:36 S | janela única 17:03–20:36 |
| 08:00 S, 10:00 E, 18:00 S | null–08:00 + 10:00–18:00 |
| Exemplo completo PO (14 passagens) | 5 janelas (última 17:03–20:36) |
| Orphan fora de período | 1 janela extra min/max |
| Regressão `buildPassagemDayGroups` | testes existentes passam |

Executar:

```bash
cd worker
npx ts-node src/registro-diario-aggregation.selftest.ts
```

---

## 7. Helpers compartilhados

```typescript
function groupPassagensByPersonDay(passagens: PassagemParaAgregacao[]): Map<string, PassagemParaAgregacao[]> {
  const m = new Map<string, PassagemParaAgregacao[]>();
  for (const p of passagens) {
    const key = personDayKey(p.PESCodigo, p.REGDataHora);
    const arr = m.get(key) ?? [];
    arr.push(p);
    m.set(key, arr);
  }
  return m;
}

function personDayKey(pesCodigo: number, regDataHora: Date): string {
  const y = regDataHora.getUTCFullYear();
  const mo = regDataHora.getUTCMonth();
  const day = regDataHora.getUTCDate();
  return `${pesCodigo}|${y}-${String(mo + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parsePersonDayKey(key: string): { PESCodigo: number; dataLocal: Date } {
  const [pes, dateStr] = key.split('|');
  const [y, mo, d] = dateStr.split('-').map(Number);
  return {
    PESCodigo: Number(pes),
    dataLocal: new Date(Date.UTC(y, mo - 1, d, 12, 0, 0, 0)),
  };
}
```

---

## 8. Sync frequências ERP (Fase 8)

Documento completo: **[sync-freq-educacional.md](./sync-freq-educacional.md)**

### 8.1 Roteamento `internalKind`

Jobs `trigger: 'INTERNAL'` passam a usar `data.internalKind ?? 'RPD_AGGREGATION'`.

| `internalKind` | Handler |
|----------------|---------|
| `RPD_AGGREGATION` | `processRegistroDiarioAggregation` (existente) |
| `FREQ_ERP_SYNC` | `ErpFrequencySyncOrchestrator.run` |

### 8.2 Módulo `erp-frequency/`

| Classe | Papel |
|--------|-------|
| `ErpFrequencyFactory` | Resolve provider por `ERPSistema` |
| `GenneraFrequencyService` | Envio interval + tolerâncias (espelho webapi) |
| `NoopFrequencyProvider` | Pass para ERPs não implementados |
| `ErpFrequencySyncOrchestrator` | Entry point do job FREQ_ERP_SYNC |

### 8.3 Checklist Fase 8

- [ ] `worker/src/rotina-job.dto.ts`
- [ ] `worker/src/rotina-consumer.ts` — switch internalKind
- [ ] `worker/src/erp-frequency/**`
- [ ] `worker/prisma/schema.prisma` — `INSSyncFreqEducacional`, `INSTempoFreqEducacional`

---

## 9. Checklist (aglutinação)

- [ ] `worker/prisma/schema.prisma` — sync com webapi
- [ ] `worker/src/registro-diario-aggregation.helpers.ts` — 3 aggregators + helpers
- [ ] `worker/src/rotina-consumer.ts` — switch + persist
- [ ] `worker/src/registro-diario-aggregation.selftest.ts` — novos casos
- [ ] Log estruturado: `modo`, `janelas`, `days_rebuilt`
