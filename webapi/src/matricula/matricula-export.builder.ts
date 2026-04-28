import * as ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import type { PESPessoa } from '@prisma/client';

export const MATRICULA_EXPORT_HEADERS = [
  'Código Pessoa',
  'Código no Educacional',
  'Nome',
  'Matrícula',
  'Curso',
  'Série',
  'Turma',
  'Status',
] as const;

export const MATRICULA_EXPORT_HEADERS_PDF = [
  'Foto',
  ...MATRICULA_EXPORT_HEADERS,
] as const;

/** A4 em pt (PDFKit default). */
const PDF_PT_A4 = { portraitW: 595.28, portraitH: 841.89 };
const PDF_MARGIN_PT = 28;
const PDF_TITLE_RESERVED_PT = 50;
const PDF_HEADER_ROW_H = 14;
const PDF_ROW_GAP = 2;
const PDF_DIVIDER = '#6d6d6e';
/** Espaço entre duas faixas de tabela lado a lado */
const PDF_STRIP_GUTTER = 10;
const TEXT_COLS_COUNT = MATRICULA_EXPORT_HEADERS.length;

export type MatriculaPdfLayoutOptions = {
  orientation: 'portrait' | 'landscape';
  columns: 1 | 2;
  rowsPerColumn: number;
};

function pagePts(orientation: 'portrait' | 'landscape') {
  if (orientation === 'landscape') {
    return { width: PDF_PT_A4.portraitH, height: PDF_PT_A4.portraitW };
  }
  return { width: PDF_PT_A4.portraitW, height: PDF_PT_A4.portraitH };
}

/**
 * Calcula foto (pixels inteiros) e altura da linha a partir apenas do layout solicitado —
 * deve coincidir com a geometria usada ao desenhar o PDF para o mesmo layout.
 */
export function computeMatriculaPdfPhotoPxForResize(
  layout: MatriculaPdfLayoutOptions,
): number {
  const g = computeStripGeometry(layout);
  return Math.max(16, Math.min(g.fotoPx, 120));
}

type StripGeometry = {
  fotoPx: number;
  dataRowH: number;
  stripW: number;
  fotoColW: number;
  textColW: number;
  footerReserve: number;
};

function computeStripGeometry(layout: MatriculaPdfLayoutOptions): StripGeometry {
  const { orientation, columns, rowsPerColumn } = layout;
  const { width: pw, height: ph } = pagePts(orientation);
  const usableW = pw - 2 * PDF_MARGIN_PT;
  const usableH = ph - 2 * PDF_MARGIN_PT;
  const gutter = columns === 2 ? PDF_STRIP_GUTTER : 0;
  const stripW = Math.max(
    120,
    (usableW - gutter * (columns - 1)) / columns - 4,
  );
  /** Primeira página: há título; páginas seguintes: apenas cabeçalho de tabela. */
  const headerBlock =
    PDF_HEADER_ROW_H +
    PDF_ROW_GAP +
    4 +
    PDF_ROW_GAP +
    2 +
    PDF_ROW_GAP;
  const contentHFirstPage = Math.max(
    160,
    usableH - PDF_TITLE_RESERVED_PT - headerBlock - 16,
  );
  const contentHLaterPage = Math.max(contentHFirstPage + 48, usableH - headerBlock - 16);
  const tightContentH = Math.min(contentHFirstPage, contentHLaterPage);
  let rowStride = Math.floor(
    (tightContentH -
      PDF_ROW_GAP * Math.max(0, rowsPerColumn - 1)) /
      rowsPerColumn,
  );
  rowStride = Math.max(18, Math.min(rowStride, 240));
  const dataRowH = rowStride;
  let fotoColW = Math.max(26, stripW * 0.16);
  fotoColW = Math.min(stripW * 0.24, fotoColW);
  const textRemain = stripW - fotoColW;
  const textColW = TEXT_COLS_COUNT > 0 ? textRemain / TEXT_COLS_COUNT : 28;
  let fotoPx = Math.floor(
    Math.min(dataRowH - PDF_ROW_GAP * 2, fotoColW - 6),
  );
  fotoPx = Math.max(16, Math.min(fotoPx, 160));
  return {
    fotoPx,
    dataRowH,
    stripW,
    fotoColW,
    textColW,
    footerReserve: 16,
  };
}

