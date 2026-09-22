# Controle de acesso por turma na Control iD — procedimento manual

Runbook validado na catraca de testes em **19/09/2026**, montando pela API (`.fcgi`) a liberação de **entrada e saída** de um departamento em horários distintos.

Serve para dois usos:

- reproduzir/depurar o cenário à mão, sem passar pelo projeto;
- servir de referência do que o `sync` do projeto precisa fazer (`webapi/src/hardware/brands/controlid/access-group/controlid-access-group.ts`).

Referência da API: [`docs/catracas/controlid/README.md`](../catracas/controlid/README.md).

---

## 1. Modelo de dados

O que decide se alguém passa é uma cadeia de vínculos. Nenhum elo pode faltar:

```
users ──> user_groups ──> groups ──> group_access_rules ──> access_rules
                                                                │
                                          ┌─────────────────────┴─────────────────────┐
                                          │                                           │
                              access_rule_time_zones                        portal_access_rules
                                          │                                           │
                                     time_zones ──> time_spans                     portals
                                    (QUANDO pode passar)                        (POR ONDE e em
                                                                                 QUAL SENTIDO)
```

| Objeto | Papel |
| :--- | :--- |
| `groups` | Departamento no equipamento. Uma turma = um departamento. |
| `access_rules` | A regra. `type: 1` = permissão, `type: 0` = bloqueio. `priority: 0`. |
| `access_rule_time_zones` | Liga a regra ao horário. |
| `time_zones` / `time_spans` | A janela de horário. `start`/`end` em **segundos desde 0h**, com flags por dia da semana. |
| `portal_access_rules` | **Liga a regra ao portal, e é isso que define o sentido.** |
| `portals` | Um portal liga duas áreas e tem uma única direção (`area_from_id` → `area_to_id`). |
| `group_access_rules` | Liga a regra ao departamento. |

Quatro coisas que valem mais do que a documentação oficial explica:

1. **Portal é sentido.** Uma regra ligada só ao portal de entrada libera só a entrada. A pessoa entra e fica presa lá dentro. Foi exatamente o que aconteceu no teste.
2. **Permissões somam.** Se a pessoa estiver em outro departamento cuja regra cobre o mesmo portal (ex.: "Sempre Liberado"), a restrição da turma não vale nada. Para restringir de verdade, a pessoa só pode estar nos grupos da turma.
3. **Entrada e saída são regras separadas** quando as janelas de horário forem diferentes. Uma regra tem um conjunto de horários só.
4. **Nome de horário é curto.** O projeto trunca em 15 bytes (`nomeHorario`). Nomes longos em `time_zones` não sobrevivem.

---

## 2. Preparação

As chamadas abaixo usam duas variáveis. Exporte no terminal antes (no Postman, use variáveis de ambiente com os mesmos nomes):

```bash
CATRACA="http://187.94.98.90:55580"
```

A sessão expira. Sempre que começar, gere de novo:

```bash
curl --location "$CATRACA/login.fcgi" --data '{"login":"USUARIO","password":"SENHA"}'
```

Retorna `{"session":"..."}`. Guarde:

```bash
SESSAO="cole-o-token-aqui"
```

> Não versione token nem credencial. Os tokens que aparecem em conversas antigas já estão inválidos.

### Convenções das chamadas

- Tudo é `POST` com corpo JSON. No Postman: Body → raw → JSON.
- `create_objects.fcgi` recebe `{"object":"<tabela>","values":[ {...} ]}` e devolve `{"ids":[...]}`.
- `load_objects.fcgi` recebe `{"object":"<tabela>","where":{"<tabela>":{...}}}`.
- `destroy_objects.fcgi` recebe `{"object":"<tabela>","where":{"<tabela>":{...}}}`.
- No `where`, `{"campo": 25}` e `{"campo": {"=": 25}}` funcionam igual. Vários campos no mesmo objeto são combinados com E.

---

## 3. Reconhecimento (só leitura, sempre antes de criar)

