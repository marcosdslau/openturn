# Manutenção de Registros Diários — Sync, reprocessamento e operações manuais

**Versão:** 0.2 (PO: permissões Gestor + multi-janela manual)  
**Data:** 2026-05-22  
**Escopo:** `webapi`, `webapp`, `worker` (indireto via fila)  
**Relacionado:** [README aglutinação](./README.md)

---

## 1. Objetivo

Estender a área de **Registros de Presença** com:

1. **Sync manual** — disparar aglutinação no worker sob demanda.
2. **Modal de manutenção** — atalhos para reprocessar período ou ir à página de manutenção.
3. **Página de manutenção** — consulta avançada, criação manual em lote, exclusão e alteração de RPDs.
4. **Rastreabilidade** — coluna **Origem** na listagem principal; auditoria de usuário que criou/alterou.

---

## 2. Controle de acesso

### 2.1 Matriz por perfil

| Perfil | `registroDiario` | UI |
|--------|------------------|-----|
| **OPERACAO** | `read` | Listagem; botão passagens |
| **GESTOR** | `read`, `execute` | + **Sync**, **Reprocessar Período**, **Administrar** (Gennera) |
| **ADMIN**, **SUPER_ADMIN**, **SUPER_ROOT** | `read`, `create`, `update`, `delete`, `execute` | + **Manutenção** (página + escrita), edit/excluir na listagem |

**GESTOR não recebe** `create`, `update`, `delete` — permanece como hoje na matriz de permissões.

```typescript
// Sem alteração para GESTOR:
GESTOR.registroDiario: ['read', 'execute']

// ADMIN já possui create/update/delete/execute
```

### 2.2 Helpers webapp

```typescript
canExecuteRegistroDiario(can)  // execute — Sync, Reprocessar, Administrar
canWriteRegistroDiario(can)    // create — Manutenção, criar/editar/excluir RPD
```

### 2.3 Guards

| Rota / ação | Guard |
|-------------|-------|
| `POST /sync`, `POST /reprocessar-periodo` | `execute` (Gestor+) |
| `/registros/manutencao` (escrita) | `create` (Admin+) |
| `PATCH/DELETE /:rpdCodigo`, bulk manutenção | `update` / `delete` (Admin+) |

**Operação** não vê Sync, Reprocessar, Manutenção nem edit/delete.

---

## 3. Tela principal — `registros/page.tsx`

Arquivo: `webapp/src/app/(admin)/instituicao/[codigoInstituicao]/registros/page.tsx`

### 3.1 Header — novos botões (à esquerda de "Administrar")

Ordem por perfil:

**Gestor** (`execute`):

```
[Sync] [Reprocessar] [Administrar]
```

**Admin+** (`create`):

```
[Sync] [Manutenção] [Administrar]
```

#### Botão **Sync** (`canExecuteRegistroDiario`)

- **POST** `/instituicao/:id/registro-diario/sync`
- Enfileira `publishRegistroDiarioSyncJob`.
- Toast: *"Sincronização enfileirada"*.

#### Botão **Reprocessar** (Gestor — `execute`)

- Abre modal `ReprocessarPeriodoModal` (datas início/fim → confirmação → API §4).
- Gestor **não** acessa página de manutenção nem operações de escrita.

#### Botão **Manutenção** (Admin+ — `canWriteRegistroDiario`)

- Abre modal `RegistrosManutencaoModal`:

| Opção | Ação |
|-------|------|
| **Reprocessar Período** | Mesmo fluxo do botão Reprocessar |
| **Manutenção de Registros** | Navega para `/instituicao/{id}/registros/manutencao` |

> Subtítulo da segunda opção: *criar ou corrigir registros ausentes/incorretos*.

### 3.2 Tabela — colunas novas/alteradas

| Coluna | Conteúdo |
|--------|----------|
| **Origem** | Nome de `usuarioCriacao.USRNome` se registro manual; `"—"` se automático (rotina/worker) |
| **Ações** | Botão passagens (`read`); editar/excluir (**Admin+**, `update`/`delete`) |

**Editar / Excluir (Admin+):** modais `RegistroDiarioEditModal` / `ConfirmDeleteRegistroModal`; grava `USRCodigoAlteracao` + `RPDAlteradoEm`.

---

## 4. Reprocessar Período

