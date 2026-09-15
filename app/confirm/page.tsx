"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ALL_RESIDENTS, CURRENT_RESIDENT } from "@/lib/constants";
import { getFormatFields, getMergedFieldValues, getRawTranscripts } from "@/lib/storage";
import { FormatField } from "@/lib/types";

export default function ConfirmPage() {
  return (
    <Suspense fallback={null}>
      <ConfirmPageContent />
    </Suspense>
  );
}

function ConfirmPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const residentId = searchParams.get("resident") || CURRENT_RESIDENT.id;
  const resident = ALL_RESIDENTS.find((r) => r.id === residentId) ?? CURRENT_RESIDENT;

  const [fields, setFields] = useState<FormatField[]>([]);
  const [merged, setMerged] = useState<Record<string, { value: string; recordId: string }>>({});
  const [transcripts, setTranscripts] = useState<{ createdAt: string; text: string }[]>([]);
  const [showOriginal, setShowOriginal] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setFields(getFormatFields().slice().sort((a, b) => a.order - b.order));
    setMerged(getMergedFieldValues(residentId));
    setTranscripts(getRawTranscripts(residentId));
    setShowOriginal(false);
    setSaved(false);
  }, [residentId]);

  const hasAnyRecord = transcripts.length > 0;
  const missingRequiredCount = fields.filter((f) => f.required && !merged[f.id]?.value).length;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col">
      <div className="px-5 pt-6 pb-3.5">
        <div className="flex items-center gap-2">
          <Link href="/residents" className="text-muted-2 hover:text-primary" aria-label="入居者一覧へ戻る">
            ←
          </Link>
          <div className="text-[19px] font-semibold">記録内容の確認</div>
        </div>
        <div className="mt-2.5 inline-flex items-center gap-2 self-start rounded-[10px] border border-border bg-surface px-3 py-2">
          <div className="flex h-6.5 w-6.5 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">
            {resident.name.slice(0, 1)}
          </div>
          <div className="text-[13px] font-medium">
            {resident.name} 様 ・ {resident.roomNumber}号室
          </div>
        </div>
      </div>

      {!hasAnyRecord ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-sm text-muted">まだ音声記録がありません。</p>
          <Link href="/main" className="text-sm text-primary underline">
            記録を開始する
          </Link>
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto px-5 pb-2">
          {fields.map((field) => {
            const entry = merged[field.id];
            const isFilled = Boolean(entry?.value);
            const isMissingRequired = field.required && !isFilled;

            if (isMissingRequired) {
              return (
                <div
                  key={field.id}
                  className="flex flex-col gap-2.5 rounded-xl border p-3.5"
                  style={{ background: "var(--color-warn-bg)", borderColor: "var(--color-warn-border)" }}
                >
                  <div className="text-xs font-semibold" style={{ color: "var(--color-warn-text)" }}>
                    {field.label} ・ 未入力
                  </div>
                  <div className="text-[13px] leading-relaxed" style={{ color: "var(--color-warn-text-2)" }}>
                    もう一度話しかけて，この項目を埋めてください
                  </div>
                  {resident.id === CURRENT_RESIDENT.id && (
                    <Link
                      href="/main"
                      className="inline-flex w-fit items-center gap-1.5 rounded-[10px] px-3.5 py-2.5 text-[13px] font-semibold text-white"
                      style={{ background: "var(--color-warn-accent)" }}
                    >
                      <MicIcon className="h-3.5 w-3.5" stroke="#FFFFFF" />
                      話しかけて入力する
                    </Link>
                  )}
                </div>
              );
            }

            const isLongText = field.type.includes("自由記述") || (entry?.value.length ?? 0) > 12;

            if (isLongText) {
              return (
                <div key={field.id} className="flex flex-col gap-1.5 rounded-xl border border-border bg-surface p-3.5">
                  <div className="text-xs text-muted">
                    {field.label}
                    {!field.required && !isFilled && <span className="ml-1 text-[10px] text-muted-2">（任意・未入力）</span>}
                  </div>
                  <div className="text-sm leading-relaxed">{isFilled ? entry!.value : "―"}</div>
                </div>
              );
            }

            return (
              <div
                key={field.id}
                className="flex items-baseline justify-between gap-3 rounded-xl border border-border bg-surface p-3.5"
              >
                <div className="shrink-0 text-xs text-muted">
                  {field.label}
                  {!field.required && !isFilled && <span className="ml-1 text-[10px] text-muted-2">（任意・未入力）</span>}
                </div>
                <div className="text-right text-[15px] font-medium">{isFilled ? entry!.value : "―"}</div>
              </div>
            );
          })}

          <button
            type="button"
            onClick={() => setShowOriginal((v) => !v)}
            className="self-start py-1 text-xs text-primary underline"
          >
            元の発話内容を見る
          </button>
          {showOriginal && (
            <div className="mb-2 flex flex-col gap-2">
              {transcripts.map((t, i) => (
                <div key={i} className="rounded-[10px] bg-[#F1EFE9] px-3.5 py-3 text-xs leading-relaxed text-muted">
                  <div className="mb-1 text-[10px] text-muted-2">
                    {new Date(t.createdAt).toLocaleString("ja-JP")}
                  </div>
                  「{t.text}」
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {hasAnyRecord && (
        <div className="px-5 pt-2 pb-6">
          {missingRequiredCount > 0 && (
            <p className="mb-2 text-center text-xs text-muted-2">
              未入力の必須項目が {missingRequiredCount} 件あります
            </p>
          )}
          <button
            type="button"
            onClick={() => {
              setSaved(true);
              setTimeout(() => router.push("/"), 900);
            }}
            className="w-full rounded-xl bg-primary py-4 text-[15px] font-semibold text-white hover:bg-primary-dark"
          >
            {saved ? "保存しました" : "保存する"}
          </button>
        </div>
      )}
    </div>
  );
}

function MicIcon({ className, stroke }: { className?: string; stroke: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 12v-2a6 6 0 0 1 12 0v2" />
      <rect x="4" y="12" width="4" height="7" rx="2" />
      <rect x="16" y="12" width="4" height="7" rx="2" />
    </svg>
  );
}
