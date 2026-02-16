# Boas Vindas

O Sistema iDSecure, desenvolvido pela Control iD, é um software que permite controlar os acessos de pessoas com grande eficiência, atendendo às exigências e padrões do mercado. Este manual tem por objetivo auxiliá-lo na configuração e operação de seu sistema.

---

# Requisitos de Instalação

A Control iD recomenda que sejam seguidas, no mínimo, as recomendações abaixo para garantir a experiência do usuário e o bom funcionamento do software.

As definições abaixo são para um computador que seja dedicado ao sistema iDSecure.

> [!IMPORTANT]
> A instalação deve ser realizada com privilégios de administrador.

| Requisitos de Instalação | iDSecure Lite | iDSecure Pro/Enterprise |
| :--- | :--- | :--- |
| **Sistema Operacional** | A partir do Windows 7 x64 | A partir Windows Server 2008 R2 ou Windows 10 Professional x64 |
| **Quantidade de memória RAM** | A partir de 4GB | A partir de 16GB |
| **Espaço em disco disponível** | A partir de 4GB | A partir de 200GB |
| **Processador** | Quad Core 2.0 GHz | Intel Core i7 4790k |
| **Navegador** | Google Chrome (versão 53.0) | Google Chrome (versão 53.0) |
| **Versão .NET Framework** | Versão 4.8 | Versão 4.8 |
| **Algoritmo Innovatrics** | - | Versão 3.0.8 |

> [!WARNING]
> **Informações Importantes**: Por se tratar de um software que processa e armazena informações, o banco de dados deve ser manipulado somente por técnicos especializados.

---

# Acessando o Sistema

