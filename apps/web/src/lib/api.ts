import type {
  DesignMode,
  ExportAvailability,
  ExportFormat,
  SceneDocument,
} from "@flowcad/shared";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://127.0.0.1:8000";

export async function generateScene(
  mode: DesignMode,
  rows: Record<string, unknown>[],
): Promise<SceneDocument> {
  const res = await fetch(`${API_BASE}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode, rows }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.detail ?? `Generation failed (${res.status})`);
  }
  return (await res.json()) as SceneDocument;
}

export async function fetchExportAvailability(): Promise<ExportAvailability> {
  const res = await fetch(`${API_BASE}/api/export/formats`);
  if (!res.ok) throw new Error(`Could not load export formats (${res.status})`);
  return (await res.json()) as ExportAvailability;
}

/** Request an export and trigger a browser download of the returned file. */
export async function downloadExport(
  mode: DesignMode,
  rows: Record<string, unknown>[],
  format: ExportFormat,
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode, rows, format }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.detail ?? `Export failed (${res.status})`);
  }
  const blob = await res.blob();
  triggerDownload(blob, parseFilename(res, `flowcad.${format}`));
}

/** Download an empty Excel input template for the given mode. */
export async function downloadTemplate(mode: DesignMode): Promise<void> {
  const res = await fetch(`${API_BASE}/api/template?mode=${mode}`);
  if (!res.ok) throw new Error(`Template download failed (${res.status})`);
  triggerDownload(await res.blob(), parseFilename(res, `flowcad_template_${mode}.xlsx`));
}

/** Upload a filled .xlsx/.csv and get back parsed rows to populate the table. */
export async function uploadTable(file: File): Promise<Record<string, unknown>[]> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/api/upload`, { method: "POST", body: form });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.detail ?? `Upload failed (${res.status})`);
  }
  const data = (await res.json()) as { rows: Record<string, unknown>[] };
  return data.rows;
}

/** Extract a safe basename from Content-Disposition (strip paths/control chars). */
function parseFilename(res: Response, fallback: string): string {
  const raw = res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1];
  return (raw ?? fallback)
    .replace(/[\\/]/g, "_")
    .replace(/[\x00-\x1f]/g, "")
    .slice(0, 128);
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
