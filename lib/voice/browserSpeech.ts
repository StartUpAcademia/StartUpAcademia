import type { SpeechRecognitionLike } from '../../types/speech-recognition';

export type MicrophoneStatus = 'checking' | 'permission_required' | 'requesting' | 'starting' | 'listening' | 'speaking' | 'reconnecting' | 'error' | 'unsupported';
export interface SpeechService {
  autoStart(): Promise<void>;
  start(): void;
  speak(text: string): Promise<void>;
  dispose(): void;
}
export function createBrowserSpeech(callbacks: {
  status?(status: MicrophoneStatus): void;
  final(text: string): void; interim(text: string): void;
  error(message: string): void; listening(active: boolean): void; retry?(): void;
}): SpeechService | null {
  const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
  if (!Ctor || !window.speechSynthesis) return null;
  const recognition: SpeechRecognitionLike = new Ctor();
  recognition.lang = 'ja-JP'; recognition.continuous = true; recognition.interimResults = true;
  let enabled = false, speaking = false, running = false, disposed = false;
  let requesting = false, attempt = 0;
  let startupTimer: ReturnType<typeof setTimeout> | undefined;
  let permissionTimer: ReturnType<typeof setTimeout> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const status = (value: MicrophoneStatus) => { if (!disposed) callbacks.status?.(value); };
  const fail = (message: string) => {
    enabled = false;
    clearTimeout(timer); clearTimeout(startupTimer);
    callbacks.listening(false); status('error'); callbacks.error(message);
  };
  let stopped: (() => void) | undefined;
  let cancelSpeech: (() => void) | undefined;
  function start() {
    if (!enabled || speaking || running || disposed) return;
    status('starting');
    // start() returning does not mean recognition actually began. Wait for onstart.
    running = true;
    startupTimer = setTimeout(() => {
      if (disposed) return;
      fail('音声認識が開始されませんでした。ブラウザのマイク許可と通信接続を確認して、再接続してください。');
      recognition.abort(); running = false;
    }, 12000);
    try { recognition.start(); }
    catch { running = false; fail('音声認識を開始できません。マイクを再接続して、もう一度お試しください。'); }
  }
  async function requestMicrophone() {
    if (disposed || requesting || running || speaking) return;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      fail('マイクはHTTPSまたはlocalhostで利用できます。このPCでは http://localhost:3000 を開いてください。スマホからHTTPのIPアドレスで開く場合はHTTPSが必要です。'); return;
    }
    requesting = true;
    const currentAttempt = ++attempt;
    callbacks.error(''); status('requesting');
    permissionTimer = setTimeout(() => {
      if (disposed || currentAttempt !== attempt) return;
      attempt++; requesting = false;
      fail('マイク許可の応答を確認できません。アドレスバー付近の許可画面を確認して、許可後に再接続してください。');
    }, 20000);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // The recognition service acquires its own microphone; release this permission check.
      stream.getTracks().forEach(track => track.stop());
      if (disposed || currentAttempt !== attempt) return;
      enabled = true; start();
    } catch (error) {
      if (disposed || currentAttempt !== attempt) return;
      const name = (error as { name?: string }).name;
      const messages: Record<string, string> = {
        NotAllowedError: 'マイクが許可されていません。ブラウザのサイト設定と、Macの「システム設定 → プライバシーとセキュリティ → マイク」を確認してください。',
        NotFoundError: 'マイクが見つかりません。イヤホン・マイクの接続を確認してください。',
        NotReadableError: 'マイクにアクセスできません。他のアプリの使用状況とOSのマイク設定を確認してください。',
      };
      fail(messages[name ?? ''] ?? 'マイクへの接続に失敗しました。端末とブラウザのマイク設定を確認してください。');
    } finally {
      if (currentAttempt === attempt) { requesting = false; clearTimeout(permissionTimer); }
    }
  }
  recognition.onstart = () => {
    clearTimeout(startupTimer);
    if (disposed || !enabled || speaking) { recognition.abort(); return; }
    callbacks.error(''); callbacks.listening(true); status('listening');
  };
  recognition.onend = () => {
    clearTimeout(startupTimer);
    running = false; callbacks.listening(false); stopped?.(); stopped = undefined;
    if (enabled && !speaking && !disposed) { status('reconnecting'); timer = setTimeout(start, 350); }
  };
  recognition.onresult = event => {
    if (speaking || disposed) return;
    let final = '', interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) final += result[0].transcript; else interim += result[0].transcript;
    }
    callbacks.interim(interim);
    if (final.trim()) callbacks.final(final.trim());
  };
  recognition.onerror = event => {
    if (event.error === 'aborted' || disposed) return;
    if (event.error === 'no-speech') { callbacks.error('聞き取れませんでした。もう一度話してください。'); callbacks.retry?.(); return; }
    enabled = false; clearTimeout(startupTimer); callbacks.listening(false); status('error');
    const messages: Record<string, string> = {
      'not-allowed': 'マイク権限が拒否されました。ブラウザのサイト設定でマイクを許可し、再度有効にしてください。',
      'service-not-allowed': '音声認識の利用が許可されていません。ブラウザの設定を確認してください。',
      'audio-capture': 'マイクが見つかりません。イヤホン・マイクの接続を確認してください。',
      network: '音声認識の通信に失敗しました。接続を確認し、再度マイクを有効にしてください。',
    };
    callbacks.error(messages[event.error] ?? '音声認識に失敗しました。マイクを再度有効にして話してください。');
  };
  return {
    async autoStart() {
      if (disposed) return;
      status('checking');
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) { await requestMicrophone(); return; }
      try {
        const permission = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        if (disposed || requesting || running) return;
        if (permission.state === 'granted') await requestMicrophone();
        else if (permission.state === 'denied') fail('マイクがブロックされています。ブラウザのサイト設定でマイクを許可し、再接続してください。');
        else status('permission_required');
      } catch {
        // Some browsers cannot query microphone permission. Use an explicit user gesture.
        if (!disposed && !requesting && !running) status('permission_required');
      }
    },
    start() { void requestMicrophone(); },
    async speak(text) {
      if (disposed) return;
      speaking = true; status('speaking'); clearTimeout(timer); clearTimeout(startupTimer); callbacks.interim('');
      if (running) await new Promise<void>(resolve => {
        const timeout = setTimeout(resolve, 1000);
        stopped = () => { clearTimeout(timeout); resolve(); };
        recognition.abort();
      });
      if (disposed) return;
      await new Promise<void>(resolve => {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'ja-JP'; utterance.rate = 1;
        const finish = () => { clearTimeout(timeout); cancelSpeech = undefined; resolve(); };
        const timeout = setTimeout(() => { window.speechSynthesis.cancel(); callbacks.error('音声案内を再生できませんでした。画面の案内を確認してください。'); finish(); }, 45000);
        cancelSpeech = finish;
        utterance.onend = finish;
        utterance.onerror = () => { callbacks.error('音声案内を再生できませんでした。画面の案内を確認してください。'); finish(); };
        window.speechSynthesis.speak(utterance);
      });
      speaking = false;
      if (!disposed) { status(enabled ? 'reconnecting' : 'permission_required'); if (enabled) timer = setTimeout(start, 300); }
    },
    dispose() {
      disposed = true; enabled = false; attempt++; clearTimeout(permissionTimer); clearTimeout(startupTimer); clearTimeout(timer); stopped?.(); cancelSpeech?.();
      recognition.onend = null; recognition.onresult = null; recognition.onerror = null; recognition.onstart = null;
      recognition.abort(); window.speechSynthesis.cancel();
    },
  };
}
