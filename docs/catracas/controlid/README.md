# Introdução
Esta documentação tem a finalidade de facilitar o processo de integração aos equipamentos da linha de controle de acesso da ControliD.

Aqui é descrito como realizar a comunicação através de sua API, como realizar operações desde o cadastro de usuários até identificação ou consulta a registros, além de estarem inclusos exemplos de requisições e respostas para cada operação apresentada.

Os dispositivos de acesso da Control iD oferecem uma interface de comunicação moderna por API (Application Programming Interface) baseada em TCP/IP (Ethernet) com uma arquitetura REST. Isso torna a integração simples e independente de sistema operacional ou linguagem de programação utilizados.

São oferecidos dois modos de funcionamento para a API: Autônomo (Standalone) e Online (Pro ou Enterprise), todos em API REST.

## Exemplos de código e requisições
No repositório GitHub da Control iD estão disponíveis exemplos de código nas linguagens:

C#
Delphi
Java
NodeJS
Python
Exemplos de código: https://github.com/controlid/integracao/tree/master/Controle%20de%20Acesso

A maior parte dos exemplos dessa documentação foram escritos em JavaScript, utilizando a biblioteca jQuery. Para testá-los, acesse o endereço IP do equipamento em um navegador web e use as ferramentas do desenvolvedor (developer tools) deste para realizar requisições.

Todos os exemplos fornecidos podem ser verificados copiando seus códigos e colando no console das ferramentas de desenvolvimento. Além disso, muitos exemplos de requisições estão disponíveis em nossa coleção compartilhada através do Postman:

Exemplos de requisições HTTP: https://documenter.getpostman.com/view/10800185/SztHW4xo

## Modos de operação
As interações possíveis entre servidor e terminal de controle de acesso dependem do modo de operação em que este deverá funcionar. Os três modos de operação descritos em Introdução aos Modos de Operação podem ser divididos em duas categorias: autônomo (standalone) ou online.

Equipamento autônomo:

Modo Standalone: identificação e autorização no terminal (recomendado)
Equipamento online:

Modo Pro: identificação no terminal e autorização no servidor
Modo Enterprise: identificação e autorização no servidor
Em uma solução desenvolvida para terminais em modo de operação autônomo a comunicação se dará unilateralmente do servidor para cada terminal e deve se preocupar em manter os dados de usuários e regras de acesso atualizados.

Já quando a solução é desenvolvida utilizando terminais em algum dos modos de operação online, a comunicação ocorre em ambos os sentidos, pois a lógica dos processos de autorização e identificação estará no servidor ou parcialmente no servidor.

As requisições enviadas pelo equipamento quando está em algum modo online são descritas em Eventos de Identificação Online

## Monitor
Em todos os modos de operação descritos acima, para se monitorar eventos assíncronos emitidos pelo equipamento, será necessário utilizar os serviços disponibilizados pelo Monitor.

Os eventos assíncronos monitoráveis incluem: alteração nos logs de acesso e logs de alarme, cadastro remoto de credenciais de acesso, giros de catraca, abertura de portas e mudanças no modo de operação (ex. entrar e sair em operação padrão ou contingência).

As requisições enviadas pelo equipamento a partir do Monitor são descritas em Introdução ao Monitor.

## Push
Nesse mecanismo proativo de comunicação, o equipamento envia periodicamente requisições HTTP ao servidor em busca de comandos a serem executados.

Quando não há nada a ser feito pelo equipamento, o servidor deve enviar uma resposta vazia. Caso contrário, o servidor deve responder o comando a ser realizado e os parâmetros correspondentes.

Após o equipamento executar o comando lido do servidor, ele envia nova requisição contendo o resultado da operação. A esta requisição é esperada uma resposta vazia, que encerra a atividade até a próxima busca.

![alt text](https://www.controlid.com.br/docs/access-api-pt/img/modo_push.png)

As requisições enviadas pelo equipamento bem como as respostas para comandos Push são descritas em Introdução ao Push.

## Diagrama de Sequência
A API de dados da linha Acesso permite a incorporação de funções normalmente executadas no próprio equipamento em seu próprio site ou aplicativo. A lista abaixo identifica alguns dos diferentes tipos de funções que você pode utilizar usando a API. Esta API usa o protocolo HTTP para a transferência de dados - arquitetura REST. Cada comando é uma chamada HTTP POST com Content-Type application/json e possui uma URL própria. Seus parâmetros e seus retornos são passados preferencialmente por JSON, exceto em menção contrária.

Esse diagrama demonstra de forma simples o fluxo de requisições realizadas ao equipamento. O exemplo abaixo mostra o processo de liberação do relê 1, para mais informações sobre os objetos, consulte lista de objects.

Fluxo de Request/Response com os equipamentos
![alt text](https://www.controlid.com.br/docs/access-api-pt/img/diagrama_sequencia.png)

## Realizar login
O login é o primeiro método que deve ser utilizado pois ele é responsável por gerar a sessão que será utilizada em todas as requisições para o dispositivo. Neste exemplo, a requisição irá criar a sessão e armazená-la na variável session.

Como exemplo, o comando login pode possuir a URL:

http://192.168.0.129/login.fcgi
e os seguintes parâmetros:

```json
{
    "login": "admin",
    "password": "admin"
}
```
O retorno do método de login é um json como o exemplo abaixo:

```json
{
    "session": "apx7NM2CErTcvXpuvExuzaZ"
}
```
Os seguintes requisitos aplicam-se as solicitações de dados da API da linha Acesso:

Todos os comandos requerem uma sessão válida, exceto session_is_valid e login. Essa sessão deve ser reaproveitada para todas as requisições que você realizar para o equipamento.

O corpo da requisição deve possuir a codificação UTF-8. Caso os caracteres enviados não possuam nenhum caractere especial (ASCII), o corpo da requisição não precisa ser codificado.

Por padrão, a codificação utilizada por sistemas Windows é a Windows-1252 (também conhecida como CP-1252). Verificar como utilizar a codificação correta.

### Exemplo de login em JavaScript
O exemplo abaixo pode ser usados para a familiarização utilizando as ferramentas de desenvolvedor - developer tools - do navegador:

```javascript
$.ajax({
  url: "/login.fcgi",
  type: 'POST',
  contentType: 'application/json',
  data: JSON.stringify({
      login: 'admin',
      password: 'admin'
  }),
  success: function(data) {
      session = data.session;
  }
});
```
Para maiores detalhes sobre login, favor verificar o tópico GERENCIAMENTO SESSÃO.

Segue abaixo alguns exemplos que ilustram como a API pode ser usada em outras linguagens de programação. Nesses exemplos, o endereço 192.168.0.129, quando aparecer, representa o endereço IP do equipamento.

Atenção: a opção HTTP "Expect: 100- continue" deve estar desabilitada para as chamadas funcionarem. O único dos exemplos abaixo que o faz explicitamente é o em C#. Por favor, verifique a necessidade de fazê-lo em sua linguagem de preferência.


### Exemplo de login em C#
```csharp
System.Net.ServicePointManager.Expect100Continue = false;
try
{
  var request = (HttpWebRequest)WebRequest.Create("http://192.168.0.129/login.fcgi");
  request.ContentType = "application/json";
  request.Method = "POST";

  using (var streamWriter = new StreamWriter(request.GetRequestStream()))
  {
    streamWriter.Write("{\"login\":\"admin\",\"password\":\"admin\"}");
  }

  var response = (HttpWebResponse)request.GetResponse();
  using (var streamReader = new StreamReader(response.GetResponseStream()))
  {
    Console.WriteLine(streamReader.ReadToEnd());
  }
}
catch (WebException e)
{
  using (WebResponse response = e.Response)
  {
    HttpWebResponse httpResponse = (HttpWebResponse)response;
    Console.WriteLine("Error code: {0}", httpResponse.StatusCode);
    using (Stream data = response.GetResponseStream())
    using (var reader = new StreamReader(data))
    {
      string text = reader.ReadToEnd();
      Console.WriteLine(text);
    }
  }
}
```
### Exemplo de login em C# c/ RestSharp
Para o desenvolvimento do exemplo está sendo utilizado a biblioteca RestSharp.

```csharp
using System;
using RestSharp;
namespace ExampleToDevelopment
{
    class Program
    {
        public string Session()
        {
            var client = new RestClient("http://192.168.2.183/login.fcgi");
            var request = new RestRequest(Method.POST);
            request.AddHeader("content-type", "application/json");
            request.AddParameter("application/json", "{\"login\": \"admin\", \"password\": \"admin\"}", ParameterType.RequestBody);
            IRestResponse response = client.Execute(request);
            return response.Content;
        }
    }
}
```


## Cadastrar usuários e suas regras
Este tópico descreve como criar as regras de acesso que serão usadas pelo equipamento após uma tentativa de acesso dos modos possíveis (via leitor biométrico, cartão de proximidade, id e senha, etc). Note que estas regras de acesso aplicam-se somente quando o dispositivo estiver em modo standalone, pois ao operar em algum modo online as regras de acesso deverão ser gerenciadas pelo próprio servidor de acesso* (exceto quando o dispositivo entrar em modo de contingência após falhas na comunicação com o servidor de acesso).

Um mesmo usuário pode possuir diversas regras de acesso de forma direta e indireta. Regras de acesso diretas, são aquelas que são vinculadas diretamente ao usuário e regras de acesso indiretas são aquelas que são aplicadas ao usuário pelo fato do mesmo estar presente em um determinado grupo de acesso, como exemplo um departamento.

Para criar uma regra de acesso indireta, ou seja, criar um grupo de usuários e atribuir regras de acesso para esse grupo, será necessário seguir as etapas abaixo, e este é o fluxo de trabalho recomendado em aplicações de controle de acesso:

Criar objetos do tipo users (usuários) conforme descrito neste exemplo.

Criar objetos do tipo groups (grupos) conforme descrito neste exemplo.

Criar objetos do tipo user_groups (grupos de usuário), para adicionar o usuário a um grupo, conforme descrito neste exemplo.

Criar objetos do tipo access_rules (regras de acesso) conforme descrito neste exemplo.

Criar objetos do tipo group_access_rules (regras de acesso --> grupo), que são responsáveis de vincular os objetos groups com os objetos access_rules, conforme descrito neste exemplo.

Por fim, será necessário definir os intervalos de horário no qual a regra de acesso será válida, isso deverá ser feito através das três etapas descritas abaixo:

Criar objetos do tipo time_zones (horários), um horário pode conter vários intervalos. Como criar objetos deste tipo está descrito neste exemplo.

Criar objetos do tipo time_spans (intervalos), estes objetos contém os intervalos de tempo, dias da semana e feriados que podem ser vinculados a um horário. Como criar objetos deste tipo está descrito neste exemplo.

Criar objetos do tipo access_rule_time_zones (regras de acesso -> horários), que são responsáveis de vincular os objetos time_zones com os objetos access_rules, conforme descrito neste exemplo.

Para casos especiais, também é possível criar uma regra de acesso direta, ou seja, uma regra exclusiva para um usuário, no entanto isto não é recomendado e deve ser usado apenas para tratar exceções, se este for o caso basta seguir os passos abaixo:

Criar objetos do tipo users (usuários) conforme descrito neste exemplo.

Criar objetos do tipo access_rules (regras de acesso) conforme descrito neste exemplo.

E por fim criar objetos do tipo user_access_rules (regras de acesso --> usuário), que são responsáveis de vincular os objetos users com os objetos access_rules, conforme descrito neste exemplo.

Em ambos os casos acima (regra de acesso direta e indireta), após criar as regras de acesso, será necessário vinculá-las a um portal para indicar qual porta deverá ser aberta quando a regra de acesso for atendida.

Para consultar os portais existentes em um determinado produto da linha de acesso, pode ser utilizado este exemplo.

Por fim, para definir qual porta será aberta quando a regra de acesso for atendida, criar um objetos do tipo portal_access_rules conforme descrito neste exemplo.

### Exemplos
Os exemplos descritos abaixo são apenas uma fração dos contidos nesta documentação, e exemplos em diferentes linguagens também pode ser encontrados em nosso repositório no GitHub: https://github.com/controlid/integracao/tree/master/Controle%20de%20Acesso

#### Coletar logs
O método load_objects é utilizado para coletar informações do dispositivo, nesse exemplo ele foi utilizado para coletar os logs de acesso que estavam armazenados no equipamento.

##### Exemplo NodeJS
Para o desenvolvimento do exemplo está sendo utilizado o módulo Request.

```javascript
var request = require("request");
var options = { 
method: 'POST',
url: 'http://192.168.2.183/load_objects.fcgi',
headers: 
{ 
  cookie: 'session=QnnlmLcEBCE06mwKkh/7SOEM',
  'content-type': 'application/json' 
},
body: 
{ 
  object: 'access_logs'
},
json: true 
};
request(options, function (error, response, body) {
  if (error) throw new Error(error);
      console.log(body);
});
```
#### Acionar relê
O método execute_actions é responsável por realizar a execução de comandos no dispositivo, neste exemplo ele foi utilizado para abrir a porta ao liberar o relê 1. O exemplo abaixo não é aplicável para o iDFlex, iDBlock, iDAccess Pro e iDAccess Nano, porque para estes produtos os parâmetros são diferentes.

Para o desenvolvimento do exemplo está sendo utilizado o módulo request.

```javascript
var request = require("request");
var options = { 
method: 'POST',
url: 'http://192.168.2.183/execute_actions',
headers: 
{ 
  cookie: 'session=QnnlmLcEBCE06mwKkh/7SOEM',
  'content-type': 'application/json'
},
body: 
{
  "actions": [ { "action": "door", "parameters": "door=1" } ]
},
json: true
};
request(options, function (error, response, body) {
  if (error) throw new Error(error);
    console.log(body);
});
```


## Particularidade Terminais Control iD
A API descrita nesta documentação aplicasse a todos os dispositivos de controle de acesso da Control iD, portanto, algumas das funções aqui descritas serão aplicáveis apenas para alguns produtos. Este tópico visa descrever de forma geral as particularidades de cada produto, o que não for particularidade de alguma produto, será aplicável para todos os demais.

### iDAccess e iDFit
Nestes produtos, a ação para se abrir as portas é "door". Maiores detalhes em Abertura Remota Porta e Catraca. O evento gerado pelo monitor para reportar que a porta foi aberta será notificado no endpoint hostname:port/api/notifications/door

### iDBlock
Neste produto, a ação para se liberar o giro da catraca para um dos lados é "catra". Maiores detalhes em Abertura Remota Porta e Catraca. O evento gerado pelo monitor para reportar giro na catraca será notificado no endpoint hostname:port/api/notifications/catra_event

### iDBox
Neste produto, a ação para se abrir as portas é "door" e o mesmo possui 4 (quatro) portais no total. Maiores detalhes em Abertura Remota Porta e Catraca. O evento gerado pelo monitor para reportar que a porta foi aberta será notificado no endpoint hostname:port/api/notifications/door

### iDFlex, iDAccess Pro e iDAccess Nano
Nestes produtos, a ação para se abrir as portas é "sec_box". Maiores detalhes em Abertura Remota Porta e Catraca. O evento gerado pelo monitor para reportar que a porta foi aberta será notificado no endpoint hostname:port/api/notifications/secbox

### iDFlex e iDAccess Nano
Nestes produtos, para se habilitar o modo enterprise, será necessário fazer o upgrade conforme descrito em upgrade.

### iDUHF
Nestes produtos, a ação para se abrir o relay interno é "door" e para se abrir o relay externo (MAE) é "sec_box". Maiores detalhes em Abertura Remota Porta e Catraca. O evento gerado pelo monitor para reportar que o relay interno foi aberto será notificado no endpoint hostname:port/api/notifications/door e o evento gerado pelo monitor para reportar que o relay externo foi aberto será notificado no endpoint hostname:port/api/notifications/secbox

iDFace
Neste produto, a ação para se abrir as portas é "sec_box". Maiores detalhes em Abertura Remota Porta e Catraca.

No iDFace, é possível configurar o período entre ativações do relé enquanto o usuário reconhecido continuar à frente do equipamento. Para isso, basta enviar uma requisição set_configuration (Modificar Configurações) modificando o parâmetro max_identified_duration do módulo face_id para o valor em milissegundos de intervalo desejado. Não é recomadável aplicar valores abaixo do intervalo em que o relé já se mantém aberto. Quando o parâmetro é configurado em zero, o relé não será aberto periodicamente, sendo necessário que o usuário saia da frente da câmera e espere o fim do streaming para uma nova identificação e abertura de porta.

Também é possível configurar o iDFace para desligar a tela quando o equipamento está ocioso. Para isso basta modificar o parâmetro screen_always_on para "0", fazendo com que a tela desligue até que alguém apareça à frente do display ou toque na tela. Para que a tela permaneça sempre ativa, basta modificar o parâmetro para "1". Isso pode ser feito com uma requisição set_configuration (Modificar Configurações).

## Limitação do número de templates
Número de templates (digitais) que podem ser armazenadas no equipamento (em modo standalone e contingência):

iDAccess, iDFit, iDBlock: 2000 templates;
iDFlex, iDAccess Pro, iDAccess Nano: 6000 templates;

## Upgrade iDFace
O controlador de Acesso iDFace é vendido por padrão em sua versão Lite. A versão Lite possui um limite de 3000 biometrias faciais e não conta com suporte a interfonia SIP. O cliente pode optar em adquirir a licença Pro para realizar o upgrade do equipamento, o que aumentará o limite de biometrias faciais para 10000, além de liberar a funcionalidade de interfonia SIP.

Para realizar o upgrade, primeiro o cliente deve entrar em contato com a Control iD e efetivar a compra da licença. Após isso, com sua licença em mãos, o cliente pode optar por realizar o upgrade de três formas:

GUI - Configurações > Configurações Gerais > Upgrade Modo Pro
Web - Configurações > Upgrade Modo Pro
API - Endpoint: /upgrade_ten_thousand_face_templates.fcgi
### POST /upgrade_ten_thousand_face_templates.fcgi
Parâmetros

password (string) : Recebe uma senha que deve ser fornecida pela Control iD para habilitar o modo Pro no equipamento.
Resposta

Esta chamada não possui retorno.
Exemplo de requisição
Realiza o upgrade do iDFace para a versão Pro:

```javascript
$.ajax({
    url: "/upgrade_ten_thousand_face_templates.fcgi?session=" + session,
    type: 'POST',
    contentType: 'application/json',
    data: JSON.stringify({
        password: "ABCDE12345"
    })
});
```

## Streaming iDFace
### Streaming RTSP
O controlador de acesso iDFace é capaz de transmitir o streaming de vídeo de sua câmera através do protocolo RTSP. Uma vez habilitado o recurso, para ter acesso à transmissão é necessário configurar um cliente RTSP (como o VLC Media Player ou o Windows Media Player) para acessar o equipamento no endpoint /main_stream. É importante destacar que o recurso vem, por padrão de fábrica, desabilitado e sem credenciais. Para habilitar deve-se seguir as instruções de configuração que serão mostradas na sequência.

#### URL para acesso ao serviço
Para acessar o streaming de vídeo da câmera do iDFace, caso nenhum usuário e senha estejam registrados nas credenciais RTSP, é necessário utilizar uma URL tal como a apresentada abaixo:

rtsp://endereço.ip.do.equipamento:porta/main_stream
Caso um usuário e uma senha tenham sido registrados nas credenciais RTSP, a URL de acesso seguirá o seguinte padrão:

rtsp://usuário:senha@endereço.ip.do.equipamento:porta/main_stream
#### Configurações dos parâmetros do Streaming RTSP
Atenção: todas as mudanças de configuração listadas abaixo só serão efetivadas após reinício do equipamento

Caso o usuário deseje utilizar o streaming de vídeo de sua câmera, é preciso habilitar na GUI, interface WEB ou via API. O parâmetro que permite habilitar (1) ou desabilitar (0) é o rtsp_enabled do módulo onvif.

Exemplo de requisição
Esta requisição habilita a transmissão de vídeo via RTSP.

```javascript
$.ajax({
    url: "/set_configuration.fcgi?session=" + session,
    type: 'POST',
    contentType: 'application/json',
    data: JSON.stringify(
        {
            "onvif": {
                "rtsp_enabled": "1"
            }
        }
    )
});
```
Configuração da porta
É possível configurar também a porta utilizada para a transmissão. A porta padrão utilizada é a "554". Para alterá-la deve-se utilizar o parâmetro rtsp_port do módulo onvif.

Exemplo de requisição
Esta requisição altera a porta da transmissão de vídeo via RTSP.

```javascript
$.ajax({
    url: "/set_configuration.fcgi?session=" + session,
    type: 'POST',
    contentType: 'application/json',
    data: JSON.stringify(
        {
            "onvif": {
                "rtsp_port": "556"
            }
        }
    )
});
```
#### Configuração de credenciais
Da mesma forma, é possível registrar um nome de usuário e senha para que a transmissão só seja habilitada a partir do preenchimento do usuário e senhas corretos. Para isso deve-se utilizar os parâmetros rtsp_username e rtsp_password do módulo onvif. Por padrão, nenhum usuário e senha estão registrados nesses parâmetros.

Exemplo de requisição
Esta requisição insere um usuário e senha para ativar a transmissão de vídeo via RTSP.

```javascript
$.ajax({
    url: "/set_configuration.fcgi?session=" + session,
    type: 'POST',
    contentType: 'application/json',
    data: JSON.stringify(
        {
            "onvif": {
                "rtsp_username": "admin",
                "rtsp_password": "admin",
            }
        }
    )
});
```
Configuração de câmera
Além disso, é possível alterar a câmera utilizada para fazer a transmissão de vídeo. A câmera padrão é a RGB, mas via requisição API é possível alterá-la para câmera infravermelha (IR). O parâmetro responsável por essa configuração é o rtsp_rgb do módulo onvif, e são duas as entradas válidas para ele: "0" (IR) ou "1" (RGB).

Exemplo de requisição
Esta requisição altera a câmera da transmissão de vídeo para a câmera IR.

$.ajax({
    url: "/set_configuration.fcgi?session=" + session,
    type: 'POST',
    contentType: 'application/json',
    data: JSON.stringify(
        {
            "onvif": {
                "rtsp_rgb": "0"
            }
        }
    )
});
Configuração de codec
Também é possível alterar o codec de vídeo utilizado na transmissão. O codec padrão é MJPEG, mas via requisição API é possível alterá-lo para H.264. O parâmetro responsável por essa configuração é o rtsp_codec do módulo onvif, e são duas as entradas válidas para ele: "mjpeg" (MJPEG) ou "h264" (H.264).

Exemplo de requisição
Esta requisição altera o codec de transmissão para H.264.

$.ajax({
    url: "/set_configuration.fcgi?session=" + session,
    type: 'POST',
    contentType: 'application/json',
    data: JSON.stringify(
        {
            "onvif": {
                "rtsp_codec": "h264"
            }
        }
    )
});
Streaming ONVIF
O controlador de acesso iDFace também é capaz de transmitir o streaming de vídeo de sua câmera através do padrão ONVIF (Open Network Video Interface Forum), reconhecido e utilizado mundialmente por diversos fabricantes de câmeras de vigilância e gravadores.

#### Configurações dos parâmetros do Streaming ONVIF
Atenção: todas as mudanças de configuração listadas abaixo só serão efetivadas após reinício do equipamento

Primeiramente, devemos nos atentar que as transmissões seguindo padrão ONVIF são realizadas utilizando em seu background o protocolo RTSP, logo, lembre-se de configurar devidamente o RTSP e habilitá-lo para garantir que a transmissão ONVIF ocorra sem erros. A transmissão ONVIF só irá funcionar se o RTSP estiver ativo e operando corretamente.

Além disso, é importante saber que o ONVIF utiliza as suas credenciais padrões, ou seja, o valor de "admin" tanto para o login quanto para senha.

Caso o usuário deseje utilizar a funcionalidade ONVIF, é preciso habilitar na GUI, interface WEB ou via API. O parâmetro que permite habilitar (1) ou desabilitar (0) é o onvif_enabled do módulo onvif.

Exemplo de requisição
Esta requisição habilita a transmissão de vídeo via ONVIF.

$.ajax({
    url: "/set_configuration.fcgi?session=" + session,
    type: 'POST',
    contentType: 'application/json',
    data: JSON.stringify(
        {
            "onvif": {
                "onvif_enabled": "1"
            }
        }
    )
});
Configuração da porta
É possível configurar também a porta utilizada para a transmissão. A porta padrão utilizada é a "8000". Para alterá-la deve-se utilizar o parâmetro onvif_port do módulo onvif.

Exemplo de requisição
Esta requisição altera a porta da transmissão de vídeo via ONVIF.

$.ajax({
    url: "/set_configuration.fcgi?session=" + session,
    type: 'POST',
    contentType: 'application/json',
    data: JSON.stringify(
        {
            "onvif": {
                "onvif_port": "8001"
            }
        }
    )
});
### Parametrizações de visualização
O controlador de acesso iDFace também é capaz de transmitir o vídeo de sua câmera com resolução de 360x640, com a possibilidade de configurar o espelhamento da imagem a fim de melhorar a visualização do local.

#### Configurações dos parâmetros de transmissão de vídeo
Além disso, é possível alterar a orientação da transmissão de vídeo, podendo ser original ou espelhada. O parâmetro responsável por essa configuração é o rtsp_flipped do módulo onvif, e são duas as entradas válidas para ele: "0" para original ou "1" tela espelhada.

Exemplo de requisição
Esta requisição altera para a tela espelhada.

```javascript
$.ajax({
    url: "/set_configuration.fcgi?session=" + session,
    type: 'POST',
    contentType: 'application/json',
    data: JSON.stringify(
        {
            "onvif": {
                "rtsp_flipped": "1"
            }
        }
    )
});
```

## Interfonia SIP iDFace
O controlador de acesso iDFace conta com um sistema de interfonia VoIP baseado no protocolo SIP (Session Initiation Protocol). Uma vez configurado, o controlador registra o usuário no servidor indicado e, assim, permite realizar e receber chamadas de voz.

Para ter acesso à funcionalidade, é necessário obter uma licença PRO para o iDFace.

Abaixo, estão apresentados alguns dos parâmetros configuráveis da interfonia SIP no iDFace. Eles podem ser determinadas através das interfaces gráfica e Web do equipamento ou através da API.

### Conexão SIP
Para que a conexão ao servidor SIP seja estabelecida, é preciso garantir que a interfonia esteja habilitada e fornecer os dados de acesso ao servidor SIP e da conta de usuário registrada nele que se deseja utilizar. Isso pode ser feito pelo menu Configurações SIP.

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| enabled | string | Habilita a interfonia SIP. |
| server_ip | string | Endereço do servidor SIP, podendo ser passado como URL ou como endereço IP. |
| server_port | int | Porta de acesso ao servidor. |
| server_outbound_port | int | Porta RTP inicial do SIP. Se configurada em 0, utiliza uma porta qualquer disponível. |
| server_outbound_port_range | int | Range de portas RTP do SIP. O SIP somente utilizará portas de rede disponíveis dentro do range especificado. |
| numeric_branch_enabled | string | Habilita ou não leitura do Ramal do usuário como um valor numérico. Valores: "0" para leitura em alfanumérico e "1" para numérico. |
| branch | string | Ramal do usuário registrado no servidor SIP. |
| login | string | Login do usuário registrado no servidor SIP. |
| password | string | Senha para login no servidor SIP. Para utilizar Autenticação Digest, a senha deve ter no máximo 16 caracteres. |
| peer_to_peer_enabled | string | Ativa a comunicação ponto-a-ponto na chamada SIP, com opções possíveis sendo "1" para ativado e "0" para desativado. |
Exemplo de requisição
Esta requisição configura os parâmetros de conexão SIP.

```javascript
$.ajax({
    url: "/set_configuration.fcgi?session=" + session,
    type: 'POST',
    contentType: 'application/json',
    data: JSON.stringify(
        {
            "pjsip": {
                "enabled": "1",
                "server_ip": "meu_servidor",
                "server_port": "5060",
                "server_outbound_port": "10000",
                "server_outbound_port_range": "1000",
                "numeric_branch_enabled": "1",
                "branch": "987",
                "login": "987",
                "password": "123456",
                "peer_to_peer_enabled": "0"
            }
        }
    )
});
```
### Configurações Gerais de Chamada
#### Configuração de períodos da chamada
Para uma chamada, podemos também configurar pela API as configurações de registro, tempo máximo de chamada ou ainda o timeout para enviar um keep-alive ao servidor, de acordo com os parâmetros a seguir:

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| reg_status_query_period | int | Período, em segundos, para a requisição de status do registro. |
| server_retry_interval | int | Período de envio do keep-alive, em segundos. |
| max_call_time | int | Tempo máximo de duração da chamada, em segundos. |
| push_button_debounce | int | Tempo de debounce da botoeira para evitar chamadas indesejadas, em milissegundos. |
Exemplo de requisição
```javascript
$.ajax({
    url: "/set_configuration.fcgi?session=" + session,
    type: 'POST',
    contentType: 'application/json',
    data: JSON.stringify(
        {
            "pjsip": {
                "reg_status_query_period": "60",
                "server_retry_interval": "5",
                "max_call_time": "300",
                "push_button_debounce": "50"
            }
        }
    )
});
```
#### Auto atendimento
A ativação do atendimento automático permite que o equipamento aceite automaticamente as chamadas recebidas. É possível configurar um intervalo, em segundos, entre o recebimento da chamada e o seu atendimento pelo equipamento.

O parâmetro auto_answer_enabled do módulo pjsip, determina se o atendimento automático será habilitado ou não. Uma vez habilitado, o tempo para atendimento automático é configurado pelo parâmetro auto_answer_delay, também do módulo pjsip.

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| auto_answer_enabled | string | Habilita o auto atendimento das chamadas SIP. Valores: "0" para auto atendimento desligado e "1" para auto atendimento ligado. |
| auto_answer_delay | string | Tempo de espera em segundos para realização do auto atendimento. |
##### Exemplo de requisição
Requisição para configurar atendimento automático habilitado em 5 segundos de chamada.

$.ajax({
    url: "/set_configuration.fcgi?session=" + session,
    type: 'POST',
    contentType: 'application/json',
    data: JSON.stringify(
        {
            "pjsip": {
                "auto_answer_enabled": "1",
                "auto_answer_delay": "5"
            }
        }
    }
    )
});
#### Modo de discagem
Por padrão, quando a interfonia está habilitada e devidamente configurada, um botão é mostrado na tela principal do equipamento, pelo qual é possível iniciar uma nova ligação. A visibilidade desse botão pode ser configurada de acordo com as necessidades do usuário pelo parâmetro auto_call_button_enabled. Importante: Esteja ciente de que quando a visibilidade do botão de discagem está desabilitada na tela do dispositivo, é necessário o uso da botoeira de discagem para que uma chamada SIP seja executada. A botoeira de discagem pode ser configurada de acordo com as necessidades do usuário pelo parâmetro rex_enabled.

Outra configuração importante é o modo de discagem quando o botão é acionado,que pode ser definido pelo parâmetro dialing_display_mode. Existem 3 modos de discagem possíveis e o usuário pode personalizar conforme desejado. A tabela abaixo mostra o parâmetro que deve ser utilizado para a personalização, as entradas possíveis e a descrição dos modos de discagem. Todos os parâmetros desta seção fazem parte do módulo pjsip.

| Parâmetro | Valor | Descrição |
| :--- | :--- | :--- |
| auto_call_button_enabled | string | Habilita ou não a visibilidade do botão de ligação da tela principal do equipamento. Valores: "0" para desabilitar o botão e "1" para habilitá-lo. |
| rex_enabled | string | Habilita ou não a funcionalidade da ligação por botoeira de discagem. Valores: "0" para desabilitar a botoeira e "1" para habilitá-la. |
| dialing_display_mode | string | Valores possíveis são: "0", para Discagem automática. Quando o botão de discagem é acionado, um número é chamado diretamente. "1", para Discagem a partir da lista de contatos. Quando o botão de discagem é acionado, a lista de contatos é mostrada e a chamada é efetuada para o contato selecionado. "2", para Discagem a partir do teclado numérico ou a partir da lista de contatos. |
Ao selecionar o modo de discagem automática é necessário definir o número para o qual a ligação será efetuada. Isto é feito através do parâmetro auto_call_target. Além disso, pode-se definir um nome relacionado a este número. Ele é definido através do parâmetro custom_identifier_auto_call. Esse nome será mostrado no display do iDFace ao efetuar ou receber ligações. Caso nenhum nome seja preenchido e não houver nenhum contato salvo vinculado a este número, o display mostrará apenas o número digitado.

Obs: o parâmetro auto_call_enabled, que era utilizado para configurar a discagem automática, não está sendo mais utilizado. A configuração da discagem automática deve ser feita exclusivamente pelo dialing_display_mode.

Exemplo de requisição
Requisição para habilitar o botão de discagem, habilitar a discagem automática para o número 456, definir o nome do número como Portaria e habilitar botoeira de discagem.

$.ajax({
    url: "/set_configuration.fcgi?session=" + session,
    type: 'POST',
    contentType: 'application/json',
    data: JSON.stringify(
        {
            "pjsip": {
                "auto_call_button_enabled": "1",
                "rex_enabled": "1",
                "auto_call_target": "456",
                "custom_identifier_auto_call": "Portaria",
                "dialing_display_mode": "0"
            }
        }
    }
    )
});
#### Configuração do SIP com vídeo
Podemos também configurar uma chamada para ser realizada com transmissão de vídeo (a depender também da configuração do cliente do outro lado e seu suporte a video h264). Para fazê-lo devemos configurar o dispositivo através do parâmetro a seguir:

