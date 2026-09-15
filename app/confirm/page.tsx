"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ALL_RESIDENTS, CURRENT_RESIDENT } from "@/lib/constants";
import { getFormatFields, getDraft, commitDraft } from "@/lib/storage";
import VoiceRecordCard, { useVoiceWorkspace } from "../components/VoiceRecordCard";
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
  const voice = useVoiceWorkspace();
  const saving = useRef(false);
  const [error, setError] = useState("");
  const busy = ["CONFIRMING", "SAVING", "WAKE_DETECTED", "WAITING_FOR_RESIDENT"].includes(voice.snapshot.state);
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
    const refresh = () => {
      const draft = getDraft(residentId);
      setMerged(Object.fromEntries((draft?.fields || []).filter(f => !f.isMissing).map(f => [f.fieldId, {value:f.value,recordId:draft!.id}])));
      setTranscripts(draft ? [{createdAt:draft.createdAt,text:draft.rawTranscript}] : []);
    };
    refresh();
    window.addEventListener('care:draft', refresh);
    setShowOriginal(false);
    setSaved(false);
    return () => window.removeEventListener('care:draft', refresh);
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

      <div className="px-5 pb-3"><VoiceRecordCard /></div>
      <p className="px-5 pb-3 text-xs text-muted">「はい」は項目への反映です。下の「保存する」で初めて入居者ごとの記録に追加します。</p>
      {(
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
                  <button type="button" disabled={busy} onClick={() => voice.start(resident)} className="w-fit rounded-xl bg-primary px-4 py-3 text-white disabled:opacity-40">話しかけて入力する</button>
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

      {error && <p role="alert" className="px-5 text-red-600">{error}</p>}
      {(
        <div className="px-5 pt-2 pb-6">
          {missingRequiredCount > 0 && (
            <p className="mb-2 text-center text-xs text-muted-2">
              未入力の必須項目が {missingRequiredCount} 件あります
            </p>
          )}
          <button
            type="button"
            disabled={!hasAnyRecord || busy || saved}
            onClick={() => {
              if (saving.current || busy || !hasAnyRecord) return;
              saving.current = true;
              try { commitDraft(residentId); setSaved(true); voice.finish(); router.push('/residents'); }
              catch { setError('保存できませんでした。下書きは残っています。再度お試しください。'); saving.current = false; }
            }}
            className="w-full rounded-xl bg-primary py-4 text-[15px] font-semibold text-white hover:bg-primary-dark disabled:opacity-40"
          >
            {saved ? "保存しました" : "保存する"}
          </button>
        </div>
      )}
    </div>
  );
}
