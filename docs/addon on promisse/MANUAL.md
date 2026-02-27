# Addon On-Premise Connector — Manual de Uso

> Guia de instalação, pareamento e operação do Connector para técnicos e administradores.

---

## 1. O que é o Connector?

O **Connector** é um pequeno aplicativo Node.js que você instala em um computador ou servidor na **rede local** do cliente. Ele cria uma "ponte" segura entre o OpenTurn (na nuvem) e os equipamentos ControlID que estão na rede interna.

**Por que preciso disso?**
- O equipamento (catraca) só é acessível pela rede local (192.168.x.x)
- O cliente **não tem IP público** ou não pode fazer port-forwarding
- O Connector faz a conexão para "fora" (outbound) — nenhuma porta precisa ser aberta no firewall

> [!NOTE]
> Se o equipamento tem IP público (acesso direto), **não é necessário** usar o Connector. No cadastro do equipamento, deixe `Usa Addon = Não`.

```
┌──────────────────────┐         WSS (outbound)         ┌──────────────────┐
│  Rede do Cliente     │ ──────────────────────────────▶ │  OpenTurn Cloud  │
│                      │                                 │                  │
│  [Connector] ──HTTP──▶ [Catraca 192.168.1.50]         │  [WS Relay]      │
│              ──HTTP──▶ [Catraca 192.168.1.51]         │  [API :8000]     │
└──────────────────────┘                                 └──────────────────┘
```

---

## 2. Requisitos

| Requisito | Mínimo |
|-----------|--------|
| **Sistema Operacional** | Windows 10+, Ubuntu 20.04+, macOS 12+ |
| **Node.js** | v20 ou superior |
| **Rede** | Acesso à internet (HTTPS/WSS na porta 443) |
| **Rede local** | Acesso HTTP aos equipamentos ControlID |

---

## 3. Instalação

### Opção A — Instalador Wizard (Windows)

Baixe o instalador `openturn-connector-setup.exe` na página de releases. O assistente irá guiá-lo pelo processo de instalação e configuração do pareamento.

### Opção B — Script de Instalação (Linux)

Execute o comando abaixo no terminal:

```bash
curl -sSL https://openturn.com.br/install-connector.sh | sudo bash
```

### Opção C — npm global (avançado)

```bash
npm install -g @openturn/connector
```

### Opção D — Download direto

