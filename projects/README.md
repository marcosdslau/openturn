# Projetos On-Premise — Configuração do Token do Connector

Este guia explica como **incluir ou trocar o token JWT** do **Addon Connector** (SchoolGuard) em um cliente já instalado — **sem precisar reinstalar** o aplicativo.

O Connector é o programa que roda na rede local do cliente e faz a ponte segura entre os equipamentos (catracas ControlID) e o OpenTurn/SchoolGuard na nuvem.

---

## Antes de começar

### 1. Gerar o token no painel

1. Acesse o OpenTurn/SchoolGuard no navegador.
2. Vá em **Configurações → Instituição → [Sua Instituição]**.
3. Na seção **Connector On-Premise (Addon)**, clique em:
   - **Gerar Código de Pareamento** — primeira instalação, ou
   - **Renovar Token** — quando o token atual expirou ou precisa ser trocado.
4. Copie o **token JWT** gerado (válido por tempo limitado — use logo em seguida).

### 2. Anote a URL do Relay

Na maioria dos ambientes de produção:

```
wss://admin.schoolguard.com.br/ws/connectors
```

Use a URL informada pelo painel se for diferente.

### 3. Onde o token fica salvo

O instalador **não embute** o token no executável. Ele grava um arquivo separado:

| Sistema   | Caminho do arquivo                          |
|-----------|---------------------------------------------|
| Windows   | `C:\ProgramData\SchoolGuard\config.json`    |
| Linux     | `~/.openturn-connector/config.json`         |

Exemplo de conteúdo:

```json
{
  "relayUrl": "wss://admin.schoolguard.com.br/ws/connectors",
  "token": "eyJhbGciOiJSUzI1NiIs..."
}
```

> **Importante:** depois de alterar o token (por qualquer opção abaixo), é necessário **reiniciar o serviço** para o Connector passar a usar o valor novo.

---

## Opção 1 — Comando `pair` (recomendado)

Use esta opção quando tiver acesso ao terminal/servidor onde o Connector está instalado. O comando valida os campos e grava o `config.json` automaticamente.

### Windows

Abra **PowerShell** ou **Prompt de Comando como Administrador**:

```powershell
cd "C:\Program Files\SchoolGuard"

.\node.exe .\index.js pair --token "SEU_TOKEN_JWT_AQUI" --url "wss://admin.schoolguard.com.br/ws/connectors"
```

Reinicie o serviço:

```powershell
Restart-Service SchoolGuard
```

Saída esperada após o `pair`:

```
Configuration saved to C:\ProgramData\SchoolGuard\config.json
Pairing successful (non-interactive)! Configuration saved.
```

### Linux

```bash
sudo /usr/local/bin/openturn-node /usr/local/lib/openturn-connector/index.js pair \
  --token "SEU_TOKEN_JWT_AQUI" \
  --url "wss://admin.schoolguard.com.br/ws/connectors"

sudo systemctl restart openturn-connector
```

### Modo interativo (sem parâmetros)

Se preferir um assistente no terminal, rode apenas `pair` sem argumentos:

```powershell
# Windows
cd "C:\Program Files\SchoolGuard"
.\node.exe .\index.js pair
```

```bash
# Linux
sudo /usr/local/bin/openturn-node /usr/local/lib/openturn-connector/index.js pair
```

O wizard pedirá a **URL do Relay** e o **Token JWT**.

### Quando usar a Opção 1

- Primeira configuração após instalação.
- Troca de token por expiração ou renovação no painel.
- Ambiente em que você tem acesso remoto ou local ao servidor.

---

## Opção 2 — Editar o arquivo `config.json` manualmente

Use esta opção quando não conseguir executar o comando `pair`, mas tiver acesso ao arquivo de configuração (RDP, compartilhamento de pasta, SSH, etc.).

### Passo a passo

1. **Pare o serviço** (evita que o arquivo seja sobrescrito enquanto edita):

   ```powershell
   # Windows
   Stop-Service SchoolGuard
   ```

   ```bash
   # Linux
   sudo systemctl stop openturn-connector
   ```

