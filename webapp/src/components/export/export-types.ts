export type ExportFormat = "csv" | "xlsx" | "pdf";

export const EXPORT_FORMATOS: ExportFormat[] = ["csv", "xlsx", "pdf"];

export const EXPORT_FORMAT_LABELS: Record<ExportFormat, string> = {
    csv: "CSV",
    xlsx: "Excel",
    pdf: "PDF",
};
