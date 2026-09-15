import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
import { setImmediate as flush } from 'node:timers/promises';
import ts from 'typescript';
const source = ts.transpileModule(readFileSync(new URL('../lib/voice/browserSpeech.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function setup(supported = true, options = {}) {
  let recognition, utterance;
  const events = { final: [], interim: [], error: [], listening: [], status: [] };
  let starts = 0, releases = 0, requests = 0;
  const timers = new Map();
  const schedule = (fn, delay) => { const id = {}; timers.set(id, { fn, delay }); return id; };
  const unschedule = id => timers.delete(id);
  class Recognition {
    // Retain the fake browser instance to dispatch recognition events in tests.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    constructor() { recognition = this; }
    start() { starts++; if (!options.silentStart) this.onstart?.(); }
    abort() { if (!options.silentAbort) this.onend?.(); }
  }
  const window = { isSecureContext: options.secure !== false, SpeechRecognition: supported ? Recognition : undefined, speechSynthesis: { speak: u => { utterance = u; }, cancel() {} } };
  const navigator = {
    permissions: { query: async () => { if (options.queryError) throw Error('unsupported'); return { state: options.permission ?? 'granted' }; } },
    mediaDevices: { getUserMedia: async () => {
      requests++;
      if (options.mediaError) throw { name: options.mediaError };
      if (options.mediaPromise) return options.mediaPromise;
      return { getTracks: () => [{ stop() { releases++; } }] };
    } },
  };
  const exports = {};
  vm.runInNewContext(source, { exports, window, navigator, SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } }, setTimeout: schedule, clearTimeout: unschedule });
  const service = exports.createBrowserSpeech(Object.fromEntries(Object.keys(events).map(key => [key, value => events[key].push(value)])));
  return { service, events, get starts() { return starts; }, get releases() { return releases; }, get requests() { return requests; }, fire(delay) { for (const [id, timer] of [...timers]) if (timer.delay === delay) { timers.delete(id); timer.fn(); } }, get recognition() { return recognition; }, get utterance() { return utterance; } };
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
test('granted permission auto-starts and releases the permission-check stream', async () => {
  const env = setup(); await env.service.autoStart();
  assert.equal(env.starts, 1); assert.equal(env.releases, 1); assert.equal(env.events.status.at(-1), 'listening'); env.service.dispose();
});
test('first-time permission and unsupported permission query keep the manual button available', async () => {
  for (const options of [{ permission: 'prompt' }, { queryError: true }]) {
    const env = setup(true, options); await env.service.autoStart();
    assert.equal(env.requests, 0); assert.equal(env.events.status.at(-1), 'permission_required'); env.service.dispose();
  }
});
test('denied permission and insecure HTTP explain why auto-start is unavailable', async () => {
  for (const options of [{ permission: 'denied' }, { secure: false }]) {
    const env = setup(true, options); await env.service.autoStart();
    assert.equal(env.starts, 0); assert.equal(env.events.status.at(-1), 'error'); assert.ok(env.events.error.at(-1)); env.service.dispose();
  }
});
test('silent recognition startup times out instead of falsely showing microphone enabled', async () => {
  const env = setup(true, { silentStart: true }); await env.service.autoStart();
  assert.equal(env.events.status.at(-1), 'starting'); assert.ok(!env.events.listening.includes(true));
  env.fire(12000); assert.equal(env.events.status.at(-1), 'error');
  env.service.start(); await flush(); assert.equal(env.starts, 2); env.service.dispose();
});
test('manual permission errors are distinguished and remain retryable', async () => {
  for (const mediaError of ['NotAllowedError', 'NotFoundError', 'NotReadableError', 'AbortError', 'InvalidStateError', 'OverconstrainedError', 'SecurityError']) {
    const env = setup(true, { mediaError }); env.service.start(); await flush();
    assert.equal(env.starts, 0); assert.equal(env.events.status.at(-1), 'error'); assert.ok(env.events.error.at(-1)); env.service.dispose();
  }
});
test('permission requests do not duplicate; late streams are released after disposal', async () => {
  let resolve; let stopped = false;
  const mediaPromise = new Promise(done => { resolve = done; });
  const env = setup(true, { mediaPromise }); env.service.start(); env.service.start(); assert.equal(env.requests, 1);
  env.service.dispose(); resolve({ getTracks: () => [{ stop() { stopped = true; } }] });
  await mediaPromise; await flush(); await flush();
  assert.equal(stopped, true); assert.equal(env.starts, 0);
});
test('speech resumes recognition even when Safari omits the abort end event', async () => {
  const env = setup(true, { silentAbort: true }); await env.service.autoStart();
  const speaking = env.service.speak('記録しました');
  env.fire(1000); await flush();
  env.utterance.onend(); await speaking;
  env.fire(300);
  assert.equal(env.starts, 2); env.service.dispose();
});
test('inactive pages release recognition and do not reconnect in the background', async () => {
  const env = setup(); await env.service.autoStart();
  env.service.setActive(false);
  env.fire(350);
  env.service.start(); await flush();
  assert.equal(env.starts, 1);
  env.service.setActive(true); await env.service.autoStart();
  assert.equal(env.starts, 2); env.service.dispose();
});
