# WebApp — Aglutinação de Registros Diários

**Tela:** `webapp/src/app/(admin)/settings/institutions/[id]/page.tsx`  
**Posição aglutinação:** imediatamente **abaixo** do card *Sincronização de Frequências ao ERP* (que fica abaixo do sync RPD).

---

## 0. Sincronização de Frequências ao ERP (Fase 8)

Ver **[sync-freq-educacional.md](./sync-freq-educacional.md) §3**.

Card espelhando *Sincronização de Registros Diários*:

```typescript
const [syncFreqEducacional, setSyncFreqEducacional] = useState(false);
const [tempoFreqEducacional, setTempoFreqEducacional] = useState("58 23 * * *");
```

Inserir **entre** o card sync RPD (~641) e o card *Retenção de Logs*.

---

## 1. Visão da UI (aglutinação)

```
┌─────────────────────────────────────────────────────────┐
│ Aglutinação de Registros Diários                         │
│ Define como passagens são convertidas em presença.      │
├─────────────────────────────────────────────────────────┤
│ Tipo de aglutinação: [ Select ▼ ]                       │
│                                                         │
│ ┌─ Ilustração (muda conforme tipo) ─────────────────┐  │
│ │  [Diagrama Dia + barras / períodos]               │  │
│ └───────────────────────────────────────────────────┘  │
│                                                         │
│ (se tempo_permanencia_periodo)                          │
│ ┌─ Períodos cadastrados ────────────────────────────┐  │
│ │ Nome    │ Início │ Fim  │ Tol.E │ Tol.S │ Ações  │  │
│ │ Manhã   │ 05:00  │ 12:00│ 60min │ 60min │ ✎ 🗑   │  │
│ │ [+ Adicionar período]                             │  │
│ └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## 2. Componentes novos (sugerido)

```
webapp/src/components/registro-diario/
  AglutinacaoRegistrosCard.tsx       # Card principal (select + ilustração + lista)
  AglutinacaoIllustration.tsx        # SVG/CSS por modo
  PeriodosRegistroList.tsx           # Tabela CRUD
  PeriodoRegistroModal.tsx           # Modal create/edit
  aglutinacao-types.ts               # Tipos + labels
```

### 2.1 Tipos — `aglutinacao-types.ts`

```typescript
export type TipoAglutinacaoRegistro =
  | "entrada_saida"
  | "tempo_permanencia"
  | "tempo_permanencia_periodo";

export const AGlutinacaoOptions = [
  { value: "entrada_saida", label: "Entrada e saída do dia" },
  { value: "tempo_permanencia", label: "Tempo de permanência" },
  { value: "tempo_permanencia_periodo", label: "Tempo de permanência por período" },
] as const;

export interface PeriodoRegistro {
  PERCodigo?: number;
  PERNome: string;
  PERHorarioInicio: string; // "HH:mm"
  PERHorarioFim: string;
  PERToleranciaEntradaMinutos: number;
  PERToleranciaSaidaMinutos: number;
}
```

---

## 3. Integração na page.tsx

### 3.1 State

```typescript
const [aglutinacaoTipo, setAglutinacaoTipo] =
  useState<TipoAglutinacaoRegistro>("entrada_saida");
const [periodos, setPeriodos] = useState<PeriodoRegistro[]>([]);
const [periodoModalOpen, setPeriodoModalOpen] = useState(false);
const [periodoEditing, setPeriodoEditing] = useState<PeriodoRegistro | null>(null);
```

### 3.2 Load

Estender `loadData()`:

```typescript
apiGet<PeriodoRegistro[]>(`/instituicoes/${id}/periodos-registro`).catch(() => []),

