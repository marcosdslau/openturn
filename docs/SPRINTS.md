# Plano de Sprints - OpenTurn

> Middleware de controle de acesso físico para instituições educacionais.
> Conecta ERPs Educacionais a Catracas/Dispositivos de Controle de Acesso.

---

## Visão Geral do Produto

**OpenTurn** é um middleware multi-tenant que faz a ponte entre sistemas ERP educacionais (Gennera, Perseus, Lyceum, Mentor, Sponte, Sophia) e dispositivos de controle de acesso físico (Catracas ControlId iDNext/iDBlock). O sistema gerencia pessoas, matrículas, equipamentos, **registra todas as passagens (entradas/saídas) em catracas**, e oferece um **motor de execução de rotinas dinâmicas** (Schedule/Webhook) com código JavaScript editável via Monaco Editor.

### Personas

| Persona | Descrição | Necessidades Principais |
|---------|-----------|------------------------|
| **Super Root** | Administrador global do sistema | Criar clientes, instituições, visão total |
| **Admin do Cliente** | Gestor de um grupo educacional | Configurar instituições, ver relatórios consolidados |
| **Gestor da Instituição** | Diretor/Coordenador | Dashboard de passagens, gestão de pessoas, configurar catracas |
| **Operação** | Portaria/Recepção | Ver passagens em tempo real, cadastrar pessoas/tags |

### Critérios de Sucesso (MVP)

- [ ] Cadastro multi-tenant funcional (Cliente → Instituição → Pessoas)
- [ ] Integração com catraca ControlId (Push + Monitor)
- [ ] Registro de todas as passagens em catracas com dados completos
- [ ] Dashboard de monitoramento em tempo real
- [ ] Autenticação JWT com controle de acesso por grupo
- [ ] Motor de Rotinas Dinâmicas (Schedule + Webhook) com Monaco Editor

---

## Stack Tecnológico

| Camada | Tecnologia | Justificativa |
|--------|------------|---------------|
| **Frontend** | Next.js + TailAdmin | SSR, templates prontos para dashboard |
| **Backend** | NestJS v11+ | Modular, TypeScript nativo, decorators |
| **ORM** | Prisma | Type-safe, migrations, suporte PostgreSQL |
| **Banco** | PostgreSQL | RLS para multi-tenant, JSONB, performance |
| **Auth** | Passport + JWT | Standard da indústria para APIs REST |
| **Scheduler** | @nestjs/schedule + cron | CronJobs dinâmicos por instituição |
| **Sandbox** | vm2 / isolated-vm | Execução isolada de código JS |
| **Editor** | Monaco Editor | Editor de código no frontend |
| **Infra** | Docker + Docker Compose | Ambiente local reprodutível |

---

## Modelo de Dados Core — Tabela de Registros de Passagens

> [!IMPORTANT]
> A tabela `REGRegistroPassagem` é o **coração do sistema**. Todo giro de catraca (entrada ou saída) gera um registro nesta tabela.

```dbml
Table REGRegistroPassagem {
  REGCodigo            Int       [pk, increment]
  PESCodigo            Int       [ref: > PESPessoa.PESCodigo, note: 'Pessoa que passou']
  REGAcao              ENUM_ACAO_PASSAGEM [note: 'ENTRADA ou SAIDA']
  EQPCodigo            Int       [ref: > EQPEquipamento.EQPCodigo, note: 'Catraca onde ocorreu']
  REGTimestamp         BigInt    [note: 'Unix timestamp do momento da passagem (epoch)']
  REGDataHora          DateTime  [note: 'Data e hora da passagem (legível)']
  INSInstituicaoCodigo Int       [ref: > INSInstituicao.INSCodigo, note: 'Tenant - RLS']
  createdAt            DateTime  [default: `now()`]
}

enum ENUM_ACAO_PASSAGEM {
  ENTRADA
  SAIDA
}
```

