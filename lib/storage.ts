"use client";

import { CareRecord, FacilityRecordSchema, FormatField } from "./types";
import { DEFAULT_FORMAT_FIELDS } from "./constants";

const FORMAT_FIELDS_KEY = "care.formatFields";
const FORMAT_CONFIGURED_KEY = "care.formatConfigured";
const RECORDS_KEY = "care.records";
const FACILITY_SCHEMAS_KEY = "care.facilitySchemas";

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function getFormatFields(): FormatField[] {
  return read<FormatField[]>(FORMAT_FIELDS_KEY, DEFAULT_FORMAT_FIELDS);
}

export function saveFormatFields(fields: FormatField[]) {
  write(FORMAT_FIELDS_KEY, fields);
  write(FORMAT_CONFIGURED_KEY, true);
}

export function isFormatConfigured(): boolean {
  return read<boolean>(FORMAT_CONFIGURED_KEY, false);
}

/**
 * 施設ごとの記録フォーマット（記録用紙の写真・AI抽出結果・管理者確認済み項目）を保持する。
 * 現状アプリは単一施設のみ運用するが、施設IDをキーにしたレコードとして保存しておくことで、
 * 将来複数施設に対応する際もデータ構造の変更なしに拡張できる。
 */
export function getFacilitySchema(facilityId: string): FacilityRecordSchema | null {
  const all = read<Record<string, FacilityRecordSchema>>(FACILITY_SCHEMAS_KEY, {});
  return all[facilityId] ?? null;
}

export function saveFacilitySchema(schema: FacilityRecordSchema) {
  const all = read<Record<string, FacilityRecordSchema>>(FACILITY_SCHEMAS_KEY, {});
  all[schema.facilityId] = schema;
  write(FACILITY_SCHEMAS_KEY, all);
  // 音声記録・個人ページなど既存機能はすべて getFormatFields() を参照しているため，
  // 施設schemaの保存と同時にここも更新し、既存の動作をそのまま活かす。
  saveFormatFields(schema.fields);
}

export function getRecords(): CareRecord[] {
  return read<CareRecord[]>(RECORDS_KEY, []);
}

export function addRecord(record: CareRecord) {
  const records = getRecords();
  records.push(record);
  write(RECORDS_KEY, records);
}

/**
 * 入居者ごとの最新の状態を「項目IDごとの最新値」としてマージしたビューを返す。
 * 複数回の音声記録（未入力項目の追記など）を1つの個人ページ上に反映するため。
 */
export function getMergedFieldValues(
  residentId: string
): Record<string, { value: string; recordId: string }> {
  const records = getRecords()
    .filter((r) => r.residentId === residentId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const merged: Record<string, { value: string; recordId: string }> = {};
  for (const record of records) {
    for (const f of record.fields) {
      if (f.isMissing) continue;
      merged[f.fieldId] = { value: f.value, recordId: record.id };
    }
  }
  return merged;
}

export function getRawTranscripts(residentId: string): { createdAt: string; text: string }[] {
  return getRecords()
    .filter((r) => r.residentId === residentId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((r) => ({ createdAt: r.createdAt, text: r.rawTranscript }));
}
