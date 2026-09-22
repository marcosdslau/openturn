# Configuração de acesso por equipamento — plano de implementação

Reescreve o fluxo entregue em `17c3855` (controle acesso por turma) e `b928cce` (controle de
entrada-saída por turma). Complementa o [runbook manual](README.md), que continua sendo a
referência do que acontece dentro da catraca.

**Estado:** proposta aprovada, não implementada.

---

## 1. O que muda, em uma frase

Hoje o horário é digitado dentro da turma, vira um perfil deduplicado por hash e o `sync` **é dono**
dos objetos na catraca. Passa a ser: **áreas, horários e departamentos são configurados por
equipamento**, o projeto **espelha e adota** o que está no device, e a turma **só aponta para um
departamento**.

### Decisões que este plano assume

| # | Decisão | Consequência principal |
| :-- | :--- | :--- |
| 1 | Configuração **por equipamento**, com **adoção** do que já existe no device | O projeto deixa de corrigir drift; passa a detectá-lo e reportá-lo |
| 2 | Ao adicionar um horário ao departamento, as áreas vêm **pré-marcadas e desmarcáveis** | A regra é `(horário, áreas[])`, não `(horário)` |
| 3 | Perfis atuais são **migrados e marcados como não revisados** | Nenhuma escrita em catraca durante a migração |

Sobre a decisão 3: "não sincroniza até revisar" vale para **regras**. A **associação de pessoas ao
departamento continua rodando** durante o período de revisão — interrompê-la trancaria alunos do
lado de fora.

---

## 2. Princípio: o equipamento é a fonte da verdade

O `b928cce` construiu um sync que reescreve `time_spans`, apaga `group_access_rules` estranhos e
recria regras. Isso se inverte:

- **A tela escreve no device** (por endpoints tipados, não mais `command` cru do navegador).
- **O projeto mantém um espelho** de áreas, portais, horários, departamentos e regras.
- **O sync só faz duas coisas**: colocar a pessoa no `user_groups` certo e ler de volta para comparar.

A `inspecao.ts` do `b928cce` deixa de ser diagnóstico secundário e vira a peça central: é o único
mecanismo que detecta alteração feita pela interface web da catraca.

### Vocabulário: "horário vinculado a uma área"

Na Control iD, área é nó e portal é aresta dirigida. Vincular um horário a uma área precisa
significar **"este horário libera a ENTRADA nesta área"**. Toda a UI usa o rótulo
`Entrada na Área X`, nunca `Área X` sozinho. Isso elimina por construção a classe de erro do
§8.2 do runbook (regra ligada ao portal de sentido contrário ao nome).

---

## 3. Modelo de dados

Convenções do projeto: prefixo de 3 letras nas colunas, `INSInstituicaoCodigo` em toda tabela,
policy de RLS em `setup-rls.sql`, sequência iniciando em 100.

### Espelho do equipamento

```
AREArea         ARECodigo, INS, EQPCodigo, AREIdDevice, ARENome, ARELidoEm
                @@unique([EQPCodigo, AREIdDevice])

PTLPortal       PTLCodigo, INS, EQPCodigo, PTLIdDevice, PTLNome,
                PTLAreaDeCodigo → ARE, PTLAreaParaCodigo → ARE, PTLLidoEm
                @@unique([EQPCodigo, PTLIdDevice])

HORHorario      HORCodigo, INS, EQPCodigo, HORIdDevice, HORNome, HORLidoEm
                @@unique([EQPCodigo, HORIdDevice])

HORJanela       HRJCodigo, INS, HORCodigo, HRJHoraInicio, HRJHoraFim,
                HRJDom..HRJSab, HRJFeriado1..3, HRJOrdem
                @@index([HORCodigo])

HRAHorarioArea  HRACodigo, INS, HORCodigo, ARECodigo
                @@unique([HORCodigo, ARECodigo])
```

`HRAHorarioArea` é o vínculo que a aba Áreas edita: o **conjunto padrão** de áreas de um horário.

### Departamento e adoção

