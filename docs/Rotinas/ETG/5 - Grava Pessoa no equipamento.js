// Essa é uma rotina do tipo Webhook
// Path sugerido: /pessoa-equipamento | Método: POST
// Body: { PESCodigo, PESNome, PESIdExterno?, acao?: 'SYNC'|'REMOVE', EQPCodigos?: number[], forcar?: boolean }
//
// EQPCodigos limita a ação aos equipamentos informados (a rotina #4 manda só os
// pendentes). Sem EQPCodigos, vale para todos os equipamentos ativos.
//
// Pessoa inativa (ou acao 'REMOVE') → deletePerson equipamento a equipamento; o
// mapeamento só é apagado quando o hardware confirma a remoção. Equipamento que
// falhar mantém o mapeamento e volta na fila da rotina #4.
//
// Pessoa ativa → o payload é reduzido a um hash (PEQSyncHash). Equipamento cujo
// hash bate com o último sync confirmado é pulado sem nenhuma ida ao hardware;
// `forcar: true` ignora o hash.
//
// GRUPO NO EQUIPAMENTO: a turma aponta só para o DEPARTAMENTO; quem diz o id do grupo
// em CADA equipamento é a adoção (DEQDepartamentoEquipamento.DEQIdDevice). Com validação
// ativa, turma ativa, departamento vinculado e equipamento no escopo, a pessoa entra no
// grupo do departamento; fora disso, segue no grupo padrão 1 como antes. Como `grupos`
// entra no hash, trocar o departamento da turma reenvia só quem realmente mudou.

const body = context.request?.body ?? {};

const PESCodigo = Number(body.PESCodigo);
const PESNome =
  body.PESNome != null && String(body.PESNome).trim() !== ''
    ? String(body.PESNome).trim()
    : null;

if (!Number.isInteger(PESCodigo) || PESCodigo <= 0) {
  throw new Error('Body inválido: PESCodigo deve ser um número inteiro > 0');
}
if (!PESNome) {
  throw new Error('Body inválido: PESNome é obrigatório');
}

const acaoSolicitada = String(body.acao ?? '').trim().toUpperCase();
const forcar = body.forcar === true;
const codigosSolicitados = Array.isArray(body.EQPCodigos)
  ? body.EQPCodigos.map(Number).filter((n) => Number.isInteger(n) && n > 0)
  : null;

console.log('Dados recebidos (webhook):', {
  PESCodigo,
  PESNome,
  acao: acaoSolicitada || '(auto)',
  EQPCodigos: codigosSolicitados ?? '(todos)',
  forcar,
});

let pessoa = null;
try {
  pessoa = await context.db.PESPessoa.findFirst({
    where: { PESCodigo },
  });
} catch (e) {
  console.warn('Aviso: não foi possível carregar PESPessoa; segue só com nome do body', e);
}

// ── Equipamentos alvo ───────────────────────────────────────────────────────
const equipamentosAtivos = await context.db.EQPEquipamento.findMany({
  where: { EQPAtivo: true },
});

if (!equipamentosAtivos.length) {
  console.warn('Nenhum equipamento ativo para sincronizar.');
  return {
    message: 'Nenhum equipamento ativo',
    pessoa: { PESCodigo, PESNome },
    resultados: [],
  };
}

const equipamentos = codigosSolicitados?.length
  ? equipamentosAtivos.filter((dev) => codigosSolicitados.includes(dev.EQPCodigo))
  : equipamentosAtivos;

if (!equipamentos.length) {
  console.warn(
    `Nenhum dos equipamentos informados está ativo: ${(codigosSolicitados ?? []).join(', ')}`,
  );
  return {
    message: 'Nenhum equipamento alvo ativo',
    pessoa: { PESCodigo, PESNome },
    resultados: [],
  };
}

const codigosAlvo = equipamentos.map((dev) => dev.EQPCodigo);

