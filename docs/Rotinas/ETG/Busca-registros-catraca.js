// Essa é uma rotina do tipo Schedule — sugestão: 0 0 */2 * * *  |  Timeout: 600 s
// Rotina A — catálogo de turmas (working/Controle-turma/README.md §12.2)
//
// Lê as turmas do ERP (Gennera), vincula as matrículas pelo idEnrollment (= MATNumero) e entrega tudo
// ao núcleo via context.turmas.importarCatalogo, que:
//   - cria/atualiza TRMTurma por idClass (TRMIdExterno) — só grava quando algo mudou;
//   - DESATIVA as turmas que não vierem (nunca apaga);
//   - vincula MATMatricula.TRMCodigo e atualiza TRMQtdePessoas;
//   - notifica quando turmas configuradas saem do ERP (virada de ano letivo).
// Nunca altera horário, perfil, escopo nem a ativação da validação — isso é do usuário.
//
// IMPORTANTE: qualquer falha de leitura do ERP deve ABORTAR a rotina. Como turmas ausentes são
// desativadas, entregar um catálogo parcial soltaria os alunos das turmas que faltaram (§15, item 21).
// Por isso não há try/catch por oferta ou por turma.

const erp = await context.db.ERPConfiguracao.findFirst();
if (!erp) {
  console.warn('Nenhuma configuração de ERP encontrada.');
  return { ignorado: 'sem ERP' };
}
if (erp.ERPSistema !== 'Gennera') {
  console.warn(`ERP "${erp.ERPSistema}" não suportado por esta rotina.`);
  return { ignorado: `ERP ${erp.ERPSistema}` };
}

const api = axios.create({
  baseURL: erp.ERPUrlBase,
  timeout: 60000,
  headers: {
    'x-access-token': `${erp.ERPToken}`,
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
    p.then(clean, clean);
    if (executing.size >= limit) await Promise.race(executing);
  }
  await Promise.all(executing); // rejeita se qualquer chamada falhou → aborta a rotina
}

// ── 1. ofertas vigentes ─────────────────────────────────────────────────────
// Não usar startDateAfter=<ano atual>: um calendário iniciado no ano anterior (ex.: semestre
// agosto–janeiro) sumiria em 1º de janeiro e todas as suas turmas seriam desativadas.
const [calendariosRes, ofertasRes] = await Promise.all([
  api.get('/academicCalendars', { params: { status: 'active' } }),
  api.get('/curriculumOffers'),
]);

const idsCalendario = new Set((calendariosRes.data ?? []).map((c) => c.idAcademicCalendar));
const ofertas = (ofertasRes.data ?? []).filter((o) => idsCalendario.has(o.idAcademicCalendar));
console.log(`Calendários ativos: ${idsCalendario.size} | ofertas vigentes: ${ofertas.length}`);

if (!ofertas.length) {
  throw new Error('O ERP não retornou ofertas vigentes — abortando para não desativar o catálogo inteiro.');
}

// ── 2. turmas ───────────────────────────────────────────────────────────────
const turmasPorId = new Map();
await processWithConcurrency(ofertas, 5, async (oferta) => {
  const { data } = await api.get(`/curriculumOffers/${oferta.idCurriculumOffer}/classes`);
  for (const c of data ?? []) {
    if (c?.idClass == null) continue;
    turmasPorId.set(String(c.idClass), {
      idExterno: String(c.idClass),
      idOferta: String(oferta.idCurriculumOffer),
      nome: c.name,
      curso: c.courseName ?? null,
      serie: c.moduleName ?? null,
      curriculo: c.curriculumName ?? null,
      turno: c.shiftName ?? null,
      anoReferencia: c.referenceYear ?? null,
      calendario: c.academicCalendarName ?? null,
      dataInicio: c.classStartDate ?? null,
      dataFim: c.classEndDate ?? null,
    });
  }
});
const turmas = [...turmasPorId.values()];
console.log(`Turmas lidas do ERP: ${turmas.length}`);

// ── 3. alunos por turma (idEnrollment) ──────────────────────────────────────
const matriculasPorTurma = {};
let indice = 0;
await processWithConcurrency(turmas, 5, async (turma) => {
  const { data } = await api.get(`/classes/${turma.idExterno}/students`);
  matriculasPorTurma[turma.idExterno] = (data ?? [])
    .filter((a) => a?.idEnrollment != null && (!a.status || a.status === 'active'))
    .map((a) => String(a.idEnrollment));
  indice++;
  if (indice % 20 === 0) console.log(`Alunos lidos: ${indice} de ${turmas.length} turmas`);
});

// ── 4. entrega ao núcleo ────────────────────────────────────────────────────
const catalogo = await context.turmas.importarCatalogo({ turmas, matriculasPorTurma });
console.info('Catálogo:', JSON.stringify(catalogo));

// Fecha já a janela do aluno novo (§15, item 10): vincula as pessoas às turmas sem esperar a Rotina B.
const vinculo = await context.turmas.vincularPessoas();
console.info('Vínculo de pessoas:', JSON.stringify(vinculo));

return { catalogo, vinculo };
