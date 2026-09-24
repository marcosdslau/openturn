import * as ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import {
  REPORT_COLORS as C,
  appendXlsxNotas,
  buildCsv,
  drawAvatar,
  drawInstituicaoGeradoEm,
  drawPageFooters,
  drawSchoolGuardBrand,
  fitText,
  formatDataHora,
  formatDataUtc,
  formatHora,
  styleXlsxHeaderRow,
  type FotoMap,
} from '../common/export/relatorio-export.utils';

export type RegistroDiarioExportRow = {
  RPDData: Date;
  RPDJanelaIndice: number;
  RPDDataEntrada: Date | null;
  RPDDataSaida: Date | null;
  RPDStatus: string;
  RPDAlteradoEm: Date | null;
  periodo: { PERNome: string } | null;
  pessoa: {
    PESCodigo: number;
    PESNome: string;
    PESNomeSocial: string | null;
    PESDocumento: string | null;
    PESGrupo: string | null;
    matriculas: {
      MATNumero: string;
      MATCurso: string | null;
      MATSerie: string | null;
      MATTurma: string | null;
    }[];
  };
  usuarioCriacao: { USRNome: string } | null;
  usuarioAlteracao: { USRNome: string } | null;
};

export type AglutinacaoResumo = {
  tipo: string;
  autoCompletePeriodo: boolean;
  periodos: {
    PERNome: string;
    PERHorarioInicio: string;
    PERHorarioFim: string;
    PERToleranciaEntradaMinutos: number;
    PERToleranciaSaidaMinutos: number;
  }[];
};

export type RegistroDiarioExportContext = {
  instituicaoNome: string;
  /** Offset em horas da instituição (`INSFusoHorario`), ex.: -3. */
  fusoHorario: number;
  geradoEm: Date;
  filtrosDescricao: string[];
  aglutinacao: AglutinacaoResumo;
};

/** Mesmos textos da seção "Aglutinação de Registros Diários" (webapp/aglutinacao-types.ts). */
const AGLUTINACAO_LABEL: Record<string, string> = {
  entrada_saida: 'Entrada e saída do dia',
  tempo_permanencia: 'Tempo de permanência',
  tempo_permanencia_periodo: 'Tempo de permanência por período',
};

const AGLUTINACAO_DESCRICAO: Record<string, string> = {
  entrada_saida:
    'Registra a menor entrada e a maior saída do dia — um único intervalo por pessoa.',
  tempo_permanencia:
    'Registra cada ciclo entrada→saída como uma janela separada, capturando pausas intermediárias.',
  tempo_permanencia_periodo:
    'Agrupa as passagens dentro de períodos configurados (Manhã, Tarde, Noite…); passagens fora de todos os períodos geram uma janela extra.',
};

const STATUS_LABEL: Record<string, string> = {
  ENVIADO: 'Enviado ao ERP',
  ERRO: 'Erro no envio',
  MANUAL: 'Manual',
  PENDENTE: 'Pendente de envio',
};

const STATUS_LABEL_CURTO: Record<string, string> = {
  ENVIADO: 'Enviado',
  ERRO: 'Erro',
  MANUAL: 'Manual',
  PENDENTE: 'Pendente',
};

const STATUS_COR: Record<string, string> = {
  ENVIADO: C.green,
  ERRO: C.red,
  MANUAL: C.amber,
  PENDENTE: C.muted,
};

export const REGISTRO_DIARIO_EXPORT_HEADERS = [
  'Data',
  'Janela',
  'Período',
  'Pessoa',
  'Documento',
  'Grupo',
  'Matrícula',
  'Curso',
  'Módulo / Série',
  'Turma',
  'Entrada',
  'Saída',
  'Permanência',
  'Status',
  'Origem',
  'Alterado por',
  'Alterado em',
] as const;

export const TEXTO_INTERPRETACAO =
  'Os registros listados neste documento são a interpretação das passagens coletadas nos equipamentos de controle de acesso da instituição, conforme as definições configuradas na seção “Aglutinação de Registros Diários”, para fins de lançamento de frequência no ERP Educacional.';

const nomeExibicao = (r: RegistroDiarioExportRow) =>
  r.pessoa.PESNomeSocial || r.pessoa.PESNome;

