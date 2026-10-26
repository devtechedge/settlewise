import { describe, expect, it } from "vitest";
import { buildCsv, CSV_LIMITS, parseCsv, rowToObject, sanitizeCsvText } from "@/importers/csv";

describe("CSV parser", () => {
  it("handles BOM, CRLF, quoted newlines, and escaped quotes", () => {
    const parsed = parseCsv('﻿date,description\r\n2026-10-01,"Dinner, ""late""\r\nending"\r\n');
    expect(parsed.headers).toEqual(["date", "description"]);
    expect(parsed.rows[0]?.values[1]).toBe('Dinner, "late"\r\nending');
  });

  it("rejects duplicate headers and unfinished quotes", () => {
    expect(() => parseCsv("date,date\n2026-10-01,1")).toThrow(/more than one/);
    expect(() => parseCsv('date\n"unfinished')).toThrow(/unfinished/);
  });

  it("skips blank trailing rows and reports row length mismatches", () => {
    const parsed = parseCsv("date,amount\n2026-10-01,10\n\n");
    expect(parsed.rows).toHaveLength(1);
    const mismatch = parseCsv("date,amount,notes\n2026-10-01,10\n");
    expect(mismatch.rows[0]?.structureError).toMatch(/2 cells but the header has 3/);
  });

  it("enforces column and cell bounds", () => {
    const wide = [
      Array.from({ length: CSV_LIMITS.maxColumns + 1 }, (_, i) => `c${i}`).join(","),
      Array(CSV_LIMITS.maxColumns + 1).fill("1").join(","),
    ].join("\n");
    expect(() => parseCsv(wide)).toThrow(/columns/);
    expect(() => parseCsv(`a\n${"x".repeat(CSV_LIMITS.maxFieldLength + 1)}`)).toThrow(/cell is longer/);
  });

  it("preserves formula-looking values as text", () => {
    const parsed = parseCsv('description\n"=SUM(1,2)"\n');
    expect(rowToObject(parsed.headers, parsed.rows[0]!)).toEqual({ description: "=SUM(1,2)" });
  });
});

describe("CSV export", () => {
  it("neutralizes spreadsheet formula prefixes", () => {
    expect(sanitizeCsvText("=cmd")).toBe("'=cmd");
    expect(sanitizeCsvText("+cmd")).toBe("'+cmd");
    expect(sanitizeCsvText("@cmd")).toBe("'@cmd");
    expect(sanitizeCsvText("\tcmd")).toBe("'\tcmd");
    expect(sanitizeCsvText("-45")).toBe("'-45");
  });

  it("quotes delimiters but leaves numeric amount strings alone", () => {
    const csv = buildCsv(["Description", "Amount"], [['=bad, "quoted"', "1200.00"]]);
    expect(csv).toContain("\"'=bad, \"\"quoted\"\"\"");
    expect(csv).toContain(",1200.00");
  });
});
