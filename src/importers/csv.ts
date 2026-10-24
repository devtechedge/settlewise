import { AppError } from "@/lib/errors";

export const CSV_LIMITS = {
  maxBytes: 2 * 1024 * 1024,
  maxRows: 2000,
  maxColumns: 60,
  maxFieldLength: 10_000,
} as const;

export type CsvRow = {
  rowNumber: number;
  values: string[];
  structureError: string | null;
};

export type ParsedCsv = {
  headers: string[];
  rows: CsvRow[];
};

export function parseCsv(input: string): ParsedCsv {
  const text = input.replace(/^\uFEFF/, "").replaceAll("\0", "");
  if (text.trim().length === 0) {
    throw new AppError("VALIDATION_ERROR", "The CSV file is empty.");
  }
  if (Buffer.byteLength(text, "utf8") > CSV_LIMITS.maxBytes) {
    throw new AppError("PAYLOAD_TOO_LARGE", `CSV files are limited to ${CSV_LIMITS.maxBytes / 1024 / 1024} MB.`);
  }

  const records: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let fieldStarted = false;
  let i = 0;

  const pushField = () => {
    if (field.length > CSV_LIMITS.maxFieldLength) {
      throw new AppError("PAYLOAD_TOO_LARGE", "A CSV cell is longer than the supported limit.");
    }
    row.push(field);
    field = "";
    fieldStarted = false;
  };
  const pushRow = () => {
    pushField();
    const isBlank = row.length === 1 && (row[0] ?? "").trim() === "";
    if (!isBlank) {
      if (row.length > CSV_LIMITS.maxColumns) {
        throw new AppError("PAYLOAD_TOO_LARGE", `CSV files are limited to ${CSV_LIMITS.maxColumns} columns.`);
      }
      records.push(row);
      if (records.length > CSV_LIMITS.maxRows + 1) {
        throw new AppError("PAYLOAD_TOO_LARGE", `CSV imports are limited to ${CSV_LIMITS.maxRows} data rows.`);
      }
    }
    row = [];
  };

  while (i < text.length) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }
    if (char === '"' && !fieldStarted) {
      inQuotes = true;
      fieldStarted = true;
      i += 1;
      continue;
    }
    if (char === ",") {
      pushField();
      i += 1;
      continue;
    }
    if (char === "\n") {
      pushRow();
      i += 1;
      continue;
    }
    if (char === "\r") {
      if (text[i + 1] === "\n") i += 1;
      pushRow();
      i += 1;
      continue;
    }
    field += char;
    fieldStarted = true;
    i += 1;
  }
  if (inQuotes) {
    throw new AppError("VALIDATION_ERROR", "The CSV file has an unfinished quoted cell.");
  }
  if (field.length > 0 || row.length > 0) pushRow();

  if (records.length === 0) {
    throw new AppError("VALIDATION_ERROR", "The CSV file has no header row.");
  }
  const rawHeaders = records[0] ?? [];
  const headers = rawHeaders.map((header) => header.trim());
  if (headers.length === 0 || headers.every((header) => header === "")) {
    throw new AppError("VALIDATION_ERROR", "The CSV header row is empty.");
  }
  const seen = new Set<string>();
  for (const header of headers) {
    if (!header) throw new AppError("VALIDATION_ERROR", "Every CSV column needs a header name.");
    const lower = header.toLowerCase();
    if (seen.has(lower)) {
      throw new AppError("VALIDATION_ERROR", `The CSV has more than one "${header}" column. Rename the duplicates first.`);
    }
    seen.add(lower);
  }

  const dataRows = records.slice(1);
  if (dataRows.length === 0) {
    throw new AppError("VALIDATION_ERROR", "The CSV file has no data rows.");
  }
  const rows = dataRows.map((cells, index) => {
    const padded = headers.map((_, columnIndex) => cells[columnIndex] ?? "");
    const structureError =
      cells.length === headers.length
        ? null
        : `Row has ${cells.length} cells but the header has ${headers.length}.`;
    return { rowNumber: index + 2, values: padded, structureError };
  });
  return { headers, rows };
}

export function rowToObject(headers: string[], row: CsvRow): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((header, index) => {
    result[header] = row.values[index] ?? "";
  });
  return result;
}

export function sanitizeCsvText(value: string): string {
  const cleaned = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ").slice(0, 32_000);
  if (/^[=+\-@\t\r]/.test(cleaned)) return `'${cleaned}`;
  return cleaned;
}

export function csvCell(value: string | number | bigint | null | undefined): string {
  const raw = value === null || value === undefined ? "" : String(value);
  const safe = sanitizeCsvText(raw);
  if (/[",\r\n]/.test(safe)) return `"${safe.replaceAll('"', '""')}"`;
  return safe;
}

export function buildCsv(headers: string[], rows: (string | number | bigint | null | undefined)[][]): string {
  return [headers.map(csvCell).join(","), ...rows.map((row) => row.map(csvCell).join(","))].join("\r\n");
}
