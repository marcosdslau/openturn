# Addon On-Premise Connector — INDEX

> Índice dos documentos de planejamento do Addon On-Premise Connector para o OpenTurn.

---

## Documentos

| Documento | Descrição |
|-----------|-----------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Arquitetura técnica completa: componentes, protocolo WS, modelo de dados, segurança |
| [IMPLEMENTATION-PLAN.md](./IMPLEMENTATION-PLAN.md) | Plano de sprints (9-12) com user stories, tarefas e critérios de aceite |
| [MANUAL.md](./MANUAL.md) | Manual de uso: instalação, pareamento e operação do Connector |
| [NGINX-CONFIG.md](./NGINX-CONFIG.md) | Configurações NGINX para dev e produção |

---

## Resumo do Addon

O **Addon On-Premise Connector** resolve o problema de clientes sem IP público que precisam operar equipamentos ControlID em modo Standalone/Offline. O sistema consiste em:

1. **Connector** — App Node.js instalado na rede local do cliente (conexão WSS outbound, relação **1:1 com instituição**)
2. **WS Relay** — Gateway WebSocket no VPS que mantém conexões com Connectors
3. **Remote UI Gateway** — Reverse-proxy L7 que espelha a UI do equipamento (sem iframe)
4. **Backend API** — Endpoints tenant-scoped sob `/api/instituicao/:tid/connector/*` e `/api/instituicao/:tid/equipamento/:eid/proxy-http`
5. **Frontend** — Pareamento/token/status do Connector nas **configurações da instituição** + botão "Gerenciar Remotamente" no **header da configuração do equipamento** (alinhado à direita, condicional `EQPUsaAddon`)

### Portas

| Serviço | Porta |
|---------|-------|
| Backend API (NestJS) | `:8000` |
| WS Relay | `:8001` |
| Remote UI Gateway | `:8002` |
| Frontend (Next.js) | `:3000` |

### Sprints

| Sprint | Foco | Duração |
|--------|------|---------|
| Sprint 9 (próxima) | Fundação: DB + WS Relay + Proxy HTTP | 2 semanas |
| Sprint 10 | Connector Node.js (addon instalável) | 2 semanas |
| Sprint 11 | Remote UI Gateway + Sessões | 2 semanas |
| Sprint 12 | Frontend + NGINX + Polish | 2 semanas |

> Sprint 9 é a próxima sprint. Sprints 10 e 11 podem executar em paralelo. Sprint 8 (hardening) roda em paralelo.


---

*Última atualização: 2026-02-17*
