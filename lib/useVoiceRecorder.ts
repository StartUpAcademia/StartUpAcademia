"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SUBMIT_WORD, WAKE_WORD } from "./constants";
import type { SpeechRecognitionLike } from "@/types/speech-recognition";

export type VoiceStep = "unsupported" | "idle" | "standby" | "listening" | "processing" | "done" | "error";

interface UseVoiceRecorderOptions {
  onSubmit: (transcript: string) => Promise<void>;
}

/**
 * Web Speech API（Chromeの連続音声認識）で「記録開始」「送信」という発話ワードを
 * 常時監視し，開始〜送信までの発話内容を書き起こしとして確定するフック。
 * 無音検知やタイムアウトには依存しない（仕様書3章【P-2】）。
 */
export function useVoiceRecorder({ onSubmit }: UseVoiceRecorderOptions) {
  const [step, setStep] = useState<VoiceStep>("idle");
  const [liveText, setLiveText] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const stepRef = useRef<VoiceStep>("idle");
  const standbyBufferRef = useRef("");
  const listeningBufferRef = useRef("");
  const shouldKeepListeningRef = useRef(true);
  const hasStartedOnceRef = useRef(false);

  const setStepBoth = useCallback((next: VoiceStep) => {
    stepRef.current = next;
    setStep(next);
  }, []);

  const triggerSubmit = useCallback(
    async (rawTranscript: string) => {
      setStepBoth("processing");
      try {
        await onSubmit(rawTranscript.trim());
        setStepBoth("done");
      } catch (err) {
        console.error(err);
        setErrorMessage("記録の作成に失敗しました。もう一度お試しください。");
        setStepBoth("error");
      }
    },
    [onSubmit, setStepBoth]
  );

  const handleFinalChunk = useCallback(
    (chunk: string) => {
      if (stepRef.current === "standby") {
        standbyBufferRef.current += chunk;
        const idx = standbyBufferRef.current.lastIndexOf(WAKE_WORD);
        if (idx !== -1) {
          const remainder = standbyBufferRef.current.slice(idx + WAKE_WORD.length);
          standbyBufferRef.current = "";
          listeningBufferRef.current = remainder;
          setLiveText(remainder);
          setStepBoth("listening");
        }
        return;
      }

      if (stepRef.current === "listening") {
        listeningBufferRef.current += chunk;
        const idx = listeningBufferRef.current.indexOf(SUBMIT_WORD);
        if (idx !== -1) {
          const finalText = listeningBufferRef.current.slice(0, idx);
          listeningBufferRef.current = "";
          setLiveText(finalText.trim());
          void triggerSubmit(finalText);
        } else {
          setLiveText(listeningBufferRef.current);
        }
      }
    },
    [setStepBoth, triggerSubmit]
  );

  useEffect(() => {
    const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      setStepBoth("unsupported");
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "ja-JP";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognitionRef.current = recognition;
    shouldKeepListeningRef.current = true;

    recognition.onresult = (event) => {
      let finalChunk = "";
      let interimChunk = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript;
        if (result.isFinal) {
          finalChunk += transcript;
        } else {
          interimChunk += transcript;
        }
      }
      if (finalChunk) handleFinalChunk(finalChunk);
      if (interimChunk && stepRef.current === "listening") {
        setLiveText(listeningBufferRef.current + interimChunk);
      }
    };

    recognition.onstart = () => {
      hasStartedOnceRef.current = true;
      if (stepRef.current === "idle") setStepBoth("standby");
    };

    recognition.onerror = (event) => {
      if (event.error === "no-speech" || event.error === "aborted") return;
      if (event.error === "not-allowed" || event.error === "audio-capture") {
        setErrorMessage("マイクを利用できません。ブラウザのマイク許可を確認してください。");
        setStepBoth("error");
        shouldKeepListeningRef.current = false;
      }
    };

    recognition.onend = () => {
      if (shouldKeepListeningRef.current && hasStartedOnceRef.current) {
        try {
          recognition.start();
        } catch {
          // すでに開始中などは無視して継続
        }
      }
    };

    // 自動起動はしない: ページ読み込み時（ユーザー操作を伴わない呼び出し）では
    // ブラウザがマイク許可ダイアログを出さず静かに失敗することがあるため，
    // 最初の起動は必ずユーザーのタップ（enableMic）から行う。

    return () => {
      shouldKeepListeningRef.current = false;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.onstart = null;
      recognition.stop();
    };
  }, [handleFinalChunk, setStepBoth]);

  /** ユーザーのタップ（＝ユーザー操作）を起点にマイクを起動する。初回はこれが必須。 */
  const enableMic = useCallback(() => {
    if (!recognitionRef.current) return;
    if (stepRef.current !== "idle" && stepRef.current !== "error") return;
    setErrorMessage(null);
    shouldKeepListeningRef.current = true;
    try {
      recognitionRef.current.start();
    } catch {
      // 既に開始中の場合などは無視
    }
  }, []);

  const manualStart = useCallback(() => {
    if (stepRef.current === "idle" || stepRef.current === "error") {
      enableMic();
      return;
    }
    if (stepRef.current !== "standby") return;
    standbyBufferRef.current = "";
    listeningBufferRef.current = "";
    setLiveText("");
    setStepBoth("listening");
  }, [enableMic, setStepBoth]);

  const manualSubmit = useCallback(() => {
    if (stepRef.current !== "listening") return;
    void triggerSubmit(listeningBufferRef.current);
    listeningBufferRef.current = "";
  }, [triggerSubmit]);

  const reset = useCallback(() => {
    standbyBufferRef.current = "";
    listeningBufferRef.current = "";
    setLiveText("");
    setErrorMessage(null);
    setStepBoth("standby");
  }, [setStepBoth]);

  /** 開発用: マイクなしで発話内容をテキストで直接投入し，記録開始〜送信を一括シミュレートする。 */
  const debugSimulate = useCallback(
    (text: string) => {
      setLiveText(text);
      setStepBoth("listening");
      void triggerSubmit(text);
    },
    [setStepBoth, triggerSubmit]
  );

  return { step, liveText, errorMessage, manualStart, manualSubmit, reset, enableMic, debugSimulate };
}
