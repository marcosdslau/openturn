# Edge cases — Ordenação cronológica de passagens

**Status:** fechado (PO 2026-05-22)  
**Contexto:** o worker sempre processa passagens **ordenadas por `REGDataHora` ascendente**.

---

## Decisões finais (P1–P4)

| ID | Pergunta | Resposta |
|----|----------|----------|
| P1 | Entrada dupla na mesma janela (sem SAIDA entre elas) | **A** — início = primeira ENTRADA cronológica |
| P2 | `17:03 E` no exemplo original | **C** — existe; janela 5 = **`17:03 ~ 20:36`** |
| P3 | SAIDA órfã (sem ENTRADA aberta) | **B** — janela com `RPDDataEntrada = null`, `RPDDataSaida = horário` |
| P4 | Janela extra (passagens fora de períodos) | **A** — uma janela orphan: min(ENTRADA) / max(SAIDA) |

---

## 1. Entrada dupla — regra P1-A

Dentro de uma janela aberta (ainda sem SAIDA), entradas adicionais **não alteram** `RPDDataEntrada`.

| Passagens (cronológicas) | RPDDataEntrada | RPDDataSaida |
|--------------------------|----------------|--------------|
| 17:03 E, 17:30 E, 20:36 S | **17:03** | 20:36 |
| 09:00 E, 09:01 E, 12:35 S | **09:00** | 12:35 |

Implementação: ao processar ENTRADA com `current` já aberto e `current.saida == null`, apenas `codigos.push` — **não** sobrescrever `current.entrada`.

---

## 2. Janela 5 — regra P2-C

Lista narrativa original:

```
entrou 17:30hs
entrou 17:03hs
Saiu 20:36hs
```

Ordem real no banco (`REGDataHora`): **17:03 → 17:30 → 20:36**  
Resultado: **`17:03 ~ 20:36`** (não 17:30).

---

## 3. SAIDA órfã — regra P3-B

```
08:00 S   → janela imediata: null ~ 08:00
10:00 E   → abre nova janela
18:00 S   → estende janela atual → 10:00 ~ 18:00
```

Pseudocódigo:

```
se SAIDA e current == null:
  windows.push({ entrada: null, saida: p.REGDataHora, codigos: [p.REGCodigo] })
```

**Gennera / integrações:** janelas com `RPDDataEntrada = null` ou `RPDDataSaida = null` devem ser **ignoradas** no lançamento ERP (não enviar intervalo incompleto).

---

## 4. Janela extra — regra P4-A

Passagens do dia não capturadas por nenhum período → **uma única** janela extra:

- `PERCodigo = null`
- `RPDDataEntrada = min(ENTRADA)` entre orphan
- `RPDDataSaida = max(SAIDA)` entre orphan

Não aplicar `tempo_permanencia` recursivo nas orphan.

---

## 5. Casos auxiliares (mantidos)

### ENTRADA após SAIDA — nova janela

ENTRADA quando `current.saida != null` → finaliza janela anterior e abre nova.

### ENTRADA duplicada no mesmo minuto

Mesma janela; `RPDDataEntrada` = timestamp compartilhado; todos os `REGCodigo` incluídos.

### Recomputação do dia

Quando há passagens pendentes, recomputar **todas** as passagens do (pessoa, dia) — garante ordem correta mesmo com sync atrasado.

---

## 6. Selftests obrigatórios (worker)

| Caso | Assert |
|------|--------|
| 17:03 E, 17:30 E, 20:36 S | janela única 17:03–20:36 |
| 08:00 S, 10:00 E, 18:00 S | janela null–08:00 + janela 10:00–18:00 |
| Exemplo completo PO (14 passagens) | 5 janelas conforme README §4.2 |
| Orphan fora de período | 1 janela extra min/max |
