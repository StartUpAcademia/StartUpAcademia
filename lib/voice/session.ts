import type { CareRecord, FormatField, Resident } from '../types';

export type VoiceState = 'IDLE' | 'WAKE_DETECTED' | 'WAITING_FOR_RESIDENT' | 'RECORDING' | 'CONFIRMING' | 'SAVING' | 'RECORDING_CONTINUE' | 'ENDED';
export interface Draft { category: string; value: string; transcript: string; createdAt: string; fields: CareRecord['fields'] }
export interface Snapshot { state: VoiceState; resident?: Resident; draft?: Draft; message: string; saved: boolean; error: string }
export interface SessionDependencies {
  residents: Resident[]; staffId: string; fields: () => FormatField[];
  save: (record: CareRecord) => void; speak: (text: string) => Promise<void>;
  update: (snapshot: Snapshot) => void;
}
const normalize = (text: string) => text.normalize('NFKC').toLowerCase().replace(/[\s。、,.!?！？「」]/g, '');
export function commandOf(text: string) {
  const value = normalize(text);
  if (['heycare', 'ヘイケア', 'ヘイケアー', '記録開始'].includes(value)) return 'wake';
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
  let category = '特記事項';
  let value = text.trim();
  let label = /特記|備考/;
  if (/水分|ミリリットル|ml/i.test(text)) {
    category = '水分'; label = /水分/;
    const amount = text.normalize('NFKC').match(/(?:水分(?:を|は)?\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*(?:ミリリットル|ml))/i);
    if (amount) value = `${amount[1] ?? amount[2]}mL`;
  } else if (/食事|朝食|昼食|夕食|主食|副食/.test(text)) { category = '食事'; label = /食事|摂取/; }
  else if (/排便|排尿|便|尿/.test(text)) { category = '排泄'; label = /排泄|排便/; }
  else if (/入浴/.test(text)) { category = '入浴'; label = /入浴/; }
  else if (/体温|血圧|脈拍|酸素|バイタル/.test(text)) { category = 'バイタル'; label = /バイタル/; }
  // Preserve the complete utterance: a single turn may describe several observations.
  const field = fields.find(f => label.test(f.label)) ?? fields.find(f => /特記|備考/.test(f.label));
  return { category, value, transcript: text.trim(), createdAt: new Date().toISOString(),
    fields: field ? [{ fieldId: field.id, value: text.trim(), isMissing: false }] : [] };
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
        const endedAt = new Date().toISOString();
        this.patch({ state: 'SAVING' });
        try {
          if (!this.count) this.deps.save({
            id: crypto.randomUUID(), residentId: this.snapshot.resident?.id ?? '', staffId: this.deps.staffId,
            createdAt: endedAt, rawTranscript: '', fields: [], inputMethod: 'voice',
            recordType: 'voice_incomplete', reviewRequired: true, startedAt: this.startedAt, endedAt,
            content: '音声記録を開始しましたが、有効な介護内容が入力・保存されないまま終了しました。後から確認が必要です。',
          });
        } catch { this.patch({ state, error: '要確認記録を保存できませんでした。空き容量などを確認し、もう一度「END」と話してください。' }); await this.say(this.snapshot.error); return; }
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
        await this.say(`${matches[0].name}さんの記録を開始します。記録内容を話してください`);
        this.patch({ state: 'RECORDING' }); return;
      }
      if (state === 'CONFIRMING') {
        if (command === 'correct') { this.patch({ state: 'RECORDING', draft: undefined }); await this.say('訂正内容を話してください'); return; }
        if (command !== 'save') { await this.say('登録する場合は「はい」、修正する場合は「訂正」と話してください'); return; }
        const draft = this.snapshot.draft!;
        this.patch({ state: 'SAVING' });
        try {
          this.deps.save({ id: crypto.randomUUID(), residentId: this.snapshot.resident!.id, staffId: this.deps.staffId,
            createdAt: draft.createdAt, rawTranscript: draft.transcript, fields: draft.fields,
            inputMethod: 'voice', recordType: 'care', reviewRequired: false, category: draft.category, content: draft.value });
        } catch { this.patch({ state: 'CONFIRMING', error: '保存できませんでした。空き容量などを確認し、もう一度「登録」と話してください。' }); await this.say(this.snapshot.error); return; }
        this.count++;
        this.patch({ saved: true, draft: undefined }); await this.say('記録しました');
        this.patch({ state: 'RECORDING_CONTINUE', message: '次の記録内容を話してください。終了は「END」' }); return;
      }
      if (state === 'RECORDING' || state === 'RECORDING_CONTINUE') {
        if (command) { await this.say('記録内容を話してください'); return; }
        const draft = structure(text, this.deps.fields());
        this.patch({ state: 'CONFIRMING', draft });
        await this.say(`${this.snapshot.resident!.name}さん、${draft.category}、${draft.value}。元の発話は「${draft.transcript}」。この内容で登録しますか？`);
      }
    } finally { this.busy = false; }
  }
}
