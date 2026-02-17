# Implementação Técnica: Módulo ControlID Pro

Este documento fornece as especificações técnicas para a integração total dos equipamentos ControlID (Faciais, Catracas e Leitores) no OpenTurn, eliminando a necessidade de softwares intermediários como o iDSecure.

## 1. Modos de Comunicação

O OpenTurn suportará os três modos principais da ControlID, alternando conforme a configuração do equipamento.

### 1.1. Modo Standalone (Push)
O equipamento solicita comandos ao servidor periodicamente.
- **Endpoint no OpenTurn**: `GET /api/instituicao/:codigoInstituicao/hardware/controlid/push`
- **Fluxo**:
    1. O equipamento envia `GET /push?deviceId=123`.
    2. O OpenTurn consulta a tabela `CMDComandoFila` buscando registros `PENDENTE`.
    3. Responde com o comando (Ex: `{"verb": "POST", "endpoint": "create_objects", "body": "..."}`).
    4. O equipamento executa e envia o resultado para `POST /result`.

### 1.2. Modo Online (Enterprise/Pro)
A decisão de acesso é tomada em tempo real pelo OpenTurn.
- **Endpoint no OpenTurn**: `POST /api/instituicao/:codigoInstituicao/hardware/controlid/identify`
- **Fluxo**:
    1. O equipamento envia os dados da identificação (ID, Cartão ou Template).
    2. O OpenTurn valida o `PESPessoa`, `MATMatricula` e regras de acesso.
    3. Responde com a ação de liberação:
       - **Catracas**: `{"action": "catra", "parameters": "allow=direction"}`
       - **Faciais/Portas**: `{"action": "sec_box", "parameters": "id=65793=1"}`

### 1.3. Monitoramento
O equipamento notifica eventos assíncronos (giro de catraca, porta aberta forçada).
- **Endpoints**: `/api/instituicao/:codigoInstituicao/hardware/controlid/notifications/(door|catra|dao)`

## 2. Gerenciamento de Objetos

Cada registro no OpenTurn deve ser mapeado para os objetos da API ControlID.

| OpenTurn | ControlID Object | Detalhes |
| :--- | :--- | :--- |
| `PESPessoa` | `users` | `id` (inteiro), `name`, `registration` |
| `PESCartaoTag` | `cards` | Valor convertido: `(ParteA * 2^32) + ParteB` |
| `PESFotoBase64` | `user_images` | Endpoint: `/user_set_image_list.fcgi` |
| Biometria | `templates` | Base64 gerado pelo leitor USB ou Remote Enroll |

## 3. Arquitetura do Serviço (NestJS)

### 3.1. `ControlIDProvider` (Provider Pattern)
Responsável por encapsular o `axios` e gerenciar a sessão (`session`).
```typescript
class ControlIDProvider implements IHardwareProvider {
  private session: string;

  async login() {
    const res = await (this.ip + '/login.fcgi', { login, password });
    this.session = res.data.session;
  }

  // Abstração de persistência (Trata create/load/destroy)
  async syncPerson(user: HardwareUser) { ... }
}
```

### 3.2. `HardwareFactory`
Cria a instância correta com base na marca e modelo armazenados no banco.
```typescript
@Injectable()
export class HardwareService {
  instantiate(eqp: EQPEquipamento): IHardwareProvider {
    if (eqp.EQPMarca === 'ControlID') {
       return new ControlIDProvider(eqp.EQPConfig);
    }
    throw new Error('Marca não suportada');
  }
}
```

## 4. Segurança e Multi-tenant (RLS)

- **Identificação da Instituição**: Todas as URLs de Webhook/Push possuem o `:codigoInstituicao`.
- **Isolamento**: O `PrismaService` deve ser instanciado com o context de tenant antes de processar qualquer validação de acesso vinda do hardware.
- **Comandos**: A fila `CMDComandoFila` é estritamente filtrada por `INSInstituicaoCodigo`.

## 5. Captura de Biometria (Remote Enroll)

Para cadastrar digitais ou faces remotamente:
1. O usuário clica em "Capturar" no WebApp.
2. O OpenTurn envia `POST /remote_enroll.fcgi` para o IP do equipamento.
3. O equipamento entra em modo de captura.
4. O resultado (Template/Foto) é enviado via Webhook para o OpenTurn e salvo no `PESPessoa`.

---
*Este plano foi revisado com base nos exemplos oficiais de Servidor Online, Modo Push e Monitor da ControlID.*

## 6. Monitor (Modo Online)

Implementado suporte a notificações "Push" da ControlID (Monitor).
O dispositivo deve ser configurado para apontar para o servidor OpenTurn.

**Endpoints:**
- `POST /api/instituicao/:id/monitor/controlid/dao`: Notificações de objetos
- `POST /api/instituicao/:id/monitor/controlid/catra_event`: Logs de acesso (salvos em `REGRegistroPassagem`)
- `POST /api/instituicao/:id/monitor/controlid/door`: Eventos de porta
- `POST /api/instituicao/:id/monitor/controlid/operation_mode`: Mudança de modo
- `POST /api/instituicao/:id/monitor/controlid/template`: Cadastros biométricos
- `POST /api/instituicao/:id/monitor/controlid/face_template`: Cadastros faciais
- `POST /api/instituicao/:id/monitor/controlid/card`: Cadastros de cartão
- `POST /api/instituicao/:id/monitor/controlid/user_image`: Cadastros de foto (com `save=false`)

As configurações de Monitor são armazenadas no campo `INSConfigHardware` da tabela `INSInstituicao`.

**Estrutura do JSON:**
```json
{
  "controlid": {
    "monitor": {
      "ip": "192.168.1.10",
      "port": 8000,
      "path": "/api/instituicao/1/monitor/controlid"
    }
  }
}
```

- **IP do Monitor**: O endereço do servidor OpenTurn onde os dispositivos devem enviar as notificações.
- **Porta**: A porta em que o servidor está escutando.
- **Path Base**: O prefixo da URL para as notificações. Por padrão, o sistema sugere `/api/instituicao/:id/monitor/controlid`, mas pode ser alterado caso o servidor esteja atrás de um proxy reverso (Nginx/Cloudflare) que exija um caminho diferente.

---
*Este plano foi revisado com base nos exemplos oficiais de Servidor Online, Modo Push e Monitor da ControlID.*