### 4.1 UI (modal)

- Campos: **Data início**, **Data fim** (date picker, formato ISO date-only como resto do projeto).
- Botão **Reprocessar** → modal confirmação explicando:
  - RPDs do intervalo serão **apagados**.
  - Passagens do intervalo serão **reagregadas** conforme `INSAglutinacaoRegistros` atual.
- Escopo: **toda a instituição** no intervalo (sem filtro pessoa/curso neste atalho).

### 4.2 API

**POST** `/instituicao/:instituicaoCodigo/registro-diario/reprocessar-periodo`

```json
{ "dataInicio": "2026-01-01", "dataFim": "2026-01-31" }
```

**Permissão:** `registroDiario.execute` (Gestor+)

**Fluxo server-side (transação):**

1. Validar intervalo (início ≤ fim; máx. N dias — sugerir 366).
2. `DELETE` `RPDRegistrosDiarios` onde `INSInstituicaoCodigo` + `RPDData` ∈ intervalo.
3. `UPDATE` `REGRegistroPassagem` SET `REGProcessado = false` onde passagens no intervalo (por `REGDataHora` convertido ao dia civil UTC, mesmo critério do worker).
4. `publishRegistroDiarioSyncJob(instituicaoCodigo)`.
5. Retornar `{ jobId, rpdRemovidos, passagensResetadas }`.

> Diferente da regra “só passagens novas ao mudar modo”: aqui é **ação explícita** de administrador.

---

## 5. Página de manutenção

**Rota:** `/instituicao/[codigoInstituicao]/registros/manutencao`  
**Acesso:** **Admin, SuperAdmin, SuperRoot** (`canWriteRegistroDiario`). Gestor → 403 ou redirect.

### 5.1 Layout

```
┌─ Filtros (card) ─────────────────────────────────────────┐
│ Pessoas (multi) │ Curso │ Série │ Turma                  │
│ Data/hora início │ Data/hora fim                         │
│ ☐ Entradas vazias │ ☐ Saídas vazias                      │
│ [Consultar] [Limpar]          [Criar Manualmente Registros]│
└──────────────────────────────────────────────────────────┘
┌─ Tabela paginada + checkbox seleção ─────────────────────┐
│ ☐ │ ... │ Entrada │ Saída │ Origem │                    │
└──────────────────────────────────────────────────────────┘
Barra flutuante quando seleção > 0: [Excluir Registros] [Alterar Manualmente]
```

### 5.2 Filtros

Reutilizar padrão de `MatriculasFiltros`:

| Filtro | Componente | API query |
|--------|------------|-----------|
| Pessoa | `SearchableMultiSelect` | `PESCodigo` repetido ou `pessoasCodigos[]=1&pessoasCodigos[]=2` |
| Curso / Série / Turma | `SearchableMultiSelect` + opções de `GET .../matricula/opcoes-filtro` | `curso[]`, `serie[]`, `turma[]` |
| Data/hora início | `datetime-local` ou date+time | `dataHoraInicio` ISO |
| Data/hora fim | idem | `dataHoraFim` ISO |
| Entradas vazias | checkbox | `entradasVazias=true` |
| Saídas vazias | checkbox | `saidasVazias=true` |

**Sem pessoa selecionada** → todas as pessoas da instituição (dentro dos demais filtros).

**Consultar:** `GET /instituicao/:id/registro-diario/manutencao?...` (endpoint dedicado ou estender query existente).

### 5.3 Seleção em lote

- Checkbox por linha + “selecionar todos da página”.
- Com 1+ selecionados → exibir barra com **Excluir Registros** e **Alterar Manualmente**.

#### Excluir Registros

- Modal confirmação (irreversível).
- **POST** `/registro-diario/manutencao/excluir` `{ rpdCodigos: number[] }`.

#### Alterar Manualmente

- Modal:
  - Radio/checkbox: alterar **Entrada** e/ou **Saída**.
  - Campo datetime para cada opção marcada.
  - Botão **Processar** → confirmação → **PATCH** bulk.
- Grava `USRCodigoAlteracao`, `RPDAlteradoEm` em cada RPD.
- Define `RPDStatus = MANUAL` se ainda não for.

---

## 6. Criar Manualmente Registros (wizard modal)

Botão na página de manutenção abre modal multi-step.

