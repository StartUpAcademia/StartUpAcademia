"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useVoiceRecorder, VoiceStep } from "@/lib/useVoiceRecorder";
import { CURRENT_RESIDENT, CURRENT_STAFF, FACILITY_NAME } from "@/lib/constants";
import { addRecord, getFormatFields } from "@/lib/storage";
import { CareRecordFieldValue } from "@/lib/types";

const STEP_CONTENT: Record<
  Exclude<VoiceStep, "unsupported" | "error">,
  { label: string; hint: string; ringBg: string; coreBg: string; pulse: boolean }
> = {
  idle: {
    label: "マイクを有効にしてください",
    hint: "タップしてマイクへのアクセスを許可します",
    ringBg: "#EFEDE6",
    coreBg: "#FFFFFF",
    pulse: false,
  },
  standby: {
    label: "待機中",
    hint: "「記録開始」と話しかけてください",
    ringBg: "#EFEDE6",
    coreBg: "#FFFFFF",
    pulse: false,
  },
  listening: {
    label: "聞き取り中",
    hint: "「送信」と話しかけると記録を作成します",
    ringBg: "#DCEBE9",
    coreBg: "#2B6E68",
    pulse: true,
  },
  processing: {
    label: "記録を作成中",
    hint: "フォーマットに合わせて整理しています",
    ringBg: "#EFEDE6",
    coreBg: "#B8792B",
    pulse: false,
  },
  done: {
    label: "記録を作成しました",
    hint: "確認画面でご確認ください",
    ringBg: "#DCEBE9",
    coreBg: "#3F7D5C",
    pulse: false,
  },
};

