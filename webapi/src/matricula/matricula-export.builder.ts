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

/** Linha com foto carregada (apenas export PDF). `PESFotoBase64` já redimensionado 48×48 quando presente. */
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

const PDF_FOTO_PT = 48;
/** Largura da coluna foto: imagem 48pt + folga */
const PDF_FOTO_COL_W = 56;
/** Altura útil da linha de dados (conteúdo centralizado nesta faixa) */
const PDF_DATA_ROW_H = PDF_FOTO_PT + 8;
const PDF_HEADER_ROW_H = 14;
const PDF_ROW_GAP = 2;
const PDF_DIVIDER = '#6d6d6e';

export function buildPdfBuffer(rows: MatriculaPdfExportRow[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      layout: 'landscape',
      margin: 28,
      size: 'A4',
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(11).font('Helvetica-Bold').text('Matrículas', {
      align: 'center',
    });
    doc.moveDown(0.6);

    const ml = doc.page.margins.left;
    let y = doc.y;
    const bottom = doc.page.height - doc.page.margins.bottom - 16;

    const usableW =
      doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const mr = ml + usableW;
    const fotoColW = PDF_FOTO_COL_W;
    const textColW =
      (usableW - fotoColW) / MATRICULA_EXPORT_HEADERS.length;

    const drawDividerAt = (yLine: number) => {
      doc.save();
      doc.strokeColor(PDF_DIVIDER).lineWidth(0.4);
      doc.moveTo(ml, yLine).lineTo(mr, yLine).stroke();
      doc.restore();
    };

    const ensureSpace = (need: number) => {
      if (y + need > bottom) {
        doc.addPage();
        y = doc.page.margins.top;
      }
    };

    ensureSpace(PDF_HEADER_ROW_H + PDF_ROW_GAP + 4);

    const headerTop = y;
    doc.font('Helvetica-Bold').fontSize(6.5);
    let xh = ml;
    for (let hi = 0; hi < MATRICULA_EXPORT_HEADERS_PDF.length; hi++) {
      const cw = hi === 0 ? fotoColW : textColW;
      const label = MATRICULA_EXPORT_HEADERS_PDF[hi];
      const textW = cw - 4;
      const hStr = Math.min(
        doc.heightOfString(label, {
          width: textW,
        }),
        PDF_HEADER_ROW_H,
      );
      const ty = headerTop + (PDF_HEADER_ROW_H - hStr) / 2;
      doc.text(label, xh + 2, ty, {
        width: textW,
        height: PDF_HEADER_ROW_H + 2,
        ellipsis: true,
      });
      xh += cw;
    }

    y = headerTop + PDF_HEADER_ROW_H;
    drawDividerAt(y);
    y += PDF_ROW_GAP;

    for (const m of rows) {
      ensureSpace(PDF_DATA_ROW_H + PDF_ROW_GAP + 4);

      const rowTop = y;
      let x = ml;

      const imgBuf = decodePdfImageBuffer(m.pessoa.PESFotoBase64);
      if (imgBuf) {
        try {
          const imgX = x + Math.max(0, (fotoColW - PDF_FOTO_PT) / 2);
          const imgY = rowTop + (PDF_DATA_ROW_H - PDF_FOTO_PT) / 2;
          doc.image(imgBuf, imgX, imgY, {
            width: PDF_FOTO_PT,
            height: PDF_FOTO_PT,
          });
        } catch {
          doc.font('Helvetica').fontSize(8);
          const dashH = doc.currentLineHeight(true);
          doc.text('—', x + 2, rowTop + (PDF_DATA_ROW_H - dashH) / 2, {
            width: fotoColW - 4,
            align: 'center',
          });
        }
      } else {
        doc.font('Helvetica').fontSize(8);
        const dashH = doc.currentLineHeight(true);
        doc.text('—', x + 2, rowTop + (PDF_DATA_ROW_H - dashH) / 2, {
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
          doc.heightOfString(txt, {
            width: cellInnerW,
          }),
          PDF_DATA_ROW_H,
        );
        const txtY = rowTop + (PDF_DATA_ROW_H - blockH) / 2;
        doc.text(txt, x + 1, txtY, {
          width: cellInnerW,
          height: PDF_DATA_ROW_H,
          ellipsis: true,
        });
        x += textColW;
      }

      y = rowTop + PDF_DATA_ROW_H;
      drawDividerAt(y);
      y += PDF_ROW_GAP;
    }

    doc.end();
  });
}
