/**
 * Minimal CSV helpers for archive manifests. Deterministic, no schema inventing.
 */
import { readFile } from "node:fs/promises";

export async function readCsvRecords(
  filePath: string,
): Promise<ReadonlyArray<Readonly<Record<string, string>>>> {
  const text = await readFile(filePath, "utf8");
  return parseCsv(text);
}

export function parseCsv(
  text: string,
): ReadonlyArray<Readonly<Record<string, string>>> {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);
  if (lines.length === 0) return [];

  const headers = splitCsvLine(lines[0]!);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cells = splitCsvLine(lines[i]!);
    const row: Record<string, string> = {};
    for (let c = 0; c < headers.length; c += 1) {
      row[headers[c]!] = cells[c] ?? "";
    }
    rows.push(row);
  }
  return rows;
}

/** Split one CSV line; supports quoted fields with commas. */
function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      cells.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current);
  return cells;
}