```bash
curl --location "$CATRACA/load_objects.fcgi?session=$SESSAO" --data '{"object":"portals"}'
```

Resposta no equipamento de teste, com os portais de fábrica e os criados pelo projeto:

```json
{
    "portals": [
        { "id": 1, "name": "Portal de Entrada", "area_from_id": 1, "area_to_id": 2 },
        { "id": 2, "name": "Portal de Saída",   "area_from_id": 2, "area_to_id": 1 },
        { "id": 3, "name": "Entrada Área Interna", "area_from_id": 4, "area_to_id": 3 },
        { "id": 4, "name": "Entrada Área Externa", "area_from_id": 3, "area_to_id": 4 }
    ]
}
```

Os demais levantamentos:

```bash
curl --location "$CATRACA/load_objects.fcgi?session=$SESSAO" --data '{"object":"areas"}'
curl --location "$CATRACA/load_objects.fcgi?session=$SESSAO" --data '{"object":"groups"}'
curl --location "$CATRACA/load_objects.fcgi?session=$SESSAO" --data '{"object":"time_zones"}'
```

Anote os ids. Todo o resto depende deles.

---

## 4. Caso validado: turma "Catec manha"

Cenário montado no teste:

| | Entrada | Saída |
| :--- | :--- | :--- |
| Departamento (`groups`) | 25 "Catec manha" | 25 "Catec manha" |
| Portal | 1 "Portal de Entrada" | 2 "Portal de Saída" |
| Horário (`time_zones`) | 10 "catec manha" | 11 "catec manha saida" |
| Regra (`access_rules`) | 18 | 19 "Catec manha - Saida" |

A entrada foi criada pela interface web do equipamento (departamento → horário), que gerou a regra 18 **ligada apenas ao portal 1**. A saída foi criada pela API, com os seis passos abaixo.

O mesmo roteiro serve para os dois sentidos: muda só o `portal_id` e a janela de horário.

### Passo 1 — criar o horário

```bash
curl --location "$CATRACA/create_objects.fcgi?session=$SESSAO" \
  --data '{"object":"time_zones","values":[{"name":"catec manha saida"}]}'
```

```json
{ "ids": [ 11 ] }
```

**Esse 11 é o `time_zone_id`.** Anote.

### Passo 2 — criar os intervalos do horário

Exemplo: 11:30 às 12:30, de segunda a sexta. `start` e `end` em segundos desde 0h → 11:30 = `41400`, 12:30 = `45000`.

```bash
curl --location "$CATRACA/create_objects.fcgi?session=$SESSAO" \
  --data '{"object":"time_spans","values":[{"time_zone_id":11,"start":41400,"end":45000,"sun":0,"mon":1,"tue":1,"wed":1,"thu":1,"fri":1,"sat":0,"hol1":0,"hol2":0,"hol3":0}]}'
```

Um horário aceita vários intervalos: basta mandar mais objetos no `values`, todos com o mesmo `time_zone_id`. Conversão rápida: `segundos = hora * 3600 + minuto * 60`.

### Passo 3 — criar a regra

```bash
curl --location "$CATRACA/create_objects.fcgi?session=$SESSAO" \
  --data '{"object":"access_rules","values":[{"name":"Catec manha - Saida","type":1,"priority":0}]}'
```

```json
{ "ids": [ 19 ] }
```

**Esse 19 é o `access_rule_id`, o id que vai em todos os passos seguintes.**

### Passo 4 — ligar regra ao horário

```bash
curl --location "$CATRACA/create_objects.fcgi?session=$SESSAO" \
  --data '{"object":"access_rule_time_zones","values":[{"access_rule_id":19,"time_zone_id":11}]}'
```

```json
{ "ids": [ 17 ] }
```

⚠️ **Esse 17 é o id da linha do vínculo, não é id de regra.** Continue usando 19. Veja a seção 6.

### Passo 5 — ligar regra ao portal (define o sentido)