/** Duração entre entrada e saída em HH:mm (vazio se faltar um dos lados). */
function permanencia(r: RegistroDiarioExportRow): string {
  if (!r.RPDDataEntrada || !r.RPDDataSaida) return '';
  const min = Math.round(
    (r.RPDDataSaida.getTime() - r.RPDDataEntrada.getTime()) / 60_000,
  );
  if (min < 0) return '';
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

function origem(r: RegistroDiarioExportRow): string {
  return r.usuarioCriacao
    ? `Manual (${r.usuarioCriacao.USRNome})`
    : 'Automático (passagens)';
}

function registroToCells(r: RegistroDiarioExportRow, fuso: number): string[] {
  const mat = r.pessoa.matriculas?.[0];
  return [
    formatDataUtc(r.RPDData),
    String(r.RPDJanelaIndice),
    r.periodo?.PERNome ?? '',
    nomeExibicao(r),
    r.pessoa.PESDocumento ?? '',
    r.pessoa.PESGrupo ?? '',
    mat?.MATNumero ?? '',
    mat?.MATCurso ?? '',
    mat?.MATSerie ?? '',
    mat?.MATTurma ?? '',
    r.RPDDataEntrada ? formatHora(r.RPDDataEntrada, fuso) : '',
    r.RPDDataSaida ? formatHora(r.RPDDataSaida, fuso) : '',
    permanencia(r),
    STATUS_LABEL[r.RPDStatus] ?? r.RPDStatus,
    origem(r),
    r.usuarioAlteracao?.USRNome ?? '',
    r.RPDAlteradoEm ? formatDataHora(r.RPDAlteradoEm, fuso) : '',
  ];
}

function descricaoPeriodo(p: AglutinacaoResumo['periodos'][number]): string {
  return (
    `${p.PERNome}: ${p.PERHorarioInicio}–${p.PERHorarioFim} ` +
    `(tolerância de entrada ${p.PERToleranciaEntradaMinutos} min, de saída ${p.PERToleranciaSaidaMinutos} min)`
  );
}

/** Linhas descritivas da configuração de aglutinação vigente. */
function linhasAglutinacao(a: AglutinacaoResumo): string[] {
  const linhas = [
    `Tipo de aglutinação: ${AGLUTINACAO_LABEL[a.tipo] ?? a.tipo} — ${AGLUTINACAO_DESCRICAO[a.tipo] ?? ''}`.trim(),
  ];
  if (a.tipo === 'tempo_permanencia_periodo') {
    linhas.push(
      a.periodos.length
        ? `Períodos: ${a.periodos.map(descricaoPeriodo).join('; ')}`
        : 'Períodos: nenhum período configurado.',
    );
    linhas.push(
      `Auto completar períodos: ${a.autoCompletePeriodo ? 'Sim' : 'Não'}`,
    );
  }
  return linhas;
}

/** Notas ao fim dos arquivos tabulares (CSV/XLSX). */
function notasTabulares(
  ctx: RegistroDiarioExportContext,
  total: number,
): string[] {
  return [
    `Documento extraído do SchoolGuard — instituição ${ctx.instituicaoNome}.`,
    TEXTO_INTERPRETACAO,
    'Configuração de aglutinação vigente na data de geração:',
    ...linhasAglutinacao(ctx.aglutinacao),
    `Total de registros: ${total}`,
    ...(ctx.filtrosDescricao.length
      ? [`Filtros aplicados: ${ctx.filtrosDescricao.join(' | ')}`]
      : []),
    `Gerado em: ${formatDataHora(ctx.geradoEm, ctx.fusoHorario)}`,
  ];
}

export function buildRegistroDiarioCsvBuffer(
  rows: RegistroDiarioExportRow[],
  ctx: RegistroDiarioExportContext,
): Buffer {
  return buildCsv([
    [...REGISTRO_DIARIO_EXPORT_HEADERS],
    ...rows.map((r) => registroToCells(r, ctx.fusoHorario)),
    [],
    [],
    ...notasTabulares(ctx, rows.length).map((l) => [l]),
  ]);
}

export async function buildRegistroDiarioXlsxBuffer(
  rows: RegistroDiarioExportRow[],
  ctx: RegistroDiarioExportContext,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SchoolGuard';
  wb.created = ctx.geradoEm;
  const ws = wb.addWorksheet('Registros', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  ws.columns = [
    { width: 12 },
    { width: 8 },
    { width: 14 },
    { width: 38 },
    { width: 16 },
    { width: 18 },
    { width: 14 },
    { width: 28 },
    { width: 16 },
    { width: 16 },
    { width: 9 },
    { width: 9 },
    { width: 12 },
    { width: 18 },
    { width: 26 },
    { width: 22 },
    { width: 20 },
  ];

  styleXlsxHeaderRow(ws.addRow([...REGISTRO_DIARIO_EXPORT_HEADERS]));
  for (const r of rows) {
    ws.addRow(registroToCells(r, ctx.fusoHorario));
  }
  if (rows.length > 0) {
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: {
        row: rows.length + 1,
        column: REGISTRO_DIARIO_EXPORT_HEADERS.length,
      },
    };
  }
  appendXlsxNotas(ws, notasTabulares(ctx, rows.length));

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

// ---------------------------------------------------------------- PDF (documento, A4 retrato)

const MARGIN = 32;
const HEADER_H = 58;
const FOOTER_H = 30;
const TABLE_HEAD_H = 18;
const ROW_H = 30;
const AVATAR = 20;

/** Larguras (pt) em A4 retrato; a última coluna ocupa o restante. */
const PDF_COLS: { label: string; width: number }[] = [
  { label: 'Foto', width: 30 },
  { label: 'Pessoa', width: 145 },
  { label: 'Matrícula / Turma', width: 105 },
  { label: 'Data', width: 62 },
  { label: 'Entrada', width: 42 },
  { label: 'Saída', width: 42 },
  { label: 'Perman.', width: 45 },
  { label: 'Status', width: 0 },
];

export const REGISTRO_DIARIO_PDF_FOTO_PX = AVATAR * 3;

export function buildRegistroDiarioPdfBuffer(
  rows: RegistroDiarioExportRow[],
  fotos: FotoMap,
  ctx: RegistroDiarioExportContext,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'portrait',
      margins: {
        top: MARGIN + HEADER_H,
        bottom: MARGIN + FOOTER_H,
        left: MARGIN,
        right: MARGIN,
      },
      bufferPages: true,
      info: {
        Title: 'Relatório de registros diários de presença',
        Author: 'SchoolGuard',
        Subject: `Registros diários — ${ctx.instituicaoNome}`,
      },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageH = doc.page.height;
    const left = MARGIN;
    const right = doc.page.width - MARGIN;
    const usableW = right - left;
    const fixedW = PDF_COLS.reduce((s, c) => s + c.width, 0);
    const cols = PDF_COLS.map((c) => ({
      ...c,
      width: c.width || usableW - fixedW,
    }));
    const geradoEm = formatDataHora(ctx.geradoEm, ctx.fusoHorario);
    const bottomLimit = () => pageH - MARGIN - FOOTER_H;

    const drawHeader = () => {
      const top = MARGIN;
      drawSchoolGuardBrand(doc, left, top, 'Registros diários de presença', 32);
      drawInstituicaoGeradoEm(
        doc,
        right,
        top,
        ctx.instituicaoNome,
        geradoEm,
        240,
      );
      doc
        .moveTo(left, top + HEADER_H - 14)
        .lineTo(right, top + HEADER_H - 14)
        .lineWidth(1)
        .strokeColor(C.brand)
        .stroke();
    };

    /** Bloco "Sobre este documento" (apenas na 1ª página). Retorna o y seguinte. */
    const drawIntro = (y0: number): number => {
      let y = y0;
      doc
        .fillColor(C.text)
        .font('Helvetica-Bold')
        .fontSize(14)
        .text('Relatório de Registros Diários de Presença', left, y, {
          width: usableW,
        });
      y = doc.y + 6;

      doc.font('Helvetica').fontSize(9).fillColor(C.text);
      doc.text(TEXTO_INTERPRETACAO, left, y, {
        width: usableW,
        align: 'justify',
      });
      y = doc.y + 10;

      // Caixa com a configuração de aglutinação vigente.
      const pad = 10;
      const innerW = usableW - pad * 2 - 4;
      const titulo = 'Configuração de aglutinação aplicada';
      const a = ctx.aglutinacao;
      const tipoLabel = AGLUTINACAO_LABEL[a.tipo] ?? a.tipo;
      const tipoDesc = AGLUTINACAO_DESCRICAO[a.tipo] ?? '';
      const periodos =
        a.tipo === 'tempo_permanencia_periodo'
          ? a.periodos.length
            ? a.periodos.map(descricaoPeriodo)
            : ['Nenhum período configurado.']
          : [];
      const nota =
        'Configuração vigente na data de geração deste documento (Configurações da instituição › Aglutinação de Registros Diários). Registros gerados antes de alterações na configuração, ou ajustados manualmente, podem refletir regras anteriores.';

      // Mede a altura antes de desenhar o fundo.
      doc.font('Helvetica-Bold').fontSize(9);
      let h = doc.heightOfString(titulo, { width: innerW }) + 4;
      doc.font('Helvetica-Bold').fontSize(8.5);
      h += doc.heightOfString(`Tipo: ${tipoLabel}`, { width: innerW }) + 2;
      doc.font('Helvetica').fontSize(8.5);
      h += doc.heightOfString(tipoDesc, { width: innerW }) + 4;
      for (const p of periodos)
        h += doc.heightOfString(`• ${p}`, { width: innerW }) + 1;
      if (a.tipo === 'tempo_permanencia_periodo')
        h += doc.heightOfString('Auto', { width: innerW }) + 3;
      doc.font('Helvetica-Oblique').fontSize(7.5);
      h += doc.heightOfString(nota, { width: innerW }) + 2;
      const boxH = h + pad * 2;

      doc.rect(left, y, usableW, boxH).fill('#F4F6FF');
      doc.rect(left, y, 3, boxH).fill(C.brand);

      const tx = left + pad + 4;
      let ty = y + pad;
      doc.fillColor(C.brand).font('Helvetica-Bold').fontSize(9);
      doc.text(titulo, tx, ty, { width: innerW });
      ty = doc.y + 4;
      doc.fillColor(C.text).font('Helvetica-Bold').fontSize(8.5);
      doc.text(`Tipo: ${tipoLabel}`, tx, ty, { width: innerW });
      ty = doc.y + 2;
      doc.font('Helvetica').fontSize(8.5).fillColor(C.text);
      doc.text(tipoDesc, tx, ty, { width: innerW });
      ty = doc.y + 4;
      for (const p of periodos) {
        doc.text(`• ${p}`, tx, ty, { width: innerW });
        ty = doc.y + 1;
      }
      if (a.tipo === 'tempo_permanencia_periodo') {
        doc.text(
          `Auto completar períodos: ${a.autoCompletePeriodo ? 'Sim' : 'Não'}`,
          tx,
          ty,
          {
            width: innerW,
          },
        );
        ty = doc.y + 3;
      }
      doc.font('Helvetica-Oblique').fontSize(7.5).fillColor(C.muted);
      doc.text(nota, tx, ty, { width: innerW });
      y += boxH + 10;

      // Filtros e total.
      doc.font('Helvetica').fontSize(8).fillColor(C.muted);
      const resumo = [
        `Total de registros: ${rows.length}`,
        ctx.filtrosDescricao.length
          ? `Filtros: ${ctx.filtrosDescricao.join('  |  ')}`
          : 'Filtros: nenhum (todos os registros)',
      ];
      for (const linha of resumo) {
        doc.text(linha, left, y, { width: usableW });
        y = doc.y + 2;
      }
      return y + 8;
    };

    const drawTableHead = (y: number): number => {
      doc.rect(left, y, usableW, TABLE_HEAD_H).fill(C.headBg);
      doc.fillColor(C.muted).font('Helvetica-Bold').fontSize(7);
      let x = left;
      for (const c of cols) {
        doc.text(c.label.toUpperCase(), x + 3, y + 6, {
          width: c.width - 6,
          lineBreak: false,
        });
        x += c.width;
      }
      return y + TABLE_HEAD_H;
    };

    /** Célula de duas linhas (principal + secundária em cinza). */
    const cell2 = (
      x: number,
      w: number,
      y: number,
      l1: string,
      l2: string,
      bold = false,
    ) => {
      const inner = w - 6;
      doc
        .font(bold ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(8)
        .fillColor(C.text);
      if (!l2) {
        doc.text(fitText(doc, l1 || '—', inner), x + 3, y + (ROW_H - 8) / 2, {
          width: inner,
          lineBreak: false,
        });
        return;
      }
      doc.text(fitText(doc, l1 || '—', inner), x + 3, y + 6, {
        width: inner,
        lineBreak: false,
      });
      doc.font('Helvetica').fontSize(6.8).fillColor(C.muted);
      doc.text(fitText(doc, l2, inner), x + 3, y + 17, {
        width: inner,
        lineBreak: false,
      });
    };

    const drawRow = (y: number, r: RegistroDiarioExportRow, zebra: boolean) => {
      if (zebra) doc.rect(left, y, usableW, ROW_H).fill(C.zebra);
      const nome = nomeExibicao(r);
      drawAvatar(
        doc,
        left + cols[0].width / 2,
        y + ROW_H / 2,
        AVATAR,
        fotos.get(r.pessoa.PESCodigo),
        nome,
      );

      const mat = r.pessoa.matriculas?.[0];
      const docGrupo = [r.pessoa.PESDocumento, r.pessoa.PESGrupo]
        .filter(Boolean)
        .join(' · ');
      const turmaCurso = mat
        ? [mat.MATTurma, mat.MATCurso].filter(Boolean).join(' · ')
        : '';
      const janela =
        r.periodo?.PERNome ??
        (r.RPDJanelaIndice > 1 ? `Janela ${r.RPDJanelaIndice}` : '');

      let x = left + cols[0].width;
      cell2(x, cols[1].width, y, nome, docGrupo, true);
      x += cols[1].width;
      cell2(x, cols[2].width, y, mat?.MATNumero ?? '—', turmaCurso);
      x += cols[2].width;
      cell2(x, cols[3].width, y, formatDataUtc(r.RPDData), janela);
      x += cols[3].width;
      cell2(
        x,
        cols[4].width,
        y,
        r.RPDDataEntrada ? formatHora(r.RPDDataEntrada, ctx.fusoHorario) : '—',
        '',
      );
      x += cols[4].width;
      cell2(
        x,
        cols[5].width,
        y,
        r.RPDDataSaida ? formatHora(r.RPDDataSaida, ctx.fusoHorario) : '—',
        '',
      );
      x += cols[5].width;
      cell2(x, cols[6].width, y, permanencia(r) || '—', '');
      x += cols[6].width;

      const st = cols[7];
      doc
        .font('Helvetica-Bold')
        .fontSize(7.5)
        .fillColor(STATUS_COR[r.RPDStatus] ?? C.muted);
      const stLabel = STATUS_LABEL_CURTO[r.RPDStatus] ?? r.RPDStatus;
      if (r.usuarioCriacao) {
        doc.text(fitText(doc, stLabel, st.width - 6), x + 3, y + 6, {
          width: st.width - 6,
          lineBreak: false,
        });
        doc.font('Helvetica').fontSize(6.5).fillColor(C.muted);
        doc.text(
          fitText(doc, `por ${r.usuarioCriacao.USRNome}`, st.width - 6),
          x + 3,
          y + 17,
          {
            width: st.width - 6,
            lineBreak: false,
          },
        );
      } else {
        doc.text(
          fitText(doc, stLabel, st.width - 6),
          x + 3,
          y + (ROW_H - 7.5) / 2,
          {
            width: st.width - 6,
            lineBreak: false,
          },
        );
      }

      doc
        .moveTo(left, y + ROW_H)
        .lineTo(right, y + ROW_H)
        .lineWidth(0.4)
        .strokeColor(C.border)
        .stroke();
    };

    drawHeader();
    let y = drawIntro(MARGIN + HEADER_H);
    // Garante espaço para o cabeçalho da tabela + ao menos uma linha na 1ª página.
    if (y + TABLE_HEAD_H + ROW_H > bottomLimit()) {
      doc.addPage();
      drawHeader();
      y = MARGIN + HEADER_H;
    }
    y = drawTableHead(y);

    if (rows.length === 0) {
      doc
        .fillColor(C.muted)
        .font('Helvetica')
        .fontSize(10)
        .text(
          'Nenhum registro encontrado para os filtros informados.',
          left,
          y + 16,
          {
            width: usableW,
            align: 'center',
            lineBreak: false,
          },
        );
    }

    rows.forEach((r, i) => {
      if (y + ROW_H > bottomLimit()) {
        doc.addPage();
        drawHeader();
        y = drawTableHead(MARGIN + HEADER_H);
      }
      drawRow(y, r, i % 2 === 1);
      y += ROW_H;
    });

    drawPageFooters(doc, {
      margin: MARGIN,
      footerH: FOOTER_H,
      texto:
        'Documento extraído do SchoolGuard — interpretação das passagens para lançamento de frequência no ERP Educacional.',
    });

    doc.end();
  });
}