**Campos:**
| Campo | Tipo | Descrição |
|-------|------|-----------|
| `REGCodigo` | Int (PK) | Identificador único do registro |
| `PESCodigo` | Int (FK) | Código da pessoa que passou na catraca |
| `REGAcao` | Enum | `ENTRADA` ou `SAIDA` |
| `EQPCodigo` | Int (FK) | Código do equipamento (catraca) |
| `REGTimestamp` | BigInt | Unix timestamp (epoch) do momento da passagem |
| `REGDataHora` | DateTime | Data e hora legível da passagem |
| `INSInstituicaoCodigo` | Int (FK) | Código da instituição (isolamento por RLS) |
| `createdAt` | DateTime | Quando o registro foi criado no banco |

---

## Sprints

### Sprint 1 — Fundação & Infraestrutura
**Duração:** 2 semanas
**Objetivo:** Ambiente de desenvolvimento funcional com banco de dados e autenticação básica.

| # | User Story | Prioridade | AC |
|---|-----------|------------|-----|
| 1.1 | Como desenvolvedor, quero um ambiente Docker local para rodar o sistema | MUST | Docker Compose sobe PostgreSQL + API sem erros |
| 1.2 | Como desenvolvedor, quero o schema Prisma com todas as tabelas base | MUST | Migrations rodam, tabelas criadas no banco |
| 1.3 | Como desenvolvedor, quero RLS configurado no PostgreSQL | MUST | Queries filtram por `INSInstituicaoCodigo` |
| 1.4 | Como Super Root, quero fazer login e receber um JWT | MUST | Login retorna token com `userId` e `roles` |
| 1.5 | Como desenvolvedor, quero seed de dados de teste | SHOULD | Script popula cliente, instituição, pessoas |

**Entregáveis:**
- [x] `docker-compose.yml` funcional
- [x] Schema Prisma com tabelas base
- [x] Policies RLS no PostgreSQL (`setup-rls.sql`)
- [x] Módulo de autenticação (JWT + bcrypt)
- [x] Script de seed (`prisma/seed.ts`)

---

### Sprint 2 — CRUD Core & Modelo de Dados Completo
**Duração:** 2 semanas
**Objetivo:** APIs de CRUD para todas as entidades centrais, incluindo a tabela de passagens.

| # | User Story | Prioridade | AC |
|---|-----------|------------|-----|
| 2.1 | Como Admin, quero cadastrar e gerenciar Clientes | MUST | CRUD completo via API REST |
| 2.2 | Como Admin, quero cadastrar e gerenciar Instituições | MUST | CRUD com vínculo a Cliente + RLS |
| 2.3 | Como Gestor, quero cadastrar e gerenciar Pessoas | MUST | CRUD com foto, tag, grupo + RLS |
| 2.4 | Como Gestor, quero cadastrar e gerenciar Matrículas | MUST | CRUD vinculado a Pessoa + RLS |
| 2.5 | Como Gestor, quero cadastrar e gerenciar Equipamentos | MUST | CRUD com IP, modelo + RLS |
| 2.6 | Como desenvolvedor, quero a tabela `REGRegistroPassagem` | MUST | Migration cria a tabela com todos os campos |
| 2.7 | Como Gestor, quero uma API de consulta de passagens | MUST | GET com filtros por data, pessoa, catraca |

**Entregáveis:**
- [x] Módulos NestJS: Cliente, Instituição, Pessoa, Matrícula, Equipamento
- [x] Módulo NestJS: RegistroPassagem (consulta com filtros + inserção)
- [x] Validação de DTOs com `class-validator`
- [x] Paginação padronizada (`PaginationDto` + `PaginatedResult`)

---

### Sprint 3 — Integração com Catracas ControlId
**Duração:** 2 semanas
**Objetivo:** Comunicação bidirecional com catracas ControlId (Push + Monitor).

| # | User Story | Prioridade | AC |
|---|-----------|------------|-----|
| 3.1 | Como sistema, quero receber comandos de Push da catraca | MUST | Endpoint `GET /push` retorna comandos pendentes |
| 3.2 | Como sistema, quero receber resultados de comandos | MUST | Endpoint `POST /result` processa retornos |
| 3.3 | Como sistema, quero receber eventos de passagem (Monitor) | MUST | Endpoint `POST /api/notifications/catra_event` registra passagem na tabela `REGRegistroPassagem` |
| 3.4 | Como sistema, quero autorizar acesso em tempo real (Online) | SHOULD | Endpoint `POST /new_user_identified.fcgi` valida e responde |
| 3.5 | Como Gestor, quero sincronizar pessoas com a catraca | MUST | Comando de sincronização envia usuários ao equipamento |