```bash
curl --location "$CATRACA/create_objects.fcgi?session=$SESSAO" \
  --data '{"object":"portal_access_rules","values":[{"portal_id":2,"access_rule_id":19}]}'
```

Para a entrada, o mesmo comando com `"portal_id":1`.

### Passo 6 — ligar regra ao departamento

```bash
curl --location "$CATRACA/create_objects.fcgi?session=$SESSAO" \
  --data '{"object":"group_access_rules","values":[{"group_id":25,"access_rule_id":19}]}'
```

### Atalho: saída no mesmo horário da entrada

Se a saída puder usar a mesma janela da entrada, pule os passos 1 a 4 e só ligue a regra existente ao portal de saída:

```bash
curl --location "$CATRACA/create_objects.fcgi?session=$SESSAO" \
  --data '{"object":"portal_access_rules","values":[{"portal_id":2,"access_rule_id":18}]}'
```

---

## 5. Conferência

Faça os quatro na sequência. Todos devem retornar linha.

```bash
# regra existe e é permissão (type 1)
curl --location "$CATRACA/load_objects.fcgi?session=$SESSAO" \
  --data '{"object":"access_rules","where":{"access_rules":{"id":19}}}'

# regra tem horário
curl --location "$CATRACA/load_objects.fcgi?session=$SESSAO" \
  --data '{"object":"access_rule_time_zones","where":{"access_rule_time_zones":{"access_rule_id":19}}}'

# regra está no portal certo (e só nele)
curl --location "$CATRACA/load_objects.fcgi?session=$SESSAO" \
  --data '{"object":"portal_access_rules","where":{"portal_access_rules":{"access_rule_id":19}}}'

# departamento tem as duas regras: entrada e saída
curl --location "$CATRACA/load_objects.fcgi?session=$SESSAO" \
  --data '{"object":"group_access_rules","where":{"group_access_rules":{"group_id":25}}}'
```

O último deve devolver:

```json
{
    "group_access_rules": [
        { "group_id": 25, "access_rule_id": 18 },
        { "group_id": 25, "access_rule_id": 19 }
    ]
}
```

Conferir os intervalos do horário:

```bash
curl --location "$CATRACA/load_objects.fcgi?session=$SESSAO" \
  --data '{"object":"time_spans","where":{"time_spans":{"time_zone_id":{"=":11}}}}'
```

### Teste na catraca

Passe com um usuário do departamento, dentro e fora da janela, nos dois sentidos. Depois leia os logs do usuário (`event` 7 = acesso concedido, 6 = negado) e confira o `portal_id` registrado:

```bash
curl --location "$CATRACA/load_objects.fcgi?session=$SESSAO" \
  --data '{"object":"access_logs","where":{"access_logs":{"user_id":{"=":123}}}}'
```

O `portal_id` do log é a **única forma confiável** de saber qual portal o firmware associa a cada sentido do giro. Use isso antes de concluir qualquer coisa sobre inversão de portal.

---

## 6. Armadilhas que já custaram tempo

### 6.1. O `ids` de uma tabela de vínculo não é id de regra

`create_objects` sempre devolve o id da linha criada. Em `access_rule_time_zones`, `portal_access_rules` e `group_access_rules`, esse id é da linha do vínculo, e não serve para mais nada.

No teste, o passo 4 devolveu `{"ids":[17]}` e esse 17 foi usado como `access_rule_id` no passo 5. Como a regra 17 existia (era de outra turma), **o equipamento aceitou sem erro** e a regra da turma MATUTINO-03 passou a liberar o portal de saída. Falha silenciosa, a pior categoria.

Depois, o passo 6 usou o `ids` do passo 5 (45), que não corresponde a nenhuma regra:

```json
{ "error": "constraint failed: FOREIGN KEY constraint failed", "code": 1 }
```

Regra prática: **o único id que se propaga entre os passos é o do passo 3** (`access_rules`), mais o do passo 1 (`time_zones`), usado só no passo 2 e no 4.