const mapeamentos = await context.db.PESEquipamentoMapeamento.findMany({
  where: { PESCodigo, EQPCodigo: { in: codigosAlvo } },
});
const mapeamentoPorEquipamento = new Map(
  mapeamentos.map((m) => [m.EQPCodigo, m]),
);

// ── Remoção ─────────────────────────────────────────────────────────────────
const remover = acaoSolicitada === 'REMOVE' || pessoa?.PESAtivo === false;

if (remover) {
  const resultados = [];

  for (const dev of equipamentos) {
    const mapeamento = mapeamentoPorEquipamento.get(dev.EQPCodigo);

    if (!mapeamento) {
      // Sem de-para: a pessoa já não está neste equipamento.
      resultados.push({ EQPCodigo: dev.EQPCodigo, ok: true, jaRemovido: true });
      continue;
    }

    const idNoEquipamento = parseInt(mapeamento.PEQIdNoEquipamento, 10);
    if (!Number.isFinite(idNoEquipamento)) {
      const msg = `PEQIdNoEquipamento inválido (${mapeamento.PEQIdNoEquipamento})`;
      resultados.push({ EQPCodigo: dev.EQPCodigo, ok: false, error: msg });
      console.error(`Equipamento ${dev.EQPCodigo}: ${msg}`);
      continue;
    }

    try {
      await context.hardware.deletePerson(dev.EQPCodigo, idNoEquipamento);

      // Só apaga o de-para depois que o hardware confirmou.
      await context.db.PESEquipamentoMapeamento.deleteMany({
        where: { PESCodigo, EQPCodigo: dev.EQPCodigo },
      });

      resultados.push({ EQPCodigo: dev.EQPCodigo, ok: true, idNoEquipamento });
      console.log(
        `Removido PESCodigo ${PESCodigo} (id ${idNoEquipamento}) do equipamento ${dev.EQPCodigo}`,
      );
    } catch (err) {
      const msg = err?.message || String(err);
      // Mapeamento preservado: a rotina #4 enfileira de novo na próxima execução.
      resultados.push({ EQPCodigo: dev.EQPCodigo, ok: false, error: msg });
      console.error(`Falha ao remover no equipamento ${dev.EQPCodigo}:`, msg);
    }
  }

  const falhas = resultados.filter((r) => !r.ok).length;
  return {
    message: `Remoção concluída em ${resultados.length - falhas} de ${resultados.length} equipamento(s)`,
    pessoa: { PESCodigo, PESNome, PESAtivo: pessoa?.PESAtivo ?? false },
    resultados,
  };
}

// ── Departamento da turma → grupo no equipamento ────────────────────────────
// Mesma regra do núcleo da webapi (`grupoNoEquipamento`), replicada aqui de propósito:
// os dois caminhos gravam no mesmo equipamento e não podem discordar.
//
// É UM grupo só, nunca [1, departamento]: o equipamento SOMA as regras de acesso de todos
// os grupos do usuário, então manter o grupo 1 junto anularia a restrição de horário do
// departamento — é a mesma razão pela qual a webapi sempre limpa antes de vincular.
const GRUPO_PADRAO = 1;