**Entregáveis:**
- [] Módulo NestJS: ControlId Integration (`ControlidModule`)
- [] Endpoints Push, Result, Monitor, Online
- [] Serviço de enfileiramento de comandos (DB: `CMDComandoFila`)
- [] Gravação automática de passagens na `REGRegistroPassagem`

---

### Sprint 4 — Frontend & Dashboard
**Duração:** 2 semanas
**Objetivo:** Interface web funcional com dashboard de monitoramento.

| # | User Story | Prioridade | AC |
|---|-----------|------------|-----|
| 4.1 | Como Gestor, quero um dashboard com resumo de passagens do dia | MUST | Cards de total entradas, saídas, presentes |
| 4.2 | Como Gestor, quero ver passagens em tempo real | MUST | Lista atualizada automaticamente |
| 4.3 | Como Operação, quero consultar o histórico de passagens de uma pessoa | MUST | Busca por nome/documento com filtro de período |
| 4.4 | Como Admin, quero navegar entre instituições | MUST | Seletor de instituição com contexto de tenant |
| 4.5 | Como Gestor, quero telas de CRUD para Pessoas e Equipamentos | SHOULD | Formulários de cadastro e listagem |

**Entregáveis:**
- [] Layout base TailAdmin com navegação por tenant
- [] Página de Dashboard com cards e gráficos
- [] Página de Passagens (lista + filtros)
- [] Páginas CRUD (Pessoas, Equipamentos)
- [] Login e controle de acesso por grupo

---

### Sprint 5 — Gestão de Usuários & Permissões (Multi-Tenant)
**Duração:** 2 semanas
**Objetivo:** Implementar controle de acesso hierárquico e multi-tenant, permitindo que um usuário tenha diferentes papéis em diferentes clientes/instituições.

| # | User Story | Prioridade | AC |
|---|-----------|------------|-----|
| 5.1 | Como Usuário, quero ter acesso compartilhado a múltiplos clientes/instituições | MUST | Um único login (e-mail) acessa diferentes contextos |
| 5.2 | Como Usuário, após o login, quero selecionar o contexto ativo (Tenant Switcher) | MUST | Interface permite escolher Cliente/Instituição para operar |
| 5.3 | Como desenvolvedor, quero que o JWT contenha os escopos permitidos | MUST | Payload do JWT lista `roles` por `clientId/institutionId` |
| 5.4 | Como desenvolvedor, quero validar a hierarquia de criação no contexto selecionado | MUST | Regras de SuperRoot, Admin, Gestor aplicadas ao tenant ativo |
| 5.5 | Como Admin/Gestor, quero convidar usuários para meu cliente/instituição | SHOULD | Fluxo de atribuição de papel a um e-mail existente ou novo |
| 5.6 | Como desenvolvedor, quero adaptar o `TenantInterceptor` para contextos dinâmicos | MUST | Filtros RLS baseados no contexto selecionado via Header `x-tenant-id` |

**Entregáveis:**
- [x] Backend: Refatoração da tabela `USRUsuario` e criação de `USRAcesso`
- [x] Backend: Lógica de login que retorna escopos disponíveis
- [x] Backend: Interceptor de Tenant atualizado para suportar troca de contexto e **bypass global** para papéis SUPER
- [x] Frontend: Componente "Tenant Switcher" no Header/Dashboard (oculto ou "Global" para SUPER)
- [x] Frontend: Menu de Gestão de Usuários com atribuição de escopo (Client/Inst + Role)
- [x] Proteção de rotas reativa ao papel do usuário no contexto ativo

---

### Sprint 6 — Integração ERP: Configuração por Instituição
**Duração:** 2 semanas
**Objetivo:** Permitir que cada instituição configure seu ERP Educacional (Gennera, Sponte, etc) para uso nas rotinas.

