---
name: hub hardware multi-marca
overview: Consolidar todo o domínio de equipamentos em `webapi/src/hardware/` com factory hierárquica (marca → modelo) baseada em classes abstratas por marca; eliminar `catraca/` (morto) e mover `controlid/` para `hardware/brands/controlid/`. Cria a infra de polimorfismo com 1 modelo concreto (`Default`) por marca preservando o comportamento atual; demais modelos ficam como stubs estendendo a abstract.
todos:
  - id: core-types
    content: "Criar `hardware/interfaces/hardware.types.ts` revisado: enums `HardwareBrand` (já existe) e `ControlIDModel` (IDBLOCK, IDBLOCK_NEXT, IDBLOCK_FACIAL, IDFACEMAX, IDFACE, DEFAULT). Criar `hardware/transport/transport.interface.ts` (post/get genéricos) + `direct-http.transport.ts` (axios) + `ws-relay.transport.ts` (delega ao `WsRelayGateway`/`ConnectorService`)."
    status: completed
  - id: factory-skeleton
    content: Criar `hardware/factory/brand-factory.interface.ts` (`BrandFactory.resolve(equipment, overrideHost)`) e `hardware/factory/hardware.factory.ts` (router por `EQPMarca` para a `BrandFactory` correspondente, registráveis via DI no `HardwareModule`).
    status: completed
  - id: controlid-abstract
    content: Criar `hardware/brands/controlid/abstract/controlid.abstract.ts` migrando 100% da lógica de `webapi/src/hardware/providers/controlid.provider.ts` (login, withRetry, ensureSession, syncPerson, create/modify/deletePerson, set/remove tag/face/fingers/groups, executeAction, enroll, customCommand) com pontos `protected *Impl()` para `deletePerson`, `executeAction`, `enroll`, `customCommand`. A abstract recebe um `Transport` (Direct ou Relay) no construtor.
    status: completed
  - id: controlid-models
    content: "Criar `hardware/brands/controlid/models/`: `controlid-default.provider.ts` (extends abstract sem overrides) e stubs `idblock.provider.ts`, `idblock-next.provider.ts`, `idblock-facial.provider.ts`, `idfacemax.provider.ts`, `idface.provider.ts` (todos extends abstract, sem overrides ainda)."
    status: completed
  - id: controlid-factory
    content: "Criar `hardware/brands/controlid/controlid.factory.ts`: lê `equipment.EQPModelo`, normaliza para `ControlIDModel`, escolhe `Transport` (Relay se `EQPUsaAddon`, senão Direct), constrói `effectiveConfig` (host/IP fallback como em `HardwareService.instantiate` atual) e retorna a instância correta."
    status: completed
  - id: controlid-services-move
    content: "Mover serviços/utils para `hardware/brands/controlid/services/` e `utils/`: `controlid-passagem.service.ts` + `controlid-command-queue.service.ts` (de [webapi/src/controlid/controlid.service.ts](webapi/src/controlid/controlid.service.ts)), `controlid-sync.service.ts` (de `controlid-sync.service.ts`), `controlid-monitor.service.ts` (persistDao/persistCatraEvent/triggerWebhook — ex-HardwareService), `controlid-resolver.service.ts` (resolveEquipamento/InstituicaoCodigo — ex-HardwareService). Mover utils `controlid-catra-event.util.ts` e `controlid-notify-time.util.ts`. Atualizar imports nos consumidores."
    status: completed
  - id: controlid-controller-move
    content: Mover `webapi/src/controlid/controlid.controller.ts` → `hardware/brands/controlid/controllers/controlid-monitor.controller.ts`. Preservar literalmente as rotas `instituicao/:codigoInstituicao/monitor/controlid/*`. Remover `webapi/src/hardware/controllers/controlid.controller.ts` (legado redundante).
    status: completed
  - id: other-brands-stubs
    content: "Criar `hardware/brands/hikvision/`, `intelbras/` e `topdata/` com: abstract `*.abstract.ts` (implementa `IHardwareProvider` com logger-only stubs, espelhando `HikvisionProvider` atual) + 1 model `*-default.provider.ts` + factory de marca."
    status: completed
  - id: hardware-service-cleanup
    content: "Refatorar `hardware/hardware.service.ts`: `instantiate(equipment, overrideHost?)` apenas delega para `HardwareFactory.resolve(...)`. Remover `executeCommandViaRelay`, `persistControlidDao`, `persistControlidCatraEvent`, `resolveEquipamentoFromControlidDeviceId`, `resolveInstituicaoCodigoFromControlidDeviceId`, `triggerControlidMonitorWebhook`, helpers `ctlStr/ctlBigInt`. Manter `syncAll`, `executeCommand` (delega ao provider), `executeProviderAction` (assinatura preservada)."
    status: completed
  - id: module-wiring
    content: Atualizar `hardware/hardware.module.ts` para registrar todos os controllers (HardwareController + brand controllers), services brand-específicos, factories e transports. Remover `import { ControlidModule }` e da array `imports` em [webapi/src/app.module.ts](webapi/src/app.module.ts). Garantir que `EquipamentoModule`/`PessoaModule`/`RotinaModule` continuem resolvendo `HardwareService`.
    status: completed
  - id: delete-legacy
    content: Excluir as pastas `webapi/src/catraca/` (toda), `webapi/src/controlid/` (toda — após o move), `webapi/src/hardware/providers/` (toda), e o arquivo `webapi/src/hardware/controllers/controlid.controller.ts`.
    status: completed
  - id: validate
    content: Rodar `tsc --noEmit` (ou `npm run build`) e `npm run lint` no `webapi/`. Subir aplicação (smoke test rápido) garantindo que rotas Monitor ControlID (`/instituicao/:c/monitor/controlid/push|catra_event|dao|new_user_identified.fcgi|sync`) respondem 200 e que `executeProviderAction` continua funcionando para rotinas (chamada por [rotina/engine/execution.service.ts](webapi/src/rotina/engine/execution.service.ts)).
    status: completed