```
DEPDepartamento  DEPCodigo, INS, DEPNome, DEPDescricao
                 @@unique([INS, DEPNome])

DEQDepartamentoEquipamento
                 DEQCodigo, INS, DEPCodigo → DEP, EQPCodigo,
                 DEQIdDevice, DEQNome, DEQRevisadoEm, USRCodigoRevisao,
                 DEQSyncHash, DEQVerificadoEm, DEQUltimoErro
                 @@unique([EQPCodigo, DEQIdDevice])
                 @@unique([DEPCodigo, EQPCodigo])

DRGDepartamentoRegra
                 DRGCodigo, INS, DEQCodigo → DEQ, HORCodigo → HOR,
                 DRGIdRegraDevice, DRGNome
                 @@unique([DEQCodigo, HORCodigo])

DRADepartamentoRegraArea
                 DRACodigo, INS, DRGCodigo → DRG, ARECodigo → ARE
                 @@unique([DRGCodigo, ARECodigo])
```

`DEPDepartamento` é institucional e existe por um motivo só: a turma precisa de **uma** referência
que atravesse as N catracas. `DEQ` é a adoção — o casamento entre o departamento institucional e um
`groups` concreto de um equipamento.

**A chave da adoção é `DEQIdDevice`, não o nome.** Renomear o departamento pela interface web da
catraca atualiza `DEQNome` na próxima leitura, sem quebrar o vínculo. O nome só é usado no momento
de *sugerir* a adoção.

`DRADepartamentoRegraArea` existe por causa da decisão 2: ao adicionar o horário, ele nasce com uma
linha por área de `HRAHorarioArea`, e o operador pode remover alguma. Sem essa tabela, o mesmo
horário não poderia liberar entrada+saída num departamento e só entrada noutro.

### Turma

```
TRMTurma.DEPCodigo → DEP        (substitui TRMTurma.PHACodigo)
TEQTurmaEquipamento             (mantida, sem mudança: escopo de equipamentos)
```

### Tabelas que saem (fase 7)

`PHAPerfilHorario`, `PHAJanela`, `PHEPerfilEquipamento`, `EQSEquipamentoSentido`,
enums `SentidoArea` e `ModoSentido`.

`AREArea` + `PTLPortal` generalizam o `EQSEquipamentoSentido`, que comporta exatamente duas áreas.
**`EQSInvertido` desaparece**: com portais nomeados e explícitos na tela, escolher o sentido certo é
escolher o portal certo, não compensar com um booleano.

---

## 4. Mapeamento para a Control iD

Cada `DRGDepartamentoRegra` vira **uma `access_rule`**:

```
DEQ (group)
 └─ group_access_rules ─> access_rules  (DRGIdRegraDevice, type=1, priority=0)
                              ├─ access_rule_time_zones ─> time_zones (HORIdDevice)
                              │                              └─ time_spans (HORJanela)
                              └─ portal_access_rules ─────> portals
                                     um por DRA: o portal com area_to = ARE
```

É exatamente a sequência validada nos §4.1–4.6 do runbook, executada pelos endpoints da tela.

Ganhos sobre o modelo atual:

- **`modo: livre` deixa de ser enum** — é um horário de 24 h vinculado às áreas desejadas.
- **`modo: bloqueado` deixa de ser enum** — é não ter regra cobrindo aquela área (allow-only).
- **`Sentido` fixo interna/externa some** — são N áreas, cada uma com seu portal de entrada.
- **Um horário em várias áreas** é uma `access_rule` com vários `portal_access_rules`, que é o que o
  device já suporta nativamente.

### Armadilhas do runbook que a implementação precisa honrar

| Runbook | Onde é tratado |
| :--- | :--- |
| §6.1 — `ids` de tabela de vínculo não é id de regra | O adaptador só propaga o id vindo de `access_rules` e `time_zones`; testes cobrem |
| §6.3 — regra em portal errado não dá erro | Após cada escrita, releitura e comparação (`inspecionar`) |
| §6.4 — permissões somam | A tela mostra, por departamento, as **outras** regras que cobrem o mesmo portal |
| §1.4 — nome de horário ≤ 15 bytes | `validarNomeDevice` reaproveitando `perfil-nome.ts` |