async function resolverDepartamentoPorEquipamento() {
  const porEquipamento = new Map(codigosAlvo.map((codigo) => [codigo, null]));

  const trmCodigo = pessoa?.PESTRMCodigo ?? null;
  if (trmCodigo == null) {
    console.log('Pessoa sem turma vinculada (PESTRMCodigo nulo) — grupo padrão em todos.');
    return porEquipamento;
  }

  const turma = await context.db.TRMTurma.findFirst({ where: { TRMCodigo: trmCodigo } });
  if (!turma) {
    console.warn(`Turma ${trmCodigo} não encontrada — grupo padrão em todos os equipamentos.`);
    return porEquipamento;
  }

  const vigente =
    turma.TRMValidacaoAtiva === true && turma.TRMAtiva === true && turma.DEPCodigo != null;

  if (!vigente) {
    console.log(
      `Turma ${turma.TRMTurma}: validação ${turma.TRMValidacaoAtiva ? 'ativa' : 'inativa'}, ` +
        `turma ${turma.TRMAtiva ? 'ativa' : 'inativa'}, ` +
        `departamento ${turma.DEPCodigo ?? '(nenhum)'} — grupo padrão.`,
    );
    return porEquipamento;
  }

  // Escopo: todos os equipamentos, ou só os selecionados em TEQTurmaEquipamento.
  let escopo = codigosAlvo;
  if (turma.TRMTodosEquipamentos !== true) {
    const selecionados = await context.db.TEQTurmaEquipamento.findMany({
      where: { TRMCodigo: trmCodigo, EQPCodigo: { in: codigosAlvo } },
      select: { EQPCodigo: true },
    });
    escopo = selecionados.map((linha) => linha.EQPCodigo);
  }

  // A adoção é por equipamento: o mesmo departamento pode existir numa catraca e não
  // noutra. Equipamento sem adoção fica no grupo padrão — não há grupo para a pessoa lá.
  //
  // DEQRevisadoEm NÃO entra na condição, igual ao núcleo: revisão é sobre a configuração
  // ter sido conferida por alguém, não sobre quem entra no grupo.
  const adocoes = await context.db.DEQDepartamentoEquipamento.findMany({
    where: { DEPCodigo: turma.DEPCodigo, EQPCodigo: { in: codigosAlvo } },
  });

  for (const adocao of adocoes) {
    if (!escopo.includes(adocao.EQPCodigo)) continue;

    const idDevice = Number(adocao.DEQIdDevice);
    if (!Number.isInteger(idDevice) || idDevice <= 0) {
      console.warn(
        `Adoção ${adocao.DEQCodigo} com DEQIdDevice inválido (${adocao.DEQIdDevice}) — ` +
          `equipamento ${adocao.EQPCodigo} fica no grupo padrão.`,
      );
      continue;
    }

    porEquipamento.set(adocao.EQPCodigo, { idDevice, nome: adocao.DEQNome });
  }

  const comDepartamento = [...porEquipamento.entries()].filter(([, dep]) => dep != null);
  console.log(
    `Turma ${turma.TRMTurma} → departamento ${turma.DEPCodigo}: ` +
      `${comDepartamento.length} de ${codigosAlvo.length} equipamento(s) com grupo próprio` +
      (comDepartamento.length
        ? ` (${comDepartamento.map(([eqp, dep]) => `EQP ${eqp} → grupo ${dep.idDevice} "${dep.nome}"`).join('; ')})`
        : ' — nenhum equipamento alvo adotou esse departamento'),
  );

  return porEquipamento;
}

const departamentoPorEquipamento = await resolverDepartamentoPorEquipamento();

// ── Sincronização ───────────────────────────────────────────────────────────
let fingers = [];
if (pessoa?.PESTemplates) {
  const t = pessoa.PESTemplates;
  if (Array.isArray(t)) {
    fingers = t.map((x) => String(x));
  }
}

function idNoEquipamentoLeitor(pesIdExternoBruto, pescodigo) {
  if (pesIdExternoBruto == null || String(pesIdExternoBruto).trim() === '') {
    console.warn('PESIdExterno ausente; usando PESCodigo como id no leitor', { PESCodigo: pescodigo });
    return pescodigo;
  }
  const s = String(pesIdExternoBruto).trim();
  const n = Number(s);
  if (Number.isFinite(n) && Number.isInteger(n) && n > 0) {
    return n;
  }
  const p = parseInt(s, 10);
  if (!Number.isNaN(p) && p > 0) {
    return p;
  }
  console.warn('PESIdExterno inválido; usando PESCodigo como id no leitor', {
    PESIdExterno: pesIdExternoBruto,
    PESCodigo: pescodigo,
  });
  return pescodigo;
}

