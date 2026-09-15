export type FieldType =
  | "自由記述"
  | "数値"
  | "数値（上/下）"
  | "選択肢"
  | "時刻";

export interface FormatField {
  id: string;
  label: string;
  type: FieldType | string;
  required: boolean;
  order: number;
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
