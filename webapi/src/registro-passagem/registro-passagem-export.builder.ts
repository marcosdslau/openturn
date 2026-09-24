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
  styleXlsxHeaderRow,
  type FotoMap,
} from '../common/export/relatorio-export.utils';

export const PASSAGEM_EXPORT_HEADERS = [
  'Data/Hora',
  'Pessoa',
  'Documento',
  'Grupo',
  'Ação',
  'Equipamento',
  'IP do equipamento',
] as const;

export type PassagemExportRow = {
  REGDataHora: Date;
  REGAcao: string;
  pessoa: {
    PESCodigo: number;
    PESNome: string;
    PESDocumento: string | null;
    PESGrupo: string | null;
  } | null;
  equipamento: {
    EQPDescricao: string | null;
    EQPEnderecoIp: string | null;
  } | null;
};

export type PassagemExportContext = {
  instituicaoNome: string;
  /** Offset em horas da instituição (`INSFusoHorario`), ex.: -3. */
  fusoHorario: number;
  geradoEm: Date;
  /** Descrição legível dos filtros aplicados (vazio = sem filtros). */
  filtrosDescricao: string[];
};

function acaoLabel(acao: string): string {
  return acao === 'ENTRADA' ? 'Entrada' : 'Saída';
}

function passagemToCells(r: PassagemExportRow, fuso: number): string[] {
  return [
    formatDataHora(r.REGDataHora, fuso),
    r.pessoa?.PESNome ?? '',
    r.pessoa?.PESDocumento ?? '',
    r.pessoa?.PESGrupo ?? '',
    acaoLabel(r.REGAcao),
    r.equipamento?.EQPDescricao ?? '',
    r.equipamento?.EQPEnderecoIp ?? '',
  ];
}

/** Linhas de rodapé dos arquivos tabulares (CSV/XLSX). */
function notaProcedencia(ctx: PassagemExportContext, total: number): string[] {
  return [
    `Documento extraído do SchoolGuard com base nas informações coletadas dos equipamentos de controle de acesso da instituição ${ctx.instituicaoNome}.`,
    `Total de passagens: ${total}`,
    ...(ctx.filtrosDescricao.length
      ? [`Filtros aplicados: ${ctx.filtrosDescricao.join(' | ')}`]
      : []),
    `Gerado em: ${formatDataHora(ctx.geradoEm, ctx.fusoHorario)}`,
  ];
}

export function buildPassagemCsvBuffer(
  rows: PassagemExportRow[],
  ctx: PassagemExportContext,
): Buffer {
  return buildCsv([
    [...PASSAGEM_EXPORT_HEADERS],
    ...rows.map((r) => passagemToCells(r, ctx.fusoHorario)),
    [],
    [],
    ...notaProcedencia(ctx, rows.length).map((l) => [l]),
  ]);
}

export async function buildPassagemXlsxBuffer(
  rows: PassagemExportRow[],
  ctx: PassagemExportContext,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SchoolGuard';
  wb.created = ctx.geradoEm;
  const ws = wb.addWorksheet('Passagens', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  ws.columns = [
    { width: 20 },
    { width: 40 },
    { width: 18 },
    { width: 20 },
    { width: 10 },
    { width: 32 },
    { width: 18 },
  ];

  styleXlsxHeaderRow(ws.addRow([...PASSAGEM_EXPORT_HEADERS]));
  for (const r of rows) {
    ws.addRow(passagemToCells(r, ctx.fusoHorario));
  }
  if (rows.length > 0) {
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: rows.length + 1, column: PASSAGEM_EXPORT_HEADERS.length },
    };
  }
  appendXlsxNotas(ws, notaProcedencia(ctx, rows.length));

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

// ---------------------------------------------------------------- PDF

const MARGIN = 28;
const HEADER_H = 92;
const FOOTER_H = 30;
const TABLE_HEAD_H = 18;
const ROW_H = 30;
const AVATAR = 22;

/** Larguras (pt) em A4 paisagem; a última coluna ocupa o restante. */
const PDF_COLS: { label: string; width: number }[] = [
  { label: 'Foto', width: 40 },
  { label: 'Pessoa', width: 160 },
  { label: 'Documento', width: 95 },
  { label: 'Grupo', width: 90 },
  { label: 'Ação', width: 55 },
  { label: 'Equipamento', width: 140 },
  { label: 'IP do equipamento', width: 95 },
  { label: 'Data/Hora', width: 0 },
];

/** Tamanho (px) para redimensionar as fotos antes de embutir no PDF. */
export const PASSAGEM_PDF_FOTO_PX = AVATAR * 3;

