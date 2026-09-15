export type FieldType =
  | "自由記述"
  | "数値"
  | "数値（上/下）"
  | "選択肢"
  | "時刻";

// 音声入力の値抽出・記録用紙からのschema抽出で使う内部的な値の種類。
// 固定9項目のように「どう構造化して保存するか」を判定するためのタグで，
// 表示用の FieldType（日本語ラベル）とは別に持つ。
export type FieldKind =
  | "number"
  | "blood_pressure"
  | "select"
  | "defecation"
  | "time_range"
  | "text";

export interface FormatField {
  id: string;
  label: string;
  type: FieldType | string;
  required: boolean;
  order: number;
  // 以下は施設ごとの記録用紙から生成されたフォーマットのみ持つ付加情報。
  // 未設定の場合は従来どおりの自由なフォーマット（DEFAULT_FORMAT_FIELDS等）として扱う。
  key?: string;
  kind?: FieldKind;
  unit?: string;
  options?: string[];
  aliases?: string[];
  detected?: boolean;
}

// 施設ごとに、記録用紙の写真から生成・管理者確認済みの記録フォーマットを保持する。
export interface FacilityRecordSchema {
  id: string;
  facilityId: string;
  schemaName: string;
  createdAt: string;
  updatedAt: string;
  sourceImage: string; // 元画像（data URL）。管理者が後から確認できるよう保持する。
  extractedAt: string;
  aiExtractedFields: FormatField[]; // AIが画像から抽出した直後のドラフト（管理者修正前）
  fields: FormatField[]; // 管理者確認済みの最終的な記録項目
}

export interface Resident {
  id: string;
  name: string;
  roomNumber: string;
}

export interface Staff {
  id: string;
  name: string;
  role: string;
}

export interface CareRecordFieldValue {
  fieldId: string;
  value: string;
  isMissing: boolean;
}

export interface CareRecord {
  id: string;
  residentId: string;
  staffId: string;
  createdAt: string;
  inputMethod?: "voice";
  recordType?: "care" | "voice_incomplete";
  reviewRequired?: boolean;
  category?: string;
  content?: string;
  startedAt?: string;
  endedAt?: string;
  rawTranscript: string;
  fields: CareRecordFieldValue[];
}