isProject: false
---

## 1. Diagnóstico do Estado Atual

- `webapi/src/catraca/` — **morto**: `CatracaModule` não está em [webapi/src/app.module.ts](webapi/src/app.module.ts). Fila em memória + endpoints stub.
- `webapi/src/controlid/` — implementação **ativa e madura** (webhooks Monitor, registro de passagem, fila de comandos Push, sync de pessoas). Mistura webhook receiver + domínio de acesso + persistência.
- `webapi/src/hardware/` — factory **só por marca** ([hardware.service.ts:39-69](webapi/src/hardware/hardware.service.ts)). `ControlIDProvider` tem `switch(this.config.model)` com apenas `default:` (sem polimorfismo real). `HikvisionProvider` é stub. `HardwareService` vaza lógica específica do ControlID (`persistControlidDao`, `persistControlidCatraEvent`, `resolveEquipamentoFromControlidDeviceId`, `triggerControlidMonitorWebhook`, `executeCommandViaRelay`).
- Há **dois webhook controllers** sobrepostos: `ControlidMonitorController` (rota `instituicao/:c/monitor/controlid/*` — moderno) e `ControlIDController` em [webapi/src/hardware/controllers/controlid.controller.ts](webapi/src/hardware/controllers/controlid.controller.ts) (rota `instituicao/:c/hardware/controlid/*` — legado, usa `EQPCodigo` como deviceId).

## 2. Estrutura-Alvo

