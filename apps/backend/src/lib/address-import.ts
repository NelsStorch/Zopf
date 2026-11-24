import fs from 'fs';
import os from 'os';
import path from 'path';
import readline from 'readline';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import type { ReadableStream as WebReadableStream } from 'stream/web';
import yauzl from 'yauzl';
import type { FastifyBaseLogger } from 'fastify';
import { prisma } from './prisma.js';
import { lv95ToWgs84, normalizeForSearch } from './geo.js';

/**
 * Imports the official building address directory (swisstopo, open government
 * data, daily updated CSV in a ZIP of about 150 MB) for the postal codes of the
 * delivery area. Only these few thousand addresses are kept; the search when
 * ordering then runs against our own database and asks no one else.
 *
 * ADDRESS_DIRECTORY_URL can point to a mirror; ADDRESS_DIRECTORY_FILE to a ZIP
 * already on the disk (tests, servers without internet).
 */
export const DEFAULT_DIRECTORY_URL =
  'https://data.geo.admin.ch/ch.swisstopo.amtliches-gebaeudeadressverzeichnis/amtliches-gebaeudeadressverzeichnis_ch/amtliches-gebaeudeadressverzeichnis_ch_2056.csv.zip';

export interface AddressRow {
  egaid: string;
  street: string;
  houseNumber: string;
  zip: string;
  city: string;
  lat: number;
  lng: number;
  searchText: string;
}

/** One CSV line, separated by ";", fields optionally in double quotes ("" inside a quoted field is one "). */
export function parseCsvLine(line: string, separator = ';'): string[] {
  if (!line.includes('"')) return line.split(separator);
  const fields: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else current += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === separator) {
      fields.push(current);
      current = '';
    } else current += ch;
  }
  fields.push(current);
  return fields;
}

const REQUIRED = ['ADR_EGAID', 'STN_LABEL', 'ADR_NUMBER', 'ZIP_LABEL', 'ADR_STATUS', 'ADR_EASTING', 'ADR_NORTHING'] as const;

/**
 * Reads the CSV lines and keeps the existing addresses ("real") in the given
 * postal codes. Planned or outdated addresses are left out; whoever lives
 * somewhere not in the list uses "my address is missing".
 */
export async function collectAddresses(lines: AsyncIterable<string>, zipCodes: Set<string>): Promise<AddressRow[]> {
  let index: Record<(typeof REQUIRED)[number], number> | null = null;
  const rows: AddressRow[] = [];
  for await (const raw of lines) {
    const line = raw.replace(/^﻿/, '').trimEnd();
    if (!line) continue;
    const fields = parseCsvLine(line);
    if (!index) {
      const found = Object.fromEntries(REQUIRED.map((name) => [name, fields.indexOf(name)])) as Record<(typeof REQUIRED)[number], number>;
      const missing = REQUIRED.filter((name) => found[name] < 0);
      if (missing.length) throw new Error(`Unerwartetes Format, Spalten fehlen: ${missing.join(', ')}`);
      index = found;
      continue;
    }
    const zipLabel = fields[index.ZIP_LABEL] ?? '';
    const zip = zipLabel.slice(0, 4);
    if (!zipCodes.has(zip) || fields[index.ADR_STATUS] !== 'real') continue;
    const easting = Number(fields[index.ADR_EASTING]);
    const northing = Number(fields[index.ADR_NORTHING]);
    const street = (fields[index.STN_LABEL] ?? '').trim();
    if (!street || !Number.isFinite(easting) || !Number.isFinite(northing) || easting === 0) continue;
    const houseNumber = (fields[index.ADR_NUMBER] ?? '').trim();
    const city = zipLabel.slice(5).trim();
    const { lat, lng } = lv95ToWgs84(easting, northing);
    rows.push({
      egaid: fields[index.ADR_EGAID],
      street,
      houseNumber,
      zip,
      city,
      lat: Math.round(lat * 1e7) / 1e7,
      lng: Math.round(lng * 1e7) / 1e7,
      searchText: normalizeForSearch(`${street} ${houseNumber} ${zip} ${city}`),
    });
  }
  return rows;
}