function normGrupoNome(valor) {
  return String(valor).trim().toLowerCase();
}

function encontrarGrupoNoEquipamento(gruposEquipamento, nomeGrupo) {
  const label = (nomeGrupo ?? '').trim();
  if (!label) return null;

  return (
    (gruposEquipamento ?? []).find((g) => {
      if (g?.name != null && normGrupoNome(g.name) === normGrupoNome(label)) {
        return true;
      }
      if (g?.id != null && String(g.id) === label) {
        return true;
      }
      return false;
    }) ?? null
  );
}

function resolverCodigoGrupoNoEquipamento(gruposEquipamento, nomeGrupo) {
  const grupo = encontrarGrupoNoEquipamento(gruposEquipamento, nomeGrupo);
  return grupo?.id != null ? Number(grupo.id) : null;
}

const idHardware = idNoEquipamentoLeitor(
  body.PESIdExterno ?? pessoa?.PESIdExterno,
  PESCodigo,
);

const person = {
  pescodigo: PESCodigo,
  id: idHardware,
  name: PESNome,
  cpf: pessoa?.PESDocumento || undefined,
  limiar: pessoa != null ? pessoa.PESLimiarFacial : undefined,
  grupo: pessoa?.PESGrupo ?? undefined,
  tags: pessoa?.PESCartaoTag ? [pessoa.PESCartaoTag] : [],
  faces: pessoa?.PESFotoBase64 ? [pessoa.PESFotoBase64] : [],
  faceExtension: pessoa?.PESFotoExtensao || 'jpg',
  fingers,
};

// Só o que chega no equipamento entra no hash. `versao` permite invalidar todos
// os hashes de uma vez quando o payload enviado mudar de formato.
//
// O hash é POR EQUIPAMENTO porque `grupos` passou a variar: o mesmo aluno pode entrar no
// departamento numa catraca e no grupo padrão noutra. `versao` continua 1 DE PROPÓSITO —
// quem não tem departamento gera exatamente o hash de antes e não é reenviado à toa;
// só muda o hash de quem realmente passou a ter grupo diferente.
function hashDoEquipamento(groupIds) {
  return utils.hash({
    versao: 1,
    id: person.id,
    name: person.name,
    cpf: person.cpf ?? null,
    limiar: person.limiar ?? null,
    grupo: person.grupo ?? null,
    tags: person.tags,
    faces: person.faces,
    faceExtension: person.faceExtension,
    fingers: person.fingers,
    grupos: groupIds,
  });
}

console.log(`Sincronizando em ${equipamentos.length} equipamento(s) alvo`);

