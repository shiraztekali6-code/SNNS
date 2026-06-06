import path from "node:path";
import { readSheet } from "read-excel-file/universal";
import type { ColumnProfile, DetectedColumnKind, TableProfile } from "./types";

type CellValue = string | number | boolean | Date | null;
type RawRow = Record<string, CellValue>;

const ID_RE = /(subject|mouse|cage|patient|sample|animal|participant|person|donor|well|replicate|id)/i;
const SUBJECT_RE = /(subject|mouse|cage|patient|sample|animal|participant|donor)/i;
const TIME_RE = /(time|day|night|session|phase|before|after|visit|week|hour|date|start|end|cycle)/i;
const GROUP_RE = /(group|treatment|condition|genotype|sex|phase|cohort|drug|dose|arm|strain)/i;
const COUNT_RE = /(count|number|num|events|cells|reads|frequency|freq)/i;
const WIDE_TIME_RE = /(day|session|time|week|visit|before|after|phase|t\d+|d\d+|_\d+$|\d+$)/i;

function normalizeHeader(value: string, index: number): string {
  const trimmed = value.trim();
  return trimmed || `column_${index + 1}`;
}

function makeUniqueHeaders(headers: string[]): string[] {
  const seen = new Map<string, number>();
  return headers.map((header) => {
    const count = seen.get(header) ?? 0;
    seen.set(header, count + 1);
    return count === 0 ? header : `${header}_${count + 1}`;
  });
}

function parseCsv(text: string): RawRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        cell += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  if (row.some((value) => value.trim() !== "")) rows.push(row);

  if (rows.length === 0) return [];
  const headers = makeUniqueHeaders(rows[0].map((value, index) => normalizeHeader(value, index)));

  return rows.slice(1).map((values) => {
    const record: RawRow = {};
    headers.forEach((header, index) => {
      const value = values[index]?.trim() ?? "";
      record[header] = value === "" ? null : value;
    });
    return record;
  });
}

async function parseXlsx(bytes: Buffer): Promise<RawRow[]> {
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const sheetRows = await readSheet(arrayBuffer);
  if (sheetRows.length === 0) {
    throw new Error("This Excel workbook does not contain any sheets.");
  }

  const firstNonEmptyRowIndex = sheetRows.findIndex((row) => row.some((value) => !isMissing(value as CellValue)));
  if (firstNonEmptyRowIndex < 0) return [];

  const headerRow = sheetRows[firstNonEmptyRowIndex];
  const headers = makeUniqueHeaders(
    headerRow.map((value, index) => normalizeHeader(asString(value as CellValue) ?? "", index))
  );

  const records: RawRow[] = [];
  for (const values of sheetRows.slice(firstNonEmptyRowIndex + 1)) {
    if (!values.some((value) => !isMissing(value as CellValue))) continue;
    const record: RawRow = {};
    headers.forEach((header, index) => {
      const value = values[index] as CellValue | undefined;
      record[header] = isMissing(value) ? null : (value as CellValue);
    });
    records.push(record);
  }

  return records;
}

export async function parseTableBytes(bytes: Buffer, originalName: string): Promise<RawRow[]> {
  const extension = path.extname(originalName).toLowerCase();

  if (extension === ".csv") {
    return parseCsv(bytes.toString("utf8"));
  }

  if (extension === ".xlsx") {
    return parseXlsx(bytes);
  }

  if (extension === ".xls") {
    throw new Error("Legacy .xls Excel files are not supported yet. Please save/export the workbook as .xlsx or CSV, then upload it again.");
  }

  throw new Error("Only CSV and modern Excel .xlsx files are supported in the MVP.");
}

function isMissing(value: CellValue | undefined): boolean {
  return value === null || value === undefined || (typeof value === "string" && value.trim() === "");
}

function jsonSafe(value: CellValue | undefined): string | number | null {
  if (isMissing(value)) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  return String(value);
}

function asString(value: CellValue | undefined): string | null {
  const safe = jsonSafe(value);
  return safe === null ? null : String(safe);
}

