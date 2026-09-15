import type { SpeechRecognitionLike } from '../../types/speech-recognition';

export type MicrophoneStatus = 'checking' | 'permission_required' | 'requesting' | 'starting' | 'listening' | 'speaking' | 'reconnecting' | 'error' | 'unsupported';
export interface SpeechService {
  autoStart(): Promise<void>;
  start(): void;
  setActive(active: boolean): void;
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
  // iOS can reject a new recognition session that is started without another tap.
  // Keep the session that was opened by the user's tap alive while guidance is spoken.
  const keepRecognitionDuringSpeech = /iP(?:hone|ad|od)/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let active = true, enabled = false, speaking = false, running = false, disposed = false;
  let speechUnlocked = !keepRecognitionDuringSpeech;
  let ignoreResultsUntil = 0;
  let startupTimer: ReturnType<typeof setTimeout> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const isVisible = () => typeof document === 'undefined' || document.visibilityState === 'visible';
  const canRun = () => active && isVisible();
  const status = (value: MicrophoneStatus) => { if (!disposed) callbacks.status?.(value); };
  const clearRecognitionTimers = () => {
    clearTimeout(timer); clearTimeout(startupTimer);
    timer = undefined; startupTimer = undefined;
  };
  const resolveStopped = () => {
    const complete = stopped;
    stopped = undefined;
    complete?.();
  };
  const stopRecognition = () => {
    clearRecognitionTimers();
    const shouldAbort = running;
    running = false;
    callbacks.listening(false);
    resolveStopped();
    if (shouldAbort) {
      try { recognition.abort(); } catch { /* The browser already stopped recognition. */ }
    }
  };
  const fail = (message: string) => {
    enabled = false;
    stopRecognition();
    status('error'); callbacks.error(message);
  };
  const unlockSpeech = () => {
    if (speechUnlocked) return;
    try {
      // WebKit removes its speech-playback gesture restriction when speak() is
      // called synchronously from the same tap that starts recognition.
      const unlock = new SpeechSynthesisUtterance('');
      unlock.volume = 0;
      window.speechSynthesis.speak(unlock);
      window.speechSynthesis.cancel();
      speechUnlocked = true;
    } catch (error) {
      console.warn('SpeechSynthesis unlock failed', error);
    }
  };
  let stopped: (() => void) | undefined;
  let cancelSpeech: (() => void) | undefined;
  function start() {
    if (!enabled || speaking || running || disposed || !canRun()) return;
    if (!window.isSecureContext) {
      fail('マイクを利用するにはHTTPSまたはlocalhostで開いてください。');
      return;
    }
    status('starting');
    // start() returning does not mean recognition actually began. Wait for onstart.
    running = true;
    startupTimer = setTimeout(() => {
      if (disposed || !canRun()) return;
      fail('音声認識が開始されませんでした。ブラウザのマイク許可と通信接続を確認して、再接続してください。');
    }, 12000);
    try {
      recognition.start();
    } catch (error) {
      const { name = '', message = '' } = error as { name?: string; message?: string };
      console.warn('SpeechRecognition.start failed', { name, message });
      fail(`音声認識を開始できません${name ? `（${name}）` : ''}。ページを表示したまま、マイクを再接続してください。`);
    }
  }
  recognition.onstart = () => {
    clearTimeout(startupTimer);
    startupTimer = undefined;
    if (disposed || !enabled || speaking || !canRun()) {
      running = false;
      try { recognition.abort(); } catch { /* The browser already stopped recognition. */ }
      return;
    }
    callbacks.error(''); callbacks.listening(true); status('listening');
  };
  recognition.onend = () => {
    clearTimeout(startupTimer);
    startupTimer = undefined;
    running = false; callbacks.listening(false); resolveStopped();
    if (enabled && !speaking && !disposed && canRun()) { status('reconnecting'); timer = setTimeout(start, 350); }
  };
  recognition.onresult = event => {
    if (speaking || disposed || Date.now() < ignoreResultsUntil) return;
    let final = '', interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) final += result[0].transcript; else interim += result[0].transcript;
    }
    callbacks.interim(interim || final);
    if (final.trim()) callbacks.final(final.trim());
  };
  recognition.onerror = event => {
    if (event.error === 'aborted' || disposed) return;
    if (event.error === 'no-speech') { callbacks.error('聞き取れませんでした。もう一度話してください。'); callbacks.retry?.(); return; }
    const messages: Record<string, string> = {
      'not-allowed': 'Safariが音声認識の開始を許可しませんでした。ページを表示したまま「マイクに再接続する」をタップしてください。繰り返す場合はSafariのWebサイト設定でマイクを許可してください。',
      'service-not-allowed': '音声認識の利用が許可されていません。ブラウザの設定を確認してください。',
      'audio-capture': 'マイクが見つかりません。イヤホン・マイクの接続を確認してください。',
      network: '音声認識の通信に失敗しました。接続を確認し、再度マイクを有効にしてください。',
    };
    fail(messages[event.error] ?? '音声認識に失敗しました。マイクを再度有効にして話してください。');
  };
  return {
    async autoStart() {
      if (disposed || !canRun()) return;
      if (!window.isSecureContext) { fail('マイクを利用するにはHTTPSまたはlocalhostで開いてください。'); return; }
      // Safari must receive SpeechRecognition.start() directly from the user's tap.
      status('permission_required');
    },
    start() {
      if (disposed || speaking || !canRun()) return;
      callbacks.error('');
      unlockSpeech();
      enabled = true;
      start();
    },
    setActive(nextActive) {
      if (disposed || active === nextActive) return;
      active = nextActive;
      if (!active) {
        enabled = false;
        speaking = false;
        window.speechSynthesis.cancel();
        cancelSpeech?.();
        cancelSpeech = undefined;
        callbacks.interim('');
        stopRecognition();
        return;
      }
      status('permission_required');
    },
    async speak(text) {
      if (disposed || !canRun()) return;
      speaking = true; status('speaking'); clearTimeout(timer); clearTimeout(startupTimer); callbacks.interim('');
      if (running && !keepRecognitionDuringSpeech) await new Promise<void>(resolve => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          if (stopped === finish) stopped = undefined;
          running = false;
          callbacks.listening(false);
          resolve();
        };
        const timeout = setTimeout(finish, 1000);
        stopped = finish;
        try { recognition.abort(); } catch { finish(); }
      });
      if (disposed || !canRun()) { speaking = false; return; }
      await new Promise<void>(resolve => {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'ja-JP'; utterance.rate = 1;
        utterance.volume = 1;
        const japaneseVoice = window.speechSynthesis.getVoices().find(voice => voice.lang.replace('_', '-').toLowerCase().startsWith('ja'));
        if (japaneseVoice) utterance.voice = japaneseVoice;
        let settled = false;
        let started = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          clearTimeout(startupTimeout); clearTimeout(timeout);
          cancelSpeech = undefined;
          resolve();
        };
        const playbackError = () => {
          if (settled) return;
          window.speechSynthesis.cancel();
          callbacks.error('音声案内を再生できませんでした。画面の案内を確認し、そのまま名前を話してください。');
          finish();
        };
        const startupTimeout = setTimeout(() => { if (!started) playbackError(); }, 3000);
        const timeout = setTimeout(playbackError, Math.min(45000, Math.max(8000, text.length * 500)));
        cancelSpeech = finish;
        utterance.onstart = () => { started = true; clearTimeout(startupTimeout); };
        utterance.onend = finish;
        utterance.onerror = event => {
          console.warn('SpeechSynthesis failed', { error: event.error });
          playbackError();
        };
        window.speechSynthesis.speak(utterance);
      });
      speaking = false;
      if (!disposed && canRun()) {
        if (running) {
          // Ignore a short tail of the spoken guidance without closing the iOS mic session.
          ignoreResultsUntil = Date.now() + 250;
          callbacks.listening(true);
          status('listening');
        } else {
          status(enabled ? 'reconnecting' : 'permission_required');
          if (enabled) timer = setTimeout(start, 300);
        }
      }
    },
    dispose() {
      disposed = true; active = false; enabled = false; speaking = false;
      clearRecognitionTimers(); resolveStopped(); cancelSpeech?.();
      recognition.onend = null; recognition.onresult = null; recognition.onerror = null; recognition.onstart = null;
      recognition.abort(); window.speechSynthesis.cancel();
    },
  };
}
