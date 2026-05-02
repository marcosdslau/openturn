



Adicionar campo REGProcessado (true/false) em REGRegistroPassagem onde por padrão é false.

Criar tabela RPDRegistrosDiarios com os seguintes campos (regra de RLS/por tenant):
  RPDCodigo
  RPDData (somente data, sem hora)
  PESCodigo
  RPDDataEntrada (data e hora)
  RPDDataSaida (data e hora)
  RPDStatus (ENVIADO, ERRO, MANUAL, PENDENTE)
  RPDResult JSONB

Adicionar campo INSTempoSync (string) em INSInstituicao onde por padrão é "0 9,15,22 * * *". Ao iniciar a API, deve ser buscado o horario de sincronizacao do tenant e atualizado o campo INSTempoSync e com o cron iniciar automaticamente a rotina de sincronizacao em webapi. o Gatilo deve ser:

 - Fazer select count(*) de REGRegistroPassagem onde REGProcessado é false.
 - Se o resultado for maior que 0, envia mensagem para o rabbitmq com o tipo INTERNAL para o worker processar.
 - Se o resultado for 0, nao envia mensagem para o rabbitmq.

Na tela de configuração de ERP, deve ser adicionado um campo chamado "Horario de Sincronizacao" onde o usuario pode selecionar o horario de sincronizacao do tenant. Use o componente de cron expression para selecionar o horario de sincronizacao. Também deve ter opção de ativar/desativar a sincronizacao da rotina.



Em worker deve ser adicionado o tipo trigger "INTERNAL" em RotinaJobData para assim que receber a mensagem do rabbitmq, se for o tipo INTERNAL, seguir fluxo de processamento interno.
Fluxo de processamento interno:
1. Buscar todos os registros de REGRegistroPassagem onde REGProcessado é false.
2. Agrupar por PESCodigo e REGDataHora (somente data, sem hora).
3. Para cada grupo, criar um registro em RPDRegistrosDiarios com os seguintes campos:
  RPDCodigo
  RPDData (somente data, sem hora)
  PESCodigo
  RPDDataEntrada (data e hora) (onde é a menor data e hora do grupo. Se na proxima execucao for encontrada uma data menor, atualizar o registro.)
  RPDDataSaida (data e hora) (onde é a maior data e hora do grupo. Se na proxima execucao for encontrada uma data maior, atualizar o registro.)
  RPDStatus (PENDENTE)
4. Atualizar o registro de REGRegistroPassagem para REGProcessado true.

Obs: com base na pessoa e data (PESCodigo e RPDData) verificar se o registro já existe, se existir atualiza, se não existir cria.


A Tabela RPDRegistrosDiarios precisa ficar disponível para que Rotinas consiga consumir.

____________

No menu, logo abaixo de "Passagens" deve inserido um novo menu chamado "Registros". Ao Acessar essa tela deve mostrar uma tabela com os resultados de RPDRegistrosDiarios (deve entregar resultado paginado), Deve existir opções de filtros, Mesmo padrão existente em Pessoas. Porém além dos filtros de pessoas, ter opção de filtrar por:
 - Curso
 - serie
 - turma
 - Data de inicio
 - Data de fim

____________

No topo da página deve ter um botão com ícone de engrenagem e a descrição "Administrar". Ao clicar nessa tela deve considerar qual o ERP que a instituição usa, se for o ERP Gennera a tela deve mostrar:

    Mensagem indicando que a tela é referente a lançamento manual de frequencia no Gennera. Ao iniciar o processo, deve ficar na tela até o processo finalizar.

    Deve mostrar um formulário para coletar informações:
    - Select multiplo de pessoas (caso ninguém seja selecionado, considerar todas as pessoas).
    - Data de Início (obrigatorio)
    - Data de Fim (obrigatorio)
    - CheckBox: Considerar horário das passagens (Sim/Não)
    - Se "Considerar horário das passagens" = Não, mostrar um campo switch (true/false) que indica se lança presença (true) ou falta (false). Por padrão selecionado presença e o switch fica na cor verde, se selecionar falta, então switch na cor vermelha.
    E por fim um botão "Processar". Ao clicar nesse botão deve subir um modal de confirmação. Ao confirmar deve sobir um loading overlay com percentual 0% a 100%

    Se "Considerar horário das passagens" for "Sim":
        De acordo com a data de inicio e fim deve ser feito um select em RPDRegistrosDiarios filtrando com base em RPDData e que tenham data de entrada e saída preenchidos.
        Todas as pessoas que tiverem registros em RPDRegistrosDiarios nesse período, então deverá ser enviado para o Gennera.
        Deve-se fazer um array agrupado por data, onde pra cada data lista as pessoas e a data de entrada e saída (data e hora) de cada um.
        Deverá percorrer toda essa lista e com base nas configurações em ERPConfig da instituição, montar com axios ou fecth a urlbase, token e enviar para o Gennera chamando o endpoint POST "/persons/{PESIdExterno}/attendances/interval" com payload no modelo: {
            "startDate": "2023-10-31T12:15:00.000Z",
            "endDate": "2023-10-31T13:15:00.000Z",
            "present": true,
            "justification": ""
        }

        O retorno deve ser gravado em RPDResult da linha enviada e atualizar RPDStatus para enviado.
        Se a lista de pessoas no filtro, for vazia, ou seja TODOS, então:
            As pessoas que não tiverem nenhum registro no dia em questão, para esses deverá ser feito um POST "/persons/{PESIdExterno}/attendances" Com o payload (modelo): {
                "date": "2023-10-31",
                "present": false,
                "justification": ""
            }
        Senão (ou seja, tem pessoas selecionadas), então lançar somente das pessoas selecionadas.

        Caso falhe o envio, marcar RPDStatus como ERRO e gravar em RPDResult o erro.


    Se "Considerar horário das passagens" for "Não":
        De acordo com a data de inicio e fim, deve-se montar um array com os intervalos de data entre o inicio e fim e pra cada dia fazer:
        com base nas configurações em ERPConfig da instituição, montar com axios ou fecth a urlbase, token e enviar para o Gennera chamando o endpoint POST "/persons/{PESIdExterno}/attendances" Com o payload (modelo):
        {
            "date": "2023-10-31",
            "present": (valor do switch),
            "justification": ""
        }

        Verificar em RPDRegistrosDiarios com base em PESCodigo e RPDData se existe registro em RPDRegistrosDiarios.
            Se existiir registro, então atualiza RPDResult com o resultado e RPDStatus para enviado. Se falhar, grava em RPDStatus erro e o conteúdo do erro em RDPResult.

            Caso não exista registro, então cria uma linha em RPDRegistrosDiarios com a pessoa e data do lançamento. Data de Entrada e saída deixa em branco e aí grava em RDPResult o retorno (seja sucesso ou falha) e em RPDStatus se der sucesso grava Manual, se der falha grava erro.

Se o ERP configurado for qualquer outro diferente de Gennera, então mostrar mensagem de que para o ERP em questão ainda não está disponível a administração.