| # | User Story | Prioridade | AC |
|---|-----------|------------|-----|
| 6.1 | Como Gestor, quero configurar o ERP da minha instituição | MUST | Tela de Detalhes da Inst. permite selecionar ERP e salvar credenciais |
| 6.2 | Como Gestor, quero informar URL base, Token e Cód. Instituição | MUST | Campos específicos aparecem após selecionar o provedor (ex: Gennera) |
| 6.3 | Como desenvolvedor, quero que as credenciais fiquem seguras no banco | MUST | Tabela `ERPConfiguracao` popula corretamente vinculada à `INSInstituicao` |
| 6.4 | Como sistema, quero validar a conectividade com o ERP | SHOULD | Botão "Testar Conexão" que faz um ping na API do ERP selecionado |

**Entregáveis:**
- [x] UI: Seletor de ERP e formulário de credenciais na tela de Instituição
- [x] Backend: CRUD de `ERPConfiguracao` com isolamento por Tenant
- [x] Backend: Factory de Adapters para teste de conexão básica

---

### Sprint 7 — Motor de Rotinas & Automação (Co-relacionada)
**Duração:** 2 semanas
**Objetivo:** Criar e executar rotinas (JS) que consomem os dados do ERP configurado na Sprint 6.

| # | User Story | Prioridade | AC |
|---|-----------|------------|-----|
| 7.1 | Como Gestor, quero um menu "Rotinas" por instituição | MUST | Tela acessível em `/instituicao/[cod]/rotinas` |
| 7.2 | Como Gestor, quero listar todas as rotinas da minha instituição | MUST | Lista com nome, trigger, última execução e status ativo |
| 7.3 | Como Gestor, quero criar/editar rotinas com Monaco Editor e Helper | MUST | Editor integrado com painel lateral de documentação (exemplos context/db) |
| 7.4 | Como Gestor, quero configurar gatilhos Webhook ou Schedule e Timeout | MUST | Configuração de trigger e tempo máximo de execução (seconds) |
| 7.5 | Como Gestor, quero executar uma rotina manualmente para testes | MUST | Botão "Executar Agora" que dispara execução em processo isolado |
| 7.6 | Como sistema, quero garantir isolamento de Tenant (RLS) no `context.db` | MUST | Backend injeta filtro de `INSInstituicaoCodigo` em TODA operação de DB |
| 7.7 | Como Gestor, quero um "Live Console" para assistir logs em tempo real | MUST | Tela que conecta via webhook/WS para streaming de logs de uma rotina |
| 7.8 | Como Gestor, quero histórico de versões do código da rotina | MUST | Tabela `ROTHistoricoVersao` grava snapshot do código a cada save |
| 7.9 | Como Gestor, quero comparar versões com visão split/diff e restore | MUST | Uso de Monaco Diff Editor para comparar e botão de restaurar versão |
| 7.10 | Como sistema, quero executar rotinas em processos filhos (não-bloqueante) | MUST | Uso de `child_process` para isolamento e encerramento por timeout |
| 7.11 | Como Gestor, quero ver os logs de execução detalhados | MUST | `ROTExecucaoLog` mostra histórico completo e erros |
| 7.12 | Como Gestor, quero enviar comandos para todos os equipamentos ativos | MUST | Injeção de `context.adapters.equipamentos` (lista) para iteração |
| 7.13 | Como Gestor, quero usar logs estruturados (info, warn, error) | MUST | `context.console` suporta múltiplos níveis visíveis no Live Console |

**Entregáveis:**
- [x] UI: Menu "Rotinas" e tela de listagem (Status + Última Execução)
- [x] UI: Editor Monaco com **Routine Helper** e **Version History (Diff Editor)**
- [x] UI: Dashboard de **Live Console** para streaming de logs em tempo real
- [x] Engine: Proxy de segurança para `context.db` garantindo isolamento de Tenant (RLS)
- [x] Engine: Gerenciador de Processos Filhos (`child_process`) com controle de Timeout
- [x] Engine: Suporte a sandbox segura com injeção de `console` e `db` escopado
- [x] Backend: Lógica de versionamento (Snapshot on Save + Restore + Delete)

---

