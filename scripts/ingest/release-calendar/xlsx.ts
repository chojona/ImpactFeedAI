/**
 * Minimal, dependency-free XLSX cell reader (ZIP central directory + raw
 * deflate via node:zlib). Enough for the SF Fed workbook: shared strings,
 * numeric cells and inline strings. Not a general spreadsheet parser.
 */

import { inflateRawSync } from "node:zlib";

function readZip(buf: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("not a ZIP archive (no end-of-central-directory record)");
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const files = new Map<string, Uint8Array>();
  const decoder = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error("corrupt ZIP central directory");
    const method = view.getUint16(p + 10, true);
    const compSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const name = decoder.decode(buf.subarray(p + 46, p + 46 + nameLen));
    const lNameLen = view.getUint16(localOffset + 26, true);
    const lExtraLen = view.getUint16(localOffset + 28, true);
    const start = localOffset + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(start, start + compSize);
    if (method === 0) files.set(name, raw);
    else if (method === 8) files.set(name, new Uint8Array(inflateRawSync(raw)));
    else throw new Error(`unsupported ZIP compression method ${method} for ${name}`);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

const unescapeXml = (s: string): string =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d: string) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, "&");

function columnIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? "A";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Read every sheet as a 2-D array of strings ("" for empty cells). */
export function readWorkbook(buf: Uint8Array): Map<string, string[][]> {
  const files = readZip(buf);
  const text = (name: string): string => {
    const f = files.get(name);
    if (!f) throw new Error(`workbook part missing: ${name}`);
    return new TextDecoder().decode(f);
  };
  const shared: string[] = files.has("xl/sharedStrings.xml")
    ? [...text("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
        unescapeXml([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("")))
    : [];
  const rels = new Map<string, string>();
  for (const m of text("xl/_rels/workbook.xml.rels").matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const id = /\bId="([^"]+)"/.exec(m[1])?.[1];
    const target = /\bTarget="([^"]+)"/.exec(m[1])?.[1];
    if (id && target) rels.set(id, target.replace(/^\/?xl\//, "").replace(/^\//, ""));
  }
  const sheets = new Map<string, string[][]>();
  for (const m of text("xl/workbook.xml").matchAll(/<sheet\b([^>]*)\/>/g)) {
    const name = unescapeXml(/\bname="([^"]+)"/.exec(m[1])?.[1] ?? "");
    const rid = /\br:id="([^"]+)"/.exec(m[1])?.[1];
    const target = rid ? rels.get(rid) : undefined;
    if (!name || !target) continue;
    const rows: string[][] = [];
    for (const r of text(`xl/${target}`).matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const row: string[] = [];
      for (const c of r[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = /\br="([A-Z]+\d+)"/.exec(c[1])?.[1] ?? "";
        const type = /\bt="([^"]+)"/.exec(c[1])?.[1];
        const inner = c[2] ?? "";
        let value = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? "";
        if (type === "s" && value !== "") value = shared[Number(value)] ?? "";
        else if (type === "inlineStr") value = /<t[^>]*>([\s\S]*?)<\/t>/.exec(inner)?.[1] ?? "";
        const idx = ref ? columnIndex(ref) : row.length;
        while (row.length < idx) row.push("");
        row[idx] = unescapeXml(value);
      }
      rows.push(row);
    }
    sheets.set(name, rows);
  }
  return sheets;
}

/** Excel 1900 date system serial → YYYY-MM-DD (epoch 1899-12-30 absorbs the 1900 leap bug). */
export function excelSerialToIsoDay(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 61) return null;
  const ms = Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}