---

## 5. Superfície de API

Novo controller `EquipamentoAcessoController`, prefixo
`instituicao/:instituicaoCodigo/equipamento/:eqpCodigo/acesso`, permissão `equipamento:update`
para escrita e `equipamento:read` para leitura.

```
GET    /                      espelho completo (áreas, portais, horários, departamentos, regras)
POST   /ler                   relê do device e reconcilia o espelho

POST   /area                  cria área          { nome }
PUT    /area/:id              renomeia
POST   /portal                cria portal        { areaDeCodigo, areaParaCodigo, nome }

POST   /horario               cria horário       { nome, janelas[], areas[] }
PUT    /horario/:id           edita              { nome?, janelas?, areas? }
DELETE /horario/:id           remove (recusa se houver regra usando)

GET    /departamento/candidatos   groups do device ainda não adotados
POST   /departamento/adotar       { DEQIdDevice, DEPCodigo? | DEPNome }
POST   /departamento              cria no device e adota   { nome }
PUT    /departamento/:id/regras   { regras: [{ HORCodigo, ARECodigos[] }] }
POST   /departamento/:id/revisar  marca DEQRevisadoEm
DELETE /departamento/:id          desadota (opcional: remove do device se vazio)
```

Turma (`TurmaController`), alterações:

```
PUT /turma/validacao        body passa de { ativa, regras, escopo }
                                     para { ativa, DEPCodigo, escopo }
PUT /turma/validacao/lote   idem
GET /turma/:id/equipamento/:eqp/regra-aplicada   (lerRegraAplicada, generalizado por área)
```

Saem: `PerfilPreviewDto`, `RegrasSentidoDto`, `RegraSentidoDto`, `TurmaHorarioDto` do fluxo de turma
(migram para o DTO de horário do equipamento), `SentidoEquipamentoDto` e o
`TurmaSentidoController` inteiro.

O `POST /hardware/:id/command` **continua existindo**, mas só para diagnóstico. Nenhuma tela de
configuração passa a escrever por ele — senão o espelho nasce desatualizado.

---

## 6. Telas

### `/instituicao/:ins/equipamentos/:eqp/configuracao`

Hoje: abas `geral | horarios | departamentos | liberacoes_agendadas`, todas escrevendo `.fcgi` cru
direto do navegador.

**Aba Áreas (nova)**
- Lista de áreas do equipamento; criar e renomear.
- Portais entre elas com o sentido explícito (`Área Externa → Área Interna`), botão para criar o que
  faltar. Atalho "criar Área Interna/Externa padrão" reaproveitando `prepareDirection`.
- Em cada área, os horários que liberam **entrada** nela, editável ali.
- Botão "Ler do equipamento" reconciliando o espelho.

**Aba Horários (existente, ganha o vínculo)**
- Mantém o CRUD de `time_zones`/`time_spans`, migrado para os endpoints tipados.
- Nova coluna "Libera entrada em", com os chips das áreas vinculadas, editável.
- Validação de nome ≤ 15 bytes na tela (hoje só existe no núcleo, para perfil).

**Aba Departamentos (reescrita)**
- Substitui o modal atual de "Horários", que liga a regra a **todos** os portais e a nomeia
  `(access_rules automatically created for groups N)` — hoje é cego a sentido e é a principal fonte
  de configuração errada.
- Lista com estado de adoção: adotado / não adotado / não revisado / divergente.
- Editor de regras: ao adicionar um horário, as áreas dele aparecem como **chips pré-marcados e
  desmarcáveis**.
- Ao lado, o diagrama vivo do que o departamento libera.

**Componente `DiagramaRegraTurma` → `DiagramaAcesso`**
Generalizar de 2 sentidos fixos para N áreas: `Record<Sentido, …>` vira lista de áreas; as duas
caixas fixas (`CaixaArea`) viram um nó por área; `COR_SENTIDO` vira paleta indexada por área. A
grade semanal 7×24 h e o destaque de divergência (`referencia`) ficam como estão — já é exatamente a
visualização pedida.

