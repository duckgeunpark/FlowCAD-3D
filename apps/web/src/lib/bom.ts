import type { BomRow } from "@flowcad/shared";

export interface SummaryRow {
  description: string;
  spec: string;
  quantity: number;
  totalLength: number;
}

/** Aggregate BOM rows into a quantity takeoff grouped by part and spec. */
export function summarize(bom: BomRow[]): SummaryRow[] {
  const groups = new Map<string, SummaryRow>();
  for (const row of bom) {
    const key = `${row.description}||${row.spec}`;
    const existing = groups.get(key);
    if (existing) {
      existing.quantity += 1;
      existing.totalLength += row.lengthMm || 0;
    } else {
      groups.set(key, {
        description: row.description,
        spec: row.spec,
        quantity: 1,
        totalLength: row.lengthMm || 0,
      });
    }
  }
  return [...groups.values()].sort(
    (a, b) =>
      a.description.localeCompare(b.description) || a.spec.localeCompare(b.spec),
  );
}

export function toCsv(rows: (string | number)[][]): string {
  const escape = (v: string | number) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "\uFEFF" + rows.map((r) => r.map(escape).join(",")).join("\r\n");
}

export function download(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