// instRes:
setAglutinacaoTipo(instRes.INSAglutinacaoRegistros ?? "entrada_saida");
setPeriodos(periodosRes);
```

### 3.3 Save

Estender `handleSave()` — `instPromise`:

```typescript
INSAglutinacaoRegistros: aglutinacaoTipo,
```

Períodos: **CRUD imediato** via API no modal (não batch no save geral) — melhor UX e validação de overlap instantânea.

---

## 4. AglutinacaoRegistrosCard

### 4.1 Select

Reutilizar `Select` existente (`@/components/form/Select`).

### 4.2 Ilustrações — AglutinacaoIllustration

Componente puro que recebe `tipo: TipoAglutinacaoRegistro`.

**Layout comum:** eixo horizontal 00:00–24:00, label "Dia".

#### `entrada_saida`

- Uma barra contínua do ponto mais à esquerda (07:00) ao mais à direita (20:36).
- Legenda: "Menor entrada · Maior saída".

#### `tempo_permanencia`

- 5 barras separadas (cores alternadas), gaps entre elas.
- Posições proporcionais (não precisa ser pixel-perfect; é educativo).

#### `tempo_permanencia_periodo`

- Faixas de fundo semi-transparentes: Manhã / Tarde / Noite.
- Dentro de cada faixa, uma barra agregada (min entrada → max saída).
- Se `periodos.length > 0`, usar horários reais; senão placeholders.

**Implementação sugerida:** SVG inline ou divs com `width: X%` calculado de `HH:mm → percentual do dia`.

```typescript
function timeToPercent(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return ((h * 60 + m) / 1440) * 100;
}
```

---

## 5. CRUD Períodos

### 5.1 PeriodosRegistroList

Visível apenas se `aglutinacaoTipo === "tempo_permanencia_periodo"`.

| Coluna | Formato |
|--------|---------|
| Nome | texto |
| Início / Fim | `HH:mm` |
| Tol. entrada / saída | `{n} min` |
| Ações | Editar, Excluir |

Botão **Adicionar período** → abre modal vazio.

### 5.2 PeriodoRegistroModal

Campos:

| Campo | Input | Validação client-side |
|-------|-------|----------------------|
| Nome | text | obrigatório, max 80 |
| Horário início | `type="time"` ou InputField mask HH:mm | regex |
| Horário fim | idem | fim ≠ início |
| Tolerância entrada | number min 0 | minutos |
| Tolerância saída | number min 0 | minutos |

**Submit:**

```typescript
// create
await apiPost(`/instituicoes/${id}/periodos-registro`, payload);
// update
await apiPut(`/instituicoes/${id}/periodos-registro/${perCodigo}`, payload);
```

**Erro overlap:**

```typescript
catch (err) {
  if (err?.code === "PERIODO_OVERLAP" || err?.status === 400) {
    showToast("Há sobreposição de horário com outro período cadastrado.", "error");
  }
}
```

Usar `useToast` de `@/context/ToastContext` (padrão do projeto).

**Validação client-side opcional (preview):** antes de POST, comparar com `periodos` já carregados usando mesma lógica de overlap — reduz round-trips; server continua autoritativo.

### 5.3 Delete

```typescript
await apiDelete(`/instituicoes/${id}/periodos-registro/${perCodigo}`);
showToast("Período removido.", "success");
```

Confirm dialog opcional se período já usado em RPD (fase 2).

---

## 6. UX / Acessibilidade

- Card desabilitado visualmente (`opacity-50`) se sync inativo? **Não** — configuração de aglutinação é independente do cron; worker usa modo mesmo em processamento manual.
- Tooltip no select explicando cada modo (1 linha).
- Dark mode: barras com `bg-brand-500/70` e faixas de período `bg-gray-200 dark:bg-gray-700`.

---

## 7. Wireframe ASCII das ilustrações

### tempo_permanencia

```
Dia  |----====----|----========----|----====----|----====----|----====----|
     07:00  08:50  09:00      12:35  13:00  14:50  15:00  17:02  17:30 20:36
```

### tempo_permanencia_periodo

```
Dia  [==== Manhã ====|==== Tarde ======|== Noite ==]
         |---07:00─12:35---|  |--13:00─17:02--|  |17:30─20:36|
```

### entrada_saida

```
Dia  |====================== uma barra ======================|
     07:00                                              20:36
```

---

## 8. Checklist de arquivos

- [ ] `webapp/src/components/registro-diario/*` (novos)
- [ ] `webapp/src/app/(admin)/settings/institutions/[id]/page.tsx`
- [ ] Interface `Instituicao` — adicionar `INSAglutinacaoRegistros?`
- [ ] (Fase 4) `webapp/src/app/(admin)/instituicao/.../registros/page.tsx` — exibir múltiplas janelas

---

## 9. Testes manuais

1. Selecionar cada tipo → ilustração muda.
2. Modo período → CRUD completo.
3. Criar Manhã 08:00–12:20 + Tarde 12:00–18:00 → toast erro.
4. Salvar instituição → reload mantém tipo selecionado.
5. Trocar de `tempo_permanencia_periodo` para outro → lista períodos permanece oculta mas dados persistem.

---

# WebApp — Registros: Sync, Manutenção e Origem

Detalhamento: **[manutencao-registros.md](./manutencao-registros.md)**

## R1. `registros/page.tsx` — header

**Gestor** (`canExecuteRegistroDiario`):

```tsx
<Button onClick={handleSync}>Sync</Button>
<Button onClick={() => setShowReprocessar(true)}>Reprocessar</Button>
```

**Admin+** (`canWriteRegistroDiario`):

```tsx
<Button onClick={handleSync}>Sync</Button>
<Button onClick={() => setShowManutencaoModal(true)}>Manutenção</Button>
```

Ambos + `can("registroDiario", "execute")` → **Administrar** (Gennera).

## R2. Colunas tabela

- **Origem:** `r.usuarioCriacao?.USRNome ?? "—"` (visível a todos com `read`)
- **Ações:** passagens (`read`); editar/excluir (**Admin+** only)

## R3. Página `/registros/manutencao`

- Guard: `canWriteRegistroDiario` — Gestor → 403
- Wizard **Criar Manualmente:** tabela `JanelasDesejadasEditor` (HH:mm) — múltiplas janelas por dia

## R4. Arquivos

- [ ] `registros/page.tsx`
- [ ] `registros/manutencao/page.tsx`
- [ ] `registros/components/JanelasDesejadasEditor.tsx`
- [ ] `registros/components/ReprocessarPeriodoModal.tsx`
- [ ] `webapp/src/lib/registro-diario-access.ts`

## R5. Administrar Frequências — `AdminLancamentoModal`

Detalhamento: **[gennera-frequencias.md](./gennera-frequencias.md)** (Fase 7 — última)

- Filtros curso/série/turma (`SearchableMultiSelect` + `opcoes-filtro`)
- ERP ≠ Gennera → mensagem *“será disponibilizado em breve”*
- Checkbox *“Enviar intervalo de horário fixo”* + HH:mm quando `!considerarHorario`
- Badges `ENVIADO` / `ERRO` (nomenclatura atual) na listagem de registros