2. **Abra o arquivo** no caminho indicado na tabela acima.

3. **Altere ou inclua** os campos `token` e `relayUrl`:

   ```json
   {
     "relayUrl": "wss://admin.schoolguard.com.br/ws/connectors",
     "token": "COLE_O_NOVO_TOKEN_JWT_AQUI"
   }
   ```

   - Mantenha o JSON válido (aspas duplas, vírgulas corretas).
   - Não adicione espaços ou quebras de linha dentro do token.

4. **Salve o arquivo**.

5. **Inicie o serviço novamente**:

   ```powershell
   # Windows
   Start-Service SchoolGuard
   ```

   ```bash
   # Linux
   sudo systemctl start openturn-connector
   ```

### Quando usar a Opção 2

- Acesso apenas ao arquivo de configuração, sem terminal completo.
- Automação por script de deploy que escreve o JSON diretamente.
- Troubleshooting quando o comando `pair` não está disponível no PATH.

---

## Verificar se funcionou

### 1. Comando `status`

```powershell
# Windows
cd "C:\Program Files\SchoolGuard"
.\node.exe .\index.js status
```

```bash
# Linux
sudo /usr/local/bin/openturn-node /usr/local/lib/openturn-connector/index.js status
```

Saída esperada:

```
--- OpenTurn Connector Status ---
Relay URL: wss://admin.schoolguard.com.br/ws/connectors
Paired:    YES
Token:     eyJhbGciOi...xxxxxxxxxx
--------------------------------
```

### 2. Painel OpenTurn/SchoolGuard

Em **Configurações → Instituição → Connector On-Premise**, o status deve aparecer como **Online** alguns segundos após reiniciar o serviço.

### 3. Serviço em execução

```powershell
# Windows
Get-Service SchoolGuard
```

```bash
# Linux
sudo systemctl status openturn-connector
```

---

## Resumo rápido

| Etapa | Opção 1 (`pair`) | Opção 2 (arquivo) |
|-------|------------------|-------------------|
| Gerar token no painel | Sim | Sim |
| Alterar configuração | Comando `pair` | Editar `config.json` |
| Reiniciar serviço | Obrigatório | Obrigatório |
| Reinstalar aplicativo | **Não** | **Não** |

---

## Problemas comuns

| Sintoma | Causa provável | O que fazer |
|---------|----------------|-------------|
| `401 Unauthorized` no log | Token expirado ou inválido | Gerar novo token no painel e repetir Opção 1 ou 2 |
| `Paired: NO` no `status` | `config.json` sem token ou corrompido | Refazer pareamento ou corrigir o JSON |
| Serviço não sobe após editar JSON | JSON inválido (vírgula, aspas) | Validar o arquivo e corrigir a sintaxe |
| Painel continua Offline | Serviço não reiniciado | `Restart-Service SchoolGuard` ou `systemctl restart` |
| Token copiado com espaço extra | Colar incompleto no terminal/arquivo | Copiar novamente do painel, sem espaços |

---

## Referência de caminhos (instalação padrão)

| Item | Windows | Linux |
|------|---------|-------|
| Binários | `C:\Program Files\SchoolGuard\` | `/usr/local/lib/openturn-connector/` |
| Node embarcado | `C:\Program Files\SchoolGuard\node.exe` | `/usr/local/bin/openturn-node` |
| Config | `C:\ProgramData\SchoolGuard\config.json` | `~/.openturn-connector/config.json` |
| Nome do serviço | `SchoolGuard` | `openturn-connector` |

---

## Projetos nesta pasta

| Pasta | Descrição |
|-------|-----------|
| [`addon/`](addon/) | Connector on-premise (CLI `pair`, `start`, `status`) |
| [`remote-ui-gateway/`](remote-ui-gateway/) | Gateway de interface remota dos equipamentos |

Para detalhes de arquitetura e desenvolvimento, consulte também [`docs/addon on promisse/MANUAL.md`](../docs/addon%20on%20promisse/MANUAL.md).