export default function MainPage() {
  const router = useRouter();
  const [debugText, setDebugText] = useState("");
  const [showDebug, setShowDebug] = useState(false);

  const handleSubmitTranscript = useCallback(async (rawTranscript: string) => {
    const fields = getFormatFields();
    const res = await fetch("/api/structure-record", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ transcript: rawTranscript, fields }),
    });
    if (!res.ok) throw new Error("構造化APIの呼び出しに失敗しました");
    const data = await res.json();
    const structuredFields = data.fields as CareRecordFieldValue[];

    addRecord({
      id: `record-${Date.now()}`,
      residentId: CURRENT_RESIDENT.id,
      staffId: CURRENT_STAFF.id,
      createdAt: new Date().toISOString(),
      rawTranscript,
      fields: structuredFields,
    });
  }, []);

  const { step, liveText, errorMessage, manualStart, manualSubmit, reset, enableMic, debugSimulate } =
    useVoiceRecorder({ onSubmit: handleSubmitTranscript });

  function handleCircleClick() {
    if (step === "idle") enableMic();
    else if (step === "standby") manualStart();
    else if (step === "listening") manualSubmit();
    else if (step === "done") reset();
  }

  if (step === "unsupported") {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-sm text-muted">
          このブラウザは音声認識（Web Speech API）に対応していません。
          Google Chromeでこのページを開いてください。
        </p>
        <Link href="/" className="text-sm text-primary underline">
          ホームに戻る
        </Link>
      </div>
    );
  }

  const content = step === "error" ? null : STEP_CONTENT[step];

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col">
      <header className="flex items-center justify-between px-5 pt-6 pb-2.5">
        <div className="flex flex-col gap-0.5">
          <div className="text-xs font-medium text-muted">{FACILITY_NAME}</div>
          <div className="text-lg font-semibold">記録アシスタント</div>
        </div>
        <Link
          href="/"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary"
          aria-label="ホームへ戻る"
        >
          ×
        </Link>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-6.5 px-7">
        {step === "error" ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <p className="text-sm text-red-600">{errorMessage}</p>
            <button
              type="button"
              onClick={enableMic}
              className="rounded-lg border border-border px-4 py-2 text-sm text-primary"
            >
              もう一度試す
            </button>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={handleCircleClick}
              aria-label="記録の状態"
              className="flex h-44 w-44 items-center justify-center rounded-full transition-colors duration-300"
              style={{
                background: content!.ringBg,
                boxShadow: content!.pulse ? "0 0 0 0 rgba(43,110,104,0.35)" : undefined,
                animation: content!.pulse ? "pulse-ring 1.6s infinite" : undefined,
              }}
            >
              <span
                className="flex h-32 w-32 items-center justify-center rounded-full transition-colors duration-300"
                style={{ background: content!.coreBg }}
              >
                <StepIcon step={step} />
              </span>
            </button>
            <div className="flex flex-col items-center gap-1.5 text-center">
              <div className="text-[19px] font-semibold">{content!.label}</div>
              <div className="text-sm leading-relaxed text-muted">{content!.hint}</div>
            </div>
          </>
        )}
      </main>

      {(step === "listening" || step === "processing" || step === "done") && (
        <div className="mx-5 mb-4 flex flex-col gap-2 rounded-[14px] border border-border bg-surface p-4">
          <div className="text-[11px] font-semibold tracking-wide text-muted">聞き取り内容</div>
          <div className="min-h-6 text-sm leading-relaxed">{liveText || "（発話を待っています）"}</div>
        </div>
      )}

      {step === "done" && (
        <div className="px-5 pb-2">
          <button
            type="button"
            onClick={() => router.push("/confirm")}
            className="w-full rounded-xl bg-primary py-4 text-[15px] font-semibold text-white hover:bg-primary-dark"
          >
            確認画面へ
          </button>
        </div>
      )}

      <div className="flex flex-col items-center gap-2 pb-4">
        {step === "idle" && (
          <button type="button" onClick={enableMic} className="text-[13px] text-muted-2 underline">
            タップしてマイクを有効にする
          </button>
        )}
        {step === "standby" && (
          <button type="button" onClick={manualStart} className="text-[13px] text-muted-2 underline">
            タップして手動で開始する
          </button>
        )}
        {step === "listening" && (
          <button type="button" onClick={manualSubmit} className="text-[13px] text-muted-2 underline">
            タップして送信する
          </button>
        )}
        {step === "done" && (
          <button type="button" onClick={reset} className="text-[13px] text-muted-2 underline">
            続けてこの入居者の記録を追加する
          </button>
        )}

        <button
          type="button"
          onClick={() => setShowDebug((v) => !v)}
          className="mt-1 text-[11px] text-[#C9C4B5]"
        >
          {showDebug ? "開発用パネルを閉じる" : "開発用: テキストで発話をシミュレート"}
        </button>
        {showDebug && (
          <div className="flex w-[calc(100%-40px)] flex-col gap-2 rounded-lg border border-dashed border-[#C9C4B5] p-3">
            <textarea
              value={debugText}
              onChange={(e) => setDebugText(e.target.value)}
              placeholder="例: 体温は36度5分、血圧は128の76、食事は8割摂取。入浴中に右足の発赤あり。"
              className="h-16 w-full resize-none rounded-md border border-border p-2 text-xs"
            />
            <button
              type="button"
              disabled={!debugText.trim() || step === "processing"}
              onClick={() => {
                debugSimulate(debugText);
                setDebugText("");
              }}
              className="rounded-md bg-[#B0AC9E] py-2 text-xs font-semibold text-white disabled:opacity-40"
            >
              この内容で「記録開始→送信」をシミュレート
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse-ring {
          0% { box-shadow: 0 0 0 0 rgba(43,110,104,0.35); }
          70% { box-shadow: 0 0 0 22px rgba(43,110,104,0); }
          100% { box-shadow: 0 0 0 0 rgba(43,110,104,0); }
        }
      `}</style>
    </div>
  );
}

function StepIcon({ step }: { step: VoiceStep }) {
  if (step === "processing") {
    return (
      <svg className="h-9 w-9 animate-spin" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round">
        <path d="M21 12a9 9 0 1 1-9-9" />
      </svg>
    );
  }
  if (step === "done") {
    return (
      <svg className="h-11 w-11" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    );
  }
  const stroke = step === "listening" ? "#FFFFFF" : "#9B968A";
  return (
    <svg className="h-10 w-10" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 12v-2a6 6 0 0 1 12 0v2" />
      <rect x="4" y="12" width="4" height="7" rx="2" />
      <rect x="16" y="12" width="4" height="7" rx="2" />
    </svg>
  );
}