### `/instituicao/:ins/turmas`

- `TurmaValidacaoModal`: perde `FaixasHorarioEditor` e `RegraSentidoEditor`; vira seletor de
  departamento + escopo, com o `DiagramaAcesso` do departamento escolhido em modo leitura e um aviso
  por catraca do escopo onde o departamento não foi adotado ou não foi revisado.
- `PerfisHorarioTab` → `DepartamentosTab`: leitura, mostrando onde cada `DEP` está adotado.
- `EquipamentosSentidoTab`: **removida** — seu conteúdo vira a aba Áreas do equipamento.

---

## 7. O que o sync passa a fazer

**Continua:** associação pessoa → departamento. `resolverGruposDaPessoa` em
[`grupo-pessoa.ts`](../../webapi/src/turma/core/grupo-pessoa.ts) troca a consulta de
`EQSEquipamentoSentido` + `perfil.PHANome` por `DEQ` + `DEQNome`, com a condição:

```
turma vigente ∧ equipamento no escopo ∧ existe DEQ(DEP, EQP) ∧ DEQRevisadoEm ≠ null
  → DEQNome
senão
  → PESGrupo (grupo padrão)
```

Como `DEQNome` é por equipamento, duas catracas podem ter nomes diferentes para o mesmo `DEP` sem
quebrar nada — a função já devolve `Map<EQPCodigo, nome>`.

**Continua:** lock por equipamento, paridade webapi/worker, `context.turmas` nas rotinas.

**Sai:** criação e reescrita de `access_rules`, `time_zones`, `time_spans`, `portals` e `groups` no
caminho automático. `sincronizarPerfis`/`sincronizarPar` viram `verificarDepartamentos`, que para
cada `(DEP, equipamento no escopo)` roda `inspecionar`, compara com o espelho e grava
`DEQSyncHash` / `DEQVerificadoEm` / `DEQUltimoErro`. **Não escreve no device.**

`StatusEquipamento` ganha `departamento_nao_adotado`, `departamento_nao_revisado` e `divergente`; perde
`sentido_nao_preparado`.

---

## 8. Migração

**Nenhuma catraca é tocada.** Todo o espelho se preenche a partir do que já está no banco:
`PHEPerfilEquipamento` guarda `PHEIdGrupo`, `PHEIdRegraInterna/Externa` e
`PHEIdHorarioInterna/Externa`; `EQSEquipamentoSentido` guarda áreas e portais.

Por equipamento com `EQSEquipamentoSentido`:

1. `AREArea` ← `EQSAreaInternaId` ("Área Interna") e `EQSAreaExternaId` ("Área Externa").
2. `PTLPortal` ← os dois portais, **já aplicando `EQSInvertido`** ao decidir qual é
   `Externa → Interna`. A inversão é materializada no espelho e o flag deixa de existir.

Por `PHEPerfilEquipamento`:

3. `HORHorario` ← `PHEIdHorarioInterna` e `PHEIdHorarioExterna`, nomes de
   `nomeHorario(PHACodigo, sentido, PHANome)`; `HORJanela` ← `PHAJanela` filtrada por `PHJSentido`,
   ou uma janela 24 h quando `PHAModo<Sentido> = LIVRE`.
4. `HRAHorarioArea` ← horário interno → Área Interna; horário externo → Área Externa.
5. `DEPDepartamento` ← um por `PHAPerfilHorario` (`DEPNome = PHANome`).
6. `DEQ` ← um por `PHE` (`DEQIdDevice = PHEIdGrupo`, **`DEQRevisadoEm = NULL`**).
7. `DRG` ← um por sentido com `PHEIdRegra<Sentido> ≠ null`; `DRA` ← a área correspondente.
   Sentido com `PHAModo<Sentido> = BLOQUEADO` não gera regra — que é a semântica correta.