function numericValue(value: CellValue | undefined): number | null {
  if (isMissing(value) || value instanceof Date) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return null;

  const text = String(value).trim();
  if (text === "") return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function dateRatio(values: CellValue[], columnName: string): number {
  const nonMissing = values.filter((value) => !isMissing(value));
  if (nonMissing.length === 0) return 0;

  const nameSuggestsDate = /(date|time|start|end)/i.test(columnName);
  if (!nameSuggestsDate && nonMissing.every((value) => numericValue(value) !== null)) {
    return 0;
  }

  const valid = nonMissing.filter((value) => {
    if (value instanceof Date) return !Number.isNaN(value.getTime());
    if (typeof value === "number" || typeof value === "boolean") return false;
    const parsed = Date.parse(String(value));
    return Number.isFinite(parsed);
  });

  return valid.length / nonMissing.length;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function topCounts(values: string[]): Array<{ value: string; count: number }> {
  const counts = new Map<string, number>();
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([value, count]) => ({ value, count }));
}

function inferColumn(values: CellValue[], name: string, totalRows: number): ColumnProfile {
  const missingValues = values.filter(isMissing).length;
  const nonMissing = values.filter((value) => !isMissing(value));
  const stringValues = nonMissing.map((value) => asString(value)).filter((value): value is string => value !== null);
  const unique = new Set(stringValues);
  const uniqueValues = unique.size;
  const uniqueRatio = uniqueValues / Math.max(1, nonMissing.length);
  const numericValues = nonMissing.map(numericValue);
  const cleanNumeric = numericValues.filter((value): value is number => value !== null);
  const numericRatio = cleanNumeric.length / Math.max(1, nonMissing.length);
  const dateLikeRatio = dateRatio(nonMissing, name);

  const detectedTypes: DetectedColumnKind[] = [];
  const isSubjectId = SUBJECT_RE.test(name) && (uniqueRatio >= 0.15 || uniqueValues >= 3);
  const isId = ID_RE.test(name) && (uniqueRatio >= 0.25 || uniqueValues >= 3);
  const isTime = TIME_RE.test(name);
  const isGroup = GROUP_RE.test(name);
  const isDate = dateLikeRatio >= 0.75;
  const isNumeric = numericRatio >= 0.85;
  const isBinary = uniqueValues === 2;
  const isIntegerish = isNumeric && cleanNumeric.length > 0 && cleanNumeric.every((value) => Math.abs(value - Math.round(value)) < 1e-9);
  const isCount =
    isNumeric &&
    !isBinary &&
    isIntegerish &&
    Math.min(...cleanNumeric) >= 0 &&
    (COUNT_RE.test(name) || uniqueValues <= Math.max(20, Math.floor(totalRows / 3)));
  const isContinuous = isNumeric && !isBinary && !isCount && !(isId && uniqueRatio > 0.7);
  const isCategorical =
    isBinary ||
    isGroup ||
    (!isNumeric && !isDate) ||
    (uniqueValues > 0 && uniqueValues <= Math.min(25, Math.max(2, Math.floor(totalRows / 2))));

  if (isSubjectId) detectedTypes.push("subject_id_like");
  if (isId) detectedTypes.push("id_like");
  if (isTime) detectedTypes.push("time_session_like");
  if (isGroup) detectedTypes.push("group_treatment_like");
  if (isDate) detectedTypes.push("date_time");
  if (isBinary) detectedTypes.push("binary");
  if (isCount) detectedTypes.push("count_like");
  if (isContinuous) detectedTypes.push("numeric_continuous");
  if (isCategorical) detectedTypes.push("categorical");
  if (detectedTypes.length === 0) detectedTypes.push("unknown");

  const priority: DetectedColumnKind[] = [
    "subject_id_like",
    "time_session_like",
    "group_treatment_like",
    "date_time",
    "binary",
    "count_like",
    "numeric_continuous",
    "id_like",
    "categorical",
    "unknown"
  ];
  const primaryType = priority.find((kind) => detectedTypes.includes(kind)) ?? "unknown";

  const profile: ColumnProfile = {
    name,
    primaryType,
    detectedTypes,
    missingValues,
    missingPercent: Number(((missingValues / Math.max(1, totalRows)) * 100).toFixed(2)),
    uniqueValues,
    examples: [...unique].slice(0, 6)
  };

  if (isNumeric) {
    const sum = cleanNumeric.reduce((total, value) => total + value, 0);
    profile.numericSummary = {
      min: cleanNumeric.length ? Math.min(...cleanNumeric) : null,
      max: cleanNumeric.length ? Math.max(...cleanNumeric) : null,
      mean: cleanNumeric.length ? sum / cleanNumeric.length : null,
      median: median(cleanNumeric)
    };
  }

  if (isCategorical || isBinary || isGroup) {
    const counts = topCounts(stringValues);
    profile.categoricalSummary = {
      levels: counts.map((item) => item.value),
      levelCount: uniqueValues,
      topCounts: counts
    };
  }

  return profile;
}

function duplicatedRowCount(rows: RawRow[], columnNames: string[]): number {
  const counts = new Map<string, number>();
  rows.forEach((row) => {
    const key = JSON.stringify(columnNames.map((column) => jsonSafe(row[column])));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return [...counts.values()].reduce((total, count) => total + Math.max(0, count - 1), 0);
}

function columnsWith(columnProfiles: ColumnProfile[], kind: DetectedColumnKind): string[] {
  return columnProfiles.filter((profile) => profile.detectedTypes.includes(kind)).map((profile) => profile.name);
}

export function profileRows(rows: RawRow[], datasetId: string, originalName: string): TableProfile {
  const columnNames = makeUniqueHeaders(
    Array.from(new Set(rows.flatMap((row) => Object.keys(row)))).map((column, index) => normalizeHeader(column, index))
  );
  const totalRows = rows.length;
  const columnProfiles = columnNames.map((column) => inferColumn(rows.map((row) => row[column]), column, totalRows));

  const subjectCols = columnsWith(columnProfiles, "subject_id_like");
  const idCols = columnsWith(columnProfiles, "id_like");
  const timeCols = columnsWith(columnProfiles, "time_session_like");
  const groupCols = columnProfiles
    .filter(
      (profile) =>
        profile.detectedTypes.includes("group_treatment_like") ||
        (profile.detectedTypes.includes("categorical") &&
          !profile.detectedTypes.includes("subject_id_like") &&
          profile.uniqueValues <= 12)
    )
    .map((profile) => profile.name);
  const numericOutcomes = columnProfiles
    .filter(
      (profile) =>
        (profile.detectedTypes.includes("numeric_continuous") || profile.detectedTypes.includes("count_like")) &&
        !profile.detectedTypes.includes("time_session_like") &&
        !profile.detectedTypes.includes("id_like")
    )
    .map((profile) => profile.name);
  const countLike = columnsWith(columnProfiles, "count_like");
  const binaryCols = columnsWith(columnProfiles, "binary");
  const dateCols = columnsWith(columnProfiles, "date_time");

  const groupLevelCounts = columnProfiles
    .filter((profile) => profile.categoricalSummary)
    .map((profile) => ({
      column: profile.name,
      levels: profile.categoricalSummary?.levelCount ?? 0,
      examples: profile.categoricalSummary?.levels.slice(0, 6) ?? []
    }));

  const duplicatedIds = Array.from(new Set([...subjectCols, ...idCols])).flatMap((column) => {
    const counts = new Map<string, number>();
    rows.forEach((row) => {
      const value = asString(row[column]);
      if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
    });
    const repeated = [...counts.entries()].filter(([, count]) => count > 1).sort((a, b) => b[1] - a[1]);
    if (repeated.length === 0) return [];
    return [
      {
        column,
        duplicatedValueCount: repeated.length,
        maxRowsPerValue: Math.max(...repeated.map(([, count]) => count)),
        examples: repeated.slice(0, 6).map(([value]) => value)
      }
    ];
  });

  const repeatedMeasuresLikely = Boolean(
    duplicatedIds.length > 0 && (timeCols.length > 0 || duplicatedIds.some((item) => item.maxRowsPerValue > 2))
  );

  const wideMeasureNames = numericOutcomes.filter((column) => WIDE_TIME_RE.test(column));
  let wideScore = 0;
  if (numericOutcomes.length >= 3) wideScore += 2;
  if (wideMeasureNames.length >= 2) wideScore += 2;
  if (timeCols.length === 0 && numericOutcomes.length >= 3) wideScore += 1;
  if (columnNames.length >= 8 && numericOutcomes.length / Math.max(1, columnNames.length) >= 0.45) wideScore += 1;

  let longScore = 0;
  if (subjectCols.length && timeCols.length && numericOutcomes.length) longScore += 4;
  if (repeatedMeasuresLikely) longScore += 2;
  if (numericOutcomes.length && groupCols.length && numericOutcomes.length <= 4) longScore += 1;
  if (totalRows > Math.max(20, columnNames.length * 3)) longScore += 1;

  const appearsWide = wideScore >= 3 && wideScore > longScore;
  const appearsLong = longScore >= 3 && longScore >= wideScore;
  const tableShape = appearsWide ? "wide" : appearsLong ? "long" : "ambiguous";

  const missingCells = rows.reduce(
    (total, row) => total + columnNames.filter((column) => isMissing(row[column])).length,
    0
  );
  const rowsWithMissingValues = rows.filter((row) => columnNames.some((column) => isMissing(row[column]))).length;
  const duplicatedRows = duplicatedRowCount(rows, columnNames);

  const suggestions: string[] = [];
  const warnings: string[] = [];

  if (numericOutcomes.length) {
    suggestions.push(`Possible numeric outcome columns: ${numericOutcomes.slice(0, 6).join(", ")}`);
  } else {
    warnings.push("No obvious numeric outcome column was detected.");
  }

  if (subjectCols.length) suggestions.push(`Possible repeated-unit ID columns: ${subjectCols.slice(0, 6).join(", ")}`);
  if (timeCols.length) suggestions.push(`Possible time/session columns: ${timeCols.slice(0, 6).join(", ")}`);
  if (groupCols.length) suggestions.push(`Possible group/treatment/factor columns: ${groupCols.slice(0, 8).join(", ")}`);

  if (appearsWide) {
    suggestions.push("The table appears wide; many analyses will need one row per observation in long format.");
  } else if (appearsLong) {
    suggestions.push("The table appears long/tidy, which is suitable for ANOVA, regression, and mixed models.");
  } else {
    suggestions.push("The table shape is ambiguous; confirm whether repeated measurements are spread across columns or rows.");
  }

  if (missingCells) warnings.push(`The table contains ${missingCells} missing cells across ${rowsWithMissingValues} rows.`);
  if (duplicatedRows) warnings.push(`The table contains ${duplicatedRows} fully duplicated rows.`);
  if (repeatedMeasuresLikely) warnings.push("Repeated measurements may exist; avoid treating repeated rows as independent.");

  return {
    datasetId,
    fileName: originalName,
    rows: totalRows,
    columns: columnNames.length,
    columnNames,
    preview: rows.slice(0, 8).map((row) =>
      Object.fromEntries(columnNames.map((column) => [column, jsonSafe(row[column])]))
    ),
    missingCells,
    rowsWithMissingValues,
    duplicatedRows,
    columnProfiles,
    groupLevelCounts,
    duplicatedIds,
    possibleSubjectIdColumns: subjectCols,
    possibleTimeColumns: timeCols,
    possibleGroupColumns: groupCols,
    numericOutcomeColumns: numericOutcomes,
    countLikeColumns: countLike,
    binaryColumns: binaryCols,
    dateTimeColumns: dateCols,
    appearsWide,
    appearsLong,
    tableShape,
    wideScore,
    longScore,
    repeatedMeasuresLikely,
    suggestions,
    warnings
  };
}

export async function profileTableBytes(bytes: Buffer, datasetId: string, originalName: string): Promise<TableProfile> {
  const rows = await parseTableBytes(bytes, originalName);
  return profileRows(rows, datasetId, originalName);
}
