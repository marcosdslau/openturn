# Guia de Configuração e Testes - Addon Connector

Este guia descreve como configurar e testar todo o ecossistema do Addon Connector (On-Premise) em ambiente de desenvolvimento local.

## 🏗️ Arquitetura Local

Para o funcionamento completo, você precisa rodar:
1.  **WebAPI** (`webapi`): Backend principal e WebSocket Relay (`:8000` / `:8001`).
2.  **Webapp** (`webapp`): Interface administrativa (`:3000`).
3.  **Remote UI Gateway** (`projects/remote-ui-gateway`): Proxy para a interface dos equipamentos (`:8002`).
4.  **Addon Connector** (`projects/addon`): O agente que roda na rede local.

---

## 🔌 Testando SEM NGINX (Acesso Direto)

Se você não quiser configurar o NGINX localmente, pode apontar os serviços diretamente para as portas uns dos outros.

### Exemplo de Configuração Direta:

1.  **Addon Connector**: 
    - No arquivo `.env` do addon ou no `pair`, use a porta direta do Relay na WebAPI:
    - `RELAY_URL=ws://localhost:8001/ws/connectors`

2.  **Remote UI Gateway**:
    - No arquivo `.env` do gateway (`projects/remote-ui-gateway`), aponte para a porta interna do Relay:
    - `RELAY_WS_URL=ws://localhost:8001/ws/connectors`

3.  **Acesso à UI do Equipamento**:
    - Em vez de usar `http://openturn.local/remote/...`, você acessará diretamente pela porta do Gateway:
    - `http://localhost:8002/remote/...`

### Onde configurar as URLs no Webapp?
Se você está rodando o Webapp via `npm run dev` (porta 3000), certifique-se que o seu arquivo `.env.local` na raiz do `/webapp` aponta para a WebAPI correta:
```env
NEXT_PUBLIC_API_URL=http://localhost:8000/api
```

---

## 🧪 Roteiro de Teste Local (End-to-End)

### 1. Inicie os Serviços
Abra 4 terminais e inicie os serviços:

- **Terminal 1 (WebAPI)**: `npm run start:dev` em `/webapi` (Porta 8000/8001)
- **Terminal 2 (Webapp)**: `npm run dev` em `/webapp` (Porta 3000)
- **Terminal 3 (Remote Gateway)**: `npm run dev` em `/projects/remote-ui-gateway` (Porta 8002)
- **Terminal 4 (Addon)**: `npm run dev` em `/projects/addon` (O agente que se conecta ao Relay)

### 2. Gerar Pareamento no Webapp
1.  Acesse `http://localhost:3000`.
2.  Vá em **Configurações -> Instituições** e selecione a instituição.
3.  No card **Connector On-Premise**, clique em **"+ Parear Connector"**.
4.  Dê um nome (ex: "Local Test") e **copie o Token resultante**.

### 3. Conectar o Addon
1.  No Terminal do `projects/addon`, rode `npx . pair`.
2.  Cole o Token e confirme a URL (`ws://localhost:8001/ws/connectors`).
3.  Inicie o connector: `npx . start`.
4.  No Webapp, o status deve mudar para **ONLINE** (bolinha verde).

### 4. Testar Acesso Remoto
1.  Vá em **Equipamentos** -> Selecione um equipamento.
2.  Em **Configuração**, ative a opção **"Usa Addon"** e Salve.
3.  Ao atualizar a página, aparecerá o botão **"🖥️ Gerenciar Remotamente"**.
4.  Clique no botão. Ele abrirá uma nova aba. Se você não estiver usando NGINX, a URL pode vir como `openturn.local`, você pode simplesmente trocar no navegador para `localhost:8002` para testar o bypass.

---

## 💡 Dicas de Debug
- **Logs do Relay**: No console da WebAPI, procure por `WsRelayGateway`.
- **Logs do Connector**: O connector exibe logs detalhados via `pino-pretty` no console.
- **Portas**: 
    - `8000`: WebAPI (HTTP)
    - `8001`: WebAPI (WebSocket Relay)
    - `8002`: Remote UI Gateway (HTTP)
    - `3000`: Webapp (Frontend)