function decodePdfImageBuffer(base64: string | null | undefined): Buffer | null {
  if (!base64?.trim()) return null;
  try {
    return Buffer.from(base64, 'base64');
  } catch {
    return null;
  }
}

export type MatriculaExportRow = {
  MATNumero: string;
  MATCurso: string | null;
  MATSerie: string | null;
  MATTurma: string | null;
  MATAtivo: boolean;
  pessoa: Pick<PESPessoa, 'PESCodigo' | 'PESIdExterno' | 'PESNome'>;
};

/** Linha com foto para export PDF (`PESFotoBase64` já redimensionada ao `fotoPx` do layout). */
export type MatriculaPdfExportRow = MatriculaExportRow & {
  pessoa: MatriculaExportRow['pessoa'] & {
    PESFotoBase64?: string | null;
    PESFotoExtensao?: string | null;
  };
};

export function matriculaToExportCells(m: MatriculaExportRow): (string | number)[] {
  const p = m.pessoa;
  return [
    p.PESCodigo,
    p.PESIdExterno ?? '',
    p.PESNome,
    m.MATNumero,
    m.MATCurso ?? '',
    m.MATSerie ?? '',
    m.MATTurma ?? '',
    m.MATAtivo ? 'Ativa' : 'Inativa',
  ];
}