### Step 1 — Filtros (mesmos do §5.2, exceto entradas/saídas vazias)

Obrigatório: **data/hora início** e **data/hora fim**.

Botão **Verificar** → lista paginada de **alvos** (combinação pessoa × dia civil no intervalo que **terão** registros criados/substituídos).

**Lógica de preview (API):**

Para cada pessoa no escopo dos filtros, para cada dia civil no intervalo `[inicio, fim]`:

- Se já existir RPD → listar para substituição.
- Se não existir → listar como “novo registro a criar”.

Response paginada: `{ pessoa, RPDData, RPDCodigo?, acao: 'substituir' | 'criar' }`.

### Step 2 — Janelas desejadas (múltiplas por dia)

O usuário define **N pares entrada/saída** aplicados a **cada (pessoa, dia civil)** do preview.

UI — tabela editável **Janelas desejadas**:

| # | Hora entrada | Hora saída | Ações |
|---|--------------|------------|-------|
| 1 | 07:00 | 11:50 | 🗑 |
| 2 | 13:00 | 17:30 | 🗑 |
| 3 | 19:00 | 22:40 | 🗑 |
| | | | [+ Adicionar janela] |

- Horários em **HH:mm** no fuso da instituição (`INSFusoHorario`).
- Combinados com `RPDData` de cada alvo para montar `RPDDataEntrada` / `RPDDataSaida` completos.
- Mínimo **1 janela**; sem limite máximo prático (validar ≤ 20 janelas/dia).

**Exemplo PO** — mesmo filtro, para cada pessoa no dia **05/05/2026**:

| RPDJanelaIndice | Entrada | Saída |
|-----------------|---------|-------|
| 1 | 07:00 | 11:50 |
| 2 | 13:00 | 17:30 |
| 3 | 19:00 | 22:40 |

Se o intervalo de filtros cobrir 05/05–05/07, cada pessoa recebe **3 janelas × 3 dias = 9 RPDs**.

Resumo abaixo da tabela de preview:

> *"Serão criados **P** pessoas × **D** dias × **J** janelas = **P×D×J** registros. Registros automáticos existentes nesses dias serão substituídos. Passagens não processadas no intervalo serão marcadas como processadas."*

Botão **Criar Registros** → modal confirmação final.

### Step 3 — Execução (API)

**POST** `/instituicao/:id/registro-diario/manutencao/criar-manual`

```json
{
  "filtros": { "...": "..." },
  "janelasDesejadas": [
    { "horaEntrada": "07:00", "horaSaida": "11:50" },
    { "horaEntrada": "13:00", "horaSaida": "17:30" },
    { "horaEntrada": "19:00", "horaSaida": "22:40" }
  ]
}
```

**Fluxo:**

1. Resolver conjunto `(PESCodigo, RPDData)` conforme filtros (preview).
2. Por cada `(pessoa, dia)`:
   - **DELETE** todos os RPDs existentes daquele par (substituição total do dia).
   - **INSERT** `janelasDesejadas.length` linhas com `RPDJanelaIndice` 1..N, `PERCodigo = null`.
3. Cada RPD:
   - `RPDDataEntrada` / `RPDDataSaida` = combinação de `RPDData` + hora local
   - `RPDStatus = MANUAL`
   - `USRCodigoCriacao = usuário logado`
4. `UPDATE REGRegistroPassagem SET REGProcessado = true` — passagens não processadas da pessoa no dia civil, dentro do intervalo dos filtros.

Retorno: `{ pessoas, dias, janelasPorDia, rpdCriados, rpdSubstituidos, passagensMarcadas }`.

---

## 7. Schema Prisma — auditoria em RPD

Adicionar em `RPDRegistrosDiarios`:

```prisma
/// Usuário que criou manualmente (null = gerado pelo worker/rotina).
USRCodigoCriacao   Int?
usuarioCriacao     USRUsuario? @relation("RpdCriacao", fields: [USRCodigoCriacao], references: [USRCodigo], onDelete: SetNull)

/// Último usuário que alterou manualmente.
USRCodigoAlteracao Int?
usuarioAlteracao   USRUsuario? @relation("RpdAlteracao", fields: [USRCodigoAlteracao], references: [USRCodigo], onDelete: SetNull)
RPDAlteradoEm      DateTime?
```

