import * as ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import type { PESPessoa } from '@prisma/client';

export const MATRICULA_EXPORT_HEADERS = [
  'PESCodigo',
  'PESIdExterno',
  'PESNome',
  'Matricula',
  'Curso',
  'Serie',
  'Turma',
  'Status',
] as const;

export type MatriculaExportRow = {
  MATNumero: string;
  MATCurso: string | null;
  MATSerie: string | null;
  MATTurma: string | null;
  MATAtivo: boolean;
  pessoa: Pick<PESPessoa, 'PESCodigo' | 'PESIdExterno' | 'PESNome'>;
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

export function buildPdfBuffer(rows: MatriculaExportRow[]): Promise<Buffer> {
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

    const tableRows: string[][] = [
      [...MATRICULA_EXPORT_HEADERS],
      ...rows.map((m) =>
        matriculaToExportCells(m).map((c) => String(c)),
      ),
    ];

    const usableW =
      doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const colW = usableW / MATRICULA_EXPORT_HEADERS.length;
    const lineH = 11;
    const rowGap = 3;
    let y = doc.y;
    const bottom = doc.page.height - doc.page.margins.bottom - 16;
    let isHeader = true;

    for (const line of tableRows) {
      if (y + lineH > bottom) {
        doc.addPage();
        y = doc.page.margins.top;
      }
      doc.font(isHeader ? 'Helvetica-Bold' : 'Helvetica').fontSize(6.5);
      let x = doc.page.margins.left;
      for (let i = 0; i < line.length; i++) {
        doc.text(line[i] ?? '', x + 1, y, {
          width: colW - 2,
          height: lineH + 2,
          ellipsis: true,
        });
        x += colW;
      }
      isHeader = false;
      y += lineH + rowGap;
    }

    doc.end();
  });
}