Limpeza do vínculo errado, filtrando pelas duas colunas para não derrubar o vínculo legítimo:

```bash
curl --location "$CATRACA/destroy_objects.fcgi?session=$SESSAO" \
  --data '{"object":"portal_access_rules","where":{"portal_access_rules":{"portal_id":2,"access_rule_id":17}}}'
```

### 6.2. `FOREIGN KEY constraint failed`

Significa que algum id referenciado não existe. Confira o id com `load_objects` antes de repetir a chamada.

### 6.3. Regra ligada ao portal errado não dá erro

O equipamento não valida semântica. Só o `portal_access_rules` diz o sentido, e o nome da regra não influencia nada. Depois de criar, sempre confira com o `load_objects` da seção 5.

### 6.4. Permissões somam

Antes de concluir que "a restrição funciona", confira em que grupos o usuário está (`user_groups`) e quais regras esses grupos têm. Uma regra "Sempre Liberado" em outro departamento invalida o teste.

---

## 7. Desfazer

A ordem importa, por causa das chaves estrangeiras. Vínculos primeiro, objetos depois.

```bash
# 1. vínculos da regra
curl --location "$CATRACA/destroy_objects.fcgi?session=$SESSAO" \
  --data '{"object":"access_rule_time_zones","where":{"access_rule_time_zones":{"access_rule_id":19}}}'
curl --location "$CATRACA/destroy_objects.fcgi?session=$SESSAO" \
  --data '{"object":"portal_access_rules","where":{"portal_access_rules":{"access_rule_id":19}}}'
curl --location "$CATRACA/destroy_objects.fcgi?session=$SESSAO" \
  --data '{"object":"group_access_rules","where":{"group_access_rules":{"access_rule_id":19}}}'

# 2. a regra
curl --location "$CATRACA/destroy_objects.fcgi?session=$SESSAO" \
  --data '{"object":"access_rules","where":{"access_rules":{"id":19}}}'

# 3. intervalos e horário
curl --location "$CATRACA/destroy_objects.fcgi?session=$SESSAO" \
  --data '{"object":"time_spans","where":{"time_spans":{"time_zone_id":11}}}'
curl --location "$CATRACA/destroy_objects.fcgi?session=$SESSAO" \
  --data '{"object":"time_zones","where":{"time_zones":{"id":11}}}'
```

É a mesma sequência de `removerRegra` no projeto.

---

## 8. Pendências conhecidas no projeto

Levantadas neste mesmo teste, ainda **não corrigidas**:

### 8.1. Sentido dos portais criados pelo projeto

`prepareDirection` cria a área "Área Interna" (id 3) antes da "Área Externa" (id 4) e monta:

| Portal | Nome | Criado | Esperado |
| :--- | :--- | :--- | :--- |
| 3 | Entrada Área Interna | 4 → 3 | 3 → 4 |
| 4 | Entrada Área Externa | 3 → 4 | 4 → 3 |

O esperado segue o padrão de fábrica (entrada = área menor → maior, como nos portais 1 e 2). Mas com os nomes atuais, "Entrada Área Interna" indo de 3 → 4 significaria Interna → Externa, o contrário do nome. Ou seja: a correção pode ser inverter `area_from_id`/`area_to_id`, ou inverter a ordem/nomes das áreas. **Decidir só depois de confirmar pelo `portal_id` dos `access_logs`** (seção 5).

### 8.2. Mapeamento sentido → portal

A regra 17, "SchoolGuard MATUTINO-03 - Entrada Área **Externa**", criada pelo `sync`, está ligada ao portal 3, chamado "Entrada Área **Interna**". O `sync` usa o `portais[sentido]` que recebe de fora, então falta investigar de onde vem esse `ControlIdPortals` e se está trocado na origem.

### 8.3. Saída da turma

Confirmar que o `sync` cria regra para os **dois** sentidos. O modelo já prevê (`ControlIdRuleRef` por sentido), mas o caso real veio só com a entrada.
