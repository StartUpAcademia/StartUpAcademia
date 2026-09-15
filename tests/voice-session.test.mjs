import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';

const output = ts.transpileModule(readFileSync(new URL('../lib/voice/session.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exports = {};
vm.runInNewContext(output, { exports, crypto, Date });
const { VoiceSession, commandOf, matchResidents } = exports;
const residents = [{ id: '1', name: '田中 花子', roomNumber: '1' }, { id: '2', name: '鈴木 一郎', roomNumber: '2' }];
function setup(extra = {}) {
  const records = [], spoken = [], states = [];
  const session = new VoiceSession({ residents, staffId: 'staff-1', fields: () => [{ id: 'note', label: '特記事項' }], save: record => records.push(record), speak: async text => { spoken.push(text); }, update: next => states.push(next.state), ...extra });
  return { session, records, spoken, states };
}
async function start(session) { await session.hear('Hey Care'); await session.hear('田中さん'); }

test('wake → resident → confirmation → save → repeat → END; no command is stored', async () => {
  const { session, records, states } = setup();
  await session.hear('水分150'); assert.equal(records.length, 0);
  await start(session); assert.equal(session.snapshot.resident.id, '1');
  await session.hear('水分150ミリリットル'); assert.equal(session.snapshot.state, 'CONFIRMING'); assert.equal(records.length, 0);
  await session.hear('はい'); assert.equal(records.length, 1); assert.equal(records[0].content, '150mL'); assert.equal(records[0].staffId, 'staff-1');
  await session.hear('排便あり、普通便です'); await session.hear('登録');
  await session.hear('END'); assert.equal(records.length, 2); assert.equal(session.snapshot.state, 'IDLE');
  for (const state of ['IDLE', 'WAKE_DETECTED', 'WAITING_FOR_RESIDENT', 'RECORDING', 'CONFIRMING', 'SAVING', 'RECORDING_CONTINUE', 'ENDED']) assert.ok(states.includes(state), state);
  assert.ok(records.every(r => !commandOf(r.rawTranscript) && r.inputMethod === 'voice'));
});
test('empty session produces a review record with both timestamps', async () => {
  const { session, records } = setup(); await start(session); await session.hear('エンド');
  assert.equal(records.length, 1); assert.equal(records[0].recordType, 'voice_incomplete'); assert.equal(records[0].reviewRequired, true);
  assert.ok(records[0].startedAt && records[0].endedAt); assert.equal(records[0].residentId, '1'); assert.equal(records[0].rawTranscript, '');
});
test('unconfirmed draft and unselected resident also produce review records', async () => {
  const { session, records } = setup(); await start(session); await session.hear('水分150'); await session.hear('END');
  await session.hear('ヘイケア'); await session.hear('END');
  assert.equal(records.length, 2); assert.ok(records.every(r => r.reviewRequired)); assert.equal(records[1].residentId, '');
});
test('ambiguous and unrecognized names never select a resident', async () => {
  const list = [...residents, { id: '3', name: '田中 一郎', roomNumber: '3' }];
  const { session } = setup({ residents: list }); await start(session); assert.equal(session.snapshot.state, 'WAITING_FOR_RESIDENT'); assert.equal(session.snapshot.resident, undefined);
  await session.hear('山田さん'); assert.equal(session.snapshot.resident, undefined);
  await session.hear('田中花子さん'); assert.equal(session.snapshot.resident.id, '1');
  assert.equal(matchResidents('田', list).length, 0);
});
test('correction requires a fresh confirmation; unrelated replies never save', async () => {
  const { session, records } = setup(); await start(session); await session.hear('水分150'); await session.hear('違います');
  await session.hear('はい'); assert.equal(records.length, 0);
  await session.hear('水分200'); await session.hear('分かりました'); assert.equal(records.length, 0);
  await session.hear('記録'); assert.equal(records[0].content, '200mL');
});
test('storage failures preserve draft/session and allow retry', async () => {
  let fails = true; const saved = [];
  const { session } = setup({ save: record => { if (fails) throw Error('quota'); saved.push(record); } });
  await start(session); await session.hear('水分150'); await session.hear('はい'); assert.equal(session.snapshot.state, 'CONFIRMING'); assert.ok(session.snapshot.error);
  await session.hear('END'); assert.equal(session.snapshot.state, 'CONFIRMING');
  fails = false; await session.hear('はい'); assert.equal(saved.length, 1); await session.hear('END'); assert.equal(saved.length, 1);
});
test('commands are whole utterances and duplicates cannot save twice', async () => {
  assert.equal(commandOf(' Ｈｅｙ Ｃａｒｅ。 '), 'wake'); assert.equal(commandOf('エンドという言葉を話した'), null);
  const { session, records } = setup(); await start(session); await session.hear('水分150');
  await Promise.all([session.hear('はい'), session.hear('はい')]); assert.equal(records.length, 1);
});
test('recognition retry speaks during a session without changing the target or saving', async () => {
  const { session, records, spoken } = setup(); await session.retry(); assert.equal(spoken.length, 0);
  await start(session); await session.retry(); assert.ok(spoken.at(-1).includes('もう一度'));
  assert.equal(session.snapshot.state, 'RECORDING'); assert.equal(session.snapshot.resident.id, '1'); assert.equal(records.length, 0);
});
