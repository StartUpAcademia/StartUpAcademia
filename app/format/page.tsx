"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FormatField } from "@/lib/types";
import { saveFormatFields } from "@/lib/storage";

type Mode = "capture" | "loading" | "review";

let nextLocalId = 1000;

export default function FormatPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>("capture");
  const [fields, setFields] = useState<FormatField[]>([]);
  const [error, setError] = useState<string | null>(null);

  function handleTapCapture() {
    fileInputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setError(null);
    setMode("loading");

    try {
      const { base64, mediaType } = await fileToBase64(file);
      const res = await fetch("/api/extract-format", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mediaType }),
      });
      if (!res.ok) throw new Error("抽出APIの呼び出しに失敗しました");
      const data = await res.json();
      const extracted = data.fields as { label: string; type: string }[];

      setFields(
        extracted.map((f, i) => ({
          id: `field-${nextLocalId++}`,
          label: f.label,
          type: f.type,
          required: true,
          order: i,
        }))
      );
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
      { id: `field-${nextLocalId++}`, label: "新しい項目", type: "自由記述", required: false, order: prev.length },
    ]);
  }

  function confirm() {
    const ordered = fields.map((f, i) => ({ ...f, order: i }));
    saveFormatFields(ordered);
    router.push("/");
  }

  function recapture() {
    setFields([]);
    setMode("capture");
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col">
      <div className="px-5 pt-6 pb-1">
        <div className="flex items-center gap-2">
          <Link href="/" className="text-muted-2 hover:text-primary" aria-label="ホームへ戻る">
            ←
          </Link>
          <div className="text-xs font-medium text-muted">初期設定・1回のみ</div>
        </div>
        <div className="mt-1 text-[19px] font-semibold">記録フォーマットの登録</div>
      </div>

      {mode === "capture" && (
        <div className="flex flex-1 flex-col gap-5 px-5 py-6">
          <p className="text-sm leading-relaxed text-[#4A493F]">
            普段お使いの記録用紙を撮影してください。項目をAIが読み取り，以降はその項目に合わせて音声記録が作成されます。
          </p>

          <button
            type="button"
            onClick={handleTapCapture}
            className="flex flex-1 min-h-[220px] flex-col items-center justify-center gap-3.5 rounded-2xl border-2 border-dashed border-[#C9C4B5] bg-surface"
          >
            <CameraIcon className="h-11 w-11" stroke="#8A897F" />
            <span className="text-[13px] text-muted-2">タップして撮影する</span>
          </button>

          {error && <p className="text-[13px] text-red-600">{error}</p>}

          <button
            type="button"
            onClick={handleTapCapture}
            className="w-full rounded-xl bg-primary py-4 text-[15px] font-semibold text-white hover:bg-primary-dark"
          >
            記録用紙を撮影する
          </button>
        </div>
      )}

      {mode === "loading" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-5">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary-soft border-t-primary" />
          <p className="text-sm text-muted">写真から項目を読み取っています…</p>
        </div>
      )}

      {mode === "review" && (
        <div className="flex flex-1 flex-col gap-3.5 overflow-hidden px-5 pt-2 pb-5">
          <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3">
            <div className="flex h-14 w-11 shrink-0 items-center justify-center rounded-md bg-[#EFEDE6]">
              <FileIcon className="h-[18px] w-[18px]" stroke="#9B968A" />
            </div>
            <div className="flex flex-col gap-0.5">
              <div className="text-[13px] font-semibold">撮影が完了しました</div>
              <div className="text-xs text-muted">記入用紙のイメージを読み取りました</div>
            </div>
          </div>

          <div className="mt-1 text-xs font-semibold tracking-wide text-muted">AIが読み取った記入項目</div>

          <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
            {fields.map((field) => (
              <div key={field.id} className="flex flex-col gap-2 rounded-[10px] border border-border bg-surface p-3">
                <div className="flex items-center gap-2">
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
                <div className="flex items-center gap-2">
                  <input
                    list="field-type-options"
                    value={field.type}
                    onChange={(e) => updateField(field.id, { type: e.target.value })}
                    className="w-36 rounded-md border border-border bg-transparent px-1.5 py-1 text-[11px] text-muted-2 focus:outline-none"
                    aria-label="項目の種別"
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
            この内容で設定を完了する
          </button>
          <button type="button" onClick={recapture} className="self-center text-xs text-muted-2 underline">
            別の用紙で撮り直す
          </button>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
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

function fileToBase64(file: File): Promise<{ base64: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const [prefix, data] = result.split(",");
      const mediaType = prefix.match(/data:(.*);base64/)?.[1] || file.type || "image/jpeg";
      resolve({ base64: data, mediaType });
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
