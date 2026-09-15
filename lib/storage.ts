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

// Drafts are private to this tab; only commitDraft publishes to the record list.
const DRAFT_KEY = 'care.drafts';
export function getDraft(residentId: string): CareRecord | null {
  if (typeof window === 'undefined') return null;
  const drafts = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || '{}');
  const draft = drafts[residentId] as CareRecord | undefined;
  return draft && !getRecords().some(r => r.id === draft.id) ? draft : null;
}
export function appendDraft(record: CareRecord) {
  const drafts = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || '{}');
  const previous = getDraft(record.residentId);
  const values = new Map(previous?.fields.map(f => [f.fieldId, f]) || []);
  for (const field of record.fields) {
    if (!field.isMissing && field.value.trim()) {
      const isNote = getFormatFields().some(f => f.id === field.fieldId && /特記|備考|メモ/.test(f.label));
      const existing = values.get(field.fieldId);
      values.set(field.fieldId, isNote && existing ? {...field, value: existing.value + '。' + field.value} : field);
    }
  }
  drafts[record.residentId] = {
    ...record, id: previous?.id || record.id,
    createdAt: previous?.createdAt || record.createdAt,
    rawTranscript: [previous?.rawTranscript, record.rawTranscript].filter(Boolean).join('\n'),
    fields: [...values.values()],
  };
  sessionStorage.setItem(DRAFT_KEY, JSON.stringify(drafts));
  window.dispatchEvent(new Event('care:draft'));
}
export function commitDraft(residentId: string) {
  const draft = getDraft(residentId);
  if (!draft) throw new Error('保存する下書きがありません');
  addRecord({...draft, content: undefined, category: undefined});
  // Keeping the committed ID makes retries harmless even after a storage failure.
}