8. `TRMTurma.DEPCodigo` ← o `DEP` derivado de `TRMTurma.PHACodigo`.

Tabelas antigas ficam no banco até a fase 7, para permitir rollback.

### Rotinas (`context.turmas`)

`salvarValidacao({ ativa, regras, escopo })` passa a `{ ativa, DEPCodigo, escopo }`. Para não quebrar
rotinas já escritas por clientes, o núcleo continua aceitando `regras` por uma versão: canoniza e
procura um `DEP` cujas regras sejam equivalentes; achando, usa; não achando, lança
`TurmaAcessoErro('validacao')` com mensagem apontando o novo formato. Atualizar junto:
`ai-project-rules.ts`, `RoutineSnippets.ts`, `RoutineSchema.ts`.

---

## 9. Fases

Cada fase termina com `npm run shared:sync` no worker e build verde dos dois lados.

### Fase 1 — Espelho e leitura
Sem mudança de comportamento. Só passa a existir um retrato do device no banco.

- `webapi/prisma/schema.prisma`: 8 tabelas novas + migration + `setup-rls.sql` (8 policies) +
  `setval(..., 100, false)`.
- `webapi/src/hardware/brands/controlid/access-group/controlid-access-config.ts` (novo, pasta
  sincronizada): `readAll()` devolvendo áreas, portais, time_zones + spans, groups, access_rules e
  todos os vínculos.
- `webapi/src/turma/core/espelho.ts` (novo): `lerEquipamento(eqp)` → grava/atualiza o espelho,
  marcando `*LidoEm`.
- `ports.ts`: novos métodos na `AccessGroupPort` e na `ProviderComGruposDeAcesso`; no-op nos
  abstracts de Hikvision/Intelbras/Topdata.

**Aceite:** `POST /acesso/ler` num equipamento preparado reproduz no banco o que
`load_objects.fcgi` devolve, e rodar duas vezes não duplica nada.

### Fase 2 — Aba Áreas e escrita tipada
- `controlid-access-config.ts`: `createArea`, `renameArea`, `createPortal`, `createTimeZone`,
  `updateTimeZoneSpans`, `deleteTimeZone`.
- `webapi/src/turma/core/acesso-equipamento.core.ts` (novo): operações de escrita, cada uma
  gravando device + espelho sob o lock do equipamento, com releitura de confirmação.
- `EquipamentoAcessoController` + DTOs.
- `webapp`: aba Áreas; aba Horários migrada para os endpoints tipados e com o vínculo de áreas.

**Aceite:** criar um horário pela tela, vinculá-lo à Área Externa e conferir no device por
`load_objects` que o `time_zone` e os `time_spans` batem.

### Fase 3 — Departamentos e diagrama
- `controlid-access-config.ts`: `createGroup`, `renameGroup`, `upsertRule(group, timeZone, portals)`,
  `deleteRule`.
- `acesso-equipamento.core.ts`: `salvarRegras(DEQ, regras)` — diff entre o desejado e o device,
  criando/removendo `access_rules`, `access_rule_time_zones` e `portal_access_rules`.
- `webapp`: aba Departamentos reescrita; `DiagramaRegraTurma` → `DiagramaAcesso` com N áreas.

**Aceite:** reproduzir pela tela o caso "Catec manha" do runbook (entrada 06:30–07:30 na Área
Interna, saída 11:30–12:30 na Área Externa) e a conferência do §5 passar nos quatro `load_objects`.

### Fase 4 — Adoção
- `GET /departamento/candidatos`, `POST /departamento/adotar`.
- Sugestão de `DEP` por nome normalizado; criação de `DEP` novo quando não houver correspondência.
- Tela de adoção listando os `groups` do device ainda sem `DEQ`.

**Aceite:** um departamento criado pela interface web da catraca aparece como candidato, é adotado e
suas regras aparecem corretamente na tela.

### Fase 5 — Turma aponta para o departamento
- `TRMTurma.DEPCodigo`; `salvarValidacaoEmLote` recebe `DEPCodigo`.
- `grupo-pessoa.ts` e `estado-desejado.ts` migram de `PHACodigo`/`sentidoPreparado` para
  `DEPCodigo`/`DEQ revisado`.
