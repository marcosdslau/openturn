---
name: Fix Fuso Horário ETG
overview: Corrigir a rotina `buscaregistro.js` para aplicar o offset de fuso horário (INSFusoHorario) da instituição ao persistir REGTimestamp e REGDataHora, exatamente como já é feito no ingest via webhook do ControlID.
todos:
  - id: query-fuso
    content: Consultar INSFusoHorario via context.db antes do loop de equipamentos
    status: completed
  - id: calc-corrected
    content: Calcular correctedTimestamp = reg.time - fusoOffsetSeconds para cada registro
    status: completed
  - id: fix-idempotency
    content: Usar correctedTimestamp na verificação de idempotência (findFirst por REGTimestamp)
    status: completed
  - id: fix-create
    content: Usar correctedTimestamp em REGTimestamp e REGDataHora no create
    status: completed
isProject: false
---

# Correção de Fuso Horário — buscaregistro.js

## Raiz do problema

O equipamento ControlID armazena o campo `time` como Unix timestamp, mas **trata o horário local como se fosse UTC** (sem aplicar o offset). Então:

- Pessoa passa às **18:05 local (UTC-3)**
- O equipamento salva `time` = Unix de **18:05 UTC** (errado)
- A rotina grava `new Date(reg.time * 1000)` → Date de **18:05 UTC** → exibido como **15:05** no UTC-3

A mesma lógica de correção **já existe** para o ingest via webhook em [`webapi/src/hardware/brands/controlid/utils/controlid-notify-time.util.ts`](webapi/src/hardware/brands/controlid/utils/controlid-notify-time.util.ts):

```typescript
// originTimeSeconds - (offsetHoras * 3600)
// Para offsetHoras = -3: timestamp + 10800 (adiciona 3h)
return originTimeSeconds - BigInt(offsetHoras) * 3600n;
```

## Arquivo a editar

[`working/rotinas/ETG/buscaregistro.js`](working/rotinas/ETG/buscaregistro.js)

## Mudanças planejadas

### 1. Consultar INSFusoHorario antes do loop principal (após a linha `const tsFim = ...`)

```javascript
const inst = await context.db.INSInstituicao.findFirst({
  select: { INSFusoHorario: true },
});
const fusoHorario = inst?.INSFusoHorario ?? -3;
const fusoOffsetSeconds = fusoHorario * 3600; // ex: -3 * 3600 = -10800
```

### 2. Calcular `correctedTimestamp` por registro (dentro do loop de `registros`)

Logo após `if (reg.time > maiorTimestamp)`:

```javascript
// O device trata tempo local como UTC → subtrai o offset para obter UTC real
// Exemplo: fusoHorario=-3 → correctedTimestamp = reg.time - (-10800) = reg.time + 10800
const correctedTimestamp = reg.time - fusoOffsetSeconds;
```

### 3. Usar `correctedTimestamp` na verificação de idempotência

```javascript
// antes: REGTimestamp: reg.time
REGTimestamp: correctedTimestamp,
```

### 4. Usar `correctedTimestamp` no `create`

```javascript
// antes:
REGTimestamp: reg.time,
REGDataHora:  new Date(reg.time * 1000),

// depois:
REGTimestamp: correctedTimestamp,
REGDataHora:  new Date(correctedTimestamp * 1000),
```

> `maiorTimestamp` e `EQPDataUltimaBusca` continuam usando `reg.time` (timestamp bruto do equipamento), pois a próxima busca filtra o equipamento por intervalo de tempo usando sua escala nativa.

## Fluxo corrigido (exemplo com fusoHorario = -3)

```
Device time = Unix de 18:05 UTC (incorreto, o device tratou local como UTC)
fusoOffsetSeconds = -3 * 3600 = -10800
correctedTimestamp = device_time - (-10800) = device_time + 10800
new Date(correctedTimestamp * 1000) = 21:05 UTC = 18:05 no UTC-3 ✓
```

## Observação importante (fora do escopo desta correção)

Em **produção** (worker), `context.adapters.equipamentos` é sempre `[]` — o `for` loop nunca executa. A rotina só funciona hoje quando disparada manualmente pela webapi. Isso deve ser tratado em tarefa separada (o padrão correto é consultar `context.db.EQPEquipamento.findMany()`).