| Parâmetro | Valor | Descrição |
| :--- | :--- | :--- |
| video_enabled | int | Define a configuração de SIP com vídeo, sendo "1" para ativado e "0" para desativado. |
É importante notar que, após a configuração do dispositivo no modo SIP com vídeo, é necessário reiniciar o equipamento para garantir que o video_stream está devidamente configurado.

Exemplo de requisição
Para configurar a chamada no modo SIP com vídeo, podemos enviar uma requisição como a seguinte:

$.ajax({
    url: "/set_configuration.fcgi?session=" + session,
    type: 'POST',
    contentType: 'application/json',
    data: JSON.stringify(
        {
            "pjsip": {
                "video_enabled": "1"
            }
        }
    }
    )
});
### Configurações de Som de Chamada Personalizado
Som de Chamada Personalizado
É possível habilitar um som de chamada personalizado para o aparelho. Dessa forma, quando uma requisição de chamada for realizada pelo equipamento, enquanto a resposta não for recebida, o áudio será executado. Caso opte-se por ativar essa configuração, deve-se anteriormente realizar o upload do áudio customizado através do endpoint set_pjsip_audio_message. Ao habilitar essa configuração, é necessário realizar o reinício do equipamento para que as alterações entrem em vigor.

Além disso, é possível configurar o volume do som de chamada personalizado. O volume é configurado através de três possíveis níveis de ganho, sendo "1" para o volume original, "2" para um ganho de duas vezes o volume original e "3" para um ganho de três vezes.

A habilitação do som de chamada personalizado é feita por meio do parâmetro pjsip_custom_audio_enabled, do módulo pjsip, e a configuração do nível de volume do som de chamada personalizado é feita pelo parâmetro custom_audio_volume_gain, também do módulo pjsip.

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| pjsip_custom_audio_enabled | string | Habilita o uso do som de chamada personalizado. Valores: "0" para áudio personalizado desabilitado e "1" para áudio personalizado habilitado. |
| custom_audio_volume_gain | string | Realiza o controle do volume do som de chamada personalizado através de seu ganho. Valores: "1", "2" e "3". |
Exemplo de requisição
```javascript
$.ajax({
    url: "/set_configuration.fcgi?session=" + session,
    type: 'POST',
    contentType: 'application/json',
    data: JSON.stringify(
        {
            "pjsip": {
                "pjsip_custom_audio_enabled": "1",
                "custom_audio_volume_gain": "1"
            }
        }
    )
});
```
### POST /set_pjsip_audio_message.fcgi
Permite realizar o upload do áudio que será utilizado na realização de chamadas. O áudio enviado deve ser um arquivo binário, em formato .wav, e ter tamanho inferior à 5 MB e, por limitações do protocolo de rede, deve ser enviado em blocos de no máximo 2 MB. Os blocos devem ser enviados de forma sequencial, sendo especificados os parâmetros current e total para tanto.

| Parâmetro | Tipo | Descrição |
| :--- | :--- | :--- |
| current | int | Bloco atual do arquivo de som. |
| total | int | Número total de blocos do arquivo de som. |
Resposta

Esta chamada não possui retorno.
Exemplo de requisição
```javascript
$.ajax({
    url: "/set_pjsip_audio_message.fcgi?session=" + session + "&current=" + current + "&total=" + total,
    type: 'POST',
    contentType: 'application/octet-stream',
    data: data_sound
});
```
### POST /get_pjsip_audio_message.fcgi
Permite realizar o download do arquivo de áudio personalizado utilizado na realização de chamadas.

Esta chamada não possui parâmetros.
Resposta

Arquivo de áudio personalizado em formato binário, presente no corpo da resposta, se existir.
(Content-Type: audio/wav)
Exemplo de requisição
```javascript
$.ajax({
    url: "/get_pjsip_audio_message.fcgi?session=" + session,
    type: 'POST',
    contentType: 'application/json'
});
```
### POST /has_pjsip_audio_message.fcgi
Permite verificar se existe algum arquivo de áudio personalizado no aparelho.

Esta chamada não possui parâmetros.
Resposta

file_exists (bool): Retorna true caso já exista um arquivo de áudio personalizado no aparelho e false caso contrário.
Exemplo de requisição
```javascript
$.ajax({
    url: "/has_pjsip_audio_message.fcgi?session=" + session,
    type: 'POST',
    contentType: 'application/json'
});
```
### Configurações de Volume
Ainda pela interface de configuração do interfone é possível determinar os volumes de captação do microfone e de saída do alto-falante do equipamento. Ambos os volumes podem ser configurados para valores entre 1 e 10.

#### Exemplo de requisição
Requisição de configuração dos volumes de microfone e alto-falante.

```javascript
$.ajax({
    url: "/set_configuration.fcgi?session=" + session,
    type: 'POST',
    contentType: 'application/json',
    data: JSON.stringify(
        {
            "pjsip": {
                "mic_volume": "5",
                "speaker_volume": "7"
            }
        }
    )
});
```
## Realizar Chamadas via API
Após o SIP estar devidamente configurado, é possível realizar chamadas no aparelho via API. As chamadas podem ser controladas a partir de três endpoints que serão explicados a seguir.

### POST /make_sip_call.fcgi
Responsável por iniciar uma chamada. A chamada somente será realizada se o aparelho estiver em sua tela inicial ou em streaming de identificação.

| Parâmetro | Tipo | Descrição |
| :--- | :--- | :--- |
| target | string | Ramal que receberá a ligação. |
Resposta

Esta chamada não possui retorno.
Exemplo de requisição
```javascript
$.ajax({
    url: "/make_sip_call.fcgi?session=" + session,
    type: 'POST',
    contentType: 'application/json',
    data: JSON.stringify(
        {
            "target": "503"
        }
    )
});
```
### POST /finalize_sip_call.fcgi
Responsável por finalizar uma chamada em andamento.

Parâmetros

Esta chamada não possui parâmetros.
Resposta

Esta chamada não possui retorno.
Exemplo de requisição
```javascript
$.ajax({
    url: "/finalize_sip_call.fcgi?session=" + session,
    type: 'POST',
    contentType: 'application/json'
});
```
### POST /get_sip_status.fcgi
Retorna o status atual do SIP, incluindo o código de status e se há chamada em andamento.

Parâmetros

Esta chamada não possui parâmetros.
Resposta

status (int): Indica código de status da chamada. Os códigos são consistentes com a definição padrão do protocolo SIP. Alguns dos possíveis retornos são:
-1 : "Desabilitado"
0/100 : "Conectando"
200 : "Conectado"
401/403 : "Falha na autenticação"
408 : "Falha ao conectar com o servidor"
503 : "Falha na conexão de rede"
in_call (bool): Indica se há uma chamada em andamento. Retorna true se houver uma chamada ativa e false caso contrário.
Exemplo de requisição
```javascript
```javascript
$.ajax({
    url: "/get_sip_status.fcgi?session=" + session,
    type: 'POST',
    contentType: 'application/json'
});
```
```
## Liberação de acesso via interfonia
Aviso: A liberação de acesso via interfonia do iDFace faz uso de códigos enviados por DTMF segundo a RFC 2833.

É possível realizar a liberação de acesso através de um código discado através do interfone. Para isso, é preciso primeiro habilitar o recurso e registrar um novo código. Para habilitar/desabilitar deve-se utilizar o parâmetro open_door_enabled do módulo pjsip. Ele aceita como entradas válidas os valores "0" (desabilitado) ou "1" (habilitado).

Para registrar o código de liberação, utiliza-se o parâmetro open_door_command, também do módulo pjsip. Ele aceita como entrada caracteres numéricos e os seguintes caracteres especiais: '+', '*' e '#'.

Exemplo de requisição
Requisição para habilitar a liberação de acesso por interfonia com a discagem do código 12345.

```javascript
$.ajax({
    url: "/set_configuration.fcgi?session=" + session,
    type: 'POST',
    contentType: 'application/json',
    data: JSON.stringify(
        {
            "pjsip": {
                "open_door_enabled": "1",
                "open_door_command": "12345"
            }
        }
    )
});
```
## Habilitação de identificação durante interfonia
Aviso: A funcionalidade de identificação durante interfonia do iDFace está disponível a partir da versão de firmware 6.13.1.

É possível realizar a identificação durante a chamada SIP. Para isso, é preciso primeiro habilitar o recurso. Para habilitar/desabilitar deve-se utilizar o parâmetro facial_id_during_call_enabled do módulo pjsip. Ele aceita como entradas válidas os valores "0" (desabilitado) ou "1" (habilitado).

Exemplo de requisição
Requisição para habilitar a identificação durante interfonia.

```javascript
$.ajax({
    url: "/set_configuration.fcgi?session=" + session,
    type: 'POST',
    contentType: 'application/json',
    data: JSON.stringify(
        {
            "pjsip": {
                "facial_id_during_call_enabled": "1"
            }
        }
    )
});
```

## Mensagens sonoras de acesso iDFace
O controlador de acesso iDFace possui a capacidade de reproduzir mensagens sonoras como resposta a eventos de identificação. O usuário pode escolher entre deixar o recurso desabilitado, utilizar as mensagens de voz padrão do dispositivo ou carregar seus próprios arquivos de áudio.

### Configuração do modo de funcionamento
Os eventos que possuem feedback sonoro, e as respectivas mensagens padrão, estão listados na tabela abaixo. Na terceira coluna da tabela, pode-se ver o nome do parâmetro que deve ser utilizado para configurar a mensagem de cada evento e, na quarta coluna, são apresentadas as entradas válidas.

Obs: Todos os parâmetros de configuração fazem parte do módulo buzzer.

| Eventos | Mensagem sonora padrão | Parâmetros | Entradas válidas |
| :--- | :--- | :--- | :--- |
| Não identificado | "Usuário não identificado" | audio_message_not_identified | disabled, default ou custom |
| Autorizado | "Acesso liberado" | audio_message_authorized | disabled, default ou custom |
| Não autorizado | "Acesso negado" | audio_message_not_authorized | disabled, default ou custom |
| Use máscara | "Por favor, use máscara" | audio_message_use_mask | disabled, default ou custom |
Quando inserida a entrada disabled, a resposta sonora para aquele evento estará desativada. Se inserida a entrada default, a resposta sonora será a mensagem sonora padrão do dispositivo. E se for inserido custom, a resposta sonora será o áudio carregado pelo usuário.

Exemplo de requisição
Esta requisição ativa as respostas sonoras padrões de identificação.

```javascript
$.ajax({
    url: "/set_configuration.fcgi?session=" + session,
    type: 'POST',
    contentType: 'application/json',
    data: JSON.stringify(
        {
            "buzzer": {
                "audio_message_not_identified": "default",
                "audio_message_authorized": "default",
                "audio_message_not_authorized": "default",
                "audio_message_use_mask": "default"
            }
        }
    )
});
```
Exemplo de requisição
Esta requisição desabilita as repostas sonoras de identificação.

```javascript
$.ajax({
    url: "/set_configuration.fcgi?session=" + session,
    type: 'POST',
    contentType: 'application/json',
    data: JSON.stringify(
        {
            "buzzer": {
                "audio_message_not_identified": "disabled",
                "audio_message_authorized": "disabled",
                "audio_message_not_authorized": "disabled",
                "audio_message_use_mask": "disabled"
            }
        }
    )
});
```
### Alterar o volume de reprodução do áudio
Além de poder escolher o áudio, é possível escolher o volume em que a resposta sonora será emitida. O parâmetro responsável por ajustar o volume é o audio_message_volume_gain. Existem 3 níveis de volume possíveis: normal, médio e alto. Normal é o volume padrão de fábrica e ele corresponde ao valor de entrada 1. Médio corresponde ao valor 2 e alto corresponde a 3. Um exemplo de requisição para ajustar o volume está mostrado abaixo:

Exemplo de requisição
Esta requisição ajusta o volume das mensagens sonoras para médio.

```javascript
$.ajax({
    url: "/set_configuration.fcgi?session=" + session,
    type: 'POST',
    contentType: 'application/json',
    data: JSON.stringify(
        {
            "buzzer": {
                "audio_message_volume_gain": "2"
            }
        }
    )
});
```
Carregamento da mensagem sonora customizada
Conforme mencionado acima, é possível utilizar áudios customizados nas mensagens sonoras de identificação. Para isso, é preciso carregar o áudio desejado no dispositivo. O áudio pode ser carregado através da interface WEB ou através do uso da API.

É importante destacar, que alguns cuidados devem ser tomados ao carregar o áudio. Primeiramente, o limite de tamanho de arquivo de áudio suportado é 5MB. Além disso, no envio do arquivo via API, cada requisição é limitada a transportar no máximo 2MB de dados e, portanto, o envio deve ser feito de forma fragmentada. O usuário deve separar seu arquivo de áudio em blocos (2MB máx) e enviar sequencialmente cada parte, em requisições separadas. Para fazer isso, ele deve trabalhar com os parâmetros current e total, explicados abaixo:

POST /set_audio_access_message.fcgi
Parâmetros

event (string) : seleciona para qual dos eventos de identificação será utilizado o áudio a ser enviado. Abaixo estão as strings de entradas possíveis (obrigatório):
not_identified: seleciona o evento 'Não identificado'.
authorized: seleciona o evento 'Autorizado'.
not_authorized : seleciona o evento 'Não autorizado'.
use_mask: seleciona o evento 'Use máscara'.
current (int) : corresponde ao valor da parte atual do áudio que esta sendo enviada. Exemplo: em um envio de um arquivo de áudio divido em 2 partes, o primeiro envio deve ter o valor current igual a 1 e o segundo envio igual a 2. (obrigatório).
total (int) : corresponde ao número total de partes que serão enviadas. Exemplo: no caso do exemplo de um envio de um arquivo dividido em 2 partes, o número total de partes é igual a 2, então o total deve ser igual a 2 (obrigatório).
Exemplo de requisição
Esta requisição carrega o arquivo de áudio no equipamento. A requisição corresponde ao primeiro envio de um arquivo dividido em 2 partes.

$.ajax({
    url: "/set_audio_access_message.fcgi?event=authorized&current=1&total=2&session=" + session 
    type: 'POST',
    contentType: 'application/octet-stream',
    data: [bytes do áudio enviado]
});
Download da mensagem sonora customizada
Uma vez carregada a mensagem sonora customizada, é possível fazer o download da mensagem via interface WEB do embarcado ou via API. A requisição para realizar isso esta mostrada abaixo:

POST /get_audio_access_message.fcgi
Parâmetros

event (string) : seleciona o evento de identificação cujo áudio personalizado se deseja obter. Abaixo estão as strings de entradas possíveis (obrigatório):
not_identified: seleciona o evento 'Não identificado'.
authorized: seleciona o evento 'Autorizado'.
not_authorized : seleciona o evento 'Não autorizado'.
use_mask: seleciona o evento 'Use máscara'.
Resposta

Caso exista, será retornado o arquivo de áudio.
Exemplo de requisição
$.ajax({
    url: "/get_audio_access_message.fcgi?session=session,
    type: 'POST',
    contentType: 'application/json',
    data: JSON.stringify({
        "event": "authorized"
    })
});
Verificação de existência de áudio customizado no dispositivo
Podemos verificar se já existe um áudio customizado carregado no equipamento. Para isso, utiliza-se a requisição abaixo:

POST /has_audio_access_messages.fcgi
Parâmetros

Sem parâmetros de entrada
Resposta

not_identified (bool): Retorna true caso já exista um arquivo de áudio customizado para o evento "Não identificado". E retorna false caso contrário.
authorized (bool): Retorna true caso já exista um arquivo de áudio customizado para o evento "Autorizado". E retorna false caso contrário.
not_authorized (bool): Retorna true caso já exista um arquivo de áudio customizado para o evento "Não autorizado". E retorna false caso contrário.
use_mask (bool): Retorna true caso já exista um arquivo de áudio customizado para o evento "Use máscara". E retorna false caso contrário.
Exemplo de requisição
$.ajax({
    url: "//has_audio_access_messages.fcgi?session=" + session,
    type: 'POST',
    contentType: 'application/json'
});

QR Code
É possível realizar identificações utilizando QR Codes cadastrados previamente nos equipamentos de controle de acesso da Control iD. Os QR Codes são armazenados como objetos e devem ser criados e modificados seguindo as mesmas premissas dos demais objetos via API.

A identificação dos QR Codes pode ser realizada através dos leitores de QR Code fornecidos pela Control iD, podendo-se optar entre o modelo USB e o modelo Wiegand. Além disso, para o dispositivo facial iDFace, a identificação pode ser realizada através das câmeras do próprio equipamento, porém, caso opte-se por utilizar leitores externos, esses também serão suportados pelo dispositivo.

Modo de operação
O reconhecimento de QR Codes pode ser utilizado de três modos.

Modo Somente Numérico (Padrão), na qual o conteúdo do QR Code deve ser numérico de 64 bits e, além disso, o QR Code será gravado como um objeto do tipo cards.

Modo Numérico Hexadecimal na qual o conteúdo do QR Code deve ser numérico Hexadecimal de 64 bits e seu valor será interpretado pelo dispositivo como numérico decimal. Além disso, o QR Code será gravado como um objeto do tipo cards.

No Modo Alfanumérico são aceitos caracteres alfanuméricos na representação do QR Code e o objeto utilizado para armazenamento será do tipo qrcodes. Esse modo somente é suportado por equipamentos da Linha de Acesso V5 (dispositivos com serial de 13 dígitos) que estejam utilizando leitor de QR Code USB, ou pelo controlador de acesso iDFace, utilizando as câmeras do aparelho. O iDFace também é compatível com leitor de QR Code USB. Leitores de QR Code Wiegand não são suportados neste modo.

Para realizar a alteração do modo de operação, primeiro deve-se modificar o módulo conforme o equipamento utilizado. Os equipamentos da Linha de Acesso V5 utilizam o módulo barras, enquanto que para o controlador de acesso iDFace (Linha de Acesso V6) faz uso do módulo face_id. Após essa configuração é preciso alterar o valor do parâmetro qrcode_legacy_mode_enabled, sendo que caso o mesmo esteja com valor "0", o Modo Alfanumérico será habilitado, caso seu valor seja "1", o Modo Somente Numérico será habilitado e, caso seu valor seja "2", o Modo Numérico Hexadecimal será utilizado.

Exemplo de requisição pelo controlador de acesso iDFace (Linha de Acesso V6)
Realiza a alteração do modo de operação do QR Code:

$.ajax({
    url: "/set_configuration.fcgi?session=" + session,
    type: 'POST',
    contentType: 'application/json',
    data: JSON.stringify({
        "face_id": {
            "qrcode_legacy_mode_enabled": "0"
        }
    })
});
Exemplo de requisição por equipamentos da Linha de Acesso V5
Realiza a alteração do modo de operação do QR Code:

$.ajax({
    url: "/set_configuration.fcgi?session=" + session,
    type: 'POST',
    contentType: 'application/json',
    data: JSON.stringify({
        "barras": {
            "qrcode_legacy_mode_enabled": "0"
        }
    })
});
QR Code dinâmico
Os equipamentos de controle de acesso também podem trabalhar com o conceito de QR Code dinâmico, através da lógica de TOTP ou timed one-time password.

TOTP
O conceito de TOTP representa a geração de códigos de acesso válidos para um único uso e que se renovam a intervalos regulares.

Ele é uma extensão da ideia de OTP, one-time password, que é uma senha de uso único. Para TOTP, a validade de um código OTP fica restrita a uma janela de tempo determinada.

Códigos de acesso OTP válidos para TOTP são gerados por dois componentes: uma chave de acesso associada ao usuário ou a uma credencial de acesso e a janela de tempo em que o código é gerado.

Para aplicá-lo corretamente, é recomendado que o sistema integrador utilize uma biblioteca que implementa o TOTP conforme a RFC6238 desenvolvida em sua linguagem de preferência.

Configurações de TOTP no equipamento
Para fazer uso de QR Codes dinâmicos, é necessário configurar os parâmetros de TOTP no equipamento:

totp_enabled: habilita a lógica TOTP para validação de códigos temporários. Os valores são 0 (desabilitado) ou 1 (habilitado).
totp_window_size: intervalo temporal em segundos de duração da janela TOTP para renovação do código temporário.
totp_window_num: quantidade de janelas de tempo a serem utilizadas na tentativa de validar o código.
totp_single_use: determina se o card_value utilizado na geração do código será válido por apenas um uso. Os valores são 1 (uso único) e 0 (mais de um uso).
totp_tz_offset: valor representativo do fuso horário local em segundos para validação dos códigos OTP.
Atenção: a configuração de totp_sigle_use tem efeito apenas sobre o card_value cadastrado. A componenente temporal do conteúdo do QR Code, representada pelo código OTP correspondente à janela de geração, será sempre válida para apenas um uso. A composição do QR Code é detalhada no tópico a seguir.

Atenção: a configuração de totp_tz_offset existe para compensar problemas de sincronia de horário entre o sistema integrador e o equipamento por causa de configurações de fuso horário. Se não houver problema desse tipo, ela pode ser mantida no valor padrão de 0.

#### Geração do QR Code dinâmico
Para fazer uso de QR Codes dinâmicos em nossos equipamentos, é necessário que a leitura de QR Codes esteja configurada para o Modo Somente Numérico, como descrito na seção mais acima desta página.

As credenciais de acesso do usuário são baseadas em dois valores:

card_value: código numérico que identifica o usuário, equivalente ao número do cartão de acesso. Este código não deve ultrapassar 40 bits (5 bytes).
secret: um código hash a ser gerado pelo sistema integrador que pode ser usado como identificação do acesso, ou como identificação do gerador.
Estes valores devem ser cadastrados para o usuário na tabela cards, como um cartão de acesso.

Esta requisição cadastra credenciais fictícias para um usuário de id 1:

```javascript
$.ajax({
  url: "/create_objects.fcgi?session=" + session,
  type: 'POST',
  contentType: 'application/json',
  data: JSON.stringify({
    object: "cards",
    values: [
        {
            value: 819876543210,
            user_id: 1,
            secret: '8ae30f'
        }
    ]
  })
});
```
Com as credenciais cadastradas, o valor de secret deve ser utilizado como chave para geração de um código OTP temporário de até 24 bits (3 bytes) através da biblioteca TOTP.

O conteúdo do QR Code, será de 64 bits organizados em 24 bits para o código OTP de valor temporário, e 40 bits para o número de cartão cadastrado para o usuário.

