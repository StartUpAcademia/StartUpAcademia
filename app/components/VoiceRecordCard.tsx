"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { Resident } from '@/lib/types';
import { ALL_RESIDENTS, CURRENT_STAFF } from '@/lib/constants';
import { appendDraft, getFormatFields } from '@/lib/storage';
import { VoiceSession, type Snapshot } from '@/lib/voice/session';
import { createBrowserSpeech, type SpeechService, type MicrophoneStatus } from '@/lib/voice/browserSpeech';

const MIC_LABELS: Record<MicrophoneStatus, string> = {
  checking: 'マイクの許可状態を確認しています…',
  permission_required: '初回はマイクの許可が必要です。許可済みなら次回から自動で待機します。',
  requesting: 'マイクに接続しています。許可画面が出た場合は「許可」を選んでください。',
  starting: '音声認識に接続しています…',
  listening: '● マイク有効・聞き取り中',
  speaking: '音声案内中（聞き取りは一時停止）',
  reconnecting: 'マイクに再接続しています…',
  error: 'マイクまたは音声認識に接続できません。下の案内を確認してください。',
  unsupported: 'この環境では音声入力を利用できません。',
};

const VoiceContext = createContext<{panel: ReactNode; snapshot: Snapshot; start: (resident: Resident) => void; finish: () => void} | null>(null);
export function useVoiceWorkspace() { const value = useContext(VoiceContext); if (!value) throw new Error('VoiceProvider required'); return value; }
export default function VoiceRecordCard() { return useVoiceWorkspace().panel; }
export function VoiceProvider({children}: {children: ReactNode}) {
  const router = useRouter();
  const pathname = usePathname();
  const voiceRouteActive = pathname === '/' || pathname === '/confirm';
  const [snapshot, setSnapshot] = useState<Snapshot>({ state: 'IDLE', message: '「Hey Care」または「ヘイケア」と話しかけてください', saved: false, error: '' });
  const [micStatus, setMicStatus] = useState<MicrophoneStatus>('checking');
  const [error, setError] = useState('');
  const [live, setLive] = useState('');
  const [simulation, setSimulation] = useState('');
  const session = useRef<VoiceSession | null>(null);
  const service = useRef<SpeechService | null>(null);
  useEffect(() => {
    let mounted = true;
    const speech = createBrowserSpeech({
      final(text) { setError(''); void session.current?.hear(text); },
      interim: setLive, error: setError, listening() {}, status: setMicStatus,
      retry() { void session.current?.retry(); },
    });
    service.current = speech;
    session.current = new VoiceSession({ residents: ALL_RESIDENTS, staffId: CURRENT_STAFF.id,
      fields: getFormatFields, append: appendDraft,
      selected: resident => router.push('/confirm?resident=' + encodeURIComponent(resident.id)),
      speak: text => speech?.speak(text) ?? Promise.resolve(),
      update: next => { if (mounted) setSnapshot(next); },
    });
    queueMicrotask(() => {
      if (!mounted) return;
      if (!speech) { setMicStatus('unsupported'); setError(window.isSecureContext ? 'このブラウザは音声認識・読み上げに対応していません。対応するブラウザで開いてください。' : 'マイクを利用するにはHTTPSまたはlocalhostで開いてください。'); }
    });
    return () => { mounted = false; speech?.dispose(); service.current = null; session.current = null; };
  }, [router]);
  useEffect(() => {
    const speech = service.current;
    if (!speech) return;
    const syncActivity = () => {
      const shouldListen = voiceRouteActive && document.visibilityState === 'visible';
      speech.setActive(shouldListen);
      if (shouldListen) void speech.autoStart();
    };
    const suspend = () => speech.setActive(false);
    syncActivity();
    document.addEventListener('visibilitychange', syncActivity);
    window.addEventListener('pagehide', suspend);
    window.addEventListener('pageshow', syncActivity);
    return () => {
      document.removeEventListener('visibilitychange', syncActivity);
      window.removeEventListener('pagehide', suspend);
      window.removeEventListener('pageshow', syncActivity);
    };
  }, [voiceRouteActive]);
  useEffect(() => {
    if (!snapshot.saved) return;
    const timer = setTimeout(() => session.current?.clearSaved(), 2500);
    return () => clearTimeout(timer);
  }, [snapshot.saved]);
  const active = snapshot.state !== 'IDLE';
  const enable = () => { if (!service.current) { setError('このブラウザは音声認識・読み上げに対応していません。対応するブラウザで開いてください。'); return; } setError(''); service.current.start(); };
  const panel = (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-4 rounded-[18px] bg-primary px-5.5 py-6.5 text-white" aria-live="polite" data-voice-state={snapshot.state}>
        <span className="flex h-13 w-13 items-center justify-center rounded-full bg-white/15" aria-hidden="true"><svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 12v-2a6 6 0 0 1 12 0v2" /><rect x="4" y="12" width="4" height="7" rx="2" /><rect x="16" y="12" width="4" height="7" rx="2" /></svg></span>
        <h2 className="text-[17px] font-semibold">{active ? '● 音声記録中' : '記録を開始する'}</h2>
        {snapshot.resident && <p className="font-semibold">記録対象：{snapshot.resident.name}さん</p>}
        <p className="text-[13px] leading-relaxed text-white/85">{snapshot.message}</p>
        <p className="text-xs text-white/85">{MIC_LABELS[micStatus]}</p>
        {(micStatus === 'permission_required' || micStatus === 'error') ? <button type="button" onClick={enable} className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-primary">{micStatus === 'error' ? 'マイクに再接続する' : 'マイクを許可して開始'}</button> : null}
        {active && live && <div className="rounded-lg bg-white/15 p-3 text-sm">聞き取り中：{live}</div>}
        {snapshot.draft && <div className="rounded-xl bg-white p-4 text-primary-dark">
          <p className="font-semibold">{snapshot.resident?.name}</p>
          <p className="mt-2 text-sm">{snapshot.draft.category}</p>
          <p className="text-lg font-semibold">{snapshot.draft.value}</p>
          <p className="mt-2 text-sm">発話：{snapshot.draft.transcript}</p>
          <p className="mt-2 text-xs">{new Date(snapshot.draft.createdAt).toLocaleString('ja-JP')} ・ 記録者：{CURRENT_STAFF.name}</p>
          <p className="mt-3 text-sm">この内容を確認画面に保存しますか？「はい」で項目に反映（未保存）。「訂正」「違います」で修正。</p>
        </div>}
        {snapshot.saved && <p role="status" className="rounded-lg bg-white/15 p-3 font-semibold">✓ 確認画面に反映しました（未保存）</p>}
        {active && <p className="text-xs text-white/85">「END」「エンド」で終了します</p>}
      </div>
      {(error || snapshot.error) && <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{snapshot.error || error}</p>}
      {!active && <Link href="/main" className="text-center text-xs text-muted underline">従来の記録画面を開く</Link>}
      {process.env.NODE_ENV === 'development' && <details className="text-xs text-muted">
        <summary>開発用：発話シミュレーション</summary>
        <form className="mt-2 flex gap-2" onSubmit={event => { event.preventDefault(); void session.current?.hear(simulation); setSimulation(''); }}>
          <input aria-label="発話テキスト" value={simulation} onChange={event => setSimulation(event.target.value)} className="min-w-0 flex-1 rounded border border-border p-2" />
          <button className="rounded border border-border p-2" type="submit">発話</button>
        </form>
      </details>}
    </section>
  );
  return <VoiceContext.Provider value={{panel, snapshot, start: resident => { session.current?.select(resident); enable(); }, finish: () => session.current?.finish()}}>{children}</VoiceContext.Provider>;
}
