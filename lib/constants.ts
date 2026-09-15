import { FormatField, Resident, Staff } from "./types";

export const FACILITY_NAME = "さくら苑 3階フロア";

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