![alt text](https://www.controlid.com.br/docs/access-api-pt/img/dados_qr_code_dinamico.png)

Após a emissão do QR Code, o usuário terá um intervalo de tempo baseado na janela temporal de validade do acesso para apresentá-lo diante do equipamento. O tamanho da janela deve ter o mesmo valor no equipamento e no servidor.

Com base nas credenciais cadastradas, o equipamento identifica o usuário e confere o código OTP recebido gerando outro equivalente a partir do secret e da janela atual.

O tempo limite para validade de um código é uma relação entre a duração da janela (totp_window_size) e a quantidade de janelas utilizadas na validação (totp_window_num).

Exemplo: se a quantidade de janelas configurada for 5, o equipamento tentará validar o código OTP recebido a partir dos valores da janela atual, das duas anteriores e das duas seguintes. Esse método procura evitar erros de validação por pequenas diferenças de sincronia entre servidor e equipamento.

## Upgrade iDFlex e iDAccess Nano
O controlador de Acesso iDFlex, pode ser vendido nas versões Lite e Pro. A versão Lite não tem a interface de rede habilitada, portanto, não será possível sequer utilizar o servidor web embarcado, a versão Pro, possui a interface de rede ativa mas não é possível habilitar no modo enterprise (online).

O iDAccess Nano, na única versão vendida também não é possível habilitar o modo enterprise sem antes realizar o upgrade descrito a seguir.

Portanto, para ambos os dispositivos descritos acima, é necessário realizar o upgrade para a Versão Enterprise para depois habilitar o Modo Enterprise (online), e o endpoint abaixo permite que isso seja realizado remotamente. O método HTTP usado é o POST.

### POST /idflex_upgrade_enterprise.fcgi
Parâmetros

password (string) : Recebe uma senha que deve ser fornecida pela Control iD para habilitar o modo enterprise no equipamento.
Resposta

Esta chamada não possui retorno.
Exemplo de requisição
Realiza o upgrade do iDFlex para a versão enterprise:

```javascript
$.ajax({
    url: "/idflex_upgrade_enterprise.fcgi?session=" + session,
    type: 'POST',
    contentType: 'application/json',
    data: JSON.stringify({
        password: "ABCDE12345"
    })
});
```

iDBlock Next
A catraca inteligente iDBlock Next (vide https://www.controlid.com.br/controle-de-acesso/idblock-next/) tem como componentes uma placa principal (Main) e dispositivos de identificação, a saber: até 2 iDFaces (conforme modelo) e IHM (conforme modelo). Caso desejado, a conexão do conjunto como um todo à internet envolve um único ponto de rede Ethernet externo, pois as demais conexões são todas internas, em um switch integrado, de forma a possibilitar a comunicação entre os componentes.

Cada um dos componentes de identificação pode ter como papel o de primário ou o de secundário, conforme descrito na próxima seção. Uma vez configurados os papéis, toda a integração seguinte é feita com comunicação exclusiva com o dispositivo primário do conjunto. Por exemplo, é o endereço IP do primário que deve ser fornecido ao software iDSecure, o qual informará alterações de cadastro de usuários e de regras de acesso diretamente ao primário, de forma a serem válidas para todo o conjunto. Nas seções posteriores serão elencadas as demais particularidades de integração para a iDBlock Next.

### Modos de operação na iDBlock Next
Equipamentos que fazem parte de um conjunto iDBlock Next devem ser configurados para funcionarem em um de dois modos: Dispositivo Primário ou Dispositivo Secundário.

Um dispositivo configurado como primário será responsável por autorizar o acesso de usuários em todos os dispositivos secundários com os quais está conectado. Além disso, algumas funcionalidades, como cadastro de usuários e geração de relatórios de acesso, não estão disponíveis em dispositivos secundários e configurações específicas são modificadas automaticamente para se manterem consistentes em todo o conjunto.

É recomendado que a configuração do papel de cada dispositivo do conjunto seja feita assim que possível, pois é essencial para o funcionamento correto da catraca iDBlock Next. É importante também se assegurar que cada catraca possui um, e somente um, dispositivo primário, evitando conflitos durante a operação.

### Configuração dos modos de operação
Para configurar o modo de operação no conjunto da catraca pela API, é necessário modificar a configuração catra_role, localizada no módulo sec_box, de acordo com a tabela abaixo:

| Modo de Operação | catra_role |
| :--- | :--- |
| Dispositivo fora do conjunto | 0 |
| Dispositivo primário | 1 |
| Dispositivo secundário | 2 |
A alteração desse parâmetro deve ser feita com cuidado, pois, para garantir a integridade e bom funcionamento do conjunto iDBlock Next, a mudança no valor da configuração catra_role causa um reinício no equipamento e a limpeza de informações em seu banco de dados (configurações gerais e de rede são mantidas) automaticamente. Por esse motivo, é recomendado que exista um backup de informações importantes antes da execução desse procedimento, além de não se alterar o modo de operação frequentemente.

No caso do dispositivo primário, outras configurações de modo de operação podem ser modificadas, de acordo com a seção Modos de operação deste documento. Já para aparelhos configurados como secundários, tais configurações não devem ser modificadas.

Também é importante ressaltar que a IHM não deve funcionar como dispositivo primário caso um ou mais iDFace estejam conectados à iDBlock Next e, caso seja configurada dessa forma, a configuração será sobrescrita automaticamente.

### Configuração da catraca com iDFaces e IHM
Vale ressaltar que uma iDBlock Next pode ser configurada de múltiplas maneiras, combinando sua tampa (IHM) e dispositivos iDFace. A IHM é a tampa do iDBlock Next, contando também com uma tela.

Configuração 1: Apenas IHM, sem iDFace - Neste modo a IHM se porta e deve ser configurada como primário do dispositivo, controlando-o em integralidade. O controle de acesso neste caso é feito por biometria, cartão, PIN ou senha.
Configuração 2: Apenas 1 ou 2 iDFaces, sem IHM - Neste modo, um dos iDFaces será obrigatoriamente o primário. Com esta configuração, os iDFaces são responsáveis pelo controle de acesso da catraca no sentido de entrada e saida. Este modo de funcionamento não oferece o controle de acesso via biometria como com a IHM, mas oferece ainda o recurso via reconhecimento facial, cartão, PIN ou senha.
Configuração 3: IHM com 1 ou 2 iDFaces - Neste modo, um dos iDFaces será obrigatoriamente o primário, controlando o outro iDFace (se houver) e a IHM como secundários. Este modo oferece identificação tanto biométrica quanto facial, além de via cartão, PIN e senha.
É importante notar também que o secundário, em qualquer uma das configurações, jamais é ligado ao servidor online. Todas as configurações são unicamente feitas pelo dispositivo primário, que controla o conjunto como um dispositivo de controle de acesso ou através de comandos recebidos via API.

#### Exemplo de requisição para iDFace ou IHM primários
Essa requisição configura um iDFace ou IHM como dispositivo primário:

```javascript
$.ajax({
    url: "/set_configuration.fcgi?session=" + session,
    type: 'POST',
    contentType: 'application/json',
    data: JSON.stringify({
        "sec_box": {
            "catra_role": "1"
        }
    })
});
```
#### Exemplo de requisição para iDFace ou IHM secundários
Essa requisição configura um iDFace ou IHM como dispositivo secundário:

```javascript
$.ajax({
    url: "/set_configuration.fcgi?session=" + session,
    type: 'POST',
    contentType: 'application/json',
    data: JSON.stringify({
        "sec_box": {
            "catra_role": "2"
        }
    })
});
```
## Outras configurações importantes da catraca
Configurações específicas para controle da catraca. Todas as configurações também são do módulo sec_box.

### Parâmetros do módulo: sec_box
| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| catra_default_fsm | string | Modo de operação da catraca. Controla quais sentidos da catraca serão controlados ou liberados. Deve ser "0" (ambos os giros controlados), "1" (ambos os giros liberados), "2" (giro no sentido anti-horário liberado) ou "3" (giro no sentido horário liberado). |
| catra_side_to_enter | string | Indica qual sentido de giro da catraca será considerado como de entrada. Os valores são "0" (horário) ou "1" (anti-horário). |
| catra_timeout | string | Indica o tempo de duração da liberação do giro, em milissegundos. Ex.: "5000" para liberação de entrada / saída por 5 segundos. |
| catra_bio_sync_period | string | Intervalo de tempo em que haverá sincronismo periódico de biometria entre os dispositivos primário e secundário(s), em milissegundos. Valor padrão: "1000". |
| catra_sync_period | string | Intervalo de tempo em que haverá sincronismo periódico de usuários entre os dispositivos primário e secundário(s), em milissegundos. Valor padrão: "5000". |
| catra_config_sync_period | string | Intervalo de tempo em que haverá sincronismo periódico de configurações entre os dispositivos primário e secundário(s), em segundos. Valor padrão: "60". |
| catra_relay_1_enabled | int | Indica se o relé 1 da catraca está habilitado. Valores: "0" para desabilitado e "1" para habilitado. |
| catra_relay_1_enable_direction | string | Indica a direção da liberação de rotação do braço da catraca que causará a ativação do relé 1, caso o parâmetro catra_relay_1_enabled esteja habilitado. Valores: "left" para rotação em sentido anti-horário e "right" para rotação em sentido horário. |
| catra_relay_2_enabled | int | Indica se o relé 2 da catraca está habilitado. Valores: "0" para desabilitado e "1" para habilitado. |
| catra_relay_2_enable_direction | string | Indica a direção da liberação de rotação do braço da catraca que causará a ativação do relé 2, caso o parâmetro catra_relay_2_enabled esteja habilitado. Valores: "left" para rotação em sentido anti-horário e "right" para rotação em sentido horário. |
| catra_collect_visitor_card | string | Habilita a saída de visitantes com cartão feita exclusivamente através de depósito de cartão na urna coletora. Os valores são "0" para desabilitar a funcionalidade e "1" para habilitar. |
#### Exemplo de requisição para dispositivo primário
Essa requisição configura um dispositivo primário com os parâmetros da catraca:

```javascript
$.ajax({
    url: "/set_configuration.fcgi?session=" + session,
    type: 'POST',
    contentType: 'application/json',
    data: JSON.stringify({
        "sec_box": {
            "catra_default_fsm": "0",
            "catra_side_to_enter": "0",
            "catra_timeout": "1000",
            "catra_sync_period": "5000",
            "catra_config_sync_period": "60",
            "catra_relay_1_enabled": "1",
            "catra_relay_1_enable_direction": "right",
            "catra_relay_2_enabled": "1",
            "catra_relay_1_enable_direction": "left"
        }
    })
});
```
## Evento de desistência de acesso
Assim como nas catracas da linha iDBlock V2, nos modos standalone ou contingência (vide Modos de operação), caso um acesso autorizado (evento 7) não seja seguido de um evento de giro no respectivo tempo de liberação, este passará a ser uma desistência de acesso (evento 13) no respectivo log de acesso. Vide Lista de Objetos para mais detalhes sobre os eventos dos logs de acesso.

## Notificações do monitor
De forma também equivalente às catracas da linha iDBlock V2, a iDBlock Next conta com o endpoint de eventos de catraca catra_event em todos os modos de operação. Nele serão notificados eventos de giro à direita (horário), giro à esquerda (anti-horário) e desistência de acesso, conforme documentado aqui.

## Eventos de identificação no modo online
Em complemento à documentação de mensagens dos eventos de identificação em modo online, caso o dispositivo seja o primário de um conjunto iDBlock Next haverá também o envio do seguinte parâmetro:

component_id,

o qual segue a mesma lei de formação documentada aqui e pode ser utilizado para definir se a identificação ocorreu em um iDFace primário, iDFace secundário, Wiegand da Urna ou IHM (com valores decodificados "0MS1", "0MS2", "0WS0" e "0TS0", respectivamente), possibilitando o correto gerenciamento do servidor online.

## Saída de visitantes
A saída de visitantes com cartão deve ser obrigatoriamente realizada com depósito de cartão na urna. Essa funcionalidade deve ser habilitada apenas sob o uso de catraca com urna coletora de cartão. Sua configuração pode ser feita via interface WEB do embarcado, via API ou via GUI. A requisição para habilitar essa opção está mostrada abaixo.

### Exemplo de requisição para habilitar saída de visitantes somente por cartão
Essa requisição configura a saída de visitantes somente com depósito de cartão na urna:

```javascript
$.ajax({
    url: "/set_configuration.fcgi?session=" + session,
    type: 'POST',
    contentType: 'application/json',
    data: JSON.stringify({
        "sec_box": {
            "catra_collect_visitor_card": "1"
        }
    })
});
```
## Configuração dos LEDs da catraca
Através da API podemos configurar as cores dos LEDs RGB presentes na iDBlock Next e acionar eventos que trocam estas cores e estados dos LEDs.

```javascript
$.ajax({
    url: "/remote_led_control.fcgi?session=" + session,
    type: 'POST',
    contentType: 'application/json',
    data: JSON.stringify({
        "sec_box": {
            "color": "0",
            "event": 2
        }
    })
});
```
Com cada um dos parâmetros passados como detalhado abaixo:

color: String contendo um número que represente um código Alfa-RGB hexadecimal (na ordem ARGB). Por exemplo "4278255360" para a cor verde (#FF00FF00) ou "4294901760" para a cor vermelha (#FFFF0000).

event: Inteiro representando um evento dentre 5 opções:

0: Evento autorizado (define a luz como verde)
1: Evento não autorizado (define a luz como vermelha)
2: Evento Idle (define a luz como Idle Color)
3: Evento de desativação (desliga a luz)
4: Evento de mudança da Idle Color (define a cor do estado Idle como o parâmetro de cor passado)
Outros: Evento Idle novamente
Em suma, as cores de evento autorizado e não-autorizado são permanentes em verde e vermelho, respectivamente. Contudo, podemos mudar a cor em estado de Idle para a que desejarmos, enviando-a com um evento de código 4, seguido de um evento de código 2 para ir ao estado Idle.

Para desligar as luzes, podemos enviar um evento de código 3.

## Liberação agendada
É possível agendar a liberação de acesso no iDFace, desta forma o acesso será concedido a todos os usuários durante um período predeterminado em dias específicos, sem a necessidade de identificação dos mesmos. As Liberações Agendadas são armazenadas como objetos e devem ser criadas e modificadas seguindo as mesmas premissas dos demais objetos via API.

### Cadastrar uma liberação agendada
O processo para cadastrar uma liberação agendada se assemelha ao processo para a criação de um departamento (grupo).

Criar objetos do tipo scheduled_unlocks (liberações agendadas) conforme descrito neste exemplo.

Criar objetos do tipo access_rules (regras de acesso) conforme descrito neste exemplo.

Criar objetos do tipo scheduled_unlock_access_rules (regras de acesso --> liberação agendada), que são responsáveis de vincular os objetos scheduled_unlocks com os objetos access_rules, conforme descrito neste exemplo.

Por fim, será necessário definir os intervalos de horário no qual a regra de acesso será válida, isso deverá ser feito através das três etapas descritas abaixo:

Criar objetos do tipo time_zones (horários), um horário pode conter vários intervalos. Como criar objetos deste tipo está descrito neste exemplo.

Criar objetos do tipo time_spans (intervalos), estes objetos contêm os intervalos de tempo, dias da semana e feriados que podem ser vinculados a um horário. Como criar objetos deste tipo está descrito neste exemplo.

Criar objetos do tipo access_rule_time_zones (regras de acesso -> horários), que são responsáveis de vincular os objetos time_zones com os objetos access_rules, conforme descrito neste exemplo.

## iDFace Max
O controlador de acesso iDFace Max possui três tipos de sinais configuráveis: SecBox, relé interno e GPIOs de expansão. Cada um desses sinais contém suas particularidades e possibilidades de customização para se adaptar às mais diversas necessidades.

SecBox
A Security Box (SecBox) é um Módulo de Acionamento Externo (MAE) que se conecta ao iDFace Max através do conector de quatro pinos no verso do equipamento.

![alt text](https://www.controlid.com.br/docs/access-api-pt/img/idface_max_4_pins.png)

Esses pinos são utilizados para as seguintes funcionalidades:

| Pino | Cor | Descrição |
| :--- | :--- | :--- |
| +12V | Vermelho | Alimentação +12V |
| A | Azul | Comunicação A |
| B | Azul/Branco | Comunicação B |
| GND | Preto | Terra da fonte |
Na SecBox é possível encontrar um conector de seis pinos para o controle de porta/relé externo, como mostrado na imagem abaixo.

![alt text](https://www.controlid.com.br/docs/access-api-pt/img/secbox_6_pins.png)

Esses seis pinos seguem a seguinte especificação:

| Pino | Cor | Descrição |
| :--- | :--- | :--- |
| DS | Roxo | Entrada para Sensor de Porta |
| GND | Preto | Terra (Comum) |
| BT | Amarelo | Entrada para Botoeira |
| NC | Verde | Contato Normalmente Fechado |
| COM | Laranja | Contato Comum |
| NO | Azul | Contato Normalmente Aberto |
### Configuração da SecBox
O relé externo pode ser configurado via API através dos seguintes parâmetros:

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| sec_box_out_mode | string | Modo de saída da SecBox: "0": Normal (Autorizados), "1": Somente Rejeitados, "2": Campainha, "3": Alarme |
Cada modo de saída estabelecido por sec_box_out_mode funciona da seguinte maneira:

| Modo de saída | Valor | Descrição |
| :--- | :--- | :--- |
| Normal (Autorizados) | 0 | Aciona a SecBox ao ser realizada uma ação que desencadeie uma autenticação normal |
| Somente Rejeitados | 1 | Aciona a SecBox ao ser realizada uma ação que desencadeie uma rejeição de autenticação no equipamento |
| Campainha | 2 | Aciona a SecBox ao ser realizada uma ação que desencadeie o acionamento da campainha do dispositivo |
| Alarme | 3 | Aciona a SecBox ao ser realizada uma ação que desencadeie o acionamento do alarme do dispositivo |
#### Exemplo de requisição para configuração da SecBox
A requisição deve ser feita através do método POST ao endpoint /set_configuration.fcgi.

Esta requisição configura o modo de saída da SecBox para operar em modo normal (autorizados):

```javascript
$.ajax({
    url: "/set_configuration.fcgi?session=" + session,
    type: "POST",
    contentType: "application/json",
    data: JSON.stringify({
        "general": {
            "sec_box_out_mode": "0"
        }
    })
});
```
### Relé interno
Na traseira do iDFace Max é possível encontrar um conector de sete pinos.

![alt text](https://www.controlid.com.br/docs/access-api-pt/img/idface_max_7_pins.png)

Esse conector possui a seguinte configuração de pinos:

Pino	Cor	Descrição
GPIO1	Amarelo	Pino Opcional 1
GPIO2	Amarelo	Pino Opcional 2
GPIO3	Amarelo	Pino Opcional 3
GND	Preto	Terra (Comum)
NC	Verde	Contato Normalmente Fechado
COM	Laranja	Contato Comum
NO	Azul	Contato Normalmente Aberto
Além do relé externo existente na SecBox, o iDFace Max possui um relé interno que pode ser configurado de acordo com as necessidades da instalação. Para acessar o relé interno, existem três pinos de importância: NC, COM e NO. Utilizando esses três pinos, é possível acoplar um módulo externo e acioná-lo de acordo com o comportamento desejado.

### Configuração do relé interno
O relé interno pode ser configurado via API através dos seguintes parâmetros:

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| relay_out_mode | string | Modo de saída do relé: "0": Normal (Autorizados), "1": Somente Rejeitados, "2": Campainha, "3": Alarme |
| relay1_enabled | string | "0": Relé desabilitado, "1": Relé habilitado |
| relay1_auto_close | string | "0": Fechamento inteligente desabilitado, "1": Fechamento inteligente habilitado |
| relay1_timeout | string | Tempo de abertura em milissegundos (min: "100", max: "10000") |
Cada modo de saída estabelecido por relay_out_mode funciona da seguinte maneira:

| Modo de saída | Valor | Descrição |
| :--- | :--- | :--- |
| Normal (Autorizados) | 0 | Aciona o relé interno ao ser realizada uma ação que desencadeie uma autenticação normal |
| Somente Rejeitados | 1 | Aciona o relé interno ao ser realizada uma ação que desencadeie uma rejeição de autenticação no equipamento |
| Campainha | 2 | Aciona o relé interno ao ser realizada uma ação que desencadeie o acionamento da campainha do dispositivo |
| Alarme | 3 | Aciona o relé interno ao ser realizada uma ação que desencadeie o acionamento do alarme do dispositivo |
#### Exemplo de requisição para configuração do relé interno
A requisição deve ser feita através do método POST ao endpoint /set_configuration.fcgi.

Esta requisição habilita o relé interno para operar em modo normal (autorizados), com fechamento inteligente habilitado e tempo de abertura de 3 segundos:

```javascript
$.ajax({
    url: "/set_configuration.fcgi?session=" + session,
    type: "POST",
    contentType: "application/json",
    data: JSON.stringify({
        "general": {
            "relay1_enabled": "1",
            "relay_out_mode": "0",
            "relay1_auto_close": "1",
            "relay1_timeout": "3000"
        }
    })
});
```
### GPIOs de expansão
Na parte de trás do iDFace Max é possível encontrar um conector de sete pinos.

Esse conector possui a seguinte configuração de pinos:

Pino	Cor	Descrição
GPIO1	Amarelo	Pino Opcional 1
GPIO2	Amarelo	Pino Opcional 2
GPIO3	Amarelo	Pino Opcional 3
GND	Preto	Terra (Comum)
NC	Verde	Contato Normalmente Fechado
COM	Laranja	Contato Comum
NO	Azul	Contato Normalmente Aberto
Para estender as possibilidades de operação do iDFace Max, é possível utilizar as GPIOs de expansão. Estas consistem de três pinos: GPIO1, GPIO2 e GPIO3.

É possível configurar o comportamento individual dessas GPIOs, para que o dispositivo execute a ação desejada ao receber um sinal através de seu respectivo pino.

### Configuração das GPIOs de expansão
As GPIOs podem ser configuradas via API através dos seguintes parâmetros.

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| gpio_ext[1-3]_mode | string | Modo de operação: "0": Desabilitado, "1": Habilitar facial, "2": Alarme, "3": Emergência, "4": Lockdown, "5": Interfonia, "6": Intertravamento, "7": Abrir relé, "8": Abrir SecBox, "9": Abrir relé/SecBox |
| gpio_ext[1-3]_idle | string | Ativação: "0": Nível ativo 1, normalmente fechado (NC), "1": Nível ativo 0, normalmente aberto (NO) |
Cada modo de operação estabelecido por gpio_extN_mode (onde N indica o número da GPIO) funciona da maneira descrita na tabela abaixo.

Alguns sinais são acionados pelo fim do pulso, enquanto outros são acionados pelo nível de sinal. * Pulso: É esperada um ciclo de operação idle->ativo->idle. A ação é executada na borda de descida do pulso (i.e. transição ativo->idle). * Sinal: É esperado que o sinal seja fornecido de forma constante. Ativo: executa a ação continuamente; idle: interrompe ação.

Caso seja atribuído o mesmo modo de operação a mais de uma GPIO, seu funcionamento corresponderá a uma lógica OU, onde basta que ao menos uma das GPIOs seja ativada para que o respectivo modo de operação seja executado. O modo de operação Habilitar facial é uma exceção, pois caso mais de uma GPIO seja configurada como tal, todas as GPIOS devem ser acionadas para que a funcionalidade entre em vigor, correspondendo a uma lógica E.

| Modo de operação | Valor | Detecção | Múltiplas GPIOs | Descrição |
| :--- | :--- | :--- | :--- | :--- |
| Desabilitado | "0" | --- | --- | GPIO não realiza nenhuma operação |
| Habilitar facial | "1" | Sinal | Lógica E | Ao ativar a GPIO, habilita a identificação (mantém desabilitada se desativada) |
| Alarme | "2" | Pulso | Lógica OU | Ao ativar a GPIO, aciona o alarme |
| Emergência | "3" | Pulso | Lógica OU | Ao ativar a GPIO, o equipamento entra em modo de emergência |
| Lockdown | "4" | Pulso | Lógica OU | Ao ativar a GPIO, o equipamento entra em modo de lockdown |
| Interfonia | "5" | Pulso | Lógica OU | Ao ativar a GPIO, o equipamento liga para o servidor SIP configurado |
| Intertravamento | "6" | Sinal | Lógica OU | Ao ativar a GPIO, impede a abertura da porta |
| Abrir relé | "7" | Pulso | Lógica OU | Ao ativar a GPIO, aciona o relé interno do equipamento |
| Abrir SecBox | "8" | Pulso | Lógica OU | Ao ativar a GPIO, aciona o relé externo na SecBox |
| Abrir relé/SecBox | "9" | Pulso | Lógica OU | Ao ativar a GPIO, aciona o relé interno em conjunto com o relé externo |
#### Exemplo de requisição para configuração das GPIOs de expansão
A requisição deve ser feita através do método POST ao endpoint /set_configuration.fcgi.

Esta requisição configura a GPIO1 para abrir o relé com o comportamento normalmente fechado, a GPIO2 desabilitada e a GPIO3 para abrir a SecBox tendo comportamento normalmente aberto:

```javascript
$.ajax({
    url: "/set_configuration.fcgi?session=" + session,
    type: "POST",
    contentType: "application/json",
    data: JSON.stringify({
        "general": {
            "gpio_ext1_mode": "7",
            "gpio_ext1_idle": "0",
            "gpio_ext2_mode": "0",
            "gpio_ext3_mode": "8",
            "gpio_ext3_idle": "1"
        }
    })
});
```

## Fazer login
Comando para criar uma sessão, que é necessária para todos os outros comandos, exceto session_is_valid. O método HTTP usado para o envio dos dados é o POST.

### POST /login.fcgi
| Parâmetro | Tipo | Descrição |
| :--- | :--- | :--- |
| login | string | O valor padrão é admin |
| password | string | O valor padrão é admin |
Resposta

session (string) : Código da sessão iniciada.
Exemplo de requisição
Esta requisição irá criar a sessão e armazená-la na variável session.

$.ajax({
  url: "/login.fcgi",
  type: 'POST',
  contentType: 'application/json',
  data: JSON.stringify({
    login: 'admin',
    password: 'admin'
  }),
  success: function(data) {
    session = data.session;
  }
});
Exemplo de resposta
```json
{
    "session": "q/AcfpiU3QLRUqHKNrAh5srT"
}
```

## Fazer logout
Comando para finalizar a sessão corrente.

### POST /logout.fcgi
Parâmetros

Essa chamada não possui parâmetros
Resposta

Esta chamada não possui retorno.
Exemplo de requisição
```javascript
$.ajax({
  url: "/logout.fcgi?session=" + session,
  type: 'POST',
  contentType: 'application/json'
});
```

Verificar validade da sessão
Comando para verificar a validade de uma sessão.

### POST /session_is_valid.fcgi
Parâmetros

Esta chamada não possui parâmetros.
Resposta

session (string) : Código da sessão iniciada.
Exemplo de requisição
```javascript
$.ajax({
  url: "/session_is_valid.fcgi?session=" + session,
  type: 'POST',
  contentType: 'application/json'
});
```
Exemplo de resposta
{
    "session_is_valid": true
}

Alterar usuário e senha de login
Comando para alterar o usuário e/ou a senha utilizados para login no equipamento.

POST /change_login.fcgi
Parâmetros

login (string) : Nome do usuário a ser usado para o login no equipamento.
password (string) : Senha do usuário a ser usada para login no equipamento. Deve ser em texto claro, sem Hash.
Resposta

Esta chamada não possui retorno.
Exemplo de requisição
$.ajax({
  url: "/change_login.fcgi?session=" + session,
  type: 'POST',
  contentType: 'application/json',
    data: JSON.stringify({
    login: "WalterWhite",
    password: "Heisenberg"
  })
});

## Introdução a Objetos
Os objetos mencionados nesta documentação representam as estruturas de dados interna do dispositivo, onde com o uso desta API registros podem ser criados, modificados e apagados.

A imagem abaixo descreve o relacionamento entre os objetos (tabelas) contidos no tópico Lista de Objetos:

![alt text](https://www.controlid.com.br/docs/access-api-pt/img/public_acfw_er.png)

## Lista de Objetos
Veja abaixo a descrição de todos os objetos da linha de acesso, a lista identifica alguns dos diferentes tipos de recursos que você pode utilizar usando a API e também suporta métodos para inserir, atualizar, buscar e excluir muitos deles.

### users
Representa um usuário.

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| id | int 64 | Identificador único de um usuário (obrigatório). |
| registration | string | Texto representando a matrícula de um usuário (obrigatório). |
| name | string | Texto contendo o nome de um usuário (obrigatório). |
| password | string | String que representa a senha do usuário após o processo de Hash. |
| salt | string | String representando o Salt usado para calcular o Hash da senha do usuário. |
| user_type_id | int | Inteiro que representa o tipo de usuário cadastrado. Para um usuário do tipo Visitante, este campo é definido como 1; para o tipo Usuário, o campo não possui valor definido (nulo). |
| begin_time | int | Inteiro representando a partir de que data e hora (Unix timestamp) o usuário é válido. |
| end_time | int | Inteiro representando até que data e hora (Unix timestamp) o usuário é válido. |
| image_timestamp | int | Inteiro representando a data e hora (Unix timestamp) em que a imagem do usuário foi cadastrada. |
| last_access | int | Inteiro representando a data e hora (Unix timestamp) do último acesso feito pelo usuário. |
### change_logs
Registro das operações (inserção, atualização e remoção) realizadas nos objetos: users, templates, face_templates e cards.

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| id | int 64 | Identificador único do registro (obrigatório). |
| operation_type | string | Texto representando a operação que foi realizada (obrigatório). |
| table_name | string | Texto contendo o nome do objeto alterado (obrigatório). |
| table_id | int | Inteiro representando o identificador de qual atributo do objeto foi modificado (obrigatório). |
| timestamp | int | Inteiro representando o horário em foi feita a operação, em formato UNIX timestamp (obrigatório). |
### templates
Dados biométricos das impressões digitais dos usuários (referidas a seguir como biometrias).

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| id | int 64 | Identificador único de uma biometria (obrigatório). |
| finger_position | int | Campo reservado. |
| finger_type | int | Tipo de biometria dedo comum valor 0 ou dedo de pânico valor 1 (obrigatório). |
| template | string base 64 | String em base 64 representando um template biométrico. |
| user_id | int 64 | Identificador único do usuário a quem essa biometria pertence (obrigatório). |
### cards
Representa os cartões de identificação por proximidade.

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| id | int 64 | Identificador único de uma cartão de identificação (obrigatório). |
| value | unsigned int 64 | Este campo indica a numeração do cartão. (obrigatório e único). |
| user_id | int 64 | Identificador único do usuário ao qual pertence o cartão de identificação (obrigatório). |
### qrcodes
Representa os QR Codes utilizados para identificação.

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| id | int 64 | Identificador único de um QR Code de identificação (obrigatório). |
| value | string | Conteúdo representado no QR Code. (obrigatório e único). |
| user_id | int 64 | Identificador único do usuário ao qual pertence o QR Code de identificação (obrigatório). |
### uhf_tags
Representa as tags UHF utilizadas para identificação.

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| id | int 64 | Identificador único de uma tag UHF de identificação (obrigatório). |
| value | string | Valor lido pela tag UHF em hexadecimal. (obrigatório e único). |
| user_id | int 64 | Identificador único do usuário ao qual pertence a tag UHF de identificação (obrigatório). |
pins
### pins
Representa os PINs utilizados para identificação.

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| id | int 64 | Identificador único de um PIN de identificação (obrigatório). |
| value | string | Valor do PIN. (obrigatório e único). |
| user_id | int 64 | Identificador único do usuário ao qual pertence o PIN (obrigatório e único). |
### alarm_zones
Dados referentes às zonas de alarmes.

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| zone | int | Identificador único de uma zona de alarme (obrigatório). |
| enabled | int | Indica se a entrada de alarme está habilitada (1) ou não (0) (obrigatório). |
| active_level | int | Indica se a entrada esta configurada como 'ativo alto' (1) ou 'ativo baixo' (0) (obrigatório). |
| alarm_delay | int | Tempo de atraso no disparo do alarme (obrigatório). |
user_roles
Relaciona usuários a níveis de privilégio. Contém apenas usuários que tenham algum nível de privilégio diferente do padrão.

Campo	Tipo	Descrição
user_id	int 64	Identificador único do usuário (obrigatório).
role	int	Se este campo estiver definido como 1, o usuário é um administrador (obrigatório).
groups
Representa os grupos de acesso. Nas interfaces nativa do equipamento e na interface web, esse tipo de objeto é referido por departamento.

### groups
Representa os grupos de acesso.

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| id | int 64 | Identificador único do grupo de acesso (obrigatório). |
| name | int | Nome do grupo de acesso (obrigatório). |
### user_groups
Relaciona os usuários as grupos de acesso.

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| user_id | int 64 | Identificador do usuário (obrigatório). |
| group_id | int | Identificador do grupo de acesso (obrigatório). |
### scheduled_unlocks
Representa as liberações agendadas de acesso.

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| id | int 64 | Identificador único da liberação agendada (obrigatório). |
| name | string | Nome da liberação agendada (obrigatório). |
| message | string | Mensagem a ser exibida durante a liberação. |
### actions
Objeto que representa os scripts de ação.

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| group_id | int 64 | Identificador único do script de ação no banco de dados (obrigatório). |
| name | string | Nome descritivo da ação (obrigatório). |
| action | string | Nome do arquivo do script de ação (obrigatório). |
| parameters | string | Parâmetros do script de ação (obrigatório). |
| run_at | int | Local de execução (0: local, 1: global, 2: servidor). |
### areas
Representa as áreas cujo acesso se deseja controlar.

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| id | int 64 | Identificador único da área (obrigatório). |
| name | string | Nome descritivo da área (obrigatório). |
### portals
Representa os portais. Um portal liga duas áreas e tem uma única direção.

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| id | int 64 | Identificador único do portal (obrigatório). |
| name | string | Nome descritivo do portal (obrigatório). |
| area_from_id | int 64 | Identificador da área de origem (obrigatório). |
| area_to_id | int 64 | Identificador da área de destino (obrigatório). |
### portal_actions
Relaciona portais e ações.

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| portal_id | int 64 | Identificador do portal (obrigatório). |
| action_id | int 64 | Identificador do ação (obrigatório). |
### access_rules
Representa as regras de acesso.

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| id | int 64 | Identificador da regra de acesso (obrigatório). |
| name | string | Nome descritivo da regra de acesso (obrigatório). |
| type | int | Tipo (0: bloqueio, 1: permissão). |
| priority | int | Campo reservado (obrigatório). |
### portal_access_rules
Relaciona portais e regras de acesso.

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| portal_id | int 64 | Identificador do portal (obrigatório). |
| access_rule_id | int 64 | Identificador da regra de acesso (obrigatório). |
### group_access_rules
Relaciona grupos e regras de acesso.

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| group_id | int 64 | Identificador do grupo (obrigatório). |
| access_rule_id | int 64 | Identificador da regra de acesso (obrigatório). |
### scheduled_unlock_access_rules
Relaciona liberações agendadas e regras de acesso.

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| scheduled_unlock_id | int 64 | Identificador da liberação agendada (obrigatório). |
| access_rule_id | int 64 | Identificador da regra de acesso (obrigatório). |
### time_zones
Conjunto de intervalos que representa o critério de horário de uma regra de acesso.

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| id | int 64 | Identificador do horário (obrigatório). |
| name | string | Nome descritivo do horário (obrigatório). |
### time_spans
Um dos intervalos de um horário.

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| id | int 64 | Identificador do intervalo (obrigatório). |
| time_zone_id | int 64 | Horário ao qual esse intervalo pertence (obrigatório). |
| start | int | Horário de início do intervalo. Em segundos desde às 0h (obrigatório). |
| end | int | Horário de término do intervalo. Em segundos desde às 0h (obrigatório). |
| sun, mon, tue, wed, thu, fri, sat | int | Indica se o intervalo está ativo para os respectivos dias (obrigatório). |
| hol1, hol2, hol3 | int | Indica se o intervalo está ativo para os feriados do tipo 1, 2 e 3 (obrigatório). |
### contingency_cards
Cadastra uma lista de cartões que estará disponível em modo contingência.

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| id | int | Identificador único do cartão (obrigatório). |
| value | int 64 | Número do cartão liberado no modo de contingência (obrigatório). |
### contingency_card_access_rules
Vincula a regra de acesso para os cartões em contingency_cards.

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| access_rule_id | int 64 | ID da regra de acesso em contingência (padrão: 1). (obrigatório). |
### holidays
Contém os feriados e seus tipos.

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| id | int | Identificador do feriado (obrigatório). |
| name | string | Nome descritivo do feriado (obrigatório). |
| start, end | int | Início e fim do feriado em UNIX timestamp (obrigatório). |
| hol1, hol2, hol3 | int | Grupo do feriado (0 ou 1) (obrigatório). |
| repeats | int | Se repete anualmente (0 ou 1) (obrigatório). |
### alarm_zone_time_zones
Relaciona zonas de alarme e horários.

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| alarm_zone_id | int 64 | Identificador da zona de alarme (obrigatório). |
| time_zone_id | int 64 | Identificador do horário (obrigatório). |
### access_rule_time_zones
Relaciona regras de acesso e horários.

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| access_rule_id | int 64 | Identificador da regra de acesso (obrigatório). |
| time_zone_id | int 64 | Identificador do horário (obrigatório). |
### access_logs
Contém os logs de acesso do equipamento.

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| id | int 64 | Identificador do log de acesso (obrigatório). |
| time | int | Horário da ocorrência em Unix Timestamp. |
| event | int | Tipo do evento (7: Acesso concedido, 6: Acesso negado, etc.). |
| device_id | int 64 | Equipamento onde o evento ocorreu. |
| user_id | int | Usuário envolvido na ocorrência. |
| portal_id | int | Portal envolvido na ocorrência. |
| card_value, pin_value, qrcode_value | mixed | Valor da credencial utilizada. |
| confidence | int 64 | Grau de confiança (0-1800). |
| mask | int 64 | Uso de máscara (1: Sim, 0: Não). |
### access_log_access_rules
Regras de acesso de um log de acesso.

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| access_log_id | int 64 | Identificador do log de acesso (obrigatório). |
| access_rule_id | int 64 | Identificador da regra de acesso (obrigatório). |
### alarm_logs
Contém os logs de alarmes do equipamento.

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| id | int 64 | Identificador do log de alarme (obrigatório). |
| event | int | Tipo do evento (Alarme ativado/desativado). |
| cause | int | Causa do evento (Porta aberta, Arrombamento, etc.). |
| user_id | int 64 | Usuário envolvido. |
| time | int | Horário em Unix Timestamp. |
| door_id | int | Porta envolvida. |
### devices
Equipamentos cadastrados na rede.

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| id | int 64 | Identificador do equipamento (obrigatório). |
| name | string | Nome descritivo (obrigatório). |
| ip | string | Endereço IP ou hostname (obrigatório). |
### user_access_rules
Vincula um usuário a uma regra de acesso.

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| user_id | int | Identificador único do usuário (obrigatório). |
| access_rule_id | int | Identificador único da regra de acesso (obrigatório). |
### area_access_rules
Vincula uma área a uma regra de acesso.

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| area_id | int | Identificador único da área (obrigatório). |
| access_rule_id | int | Identificador único da regra de acesso (obrigatório). |
### catra_infos
Informações de uso da catraca (iDBlock).

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| id | int | Identificador da catraca. |
| entrance_turns | int 64 | Revoluções de entrada. |
| exit_turns | int 64 | Revoluções de saída. |
### log_types
Tipos de log disponíveis.

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| id | int | Identificador do tipo (obrigatório). |
| name | string | Nome do tipo (obrigatório). |
### sec_boxs
Configuração do módulo de acionamento externo (SecBox).

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| id | int 64 | id da SecBox (padrão 65793). |
| enabled | bool | Se a SecBox está habilitada. |
| relay_timeout | int | Tempo de abertura do relê (ms). |
| door_sensor_enabled | bool | Se o sensor de porta está habilitado. |
| auto_close_enabled | int | Fechar relê ao abrir sensor (0 ou 1). |
### contacts
Contatos para interfonia SIP.

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| id | int | Identificador do contato. |
| name | string | Nome do contato. |
| number | string | Número (ramal). |
### timed_alarms
Sirene agendada para dias da semana.

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| id | int 64 | Identificador do alarme (obrigatório). |
| time | int | Horário em segundos desde o início do dia (obrigatório). |
| sun, mon, tue, wed, thu, fri, sat | int | Ativo para os respectivos dias (obrigatório). |
### access_events
Eventos de abertura de portas e ações da catraca.

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| id | int 64 | Identificador do evento (obrigatório). |
| event | string | Categoria (catra, secbox, door). |
| type | string | Tipo (TURN_LEFT, TURN_RIGHT, GIVE_UP, OPEN, CLOSE). |
| timestamp | int | Horário UNIX Timestamp (obrigatório). |
### custom_thresholds
Identificação facial customizada (iDFace).

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| user_id | int | Identificador único do usuário (obrigatório). |
| threshold | int | Valor do threshold customizado (obrigatório). |
### network_interlocking_rules
Regras de intertravamento remoto.

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| id | int | Identificador da regra. |
| ip | string | IP do dispositivo remoto (B) (obrigatório). |
| login, password | string | Credenciais do dispositivo remoto (obrigatório). |
| portal_name | string | Nome da regra (obrigatório). |
| enabled | int | 1: Habilitado, 0: Desabilitado (obrigatório). |

## Criar Objetos
Cria objetos do tipo especificado (similar ao INSERT).

POST /create_objects.fcgi
| Parâmetro | Tipo | Descrição |
| :--- | :--- | :--- |
| object | string | Tipo do objeto a ser criado. |
| values | array | Array de objetos JSON representando os registros. |
Resposta

ids (array de inteiros de 64 bits) : ids dos objetos criados.
#### Exemplo de requisição
```javascript
$.ajax({
  url: "/create_objects.fcgi?session=" + session,
  type: 'POST',
  contentType: 'application/json',
  data: JSON.stringify({
    object: "users",
    values: [{registration: '0123', name: 'Walter White', password: 'Heisenberg'}]
  })
});
```
#### Exemplo de resposta
```json
{"ids":[8]}
```

## Carregar Objetos
Carrega objetos do tipo especificado (similar ao SELECT).

POST /load_objects.fcgi
| Parâmetro | Tipo | Descrição |
| :--- | :--- | :--- |
| object | string | Tipo do objeto a ser carregado. |
| fields | array | Campos a serem recebidos (opcional). |
| limit, offset | int | Paginação (opcional). |
| order, group | array | Ordenação e agrupamento (opcional). |
| where | mixed | Filtros (opcional). |
Resposta

NOME_DO_OBJETO (array de objetos JSON) : Cada objeto JSON representa um objeto carregado.
#### Exemplo de requisição
```javascript
$.ajax({
  url: "/load_objects.fcgi?session=" + session,
  type: 'POST',
  contentType: 'application/json',
  data: JSON.stringify({
    object: "users"
  })
});
```
#### Exemplo de resposta
```json
{
    "users":[{"id":1,"registration":"","name":"th0","password":""...}]
}
```
#### Exemplo de requisição (Filtros)
```javascript
$.ajax({
      url: "/load_objects.fcgi?session=" + session,
      type: 'POST',
      contentType: 'application/json',
      data: JSON.stringify({
        "object": "access_logs",
        "where":[
          {
              "object": "access_logs",
              "field": "id",
              "operator": ">",
              "value": 1,
              "connector": ") AND ("            
          },
          {
              "object": "access_logs",
              "field": "event",
              "operator": "=",
              "value": 7          
          }
        ]
      })
});
```
## Carregamento de Grandes Bases de Usuários
Para carregar grandes bases de usuários, utilize os endpoints de sincronização abaixo para garantir a integridade dos dados.

| Endpoint | Método | Descrição |
| :--- | :--- | :--- |
| `/template_sync_init.fcgi` | POST | Inicializa sincronismo de templates. |
| `/template_sync_end.fcgi` | POST | Finaliza sincronismo de templates. |

POST /template_sync_init.fcgi
Parâmetros

Esta chamada não possui parâmetros.

Resposta

Resposta vazia.

POST /template_sync_end.fcgi
Parâmetros

Esta chamada não possui parâmetros.

Resposta

Resposta vazia.

## Modificar Objetos
Modifica objetos do tipo especificado (similar ao UPDATE).

### POST /modify_objects.fcgi
| Parâmetro | Tipo | Descrição |
| :--- | :--- | :--- |
| object | string | Tipo do objeto. |
| values | object | Valores a serem alterados. |
| where | mixed | Filtros para seleção dos registros. |
Resposta

changes (int) : Número de mudanças efetuadas.
#### Exemplo de requisição
```javascript
$.ajax({
  url: "/modify_objects.fcgi?session=" + session,
  type: 'POST',
  contentType: 'application/json',
  data: JSON.stringify({
    object: "users",
    values: {name: 'Walter Hartwell White'},
    where: {
      users: {name: 'Walter White'}
    }
  })
});
```
#### Exemplo de resposta
```json
{"changes":2}
```

## Destruir Objetos
Destrói objetos do tipo especificado (similar ao DELETE).

### POST /destroy_objects.fcgi
| Parâmetro | Tipo | Descrição |
| :--- | :--- | :--- |
| object | string | Tipo do objeto. |
| where | mixed | Filtros para seleção dos registros. |
Resposta

changes (int) : Número de mudanças efetuadas.
#### Exemplo de requisição
```javascript
$.ajax({
  url: "/destroy_objects.fcgi?session=" + session,
  type: 'POST',
  contentType: 'application/json',
  data: JSON.stringify({
    object: "users",
    where: {
      users: {name: 'Walter White'}
    }
  })
});
```
#### Exemplo de resposta
```json
{"changes":0}
```

## Exportar Relatório
Geração de relatórios customizados (CSV/Text).

### POST /report_generate.fcgi
| Parâmetro | Tipo | Descrição |
| :--- | :--- | :--- |
| object | string | Tipo do objeto (obrigatório). |
| file_name | string | Nome do arquivo de saída (opcional). |
| delimiter | string | Delimitador de campo (ex: ";"). |
| header | string | Cabeçalho do relatório. |
| columns | array | Definição das colunas (campos, tipos, formatos). |
#### Exemplo de requisição
```javascript
$.ajax({
  url: "/report_generate.fcgi?session=" + session,
  type: 'POST',
  contentType: 'application/json',
  data: JSON.stringify({
      order:["ascending","name"],
      object:"users",
      delimiter:";",
      columns:[
        { type:"object_field", object:"users", field:"name" },
        { type:"object_field", object:"users", field:"id" }
      ]
  })
});
```
POST /export_afd.fcgi
Permite a extração de um relatório em formato AFD. O relatório pode ser utilizado como ferramenta para controle de ponto, sendo fornecido nele todos os registros de acesso autorizados que encontram-se armazenados no aparelho. O relatório AFD também pode ser gerado a partir da Interface WEB e da GUI do equipamento.

É possível filtrar a geração do relatório em formato AFD a partir de uma data inicial ou através de um NSR inicial.

O retorno pode seguir tanto o formato legado das Portarias anteriores (MTE 1510/2009, Inmetro 595/2013) quanto o formato definido pela Portaria 671. Caso a requisição contenha o parâmetro mode na query_string ou no body com o valor 671, o retorno seguirá o formato definido pela Portaria 671. Para qualquer outro valor, ou na ausência do parâmetro mode, o AFD retornado seguirá o formato da Portaria 595.

Exemplo de requisição
#### Parâmetros
| Parâmetro | Tipo | Descrição |
| :--- | :--- | :--- |
| initial_date | object | JSON com dia/mês/ano inicial. |
| initial_nsr | int | NSR inicial (filtro). |
| mode | int | 671 (Portaria 671) ou outro (Portaria 595). |
Resposta

Documento com extensão .txt contendo o relatório em formato AFD. O nome do documento respeita a norma para AFD, sendo construído com AFD + serial numérica do dispositivo.
#### Exemplos de requisição
```javascript
// Relatório integral (Portaria 595)
$.ajax({
  url: "/export_afd.fcgi?session=" + session,
  type: 'POST',
  contentType: 'application/json',
  data: JSON.stringify({})
});

// Relatório integral (Portaria 671)
$.ajax({
  url: "/export_afd.fcgi?session=" + session + "&mode=671",
  type: 'POST',
  contentType: 'application/json',
  data: JSON.stringify({})
});

// Com filtro de data
$.ajax({
    url: "/export_afd.fcgi?session=" + session,
    type: 'POST',
    contentType: 'application/json',
    data: JSON.stringify({ "initial_date": { "day": 11, "month": 7, "year": 2022 } })
});
```
### POST /export_audit_logs.fcgi
Extração de logs de auditoria (últimos 25.000 registros).
Permite a extração de Logs de Auditoria. O relatório pode ser utilizado como ferramenta para controle do dispositivo e verificação dos seus eventos, sendo fornecido nele os últimos 25000 registros, que é a quantidade máxima armazenada (com rotação) no banco de dados do equipamento.

É possível filtrar a geração do relatório a partir de 7 categorias de log de eventos.

#### Categorias e Parâmetros
| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| config | int | Logs de configurações (0/1). |
| api | int | Logs de acesso à API (0/1). |
| usb | int | Logs de pendrive USB (0/1). |
| network | int | Logs de rede (0/1). |
| time | int | Logs de alteração de horário (0/1). |
| online | int | Logs de conexões online (0/1). |
| menu | int | Logs de acesso ao menu (0/1). |
Resposta

Documento contendo os últimos 25000 logs de auditoria dos filtros desejados mais recentes em inglês, independentemente do idioma em que o equipamento está configurado.
#### Exemplo de requisição
```javascript
$.ajax({
    url: "/export_audit_logs.fcgi?session=" + session,
    type: 'POST',
    contentType: 'application/json',
    data: JSON.stringify({
        "config": 1, "api": 1, "usb": 1, "network": 1,
        "time": 1, "online": 1, "menu": 1
    })
});
```

## Autorização Remota de Acesso
Este tópico descreve como autorizar remotamente o acesso de um usuário em tempo real, exibindo nome e foto.

### POST /remote_user_authorization.fcgi
#### Parâmetros
| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| event | int | Tipo do evento (7: Acesso concedido, 6: Negado, etc.). |
| user_id | int | ID do usuário. |
| user_name | string | Nome do usuário. |
| user_image | bool | Se possui foto (true/false). |
| portal_id | string | ID do portal correspondente. |
| actions | array | Ações a executar (ex: `[{"action":"door", "parameters":"door=1"}]`). |
Resposta

Esta chamada não possui retorno.
#### Exemplos de requisição
```javascript
// iDAccess / iDFit / iDBox
$.ajax({
    url: "/remote_user_authorization.fcgi?session=" + session,
    type: 'POST', contentType: 'application/json',
    data: JSON.stringify({
        event: 7, user_id: 6, user_name: "Brian Cox",
        user_image: false, portal_id: 1,
        actions: [ { action: "door", parameters: "door=1" } ]
    })
});

// iDFlex / iDAccess Pro / iDAccess Nano
$.ajax({
    url: "/remote_user_authorization.fcgi?session=" + session,
    type: 'POST', contentType: 'application/json',
    data: JSON.stringify({
        event: 7, user_id: 6, user_name: "Brian Greene",
        user_image: false, portal_id: 1,
        actions: [ { action: "sec_box", parameters: "id=65793, reason=1" } ]
    })
});

// Catraca iDBlock
$.ajax({
    url: "/remote_user_authorization.fcgi?session=" + session,
    type: 'POST', contentType: 'application/json',
    data: JSON.stringify({
        event: 7, user_id: 6, user_name: "Neil deGrasse Tyson",
        user_image: false, portal_id: 1,
        actions: [ { action: "catra", parameters: "allow=clockwise" } ]
    })
});
```

## Abertura Remota Porta e Catraca
Permite abrir remotamente uma porta ou liberar o giro de uma catraca.

### POST /execute_actions.fcgi
#### Parâmetros
| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| actions | array | Array de objetos com `action` e `parameters`. |
| action | string | `door`, `sec_box`, `open_collector`, `catra`. |
| parameters | string | Parâmetros específicos da ação (ex: `door=1`). |
Resposta

Se o intertravamento via rede estiver habilitado, a chamada retornará informando se a ação foi permitida e executada. Caso contrário, não haverá retorno para esta chamada.
Exemplos de resposta:

Dispositivos conectados à SecBox, quando todas as portas de dispositivos remotos cadastrados no intertravamento via rede estiverem fechadas:

"actions": [
                {
                    "action": "sec_box",
                    "status": "allowed"
                }
            ]
Dispositivos conectados à SecBox, quando qualquer porta de um dispositivo remoto cadastrado no intertravamento via rede estiver aberta:

"actions": [
                {
                    "action": "sec_box",
                    "status": "denied"
                }
            ]
#### Exemplos de requisição
```javascript
// Abrir Relé (iDAccess/iDFit/iDBox)
$.ajax({
    url: "/execute_actions.fcgi?session=" + session,
    type: 'POST', contentType: 'application/json',
    data: JSON.stringify({ actions: [ { action: "door", parameters: "door=1" } ] })
});

// Abrir Relé (iDFlex/Pro/Nano)
$.ajax({
    url: "/execute_actions.fcgi?session=" + session,
    type: 'POST', contentType: 'application/json',
    data: JSON.stringify({ actions: [ { action: "sec_box", parameters: "id=65793, reason=3" } ] })
});

// Abrir Urna (iDBlock)
$.ajax({
    url: "/execute_actions.fcgi?session=" + session,
    type: 'POST', contentType: 'application/json',
    data: JSON.stringify({ actions: [ { action: "open_collector", parameters: "" } ] })
});

// Liberar Catraca (clockwise/anticlockwise/both)
$.ajax({
    url: "/execute_actions.fcgi?session=" + session,
    type: 'POST', contentType: 'application/json',
    data: JSON.stringify({ actions: [ { action: "catra", parameters: "allow=clockwise" } ] })
});
```
## Verificar Estado das Portas
Verifica se as portas estão abertas ou fechadas.

### POST /door_state.fcgi
Parâmetros

Esta chamada não possui parâmetros.
#### Exemplos de Resposta
```json
// Com SecBox
{
  "sec_boxes": [
    { "id": 122641794705017745, "open": false },
    { "id": 65793, "open": false }
  ]
}

// Com Relés Internos
{
  "doors": [
    { "id": 1, "open": false },
    { "id": 2, "open": false }
  ]
}
```
#### Exemplo de requisição
```javascript
$.ajax({
    url: "/doors_state.fcgi?session=" + session,
    type: 'POST', contentType: 'application/json',
    data: JSON.stringify({})
});
```

## Cadastro Remoto
Realiza o cadastro de credenciais (digital, face, cartão, PIN) remotamente.

### POST /remote_enroll.fcgi
#### Parâmetros
| Parâmetro | Tipo | Descrição |
| :--- | :--- | :--- |
| type | string | `card`, `face`, `biometry`, `pin`, `password`. |
| user_id | int | ID do usuário a ser cadastrado (obrigatório se `save=true`). |
| save | bool | Se deve salvar no equipamento (padrão: `false`). |
| panic_finger | int | 0 ou 1 (apenas para biometria). |
| registration | string | Matrícula do usuário. |
| message | string | Mensagem exibida no visor durante o cadastro. |
| sync | bool | `true` (síncrono), `false` (assíncrono). |
| auto | bool | Cadastro facial automático (sem confirmação manual). |
| countdown | int | Tempo de contagem para auto-cadastro (padrão: 5s). |
Resposta

Quando o parâmetro "type" (acima) tiver o valor "biometry", o retorno será composto de success, user_id, device_id e, se o cadastro for bem-sucedido, finger_type e a lista fingerprints, contendo width, height e image da impressão digital de cada etapa do cadastro. Se o cadastro falhar, o retorno conterá o elemento error.
Quando o parâmetro "type" (acima) tiver o valor "face" o retorno será composto de success, user_id, device_id e user_image (se o cadastro for bem-sucedido) ou error (se o cadastro falhar). Além disso, caso o erro seja FACE_EXISTS — erro relacionado a uma tentativa de cadastro de face que coincide com a de outro usuário já cadastrado — é retornado o ID do usuário cadastrado correspondente. O ID é indicado através do parâmetro match_user_id e é retornado dentro da seguinte estrutura JSON: info { match_user_id: valor }
Quando o parâmetro "type" (acima) tiver o valor "card" o retorno será composto de success, user_id, device_id e card_value (se o cadastro for bem-sucedido) ou error (se o cadastro falhar).
Quando o parâmetro "type" (acima) tiver o valor "pin" o retorno será composto de success, user_id, device_id e pin_value (se o cadastro for bem-sucedido) ou error (se o cadastro falhar).
Quando o parâmetro "type" (acima) tiver o valor "password" o retorno será composto de success, user_id, device_id e password_value (se o cadastro for bem-sucedido) ou error (se o cadastro falhar).
> [!IMPORTANT]
> Para o cadastro assíncrono (`sync: false`), o monitor deve estar configurado e os endpoints devem estar implementados no servidor.
> Não é recomendado usar `save: true` em modo assíncrono, pois a imagem não é retornada diretamente.
#### Exemplos de requisição
```javascript
// Cadastro de Biometria
$.ajax({
    url: "/remote_enroll.fcgi?session=" + session,
    type: 'POST', contentType: 'application/json',
    data: JSON.stringify({ type: "biometry", user_id: 123, message: "Teste", save: true })
});

// Cadastro Síncrono de Face
$.ajax({
    url: "/remote_enroll.fcgi?session=" + session,
    type: 'POST', contentType: 'application/json',
    data: JSON.stringify({ type: "face", user_id: 123, save: true, sync: true })
});

// Cadastro Automático de Face (3s)
$.ajax({
    url: "/remote_enroll.fcgi?session=" + session,
    type: 'POST', contentType: 'application/json',
    data: JSON.stringify({ type: "face", user_id: 123, save: true, sync: true, auto: true, countdown: 3 })
});
```
### POST /cancel_remote_enroll.fcgi
Cancela um cadastro remoto em andamento.
Cancelar cadastro remoto em andamento: Este comando pode ser utilizado a qualquer momento que for necessário interromper o processo de cadastro descrito acima (remote_enroll). O método HTTP usado é o POST.

Parâmetros

Esta chamada não possui parâmetros.
Resposta

Esta chamada não possui retorno.
#### Exemplo de requisição
```javascript
$.ajax({
    url: "/cancel_remote_enroll.fcgi?session=" + session,
    type: 'POST', contentType: 'application/json'
});
```
### POST /card_create.fcgi
Recebe o resultado do cadastro remoto de cartão (modo online).

| Parâmetro | Tipo | Descrição |
| :--- | :--- | :--- |
| user_id | int 64 | ID do usuário. |
| card_value | int 64 | Número do cartão. |
device_id (int 64) : Esse número representa o id do device.
Resposta

Esta chamada não possui retorno.
Exemplo de requisição
Exemplo de Mensagem:

{
    "user_id": 1,
    "card_value": 132456789,
    "device_id": 935107
}
POST /fingerprint_create.fcgi
Quando ocorrer o cadastro remoto de biometria em algum modo online, o resultado virá por este endpoint e deverá conter as imagens (fotos) do dedo capturadas pelo equipamento. O método HTTP usado é o POST e o contentType é application/json.

Parâmetros

user_id (int 64) : Esse número representa o id do usuário.
finger_type (int) : Onde 1 se for dedo de pânico, ou 0 caso não.
device_id (int 64) : Esse número representa o id do device que está ocorrendo o cadastro de cartão remoto.
fingerprints (array de objetos JSON) : Lista com as imagens de impressões digitais capturadas
image (string) : É o binário da imagem convertido para base64. Este binário é um bitmap de única cor onde cada byte representa um pixel. Portanto, um image deve conter width*height bytes.
width (int) : Largura da imagem.
height (int) : Altura da imagem.
Resposta

Esta chamada não possui retorno.
Exemplo de requisição
Exemplo de Mensagem:

{
    "user_id": 1,
    "finger_type": 0,
    "device_id": 935107,
    "fingerprints": [
        {
            "image": "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAY ... QK5JP3FQw2eE1oQf/9k=",
            "width": 300,
            "height": 200
        },
        {
            "image": "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAo ... D1odQIroECBAgQIJ/9k=",
            "width": 300,
            "height": 200
        },
        {
            "image": "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAE ... 8kP5Tl+u4uesqtj/2Q==",
            "width": 300,
            "height": 200
        }
    ]
}
Nota: Caso o equipamento esteja configurado para extrair templates, o endpoint chamado será template_create.fcgi que contém os templates extraídos pelo equipamento.

POST /face_create.fcgi
Quando ocorrer o cadastro remoto de face em algum modo online, o resultado virá por este endpoint e deverá conter a imagem da face capturada pelo equipamento. O método HTTP usado é o POST e o contentType é application/json.

Parâmetros

user_id (int 64) : Esse número representa o id do usuário.
device_id (int 64) : Esse número representa o id do device em que está ocorrendo o cadastro de cartão remoto.
face (array de objetos JSON) : Objeto com os dados da foto cadastrada.
image (string) : É o binário da imagem convertido para base64.
width (int) : Largura da imagem.
height (int) : Altura da imagem.
Resposta

Esta chamada não possui retorno.
Exemplo de requisição
Exemplo de Mensagem:

{
    "user_id": 1,
    "device_id": 935107,
    "face": {
        "image": "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAY ... QK5JP3FQw2eE1oQf/9k=",
        "width": 300,
        "height": 300
    }
}
POST /pin_create.fcgi
Quando ocorrer o cadastro remoto de PIN em algum modo online, o resultado virá por este endpoint. O método HTTP usado é o POST e o contentType é application/json.

Parâmetros

user_id (int 64) : Esse número representa o id do usuário.
pin_value (string) : Valor do PIN.
device_id (int 64) : Esse número representa o id do device.
Resposta

Esta chamada não possui retorno.
Exemplo de requisição
Exemplo de Mensagem:

{
    "user_id": 1,
    "pin_value": "1324",
    "device_id": 935107
}
POST /password_create.fcgi
Quando ocorrer o cadastro remoto de senha em algum modo online, o resultado virá por este endpoint. O método HTTP usado é o POST e o contentType é application/json.

Parâmetros

user_id (int 64) : Esse número representa o id do usuário.
password_value (string) : Valor da senha.
device_id (int 64) : Esse número representa o id do device.
Resposta

Esta chamada não possui retorno.
Exemplo de requisição
#### Exemplo de Mensagem
```json
{
    "user_id": 1,
    "password_value": "1324",
    "device_id": 935107
}
```

## Apresentar Mensagem na Tela
Envia uma mensagem para ser exibida no visor do equipamento.

### POST /message_to_screen.fcgi
#### Parâmetros
| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| message | string | Texto a ser exibido (vazio para limpar). |
| timeout | int | Tempo em ms (0 para infinito). |
Resposta

Esta chamada não possui retorno.
#### Exemplo de requisição
```javascript
$.ajax({
    url: "/message_to_screen.fcgi?session=" + session,
    type: 'POST', contentType: 'application/json',
    data: JSON.stringify({ message: "hello world!", timeout: 3000 })
});
```

## Acionamento Remoto Buzzer
Aciona o sinal sonoro (buzzer) do equipamento.

### POST /buzzer_buzz.fcgi
#### Parâmetros
| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| frequency | int | Frequência em Hz. |
| duty_cycle | int | Ciclo de trabalho (fração de tempo ativo). |
| timeout | int | Tempo em ms (máximo 3000). |
Resposta

Esta chamada não possui retorno.
#### Exemplo de requisição
```javascript
$.ajax({
    url: "/buzzer_buzz.fcgi?session=" + session,
    type: 'POST', contentType: 'application/json',
    data: JSON.stringify({ frequency: 4000, duty_cycle: 50, timeout: 1000 })
});
```

## Personalizar Mensagens de Eventos
Personalização de textos no display para iDFace e iDFace Max.

POST /set_configuration.fcgi
Parâmetros

Para personalizar as mensagens de identificação, os seguintes parâmetros são necessários:

#### Parâmetros
| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| custom_auth_message | string | Mensagem de acesso autorizado. |
| custom_deny_message | string | Mensagem de acesso negado. |
| custom_not_identified_message | string | Mensagem p/ usuário não identificado. |
| custom_mask_message | string | Mensagem p/ uso de máscara. |
| enable_custom_... | int | Habilita (1) ou Desabilita (0) a mensagem. |
Observação: O conteúdo das mensagens personalizadas pode ser cortado conforme o tamanho da tela do dispositivo.

Resposta

Esta chamada não possui retorno.
#### Exemplo de requisição
```javascript
$.ajax({
    url: "/set_configuration.fcgi?session=" + session,
    type: 'POST', contentType: 'application/json',
    data: JSON.stringify({
        "identifier": {
            "custom_auth_message": "Seja bem-vindo",
            "custom_deny_message": "Acesso negado",
            "custom_not_identified_message": "Usuário não reconhecido",
            "custom_mask_message": "Por favor, use máscara",
            "enable_custom_auth_message": "1",
            "enable_custom_deny_message": "1",
            "enable_custom_not_identified_message": "1",
            "enable_custom_mask_message": "1"
        }
    })
});
```

## Configurações Gerais (Facial)
Ajustes para o funcionamento do reconhecimento facial via `set_configuration.fcgi`.

Uso de máscara
Essa funcionalidade permite o reconhecimento da face de usuários que estão usando máscaras. Ou seja, se o dispositivo estiver instalado em um local onde o uso de máscara é obrigatório ou recomendado, essa função deve estar habilitada para que o reconhecimento dos usuários seja feito de forma correta. O parâmetro que define a ativação dessa função é o mask_detection_enabled. Os valores de entrada possíveis para ele são: "0" (desabilitado), indica que o acesso será autorizado ou não independentemente do uso de máscara; "1" (obrigatório), indica que o acesso somente será autorizado para usuários que estiverem utilizando máscara; e "2" (recomendado), indica que o acesso poderá ser autorizado sem a utilização de máscara, porém, uma mensagem será exibida ao usuário recomendando o uso de máscara. Por padrão de fábrica este parâmetro vem com o valor "0".

Obs: A restrição de acesso por uso de máscara só tem efeito quando o equipamento está operando em modo Standalone. Em modo Online, é enviado o parâmetro "face_mask" na resposta de identificação de usuário indicando se o usuário está de máscara, para validação de regra de acesso do lado do servidor.

Exemplo de requisição
Esta requisição configura os parâmetros de uso de máscara obrigatório.

$.ajax({
    url: "/set_configuration.fcgi?session=" + session,
    type: 'POST',
    contentType: 'application/json',
    data: JSON.stringify(
        {
            "face_id": {
                "mask_detection_enabled": "1",
            }
        }
    )
});
Modo de detecção
Essa funcionalidade oferece a possibilidade de utilizar o reconhecimento facial em dois modos diferentes, o veicular e o pedestre. O modo pedestre é o modo usual e é o padrão de fábrica. O modo veicular permite o reconhecimento de pessoas que estão em veículos. Ou seja, se o dispositivo estiver instalado em um local onde detecção será feita em usuários que estão no interior de um veículo, essa função deve estar habilitada para que o reconhecimento dos usuários seja feito de forma correta. O parâmetro que define a ativação dessa função é o vehicle_mode. Os valores de entrada possíveis para ele são: "0" (desabilitado) ou "1"(habilitado). Por padrão de fábrica este parâmetro vem com o valor "0" - modo pedestre.

Exemplo de requisição
Esta requisição configura os parâmetros do modo de detecção.

$.ajax({
    url: "/set_configuration.fcgi?session=" + session,
    type: 'POST',
    contentType: 'application/json',
    data: JSON.stringify(
        {
            "face_id": {
                "vehicle_mode": "1"
            }
        }
    )
});
### Tempo de reidentificação
Tempo em ms p/ reidentificar o mesmo usuário (Padrão: 30000ms).

Parâmetro: `max_identified_duration`

#### Exemplo de requisição
```javascript
$.ajax({
    url: "/set_configuration.fcgi?session=" + session,
    type: 'POST', contentType: 'application/json',
    data: JSON.stringify({ "face_id": { "max_identified_duration": "30000" } })
});
```
### Região de Interesse
Ajustes de Zoom e Deslocamento Vertical.

Parâmetros: `zoom` (1.0 a 3.25) e `vertical_crop` (-0.36 a 0.36).

#### Exemplo (Zoom)
```javascript
$.ajax({
    url: "/set_configuration.fcgi?session=" + session,
    type: 'POST', contentType: 'application/json',
    data: JSON.stringify({ "camera_overlay": { "zoom": "1.5" } })
});
```

#### Exemplo (Crop)
```javascript
$.ajax({
    url: "/set_configuration.fcgi?session=" + session,
    type: 'POST', contentType: 'application/json',
    data: JSON.stringify({ "camera_overlay": { "vertical_crop": "-0.06" } })
});
```
### Ativação dos LEDs brancos
Nível de luminosidade para acender os LEDs: 40 (Baixa), 280 (Média), 1500 (Alta), 1000000 (Sempre).

Parâmetro: `light_threshold_led_activation`

#### Exemplo de requisição
```javascript
$.ajax({
    url: "/set_configuration.fcgi?session=" + session,
    type: 'POST', contentType: 'application/json',
    data: JSON.stringify({ "face_module": { "light_threshold_led_activation": "40" } })
});
```
### Limite de detecção na tela
Limita a identificação facial à região visível no display.

Parâmetro: `limit_identification_to_display_region` (0/1).

#### Exemplo de requisição
```javascript
$.ajax({
    url: "/set_configuration.fcgi?session=" + session,
    type: 'POST', contentType: 'application/json',
    data: JSON.stringify({ "face_id": { "limit_identification_to_display_region": "1" } })
});
```
### Modo de Liveness
Ajusta o rigor da detecção de "rosto vivo".

Parâmetro: `liveness_mode` (0: Normal, 1: Rigoroso).

#### Exemplo de requisição
```javascript
$.ajax({
    url: "/set_configuration.fcgi?session=" + session,
    type: 'POST', contentType: 'application/json',
    data: JSON.stringify({ "face_id": { "liveness_mode": "1" } })
});
```
### Distância de Identificação
Ajusta a distância (em cm) para reconhecimento facial (30cm a 200cm).

Parâmetro: `min_detect_bounds_width`
Cálculo: `min_detect_bounds_width = 11.6 / distance_cm` (Ex: 40cm -> 0.29).

#### Exemplo de requisição
```javascript
$.ajax({
    url: "/set_configuration.fcgi?session=" + session,
    type: 'POST', contentType: 'application/json',
    data: JSON.stringify({ "face_id": { "min_detect_bounds_width": "0.29" } })
});
```
### Brilho dos LEDs
Ajusta a potência dos LEDs brancos (0 a 100%).

Parâmetro: `brightness` no módulo `led_white`.

#### Exemplo de requisição
```javascript
$.ajax({
    url: "/set_configuration.fcgi?session=" + session,
    type: 'POST', contentType: 'application/json',
    data: JSON.stringify({ "led_white": { "brightness": "70" } })
});
```

## Fotos em cadastro facial
Gerenciamento de fotos de usuários em terminais faciais.

> [!NOTE]
> Em equipamentos faciais, não é necessário lidar com templates; basta incluir a foto do usuário. Por padrão, as fotos são mantidas, mas podem ser configuradas para remoção automática após a geração do template.

### GET /user_get_image.fcgi
Obtém a foto de um usuário.

| Parâmetro | Tipo | Descrição |
| :--- | :--- | :--- |
| user_id | int 64 | ID do usuário. |
| get_timestamp | int | Se positivo (1), retorna JSON com timestamp. |
Resposta

Quando get_timestamp = 0:

Imagem do usuário em formato jpg
Quando get_timestamp = 1:

timestamp (int) : Valor de timestamp da foto cadastrada no padrão Unix Timestamp.
image (string) : Imagem de cadastro em formato base 64
#### Exemplo de requisição
```javascript
// Retorna foto em JPG
$.ajax({
  url: "/user_get_image.fcgi?user_id=123&get_timestamp=0&session=" + session,
  type: 'GET',
});
```

#### Exemplo de resposta (get_timestamp=1)
```json
{
  "timestamp": 1624997578,
  "image": "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAE ... SurHnqq4vn5U3Pf5H//Z"
}
```
### GET /user_list_images.fcgi
Obtém a lista de IDs de usuários com foto.

| Parâmetro | Tipo | Descrição |
| :--- | :--- | :--- |
| get_timestamp | int | Se positivo (1), retorna IDs e timestamps. |
#### Resposta
| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| user_ids | array | Lista de IDs (se `get_timestamp=0`). |
| image_info | array | Objetos com `user_id` e `timestamp` (se `get_timestamp=1`). |
#### Exemplo de requisição
```javascript
$.ajax({
  url: "/user_list_images.fcgi?get_timestamp=1&session=" + session,
  type: 'GET'
});
```

#### Exemplo de resposta
```json
{
  "image_info": [
    { "user_id": 1, "timestamp": 1628203752 },
    { "user_id": 2, "timestamp": 1628203752 },
    { "user_id": 3, "timestamp": 1628203752 }
  ]
}
```
### POST /user_get_image_list.fcgi
Obtém fotos em lote (limite: 100 usuários).

| Parâmetro | Tipo | Descrição |
| :--- | :--- | :--- |
| user_ids | array | Lista de IDs (obrigatório). |

#### Resposta
| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| user_images | array | Lista de objetos JSON com dados da foto. |
| id | int 64 | ID do usuário. |
| timestamp | int | Timestamp da foto. |
| image | string | Foto em Base64. |
| error | object | Detalhes em caso de falha (código e mensagem). |
Exemplo de requisição
Esta requisição irá retornar imagens de uma lista de usuários.

$.ajax({
  url: "/user_get_image_list.fcgi?session=" + session,
  type: 'POST',
  contentType: 'application/json'
  data: {
    user_ids: [ 1, 2, 3 ]
  }
});
Exemplo de resposta
{
  "user_images": [
    {
      "id": 1,
      "timestamp": 1626890032,
      "image": "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAE ... BrBRkuWacorVep//2Q=="
    },
    {
      "id": 2,
      "error": {
        "code": 1,
        "message": "User does not exist"
      }
    },
    {
      "id": 3,
      "timestamp": 1626889927,
      "image": "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAE ... 8kP5Tl+u4uesqtj/2Q=="
    }
  ]
}
Cadastrar foto de usuário
Salva e cadastra a foto de um usuário especificado pelo seu id. Diferentemente da grande maioria dos comandos desta API, o Content-Type deste comando deve ser necessariamente application/octet-stream. A imagem é passada no Content do método POST e as informações de cadastro são passadas na Query String. O arquivo da foto deve ter tamanho menor que 2MB.

Para cadastro de usuários em massa, recomenda-se o uso do endpoint /user_set_image_list.fcgi.

Recomendações sobre formato e tamanho das imagens, além de posicionamento de rosto para cadastro podem ser encontradas consultando o tópico Recomendações - fotos e instalação.

POST /user_set_image.fcgi
Parâmetros

user_id (int 64) : Identificador do usuário cuja foto será atribuída (obrigatório).
timestamp (int) : Timestamp no formato Unix Timestamp a ser registrado para o cadastro da foto (obrigatório).
match (int) : Assume os valores 0 ou 1. Quando seu valor é 1, o cadastro da foto deverá ser rejeitado se o rosto já estiver cadastrado para outro usuário. Para cadastros em massa, é recomendável não verificar duplicados (match = 0) para acelerar o processo.
Esses parâmetros são passados na Query String

Resposta

user_id (int 64) : Identificador do usuário cuja foto será atribuída.
scores (objeto JSON) : Medidas de posicionamento e qualidade da imagem recebida. São elas:
bounds_width (int) : Largura do rosto.
horizontal_center_offset (int) : Distância horizontal do centro do rosto ao centro da imagem.
vertical_center_offset (int) : Distância vertical do centro do rosto ao centro da imagem.
center_pose_quality (int) : Nota para qualidade de centralização, que indica se rosto está virado para a câmera ou se está torto.
sharpness_quality (int) : Nitidez da imagem.
success (bool) : Indica se o cadastro foi bem-sucedido ou não.
errors (array de objetos JSON) : Lista contendo um ou mais erros justificando um cadastro mal-sucedido. Para cada erro:
code (int) : Código correspondente ao erro informado.
message (string) : Mensagem descrevendo o erro.
Erros possíveis da imagem a ser cadastrada
Conforme descrito no tópico Recomendações - fotos e instalação, existem alguns critérios de qualidade da foto que devem ser seguidos para que o reconhecimento facial ocorra da maneira correta. Caso exista uma tentativa de cadastramento de foto remoto, inserindo um arquivo de imagem que não siga as recomendações previstas, haverá mensagens de erros informando os motivos pelos quais a foto não foi aceita. A seguir estão listados os códigos de erros e as mensagens correspondentes que explicam suas causas:

code 1: Corresponde a erros não relacionados com a qualidade do arquivo, mas sim com algum erro na passagem de parâmetros da requisição. Existem vários tipos de mensagens que podem surgir com erros desse código, alguns exemplos são:
message: "Image file not recognized. Image should be either JPG or PNG.", "User does not exist", "Invalid user_id".
code 2: Ocorre quando não é possível identificar uma face no arquivo de imagem enviado.
message: "Face not detected"
code 3: Ocorre quando há uma tentativa de cadastro de face que já existe. Além de retornar a mensagem de erro abaixo, é retornado também o ID do usuário que coincide com a foto enviada. O parâmetro match_user_id é quem indica o ID do usuário já existente que corresponde com a foto.
message: "Face exists"
info { match_user_id: 1 }
code 4: Ocorre quando as distâncias horizontais e verticais do centro do rosto ao centro da imagem estão muito significativas. Para entender quantitativamente como isso pode ser resolvido, deve-se analisar a reposta da requisição. No objeto JSON score, é preciso analisar os valores dos parâmetros horizontal_center_offset e vertical_center_offset. O valor máximo permitido para ambos é 1000. Portanto, quando esse valor é ultrapassado a seguinte mensagem é exibida:
message: "Face not centered"
code 5: Ocorre quando a largura do rosto na imagem é muito pequena (face distante da câmera). Para entender quantitativamente como isso pode ser resolvido, deve-se analisar a reposta da requisição. No objeto JSON score, é preciso analisar o valor do parâmetro bounds_width. O valor mínimo permitido é 60. Portanto, quando esse valor é ultrapassado a seguinte mensagem é exibida:
message: "Face too distant"
code 6: Ocorre quando a largura do rosto na imagem é muito grande (face muito perto da câmera). Para entender quantitativamente como isso pode ser resolvido, deve-se analisar a reposta da requisição. No objeto JSON score, é preciso analisar o valor do parâmetro bounds_width. O valor máximo permitido é 800. Portanto, quando esse valor é ultrapassado a seguinte mensagem é exibida:
message: "Face too close"
code 7: Ocorre quando a centralização do rosto não está boa, indicando que o rosto está torto em relação à câmera. Para entender quantitativamente como isso pode ser resolvido, deve-se analisar a reposta da requisição. No objeto JSON score, é preciso analisar o valor do parâmetro center_pose_quality. O valor máximo permitido é 400. Portanto, quando esse valor é ultrapassado a seguinte mensagem é exibida:
message: "Face pose not centered"
code 8: Ocorre quando a imagem cadastrada não possui nitidez suficiente para garantir o reconhecimento facial. Para entender quantitativamente como isso pode ser resolvido, deve-se analisar a reposta da requisição. No objeto JSON score, é preciso analisar o valor do parâmetro sharpness_quality. O valor mínimo permitido é 450. Portanto, quando esse valor é inferior a seguinte mensagem é exibida:
message: "Low sharpness"
code 9: Ocorre quando o rosto está muito próximo das bordas da imagem.
message: "Face too close to image borders"
#### Exemplo de requisição
```javascript
// Cadastro via octet-stream (binário)
$.ajax({
  url: "/user_set_image.fcgi?user_id=123&timestamp=1624997578&match=0&session=" + session,
  type: 'POST',
  contentType: 'application/octet-stream',
  data: [bytes da imagem]
});
```
#### Exemplo de resposta (Erro de nitidez)
```json
{
  "user_id": 123,
  "scores": {
    "bounds_width": 397,
    "horizontal_center_offset": 87,
    "vertical_center_offset": -75,
    "center_pose_quality": 698,
    "sharpness_quality": 105
  },
  "success": false,
  "errors": [ { "code": 8, "message": "Low sharpness" } ]
}
```
### POST /user_set_image_list.fcgi
Cadastra fotos em massa. Limite de requisição: 2MB.

| Parâmetro | Tipo | Descrição |
| :--- | :--- | :--- |
| match | bool | Evita duplicatas se `true` (padrão: `false`). |
| user_images | array | Objetos com `user_id`, `timestamp` e `image` (Base64). |
Resposta

results (array de objetos JSON) : Lista dos resultados individuais para o cadastro de cada foto enviada na requisição. Cada objeto de resultado possui o mesmo formato de resposta que o da chamada Cadastrar foto de usuário acrescido do respectivo identificador de usuário.
#### Exemplo de requisição
```javascript
$.ajax({
  url: "/user_set_image_list.fcgi?session=" + session,
  type: 'POST', contentType: 'application/json',
  data: JSON.stringify({
    "match": false,
    "user_images": [
      { "user_id": 20, "timestamp": 1628727478, "image": "..." },
      { "user_id": 23, "timestamp": 1628873297, "image": "..." }
    ]
  })
});
```
Exemplo de resposta
Considerando respectivamente as situações de:

Erro na requisição
Erro na imagem (Erros)
Rosto cadastrado com sucesso
Rosto rejeitado pelos critérios de validação
O resultado abaixo mostra os formatos de retorno correspondentes.

{
  "results": [
    {
      "user_id": 1,
      "success": false,
      "errors": [
        {
          "code": 1,
          "message": "Failed: Invalid member 'timestamp' (int expected, got string)"
        }
      ]
    },
    {
      "user_id": 2,
      "success": false,
      "errors": [
        {
          "code": 2,
          "message": "Face not detected"
        }
      ]
    },
    {
      "user_id": 3,
      "scores": {
        "bounds_width": 104,
        "horizontal_center_offset": 16,
        "vertical_center_offset": -150,
        "center_pose_quality": 768,
        "sharpness_quality": 1000
      },
      "success": true
    },
    {
      "user_id": 4,
      "scores": {
        "bounds_width": 151,
        "horizontal_center_offset": -16,
        "vertical_center_offset": -24,
        "center_pose_quality": 502,
        "sharpness_quality": 789
      },
      "success": false,
      "errors": [
        {
          "code": 7,
          "message": "Face pose not centered"
        }
      ]
    }
  ]
}
## Limiares Personalizados
Casos em que o rosto é rejeitado por semelhança.

### POST /create_objects.fcgi (`custom_thresholds`)
| Parâmetro | Tipo | Descrição |
| :--- | :--- | :--- |
| values | array | Objetos com `user_id` e `threshold`. |
| threshold | int | Novo valor de threshold (rigoroso). |
Resposta

ids (array de inteiros de 64 bits) : ids dos objetos criados.
#### Exemplo de requisição
```javascript
$.ajax({
  url: "/create_objects.fcgi?session=" + session,
  type: 'POST', contentType: 'application/json',
  data: JSON.stringify({
    object: "custom_thresholds",
    values: [{ threshold: 1200, user_id: 3 }]
  })
});
```
### POST /user_test_image.fcgi
Valida se uma imagem é apta para cadastro sem armazená-la.

| Parâmetro | Descrição |
| :--- | :--- |
| stream | Bytes da imagem (binário). |

#### Exemplo de requisição
```javascript
$.ajax({
  url: "/user_test_image.fcgi?session=" + session,
  type: 'POST', contentType: 'application/octet-stream',
  data: [bytes da imagem]
});
```
### POST /user_destroy_image.fcgi
Exclui fotos de usuários.

| Parâmetro | Tipo | Descrição |
| :--- | :--- | :--- |
| user_id | int 64 | ID do usuário único. |
| user_ids | array | Lista de IDs. |
| dangling | bool | Remove fotos órfãs (não vinculadas). |
| all | bool | Remove TODAS as fotos. |
Resposta

Esta chamada não possui retorno.
Exemplo de requisição
Remove a foto do usuário com id 123.

$.ajax({
  url: "/user_destroy_image.fcgi?session=" + session,
  type: 'POST',
  contentType: 'application/json',
  data: JSON.stringify({
    user_id: "123"
  })
});
## Remoção Automática de Foto
Configura se o equipamento deve manter a foto após gerar o template.

Parâmetro: `keep_user_image` no módulo `general` (1: Mantém, 0: Remove).

#### Exemplo de requisição
```javascript
$.ajax({
  url: "/set_configuration.fcgi?session=" + session,
  type: 'POST', contentType: 'application/json',
  data: JSON.stringify({ general: { "keep_user_image": '0' } })
});
```
Sincronização de fotos usuário
A API de cadastro facial pode ser utilizada também em situações nas quais se deseja sincronizar as fotos de usuário de um equipamento com um banco de dados externo. Para esses casos, é interessante fazer uso do parâmetro de timestamp de foto para identificar quais usuários precisam de atualização.

O conjunto de passos a seguir apresenta um método de sincronização utilizando as funções da API.

Obter usuários e timestamps de cadastro com user_list_images.
Para cada usuário, avaliar se o timestamp é maior no banco de dados do sistema externo ou do equipamento.
Separar os usuários cuja foto precisa ser atualizada.
Enviar o conjunto de fotos para atualização por usuário com user_get_image_list.

## Captura de Câmera
Captura uma imagem da câmera em ângulo maior que o display.

### POST /save_screenshot.fcgi
| Parâmetro | Tipo | Descrição |
| :--- | :--- | :--- |
| frame_type | string | Deve ser `camera`. |
| camera | string | `rgb` (colorida) ou `ir` (infravermelho). |

#### Resposta
Imagem capturada em formato **PNG**.
#### Exemplo de requisição
```javascript
$.ajax({
    url: "/save_screenshot.fcgi?session=" + session,
    type: 'POST', contentType: 'application/json',
    data: JSON.stringify({ "frame_type": "camera", "camera": "rgb" })
});
```

## Recomendações: Fotos e Instalação
Orientações para garantir a qualidade do reconhecimento facial.

### Fotos para cadastro
- **Formatos:** JPG ou PNG.
- **Enquadramento:** Apenas um rosto, olhando diretamente para a câmera.
- **Iluminação:** Uniforme, sem sombras excessivas.
- **Acessórios:** Sem máscara (recomendado), óculos escuros proibidos.

### Dimensões da imagem
- **Mínimo:** 160x160 pixels.
- **Máximo:** 1920x1080 pixels (Limite de 2.073.600 pixels totais).

### Critérios de Qualidade
- **Largura da face:** Nem muito perto, nem muito longe.
- **Centralização:** Rosto centralizado horizontal e verticalmente.
- **Pose:** Face voltada totalmente para a frente.

### Instalação Física
- **Ambiente:** Bem iluminado, evitando luz solar direta na lente.
- **Altura:** Recomendado 1,30m do chão.

## Informações da Catraca
Dispositivos iDBlock V2 e iDBlock Next IHM.

### GET /get_catra_info.fcgi
Obtém informações de giro (não persistentes após reset).
#### Resposta
| Campo | Descrição |
| :--- | :--- |
| left_turns | Giros para a esquerda. |
| right_turns | Giros para a direita. |
| entrance_turns | Giros para a entrada. |
| exit_turns | Giros para a saída. |
| total_turns | Total de giros. |

## Gerenciar Fotos (Legado/Contingência)
Ações para listar, inserir e apagar fotos.

> [!NOTE]
> Desnecessário em modo online (Push), exceto para usuários em modo de contingência.

### GET /user_get_image.fcgi
Obtém a foto do usuário (image/jpeg).

| Parâmetro | Tipo | Descrição |
| :--- | :--- | :--- |
| user_id | int 64 | ID do usuário. |
#### Exemplo de requisição
```javascript
$.ajax({
  url: "/user_get_image.fcgi?user_id=123&session=" + session,
  type: 'GET',
  contentType: 'image/jpeg',
});
```
### GET /user_list_images.fcgi
Lista IDs de usuários com foto.

| Campo | Descrição |
| :--- | :--- |
| user_ids | Array de IDs de usuários. |
#### Exemplo de requisição
```javascript
$.ajax({
  url: "/user_list_images.fcgi?session=" + session,
  type: 'GET'
});
```
#### Exemplo de resposta
```json
{ "user_ids": [1, 2, 3, 4, 5, 6] }
```
### POST /user_set_image.fcgi
Salva a foto do usuário (Limite: 1MB).

| Parâmetro | Tipo | Descrição |
| :--- | :--- | :--- |
| user_id | int 64 | ID do usuário (Query String). |
| body | binary | Bytes da imagem (octet-stream). |
#### Exemplo de requisição
```javascript
$.ajax({
  url: "/user_set_image.fcgi?user_id=123&session=" + session,
  type: 'POST',
  contentType: 'application/octet-stream',
  data: [bytes da imagem]
});
```
### POST /user_set_image_list.fcgi
Inserção em massa (Limite: 1MB por requisição).

| Parâmetro | Tipo | Descrição |
| :--- | :--- | :--- |
| user_images | array | Objetos com `user_id` e `image` (Base64). |
#### Exemplo de requisição
```javascript
$.ajax({
  url: "/user_set_image_list.fcgi?session=" + session,
  type: 'POST', contentType: 'application/json',
  data: {
    "user_images": [
      { "user_id": 1, "image": "<base64>" },
      { "user_id": 2, "image": "<base64>" }
    ]
  }
});
```
### POST /user_destroy_image.fcgi
Exclui fotos de usuários.

| Parâmetro | Tipo | Descrição |
| :--- | :--- | :--- |
| user_id | int 64 | ID do usuário único. |
| user_ids | array | Lista de IDs. |
| dangling | bool | Remove fotos órfãs (não vinculadas). |
| all | bool | Remove TODAS as fotos. |
Resposta

Esta chamada não possui retorno.
Exemplo de requisição
Remove a foto do usuário com id 123.

$.ajax({
  url: "/user_destroy_image.fcgi?session=" + session,
  type: 'POST',
  contentType: 'application/json',
  data: JSON.stringify({
    user_id: "123"
  })
});

Gerenciar Logotipo
Utilize as funções descritas abaixo para obter, alterar e remover os logotipos do terminal de acesso.

Os dispositivos podem armazear até 8 logos em slots diferentes e mostram exclusivamente um por vez.

Obter logotipo
Retorna a imagem de logotipo que está gravada no equipamento, o content_type é image/png. Quando um logotipo é carregado no equipamento, ele é exibida constantemente na tela principal se estiver habilitado.

POST /logo.fcgi
Esta requisição demanda ao dispositivo uma resposta com o logo armazenado no slot especificado. Caso nenhum slot seja especificado, a resposta será referente ao logo armazenado no primeiro slot.

Parâmetros

id: inteiro (de 1 a 8) (opcional)
Indica o índice do slot do qual recuperar o logotipo
Resposta

Imagem de logotipo previamente carregada no equipamento.
Exemplo

$.ajax({
    url: "/logo.fcgi?session=" + session + "&id=5",
    type: 'POST',
    content-type: 'image/png',
});
Irá recuperar logo na 6ª posição ou uma mensagem caso não haja nenhum.

Alterar logotipo
Altera a imagem de logotipo do equipamento. O corpo da requisição deverá conter o PNG da imagem e o content-type é application/octet-stream. Como parâmetro devemos indicar o id também. Caso nenhum seja indicado, a modificação será no primeiro logo.

É importante notar que a imagem enviada não deve ultrapassar 1MB ou uma resolução de 1000x1000. Qualquer outra resolução enviada será convertida em escala para 272x240 para caber na tela de menu.

POST /logo_change.fcgi
Parâmetros

id: inteiro (de 1 a 8) (opcional)
Indica o índice do slot do qual recuperar o logotipo
Imagem (binário) de logotipo PNG que deverá ser carregado no equipamento.
Resposta

O retorno da requisição é um objeto json vazio.
Exemplo

$.ajax({
    url: "/logo_change.fcgi?session=" + session + "&id=5",
    type: 'POST',
    content-type: 'application/octet-stream',
    data: image
});
Irá modificar o logo na 6ª posição pela imagem passada. Caso nenhum índice seja indicado, o logo na primeira posição será modificado.

Remover logotipo
Remove a imagem de logotipo no slot especificado do equipamento. Caso nenhum slot seja especificado, remove o logo do primeiro slot e define o dispositivo para não exibir nenhum logo.

### POST /logo_destroy.fcgi
Exclui um logotipo do equipamento.

| Parâmetro | Descrição |
| :--- | :--- |
| id | Índice do slot (1 a 8). Opcional (Padrão: 1). |

#### Exemplo de requisição
```javascript
// Deleta o 6º logotipo
$.ajax({
    url: "/logo_destroy.fcgi?session=" + session + "&id=5",
    type: 'POST'
});
```

### POST /set_configuration.fcgi (Logo)
Define qual logotipo exibir.

| Parâmetro | Tipo | Descrição |
| :--- | :--- | :--- |
| show_logo | string | 0: Nenhum. 1-8: Logo correspondente. |

#### Exemplo de requisição
```javascript
$.ajax({
    url: "/set_configuration.fcgi?session=" + session,
    type: 'POST', contentType: 'application/json',
    data: JSON.stringify({ "general": { "show_logo": "5" } })
});
```

## Modo Propaganda (Vídeo)
Permite exibir vídeos mp4 na tela do dispositivo.

> [!IMPORTANT]
> - Formato: **MP4**.
> - Orientação: **Vertical** (800x1280 recomendado).
> - Tamanho: Menos de **20MB**.
### POST /send_video.fcgi
Carrega um vídeo de forma fragmentada (máx 2MB por pacote).

| Parâmetro | Tipo | Descrição |
| :--- | :--- | :--- |
| current | int | Parte atual (ex: 1). |
| total | int | Total de partes (ex: 2). |
#### Exemplo de requisição (Parte 1 de 2)
```javascript
$.ajax({
    url: "/send_video.fcgi?current=1&total=2&session=" + session,
    type: 'POST', contentType: 'application/octet-stream',
    data: [bytes do vídeo]
});
```
Resposta

O retorno da requisição é um objeto json vazio.
### POST /set_custom_video.fcgi
Habilita ou desabilita o modo propaganda.

| Parâmetro | Tipo | Descrição |
| :--- | :--- | :--- |
| custom_video_enabled | bool | Habilita (1) ou Desabilita (0). |
Resposta

O retorno da requisição é um objeto json vazio.
#### Exemplo de requisição
```javascript
$.ajax({
    url: "/set_custom_video.fcgi?session=" + session,
    type: 'POST', contentType: 'application/json',
    data: JSON.stringify({ "custom_video_enabled": "1" })
});
```
### Ocultar Itens da Tela
Configura a visibilidade de elementos na tela inicial.

| Parâmetro | Tipo | Descrição |
| :--- | :--- | :--- |
| hide_control_bar | bool | Barra de controle. |
| hide_clock | bool | Relógio. |
| hide_menu_button | bool | Botão do menu. |
| hide_logo | bool | Logotipo. |
| hide_device_name | bool | Nome do dispositivo (Online). |
| hide_call_buttons | bool | Botões de ligação. |

O retorno da requisição é um objeto json vazio.
#### Exemplo de requisição
```javascript
$.ajax({
    url: "/set_configuration.fcgi?session=" + session,
    type: 'POST', contentType: 'application/json',
    data: JSON.stringify({
        "video_player": {
            "custom_video_enabled": "1",
            "hide_clock": "1",
            "hide_menu_button": "1",
            "hide_logo": "1",
            "hide_device_name": "1",
            "hide_call_buttons": "1"
        }
    })
});
```
### POST /remove_custom_video.fcgi
Remove o vídeo carregado.

#### Exemplo de requisição
```javascript
$.ajax({
    url: "/remove_custom_video.fcgi?session=" + session,
    type: 'POST'
});
```

## GPIO e LED RGB
Controle de hardware de baixo nível.

### POST /gpio_state.fcgi
Lê o estado de um pino de GPIO.

#### Pinos Disponíveis:
- **iDFit/iDAccess:** 0-4 (Zonas), 5-6 (Portas), 7-8 (Botoeiras), 9 (Alarme), 10 (Bio LED), 11-12 (Relés), 13 (Violação), 20-23 (Wiegand).
- **iDFlex/Nano/Pro/Face:** 0 (Violação), 1 (Botoeira SIP p/ Face).

#### Resposta
| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| enabled | int | Habilitado (1) ou não (0). |
| in | int | Entrada (1) ou Saída (0). |
| pin | string | Nome do GPIO. |
| idle | int | Valor ocioso. |
| value | int | Valor atual. |
#### Exemplo de requisição
```javascript
$.ajax({
    url: "/gpio_state.fcgi?session=" + session,
    type: 'POST', contentType: 'application/json',
    data: JSON.stringify({ gpio: 1 })
});
```

### POST /led_rgb_refresh.fcgi
Sinaliza o recarregamento da configuração do LED RGB.

#### Exemplo de requisição
```javascript
$.ajax({
    url: "/led_rgb_refresh.fcgi?session=" + session,
    type: 'POST'
});
```

Parâmetros Configuração
Descrição dos parâmetros de configuração dos equipamentos:

### Módulo: general
Configurações gerais do equipamento.

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| auto_reboot_hour | string | Hora do reinício automático (0-23). |
| auto_reboot_minute | string | Minuto do reinício automático (0-59). |
| clear_expired_users | string | Limpeza de expirados: `all`, `visitors`, `disable`. |
| url_reboot_enabled | string | Habilitar `/reboot` (0/1). |
| keep_user_image | int | Manter foto após cadastro (1: Sim, 0: Não). |
| beep_enabled | string | Som de beep (0/1). |
| ssh_enabled | string | Conexão SSH p/ diagnóstico (0/1). |
| relayN_enabled | string | Habilita relé N (1-4). |
| relayN_timeout | string | Tempo de ativação em ms. |
| relayN_auto_close | int | Abre sensor -> fecha relé (0: Normal, 1: Auto). |
| door_sensorN_enabled | string | Habilita sensor de porta N. |
| door_sensorN_idle | string | Nível lógico fechado (0/1). |
| doorN_interlock | string | Portas intertravadas (ex: "1,3"). |
| bell_enabled | string | Habilitar campainha. |
| bell_relay | string | Relé da campainha (padrão: 2). |
| catra_timeout | string | Tempo p/ giro da catraca em ms (0: infinito). |
| online | string | Modo online (0/1). |
| local_identification | string | 0: Enterprise (Servidor), 1: Pro (Local). |
| exception_mode | string | `emergency` (liberado), `lock_down` (bloqueado), `none`. |
| doorN_exception_mode | string | Comportamento da porta N em exceção. |
| language | string | `pt_BR`, `spa_SPA`, `en_US`. |
| daylight_savings_time_start | int | Início Horário Verão (Unix timestamp). |
| daylight_savings_time_end | int | Fim Horário Verão (Unix timestamp). |
| password_only | string | Apenas senha na identificação (0/1). |
| hide_password_only | string | Esconder digitação da senha (0/1). |
| password_only_tip | string | Dica personalizada p/ modo senha. |
| hide_name_on_identification| string | Ocultar nome no acesso (0/1). |
| denied_transaction_code | int | Código Wiegand p/ negado. |
| send_code_when_not_identified| int | Envia código se não identificado (0/1). |
| send_code_when_not_authorized| int | Envia código se não autorizado (0/1). |
| screen_always_on | int | Tela sempre ligada (iDFace) (0/1). |
| web_server_enabled | string | Habilitar interface Web. |
### Módulo: catra
Configurações específicas da catraca.

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| anti_passback | string | Controle de anti-dupla entrada (0/1). |
| daily_reset | string | Reset diário de logs anti-passback (0/1). |
| gateway | string | Sentido da entrada: `clockwise`, `anticlockwise`. |
| operation_mode | string | `blocked`, `entrance_open`, `exit_open`, `both_open`. |
### Módulo: opening_times
Tempos de abertura especiais por usuário/porta.

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| id | int 64 | ID da regra. |
| user_id | int 64 | Referência ao usuário. |
| door_id | int 64 | Referência à porta. |
| time | int | Tempo em ms. |
### Módulo: RS485
Comunicação serial RS485.

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| enabled | int | Habilitar RS485 (0/1). |
| legacy_mode | int | 0: Padrão, 1: ASCII (ID+Nome+Matr), 2: ASCII (ID). |
| receive_timeout | int | Timeout em ms (Padrão: 1000). |
### Módulo: mifare
Leitura de cartões MIFARE.

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| byte_order | string | `W_26` (24 bits) ou `LSB` (32 bits invertidos). |
| read_sector | string | Setor a ser lido (vazio = nenhum). |
| read_block | string | Bloco a ser lido (vazio = nenhum). |
| authentication_type | string | Chave `A` ou `B`. |
| authentication_key | string | Chave em Base64 (Padrão: `////////`). |
### Módulo: RFID
Leitura de cartões ASK.

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| ask_site_code_size | string | Bits de área: `0` ou `8`. |
| ask_user_code_size | string | Bits de usuário: `16`, `24`, `32`, `40`. |
### Módulo: HID
Configuração do módulo HID (Apenas um formato ativo por vez).

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| format_w37 | string | Configura W37 (0/1). |
| w37_cardid_size | string | Bits de ID W37: `19`, `25`, `35`. |
| format_w26 | string | Configura W26 (0/1). |
| format_mifare | string | Configura Mifare (0/1). |
| format_indala_b1 | string | Configura Indala-B1 (0/1). |
| format_ask | string | Configura ASK (0/1). |
| ignore_facility | string | Ignora facility code ASK (0/1). |
### Módulo: card_readerN
Configuração da entrada Wiegand (N = leitora, 0 a 3).

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| mode | string | `WIN` (Wiegand) ou `MAG` (Magnético). |
| type | int | `LSB` (Inverte W34) ou vazio (Padrão). |
### Módulo: alarm
Parâmetros de alarme.

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| door_sensor_enabled | string | Habilitar sensor (0/1). |
| door_sensor_delay | string | Delay p/ alarme porta aberta (s). |
| forced_access_enabled | string | Detecção de arrombamento (0/1). |
| siren_enabled | string | Sirene (iDAccess/iDFit) (0/1). |
| siren_relay | string | Relé da sirene (padrão: 2). |
| timed_alarm_timeout | int | Tempo de sirene ativa (s). |
### Módulo: identifier
Configurações de identificação e regras.

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| card_identification_enabled | int | Habilitar cartão (iDFace) (0/1). |
| face_identification_enabled | int | Habilitar face (iDFace) (0/1). |
| qrcode_identification_enabled | int | Habilitar QR Code (iDFace) (0/1). |
| pin_identification_enabled | int | Modo PIN (v6.9.0+) vs ID+Senha (0/1). |
| log_type | bool | Batidas customizadas (iDFlex Ponto). |
| multi_factor_authentication | int | MFA: 0 (Off), 1 (Card+Bio ou any+Face). |
| verbose_logging | string | Registra tudo (inclusive não identif.) (0/1). |
| antipassback_enabled | string | Bloqueio de reentrada (0/1). |
| antipassback_mode | string | `timed`, `daily_catra`, `timed_catra`. |
| antipassback_timeout | int | Tempo de bloqueio (min). |
### Módulo: bio_id
Biometria digital.

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| similarity_threshold_1ton | string | Rigor da identificação (Padrão: 12300). |
### Módulo: online_client
Configurações do cliente em modo enterprise.

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| server_id | int 64 | ID do servidor na tabela devices. |
| extract_template | string | 0: Imagem, 1: Template (digital). |
| contingency_enabled | int | Habilitar contingência (0/1). |
| max_request_attempts | int | Tentativas antes da contingência. |
| request_timeout | int | Timeout do servidor (ms, máx: 5000). |
| alive_interval | int | Intervalo p/ voltar do modo online (ms). |
### Módulo: monitor
Configurações do Monitor de eventos.

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| request_timeout | int | Timeout do request em ms. |
| hostname | string | IP ou Hostname do servidor. |
| port | string | Porta do servidor. |
| path | string | Caminho do endpoint (Padrão: `api/notifications`). |
| inform_access_event_id | int | Reportar ID na tabela `access_events` (0/1). |
| alive_interval | int | Intervalo `device_is_alive` em modo standalone (ms). |
### Módulo: push_server
Configurações do servidor Push.

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| push_request_timeout | int | Timeout em ms. |
| push_request_period | int | Período entre requisições (s). |
| push_remote_address | string | IP e Porta (ex: `192.168.120.94:80`). |
### Módulo: uhf
Configurações da antena iDUHF.

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| identification_bits | int | Bits da tag: 26, 32, 34, 66 (Standard) ou 96 (Extended). |
| reader_type | string | Ordem dos bytes: `lsb`, `default`. |
| read_interval | int | Intervalo entre MESMA tag (ms: 100-30000, Padrão: 5000). |
| read_interval_diff_tags | int | Intervalo entre tags DIFERENTES (ms: 250-30000, Padrão: 100). |
| transmit_power | int | Potência em dBm * 100 (1500-2400). |
| work_channel | string | Canais de operação (ex: `1-5;7-10`). |
| operation_mode | string | `continuous`, `trigger`, `inhibit`. |
| trigger_timeout | int | Timeout do trigger (ms: 250-60000). |
| trig_idle | int | Nível lógico ocioso (0/1). |
| tag_detector_enabled| int | Relé ativo enquanto tag visível (0/1). |
### Módulo: sec_boxs
Configurações do módulo de acionamento externo (Security Box).

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| mode | string | `LSB` (Direita) ou vazio (MSB/Padrão). |
| wiegand_out_size | string | Bits Wiegand: `26`, `32`, `34`, `35`, `37`, `40`, `42`, `66`. |
| out_mode | string | Transmissão: vazio (ID), `CARD` (Autorizados), `RELAY_CARD` (Qualquer). |
### Módulo: w_out0
Configuração da saída Wiegand (Sem MAE/Security Box).

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| size | string | Bits: `26`, `32`, `34`, `35`, `37`, `40`, `42`, `66`. |
| data | string | Transmissão: vazio (ID), `CARD` (Autorizados), `RELAY_CARD` (Qualquer). |
### Módulo: gpio (Catraca)
Configuração dos relés de catraca.

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| catra_relay_1_enabled| int | Habilitar relé 1 (0/1). |
| catra_relay_1_enable_direction | string | Direção: `left` (anti-horário) ou `right` (horário). |
| catra_relay_2_enabled| int | Habilitar relé 2 (0/1). |
| catra_relay_2_enable_direction | string | Direção: `left` ou `right`. |
### Módulo: onvif
Configurações de Streaming RTSP (iDFace).

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| rtsp_enabled | int | Habilitar Streaming RTSP (0/1). |
| rtsp_rgb | int | Câmera: 0 (IR), 1 (RGB). |
| rtsp_username | string | Usuário p/ autenticação. |
| rtsp_password | string | Senha p/ autenticação. |
| rtsp_port | int | Porta p/ transmissão. |
| rtsp_codec | string | `mjpeg` ou `h264`. |
| rtsp_flipped | int | Espelhar vídeo (0/1). |
| onvif_enabled | int | Habilitar padrão ONVIF (0/1). |
| onvif_port | int | Porta ONVIF. |
### Módulo: ntp
Sincronização de tempo.

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| enabled | int | Habilitar NTP (0/1). |
| timezone | string | Local vs UTC (ex: `UTC-3`). |

## Obter e Modificar Configurações
Gerenciamento de parâmetros via JSON.

### POST /get_configuration.fcgi
Obtém configurações específicas.

#### Exemplo de requisição
```javascript
// Obtém beep e timeout do relay 1
$.ajax({
  url: "/get_configuration.fcgi?session=" + session,
  type: 'POST', contentType: 'application/json',
  data: JSON.stringify({ general: ["beep_enabled", "relay1_timeout"] })
});
```

### POST /set_configuration.fcgi
Modifica parâmetros.

#### Exemplo de requisição
```javascript
// Habilita beep e define relay 1 p/ 3s
$.ajax({
  url: "/set_configuration.fcgi?session=" + session,
  type: 'POST', contentType: 'application/json',
  data: JSON.stringify({ general: { "beep_enabled": "1", "relay1_timeout": "3000" } })
});
```

### Controle da Porta USB
Ativa ou desativa a porta USB via `set_configuration.fcgi`.

#### Exemplo de requisição
```javascript
// Habilita porta USB
$.ajax({
  url: "/set_configuration.fcgi?session=" + session,
  type: 'POST', contentType: 'application/json',
  data: JSON.stringify({ general: { "usb_port_enabled": "1" } })
});
```

Configurar o intertravamento via rede
São três configurações possíveis de serem modificadas:

Ativar e desativar o intertravamento via rede;
Ativar e desativar a opção de ignorar o intertravamento via rede ao abrir a porta via API;
Ativar e desativar a opção de ignorar o intertravamento via rede ao abrir a porta via botoeira.
Vale ressaltar que, para o funcionamento do intertravamento via rede, é necessário cadastrar um ou mais dispositivos remotos, utilizando a API ou as interfaces do dispositivo.

O método HTTP usado é o POST e o contentType é application/json

POST /set_network_interlock.fcgi
Parâmetros

O parâmetro será um Objeto JSON com as três configurações do intertravamento.
Atentar-se ao detalhe de que, para qualquer requisição, obrigatoriamente as três configurações devem ser enviadas.
Resposta

A resposta será um Objeto JSON vazio caso a mudança de configurações seja bem sucedida, ou com uma mensagem de erro caso contrário.
#### Exemplo de requisição
```javascript
// Habilita intertravamento básico
$.ajax({
  url: "/set_network_interlock.fcgi?session=" + session,
  type: 'POST', contentType: 'application/json',
  data: JSON.stringify({
    "interlock_enabled": 1,
    "api_bypass_enabled": 0,
    "rex_bypass_enabled": 0
  })
});
```
#### Exemplo: Ignorar Intertravamento via API
```javascript
$.ajax({
  url: "/set_network_interlock.fcgi?session=" + session,
  type: 'POST', contentType: 'application/json',
  data: JSON.stringify({
    "interlock_enabled": 1,
    "api_bypass_enabled": 1,
    "rex_bypass_enabled": 0
  })
});
```
Habilita a opção de ignorar o intertravamento ao abrir porta tanto via API quanto via botoeira:

$.ajax({
  url: "/set_network_interlock.fcgi?session=" + session,
  type: 'POST',
  contentType: 'application/json',
  data: JSON.stringify({
    "interlock_enabled" : 1,
    "api_bypass_enabled" : 1,
    "rex_bypass_enabled" : 1
  })
});
#### Exemplo: Desabilitar Intertravamento
```javascript
$.ajax({
  url: "/set_network_interlock.fcgi?session=" + session,
  type: 'POST', contentType: 'application/json',
  data: JSON.stringify({
    "interlock_enabled": 0,
    "api_bypass_enabled": 0,
    "rex_bypass_enabled": 0
  })
});
```

## Segurança: Hash de Senha
Gera o hash e salt para senhas de usuário.

### POST /user_hash_password.fcgi
| Parâmetro | Tipo | Descrição |
| :--- | :--- | :--- |
| password | string | Senha em texto simples. |

#### Resposta
| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| password | string | Hash da senha. |
| salt | string | Salt gerado aleatoriamente. |
#### Exemplo de requisição
```javascript
$.ajax({
    url: "/user_hash_password.fcgi?session=" + session,
    type: 'POST', contentType: 'application/json',
    data: JSON.stringify({ password: "abc123" })
});
```
#### Exemplo de resposta
```json
{
  "password": "ab5d13cea3c4c20c954711c7006004f83c5e86486cc1736b231881cf63c08f19",
  "salt": "y2a2B`Lt.A]8iI|\\M]Ao:?\\>FT-L](Xv"
}
```

## Reforço de Segurança (SSH e Serviços)
Configurações para reduzir a superfície de ataque.

### POST /set_configuration.fcgi (SSH)
Habilita (1) ou desabilita (0) o acesso SSH.

#### Exemplo de requisição
```javascript
// Desabilita SSH
$.ajax({
  url: "/set_configuration.fcgi?session=" + session,
  type: 'POST', contentType: 'application/json',
  data: JSON.stringify({ general: { "ssh_enabled": "0" } })
});
```
## Recursos de Rede (Tabela Resumo)

| Recurso | Habilitado (Padrão) | Porta | Descrição |
| :--- | :---: | :--- | :--- |
| HTTP | ✔️ | 80 | Interface Web Server embarcado |
| HTTPS/SSL | ✖️ | 443 | Protocolo seguro (Interface Web) |
| NTP | ✖️ | 123 | Sincronização de tempo |
| RTSP | ✖️ | 554 | Streaming de áudio/vídeo em tempo real |
| ONVIF | ✖️ | 8000 | Padrão de interoperabilidade de vídeo |
| SIP | ✖️ | 5060 | Comunicação VoIP / Chamadas |
| DNS | ✔️ | 53 | Tradução de nomes de domínio |
| DHCP | ✖️ | 67/68 | Configuração automática de IP |
| SNMP | ✖️ | 161/162 | Monitoramento de rede |
| SSH | ✔️ | 22 | Acesso remoto seguro |

## Informações do Sistema
Obtém status, rede, memórias e versão de firmware.

### POST /system_information.fcgi
Parâmetros

Esta chamada não possui parâmetros.
Resposta

uptime (objeto JSON) : Indica a quanto tempo o equipamento está ligado. Contém as seguintes chaves:.
days (int) : Contém os dias do uptime.
hours (int) : Contém as horas do uptime (valores entre 0 e 23).
minutes (int) : Contém os minutos do uptime (valores entre 0 e 59).
seconds (int) : Contém os segundos do uptime (valores entre 0 e 59).
time (int) : Contém a data e hora do equipamento em Unix Timestamp.
memory (objeto JSON) : Contém informações sobre memória do equipamento.
disk (objeto JSON) : Contém informações sobre memória não volátil do equipamento. Contém as seguintes chaves:
free (int) : Espaço livre da memória não volátil (em bytes).
total (int) : Tamanho total da memória não volátil (em bytes).
ram (objeto JSON) : Contém informações sobre memória volátil do equipamento. Contém as seguintes chaves:
free (int) : Espaço livre da memória volátil (em bytes).
total (int) : Tamanho total da memória o volátil (em bytes).
license (objeto JSON) : Contém informações sobre a licença. Contém as seguintes chaves:
users (int) : Contém o número máximo de usuários permitidos pela licença em uso.
device (int) : Contém o número máximo de equipamentos controlados por este equipamento, de acordo com o limite imposto pela licença.
type (int) : Contém o tipo da licença.
biometrics (objeto JSON) : Contém informações sobre as biometrias do equipamento.
max_num_records (int) : Contém o número máximo de biometrias que podem ser armazenadas no aparelho.
network (objeto JSON) : Contém informações sobre a licença. Contém as seguintes chaves:
mac (string) : Contém o endereço físico (MAC) do equipamento.
ip (string) : Contém o endereço IP do equipamento.
netmask (string) : Contém a máscara de rede (netmask) do equipamento.
gateway (string) : Contém o endereço do roteador (gateway) do equipamento.
web_server_port (int) : Contém a porta do servidor web em uso.
ssl_enabled (bool) : Indica se o SSL está ativado (HTTPS).
dhcp_enabled (bool) : Indica se o DHCP está ativado.
ten_mbps (bool) : Indica se a conexão está limitada a uma velocidade de 10 mbps.
dns_primary (string): Representa o DNS primário do dispositivo.
dns_secondary (string): Representa o DNS secundário do dispositivo.
serial (string) : Contém o número de série do equipamento.
version (string) : Contém a versão do firmware em uso.
device_id (string) : Contém o número de identificação do equipamento.
secbox_version (string) : Contém a versão de firmware da secbox em uso.
iDCloud_code (string) : Contém o código responsável para autenticação do equipamento no iDCloud.
online (bool) : Indica se o equipamento está funcionando em algum modo online.
online_available (bool) : Indica se o equipamento pode operar em modo online. Será false em iDFlex e iDAccess Nano antes do upgrade Enterprise (através de licença). Em todos os demais casos será true.


Configurações de Rede
Alterar as configurações de rede local e, além disso, se conectar a outras redes com OpenVPN.

Alterar configurações de rede
### POST /set_system_network.fcgi
Altera as configurações de rede do equipamento.

#### Parâmetros
| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| ip | string | Endereço IP (ex: `192.168.0.33`). |
| netmask | string | Máscara (ex: `255.255.255.0`). |
| gateway | string | Gateway (ex: `192.168.0.1`). |
| custom_hostname_enabled | bool | Habilitar hostname customizado. |
| device_hostname | string | Nome customizado (ex: `ControlID`). |
| web_server_port | int | Porta Web (ex: `80`). |
| ssl_enabled | bool | Habilitar SSL (HTTPS). |
| self_signed_certificate | bool | Usar certificado auto-assinado. |
| dns_primary | string | DNS Primário (Padrão: `8.8.8.8`). |
| dns_secondary | string | DNS Secundário (Padrão: `8.8.4.4`). |
#### Exemplo de requisição
```javascript
$.ajax({
    url: "/set_system_network.fcgi?session=" + session,
    type: 'POST', contentType: 'application/json',
    data: JSON.stringify({
        ip: "192.168.0.33",
        netmask: "255.255.255.0",
        gateway: "192.168.0.1",
        custom_hostname_enabled: true,
        device_hostname: "ControlID",
        web_server_port: 80,
        ssl_enabled: false,
        self_signed_certificate: true,
        dns_primary: "1.1.1.1",
        dns_secondary: "1.1.4.4"
    })
});
```
## Configuração SSL (HTTPS)
Instruções para geração e carga de certificados.

### Gerando Certificados (OpenSSL)
1. Instale o OpenSSL Light.
2. Gere a chave e o certificado:
   ```bash
   openssl req -x509 -newkey rsa:1024 -nodes -keyout domain.key -out domain.pem
   ```
3. Combine os arquivos:
   ```bash
   # Windows
   type domain.key,domain.pem > final.pem
   # Linux/macOS
   cat domain.key domain.pem > final.pem
   ```
4. Carregue o arquivo `final.pem` via interface Web ou API.
### POST /ssl_certificate_change.fcgi
Adiciona certificado SSL em formato binário.

> [!WARNING]
> Deve-se habilitar SSL via `set_system_network.fcgi` primeiro. O certificado deve estar no formato PEM.

#### Exemplo de requisição
```javascript
$.ajax({
    url: "/ssl_certificate_change.fcgi?session=" + session,
    type: 'POST', contentType: 'application/octet-stream',
    data: [bytes do certificado .pem]
});
```
## OpenVPN
Configuração e gerenciamento de rede privada.

### POST /set_vpn_information.fcgi
| Parâmetro | Tipo | Descrição |
| :--- | :--- | :--- |
| enabled | bool | Ativar VPN. |
| login_enabled | bool | Usar login/senha manual. |
| login | string | Usuário da VPN. |
| password | string | Senha da VPN. |

#### Exemplo de requisição
```javascript
$.ajax({
    url: "/set_vpn_information.fcgi?session=" + session,
    type: 'POST', contentType: 'application/json',
    data: JSON.stringify({
        "enabled": true,
        "login_enabled": true,
        "login": "Admin", "password": "Admin"
    })
});
```
### POST /set_vpn_file.fcgi
Carga de arquivos `.conf` ou `.zip`.

#### Parâmetros
| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| file_type | string | `zip` ou `config` (.conf). |

#### Exemplo de requisição
```javascript
$.ajax({
    url: "/set_vpn_file.fcgi?file_type=zip&session=" + session,
    type: 'POST', contentType: 'application/octet-stream',
    data: [bytes do arquivo VPN]
});
```
### GET /get_vpn_file.fcgi
Obtém arquivos de exemplo.

#### Exemplo de requisição
```javascript
$.ajax({
    url: "/get_vpn_file.fcgi?session=" + session,
    type: 'GET', contentType: 'application/octet-stream'
});
```
### GET /get_vpn_information.fcgi
Obtém configurações atuais da VPN.

#### Exemplo de resposta
```json
{
    "enabled": true,
    "login_enabled": false,
    "login": "Admin",
    "password": true
}
```
### GET /get_vpn_status.fcgi
Verifica o estado da conexão.

| Status | Nome | Descrição |
| :--- | :--- | :--- |
| 0 | connected | Conectado. |
| 1 | auth_failed | Falha na autenticação. |
| 8 | disconnected| Desabilitado. |
| 9 | trying... | Tentando conectar. |
| 10| no conn | Rede desconectada. |
### GET /has_vpn_file.fcgi
Confirma se existe arquivo de configuração.

#### Exemplo de resposta
```json
{ "has_file": true }
```
### POST /configure_802_1X.fcgi
Configura autenticação 802.1X (PEAP).

#### Parâmetros
| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| enabled | bool | Ativar 802.1X. |
| login | string | Usuário. |
| password | string | Senha. |
| inner_auth| int | 0: MS-CHAPv2, 1: MD5, 2: GTC. |

## Manutenção do Sistema

### POST /set_system_time.fcgi
Altera data e hora.

#### Parâmetros
`day`, `month`, `year`, `hour`, `minute`, `second` (int).

#### Exemplo de requisição
```javascript
$.ajax({
    url: "/set_system_time.fcgi?session=" + session,
    type: 'POST', contentType: 'application/json',
    data: JSON.stringify({ day: 10, month: 12, year: 1983, hour: 21, minute: 30, second: 0 })
});
```
Suporte a NTP
O Network Time Protocol (NTP) é um protocolo utilizado para sincronizar relógios de computadores em uma rede. Ele permite que computadores obtenham a hora exata de servidores NTP, ajustando automaticamente seus relógios para minimizar a discrepância de tempo entre eles.

A funcionalidade implementada no equipamento permite a importação do "time-zone data" a fim de obter referências locais de fusos horários. Além disso, é possível inserir manualmente o horário de verão (para os países que adotaram a medida).

O módulo responsável por essa configuração é o ntp. Ele pode ser configurado via interface WEB, API ou GUI. Nele, é possível alterar dois parâmetros: enabled que habilita o protocolo (valores "0" para desabilitado e "1" para habilitado) e timezone que define o horário local (que recebe valores de "UTC-12" a "UTC+12") em relação ao Tempo Universal Coordenado (UTC).

Vale ressaltar que o protocolo NTP possui suporte a todos os dispositivos da linha de acesso, ou seja, dispositivos com firmware V5 e V6.

Exemplo de requisição
Esta requisição habilita o protocolo ntp com UTC+3.

$.ajax({
    url: "/set_configuration.fcgi?session=" + session,
    type: 'POST',
    contentType: 'application/json',
    data: JSON.stringify(
        {
            "ntp": {
                "enabled": "1",
                "timezone": "UTC+3"
            }
        }
    )
});

### POST /reset_to_factory_default.fcgi
Redefine para padrões de fábrica.

> [!CAUTION]
> Todos os dados do usuário serão perdidos (exceto rede se `keep_network_info` for true).

#### Parâmetros
| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| keep_network_info | bool | Mantém IP/Máscara. |

### POST /delete_admins.fcgi
Remove todos os administradores.

#### Exemplo de requisição
```javascript
$.ajax({
    url: "/delete_admins.fcgi?session=" + session,
    type: 'POST', contentType: 'application/json'
});
```

### POST /reboot_recovery.fcgi
Reinicia em modo de atualização.

#### Exemplo de requisição
```javascript
$.ajax({
    url: "/reboot_recovery.fcgi?session=" + session,
    type: 'POST', contentType: 'application/json'
});
```

### Reinicialização do Equipamento

#### POST /reboot.fcgi
Reinicia o equipamento (sessão válida necessária).

```javascript
$.ajax({
    url: "/reboot.fcgi?session=" + session,
    type: 'POST', contentType: 'application/json'
});
```
#### GET /reboot
Reinicia o equipamento SEM sessão válida.

> [!WARNING]
> Este recurso deve ser usado apenas se a aplicação não estiver mais respondendo. Exige `url_reboot_enabled` em `general`.

```javascript
$.ajax({ url: "/reboot", type: 'GET' });
```

## Sincronização e Backup (Import/Export)
Permite migrar dados entre dispositivos ou restaurar backups.

| Modo | Descrição |
| :--- | :--- |
| **Só usuários** | Usuários, digitais e cartões. |
| **Só logs** | Apenas eventos de acesso. |
| **Sincronização** | Tudo exceto logs (ideal p/ clonar configs). |
| **Backup total** | Cópia fiel de todo o sistema. |

> [!IMPORTANT]
> Atualize o firmware antes de exportar. Arquivos ZIP gerados não devem ser alterados manualmente.
### POST /export_objects.fcgi
Gera arquivo `.csv` de exportação.

#### Parâmetros
| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| objects | array | Lista de objetos (ex: `users`, `cards`). |
| columns | array | Opcional: Colunas específicas p/ exportar. |

#### Exemplo de requisição
```javascript
$.ajax({
  url: "/export_objects.fcgi?session=" + session,
  type: 'POST', contentType: 'application/json',
  data: JSON.stringify({
    "objects": [
      { "object": "users" },
      { "object": "cards", "columns": ["value", "user_id"] },
      { "object": "c_users", "columns": ["id", "user_id", "cpf"] }
    ]
  })
});
```

## Validação de Biometria

### POST /is_valid_biometry.fcgi
Verifica se o template da digital é válido.

#### Exemplo de requisição
```javascript
$.ajax({
    url: "/is_valid_biometry.fcgi?session=" + session,
    type: 'POST', contentType: 'application/json',
    data: JSON.stringify({ biometry: "SUNSUzIxAAAB..." })
});
```
#### Exemplo de resposta
```json
{ "isValid": true }
```

## Controle da Interface Web
Ativa ou desativa o acesso ao portal via navegador (API permanece ativa).

### POST /set_configuration.fcgi (web_server_enabled)
#### Exemplo de requisição
```javascript
// Desativa Interface Web
$.ajax({
    url: "/set_configuration.fcgi?session=" + session,
    type: 'POST', contentType: 'application/json',
    data: JSON.stringify({ general: { "web_server_enabled": "0" } })
});
```
  url: "/set_configuration.fcgi?session=" + session,
  type: 'POST',
  contentType: 'application/json',
  data: JSON.stringify({
    general: {"web_server_enabled": "0"}
  })
});

Suporte a SNMP
O protocolo SNMP (Simple Network Management Protocol) é utilizado para gerenciar redes, monitorando e administrando dispositivos conectados por meio de seus endereços IP. Ele permite a observação do desempenho da rede, identificação de erros, e coleta de informações para análise.

Um dispositivo habilitado para SNMP é chamado de agente, e ele contém informações sobre seu status, chamadas de objetos. Cada um desses objetos tem um identificador exclusivo chamado OID (Object Identifier), que segue uma hierarquia numérica, organizada de forma semelhante à estrutura de um endereço IP, mas com uma função diferente. Os OIDs e suas descrições estão armazenados em um arquivo MIB (Management Information Base), que define os objetos que podem ser gerenciados via SNMP.

MIB file
As informações dos identificadores OID (Object Identifier) a serem coletados de um equipamento são descritas de forma hierárquica dentro de um MIB file. Essa hierarquia é representada por uma sequência de números, onde cada ponto (.) separa os diferentes níveis da estrutura hierárquica, e cada número identifica uma ramificação ou nó específico.

Por padrão SNMP, o OID segue a estrutura iniciada com 1.3.6.1.4.1, que corresponde à sequência iso.org.dod.internet.private.enterprises. Dentro dessa estrutura, organizações podem ter seu próprio domínio específico, atribuído pela IANA. A ControlID, por exemplo, possui o domínio 49617, que se ramifica para .1 (accessControl). A partir dessa ramificação, outras subdivisões podem ser definidas conforme a necessidade, totalizando 10 subníveis adicionais que descrevem funcionalidades ou dados específicos dos dispositivos gerenciados:

Nome	OID	Descrição
cidSystem	.1	Sistema
cidOperationMode	.2	Modo de Operação
cidAntipassback	.3	Anti PassBack
cidNetwork	.4	Network
cidBuzzer	.5	Buzzer
cidSip	.6	SIP
cidApplication	.7	Aplicação
cidStreaming	.8	Streaming
cidAlarm	.9	Alarme
cidSecbox	.10	Secbox
Os parâmetros possíveis de serem monitorados são:

Sistema
Nome	OID	Retorno	Descrição
firmwareVersion	.1	OCTET STRING	Versão de Firmware do dispositivo
serialNumber	.2	OCTET STRING	Número de Serial do dispositivo
hasProVersion	.3	INTEGER
1: true
2: false	Verifica se o dispositivo possui licença Pro
loadAverage	.4	OCTET STRING	Média de carregamento do sistema
cpuUsage	.5	OCTET STRING	Uso de CPU do sistema*
cpuTemperature	.6	Unsigned32	Temperatura da CPU
Unidade: T * 1000 °C
dateAndTime	.7	OCTET STRING	Data e Hora do dispositivo
ntpEnabled	.8	INTEGER
1: True
2: False	NTP Habilitado
ntpServer	.9	OCTET STRING	Servidor(es) NTP
Modo de Operação
Nome	OID	Retorno	Descrição
isDeviceOnline	.1	INTEGER
1: True
2: False	Verifica se o dispositivo está online
devicePort	.2	Unsigned32	Porta do dispositivo
Anti PassBack
Nome	OID	Retorno	Descrição
antipassbackEnabled	.1	INTEGER
1: True
2: False	Verifica se o antipassback está ativado
antipassbackTimeout	.2	Unsigned32	Valor do timeout do Antipassback
Unidade: Segundos
antipassbackMode	.3	OCTET STRING	Modo de operação do Antipassback
Network
Nome	OID	Retorno	Descrição
dhcpEnabled	.1	INTEGER
1: True
2: False	Verifica se o DHCP está habilitado
duplexMode	.2	OCTET STRING	Modo duplex do dispositivo
Opções:
(Half, Full)
Buzzer
Nome	OID	Retorno	Descrição
audioNotIdentified	.1	OCTET STRING	Status de aúdio para: Não identificado
Opções:
(custom, default, disabled)
audioAuthorized	.2	OCTET STRING	Status de aúdio para: Autorizado
Opções:
(custom, default, disabled)
audioNotAuthorized	.3	OCTET STRING	Status de aúdio para: Não autorizado
Opções:
(custom, default, disabled)
audioMaskPresent	.4	OCTET STRING	Status de aúdio para: Máscara presente
Opções:
(custom, default, disabled)
audioVolume	.5	Unsigned32	Volume das mensagens de aúdio
SIP
Nome	OID	Retorno	Descrição
sidEnabled	.1	INTEGER
1: True
2: False	Verificar se o SIP está ativado
sipOperationMode	.2	INTEGER 1: p2p
2: client	Modo de operação do SIP
sipDialingMode	.3	INTEGER	Discagem do modo SIP
sipBranch	.4	OCTET STRING	Branch do SIP
sipServer	.5	OCTET STRING	Endereço de servidor de SIP
sipAutoAnswerEnabled	.6	INTEGER
1: True
2: False	Verifica se a resposta automática do SIP está habilitada
sipCallButtonEnabled	.7	INTEGER
1: True
2: False	Verifica se o botão de ligação do SIP está habilitado
sipAutoCallId	.8	OCTET STRING	ID da ligação automática do SIP
sipMaxCallTime	.9	Unsigned32	Tempo máxima de ligação SIP
Unidade: Segundos
sipHasCustomAudio	.10	INTEGER
1: True
2: False	Verifica se o SIP usa aúdio customizado
sipKeepAliveInterval	.11	Unsigned32	Intervalo do Keepalive do SIP
Unidade: Segundos
sipMicVolume	.12	Unsigned32	Volume do microfone SIP
sipSpeakerVolume	.13	Unsigned32	Volume do auto-falante do SIP
sipOpenDoorEnabled	.14	INTEGER
1: True
2: True	Verifica se a porta aberta do SIP está habilitada
sipInCall	.15	INTEGER
1: True
2: False	Verifica se o usuário está em uma chamada
sipRegisterTime	.16	Unsigned32	Valor do timeout até estabelecer conexão ao servidor
sipRegisterStatus	.17	DisplayString	Status de conexão do servidor SIP
Aplicação
Nome	OID	Retorno	Descrição
appNumberOfUsers	.1	Unsigned32	Número de usuários registrados em aplicação
appHasCompanyLogo	.2	INTEGER
1: True
2: False	Verifica se o dispositivo está usando uma logo customizada
appQrCodeType	.3	INTEGER
1: Alfanumérico
2: Numérico	Verifica o tipo de QR code usado no dispositivo
appFacialIdentification	.4	INTEGER
1: True
2: False	Verifica se a identificação facial está habilitada
appBiometricIdentification	.5	INTEGER
1: True
2: False	Verifica se a identificação biométrica está habilitada
appCardIdentification	.6	INTEGER
1: True
2: False	Verifica se o cartão de identificação está habilitado
appQrCodeIdentification	.7	INTEGER
1: True
2: False	Verifica se a identificação por QR Code está habilitada
appPinIdentification	.8	INTEGER
1: True
2: False	Verifica se a identificação por PIN está habilitada
Streaming
Nome	OID	Retorno	Descrição
onvifEnabled	.1	INTEGER
1: True
2: False	Verifica se o ONVIF está habilitado
onvifPort	.2	Unsigned32	Porta do ONVIF
rtspEnabled	.3	INTEGER
1: True
2: False	Verifica se o RTSP está habilitado
rtspPort	.4	Unsigend32	Porta RTSP
rtspRgbIr	.5	INTEGER
1: rgb
2: infrared	Verifica qual câmera está sendo usada
rtspCodec	.6	OCTET STRING	Codec usado no RTSP
rtspResolution	.7	OCTET STRING	Resolução usada no RTSP
Alarme
Nome	OID	Retorno	Descrição
alarmDoorSensorEnabled	.1	INTEGER
1: True
2: False	Verifica se o sensor de alarma da porta está habilitado
alarmDoorSensorDelay	.2	Unsigned32	Atraso do sensor de alarme da porta
Unidade: Segundos
alarmForcedAccess	.3	INTEGER
1: True
2: False	Verifica se houve uma tentativa de acesso forçada
alarmPanicFingerEnabled	.4	INTEGER
1: True
2: False	Verifica se o botão do pânico está habilitado
alarmPanicFingerDelay	.5	Unsigned32	Atraso do botão do pânico
Unidade: Segundos
alarmPanicCardEnabled	.6	INTEGER
1: True
2: False	Verifica se cartão do pânico está habilitado
alarmDeviceViolationEnabled	.7	INTEGER
1: True
2: False	Verifica se houve uma detecção de violação do dispositivo
alarmBuzzerEnabled	.8	INTEGER
1: True
2: False	Verifica se o alarme do buzzer está habilitado
alarmPlayingTimeout	.9	Unsigned32	Timeout para o alarme terminar de tocar
Unidade: Segundos
Secbox
Nome	OID	Retorno	Descrição
secboxCount	.1	Unsigned32	Número de secboxes
secboxExceptionMode	.2	OCTET STRING	Verifica se existe um modo de excessão
secboxId	.3	Unsigned32	ID da Secbox
secboxEnabled	.4	INTEGER
1: True
2: False	Verifica se a secbox está habilitada
secboxVersion	.5	OCTET STRING	Versão de firmware da Secbox
secboxRelayTimeout	.6	Unsigned32	TImeout do relé da Secbox
Unidade: Milisegundos
secboxDoorEnabled	.7	INTEGER
1: True
2: False	Verifica se o sensor de porta da Secbox está habilitada
secboxDoorNormallyOpen	.8	INTEGER
1: Normalmente Aberto
2: Normalmente Fechado	Verifica se a porta está no modo Normalmente Aberto ou Normalmente Fechado
Opções:
{NormallyOpen, NormallyClosed}
secboxAutoCloseEnabled	.9	INTEGER
1: True
2: False	Verifica se o fechamento automático está habilitado
Todos estes dados obtidos podem ser adquiridos por meio do arquivo CONTROLID-MIB.txt, disponibilizado pela Control iD.

Nota-se que, por se tratar de um arquivo MIB, não é possível realizar requests SNMP pelo (Postman). Ou seja, é necessário instalar uma ferramenta de gerenciamento de dispositivos via SNMP, como o MIB Browser, por exemplo. Dentro da ferramenta de gerenciamento via SNMP, basta executar o comando (snmpwalk) sobre o parâmetro escolhido para ser retornado. Esses parâmetros podem ser encontrados nas ramificações criadas de forma hierárquica.

Exemplos de equivalência de OID
Como mencionado anteriormente, todos os dados OID conterão no início a sequência 1.3.6.1.4.1.49617.1, equivalente a iso.org.dod.internet.private.enterprises.controlId.accessControl, e no fim o número 0, equivalente ao scalar do OID.

Nos dois exemplos a seguir, a numeração em negrito se refere ao dado de interesse.

firmwareVersion
1.3.6.1.4.1.49617.1.1.1.0
cidSystem > firmwareVersion.

appHasCompanyLogo
1.3.6.1.4.1.49617.1.7.2.0
cidApplication > appHasCompanyLogo.

Habilitar/Desabilitar SNMP via API
A função descrita abaixo deve ser usada para realizar a ativação/desativação do SNMP nos terminais de controle de acesso da Control iD.

POST /set_configuration.fcgi
Parâmetros

snmp_enabled (int): Define se o ativa ou desabilita o protocolo SNMP
Exemplo de requisição para ativar o protocolo SNMP
$.ajax({
    url: "/set_configuration.fcgi?session=" + session,
    type: 'POST',
    contentType: 'application/json',
    data: JSON.stringify({
        "snmp_agent": {
            snmp_enabled: "1"
        }"
    })
});
Exemplo de requisição para desativar o protocolo SNMP
$.ajax({
    url: "/set_configuration.fcgi?session=" + session,
    type: 'POST',
    contentType: 'application/json',
    data: JSON.stringify({
        "snmp_agent": {
            snmp_enabled: "0"
        }"
    })
});

Introdução aos modos de operação
Os controladores de acesso da ControliD são programados para funcionarem em diferentes modos de operação que se adequam a diferentes cenários de implantação de seus clientes.

As interações possíveis entre servidor e terminal de controle de acesso dependem do modo de operação em que este deverá funcionar. Os modos de operação descritos a seguir podem ser divididos em duas categorias: autônomo ou online.

Em uma solução desenvolvida para terminais em um modo de operação autônomo (standalone), a comunicação se dará unilateralmente do servidor para cada terminal e deve se preocupar em manter os dados de usuários e regras de acesso atualizados.

Já quando a solução é desenvolvida utilizando terminais em algum dos modos de operação online, a comunicação ocorre em ambos os sentidos, pois a lógica dos processos de autorização e identificação estará no servidor ou parcialmente no servidor.

Existem dois modos de operação online: o Modo Enterprise e o Modo Pro. Sua diferença fundamental está em quais tratamentos de acesso são delegados ao servidor externo e, portanto, em qual tipo de informação ele deve receber.

Modo de Operação	Identificação	Autorização	Informação enviada na tentativa de acesso
Standalone	No terminal	No terminal	-
Pro	No terminal	No servidor	Número identificador do usuário
Enterprise	No servidor	No servidor	Dados biométricos do usuário
Contingência	No terminal	No terminal	-
Modo Standalone
Identificação e autorização no terminal

Este é o modo de operação recomendado pela Control iD.

Um equipamento está no Modo Standalone quando a configuração online estiver desativada.

Neste modo, o equipamento precisa ter seu banco de dados preenchido com todas as informações de que necessita para identificar e autorizar um acesso, isto é, cadastro de usuários, biometrias/cartões, departamentos, horários e regras de acesso.

Para fazer isso remotamente, basta enviar requisições diretamente para a API do equipamento.

![alt text](https://www.controlid.com.br/docs/access-api-pt/img/modo_standalone.jpg)

Desta forma, os tratamentos de identificação e de autorização se dão totalmente no terminal.

No modo Standalone, a informação é sempre enviada em um único sentido: do servidor para o equipamento.

Modo Pro
Identificação no terminal e autorização no servidor

Um equipamento está no Modo Pro quando a configuração online estiver ativada e a configuração local_identification estiver ativada.

Neste modo, quando o usuário inicia uma identificação biométrica no equipamento, este analisa os dados captados através do seu próprio algoritmo biométrico e identifica o usuário correspondente em seu banco de dados local.

Apenas o ID do usuário identificado é enviado ao servidor para que este processe as regras de acesso e determine se deve ou não conceder a autorização.

![alt text](https://www.controlid.com.br/docs/access-api-pt/img/modo_pro.jpg)

Desta forma, o tratamento de identificação se dá totalmente no terminal enquanto o tratamento de autorização se dá totalmente no servidor.

Repare que, por este método, o servidor precisa sempre manter atualizados os usuários e seus dados biométricos no equipamento, estando sujeito à limitação de registros existente nele. Esta limitação é descrita no tópico Limitação do número de templates.

Modo Enterprise
Identificação e autorização no servidor

Um equipamento está no Modo Enterprise quando a configuração online estiver ativada e a configuração local_identification estiver desativada.

Neste modo, quando o usuário inicia uma identificação biométrica no equipamento, este envia apenas uma imagem da biometria ao servidor. Cabe ao servidor fazer uso de algum algoritmo biométrico para processar a autorização do usuário.

![alt text](https://www.controlid.com.br/docs/access-api-pt/img/modo_enterprise.jpg)

Desta forma, os tratamentos de identificação e de autorização se dão totalmente no servidor.

Modo de contingência
Identificação e autorização no terminal

Se um equipamento operando em um dos modos online não conseguir se comunicar com o servidor por três tentativas seguidas, ele entrará em modo de contingência. Este é um modo de exceção e não pode ser usado como padrão nos equipamentos. O número de tentativas de comunicação com o servidor é um parâmetro configurável.

Neste modo, todas as identificações passam a ser feitas utilizando unicamente os registros locais do equipamento, que, para tanto, devem estar atualizados. O funcionamento é equivalente ao do Modo Standalone.

Enquanto estiver em contingência, a cada minuto, o equipamento enviará uma nova requisição POST/device_is_alive ao servidor. Assim que obtiver uma resposta (HTTP status code OK), ele voltará a seu modo de operação original.

Desta forma, os tratamentos de identificação e de autorização se dão totalmente no terminal.

Configurar modo online
No modo online, no momento da autorização, o equipamento consulta o seu servidor/sistema para saber o que fazer: permitir o acesso do usuário ou não. Uma lista com todos os modos de operação pode ser acessada em: Modos de Operação.

O seguinte passo a passo explica como habilitar e configurar o modo online (modo Pro) nos equipamentos de controle de acesso.

Passo 1 - Criar um objeto device:
Esse objeto será a representação do seu servidor/sistema no equipamento.

Exemplo de requisição
$.ajax({
  url: "/create_objects.fcgi?session=" + session,
  type: 'POST',
  contentType: 'application/json',
  data: JSON.stringify({
    object: "devices",
    values: [{name: 'Meu servidor 1', ip: 'http://meuservidor.com.br/api', public_key: ''}]
  })
});
Exemplo de resposta
{"ids":[473359]}
Importante: Guarde esse id, será necessário utilizar esse valor no próximo passo.

Observações:

O atributo ip pode ser qualquer endereço, por exemplo:

192.168.110.200:80/api2
http://192.168.110.200:80
192.168.200.200:8080
http://meuservidor.com.br/servico
Não é necessário criar um objeto "devices" toda vez que for ativar o modo online (Pro) no controle de acesso. Esse objeto só precisa ser criado uma única vez na memória do equipamento. Depois de criado, basta realizar os passos 2 e 3, que são responsáveis por atribuir o endereço do servidor que será usado para recebimento dos eventos e ativar o modo online no dispositivo respectivamente.

Passo 2 - Criar referência do seu servidor/sistema no controle de acesso:
Observação: O valor do server_id a ser passado é o id do servidor/sistema criado no Passo 1.

Exemplo de requisição
$.ajax({
  url: "/set_configuration.fcgi?session=" + session,
  type: 'POST',
  contentType: 'application/json',
  data: JSON.stringify({
    online_client: {
        server_id: "473359"
    }
  })
});
Passo 3 - Ativar o modo online (Pro)
Exemplo de requisição
$.ajax({
  url: "/set_configuration.fcgi?session=" + session,
  type: 'POST',
  contentType: 'application/json',
  data: JSON.stringify({
    general: {
        online: "1",
        local_identification: "1"
    },
    online_client: {
      extract_template: "0",
      max_request_attempts: "3"
    }
  })
});
Passo 4 - Verificar validade da sessão
Após esses passos, o equipamento irá se comunicar com o seu servidor/sistema. Para testar a comunicação, você pode implementar o endpoint /session_is_valid.fcgi.

Lembrando que o endpoint será concatenado com o valor de ip inserido no Passo 1, por exemplo:

http://meuservidor.com/api/session_is_valid.fcgi
192.168.115.200/session_is_valid.fcgi
192.168.110.200:8080/session_is_valid.fcgi
Observação: Caso não seja respondido o device_is_alive.fcgi o equipamento continuará testando a comunicação por meio desta requisição, mas não conseguirá se comunicar com o servidor e não enviará outras requisições.

Após a realização das operações apresentadas acima, o controlador de acesso estará se comunicando com o seu servidor/sistema. Quando um usuário se identificar no dispositivo, ele enviará um evento de identificação para o seu servidor/sistema com as informações de acesso do usuário. Com isso, cabe ao seu servidor/sistema tratar esse evento e retornar com uma mensagem para o controle de acesso.

Eventos de Identificação Online
Quando uma tentativa de identificação ocorre, os eventos descritos abaixo são enviados automaticamente pelo equipamento conforme o modo de operação online em que ele estiver: Modo Pro ou Modo Enterprise. Cabe ao servidor externo tratar esses eventos.

O passo a passo para configurar o equipamento no modo de operação online pode ser acessado em Configurar Modo Online.

Evento imagem biométrica
Tentativa de identificação por biometria.

O método HTTP usado é o POST. O contentType é application/octet-stream. Todos os parâmetros são enviados através da query string, exceto o binário da imagem.

Este evento é enviado quando o equipamento opera em Modo Enterprise, ou seja, quando a configuração local_identification estiver desativada, e apenas se a configuração extract_template estiver desativada.

POST /new_biometric_image.fcgi
Parâmetros

device_id (int 64) : ID único do equipamento.
identifier_id (int) : ID do identificador (wiegand, RFID, biometria), vide Formatação identifier_id.
width (int) : Largura, em pixels, da imagem enviada.
height (int) : Altura, em pixels, da imagem enviada.
session (string) : Número da sessão.
time (int) : Momento do acesso em Unix Timestamp.
portal_id (int) : Identificador do portal.
uuid (string) : Identificador Único Universal.
variance (int) : Parâmetro de qualidade na identificação biométrica.
imagem (binário (octet-stream)) : Imagem da digital em formato binário. É enviado 1 byte por pixel, em escala de cinza (Este é o único parâmetro enviado no corpo da mensagem).
Resposta

result (Objeto JSON) : Descrito em Mensagem de Retorno.
Evento template biométrica
Tentativa de identificação por biometria.

O método HTTP usado é o POST. O contentType é application/octet-stream. Todos os parâmetros são enviados através da query string, exceto o binário do template.

Este evento é enviado quando o equipamento opera em Modo Enterprise, ou seja, quando a configuração local_identification estiver desativada, e apenas se a configuração extract_template estiver ativada.

POST /new_biometric_template.fcgi
Parâmetros

device_id (int 64) : ID único do equipamento.
identifier_id (int) : ID do identificador (wiegand, RFID, biometria), vide Formatação identifier_id.
session (string) : Número da sessão.
time (int) : Momento do acesso em Unix Timestamp.
portal_id (int) : Identificador do portal.
uuid (string) : Identificador Único Universal.
variance (int) : Parâmetro de qualidade na identificação biométrica.
Template (binário (octet-stream)) : Template biométrico no formato Innovatrics (Este é o único parâmetro enviado no corpo da mensagem).
Resposta

result (Objeto JSON) : Descrito em Mensagem de Retorno.
Evento cartão de proximidade
Tentativa de identificação por cartão de proximidade.

O método HTTP usado é o POST. O contentType é application/x-www-form-urlencoded. Todos os parâmetros são através do corpo da requisição como um formulário codificado em URL.

Este evento é enviado quando o equipamento opera em Modo Enterprise, ou seja, quando a configuração local_identification estiver desativada.

POST /new_card.fcgi
Parâmetros

device_id (int 64) : ID único do equipamento.
identifier_id (int) : ID do identificador (wiegand, RFID, biometria), vide Formatação identifier_id.
card_value (int 64) : Número do cartão.
panic (int) : Indica se é cartão de pânico (1) ou não (0).
time (int) : Momento do acesso em Unix Timestamp.
portal_id (int) : Identificador do portal.
uuid (string) : Identificador Único Universal.
block_read_error (int 64) : Quando diferente de 0, indica que um erro de leitura do bloco ocorreu. Só será preenchido quando mifare->read_block for não vazio.
block_read_data (string) : Dados lidos do bloco em hexadecimal (Não é possível incluir base64 em uma URL sem escapar alguns caracteres). Só será preenchido quando mifare->read_block for não vazio.
Resposta

result (Objeto JSON) : Descrito em Mensagem de Retorno.
Evento QR Code
Tentativa de identificação por QR Code.

O método HTTP usado é o POST. O contentType é application/x-www-form-urlencoded. Todos os parâmetros são através do corpo da requisição como um formulário codificado em URL.

Este evento é enviado quando o equipamento opera em Modo Enterprise, ou seja, quando a configuração local_identification estiver desativada.

Observação: O equipamento irá enviar o evento de QR Code quando o parâmetro qrcode_legacy_mode_enabled (do módulo barras para linha V5 e face_id da linha V6) estiver configurado em 0. Caso qrcode_legacy_mode_enabled esteja definido em 1, leituras de QR Code serão interpretadas da mesma forma como leituras de cartão.

POST /new_qrcode.fcgi
Parâmetros

device_id (int 64) : ID único do equipamento.
identifier_id (int) : ID do identificador (Wiegand, RFID, biometria, etc), vide Formatação identifier_id.
qrcode_value (string) : Número do QR Code.
uuid (string) : Identificador Único Universal.
time (int) : Momento do acesso em Unix Timestamp.
portal_id (int) : Identificador do portal.
Resposta

result (Objeto JSON) : Descrito em Mensagem de Retorno.
Evento UHF tag
Tentativa de identificação por UHF tag.

O método HTTP usado é o POST. O contentType é application/x-www-form-urlencoded. Todos os parâmetros são através do corpo da requisição como um formulário codificado em URL.

Este evento é enviado quando o equipamento opera em Modo Enterprise, ou seja, quando a configuração local_identification estiver desativada.

POST /new_uhf_tag.fcgi
Parâmetros

device_id (int 64) : ID único do equipamento.
identifier_id (int) : ID do identificador (Wiegand, RFID, biometria, etc), vide Formatação identifier_id.
uhf_tag (string) : Valor lido pela tag UHF
uuid (string) : Identificador Único Universal.
time (int) : Momento do acesso em Unix Timestamp.
portal_id (int) : Identificador do portal.
Resposta

result (Objeto JSON) : Descrito em Mensagem de Retorno.
Evento id e senha
Tentativa de identificação por id e senha.

O método HTTP usado é o POST. O contentType é application/x-www-form-urlencoded. Todos os parâmetros são através do corpo da requisição como um formulário codificado em URL.

Este evento é enviado quando o equipamento opera em Modo Enterprise, ou seja, quando a configuração local_identification estiver desativada.

POST /new_user_id_and_password.fcgi
Parâmetros

device_id (int 64) : ID único do equipamento.
identifier_id (int) : ID do identificador (wiegand, RFID, biometria), vide Formatação identifier_id.
user_id (int) : ID informado pelo usuário.
password (string) : Senha informada pelo usuário.
time (int) : Momento do acesso em Unix Timestamp.
portal_id (int) : Identificador do portal.
uuid (string) : Identificador Único Universal.
Resposta

result (Objeto JSON) : Descrito em Mensagem de Retorno.
Evento usuário identificado
Quando o usuário se identifica no equipamento, este executa a identificação de forma local e envia o ID do usuário identificado ao servidor. Então, o servidor deve processar suas regras de acesso e conceder ou não autorização.

Repare que, por este método, o servidor precisa sempre manter atualizados os usuários e seus dados biométricos no equipamento, estando sujeito à limitação de registros existente nele. Esta limitação é descrita no tópico Limitação do número de templates.

O método HTTP usado é o POST. O contentType é application/x-www-form-urlencoded. Todos os parâmetros são através do corpo da requisição como um formulário codificado em URL.

Este evento é enviado quando o equipamento opera em Modo Pro, ou seja, quando a configuração local_identification estiver ativada.

POST /new_user_identified.fcgi
Parâmetros

device_id (int 64) : ID único do equipamento.
identifier_id (int) : ID do identificador (wiegand, RFID, biometria), vide Formatação identifier_id.
component_id (int) : ID do componente que realizou a identificação (exclusivo para iDBlock Next), vide Formatação identifier_id.
event (int) : Evento do resultado da identificação, (e.g.: 3 para não identificado).
user_id (int) : ID do usuário.
duress (int) : Esse parâmetro retorna um inteiro que indica se é dedo do pânico ou uma simples identificação (1 ser for dedo de pânico ou 0 para identificação comum).
face_mask (bool) : Esse parâmetro retorna "true" se o usuário identificado está usando máscara ou retorna "false" caso contrário.
time (int) : Momento do acesso em Unix Timestamp.
portal_id (int) : Identificador do portal.
uuid (string) : Identificador Único Universal.
block_read_data (string) : Valor lido do bloco indicado do cartão (apenas para MIFARE, quando habilitado).
block_read_error (int) : Indica se houve erro na leitura do bloco do cartão (apenas para MIFARE, quando habilitado).
card_value (int) : Valor do cartão utilizado.
qrcode_value (string) : Valor do QR Code utilizado.
remote_interlock_state (string) : Indica o estado das portas dos dispositivos remotos cadastrados no intertravamento remoto.
uhf_tag (string) : Valor lido pela tag UHF
pin_value (string) : Valor do PIN utilizado.
user_has_image (int) : Indica se o usuário possui imagem (1) ou não (2).
user_name (string) : Nome do usuário
password (string) : Senha informada pelo usuário.
confidence (int) : Parâmetro confidence da identificação facial.
log_type_id (int) : Envia um identificador de tipo de batida sempre que houver um evento de identificação online.
Resposta

result (Objeto JSON) : Descrito em Mensagem de Retorno.
Evento acesso por botoeira
Indica um acesso por meio de acionamento de botoeira.

O método HTTP usado é o POST. O contentType é application/json. Todos os parâmetros enviados estão disponíveis no corpo da mensagem (JSON).

Este evento é enviado quando o equipamento opera em Modo Online, ou seja, Modo Enterprise ou Modo Pro.

POST /new_rex_log.fcgi
Parâmetros

device_id (int 64) : ID único do equipamento.
rex_log (Objeto JSON) : Objeto com os parâmetros abaixo:
time (int) : Horário da ocorrência em Unix Timestamp.
event (int) : Evento da abertura (11 para acesso através de botoeira).
user_id (int 64) : ID do usuário.
portal_id (int 64) : ID do portal correspondente.
Resposta

É esperada uma resposta vazia (HTTP Status code OK).

Formatação identifier_id
O campo identifier_id está presente nas mensagens de evento de identificação enviadas pelo terminal de acesso. Ele contém um id que representa o mecanismo identificador (wiegand, RFID, biometria, etc) utilizado, e deve ser interpretado da seguinte forma:

O tipo do dado é inteiro de 32 bits. Os três bytes mais significativos devem ser interpretados como caracteres ASCII enquanto o último byte deve ser interpretado como valor inteiro.

Exemplo:

"w" = 0x77 (ASCII)
"i" = 0x69 (ASCII)
"n" = 0x6E (ASCII)
"0" = 0x00 (Binário)
O valor "win0" representa Wiegand zero. Sua conversão para o formato descrito acima produz o valor 0x77696E00 em hexadecimal e se torna 2003398144 em base decimal.

Solicitar imagem de usuário ao servidor
O equipamento irá solicitar a foto do usuário para o servidor sempre que na resposta dos eventos de identificação o parâmetro user_image for true (indicando que o usuário possui foto).

O método HTTP usado é o GET. O contentType é application/octet-stream. Todos os parâmetros são enviados através da query string.

GET /user_get_image.fcgi
Parâmetros

user_id (int) : ID do usuário.
Resposta

imagem (octet-stream) : Foto do usuário requisitado nos formatos BMP, JPG/JPEG ou PNG;
Verifica disponibilidade do servidor
Se o equipamento não conseguir se comunicar com o servidor por três tentativas seguidas, ele entrará em modo de contingência. O número de tentativas é um parâmetro configurável.

Neste modo, todas as identificações passam a ser feitas utilizando unicamente os registros locais do equipamento, que, para tanto, devem estar atualizados.

A cada minuto, o equipamento envia uma nova requisição POST/device_is_alive ao servidor com o número de logs disponíveis no corpo da mensagem (JSON). Assim que obtiver uma resposta (HTTP status code OK), ele voltará a seu modo de operação original.

O método HTTP usado é o POST. O contentType é application/json.

POST /device_is_alive.fcgi
Parâmetros

access_logs (int) : Número de logs disponíveis.
Resposta

É esperada uma resposta vazia (HTTP Status code OK).

Mensagem de Retorno
Mensagem de retorno do servidor para o equipamento após um evento de tentativa de identificação.

result
Resultado da análise da tentativa de identificação.

Campo	Tipo	Descrição
event	int	Tipo do evento, pode ser:
Equipamento inválido
Parâmetros de identificação inválidos
Não identificado
Identificação pendente
Tempo de identificação esgotado
Acesso negado
Acesso concedido
Acesso pendente (usado quando o acesso depende de mais de uma pessoa)
Usuário não é administrador (usado quando um usuário tenta acessar o menu mas não é administrador)
Acesso não identificado (quando o portal é aberto através da API e o motivo não é informado)
Acesso por botoeira
Acesso pela interface web
Desistência de entrada (exclusivo para iDBlock)
Sem resposta (nenhuma ação é tomada)
Acesso pela interfonia (exclusivo para iDFace)
user_id	int	ID do usuário, em caso de identificação.
user_name	string	Nome do usuário, em caso de identificação.
user_image	bool	Usuário identificado possui ou não foto.
user_image_hash	string	Caso o usuário identificado possua imagem, envia o hash (SHA1) da mesma.
portal_id	string	ID do portal correspondente.
actions	Array de Objetos JSON	Ações que devem ser executas pelo equipamento. Exemplo: [ {"action":"door", "parameters":"door=1"}, {"action":"door", "parameters":"door=2"} ]
duress	int	Indica se é dedo do pânico ou uma simples identificação (1 ser for dedo de pânico ou 0 para identificação comum).
message	string	Mensagem a ser exibida no display no momento do acesso.
Exemplos de respostas
Resposta para os dispositivos iDAccess, iDFit e iDBox
Autoriza um acesso:

{
    "result": {
        "event": 7,
        "user_id": 6,
        "user_name": "Neal Caffrey",
        "user_image": false,
        "portal_id": 1,
        "actions":[
            {"action": "door", "parameters": "door=1"},
            {"action": "door", "parameters": "door=2"}
        ]
    }
}
Resposta para os dispositivos iDFlex, iDAccess Pro e iDAccess Nano
Autoriza um acesso:

{
    "result": {
        "event": 7,
        "user_id": 6,
        "user_name": "Neal Caffrey",
        "user_image": false,
        "portal_id": 1,
        "actions": [
            {"action": "sec_box", "parameters": "id=65793, reason=1"}
        ]
    }
}
Nota: O parâmetro reason, define o motivo de abertura (0 = Desconhecido, 1 = Autorizado, 2 = Botoeira e 3 = Comando WEB).

### Resposta para iDBlock (Autorização)
Autoriza um acesso na catraca projetada.

```json
{
    "result": {
        "event": 7,
        "user_id": 6,
        "user_name": "Danny Boy",
        "user_image": false,
        "portal_id": 1,
        "actions": [
            { "action": "catra", "parameters": "allow=clockwise" }
        ]
    }
}
```
> [!NOTE]
> `allow` pode ser `clockwise` (horário), `anticlockwise` (anti-horário) ou `both` (ambos).

## Monitoramento de Eventos (Monitor)
Serviço para monitoramento assíncrono de eventos direto para um servidor externo.

### Configuração do Monitor
```javascript
$.ajax({
    url: "/set_configuration.fcgi?session=" + session,
    type: 'POST', contentType: 'application/json',
    data: JSON.stringify({
        "monitor": {
            "request_timeout": "5000",
            "hostname": "192.168.0.20",
            "port": "8000",
            "path": "api/notifications"
        }
    })
});
```
> [!NOTE]
> O `hostname` pode ser IP ou domínio (ex: `meuservidor.com`).
### Notificações de Logs (DAO)
`POST /api/notifications/dao`
Enviado em caso de alterações em `access_logs`, `templates`, `cards` ou `alarm_logs`.

#### Exemplo de Payload
```json
{
  "object_changes": [
    {
      "object": "access_logs",
      "type": "inserted",
      "values": {
        "id": "519", "time": "1532977090", "event": "12",
        "device_id": "478435", "user_id": "0", "portal_id": "1"
      }
    }
  ],
  "device_id": 478435
}
```
### Notificações de Cadastro e Catraca
- `POST /api/notifications/usb_drive`: Logs de auditoria USB.
- `POST /api/notifications/template`: Template cadastrado remotamente.
- `POST /api/notifications/user_image`: Foto cadastrada remotamente.
- `POST /api/notifications/card/pin/password`: Credenciais cadastradas remotamente.
- `POST /api/notifications/catra_event`: Confirmação de giro ou desistência (iDBlock).
### Notificações de Status e Portas
- `POST /api/notifications/operation_mode`: Alteração no modo de operação (Ex: Contingência).
- `POST /api/notifications/device_is_alive`: Heartbeat periódico (logs disponíveis).
- `POST /api/notifications/door`: Abertura/Fechamento de portas (Relé ou Sensor).
- `POST /api/notifications/secbox`: Alteração de estado da Security Box.
- `POST /api/notifications/access_photo`: Envio de foto em Base64 após identificação.

> [!TIP]
> Ative `enable_photo_upload` em `monitor` para receber imagens via monitor.

## Comunicação Proativa (Modo Push)
O equipamento busca comandos no servidor periodicamente.

### Fluxo de Execução
1. Equipamento faz `GET /push`.
2. Servidor responde com JSON contendo comando (`verb`, `endpoint`, `body`).
3. Equipamento executa e envia `POST /result`.

#### Exemplo de Resposta do Servidor
```json
{
    "verb": "POST",
    "endpoint": "load_objects",
    "body": { "object": "users" },
    "contentType": "application/json"
}
```

### Resultado de Comando
`POST /result`

#### Exemplo de Payload
```json
{
    "deviceId": 935107,
    "response": {
        "users": [{ "id": 1, "name": "Walter White", "password": "..." }]
    }
}
```

### Comandos em Lote (Transactions)
Possibilita o envio de múltiplos comandos em uma única transação Push.

#### Estrutura do Objeto `transactions`
```json
{
    "transactions": [
        {
            "transactionid": "1",
            "endpoint": "set_configuration",
            "body": { "general": { "language": "en_US" } }
        },
        {
            "transactionid": "2",
            "endpoint": "message_to_screen",
            "body": { "message": "hello world!", "timeout": 5000 }
        }
    ]
}
```

## Integração iDCloud
Plataforma SaaS para gerenciamento remoto via Internet.

### Configuração de Conexão
Defina `push_remote_address` como `https://push.idsecure.com.br/api`.

```json
{
    "push_server": {
        "push_remote_address": "https://push.idsecure.com.br/api",
        "push_request_timeout": "30000",
        "push_request_period": "5"
    }
}
```

### GET /change_idcloud_code.fcgi
Gera um novo código de verificação para o dispositivo.

## Gerenciamento de Alarme

### POST /alarm_status.fcgi
Consulta ou altera o status do alarme.

#### Causas de Alarme
| ID | Descrição | ID | Descrição |
| :--- | :--- | :--- | :--- |
| 1-5 | Zonas de alarme | 6 | Porta aberta |
| 7 | Arrombamento | 8 | Dedo de pânico |
| 9 | Violação (Tamper) | 10 | Cartão de pânico |
| 11 | PIN de pânico | 12 | Senha de pânico |

#### Exemplo de Resposta (Status)
```json
{ "active": false, "cause": 0 }
```
### POST /set_configuration.fcgi (Alarmes)
Configura parâmetros de detecção e atraso.

```json
{
    "alarm": {
        "door_sensor_enabled": "1",
        "panic_finger_enabled": "1",
        "door_sensor_delay": "5"
    }
}
```

## Modo Ponto (Attendance Mode)
Desabilita regras de acesso p/ registro de jornada.

| Parâmetro | Tipo | Descrição |
| :--- | :--- | :--- |
| attendance_mode | int | Ativa (1) ou desativa (0) o modo ponto. |
| log_type | int | Personalização de batida (1: On, 0: Off). |

#### Exemplo de requisição
```javascript
$.ajax({
    url: "/set_configuration.fcgi?session=" + session,
    type: 'POST', contentType: 'application/json',
    data: JSON.stringify({
        "general": { "attendance_mode": "1" },
        "identifier" : { "log_type": "1" }
    })
});
```
### Exportação de Relatório de Ponto
Exemplo de requisição para exportar logs de batida de ponto via `/report_generate.fcgi`.

```javascript
$.ajax({
  url: "/report_generate.fcgi?session=" + session,
  type: 'POST', contentType: 'application/json',
  data: JSON.stringify({
    "order": ["descending", "time"],
    "object": "access_logs",
    "delimiter": ";",
    "line_break": "\r\n",
    "header": ";Data e Hora;ID de Batida;Tipo de Batida;Autorização;Tipo de Identificação;Código (Usuário);Nome (Usuário);Matrícula (Usuário);Nome (Portal)",
    "columns": [
      { "type": "object_field", "object": "access_logs", "field": "time", "format": { "format": "%d/%m/%Y %H:%M:%S" } },
      { "type": "object_field", "object": "log_types", "field": "id" },
      { "type": "object_field", "object": "log_types", "field": "name" },
      { "type": "object_field", "object": "access_logs", "field": "event" },
      { "type": "object_field", "object": "users", "field": "name" }
    ]
  })
});
```
#### Colunas do Relatório
- **Data e Hora**: Momento do registro.
- **ID de Batida**: Identificador único do tipo.
- **Tipo de Batida**: Evento (entrada, saída, etc.).
- **Autorização**: Permitido ou negado.
- **Identificação**: Método (cartão, biometria, etc.).
- **Usuário**: Código, nome e matrícula.
- **Portal**: Local do registro.

## Visitantes e Expiração de Usuários
Visitantes têm acesso limitado por `begin_time` e `end_time`.

### Limpeza Automática
| Parâmetro | Valor | Descrição |
| :--- | :--- | :--- |
| clear_expired_users | `all` | Limpa usuários e visitantes. |
| clear_expired_users | `visitors` | Limpa apenas visitantes. |
| clear_expired_users | `disable` | Desabilita limpeza automática. |

> [!NOTE]
> A limpeza ocorre 16 minutos após o reinício diário.

## Glossário

- **Abatrack II**: Protocolo de comunicação física entre equipamentos.
- **Acesso**: Ação de identificação e autorização no terminal.
- **Botoeira**: Dispositivo de abertura sem identificação.
- **CSV**: *Comma Separated Values* (dados tabulares em texto).
- **NO/NC**: Normalmente Aberto / Normalmente Fechado (estados de relés/sensores).
- **Relé**: Dispositivo de acionamento elétrico temporizado.
- **Pendrive**: Armazenamento USB para exportação de logs.
- **Sensor de Porta**: Detecta se a porta está fisicamente aberta.
- **Wiegand**: Protocolo padrão de comunicação entre periféricos de acesso.
