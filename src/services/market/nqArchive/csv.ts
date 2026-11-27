/**
 * Minimal RFC 4180 CSV reader for archive manifests. Deterministic, no schema
 * inventing: a ragged row or an unterminated quote fails instead of shifting
 * values into the wrong column.
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
  const body = text.startsWith("\uFEFF") ? text.slice(1) : text;
  const records = tokenizeCsv(body).filter(
    (cells) => !(cells.length === 1 && cells[0] === ""),
  );
  if (records.length === 0) return [];

  const headers = records[0]!;
  return records.slice(1).map((cells, index) => {
    if (cells.length !== headers.length) {
      throw new Error(
        `CSV row ${index + 2} has ${cells.length} cells; header has ${headers.length}`,
      );
    }
    const row: Record<string, string> = {};
    headers.forEach((header, c) => {
      row[header] = cells[c]!;
    });
    return row;
  });
}

/** Split text into records of cells; quoted fields may span lines. */
function tokenizeCsv(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch !== '"') {
        cell += ch;
      } else if (text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = false;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      record.push(cell);
      cell = "";
    } else if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      record.push(cell);
      records.push(record);
      record = [];
      cell = "";
    } else {
      cell += ch;
    }
  }

  if (inQuotes) throw new Error("CSV has an unterminated quoted field");
  if (cell.length > 0 || record.length > 0) {
    record.push(cell);
    records.push(record);
  }
  return records;
}
