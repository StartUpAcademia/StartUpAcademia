import { structureLocal } from "./structure-local";
import { FormatField } from "./types";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

function hasApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export interface ExtractedField {
  label: string;
  type: string;
}

const MOCK_EXTRACTED_FIELDS: ExtractedField[] = [
  { label: "体温", type: "数値" },
  { label: "血圧", type: "数値（上/下）" },
  { label: "食事摂取量", type: "選択肢（10割〜0割）" },
  { label: "入浴時間", type: "時刻" },
  { label: "特記事項", type: "自由記述" },
];

/**
 * 記録用紙の写真から項目名・種別のドラフトを抽出する。
 * ANTHROPIC_API_KEY未設定時はモック結果を返す（デモ・開発用フォールバック）。
 */
export async function extractFormatFieldsFromImage(
  imageBase64: string,
  mediaType: string
): Promise<ExtractedField[]> {
  if (!hasApiKey()) {
    await delay(900);
    return MOCK_EXTRACTED_FIELDS;
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
          name: "record_format_fields",
          description:
            "介護記録用紙の写真から読み取った記入項目の一覧を報告する。",
          input_schema: {
            type: "object",
            properties: {
              fields: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    label: { type: "string", description: "項目名（例: 体温, 血圧, 特記事項）" },
                    type: {
                      type: "string",
                      description: "項目の種別（自由記述／数値／数値（上/下）／選択肢／時刻 のいずれか）",
                    },
                  },
                  required: ["label", "type"],
                },
              },
            },
            required: ["fields"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "record_format_fields" },
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
              text: "この介護記録用紙に並んでいる記入項目名を、上から順にすべて抽出してください。",
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
  const fields = toolUse?.input?.fields as ExtractedField[] | undefined;
  return fields && fields.length > 0 ? fields : MOCK_EXTRACTED_FIELDS;
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