**Origem na UI:**

| Condição | Exibição |
|----------|----------|
| `USRCodigoCriacao != null` | Nome do usuário criador |
| `USRCodigoAlteracao != null` e sem criacao | Nome alterador + tooltip “Alterado em …” (opcional) |
| Ambos null | `—` (automático) |

Worker ao agregar: **não** preenche campos de usuário.

---

## 8. API — endpoints resumo

Base: `/instituicao/:instituicaoCodigo/registro-diario`

| Método | Rota | Permissão | Descrição |
|--------|------|-----------|-----------|
| POST | `/sync` | execute | Enfileira aglutinação |
| POST | `/reprocessar-periodo` | execute | Apaga RPDs + reset passagens + sync |
| GET | `/manutencao` | read + **create** (Admin+) | Lista paginada com filtros avançados |
| POST | `/manutencao/preview-criacao` | create | Preview alvos (pessoa × dia) |
| POST | `/manutencao/criar-manual` | create | N janelas/dia por alvo |
| POST | `/manutencao/excluir` | delete | Exclui RPDs por IDs |
| PATCH | `/manutencao/alterar` | update | Bulk alteração entrada/saída |
| PATCH | `/:rpdCodigo` | update | Edição unitária (listagem principal) |
| DELETE | `/:rpdCodigo` | delete | Exclusão unitária |

Incluir `usuarioCriacao: { select: { USRCodigo, USRNome } }` no `findAll` existente.

---

## 9. DTOs (webapi)

```typescript
// QueryManutencaoRegistroDiarioDto — estende filtros + datetime + flags vazias + pessoasCodigos[]

// ReprocessarPeriodoDto
{ dataInicio: string; dataFim: string; } // ISO date

// CriarManualRegistroDiarioDto
{
  filtros: ManutencaoFiltrosDto;
  janelasDesejadas: { horaEntrada: string; horaSaida: string; }[]; // HH:mm, fuso instituição
}

// AlterarRegistrosDiariosDto
{ rpdCodigos: number[]; alterarEntrada?: boolean; alterarSaida?: boolean; novaEntrada?: string; novaSaida?: string; }

// ExcluirRegistrosDiariosDto
{ rpdCodigos: number[]; }
```

---

## 10. Componentes webapp (novos)

```
registros/
  page.tsx                          # Sync, Manutenção, Origem, edit/delete
  manutencao/
    page.tsx
  components/
    RegistrosManutencaoModal.tsx    # Reprocessar + link manutenção
    ReprocessarPeriodoForm.tsx
    RegistrosManutencaoFiltros.tsx   # shared filtros
    CriarManualRegistrosModal.tsx     # wizard Verificar → Criar
    AlterarRegistrosModal.tsx
    RegistroDiarioEditModal.tsx       # edição unitária
    ConfirmDeleteRegistroModal.tsx
```

Helper: `lib/registro-diario-access.ts` → `canExecuteRegistroDiario`, `canWriteRegistroDiario`.

Componente extra: `JanelasDesejadasEditor.tsx` — tabela HH:mm repetível no wizard criar manual.

---

## 11. Dúvidas abertas (opcional PO)

1. **Reprocessar Período:** incluir filtros opcionais (pessoa/curso) ou sempre instituição inteira?
2. **Sync:** exibir contagem de passagens pendentes antes de enfileirar?
3. **Label modal:** confirmar *"Manutenção de Registros"* vs *"Manutenção de Registros Ausente"*.

---

## 12. Testes manuais

- [ ] Operação: só listagem + passagens; sem Sync/Reprocessar/Manutenção/edit/delete.
- [ ] Gestor: Sync + Reprocessar + Administrar; **sem** Manutenção, **sem** edit/delete, **403** em `/manutencao`.
- [ ] Admin+: Sync + Manutenção + edit/delete + página manutenção.
- [ ] Sync enfileira job; worker processa passagens pendentes.
- [ ] Reprocessar período remove RPDs e regenera conforme modo aglutinação.
- [ ] Criar manual 3 janelas/dia → 3 RPDs por pessoa/dia com índices 1–3 (ex. 05/05/2026).
- [ ] Passagens `REGProcessado=false` no intervalo ficam `true` após criação manual.
- [ ] Excluir / alterar em lote atualiza auditoria.