- `sincronizarPerfis` → `verificarDepartamentos` (só leitura e comparação).
- `TurmaValidacaoModal` e `PerfisHorarioTab` reescritos; `EquipamentosSentidoTab` e
  `TurmaSentidoController` removidos.
- `ai-project-rules.ts` + snippets de rotina.

**Aceite:** turma com departamento adotado em 2 catracas → pessoas recebem o grupo certo em cada
uma; catraca sem adoção reporta `departamento_nao_adotado` sem travar o envio das pessoas.

### Fase 6 — Migração dos dados
- Script de migração de dados (seção 8), idempotente, rodável em dry-run.
- Compatibilidade de `regras` em `context.turmas` por uma versão.

**Aceite:** num dump de produção, toda turma com `TRMValidacaoAtiva` continua com o mesmo grupo
efetivo por equipamento antes e depois da migração.

### Fase 7 — Limpeza
- Drop de `PHAPerfilHorario`, `PHAJanela`, `PHEPerfilEquipamento`, `EQSEquipamentoSentido` e dos
  enums `SentidoArea`/`ModoSentido`.
- Remoção de `perfil-canonico.ts` (partes de modo/sentido), `hashJanelas`, `normalizarRegras`,
  `validarRegras`, `canonizarRegras`, `RegraSentidoEditor`, `FaixasHorarioEditor`.
- `canonizar`/`ordenarEFundir`/`validarJanelas` **ficam** — passam a validar as janelas do horário.

---

## 10. Testes

Seguindo o padrão já existente (specs ao lado do núcleo, rodando só na webapi):

- `espelho.spec.ts` — leitura idempotente, device que perdeu um objeto, id que mudou.
- `acesso-equipamento.core.spec.ts` — diff de regras: adicionar área, remover área, trocar horário,
  remover regra. Cobrir explicitamente a armadilha §6.1 (nunca usar o `ids` de tabela de vínculo).
- `controlid-access-config.spec.ts` — no estilo do `controlid-access-group.spec.ts` atual, com `post`
  falso registrando as chamadas.
- `inspecao.spec.ts` — estender de 2 sentidos para N áreas; caso "regra de outro departamento cobre o
  mesmo portal" (§6.4).
- `turma-acesso.core.it.spec.ts` — cenário fim a fim com device falso: adotar, configurar, vincular
  turma, conferir grupos das pessoas.
- Migração: teste com fixture de perfil interna+externa, um com `LIVRE` e um com `BLOQUEADO`.

---

## 11. Riscos

| Risco | Mitigação |
| :--- | :--- |
| **Drift deixa de ser corrigido.** Alteração pela web da catraca persiste | `verificarDepartamentos` reporta na tela e no dashboard; botão "reaplicar" manual por departamento |
| **Trabalho manual multiplicado por N catracas** | Ação "copiar configuração deste equipamento para…" na fase 3, gerando os mesmos horários/regras em outro device |
| **"Permissões somam" (§6.4) vira responsabilidade do operador** | A tela do departamento lista as outras regras que cobrem o mesmo portal, com aviso explícito |
| **Departamento removido no device** | `DEQ` fica órfã e é sinalizada como `divergente`; nunca apagada automaticamente |
| **Rotinas de clientes quebram** | Compatibilidade de `regras` por uma versão + erro com mensagem apontando o novo formato |
| **Dedup por hash some: muitos departamentos na catraca** | A tela avisa ao passar de N grupos/regras; a adoção incentiva reuso do mesmo `DEP` entre turmas |

---

## 12. Fora de escopo

- Feriados `hol1`/`hol2`/`hol3` (já reservados e não usados).
- Marcas além de Control iD: Hikvision, Intelbras e Topdata seguem com no-op.
- Regras de bloqueio (`access_rules.type = 0`): o modelo continua allow-only; bloqueios encontrados
  no device são **reportados**, nunca criados.