/** Lines of the first .csv inside the ZIP file. */
function csvLinesFromZip(file: string): Promise<AsyncIterable<string>> {
  return new Promise((resolve, reject) => {
    yauzl.open(file, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return reject(err ?? new Error('ZIP konnte nicht geöffnet werden'));
      zip.on('entry', (entry: yauzl.Entry) => {
        if (!entry.fileName.toLowerCase().endsWith('.csv')) return zip.readEntry();
        zip.openReadStream(entry, (streamErr, stream) => {
          if (streamErr || !stream) return reject(streamErr ?? new Error('CSV im ZIP nicht lesbar'));
          stream.on('end', () => zip.close());
          resolve(readline.createInterface({ input: stream, crlfDelay: Number.POSITIVE_INFINITY }));
        });
      });
      zip.on('end', () => reject(new Error('Keine CSV-Datei im ZIP gefunden')));
      zip.readEntry();
    });
  });
}

async function download(url: string, target: string) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Zopfaktion address import' } });
  if (!res.ok || !res.body) throw new Error(`Download fehlgeschlagen (HTTP ${res.status})`);
  await pipeline(Readable.fromWeb(res.body as unknown as WebReadableStream), fs.createWriteStream(target));
}

/** Writes the rows (insert or update by EGAID) and removes addresses of these postal codes that are gone. */
async function store(rows: AddressRow[], zipCodes: string[]): Promise<{ imported: number; removed: number }> {
  for (let i = 0; i < rows.length; i += 1000) {
    const chunk = rows.slice(i, i + 1000);
    await prisma.$executeRaw`
      INSERT INTO "addresses" ("egaid", "street", "houseNumber", "zip", "city", "lat", "lng", "searchText")
      SELECT * FROM unnest(
        ${chunk.map((r) => r.egaid)}::text[]::bigint[], ${chunk.map((r) => r.street)}::text[], ${chunk.map((r) => r.houseNumber)}::text[],
        ${chunk.map((r) => r.zip)}::text[], ${chunk.map((r) => r.city)}::text[], ${chunk.map((r) => r.lat)}::float8[],
        ${chunk.map((r) => r.lng)}::float8[], ${chunk.map((r) => r.searchText)}::text[])
      ON CONFLICT ("egaid") DO UPDATE SET
        "street" = EXCLUDED."street", "houseNumber" = EXCLUDED."houseNumber", "zip" = EXCLUDED."zip", "city" = EXCLUDED."city",
        "lat" = EXCLUDED."lat", "lng" = EXCLUDED."lng", "searchText" = EXCLUDED."searchText"`;
  }
  // Orders keep their own copy of the address; the link to a removed entry becomes null.
  const removed = await prisma.$executeRaw`
    DELETE FROM "addresses" WHERE "zip" = ANY(${zipCodes}::text[]) AND NOT ("egaid" = ANY(${rows.map((r) => r.egaid)}::text[]::bigint[]))`;
  return { imported: rows.length, removed };
}

export interface ImportState {
  running: boolean;
  phase: 'download' | 'read' | 'store' | null;
  importId: number | null;
}

const state: ImportState = { running: false, phase: null, importId: null };

export function importState(): ImportState {
  return { ...state };
}

/**
 * Starts the import in the background and returns its id at once; the admin
 * page asks for the state. Only one import runs at a time (null = already running).
 */
export async function startAddressImport(zipCodes: string[], userId: number, log: FastifyBaseLogger): Promise<number | null> {
  if (state.running) return null;
  const unique = [...new Set(zipCodes)].sort();
  const record = await prisma.addressImport.create({ data: { zipCodes: unique, userId } });
  Object.assign(state, { running: true, phase: 'download', importId: record.id });

  void (async () => {
    const localFile = process.env.ADDRESS_DIRECTORY_FILE?.trim();
    const tmp = path.join(os.tmpdir(), `adressen-${record.id}.zip`);
    try {
      if (!localFile) await download(process.env.ADDRESS_DIRECTORY_URL?.trim() || DEFAULT_DIRECTORY_URL, tmp);
      state.phase = 'read';
      const rows = await collectAddresses(await csvLinesFromZip(localFile || tmp), new Set(unique));
      state.phase = 'store';
      const result = await store(rows, unique);
      await prisma.addressImport.update({ where: { id: record.id }, data: { ...result, finishedAt: new Date() } });
      log.info({ ...result, zipCodes: unique }, 'Adressverzeichnis importiert');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error({ err }, 'Adressimport fehlgeschlagen');
      await prisma.addressImport.update({ where: { id: record.id }, data: { error: message.slice(0, 500), finishedAt: new Date() } }).catch(() => {});
    } finally {
      if (!localFile) await fs.promises.rm(tmp, { force: true });
      Object.assign(state, { running: false, phase: null });
    }
  })();

  return record.id;
}