Baixe o executável na [página de releases](https://github.com/openturn/connector/releases) e extraia.

### Verificar instalação

```bash
openturn-connector --version
# Saída: @openturn/connector v1.0.0
```

---

## 4. Pareamento

O pareamento conecta o Connector à sua instituição no OpenTurn.

### Passo 1 — Gerar código de pareamento (no OpenTurn)

1. Acesse o OpenTurn no navegador
2. Vá para: **Configurações → Instituição → [Sua Instituição]**
3. Na seção **"Connector On-Premise (Addon)"**, clique em **"Gerar Código de Pareamento"**
4. Copie o **código de pareamento** (token temporário válido por 15 minutos)

> O pareamento é **1:1** — cada instituição tem exatamente 1 Connector, e cada Connector atende 1 instituição.

### Passo 2 — Parear no terminal

```bash
openturn-connector pair
```

O wizard interativo vai pedir:
1. **URL do servidor**: `https://seu-dominio.com` (ou `http://localhost:8000` em dev)
2. **Código de pareamento**: cole o código gerado no passo anterior
3. **Nome do Connector**: ex: "Servidor Portaria Campus A"

```
✔ Conectado ao OpenTurn
✔ Pareamento concluído!
✔ Configuração salva em: ~/.openturn-connector/config.json

Para iniciar o Connector:
  openturn-connector start
```

---

## 5. Operação

### Iniciar o Connector

```bash
openturn-connector start
```

Saída esperada:
```
[2026-02-18 10:00:00] INFO  Connector v1.0.0 iniciando...
[2026-02-18 10:00:01] INFO  Conectado ao WS Relay (wss://seu-dominio.com/ws/connectors)
[2026-02-18 10:00:01] INFO  Status: ONLINE
[2026-02-18 10:00:01] INFO  Health: http://localhost:22100/health
```

### Verificar status

```bash
openturn-connector status
```

```
Connector: Servidor Portaria Campus A
Status:    ONLINE
Uptime:    2h 15m
Relay:     wss://seu-dominio.com/ws/connectors
Requests:  142 processados
Erros:     0
```

### Verificar saúde (HTTP)

```bash
curl http://localhost:22100/health
```

```json
{
  "status": "healthy",
  "version": "1.0.0",
  "uptime": "2h 15m",
  "wsConnected": true,
  "lastPing": "2026-02-18T12:14:55Z"
}
```

### Executar como serviço (produção)

#### Linux (systemd)

```bash
sudo tee /etc/systemd/system/openturn-connector.service << EOF
[Unit]
Description=OpenTurn Connector
After=network.target

[Service]
Type=simple
User=openturn
ExecStart=/usr/bin/openturn-connector start
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable openturn-connector
sudo systemctl start openturn-connector
```

#### pm2 (alternativa multiplataforma)

```bash
npm install -g pm2
pm2 start openturn-connector -- start
pm2 save
pm2 startup
```

#### Windows (NSSM)

```powershell
nssm install OpenTurnConnector "C:\Program Files\nodejs\openturn-connector.cmd" start
nssm set OpenTurnConnector AppDirectory "C:\Users\admin"
nssm start OpenTurnConnector
```

---

## 6. Cadastro do Equipamento com Addon

No OpenTurn, ao cadastrar ou editar um equipamento:

1. Ative o toggle **"Usa Addon"** (`EQPUsaAddon = true`)
2. Preencha o **IP local** do equipamento (ex: `192.168.1.50`)
3. Salve

Com `Usa Addon = Sim`:
- O botão **"Gerenciar Remotamente"** aparece no **header da página de configuração** do equipamento (alinhado à direita)
- Chamadas de API passam pelo Connector via WS Relay
- O Connector precisa estar **ONLINE** para funcionar

Com `Usa Addon = Não`:
- Acesso direto ao IP do equipamento (requer IP público / port-forwarding)
- O botão "Gerenciar Remotamente" não aparece
- Comportamento padrão do sistema

---

## 7. Usando no OpenTurn

### 7.1 Proxy API (chamadas ao equipamento)

Após o Connector estar online e o equipamento com `Usa Addon = Sim`:

1. Acesse o equipamento: **Instituição → Equipamentos → [Equipamento]**
2. Na aba **"API"**, clique em **"Enviar Comando"**
3. Preencha o comando desejado (ex: sincronizar usuários)
4. O OpenTurn envia via Connector → equipamento responde

### 7.2 Interface Remota (UI Web do equipamento)

1. Acesse o equipamento: **Instituição → Equipamentos → [Equipamento] → Configuração**
2. No header da página, clique no botão **"Gerenciar Remotamente"** (alinhado à direita, ao lado do nome do equipamento)
3. Uma sessão temporária é criada (válida por 10 minutos)
4. O navegador redireciona para `/remote/s/{sessionId}/`
5. A interface web do equipamento aparece como se você estivesse na rede local

> [!IMPORTANT]
> A sessão expira automaticamente após 10 minutos de inatividade. Clique em "Renovar" na toolbar para estender.

### 7.3 Toolbar da Sessão Remota

Na parte superior da UI espelhada, aparece uma barra com:

| Botão | Função |
|-------|--------|
| **← Voltar** | Retorna para a tela do equipamento no OpenTurn |
| **⟳ Recarregar** | Recarrega a página do equipamento |
| **⏱ Tempo** | Tempo restante da sessão |
| **✕ Encerrar** | Finaliza a sessão e retorna |

---

## 8. Gestão do Connector (Configurações da Instituição)

A gestão do Connector é feita nas **Configurações da Instituição** (`Configurações → Instituição → [ID]`):

| Ação | Descrição |
|------|-----------|
| **Ver Status** | 🟢 Online / 🔴 Offline + versão + último heartbeat |
| **Gerar Código** | Gera token temporário (15 min) para parear o Connector |
| **Renovar Token** | Gera novo JWT para o Connector existente |
| **Desparear** | Remove o Connector da instituição |

---

## 9. Configuração

### Arquivo de configuração

Local: `~/.openturn-connector/config.json`

```json
{
  "connectorId": 5,
  "name": "Servidor Portaria Campus A",
  "serverUrl": "https://seu-dominio.com",
  "wsUrl": "wss://seu-dominio.com/ws/connectors",
  "token": "eyJhbGciOiJSUzI1NiIs...",
  "healthPort": 22100,
  "logLevel": "info",
  "logFile": "~/.openturn-connector/logs/connector.log"
}
```

### Variáveis de ambiente (alternativa)

| Variável | Descrição | Padrão |
|----------|-----------|--------|
| `OPENTURN_SERVER_URL` | URL do servidor | — |
| `OPENTURN_WS_URL` | URL do WebSocket | — |
| `OPENTURN_TOKEN` | JWT do Connector | — |
| `OPENTURN_HEALTH_PORT` | Porta do health check | `22100` |
| `OPENTURN_LOG_LEVEL` | Nível de log (`debug`, `info`, `warn`, `error`) | `info` |

---

## 10. Troubleshooting

### Connector não conecta

| Sintoma | Causa Provável | Solução |
|---------|---------------|---------|
| `ECONNREFUSED` | Firewall bloqueando saída 443 | Liberar HTTPS/WSS outbound |
| `401 Unauthorized` | Token expirado | Renovar token nas configurações da instituição + re-parear |
| `ENOTFOUND` | DNS não resolve | Verificar rede/DNS |
| Desconecta frequentemente | Instabilidade de rede | Verificar link de internet |

### Equipamento não responde

| Sintoma | Causa Provável | Solução |
|---------|---------------|---------|
| `ECONNREFUSED` na porta 80 | Equipamento desligado ou IP errado | Verificar IP no cadastro |
| Timeout | Equipamento travado | Reiniciar equipamento |
| `401` do equipamento | Credenciais inválidas | Atualizar login/senha no cadastro |

### Verificar logs

```bash
# Últimas 50 linhas
tail -50 ~/.openturn-connector/logs/connector.log

# Acompanhar em tempo real
tail -f ~/.openturn-connector/logs/connector.log
```

---

## 11. Perguntas Frequentes

**P: Preciso abrir alguma porta no firewall?**  
R: Não. O Connector faz conexão de saída (outbound) na porta 443 (HTTPS/WSS).

**P: O que acontece se a internet cair?**  
R: O Connector reconecta automaticamente quando a internet volta. As catracas continuam operando normalmente em modo standalone/offline.

**P: Posso instalar vários Connectors na mesma rede?**  
R: A relação é 1:1 — cada instituição tem exatamente 1 Connector. Se o mesmo cliente tem múltiplas instituições, cada uma precisará de seu próprio Connector instalado (podem rodar na mesma máquina em portas health diferentes).

**P: O Connector consome muitos recursos?**  
R: Não. Ele usa ~50MB de RAM e CPU insignificante quando idle.

**P: Como atualizar o Connector?**  
R: `npm update -g @openturn/connector` e reinicie o serviço.

**P: Os dados passam pela nuvem?**  
R: Sim. Toda comunicação entre o SaaS e o equipamento passa pelo WS Relay na nuvem. Os dados são criptografados via TLS/WSS.

**P: O que é o campo "Usa Addon" no equipamento?**  
R: É um toggle que indica se o equipamento será acessado via Connector (redes sem IP público) ou diretamente (IP público).