```text
webapi/src/hardware/
├── hardware.module.ts
├── hardware.service.ts                       # API agnóstica: instantiate, syncAll, executeCommand, executeProviderAction
├── controllers/
│   └── hardware.controller.ts                # rota: instituicao/:c/hardware (sync, command) — MANTÉM
├── factory/
│   ├── hardware.factory.ts                   # router por EQPMarca → BrandFactory
│   └── brand-factory.interface.ts            # contrato: resolve(equipment, overrideHost): IHardwareProvider
├── interfaces/
│   ├── hardware-provider.interface.ts        # IHardwareProvider (mantido)
│   └── hardware.types.ts                     # HardwareBrand, HardwareUser, configs por marca
├── transport/
│   ├── transport.interface.ts                # post/get genéricos
│   ├── direct-http.transport.ts              # axios direto ao IP
│   └── ws-relay.transport.ts                 # via ConnectorService/WsRelay
└── brands/
    ├── controlid/
    │   ├── controlid.factory.ts              # router por EQPModelo (normalizado)
    │   ├── controlid.types.ts                # ControlIDConfig, ControlIDMode, enum ControlIDModel
    │   ├── abstract/
    │   │   └── controlid.abstract.ts         # AbstractControlIDProvider implements IHardwareProvider
    │   ├── models/
    │   │   ├── controlid-default.provider.ts # comportamento atual idêntico
    │   │   ├── idblock.provider.ts           # stub (extends abstract)
    │   │   ├── idblock-next.provider.ts      # stub
    │   │   ├── idblock-facial.provider.ts    # stub
    │   │   ├── idfacemax.provider.ts         # stub
    │   │   └── idface.provider.ts            # stub
    │   ├── controllers/
    │   │   └── controlid-monitor.controller.ts  # rota PRESERVADA: instituicao/:c/monitor/controlid/*
    │   ├── services/
    │   │   ├── controlid-monitor.service.ts     # persistDao, persistCatraEvent, triggerWebhook (ex-HardwareService)
    │   │   ├── controlid-resolver.service.ts    # resolveEquipamento/InstituicaoCodigo (ex-HardwareService)
    │   │   ├── controlid-passagem.service.ts    # registrarPassagem*, validarAcessoOnline (ex-controlid.service)
    │   │   ├── controlid-command-queue.service.ts # getPendingCommand/processResult/enqueue
    │   │   └── controlid-sync.service.ts        # ex-controlid-sync.service
    │   └── utils/
    │       ├── controlid-catra-event.util.ts    # movido
    │       └── controlid-notify-time.util.ts    # movido
    ├── hikvision/
    │   ├── hikvision.factory.ts
    │   ├── hikvision.types.ts
    │   ├── abstract/hikvision.abstract.ts    # impl. IHardwareProvider com logger-only stubs
    │   └── models/hikvision-default.provider.ts
    ├── intelbras/                            # mesma estrutura, tudo stub
    │   ├── intelbras.factory.ts
    │   ├── abstract/intelbras.abstract.ts
    │   └── models/intelbras-default.provider.ts
    └── topdata/
        ├── topdata.factory.ts
        ├── abstract/topdata.abstract.ts
        └── models/topdata-default.provider.ts
```

**Removidos**: `webapi/src/catraca/` (todo), `webapi/src/controlid/` (todo), `webapi/src/hardware/providers/` (todo), `webapi/src/hardware/controllers/controlid.controller.ts` (legado redundante).

## 3. Diagrama do Fluxo

```mermaid
flowchart TD
    Caller[Controller / Routine / Sync] --> HS[HardwareService]
    HS --> HF[HardwareFactory.byBrand"EQPMarca"]
    HF -->|ControlID| CIDF[ControlIDFactory.byModel"EQPModelo"]
    HF -->|Hikvision| HIKF[HikvisionFactory]
    HF -->|Intelbras| INTF[IntelbrasFactory]
    HF -->|TopData| TOPF[TopDataFactory]

    CIDF -->|iDBlock| IDB[IDBlockProvider]
    CIDF -->|iDFace| IDF[IDFaceProvider]
    CIDF -->|default| CIDD[ControlIDDefaultProvider]

    IDB -.extends.-> ABS_CID[AbstractControlIDProvider]
    IDF -.extends.-> ABS_CID
    CIDD -.extends.-> ABS_CID
    ABS_CID -.implements.-> IHW[IHardwareProvider]

    HIKF --> ABS_HIK[AbstractHikvisionProvider]
    ABS_HIK -.implements.-> IHW
```

## 4. Pontos-Chave do Design

