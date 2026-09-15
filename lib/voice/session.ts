import { structureLocal } from "../structure-local";
import type { CareRecord, FormatField, Resident } from '../types';

export type VoiceState = 'IDLE' | 'WAKE_DETECTED' | 'WAITING_FOR_RESIDENT' | 'RECORDING' | 'CONFIRMING' | 'SAVING' | 'RECORDING_CONTINUE' | 'ENDED';
export interface Draft { category: string; value: string; transcript: string; createdAt: string; fields: CareRecord['fields'] }
export interface Snapshot { state: VoiceState; resident?: Resident; draft?: Draft; message: string; saved: boolean; error: string }
export interface SessionDependencies {
  residents: Resident[]; staffId: string; fields: () => FormatField[];
  append: (record: CareRecord) => void; speak: (text: string) => Promise<void>;
  selected?: (resident: Resident) => void;
  update: (snapshot: Snapshot) => void;
}
const normalize = (text: string) => text
  .normalize('NFKC')
  .toLowerCase()
  .replace(/[\s　。、,.!?！？「」『』"'’]/g, '');
export function commandOf(text: string) {
  const value = normalize(text);
  const wakeValue = value.replace(/[\u3041-\u3096]/g, char => String.fromCharCode(char.charCodeAt(0) + 0x60));
  if (['heycare', 'heyケア', 'ヘイケア', '記録開始'].some(command => wakeValue.includes(command))) return 'wake';
  if (['end', 'エンド'].includes(value)) return 'end';
  if (['登録', 'はい', '記録'].includes(value)) return 'save';
  if (['訂正', '違います'].includes(value)) return 'correct';
  return null;
}
export function matchResidents(text: string, residents: Resident[]) {
  const name = normalize(text).replace(/(?:さん|様|さま)$/, '');
  if (!name) return [];
  const exact = residents.filter(r => normalize(r.name) === name);
  return exact.length ? exact : residents.filter(r => normalize(r.name.split(/[\s　]+/)[0]) === name);
}
export function structure(text: string, fields: FormatField[]): Draft {
  const result = structureLocal(text, fields);
  const filled = result.filter(f => !f.isMissing);
  const value = filled.map(f => (fields.find(item => item.id === f.fieldId)?.label || '') + '：' + f.value).join('。');
  return {category: '入力内容', value: value || text.trim(), transcript: text.trim(), createdAt: new Date().toISOString(), fields: result};
}

export class VoiceSession {
  snapshot: Snapshot = { state: 'IDLE', message: '「Hey Care」または「ヘイケア」と話しかけてください', saved: false, error: '' };
  private startedAt = '';
  private count = 0;
  private busy = false;
  private candidates: Resident[] = [];
  constructor(private deps: SessionDependencies) {}
  private patch(patch: Partial<Snapshot>) { this.snapshot = { ...this.snapshot, ...patch }; this.deps.update(this.snapshot); }
  private async say(message: string) { this.patch({ message }); await this.deps.speak(message); }
  async retry() {
    if (this.busy || this.snapshot.state === 'IDLE') return;
    this.busy = true;
    try { await this.say('聞き取れませんでした。もう一度話してください。'); }
    finally { this.busy = false; }
  }
  finish() { this.patch({state: 'IDLE', resident: undefined, draft: undefined, saved: false, message: '「ヘイケア」と話しかけてください'}); }
  select(resident: Resident) {
    if (this.busy || this.snapshot.state === 'CONFIRMING') return;
    this.patch({resident, state: 'RECORDING', draft: undefined, message: '記録内容を話してください'});
  }
  clearSaved() { this.patch({ saved: false }); }
  async hear(text: string) {
    if (this.busy || !text.trim()) return;
    this.busy = true;
    try {
      const command = commandOf(text);
      const state = this.snapshot.state;
      this.patch({ error: '' });
      if (state === 'IDLE') {
        if (command !== 'wake') return;
        this.startedAt = new Date().toISOString(); this.count = 0; this.candidates = [];
        this.patch({ state: 'WAKE_DETECTED', resident: undefined, draft: undefined, saved: false });
        await this.say('記録を開始します。誰の記録をしますか？');
        this.patch({ state: 'WAITING_FOR_RESIDENT' }); return;
      }
      if (command === 'end') {
        this.patch({ state: 'ENDED', draft: undefined, saved: false });
        await this.say('記録を終了します');
        this.patch({ state: 'IDLE', resident: undefined, message: '「Hey Care」または「ヘイケア」と話しかけてください' }); return;
      }
      if (command === 'wake') { await this.say('記録中です。終了する場合はエンドと話してください'); return; }
      if (state === 'WAITING_FOR_RESIDENT') {
        const matches = matchResidents(text, this.candidates.length ? this.candidates : this.deps.residents);
        if (matches.length !== 1) {
          if (matches.length > 1) this.candidates = matches;
          await this.say(matches.length > 1 ? `${matches.map(r => r.name + 'さん').join('と')}がいます。フルネームでどちらか教えてください` : '利用者を特定できませんでした。登録されているフルネームでもう一度話してください'); return;
        }
        this.patch({ resident: matches[0] });
        this.deps.selected?.(matches[0]);
        await this.say(`${matches[0].name}さんの記録を開始します。記録内容を話してください`);
        this.patch({ state: 'RECORDING' }); return;
      }
      if (state === 'CONFIRMING') {
        if (command === 'correct') { this.patch({ state: 'RECORDING', draft: undefined }); await this.say('訂正内容を話してください'); return; }
        if (command !== 'save') { await this.say('登録する場合は「はい」、修正する場合は「訂正」と話してください'); return; }
        const draft = this.snapshot.draft!;
        this.patch({ state: 'SAVING' });
        try {
          this.deps.append({ id: crypto.randomUUID(), residentId: this.snapshot.resident!.id, staffId: this.deps.staffId,
            createdAt: draft.createdAt, rawTranscript: draft.transcript, fields: draft.fields,
            inputMethod: 'voice', recordType: 'care', reviewRequired: false, category: draft.category, content: draft.value });
        } catch { this.patch({ state: 'CONFIRMING', error: '下書きに反映できませんでした。もう一度「はい」と話してください。' }); await this.say(this.snapshot.error); return; }
        this.count++;
        this.patch({ saved: true, draft: undefined }); await this.say('確認画面の項目に反映しました。記録全体の保存は画面下の保存するボタンを押してください。');
        this.patch({ state: 'RECORDING_CONTINUE', message: '次の記録内容を話してください。終了は「END」' }); return;
      }
      if (state === 'RECORDING' || state === 'RECORDING_CONTINUE') {
        if (command) { await this.say('記録内容を話してください'); return; }
        const draft = structure(text, this.deps.fields());
        this.patch({ state: 'CONFIRMING', draft });
        await this.say(`${this.snapshot.resident!.name}さん、${draft.category}、${draft.value}。元の発話は「${draft.transcript}」。この内容を確認画面に保存しますか？「はい」で項目に反映します。記録全体はまだ保存されません。`);
      }
    } finally { this.busy = false; }
  }
}
