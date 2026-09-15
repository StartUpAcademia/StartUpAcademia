"use client";

import { CareRecord, FormatField } from "./types";
import { DEFAULT_FORMAT_FIELDS } from "./constants";

const FORMAT_FIELDS_KEY = "care.formatFields";
const FORMAT_CONFIGURED_KEY = "care.formatConfigured";
const RECORDS_KEY = "care.records";

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