### 4.1. Classe Abstrata por Marca
`AbstractControlIDProvider` recebe um `Transport` (direto via axios ou via WS relay) injetado pela factory — elimina o `executeCommandViaRelay` espalhado em `HardwareService`. Lógica comum (login, sessão, retry, syncPerson, create/modify/delete) vive na abstract. Pontos atualmente com `switch(this.config.model)` em [controlid.provider.ts:294-389](webapi/src/hardware/providers/controlid.provider.ts) viram `protected` virtuais:

```typescript
async deletePerson(id: number): Promise<void> {
  return this.withRetry(() => this.deletePersonImpl(id));
}
protected async deletePersonImpl(id: number): Promise<void> {
  // implementação default (movida do método atual)
}
```

Modelos concretos (`IDBlockProvider`, `IDFaceProvider`, etc.) podem `override deletePersonImpl` quando o protocolo do modelo divergir — sem reescrever orquestração/retry/sessão.

### 4.2. Factory Hierárquica
`HardwareFactory.byBrand(brand: HardwareBrand): BrandFactory` retorna a factory da marca. `BrandFactory.resolve(equipment, overrideHost): IHardwareProvider` recebe o equipamento e devolve a instância concreta — internamente cada `*Factory` lê `EQPModelo`, normaliza (case-insensitive, trim, fallback `DEFAULT`) e retorna a classe correta.

```typescript
// hardware.factory.ts
resolve(equipment: EQPEquipamento, overrideHost?: string): IHardwareProvider {
  const factory = this.byBrand(equipment.EQPMarca as HardwareBrand);
  return factory.resolve(equipment, overrideHost);
}
```

### 4.3. Webhooks ControlID Consolidados
- **Mantém**: `instituicao/:c/monitor/controlid/*` (push, result, new_user_identified, catra_event, dao, sync, etc.) — vira `controlid-monitor.controller.ts` em `hardware/brands/controlid/controllers/`.
- **Remove**: `instituicao/:c/hardware/controlid/*` (legado em [hardware/controllers/controlid.controller.ts](webapi/src/hardware/controllers/controlid.controller.ts)) — duplicado e desatualizado (assume `EQPCodigo == deviceId`).
- `instituicao/:c/hardware/sync` e `instituicao/:c/hardware/:id/command` em [hardware.controller.ts](webapi/src/hardware/controllers/hardware.controller.ts) — preservados.

### 4.4. `HardwareService` — Limpeza
Permanece como API agnóstica: `instantiate`, `syncAll`, `executeCommand`, `executeProviderAction`. Toda lógica ControlID-específica (`persistControlidDao`, `persistControlidCatraEvent`, `resolveEquipamentoFromControlidDeviceId`, `resolveInstituicaoCodigoFromControlidDeviceId`, `triggerControlidMonitorWebhook`, `executeCommandViaRelay`) sai para `brands/controlid/services/`.

### 4.5. Compatibilidade
- URLs públicas dos webhooks: **preservadas literalmente**.
- Assinatura de `HardwareService.executeProviderAction(equipmentId, method, args)` — **preservada** (consumida por [rotina/engine/execution.service.ts:418-419](webapi/src/rotina/engine/execution.service.ts)).
- `EQPMarca`/`EQPModelo` no Prisma — **inalterados** (continuam `String?`); aplicação normaliza para enums.
- `ControlidModule` removido de `AppModule` (último import em [app.module.ts:16,37](webapi/src/app.module.ts)).

## 5. Riscos & Mitigações

- **Imports circulares pós-merge** (`HardwareModule` ↔ ex-`ControlidModule`): elimina-se ao colocar tudo dentro de `HardwareModule`.
- **`pessoa.service.ts` e `rotina/.../execution.service.ts`** consomem `HardwareService` — assinaturas preservadas.
- **Endpoint legado `hardware/controlid`** poderia ter consumidores externos: confirmação visual/log mostra que `ControlidMonitorController` é o ativo (chamado pelos próprios webhooks ControlID); o legado registra `REGRegistroPassagem` com `EQPCodigo == deviceId` (incorreto). Será removido.
- **Mock de Hikvision/Intelbras/TopData** continua sendo logger-only.