Após a instalação, o iDSecure pode ser acessado tanto via desktop (clicando no ícone) como diretamente através de um navegador ([https://localhost:30443](https://localhost:30443)).

Os primeiros passos recomendados para a utilização do sistema iDSecure são:

1.  **Cadastrar Pessoas**
2.  **Cadastrar Departamentos**
3.  **Cadastrar Áreas**
4.  **Cadastrar Dispositivos**
5.  **Cadastrar Regra de Acesso**

Para mais informações sobre como realizar uma determinada tarefa acima, basta clicar no tópico desejado para ser redirecionado a uma página com as respectivas instruções.

---

# Monitoramento

Todo dispositivo cadastrado pode ser acompanhado na tela de **Monitoramento**. Os acessos realizados podem ser visualizados e filtrados de acordo com evento, pessoa, dispositivo e área.

![Monitoramento](https://www.controlid.com.br/docs/idsecure-pt/img/monitoramento.png)

Na aba **"Dispositivos"**, é possível analisar os estados e especificações dos equipamentos cadastrados no iD Secure. Assim, em caso de um dispositivo apresentar uma falha, é possível ver se ele está conectado na rede, qual e quando foi a última tentativa de acesso. Dados semelhantes podem ser vistos na aba **"Alarmes"**, sendo que a diferença é que nesta os alarmes aparecem listados.

É possível também ativar o relé associado ao equipamento. Por hora, o botão está configurado para abrir apenas o primeiro relé do dispositivo. Em aparelhos como a iD Box, por exemplo, que possui quatro relés, três deles estarão inacessíveis nesta tela. Todavia, com a licença Enterprise, é possível controlá-los na **Planta Baixa**.

![Dispositivos no Monitoramento](https://www.controlid.com.br/docs/idsecure-pt/img/monitoramento_device.png)

---

# Planta Baixa

É uma funcionalidade disponível para a versão **Enterprise** do sistema iD Secure. Através do sistema de planta baixa é possível mapear os dispositivos cadastrados na planta do ambiente, de forma que estes possam ser configurados e controlados.

Ao clicar em **"Planta Baixa"** no menu lateral, o usuário é direcionado a uma página com as plantas já existentes. Nesta tela, é possível também criar uma nova clicando-se em **"Adicionar"**.

A tela de criação de uma planta baixa se assemelha à imagem abaixo:

![Criação de Planta Baixa](https://www.controlid.com.br/docs/idsecure-pt/img/planta_baixa_create.png)

> [!NOTE]
> Nota-se que é possível adicionar um mesmo dispositivo mais de uma vez, haja visto que nesta funcionalidade é feito o controle das leitoras. No caso do exemplo, temos dois dispositivos, e cada um deles tem duas leitoras.

Após o carregamento da imagem, é possível arrastar os equipamentos para a planta e posicioná-los de acordo com sua localização. Feito isso, basta clicar em **"Salvar"**.

![Visualização da Planta Baixa](https://www.controlid.com.br/docs/idsecure-pt/img/planta_baixa1.png)

A planta criada poderá ser acessada através do mesmo menu, e as leitoras poderão ser configuradas e abertas conforme desejado. Ao clicar em uma leitora, dois botões aparecem, sendo um de edição e o outro de controle de acesso.

---

# Sincronização dos Dados

A sincronização dos dados no sistema iDSecure com os equipamentos ocorre de forma automática. Assim que algum dado como equipamento, área, usuário ou forma de identificação for alterado, o sistema calcula todas as modificações que devem ser realizadas nos equipamentos e inicia a sincronização imediatamente.

> [!TIP]
> É importante aguardar alguns segundos até que todos os dados estejam replicados nos equipamentos.

Caso algum equipamento esteja offline e não receba as atualizações, é possível realizá-las por meio do botão **"Enviar Dados"**. O iDSecure também verifica as configurações dos equipamentos automaticamente toda vez que é iniciado.

![Enviar Dados](https://www.controlid.com.br/docs/idsecure-pt/img/enviar_dados1.png)

Por fim, no modo **Enterprise**, todas as informações (exceto contingência) ficam armazenadas no servidor e as modificações passam a ser efetivas imediatamente.

---

# Cadastros

O menu de cadastros fornece as ferramentas para o cadastro de dados e informações do iDSecure. Através dele, é possível cadastrar, editar e remover informações referentes a:
- Pessoas e Grupos de Pessoas
- Visitantes e Grupos de Visitantes
- Departamentos
- Empresas

## Pessoas

O cadastro de pessoas segue três etapas principais:
1.  **Cadastrar os dados iniciais**
2.  **Cadastrar digital ou face**
3.  **Vincular ao departamento**
Após confirmar que todas as informações estão corretas, basta clicar no botão **Salvar**.

Na tela de dados de usuário, preencha as informações pessoais. Opções importantes:
- **Inativo**: Não enviado para os dispositivos (Lite) ou não liberado pelo servidor (Enterprise), mas listado no sistema.
- **Contingência**: Credenciais mantidas nos dispositivos mesmo no modo Enterprise para garantir acesso caso a conexão com o servidor caia.
- **Lista de Exceção**: Usuário sempre bloqueado, gerando um alarme ao ser identificado.

![Cadastro de Pessoa](https://www.controlid.com.br/docs/idsecure-pt/img/cad_pessoa.png)

Na captura de digitais, selecione o número de digitais e o método (Leitor USB ou Equipamento cadastrado).

![Captura de Digital](https://www.controlid.com.br/docs/idsecure-pt/img/cad_digital.png)

Na vinculação de departamento, associe a pessoa a um grupo, departamento ou empresa previamente cadastrados.

![Vinculação de Departamento](https://www.controlid.com.br/docs/idsecure-pt/img/departamento.png)

Também é possível cadastrar **Cartão de Proximidade** ou **QR Code**.

![Cadastro de Cartão](https://www.controlid.com.br/docs/idsecure-pt/img/cartoes.png)
![Cadastro de QR Code](https://www.controlid.com.br/docs/idsecure-pt/img/qrcode.png)

### Informações Adicionais
- **Dedo de Pânico**: Aciona um alarme silencioso.
- **Período de Liberação**: Define validade das regras de acesso.
- **Veículo**: Dados do veículo associado.
- **Documentos**: Foto do rosto ou documento de identificação.

![Informações Adicionais](https://www.controlid.com.br/docs/idsecure-pt/img/adicional.png)

Na listagem de Cadastro, você pode buscar, editar, remover, importar/exportar dados e imprimir cartões.

![Lista de Pessoas](https://www.controlid.com.br/docs/idsecure-pt/img/pessoa_cad.png)

Para dispositivos **iDFace**, utilize a aba **Face** para capturar a biometria facial.

![Cadastro Facial](https://www.controlid.com.br/docs/idsecure-pt/img/pessoa_face.png)

## Visitantes

O cadastro de visitantes é para acessos com tempo definido. Informe validade, empresa visitada, contato responsável e credenciais (cartão, face, digital).

![Cadastro de Visitante](https://www.controlid.com.br/docs/idsecure-pt/img/cad_visitante.png)

> [!TIP]
> É possível promover um visitante a usuário regular na aba **Avançado**.

![Promover Visitante](https://www.controlid.com.br/docs/idsecure-pt/img/promove.png)

Listagem de visitantes:
![Menu de Visitantes](https://www.controlid.com.br/docs/idsecure-pt/img/menu_visit.png)

## Departamentos

Organiza as pessoas para controle de acesso por áreas. 

![Cadastro de Departamento](https://www.controlid.com.br/docs/idsecure-pt/img/cad_departamento.png)

Vincule pessoas rapidamente na aba **Pessoas**:
![Vincular Pessoas ao Departamento](https://www.controlid.com.br/docs/idsecure-pt/img/cade_departamento_pessoa.png)
![Selecionar Pessoas](https://www.controlid.com.br/docs/idsecure-pt/img/cad_departamento_vincular_pessoa.png)

Listagem de departamentos:
![Lista de Departamentos](https://www.controlid.com.br/docs/idsecure-pt/img/list_dep.png)

## Grupos de Pessoas / Empresas

Funcionam de maneira similar aos departamentos para fins organizacionais.

**Grupos:**
![Cadastro de Grupo](https://www.controlid.com.br/docs/idsecure-pt/img/group1.png)
![Lista de Grupos](https://www.controlid.com.br/docs/idsecure-pt/img/list_group.png)

**Empresas:**
![Cadastro de Empresa](https://www.controlid.com.br/docs/idsecure-pt/img/empresa1.png)
![Lista de Empresas](https://www.controlid.com.br/docs/idsecure-pt/img/list_empresa.png)

---

# Veículos e Estacionamento

Funcionalidade habilitada via configurações de **Controle de Vagas**.

## Veículos
Cadastre marca, cor, modelo, placa e associe a um motorista e Tag.

![Cadastro de Veículo](https://www.controlid.com.br/docs/idsecure-pt/img/cadastro_veiculos.PNG)
![Adicionar Veículo](https://www.controlid.com.br/docs/idsecure-pt/img/cadastro_veiculos_adicionar.PNG)

## Estacionamentos
Defina o nome e a capacidade total de vagas.

![Cadastro de Estacionamento](https://www.controlid.com.br/docs/idsecure-pt/img/cadastro_estacionamento.PNG)
![Novo Estacionamento](https://www.controlid.com.br/docs/idsecure-pt/img/cadastro_novo_estacionamento.PNG)

## Controle de Vagas
Associe vagas específicas a pessoas ou empresas.

![Vagas por Estacionamento](https://www.controlid.com.br/docs/idsecure-pt/img/cadastro_vagas_estacionamento.PNG)
![Criar Vaga](https://www.controlid.com.br/docs/idsecure-pt/img/cadastro_criar_vaga_estacionamento.PNG)

---

# Acesso

Neste menu, configuramos dispositivos, áreas, horários e as regras que unem tudo isso.

## Dispositivos
Hardware Control iD (iDAccess, iDBlock, iDBox, iDFace, etc).

- **Campos Obrigatórios**: Marcados com `*`.
- **Testar Conexão**: Verifica se o IP está alcançável.

![Cadastro de Dispositivo](https://www.controlid.com.br/docs/idsecure-pt/img/cad_equipamento.png)

### Abas:
- **Leitoras**: Vincula as áreas ao dispositivo.
- **Avançado**: Data/hora, reiniciar dispositivo, etc.
- **Integração por Arquivo**: Importação/Exportação de dados.

![Leitoras](https://www.controlid.com.br/docs/idsecure-pt/img/cad_equipamento_leitoras.png)
![Configurações Avançadas](https://www.controlid.com.br/docs/idsecure-pt/img/cad_equipamento_avan%C3%A7ado.png)

## Áreas
Espaços físicos (ex: RH, Entrada Principal).
- **Interna/Externa**: Define lógica de saída.
- **Anti-Dupla Entrada (ADE)**: Previne carona.

![Cadastro de Área](https://www.controlid.com.br/docs/idsecure-pt/img/cad_area.png)
![Vinculação de Leitoras](https://www.controlid.com.br/docs/idsecure-pt/img/cad_area_leitoras.png)

## Horários
Composto por faixas de permanência para cada dia da semana.

![Cadastro de Horário](https://www.controlid.com.br/docs/idsecure-pt/img/cad_horario.png)
![Definição de Faixas](https://www.controlid.com.br/docs/idsecure-pt/img/cadastro_horario_faixa_horario.png)

## Regras de Acesso
O eixo principal: **Quem** pode acessar, **Quando** e **Onde**.

### Passos da Criação:
1.  **Nome**: Identificador da regra.
2.  **Quem**: Pessoas, Departamentos, Grupos ou Empresas.
3.  **Quando**: Horário cadastrado.
4.  **Onde**: Áreas cadastradas.
5.  **Confirmação**: Resumo final.

![Regra de Acesso](https://www.controlid.com.br/docs/idsecure-pt/img/cad_regra_de_acesso.png)
![Regra Avançada](https://www.controlid.com.br/docs/idsecure-pt/img/regra_avancada.png)

---

# Ferramentas e Configurações

## Câmeras
Integração de câmeras IP com eventos (Acesso Liberado, Negado, Alarme).

![Integração de Câmeras](https://www.controlid.com.br/docs/idsecure-pt/img/ferramentas_cameras.JPG)

## Configurações Gerais
- **Cartão**: Tecnologia ASK ou Mifare.
- **Idioma**: Português, Inglês, Espanhol. Customização de siglas (CPF/CNPJ).
- **Banco de Dados**: SQLite, MySQL, MS-SQL. Backup diário.
- **Retenção**: Dias de log e backup (Padrão: 15 dias).
- **Modos de Exceção**: Emergência (tudo aberto) ou Trancado.

![Configurações 1](https://www.controlid.com.br/docs/idsecure-pt/img/ferramentas_config_gerais_1.PNG)
![Configurações 2](https://www.controlid.com.br/docs/idsecure-pt/img/ferramentas_config_gerais_2.PNG)

## E-mail e QR Code
Configuração de SMTP para notificações e envio de chaves de acesso.

![Configuração de E-mail](https://www.controlid.com.br/docs/idsecure-pt/img/ferramentas_config_email.PNG)

## Licenças
Verificação do status Lite/Enterprise e Licença Biométrica.

![Gestão de Licenças](https://www.controlid.com.br/docs/idsecure-pt/img/ferramentas_licencas.PNG)

---

# Integração com Banco de Dados

Detalhes técnicos das tabelas do iDSecure para integrações externas.

## Tabela: `Users`
Representa as informações das pessoas.

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| `id` | int64 | Identificador mutável de registro. Cada edição gera um novo ID. |
| `inativo` | bool | 0 = Ativo, 1 = Inativo. |
| `contingency`| bool | 1 = Em contingência (Somente Enterprise). |
| `deleted` | bool | 1 = Deletado (Histórico de auditoria). |
| `idDevice` | int | Identificador único e imutável do usuário. |
| `idType` | bool | 0 = Pessoa, 1 = Visitante. |

### Exemplo: Atualização de Usuário (SQL)

```sql
-- Atualizando registro existente
UPDATE Users SET name = "Walter H. White" WHERE id = 1000001;

-- Comportamento padrão do iDSecure (Novo registro + Flag deleted)
INSERT INTO Users
SELECT MAX(_u.id) + 1, "Walter H. White", _u.registration, _u.pis, ...
FROM Users _u 
WHERE id = 1000001;

UPDATE Users SET deleted = 1 WHERE id = 1000001;
```

## Tabela: `AccessRules`
Contém as lógicas de acesso.

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| `id` | int64 | Identificador da regra. |
| `name` | string| Nome da regra. |
| `idType` | string| 'usuários' ou 'veículos'. |

## Tabela: `Logs`
Registros de todos os acessos.

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| `id` | int64 | ID do log. |
| `idDevice` | int | ID do dispositivo. |
| `event` | int | Código do evento (7 = Autorizado, 6 = Negado, 3 = Não identificado). |
| `time` | int | Unix timestamp do acesso. |

### Exemplo: Consulta de Últimos Acessos (SQL)

```sql
SELECT u.id, u.name, l.deviceName, l.area, l.event, l.time
FROM Logs l
INNER JOIN Users u ON l.idUser = u.id
WHERE l.idUser = 1000001 AND l.event = 7
ORDER BY time DESC
LIMIT 10;
```

---
*Copyright Control iD 2022*
