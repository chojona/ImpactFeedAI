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
  const records = tokenizeCsv(body)
    .filter((record) => !record.blank)
    .map((record) => record.cells);
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

interface CsvRecord {
  readonly cells: string[];
  /** An empty line, as opposed to a record holding one quoted empty field. */
  readonly blank: boolean;
}

/**
 * Split text into records of cells; quoted fields may span lines. A quote
 * may only open a field, and only a delimiter or line end may follow the
 * closing quote — anything else makes the whole input unparseable.
 */
function tokenizeCsv(text: string): CsvRecord[] {
  const records: CsvRecord[] = [];
  let record: string[] = [];
  let cell = "";
  let inQuotes = false;
  let closedQuote = false;
  let recordQuoted = false;
  let line = 1;

  const endRecord = () => {
    record.push(cell);
    records.push({
      cells: record,
      blank: record.length === 1 && cell === "" && !recordQuoted,
    });
    record = [];
    cell = "";
    closedQuote = false;
    recordQuoted = false;
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === "\n") line += 1;
      if (ch !== '"') {
        cell += ch;
      } else if (text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = false;
        closedQuote = true;
      }
      continue;
    }
    if (ch === ",") {
      record.push(cell);
      cell = "";
      closedQuote = false;
    } else if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      endRecord();
      line += 1;
    } else if (closedQuote) {
      throw new Error(`CSV line ${line}: unexpected character after closing quote`);
    } else if (ch === '"') {
      if (cell.length > 0) {
        throw new Error(`CSV line ${line}: stray quote inside an unquoted field`);
      }
      inQuotes = true;
      recordQuoted = true;
    } else {
      cell += ch;
    }
  }

  if (inQuotes) throw new Error("CSV has an unterminated quoted field");
  if (cell.length > 0 || record.length > 0 || closedQuote) endRecord();
  return records;
}
