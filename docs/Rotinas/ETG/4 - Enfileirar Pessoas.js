// Essa é uma rotina do tipo Schedule
// Enfileira cada pessoa no webhook #5 (path /pessoa-equipamento).
// Alinhe WEBHOOK_TOKEN com o ROTWebhookToken configurado na rotina #5.
//
// Ordem de enfileiramento (obrigatória): 1) inativas com mapeamento (remoção),
// 2) ativas com foto que estejam pendentes em algum equipamento. As duas fases
// são sequenciais — a concorrência de 5 vale DENTRO de cada fase.
//
// Pendência por par (pessoa, equipamento): não existe mapeamento, nunca houve
// sync confirmado (PEQSyncedAt nulo) ou a pessoa mudou depois do último sync.
// O filtro fino (hash do payload) é da rotina #5, que já carrega a foto.
//
// Para reenviar tudo ignorando o estado: executar com { forcarTodos: true }.

async function run() {
  const instituicaoId = context.instituicaoCodigo;
  console.log('Instituição:', instituicaoId);

  const WEBHOOK_PATH = '/pessoa-equipamento';
  const WEBHOOK_TOKEN = 'a7f3c2e1-9b4d-4a8f-b6e0-1d2c3e4f5a6b';

  const queueAPIEquipamento = axios.create({
    baseURL: `https://admin.schoolguard.com.br/api/instituicoes/${instituicaoId}/webhooks`,
    timeout: 60000,
    headers: {
      'x-webhook-token': WEBHOOK_TOKEN,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  });

  async function processWithConcurrency(items, limit, handler) {
    const executing = new Set();

    for (const item of items) {
      const p = Promise.resolve().then(() => handler(item));
      executing.add(p);

      const clean = () => executing.delete(p);
      p.then(clean).catch(clean);

      if (executing.size >= limit) {
        await Promise.race(executing);
      }
    }

    await Promise.all(executing);
  }

  function normGrupoNome(valor) {
    return String(valor).trim().toLowerCase();
  }

  const GRUPOS_PADRAO = ['Funcionário', 'Professor', 'Student'];

  function grupoEhPadrao(nomeGrupo) {
    const label = normGrupoNome(nomeGrupo);
    return GRUPOS_PADRAO.some((nome) => normGrupoNome(nome) === label);
  }

  function filtrarGruposPadrao(nomesDistintos) {
    return nomesDistintos.filter(grupoEhPadrao).sort();
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

  function encontrarHorarioNoEquipamento(timeZones, nomeHorario) {
    const label = (nomeHorario ?? '').trim();
    if (!label) return null;

    return (
      (timeZones ?? []).find((tz) => {
        if (tz?.name != null && normGrupoNome(tz.name) === normGrupoNome(label)) {
          return true;
        }
        if (tz?.id != null && String(tz.id) === label) {
          return true;
        }
        return false;
      }) ?? null
    );
  }

  async function carregarHorariosVinculadosAoGrupo(eqpcodigo, groupId) {
    const mapRes = await context.hardware.customCommand(eqpcodigo, 'load_objects', {
      object: 'time_zones',
      join: 'LEFT',
      where: [{
        object: 'groups',
        field: 'id',
        value: groupId,
        connector: ') AND (',
      }],
      limit: 1000,
    });

    return mapRes?.time_zones ?? [];
  }

  async function carregarAccessRuleDoGrupo(eqpcodigo, groupId) {
    const arRes = await context.hardware.customCommand(eqpcodigo, 'load_objects', {
      object: 'access_rules',
      join: 'LEFT',
      where: [{
        object: 'groups',
        field: 'id',
        value: groupId,
        connector: ') AND (',
      }],
    });

    const rules = arRes?.access_rules ?? [];
    return rules.length > 0 ? rules[0] : null;
  }

  async function vincularHorarioAoDepartamento(eqpcodigo, groupId, timeZoneId) {
    const horariosVinculados = await carregarHorariosVinculadosAoGrupo(eqpcodigo, groupId);
    if (horariosVinculados.some((tz) => Number(tz.id) === Number(timeZoneId))) {
      return 'existente';
    }

    let accessRuleId = (await carregarAccessRuleDoGrupo(eqpcodigo, groupId))?.id ?? null;

    if (!accessRuleId) {
      const newRuleRes = await context.hardware.customCommand(eqpcodigo, 'create_objects', {
        object: 'access_rules',
        values: [{
          name: `(access_rules automatically created for groups ${groupId})`,
          type: 1,
          priority: 0,
        }],
      });

      accessRuleId = newRuleRes?.ids?.[0] ?? null;
      if (!accessRuleId) {
        throw new Error(`Falha ao criar access_rule para grupo ${groupId}`);
      }

      const portalRes = await context.hardware.customCommand(eqpcodigo, 'load_objects', {
        object: 'portals',
        limit: 1000,
      });

      for (const portal of portalRes?.portals ?? []) {
        try {
          await context.hardware.customCommand(eqpcodigo, 'create_objects', {
            object: 'portal_access_rules',
            values: [{ portal_id: portal.id, access_rule_id: accessRuleId }],
          });
        } catch (_) {
          // vínculo portal ↔ regra pode já existir
        }
      }

      try {
        await context.hardware.customCommand(eqpcodigo, 'create_objects', {
          object: 'group_access_rules',
          values: [{ group_id: groupId, access_rule_id: accessRuleId }],
        });
      } catch (_) {
        // vínculo grupo ↔ regra pode já existir
      }
    }

    await context.hardware.customCommand(eqpcodigo, 'create_objects', {
      object: 'access_rule_time_zones',
      values: [{ access_rule_id: accessRuleId, time_zone_id: timeZoneId }],
    });

    return 'vinculado';
  }

  async function obterGruposPadraoDistintosPessoa() {
    const rows = await context.db.PESPessoa.findMany({
      where: {
        PESAtivo: true,
        PESGrupo: { not: null },
        NOT: { PESGrupo: '' },
      },
      distinct: ['PESGrupo'],
      select: { PESGrupo: true },
    });

    const distintos = rows
      .map((r) => (r.PESGrupo || '').trim())
      .filter(Boolean);

    const gruposPadrao = filtrarGruposPadrao(distintos);
    const ignorados = distintos.filter((nome) => !grupoEhPadrao(nome));

    if (ignorados.length) {
      console.info(
        `Grupo(s) personalizado(s) ignorado(s) nesta rotina: ${ignorados.sort().join(', ')}`,
      );
    }

    return gruposPadrao;
  }

  async function sincronizarGruposNosEquipamentos(equipamentos, nomesGrupos) {
    const HORARIO_PADRAO_NOME = 'Sempre Liberado';
    const resumoGrupos = {
      criados: 0,
      existentes: 0,
      erros: 0,
      horariosVinculados: 0,
      horariosExistentes: 0,
      horariosErros: 0,
    };

    if (!nomesGrupos.length) {
      console.info('Nenhum grupo padrão (Funcionário/Professor/Student) encontrado para sincronizar nos equipamentos.');
      return resumoGrupos;
    }

    console.info(
      `Sincronizando ${nomesGrupos.length} grupo(s) padrão nos equipamentos: ${nomesGrupos.join(', ')}`,
    );

    for (const dev of equipamentos) {
      try {
        const groupsData = await context.hardware.customCommand(
          dev.EQPCodigo,
          'load_objects',
          { object: 'groups' },
        );

        console.info(`Carregando grupos no equipamento ${dev.EQPCodigo}`);
        console.log(JSON.stringify(groupsData));
        let gruposEquipamento = [...(groupsData?.groups ?? [])];

        let horarioPadrao = null;
        const tzData = await context.hardware.customCommand(
          dev.EQPCodigo,
          'load_objects',
          { object: 'time_zones' },
        );
        horarioPadrao = encontrarHorarioNoEquipamento(
          tzData?.time_zones ?? [],
          HORARIO_PADRAO_NOME,
        );

        if (!horarioPadrao?.id) {
          console.warn(
            `Horário "${HORARIO_PADRAO_NOME}" não encontrado no equipamento ${dev.EQPCodigo} — vínculo de horários será ignorado`,
          );
        }

        for (const nomeGrupo of nomesGrupos) {
          let grupo = encontrarGrupoNoEquipamento(gruposEquipamento, nomeGrupo);

          if (grupo) {
            resumoGrupos.existentes++;
            console.log(
              `Grupo "${nomeGrupo}" já cadastrado no equipamento ${dev.EQPCodigo}`,
            );
          } else {
            await context.hardware.customCommand(dev.EQPCodigo, 'create_objects', {
              object: 'groups',
              values: [{ name: nomeGrupo }],
            });

            const groupsReload = await context.hardware.customCommand(
              dev.EQPCodigo,
              'load_objects',
              { object: 'groups' },
            );
            gruposEquipamento = [...(groupsReload?.groups ?? [])];
            grupo = encontrarGrupoNoEquipamento(gruposEquipamento, nomeGrupo);

            if (!grupo?.id) {
              throw new Error(
                `Grupo "${nomeGrupo}" criado, mas id não encontrado no equipamento ${dev.EQPCodigo}`,
              );
            }

            resumoGrupos.criados++;
            console.log(
              `Grupo "${nomeGrupo}" criado no equipamento ${dev.EQPCodigo} (id: ${grupo.id})`,
            );
          }

          if (!horarioPadrao?.id || !grupo?.id) continue;

          try {
            const resultadoHorario = await vincularHorarioAoDepartamento(
              dev.EQPCodigo,
              grupo.id,
              horarioPadrao.id,
            );

            if (resultadoHorario === 'existente') {
              resumoGrupos.horariosExistentes++;
              console.log(
                `Horário "${HORARIO_PADRAO_NOME}" já vinculado ao grupo "${nomeGrupo}" (EQP ${dev.EQPCodigo})`,
              );
            } else {
              resumoGrupos.horariosVinculados++;
              console.log(
                `Horário "${HORARIO_PADRAO_NOME}" vinculado ao grupo "${nomeGrupo}" (EQP ${dev.EQPCodigo})`,
              );
            }
          } catch (error) {
            resumoGrupos.horariosErros++;
            console.error(
              `Erro ao vincular horário "${HORARIO_PADRAO_NOME}" ao grupo "${nomeGrupo}" (EQP ${dev.EQPCodigo}):`,
              error?.message,
            );
          }
        }
      } catch (error) {
        resumoGrupos.erros++;
        console.error(
          `Erro ao sincronizar grupos no equipamento ${dev.EQPCodigo}:`,
          error?.message,
        );
      }
    }

    return resumoGrupos;
  }

  const equipamentosAtivos = await context.db.EQPEquipamento.findMany({
    where: { EQPAtivo: true },
    select: { EQPCodigo: true },
  });

  if (!equipamentosAtivos.length) {
    console.warn('Nenhum equipamento ativo — nada a enfileirar.');
    return { enfileirados: 0, erros: 0, total: 0 };
  }

  console.log(`Equipamentos ativos: ${equipamentosAtivos.length}`);

  const nomesGrupos = await obterGruposPadraoDistintosPessoa();
  const statsGrupos = await sincronizarGruposNosEquipamentos(
    equipamentosAtivos,
    nomesGrupos,
  );

  console.info(
    `Grupos nos equipamentos — criados: ${statsGrupos.criados}, ` +
      `já existentes: ${statsGrupos.existentes}, erros: ${statsGrupos.erros}; ` +
      `horários vinculados: ${statsGrupos.horariosVinculados}, ` +
      `horários já existentes: ${statsGrupos.horariosExistentes}, ` +
      `erros horário: ${statsGrupos.horariosErros}`,
  );

  const forcarTodos =
    context.request?.forcarTodos === true ||
    context.request?.body?.forcarTodos === true;

  if (forcarTodos) {
    console.warn('forcarTodos ativo — todos os equipamentos serão reenviados, ignorando hash/carimbo.');
  }

  const eqpCodigos = equipamentosAtivos.map((e) => e.EQPCodigo);

  // Uma única leitura do de-para para todos os equipamentos ativos.
  // Índice: PESCodigo -> Map(EQPCodigo -> instante do último sync confirmado, em ms).
  const mapeamentos = await context.db.PESEquipamentoMapeamento.findMany({
    where: { EQPCodigo: { in: eqpCodigos } },
    select: { PESCodigo: true, EQPCodigo: true, PEQSyncedAt: true },
  });

  const syncPorPessoa = new Map();
  for (const m of mapeamentos) {
    if (!syncPorPessoa.has(m.PESCodigo)) {
      syncPorPessoa.set(m.PESCodigo, new Map());
    }
    // A serialização do IPC entrega DateTime como string ISO.
    const syncedAt = m.PEQSyncedAt ? new Date(m.PEQSyncedAt).getTime() : null;
    syncPorPessoa.get(m.PESCodigo).set(m.EQPCodigo, syncedAt);
  }

  console.log(
    `Mapeamentos carregados: ${mapeamentos.length} em ${eqpCodigos.length} equipamento(s)`,
  );

  const filaStats = {
    enfileirados: 0,
    erros: 0,
    total: 0,
    remocoes: 0,
    sincronizacoes: 0,
    pulados: 0,
  };

  async function enfileirar(pessoa, acao, codigosEquipamento, indice, totalFase) {
    console.info(
      `[${acao}] ${indice} de ${totalFase}: ${pessoa.PESNome} (${pessoa.PESCodigo}) ` +
        `— EQP ${codigosEquipamento.join(', ')}`,
    );

    const payload = {
      PESCodigo: pessoa.PESCodigo,
      PESNome: pessoa.PESNome,
      PESIdExterno: pessoa.PESIdExterno ?? undefined,
      acao,
      EQPCodigos: codigosEquipamento,
      forcar: forcarTodos || undefined,
    };

    try {
      await queueAPIEquipamento.post(WEBHOOK_PATH, payload);
      filaStats.enfileirados++;
      if (acao === 'REMOVE') filaStats.remocoes++;
      else filaStats.sincronizacoes++;
    } catch (error) {
      filaStats.erros++;
      console.error(
        `Erro ao enfileirar PESCodigo ${pessoa.PESCodigo} (${acao}):`,
        error?.response?.status,
        error?.message,
      );
    }
  }

  // ── Fase 1: remoções ──────────────────────────────────────────────────────
  // Inativa que ainda tem mapeamento em algum equipamento ativo continua no
  // hardware. Sai da fila só quando a remoção é confirmada pela rotina #5.
  let pessoasInativasComMapeamento = [];
  try {
    pessoasInativasComMapeamento = await context.db.PESPessoa.findMany({
      where: {
        PESAtivo: false,
        mapeamentos: { some: { EQPCodigo: { in: eqpCodigos } } },
      },
      select: {
        PESCodigo: true,
        PESNome: true,
        PESIdExterno: true,
      },
      orderBy: { PESNome: 'asc' },
    });
  } catch (error) {
    console.error(
      'Falha ao listar pessoas inativas com mapeamento; a fase de remoção será pulada:',
      error?.message,
    );
  }

  console.log(`Fase 1 — remoções: ${pessoasInativasComMapeamento.length} pessoa(s)`);
  filaStats.total += pessoasInativasComMapeamento.length;

  let indiceRemocao = 0;
  await processWithConcurrency(pessoasInativasComMapeamento, 5, async (pessoa) => {
    indiceRemocao += 1;
    const alvos = Array.from(
      (syncPorPessoa.get(pessoa.PESCodigo) ?? new Map()).keys(),
    );
    if (!alvos.length) return;

    await enfileirar(
      pessoa,
      'REMOVE',
      alvos,
      indiceRemocao,
      pessoasInativasComMapeamento.length,
    );
  });

  // ── Fase 2: inclusões/atualizações ────────────────────────────────────────
  // Só começa depois que TODAS as remoções foram enfileiradas.
  const pessoasAtivas = await context.db.PESPessoa.findMany({
    where: {
      PESFotoBase64: {
        not: null, // Equivale a 'WHERE PESFotoBase64 IS NOT NULL'
      },
      // Linhas antigas gravadas com string vazia pela rotina 1 antes da correção:
      // enfileirá-las manda faces: [] à rotina 5, que apaga a face no equipamento.
      NOT: { PESFotoBase64: '' },
      PESAtivo: true
    },
    select: {
      PESCodigo: true,
      PESNome: true,
      PESIdExterno: true,
      updatedAt: true,
    },
    orderBy: { PESNome: 'asc' },
  });

  /** Equipamentos em que a pessoa pode estar desatualizada. */
  function equipamentosPendentes(pessoa) {
    if (forcarTodos) return eqpCodigos;

    const porEquipamento = syncPorPessoa.get(pessoa.PESCodigo);
    const alteradaEm = pessoa.updatedAt
      ? new Date(pessoa.updatedAt).getTime()
      : Number.MAX_SAFE_INTEGER;

    return eqpCodigos.filter((codigo) => {
      if (!porEquipamento || !porEquipamento.has(codigo)) return true; // nunca esteve neste EQP
      const syncedAt = porEquipamento.get(codigo);
      if (syncedAt == null) return true; // mapeamento sem sync confirmado
      return alteradaEm > syncedAt; // pessoa mudou depois do último sync
    });
  }

  const aSincronizar = [];
  for (const pessoa of pessoasAtivas) {
    const pendentes = equipamentosPendentes(pessoa);
    if (pendentes.length) {
      aSincronizar.push({ pessoa, pendentes });
    } else {
      filaStats.pulados++;
    }
  }

  console.log(
    `Fase 2 — sincronizações: ${aSincronizar.length} de ${pessoasAtivas.length} ativa(s) ` +
      `(${filaStats.pulados} já em dia em todos os equipamentos)`,
  );
  filaStats.total += aSincronizar.length;

  let indiceSync = 0;
  await processWithConcurrency(aSincronizar, 5, async ({ pessoa, pendentes }) => {
    indiceSync += 1;
    await enfileirar(pessoa, 'SYNC', pendentes, indiceSync, aSincronizar.length);
  });

  console.info(
    `Concluído: ${filaStats.enfileirados} enfileirado(s) ` +
      `(${filaStats.remocoes} remoção/ões, ${filaStats.sincronizacoes} sincronização/ões), ` +
      `${filaStats.pulados} pulado(s), ${filaStats.erros} erro(s), ${filaStats.total} total`,
  );

  return { ...filaStats, grupos: statsGrupos };
}

return await run();