function escapeCsvCell(value: unknown): string {
  const s = String(value ?? '');
  if (/[;"\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function buildCsvBuffer(rows: MatriculaExportRow[]): Buffer {
  const lines = [
    [...MATRICULA_EXPORT_HEADERS],
    ...rows.map((r) => matriculaToExportCells(r).map((c) => String(c))),
  ].map((line) => line.map(escapeCsvCell).join(';'));
  return Buffer.from(`\ufeff${lines.join('\r\n')}`, 'utf8');
}

export async function buildXlsxBuffer(rows: MatriculaExportRow[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Matrículas');
  ws.addRow([...MATRICULA_EXPORT_HEADERS]);
  for (const m of rows) {
    ws.addRow(matriculaToExportCells(m));
  }
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

/** Gera PDF com faixas (1 ou 2 colunas lado a lado, preenchimento sequencial por faixa). */
export function buildPdfBuffer(
  rows: MatriculaPdfExportRow[],
  layout: MatriculaPdfLayoutOptions,
): Promise<Buffer> {
  const g = computeStripGeometry(layout);
  const { orientation, columns, rowsPerColumn } = layout;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      layout: orientation,
      margin: PDF_MARGIN_PT,
      size: 'A4',
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const ml = PDF_MARGIN_PT;
    const fotoColW = g.fotoColW;
    const textColW = g.textColW;
    const stripW = g.stripW;
    const dataRowFull = g.dataRowH + PDF_ROW_GAP;
    const fotoPt = g.fotoPx;
    const headerBlockH = PDF_HEADER_ROW_H;

    const getBottom = () =>
      doc.page.height - doc.page.margins.bottom - g.footerReserve;

    const drawDividerSingle = (yLine: number, x0: number, x1: number) => {
      doc.save();
      doc.strokeColor(PDF_DIVIDER).lineWidth(0.4);
      doc.moveTo(x0, yLine).lineTo(x1, yLine).stroke();
      doc.restore();
    };

    const paintStripHeaders = (headerTop: number, stripLeft: number) => {
      doc.font('Helvetica-Bold').fontSize(6.5);
      let xh = stripLeft;
      for (let hi = 0; hi < MATRICULA_EXPORT_HEADERS_PDF.length; hi++) {
        const cw = hi === 0 ? fotoColW : textColW;
        const label = MATRICULA_EXPORT_HEADERS_PDF[hi];
        const textW = cw - 4;
        const hStr = Math.min(
          doc.heightOfString(label, { width: textW }),
          headerBlockH,
        );
        const ty = headerTop + (headerBlockH - hStr) / 2;
        doc.text(label, xh + 2, ty, {
          width: textW,
          height: headerBlockH + 2,
          ellipsis: true,
        });
        xh += cw;
      }
      const lineY = headerTop + headerBlockH;
      drawDividerSingle(lineY, stripLeft, stripLeft + stripW);
    };

    const drawTitle = () => {
      doc.fontSize(11).font('Helvetica-Bold').text('Matrículas', {
        align: 'center',
      });
      doc.moveDown(0.55);
    };

    const paintAllStripHeaders = (yHeader: number): number => {
      if (columns === 1) {
        paintStripHeaders(yHeader, ml);
      } else {
        paintStripHeaders(yHeader, ml);
        paintStripHeaders(yHeader, ml + stripW + PDF_STRIP_GUTTER);
      }
      return yHeader + headerBlockH + PDF_ROW_GAP;
    };

    /** Página nova com cabeçalhos; primeira vez inclui título. */
    let firstPage = true;
    const openPageWithHeaders = (): number => {
      if (firstPage) {
        firstPage = false;
        drawTitle();
        return paintAllStripHeaders(doc.y);
      }
      doc.addPage();
      return paintAllStripHeaders(doc.page.margins.top);
    };

    let dataTopY = openPageWithHeaders();

    const drawOneRow = (
      stripLeft: number,
      rowTop: number,
      m: MatriculaPdfExportRow,
    ) => {
      const rowH = g.dataRowH;
      let x = stripLeft;
      const imgBuf = decodePdfImageBuffer(m.pessoa.PESFotoBase64);
      if (imgBuf) {
        try {
          const imgX =
            x + Math.max(0, (fotoColW - fotoPt) / 2);
          const imgY = rowTop + (rowH - fotoPt) / 2;
          doc.image(imgBuf, imgX, imgY, { width: fotoPt, height: fotoPt });
        } catch {
          doc.font('Helvetica').fontSize(8);
          const dashH = doc.currentLineHeight(true);
          doc.text('—', x + 2, rowTop + (rowH - dashH) / 2, {
            width: fotoColW - 4,
            align: 'center',
          });
        }
      } else {
        doc.font('Helvetica').fontSize(8);
        const dashH = doc.currentLineHeight(true);
        doc.text('—', x + 2, rowTop + (rowH - dashH) / 2, {
          width: fotoColW - 4,
          align: 'center',
        });
      }
      x += fotoColW;

      const cells = matriculaToExportCells(m).map(String);
      doc.font('Helvetica').fontSize(6.5);
      for (let ci = 0; ci < cells.length; ci++) {
        const cellInnerW = textColW - 2;
        const txt = cells[ci] ?? '';
        const blockH = Math.min(
          doc.heightOfString(txt, { width: cellInnerW }),
          rowH,
        );
        const txtY = rowTop + (rowH - blockH) / 2;
        doc.text(txt, x + 1, txtY, {
          width: cellInnerW,
          height: rowH,
          ellipsis: true,
        });
        x += textColW;
      }
      const lineBottom = rowTop + rowH;
      drawDividerSingle(lineBottom, stripLeft, stripLeft + stripW);
    };

    let stripIx = 0;
    let lineInStrip = 0;

    for (const m of rows) {
      const stripLeft = ml + stripIx * (stripW + PDF_STRIP_GUTTER);
      let rowTop = dataTopY + lineInStrip * dataRowFull;

      while (rowTop + g.dataRowH > getBottom()) {
        dataTopY = openPageWithHeaders();
        stripIx = 0;
        lineInStrip = 0;
        rowTop = dataTopY;
      }

      drawOneRow(stripLeft, rowTop, m);

      lineInStrip++;
      if (lineInStrip >= rowsPerColumn) {
        lineInStrip = 0;
        stripIx++;
        if (stripIx >= columns) {
          dataTopY = openPageWithHeaders();
          stripIx = 0;
        }
      }
    }

    doc.end();
  });
}