### Sprint 8 — Polish, Segurança & Produção
**Duração:** 2 semanas
**Objetivo:** Hardening de segurança, testes, e preparação para deploy em produção.

| # | User Story | Prioridade | AC |
|---|-----------|------------|-----|
| 8.1 | Como desenvolvedor, quero testes unitários nos módulos core | MUST | Cobertura ≥ 80% nos services |
| 8.2 | Como desenvolvedor, quero testes E2E nos fluxos críticos | MUST | Login, CRUD, registro de passagem, execução de rotina |
| 8.3 | Como Admin, quero auditoria de ações | SHOULD | Log de quem fez o quê e quando |
| 8.4 | Como sistema, quero rate limiting nas APIs e webhooks | MUST | Proteção contra abuso (inclui limite de execuções por instituição) |
| 8.5 | Como sistema, quero CI/CD configurado | SHOULD | Pipeline de build, test, deploy |
| 8.6 | Como sistema, quero monitoramento de saúde | SHOULD | Health checks e métricas básicas |

**Entregáveis:**
- [ ] Suíte de testes unitários e E2E
- [ ] Rate limiting e helmet configurados
- [ ] Pipeline CI/CD (GitHub Actions)
- [ ] Dockerfile de produção otimizado
- [ ] Documentação de deploy

---

## Roadmap Visual

```mermaid
gantt
    title OpenTurn - Roadmap de Sprints
    dateFormat  YYYY-MM-DD
    axisFormat  %b %d

    section Sprint 1
    Infraestrutura & Auth       :s1, 2026-02-10, 14d

    section Sprint 2
    CRUD Core & Passagens       :s2, after s1, 14d

    section Sprint 3
    Integração Catracas         :s3, after s2, 14d

    section Sprint 4
    Frontend & Dashboard        :done, s4, after s3, 14d

    section Sprint 5
    Gestão de Usuários          :done, s5, after s4, 14d

    section Sprint 6
    Integração ERP              :done, s6, after s5, 14d

    section Sprint 7
    Execution Engine            :done, s7, after s6, 14d

    section Sprint 8
    Segurança & Produção        :active, s8, after s7, 14d
```

---

## Dependências entre Sprints

```mermaid
graph LR
    S1["Sprint 1<br/>Infraestrutura"] --> S2["Sprint 2<br/>CRUD Core"]
    S2 --> S3["Sprint 3<br/>Catracas"]
    S2 --> S4["Sprint 4<br/>Frontend"]
    S3 --> S4
    S4 --> S5["Sprint 5<br/>Gestão Usuários"]
    S5 --> S6["Sprint 6<br/>ERP"]
    S6 --> S7["Sprint 7<br/>Execution Engine"]
    S5 --> S8["Sprint 8<br/>Produção"]
    S3 --> S8
    S7 --> S8
```

> [!NOTE]
> As Sprints 6 e 7 são **co-relacionadas**: a Sprint 6 fornece a configuração de infraestrutura (ERP) que a Sprint 7 utiliza dinamicamente via código para orquestrar a sincronização de dados. A Sprint 8 é o fechamento geral.

---

## Progresso Atual

| Sprint | Status | Progresso |
|--------|--------|-----------|
| Sprint 1 | ✅ Concluído | Docker ✅ Schema ✅ RLS ✅ Auth ✅ Seed ✅ |
| Sprint 2 | ✅ Concluído | Módulos ✅ Passagens ✅ DTOs ✅ Paginação ✅ |
| Sprint 3 | ✅ Concluído | ControlId ✅ Push ✅ Monitor ✅ Online ✅ Sync ✅ |
| Sprint 4 | ✅ Concluído | Dashboard ✅ Passagens ✅ CRUDs ✅ Auth ✅ Tenant ✅ |
| Sprint 5 | ✅ Concluído | Usuários ✅ Acessos ✅ Tenant Switcher ✅ |
| Sprint 6 | ✅ Concluído | Configurações ERP ✅ Frontend ✅ Backend ✅ |
| Sprint 7 | ✅ Concluído | Rotinas ✅ Engine ✅ Sandbox ✅ Logs/Websocket ✅ |
| Sprint 8 | 🚀 Iniciado | Preparação de Hardening e Auditoria |
