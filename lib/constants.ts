import { FieldKind, FieldType, FormatField, Resident, Staff } from "./types";

export const FACILITY_NAME = "さくら苑 3階フロア";

// 現状アプリは単一施設のみだが、施設ごとのschemaを保持できるように
// facilityId は最初から独立した概念として持っておく。
export const CURRENT_FACILITY_ID = "facility-1";

export interface RequiredFieldDef {
  key: string;
  label: string;
  type: FieldType;
  kind: FieldKind;
  unit?: string;
  options?: string[];
  aliases: string[];
}

// 記録用紙の画像から必ず抽出を試みる固定9項目。
// 「AIにどの項目が重要か自由に判断させない」という要件のため，
// 抽出対象はこのリストに固定する（表記ゆれは aliases で吸収する）。
export const REQUIRED_FIELD_DEFS: RequiredFieldDef[] = [
  { key: "body_temperature", label: "体温", type: "数値", kind: "number", unit: "℃", aliases: ["体温", "検温"] },
  { key: "blood_pressure", label: "血圧", type: "数値（上/下）", kind: "blood_pressure", unit: "mmHg", aliases: ["血圧", "BP"] },
  { key: "breakfast_intake", label: "朝食の摂取量", type: "選択肢", kind: "select", options: ["全量", "8割", "5割", "未摂取"], aliases: ["朝食", "朝食摂取量", "朝食の摂取量"] },
  { key: "lunch_intake", label: "昼食の摂取量", type: "選択肢", kind: "select", options: ["全量", "8割", "5割", "未摂取"], aliases: ["昼食", "昼食摂取量", "昼食の摂取量"] },
  { key: "dinner_intake", label: "夕食の摂取量", type: "選択肢", kind: "select", options: ["全量", "8割", "5割", "未摂取"], aliases: ["夕食", "夕食摂取量", "夕食の摂取量"] },
  { key: "water_intake", label: "水分摂取量", type: "数値", kind: "number", unit: "mL", aliases: ["水分摂取量", "水分量", "飲水量", "水分", "お茶"] },
  { key: "defecation", label: "排便", type: "選択肢", kind: "defecation", options: ["普通", "軟便", "下痢"], aliases: ["排便", "便"] },
  { key: "bathing_time", label: "入浴時間", type: "時刻", kind: "time_range", aliases: ["入浴時間", "入浴"] },
  { key: "special_notes", label: "特記事項", type: "自由記述", kind: "text", aliases: ["特記事項", "気づいたこと", "特記", "備考"] },
];

export const REQUIRED_FIELD_KEYS = REQUIRED_FIELD_DEFS.map((d) => d.key);

export const CURRENT_STAFF: Staff = {
  id: "staff-1",
  name: "佐藤",
  role: "介護士",
};

// 個人ページのタイムライン表示（複数職員の記録が混在する見た目）用のダミー職員。
export const STAFF_LIST: Staff[] = [
  CURRENT_STAFF,
  { id: "staff-2", name: "鈴木", role: "介護士" },
  { id: "staff-3", name: "高橋", role: "看護師" },
];

// 音声記録デモの対象入居者（仕様書4章：対象入居者は固定でよい）。
// 一覧の見栄えのため他に4名分のダミー入居者を用意するが，デモ対象者のページは
// 空の状態からその場で記録を作成する様子を見せるため，シードデータは入れない。
export const CURRENT_RESIDENT: Resident = {
  id: "resident-1",
  name: "田中 花子",
  roomNumber: "304",
};

export const OTHER_RESIDENTS: Resident[] = [
  { id: "resident-2", name: "鈴木 一郎", roomNumber: "301" },
  { id: "resident-3", name: "高橋 幸子", roomNumber: "302" },
  { id: "resident-4", name: "渡辺 誠", roomNumber: "303" },
  { id: "resident-5", name: "伊藤 みつ", roomNumber: "305" },
];

export const ALL_RESIDENTS: Resident[] = [CURRENT_RESIDENT, ...OTHER_RESIDENTS];

export const DEFAULT_FORMAT_FIELDS: FormatField[] = [
  { id: "field-1", label: "体温", type: "数値", required: true, order: 0 },
  { id: "field-2", label: "血圧", type: "数値（上/下）", required: true, order: 1 },
  { id: "field-3", label: "食事摂取量", type: "選択肢（10割〜0割）", required: true, order: 2 },
  { id: "field-4", label: "入浴時間", type: "時刻", required: false, order: 3 },
  { id: "field-5", label: "特記事項", type: "自由記述", required: false, order: 4 },
];

export const WAKE_WORD = "記録開始";
export const SUBMIT_WORD = "送信";
