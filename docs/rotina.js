/**
 * Rotina WEBHOOK: recebe { PESCodigo, PESNome } e, opcionalmente, PESIdExterno no body
 * (senão usa PESPessoa.PESIdExterno no sync). Se a pessoa existir no banco e estiver inativa,
 * remove nos equipamentos via deletePersonAcrossInstitution. Se estiver ativa (ou não houver
 * registro no banco), replica syncPerson em todos os equipamentos ativos.
 */
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

console.log('Dados recebidos (webhook):', { PESCodigo, PESNome });

// Opcional: enriquecer com o cadastro no banco (foto, tag, CPF, grupo, templates), alinhado ao sync da webapi
let pessoa = null;
try {
  pessoa = await context.db.PESPessoa.findFirst({
    where: { PESCodigo },
  });
} catch (e) {
  console.warn('Aviso: não foi possível carregar PESPessoa; segue só com nome do body', e);
}

/** Pessoa cadastrada mas inativa: apenas limpar dos equipamentos + mappings, sem sync. */
if (pessoa && pessoa.PESAtivo === false) {
  const result = await context.hardware.deletePersonAcrossInstitution(pessoa.PESCodigo);
  console.log('Pessoa inativa — exclusão institucional:', result);
  return {
    message: 'Pessoa inativa: remoção nos equipamentos e mapeamentos concluída',
    pessoa: { PESCodigo, PESNome, PESAtivo: false },
    exclusao: result,
  };
}

let fingers = [];
if (pessoa?.PESTemplates) {
  const t = pessoa.PESTemplates;
  if (Array.isArray(t)) {
    fingers = t.map((x) => String(x));
  }
}

/**
 * `person.pescodigo` = PESCodigo (chave em PESEquipamentoMapeamento).
 * `person.id` = id do usuário no leitor (PESIdExterno numérico, ou PESCodigo se ausente).
 */
function idNoEquipamentoLeitor(pesIdExternoBruto) {
  if (pesIdExternoBruto == null || String(pesIdExternoBruto).trim() === '') {
    throw new Error(`PESIdExterno inválido; usando PESCodigo como id no leitor: ${pesIdExternoBruto}`);
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
  });
  throw new Error(`PESIdExterno inválido; usando PESCodigo como id no leitor: ${pesIdExternoBruto}`);
}

const idHardware = idNoEquipamentoLeitor(
  body.PESIdExterno ?? pessoa?.PESIdExterno
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

const equipamentos = await context.db.EQPEquipamento.findMany({
  where: { EQPAtivo: true },
});

if (!equipamentos.length) {
  console.warn('Nenhum equipamento ativo para sincronizar.');
  return {
    message: 'Nenhum equipamento ativo',
    pessoa: { PESCodigo, PESNome },
    resultados: [],
  };
}

const resultados = [];
for (const dev of equipamentos) {
  try {
    const { idNoEquipamento } = await context.hardware.syncPerson(
      dev.EQPCodigo,
      person,
    );
    resultados.push({
      EQPCodigo: dev.EQPCodigo,
      ok: true,
      idNoEquipamento,
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

return {
  message: 'Sincronização concluída (ver resultados por equipamento)',
  pessoa: { PESCodigo, PESNome, PESIdExternoUsado: idHardware },
  resultados,
};