const resultados = [];
for (const dev of equipamentos) {
  const mapeamento = mapeamentoPorEquipamento.get(dev.EQPCodigo);
  const departamento = departamentoPorEquipamento.get(dev.EQPCodigo) ?? null;
  const groupIds = departamento ? [departamento.idDevice] : [GRUPO_PADRAO];
  const hashPayload = hashDoEquipamento(groupIds);

  if (!forcar && mapeamento && mapeamento.PEQSyncHash === hashPayload) {
    // Payload idêntico ao último sync confirmado: nenhuma ida ao equipamento.
    // O carimbo é renovado para a rotina #4 parar de reenfileirar quando o
    // updatedAt da pessoa mudou por campo que o hardware não usa.
    await context.db.PESEquipamentoMapeamento.updateMany({
      where: { PESCodigo, EQPCodigo: dev.EQPCodigo },
      data: { PEQSyncedAt: new Date() },
    });

    resultados.push({
      EQPCodigo: dev.EQPCodigo,
      ok: true,
      pulado: true,
      idNoEquipamento: mapeamento.PEQIdNoEquipamento,
    });
    console.log(`Equipamento ${dev.EQPCodigo}: sem mudança no payload — pulado`);
    continue;
  }

  try {
    const groupsData = await context.hardware.customCommand(
      dev.EQPCodigo,
      'load_objects',
      { object: 'groups' },
    );
    const gruposEquipamento = groupsData?.groups ?? [];
    console.log(
      `Equipamento ${dev.EQPCodigo}: ${gruposEquipamento.length} grupo(s) cadastrado(s)`,
    );

    // O grupo do departamento é conferido ANTES de mexer em vínculo: se o espelho aponta
    // um grupo que sumiu do equipamento, preservar o vínculo atual é melhor que trocar por
    // um palpite. Cair no grupo padrão seria PIOR que não fazer nada — liberaria a pessoa
    // justamente onde ela deveria estar restrita.
    const grupoSumiu =
      departamento != null &&
      !gruposEquipamento.some((g) => Number(g?.id) === departamento.idDevice);

    const { idNoEquipamento } = await context.hardware.syncPerson(
      dev.EQPCodigo,
      person,
    );

    if (grupoSumiu) {
      const msg =
        `Departamento "${departamento.nome}" (grupo ${departamento.idDevice}) não existe mais ` +
        'no equipamento. Dados da pessoa atualizados; vínculo de grupo preservado como estava. ' +
        'Releia o equipamento na tela de configuração — o espelho está desatualizado.';

      // Sem carimbar o hash: a pessoa volta na fila até espelho e equipamento baterem.
      resultados.push({
        EQPCodigo: dev.EQPCodigo,
        ok: false,
        idNoEquipamento,
        error: msg,
      });
      console.error(`Equipamento ${dev.EQPCodigo}: ${msg}`);
      continue;
    }

    const userIdNoLeitor = Number(idNoEquipamento);
    if (Number.isFinite(userIdNoLeitor)) {
      await context.hardware.setGroups(
        dev.EQPCodigo,
        userIdNoLeitor,
        groupIds,
      );
      console.log(
        `Grupo [${groupIds.join(', ')}]` +
          (departamento ? ` (departamento "${departamento.nome}")` : ' (padrão)') +
          ` vinculado ao usuário ${userIdNoLeitor} no equipamento ${dev.EQPCodigo}`,
      );
    }

    // Sync confirmado: o hash passa a valer como "este payload já está no equipamento".
    // syncPerson garante a linha de mapeamento, então updateMany encontra o registro.
    const carimbo = await context.db.PESEquipamentoMapeamento.updateMany({
      where: { PESCodigo, EQPCodigo: dev.EQPCodigo },
      data: { PEQSyncHash: hashPayload, PEQSyncedAt: new Date() },
    });

    if (!carimbo?.count) {
      console.warn(
        `Equipamento ${dev.EQPCodigo}: mapeamento não encontrado para gravar o hash — ` +
          'a pessoa será reenviada na próxima execução.',
      );
    }

    resultados.push({
      EQPCodigo: dev.EQPCodigo,
      ok: true,
      idNoEquipamento,
      grupos: groupIds,
      departamento: departamento?.nome ?? null,
    });
    console.log(
      `Sincronizado PESCodigo ${PESCodigo} no equipamento ${dev.EQPCodigo} (id no equipamento: ${idNoEquipamento})`,
    );
  } catch (err) {
    const msg = err?.message || String(err);
    resultados.push({
      EQPCodigo: dev.EQPCodigo,
      ok: false,
      error: msg,
    });
    console.error(`Falha no equipamento ${dev.EQPCodigo}:`, msg);
  }
}

const pulados = resultados.filter((r) => r.pulado).length;
const falhas = resultados.filter((r) => !r.ok).length;

return {
  message:
    `Sincronização concluída: ${resultados.length - falhas - pulados} enviada(s), ` +
    `${pulados} pulada(s) por hash, ${falhas} falha(s)`,
  pessoa: { PESCodigo, PESNome, PESIdExternoUsado: idHardware },
  resultados,
};
