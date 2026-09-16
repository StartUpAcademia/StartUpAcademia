import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
import { setImmediate as flush } from 'node:timers/promises';
import ts from 'typescript';
const source = ts.transpileModule(readFileSync(new URL('../lib/voice/browserSpeech.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function setup(supported = true, options = {}) {
  let recognition, utterance;
  const spoken = [];
  const audioSessionTypes = [];
  let webAudioStarts = 0;
  const events = { final: [], interim: [], error: [], listening: [], status: [] };
  let starts = 0, aborts = 0;
  const timers = new Map();
  const schedule = (fn, delay) => { const id = {}; timers.set(id, { fn, delay }); return id; };
  const unschedule = id => timers.delete(id);
  class Recognition {
    // Retain the fake browser instance to dispatch recognition events in tests.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    constructor() { recognition = this; }
    start() { starts++; if (options.startError) throw { name: options.startError, message: 'failed' }; if (!options.silentStart) this.onstart?.(); }
    abort() { aborts++; if (!options.silentAbort) this.onend?.(); }
  }
  const voices = options.voices ?? [];
  class AudioContext {
    state = 'running';
    sampleRate = 24000;
    destination = {};
    createBuffer() { return {}; }
    createBufferSource() {
      return {
        connect() {},
        start() { webAudioStarts++; this.onended?.(); },
        stop() { this.onended?.(); },
      };
    }
    resume() { this.state = 'running'; return Promise.resolve(); }
    suspend() { this.state = 'suspended'; return Promise.resolve(); }
    close() { this.state = 'closed'; return Promise.resolve(); }
    decodeAudioData() { return Promise.resolve({}); }
  }
  const window = { isSecureContext: options.secure !== false, SpeechRecognition: supported ? Recognition : undefined, AudioContext: options.webAudio ? AudioContext : undefined, speechSynthesis: { speak: u => { utterance = u; spoken.push(u); }, cancel() {}, getVoices: () => voices } };
  const audioSession = options.audioSession ? {
    _type: 'auto',
    get type() { return this._type; },
    set type(value) { this._type = value; audioSessionTypes.push(value); },
  } : undefined;
  const navigator = options.ios
    ? { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', platform: 'iPhone', maxTouchPoints: 5, audioSession }
    : { userAgent: 'Mozilla/5.0', platform: 'Win32', maxTouchPoints: 0 };
  const exports = {};
  const fetch = async () => ({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(8) });
  vm.runInNewContext(source, { exports, window, navigator, fetch, SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } }, setTimeout: schedule, clearTimeout: unschedule });
  const service = exports.createBrowserSpeech(Object.fromEntries(Object.keys(events).map(key => [key, value => events[key].push(value)])));
  return { service, events, spoken, audioSessionTypes, get webAudioStarts() { return webAudioStarts; }, get starts() { return starts; }, get aborts() { return aborts; }, fire(delay) { for (const [id, timer] of [...timers]) if (timer.delay === delay) { timers.delete(id); timer.fn(); } }, get recognition() { return recognition; }, get utterance() { return utterance; } };
}
test('unsupported browser reports no service', () => assert.equal(setup(false).service, null));
test('interim and final callbacks; recognition is muted during speech and disposed', async () => {
  const env = setup(); env.service.start(); await flush();
  const result = (text, final) => ({ resultIndex: 0, results: [{ isFinal: final, 0: { transcript: text } }] });
  env.recognition.onresult(result('水分', false)); assert.deepEqual(env.events.interim, ['水分']);
  env.recognition.onresult(result('水分150', true)); assert.deepEqual(env.events.final, ['水分150']);
  const speaking = env.service.speak('記録しました'); await flush();
  env.recognition.onresult(result('記録しました', true)); assert.equal(env.events.final.length, 1);
  env.utterance.onend(); await speaking; env.service.dispose(); assert.equal(env.recognition.onresult, null);
});
test('permission and capture failures provide clear guidance', async () => {
  for (const code of ['not-allowed', 'audio-capture', 'network', 'no-speech']) {
    const env = setup(); env.service.start(); await flush(); env.recognition.onerror({ error: code });
    assert.ok(env.events.error.at(-1)); env.service.dispose();
  }
});
test('auto-start waits for a user tap and manual start is synchronous', async () => {
  const env = setup(); await env.service.autoStart();
  assert.equal(env.starts, 0); assert.equal(env.events.status.at(-1), 'permission_required');
  env.service.start(); assert.equal(env.starts, 1); assert.equal(env.events.status.at(-1), 'listening'); env.service.dispose();
});
test('insecure HTTP explains why microphone start is unavailable', async () => {
  const env = setup(true, { secure: false }); await env.service.autoStart();
  assert.equal(env.starts, 0); assert.equal(env.events.status.at(-1), 'error'); assert.ok(env.events.error.at(-1)); env.service.dispose();
});
test('silent recognition startup times out instead of falsely showing microphone enabled', async () => {
  const env = setup(true, { silentStart: true }); env.service.start();
  assert.equal(env.events.status.at(-1), 'starting'); assert.ok(!env.events.listening.includes(true));
  env.fire(12000); assert.equal(env.events.status.at(-1), 'error');
  env.service.start(); await flush(); assert.equal(env.starts, 2); env.service.dispose();
});
test('iPhone permission prompt is not aborted by the shorter reconnect timeout', () => {
  const env = setup(true, { ios: true, silentStart: true }); env.service.start();
  env.fire(12000);
  assert.equal(env.events.status.at(-1), 'starting');
  assert.equal(env.aborts, 0);
  env.recognition.onstart();
  assert.equal(env.events.status.at(-1), 'listening');
  assert.equal(env.aborts, 0);
  env.service.dispose();
});
test('iPhone reconnects when recognition ends immediately after permission', () => {
  const env = setup(true, { ios: true }); env.service.start();
  env.recognition.onend();
  assert.equal(env.events.status.at(-1), 'reconnecting');
  env.fire(350);
  assert.equal(env.starts, 2);
  assert.equal(env.events.status.at(-1), 'listening');
  assert.equal(env.events.error.at(-1), '');
  env.service.dispose();
});
test('duplicate manual starts are ignored while recognition is starting', () => {
  const env = setup(true, { silentStart: true }); env.service.start(); env.service.start();
  assert.equal(env.starts, 1); env.service.dispose();
});
test('speech resumes recognition even when Safari omits the abort end event', async () => {
  const env = setup(true, { silentAbort: true }); env.service.start();
  const speaking = env.service.speak('記録しました');
  env.fire(1000); await flush();
  env.utterance.onend(); await speaking;
  env.fire(300);
  assert.equal(env.starts, 2); env.service.dispose();
});
test('desktop keeps the original recognition and speech timing', async () => {
  const env = setup(); env.service.start();
  assert.equal(env.spoken.length, 0);
  const speaking = env.service.speak('誰の記録をしますか？');
  await flush();
  assert.equal(env.utterance.voice, undefined);
  env.fire(3000);
  assert.equal(env.events.status.at(-1), 'speaking');
  env.utterance.onend(); await speaking;
  env.fire(300);
  assert.equal(env.starts, 2);
  env.service.dispose();
});
test('iPhone keeps the tap-started recognition session alive while guidance is spoken', async () => {
  const japaneseVoice = { lang: 'ja-JP', name: 'Kyoko' };
  const env = setup(true, { ios: true, voices: [japaneseVoice] }); env.service.start();
  assert.equal(env.spoken.length, 1);
  assert.equal(env.spoken[0].volume, 0);
  const speaking = env.service.speak('誰の記録をしますか？');
  assert.equal(env.aborts, 0);
  assert.equal(env.utterance.voice, japaneseVoice);
  assert.equal(env.utterance.volume, 1);
  env.utterance.onstart();
  env.utterance.onend(); await speaking;
  assert.equal(env.starts, 1);
  assert.equal(env.events.status.at(-1), 'listening');
  env.service.dispose();
});
test('iPhone fixes the audio session before capture and restores it when inactive', () => {
  const env = setup(true, { ios: true, audioSession: true });
  env.service.start();
  assert.deepEqual(env.audioSessionTypes, ['play-and-record']);
  assert.equal(env.starts, 1);
  env.service.setActive(false);
  assert.deepEqual(env.audioSessionTypes, ['play-and-record', 'auto']);
});
test('iPhone demo prompts use Web Audio so Screen Recording receives page audio', async () => {
  const env = setup(true, { ios: true, audioSession: true, webAudio: true });
  env.service.start();
  const spokenBeforePrompt = env.spoken.length;
  await env.service.speak('記録を開始します。誰の記録をしますか？');
  assert.equal(env.spoken.length, spokenBeforePrompt);
  assert.equal(env.webAudioStarts, 2);
  assert.equal(env.starts, 1);
  assert.equal(env.aborts, 0);
  assert.equal(env.events.status.at(-1), 'listening');
  env.service.dispose();
});
test('desktop does not alter the AudioSession API', () => {
  const env = setup(true, { audioSession: true });
  env.service.start();
  assert.deepEqual(env.audioSessionTypes, []);
  env.service.dispose();
});
test('blocked iPhone guidance returns to listening instead of ignoring speech for 45 seconds', async () => {
  const env = setup(true, { ios: true }); env.service.start();
  const speaking = env.service.speak('誰の記録をしますか？');
  env.fire(3000); await speaking;
  assert.equal(env.events.error.at(-1), '音声案内を再生できませんでした。画面の案内を確認し、そのまま名前を話してください。');
  assert.equal(env.events.status.at(-1), 'listening');
  assert.equal(env.starts, 1);
  env.service.dispose();
});
test('inactive pages release recognition and do not reconnect in the background', async () => {
  const env = setup(); env.service.start();
  env.service.setActive(false);
  env.fire(350);
  env.service.start(); await flush();
  assert.equal(env.starts, 1);
  env.service.setActive(true); await env.service.autoStart();
  assert.equal(env.starts, 1);
  env.service.start(); assert.equal(env.starts, 2); env.service.dispose();
});
