import { structureLocal } from "./structure-local";
import { FormatField } from "./types";
import { REQUIRED_FIELD_DEFS, REQUIRED_FIELD_KEYS } from "./constants";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

function hasApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export interface ExtractedFieldResult {
  key: string;
  label: string;
  found: boolean;
}

/**
 * 記録用紙の写真を解析し、固定9項目（体温・血圧・朝食/昼食/夕食の摂取量・水分摂取量・
 * 排便・入浴時間・特記事項）それぞれが、この用紙に記入欄として存在するかを判定する。
 * 値が未記入でも、欄（ラベル＋入力スペース）自体があれば found=true とする。
 * どの項目を抽出するかはAIに自由判断させず、常にこの9項目を対象に固定する。
 * ANTHROPIC_API_KEY未設定時はモック結果（全項目検出）を返す（デモ・開発用フォールバック）。
 */
export async function extractFacilityRecordFields(
  imageBase64: string,
  mediaType: string
): Promise<ExtractedFieldResult[]> {
  if (!hasApiKey()) {
    await delay(900);
    return REQUIRED_FIELD_DEFS.map((d) => ({ key: d.key, label: d.label, found: true }));
  }

  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      tools: [
        {
          name: "record_schema_fields",
          description:
            "介護記録用紙の画像を解析し、あらかじめ指定された9種類の記録項目それぞれについて、" +
            "この用紙に実際の記入欄（ラベルと入力スペース）として存在するかどうかを判定して報告する。",
          input_schema: {
            type: "object",
            properties: {
              fields: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    key: { type: "string", enum: REQUIRED_FIELD_KEYS },
                    found: { type: "boolean", description: "この項目の記入欄が用紙上に存在するか" },
                    label_on_form: {
                      type: "string",
                      description: "用紙上でこの項目に使われている実際の表記（例: 検温, BP, 飲水量）。無ければ省略可。",
                    },
                  },
                  required: ["key", "found"],
                },
              },
            },
            required: ["fields"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "record_schema_fields" },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: imageBase64 },
            },
            {
              type: "text",
              text:
                "この介護記録用紙の画像から、以下の9種類の記録項目それぞれについて、" +
                "用紙上に記入欄として存在するかを判定してください。文字だけでなく、表の構造・行・列・" +
                "チェックボックス・単位・近接する文字を総合的に見て判断してください。\n\n" +
                REQUIRED_FIELD_DEFS.map((d) => `- ${d.key}: 「${d.label}」（表記ゆれの例: ${d.aliases.join("、")}）`).join("\n") +
                "\n\n未記入（値が空欄）の用紙であっても、欄自体が存在すれば found=true としてください。" +
                "様式No.・記入日・フロア・ユニット・入居者名・居室番号・記入者・職種・記入者/確認者サイン・" +
                "帳票タイトルなどはこの9項目に含まれないため対象外です。",
            },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic API error: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  const toolUse = data.content?.find((c: { type: string }) => c.type === "tool_use");
  const detected =
    (toolUse?.input?.fields as { key: string; found: boolean }[] | undefined) ?? [];
  const byKey = new Map(detected.map((d) => [d.key, d.found]));

  // 常に9項目すべてを返す（モデルが一部を返し忘れても found=false として扱う）。
  return REQUIRED_FIELD_DEFS.map((d) => ({
    key: d.key,
    label: d.label,
    found: byKey.get(d.key) ?? false,
  }));
}

export interface ValidationResult {
  success: boolean;
  missingFields: string[];
}

/** 抽出結果に固定9項目がすべて含まれているかを検証する。 */
export function validateRequiredFields(results: { key: string; found: boolean }[]): ValidationResult {
  const foundKeys = new Set(results.filter((r) => r.found).map((r) => r.key));
  const missingFields = REQUIRED_FIELD_KEYS.filter((k) => !foundKeys.has(k));
  return { success: missingFields.length === 0, missingFields };
}

export interface StructuredFieldResult {
  fieldId: string;
  value: string;
  isMissing: boolean;
}

/**
 * 発話の書き起こし（raw transcript）を，設定済みフォーマット項目に振り分けて構造化する。
 * ANTHROPIC_API_KEY未設定時は簡易ヒューリスティックによるモック結果を返す。
 */
export async function structureTranscript(
  transcript: string,
  fields: FormatField[]
): Promise<StructuredFieldResult[]> {
  if (!hasApiKey()) {
    await delay(1200);
    return mockStructure(transcript, fields);
  }

  const properties: Record<string, unknown> = {};
  for (const f of fields) {
    properties[f.id] = {
      type: "object",
      properties: {
        value: { type: "string", description: `${f.label}（${f.type}）の値。読み取れなければ空文字。` },
        isMissing: { type: "boolean", description: "発話内容にこの項目の情報が含まれていなければtrue" },
      },
      required: ["value", "isMissing"],
    };
  }

  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      tools: [
        {
          name: "structure_care_record",
          description: "介護職員の発話内容を，施設フォーマットの各項目に振り分けて構造化する。",
          input_schema: {
            type: "object",
            properties,
            required: fields.map((f) => f.id),
          },
        },
      ],
      tool_choice: { type: "tool", name: "structure_care_record" },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                `以下は介護職員の発話をそのまま書き起こしたテキストです。丁寧語に整えつつ，` +
                `施設の記録フォーマットの各項目に振り分けてください。\n\n発話内容:\n${transcript}\n\n` +
                `フォーマット項目:\n${fields.map((f) => `- ${f.label}（${f.type}）`).join("\n")}`,
            },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic API error: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  const toolUse = data.content?.find((c: { type: string }) => c.type === "tool_use");
  const input = toolUse?.input as
    | Record<string, { value: string; isMissing: boolean }>
    | undefined;

  if (!input) return mockStructure(transcript, fields);

  return fields.map((f) => ({
    fieldId: f.id,
    value: input[f.id]?.value ?? "",
    isMissing: input[f.id]?.isMissing ?? true,
  }));
}

function mockStructure(transcript: string, fields: FormatField[]): StructuredFieldResult[] { return structureLocal(transcript, fields); }

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