export function buildPassagemPdfBuffer(
  rows: PassagemExportRow[],
  fotos: FotoMap,
  ctx: PassagemExportContext,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margins: {
        top: MARGIN + HEADER_H,
        bottom: MARGIN + FOOTER_H,
        left: MARGIN,
        right: MARGIN,
      },
      bufferPages: true,
      info: {
        Title: 'Relatório de passagens',
        Author: 'SchoolGuard',
        Subject: `Passagens — ${ctx.instituicaoNome}`,
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

    const drawHeader = () => {
      const top = MARGIN;
      drawSchoolGuardBrand(doc, left, top, 'Relatório de passagens');
      drawInstituicaoGeradoEm(
        doc,
        right,
        top,
        ctx.instituicaoNome,
        geradoEm,
        320,
      );

      doc
        .fillColor(C.text)
        .font('Helvetica')
        .fontSize(8.5)
        .text(
          'As passagens listadas neste documento correspondem aos registros de cada aluno nos equipamentos de controle de acesso da instituição, conforme coletados pelo SchoolGuard.',
          left,
          top + 44,
          { width: usableW, lineBreak: false },
        );
      if (ctx.filtrosDescricao.length) {
        doc.fillColor(C.muted).fontSize(7.5);
        doc.text(
          fitText(
            doc,
            `Filtros: ${ctx.filtrosDescricao.join('  |  ')}`,
            usableW,
          ),
          left,
          top + 58,
          { width: usableW, lineBreak: false },
        );
      }

      doc
        .moveTo(left, top + HEADER_H - 12)
        .lineTo(right, top + HEADER_H - 12)
        .lineWidth(1)
        .strokeColor(C.brand)
        .stroke();
    };

    const drawTableHead = (y: number): number => {
      doc.rect(left, y, usableW, TABLE_HEAD_H).fill(C.headBg);
      doc.fillColor(C.muted).font('Helvetica-Bold').fontSize(7.5);
      let x = left;
      for (const c of cols) {
        doc.text(c.label.toUpperCase(), x + 4, y + 6, {
          width: c.width - 8,
          lineBreak: false,
        });
        x += c.width;
      }
      return y + TABLE_HEAD_H;
    };

    const drawRow = (y: number, r: PassagemExportRow, zebra: boolean) => {
      if (zebra) doc.rect(left, y, usableW, ROW_H).fill(C.zebra);
      drawAvatar(
        doc,
        left + cols[0].width / 2,
        y + ROW_H / 2,
        AVATAR,
        r.pessoa ? fotos.get(r.pessoa.PESCodigo) : undefined,
        r.pessoa?.PESNome,
      );

      const cells = passagemToCells(r, ctx.fusoHorario);
      // cells: [dataHora, pessoa, documento, grupo, ação, equipamento, ip];
      // no PDF a data/hora vai para a última coluna.
      const ordered = [...cells.slice(1), cells[0]];
      let x = left + cols[0].width;
      for (let i = 0; i < ordered.length; i++) {
        const c = cols[i + 1];
        const isAcao = i === 3;
        doc
          .font(isAcao || i === 0 ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(8.5)
          .fillColor(
            isAcao ? (r.REGAcao === 'ENTRADA' ? C.green : C.red) : C.text,
          );
        const txt = ordered[i] || '—';
        doc.text(fitText(doc, txt, c.width - 8), x + 4, y + (ROW_H - 8.5) / 2, {
          width: c.width - 8,
          lineBreak: false,
        });
        x += c.width;
      }
      doc
        .moveTo(left, y + ROW_H)
        .lineTo(right, y + ROW_H)
        .lineWidth(0.4)
        .strokeColor(C.border)
        .stroke();
    };

    const bottomLimit = () => pageH - MARGIN - FOOTER_H;

    drawHeader();
    let y = drawTableHead(MARGIN + HEADER_H);

    if (rows.length === 0) {
      doc
        .fillColor(C.muted)
        .font('Helvetica')
        .fontSize(10)
        .text(
          'Nenhuma passagem encontrada para os filtros informados.',
          left,
          y + 16,
          {
            width: usableW,
            align: 'center',
            lineBreak: false,
          },
        );
      y += 40;
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

    // Total ao fim da lista.
    if (y + 24 > bottomLimit()) {
      doc.addPage();
      drawHeader();
      y = MARGIN + HEADER_H;
    }
    doc
      .fillColor(C.text)
      .font('Helvetica-Bold')
      .fontSize(9)
      .text(`Total de passagens: ${rows.length}`, left, y + 12, {
        width: usableW,
        align: 'right',
        lineBreak: false,
      });

    drawPageFooters(doc, {
      margin: MARGIN,
      footerH: FOOTER_H,
      texto:
        'Documento extraído do SchoolGuard com base nas informações coletadas dos equipamentos de controle de acesso da instituição.',
    });

    doc.end();
  });
}
