"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FacilityRecordSchema, FormatField } from "@/lib/types";
import { getFacilitySchema, saveFacilitySchema } from "@/lib/storage";
import { CURRENT_FACILITY_ID, FACILITY_NAME, REQUIRED_FIELD_DEFS } from "@/lib/constants";

type Mode = "capture" | "loading" | "review" | "current";

let nextLocalId = 1000;

interface PendingImage {
  base64: string;
  mediaType: string;
  dataUrl: string;
}

export default function FormatPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>("capture");
  const [fields, setFields] = useState<FormatField[]>([]);
  const [aiExtractedFields, setAiExtractedFields] = useState<FormatField[]>([]);
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [existingSchema, setExistingSchema] = useState<FacilityRecordSchema | null>(null);

  useEffect(() => {
    const schema = getFacilitySchema(CURRENT_FACILITY_ID);
    if (schema) {
      // Initial hydration from the browser-only facility schema store.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setExistingSchema(schema);
      setMode("current");
    }
  }, []);

  function handleTapCapture() {
    fileInputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const allowed = ["image/jpeg", "image/jpg", "image/png"];
    if (!allowed.includes(file.type)) {
      setError("対応していない画像形式です。jpg・jpeg・png形式の画像を選択してください。");
      return;
    }

    setError(null);
    setMode("loading");

    try {
      const { base64, mediaType, dataUrl } = await fileToBase64(file);
      setPendingImage({ base64, mediaType, dataUrl });

      const res = await fetch("/api/extract-format", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mediaType }),
      });
      if (!res.ok) throw new Error("抽出APIの呼び出しに失敗しました");
      const data = await res.json();
      const extracted = data.fields as { key: string; label: string; found: boolean }[];
      const missing = (data.missingFields as string[] | undefined) ?? [];

      const merged: FormatField[] = REQUIRED_FIELD_DEFS.map((def, i) => ({
        id: `field-${nextLocalId++}`,
        label: def.label,
        type: def.type,
        required: true,
        order: i,
        key: def.key,
        kind: def.kind,
        unit: def.unit,
        options: def.options ? [...def.options] : undefined,
        aliases: [...def.aliases],
        detected: extracted.find((f) => f.key === def.key)?.found ?? false,
      }));

      setAiExtractedFields(merged.map((f) => ({ ...f })));
      setMissingFields(missing);
      setFields(merged);
      setMode("review");
    } catch (err) {
      console.error(err);
      setError("項目の読み取りに失敗しました。もう一度撮影してください。");
      setMode("capture");
    }
  }

  function updateField(id: string, patch: Partial<FormatField>) {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }

  function removeField(id: string) {
    setFields((prev) => prev.filter((f) => f.id !== id));
  }

  function addField() {
    setFields((prev) => [
      ...prev,
      { id: `field-${nextLocalId++}`, label: "新しい項目", type: "自由記述", kind: "text", required: false, order: prev.length },
    ]);
  }

  function confirm() {
    if (!pendingImage) return;
    const ordered = fields.map((f, i) => ({ ...f, order: i }));
    const now = new Date().toISOString();
    const schema: FacilityRecordSchema = {
      id: existingSchema?.id ?? `schema-${Date.now()}`,
      facilityId: CURRENT_FACILITY_ID,
      schemaName: `${FACILITY_NAME} 記録フォーマット`,
      createdAt: existingSchema?.createdAt ?? now,
      updatedAt: now,
      sourceImage: pendingImage.dataUrl,
      extractedAt: now,
      aiExtractedFields,
      fields: ordered,
    };
    saveFacilitySchema(schema);
    router.push("/");
  }

  function recapture() {
    setFields([]);
    setAiExtractedFields([]);
    setMissingFields([]);
    setPendingImage(null);
    setMode("capture");
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col">
      <div className="px-5 pt-6 pb-1">
        <div className="flex items-center gap-2">
          <Link href="/" className="text-muted-2 hover:text-primary" aria-label="ホームへ戻る">
            ←
          </Link>
          <div className="text-xs font-medium text-muted">記録フォーマットを設定</div>
        </div>
        <div className="mt-1 text-[19px] font-semibold">{FACILITY_NAME}</div>
      </div>

      {mode === "current" && existingSchema && (
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-5">
          <p className="text-sm leading-relaxed text-[#4A493F]">
            現在、この施設ではこの記録用紙をもとに作成したフォーマットを使用しています。
          </p>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={existingSchema.sourceImage}
            alt="登録済みの記録用紙"
            className="w-full rounded-xl border border-border object-contain"
          />
          <p className="text-xs text-muted-2">
            抽出日時：{new Date(existingSchema.extractedAt).toLocaleString("ja-JP")}
          </p>

          <div className="mt-1 text-xs font-semibold tracking-wide text-muted">現在の記録項目</div>
          <div className="flex flex-col gap-2">
            {existingSchema.fields.map((field) => (
              <div key={field.id} className="flex items-center justify-between gap-3 rounded-[10px] border border-border bg-surface p-3">
                <span className="text-sm font-medium">{field.label}</span>
                <span className="text-[11px] text-muted-2">
                  {field.type}
                  {field.unit ? `（${field.unit}）` : ""}
                </span>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => {
              setExistingSchema(null);
              recapture();
            }}
            className="mt-2 w-full rounded-xl border border-border py-3.5 text-[15px] font-semibold text-primary hover:bg-primary-soft/40"
          >
            記録用紙を撮り直して設定し直す
          </button>
        </div>
      )}

      {mode === "capture" && (
        <div className="flex flex-1 flex-col gap-5 px-5 py-6">
          <p className="text-sm leading-relaxed text-[#4A493F]">
            普段お使いの記録用紙を撮影、またはアップロードしてください。体温・血圧・朝食/昼食/夕食の摂取量・
            水分摂取量・排便・入浴時間・特記事項の9項目をAIが読み取り、以降はその項目に合わせて音声記録が作成されます。
            未記入の用紙でも構いません。対応形式：jpg・jpeg・png
          </p>

          <button
            type="button"
            onClick={handleTapCapture}
            className="flex flex-1 min-h-[220px] flex-col items-center justify-center gap-3.5 rounded-2xl border-2 border-dashed border-[#C9C4B5] bg-surface"
          >
            <CameraIcon className="h-11 w-11" stroke="#8A897F" />
            <span className="text-[13px] text-muted-2">タップして撮影・またはアップロード</span>
          </button>

          {error && <p className="text-[13px] text-red-600">{error}</p>}

          <button
            type="button"
            onClick={handleTapCapture}
            className="w-full rounded-xl bg-primary py-4 text-[15px] font-semibold text-white hover:bg-primary-dark"
          >
            記録用紙を撮影・アップロードする
          </button>
        </div>
      )}

      {mode === "loading" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-5">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary-soft border-t-primary" />
          <p className="text-sm text-muted">写真から記録項目を読み取っています…</p>
        </div>
      )}

      {mode === "review" && (
        <div className="flex flex-1 flex-col gap-3.5 overflow-hidden px-5 pt-2 pb-5">
          <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3">
            <div className="flex h-14 w-11 shrink-0 items-center justify-center rounded-md bg-[#EFEDE6]">
              <FileIcon className="h-[18px] w-[18px]" stroke="#9B968A" />
            </div>
            <div className="flex flex-col gap-0.5">
              <div className="text-[13px] font-semibold">記録用紙から以下の項目を検出しました</div>
              <div className="text-xs text-muted">内容を確認し、必要に応じて修正してください</div>
            </div>
          </div>

          {missingFields.length > 0 && (
            <p className="rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs leading-relaxed text-amber-900">
              次の項目は自動検出できませんでした。用紙の内容を確認し、必要であれば項目名や別名を手動で修正してください：
              {" "}
              {missingFields
                .map((key) => REQUIRED_FIELD_DEFS.find((d) => d.key === key)?.label ?? key)
                .join("、")}
            </p>
          )}

          <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
            {fields.map((field) => (
              <div key={field.id} className="flex flex-col gap-2 rounded-[10px] border border-border bg-surface p-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`shrink-0 text-[15px] ${field.detected ? "text-primary" : "text-muted-2"}`}
                    aria-label={field.detected ? "検出済み" : "未検出"}
                  >
                    {field.key ? (field.detected ? "☑" : "☐") : "＋"}
                  </span>
                  <input
                    value={field.label}
                    onChange={(e) => updateField(field.id, { label: e.target.value })}
                    className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-sm font-medium focus:border-border focus:bg-[#FAF9F6] focus:outline-none"
                    aria-label="項目名"
                  />
                  <button
                    type="button"
                    onClick={() => removeField(field.id)}
                    className="px-2 text-lg leading-none text-[#B0AC9E] hover:text-red-500"
                    aria-label={`${field.label}を削除`}
                  >
                    ×
                  </button>
                </div>

                {field.key && !field.detected && (
                  <p className="text-[11px] text-amber-700">この用紙からは自動検出できませんでした。内容を確認してください。</p>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <input
                    list="field-type-options"
                    value={field.type}
                    onChange={(e) => updateField(field.id, { type: e.target.value })}
                    className="w-32 rounded-md border border-border bg-transparent px-1.5 py-1 text-[11px] text-muted-2 focus:outline-none"
                    aria-label="項目の種別"
                  />
                  <input
                    value={field.unit ?? ""}
                    onChange={(e) => updateField(field.id, { unit: e.target.value || undefined })}
                    placeholder="単位（例：℃, mL, mmHg）"
                    className="w-32 rounded-md border border-border bg-transparent px-1.5 py-1 text-[11px] text-muted-2 focus:outline-none"
                    aria-label="単位"
                  />
                  <label className="ml-auto flex items-center gap-1.5 text-[11px] text-muted-2">
                    <input
                      type="checkbox"
                      checked={field.required}
                      onChange={(e) => updateField(field.id, { required: e.target.checked })}
                    />
                    必須
                  </label>
                </div>

                {(field.kind === "select" || field.kind === "defecation") && (
                  <input
                    value={(field.options ?? []).join("、")}
                    onChange={(e) =>
                      updateField(field.id, {
                        options: e.target.value.split(/[、,]/).map((s) => s.trim()).filter(Boolean),
                      })
                    }
                    placeholder="選択肢（例：全量、8割、5割、未摂取）"
                    className="w-full rounded-md border border-border bg-transparent px-1.5 py-1 text-[11px] text-muted-2 focus:outline-none"
                    aria-label="選択肢"
                  />
                )}

                <input
                  value={(field.aliases ?? []).join("、")}
                  onChange={(e) =>
                    updateField(field.id, {
                      aliases: e.target.value.split(/[、,]/).map((s) => s.trim()).filter(Boolean),
                    })
                  }
                  placeholder="別名・表記ゆれ（例：飲水量、お茶）音声入力の判定に使われます"
                  className="w-full rounded-md border border-border bg-transparent px-1.5 py-1 text-[11px] text-muted-2 focus:outline-none"
                  aria-label="別名"
                />
              </div>
            ))}
            <button
              type="button"
              onClick={addField}
              className="rounded-[10px] border border-dashed border-[#C9C4B5] py-2.5 text-[13px] text-muted"
            >
              ＋ 項目を追加する
            </button>
          </div>

          <button
            type="button"
            onClick={confirm}
            disabled={fields.length === 0}
            className="mt-1 w-full rounded-xl bg-primary py-4 text-[15px] font-semibold text-white hover:bg-primary-dark disabled:opacity-40"
          >
            このフォーマットで保存
          </button>
          <button type="button" onClick={recapture} className="self-center text-xs text-muted-2 underline">
            別の用紙で撮り直す
          </button>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />
      <datalist id="field-type-options">
        <option value="自由記述" />
        <option value="数値" />
        <option value="数値（上/下）" />
        <option value="選択肢" />
        <option value="時刻" />
      </datalist>
    </div>
  );
}

function fileToBase64(file: File): Promise<{ base64: string; mediaType: string; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const [prefix, data] = result.split(",");
      const mediaType = prefix.match(/data:(.*);base64/)?.[1] || file.type || "image/jpeg";
      resolve({ base64: data, mediaType, dataUrl: result });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function CameraIcon({ className, stroke }: { className?: string; stroke: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function FileIcon({ className, stroke }: { className?: string; stroke: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.6">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}
