"use client";

import { OTHER_RESIDENTS } from "./constants";
import { addRecord, getFormatFields, getRecords } from "./storage";
import { CareRecordFieldValue, FormatField } from "./types";

const SEED_FLAG_KEY = "care.seeded.v2";

interface SeedEntry {
  daysAgo: number;
  hour: number;
  minute: number;
  staffId: string;
  values: Partial<Record<"体温" | "血圧" | "食事摂取量" | "入浴時間" | "特記事項", string>>;
}

const SEED_BY_RESIDENT: Record<string, SeedEntry[]> = {
  "resident-2": [
    {
      daysAgo: 0,
      hour: 8,
      minute: 10,
      staffId: "staff-1",
      values: {
        体温: "36.4℃",
        血圧: "132 / 78",
        食事摂取量: "10割",
        特記事項: "朝食は全量摂取。表情も穏やかで，会話にもよく応じてくださった。",
      },
    },
    {
      daysAgo: 1,
      hour: 15,
      minute: 40,
      staffId: "staff-2",
      values: {
        体温: "36.6℃",
        血圧: "128 / 74",
        食事摂取量: "9割",
        入浴時間: "14:30",
        特記事項: "入浴時，背部に軽い発赤があったため看護師へ申し送り済み。",
      },
    },
  ],
  "resident-3": [
    {
      daysAgo: 0,
      hour: 9,
      minute: 5,
      staffId: "staff-2",
      values: {
        体温: "36.8℃",
        血圧: "141 / 86",
        食事摂取量: "7割",
        特記事項: "食欲やや低下気味。むせ込みはなく，水分摂取は良好。",
      },
    },
    {
      daysAgo: 1,
      hour: 12,
      minute: 20,
      staffId: "staff-1",
      values: {
        体温: "36.5℃",
        血圧: "136 / 82",
        食事摂取量: "10割",
        入浴時間: "11:00",
        特記事項: "本日入浴。皮膚状態に問題なし。機嫌よく過ごされている。",
      },
    },
    {
      daysAgo: 2,
      hour: 19,
      minute: 0,
      staffId: "staff-3",
      values: {
        体温: "37.0℃",
        血圧: "138 / 84",
        食事摂取量: "8割",
        特記事項: "夕方，微熱あり。念のため翌朝も検温を継続する。",
      },
    },
  ],
  "resident-4": [
    {
      daysAgo: 0,
      hour: 7,
      minute: 45,
      staffId: "staff-1",
      values: {
        体温: "36.3℃",
        血圧: "118 / 70",
        食事摂取量: "10割",
        入浴時間: "07:30",
        特記事項: "早朝より覚醒良好。散歩リハビリにも積極的に参加された。",
      },
    },
  ],
  "resident-5": [
    {
      daysAgo: 0,
      hour: 10,
      minute: 15,
      staffId: "staff-2",
      values: {
        体温: "36.5℃",
        血圧: "124 / 76",
        食事摂取量: "8割",
        特記事項: "傾眠傾向あり。声かけには反応し，意識レベルに問題なし。",
      },
    },
    {
      daysAgo: 1,
      hour: 16,
      minute: 30,
      staffId: "staff-3",
      values: {
        体温: "36.7℃",
        血圧: "126 / 80",
        食事摂取量: "9割",
        入浴時間: "16:00",
        特記事項: "入浴後，肌の乾燥が見られたため保湿剤を塗布。",
      },
    },
  ],
};

function buildFieldValues(fields: FormatField[], values: SeedEntry["values"]): CareRecordFieldValue[] {
  return fields.map((f) => {
    const v = (values as Record<string, string | undefined>)[f.label];
    return { fieldId: f.id, value: v ?? "", isMissing: !v };
  });
}

function buildTranscript(values: SeedEntry["values"]): string {
  const parts: string[] = [];
  if (values.体温) parts.push(`体温は${values.体温.replace("℃", "度")}`);
  if (values.血圧) parts.push(`血圧は${values.血圧.replace(" / ", "の")}`);
  if (values.食事摂取量) parts.push(`食事は${values.食事摂取量}摂取`);
  if (values.入浴時間) parts.push(`入浴は${values.入浴時間}`);
  const base = parts.join("、");
  return values.特記事項 ? `${base}。${values.特記事項}` : `${base}。`;
}

/**
 * デモ対象（CURRENT_RESIDENT）以外の入居者に，見栄え確認用のダミー記録を投入する。
 * 一度だけ実行するようフラグで管理し，既存データは上書きしない。
 */
export function seedOtherResidentsIfNeeded() {
  if (typeof window === "undefined") return;
  if (window.localStorage.getItem(SEED_FLAG_KEY)) return;
  if (getRecords().length > 0) {
    // 既にユーザー操作で記録が存在する場合は，シードで上書きしない。
    window.localStorage.setItem(SEED_FLAG_KEY, "1");
    return;
  }

  const fields = getFormatFields();

  OTHER_RESIDENTS.forEach((resident) => {
    const entries = SEED_BY_RESIDENT[resident.id] ?? [];
    entries.forEach((entry, i) => {
      const createdAt = new Date();
      createdAt.setDate(createdAt.getDate() - entry.daysAgo);
      createdAt.setHours(entry.hour, entry.minute, 0, 0);

      addRecord({
        id: `seed-${resident.id}-${i}`,
        residentId: resident.id,
        staffId: entry.staffId,
        createdAt: createdAt.toISOString(),
        rawTranscript: buildTranscript(entry.values),
        fields: buildFieldValues(fields, entry.values),
      });
    });
  });

  window.localStorage.setItem(SEED_FLAG_KEY, "1");
}
