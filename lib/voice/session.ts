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
// --- 施設schema（key付きフィールド）向けの発話構造化 -------------------------------
// 記録用紙から生成された施設固有のフォーマット（体温・血圧・水分摂取量など）に対して、
// 発話内容をその施設のラベル・別名(aliases)に基づいて振り分け、値を構造化する。

function fieldMentioned(text: string, field: FormatField): boolean {
  const names = [field.label, ...(field.aliases ?? [])].filter(Boolean) as string[];
  return names.some(name => text.includes(name.normalize('NFKC')));
}

function extractTemperature(text: string): string | null {
  // 「37度2分」のような分単位の表記
  let m = text.match(/(3[3-9])度(\d)分/);
  if (m) return `${m[1]}.${m[2]}℃`;
  // 「37.2度」「37.2℃」
  m = text.match(/(3[3-9](?:\.\d)?)\s*(?:度|℃)/);
  if (m) return `${m[1]}℃`;
  // 「熱37.2」「体温37.2」（度・℃が無い場合）
  m = text.match(/(?:体温|検温|熱)\D{0,3}(3[3-9](?:\.\d)?)/);
  if (m) return `${m[1]}℃`;
  return null;
}

function extractBloodPressure(text: string): string | null {
  // 「120の80」「120/80」「120／80」
  const m = text.match(/(\d{2,3})\s*(?:の|\/|／|,|、|-)\s*(\d{2,3})/);
  return m ? `${m[1]}/${m[2]}` : null;
}

function extractWaterIntake(text: string): string | null {
  let m = text.match(/(?:水分摂取量|水分量|飲水量|水分|お茶)\D{0,4}(\d+(?:\.\d+)?)/);
  if (m) return `${m[1]}mL`;
  m = text.match(/(\d+(?:\.\d+)?)\s*(?:ミリリットル|ミリ|ml)/i);
  return m ? `${m[1]}mL` : null;
}

const MEAL_OPTIONS = ['全量', '8割', '5割', '未摂取', '全部', '10割', '9割', '7割', '6割', '4割', '3割', '2割', '1割', '0割', '半分'];
const MEAL_OPTIONS_PATTERN = new RegExp(`(${MEAL_OPTIONS.join('|')})`);

function extractMealIntake(text: string): string | null {
  const m = text.match(MEAL_OPTIONS_PATTERN);
  if (!m) return null;
  if (m[1] === '全部' || m[1] === '10割') return '全量';
  if (m[1] === '半分') return '5割';
  return m[1];
}

function extractDefecation(text: string): string | null {
  const count = text.match(/(\d+)\s*回/);
  const condition = text.match(/(普通|軟便|下痢)/);
  if (count || condition) return [count ? `${count[1]}回` : null, condition?.[1]].filter(Boolean).join('・');
  if (/あり|した|出た/.test(text)) return 'あり';
  if (/なし|していない/.test(text)) return 'なし';
  return null;
}

function extractBathingTime(text: string): string | null {
  if (/未実施|入っていない|していない/.test(text)) return '未実施';
  const m = text.match(/(\d{1,2})[時:](\d{2})?.{0,3}(?:から|[~〜-])\s*(\d{1,2})[時:](\d{2})?/);
  if (!m) return null;
  const start = `${m[1].padStart(2, '0')}:${(m[2] ?? '00').padStart(2, '0')}`;
  const end = `${m[3].padStart(2, '0')}:${(m[4] ?? '00').padStart(2, '0')}`;
  return `${start}〜${end}`;
}

function extractByKind(text: string, field: FormatField): string | null {
  switch (field.kind) {
    case 'number': return field.key === 'water_intake' ? extractWaterIntake(text) : extractTemperature(text);
    case 'blood_pressure': return extractBloodPressure(text);
    case 'select': return extractMealIntake(text);
    case 'defecation': return extractDefecation(text);
    case 'time_range': return extractBathingTime(text);
    default: return null;
  }
}

function structureByKeys(text: string, fields: FormatField[]): Draft {
  const norm = text.normalize('NFKC');
  const matches: { field: FormatField; value: string }[] = [];
  for (const field of fields) {
    if (!field.key || field.kind === 'text') continue;
    if (!fieldMentioned(norm, field)) continue;
    const value = extractByKind(norm, field);
    if (value) matches.push({ field, value });
  }
  if (matches.length === 0) {
    // マッピングできない発話は捨てず、特記事項（自由記述項目）または未分類として保持する。
    const notesField = fields.find(f => f.kind === 'text') ?? fields.find(f => /特記|備考/.test(f.label));
    return { category: notesField?.label ?? '特記事項', value: text.trim(), transcript: text.trim(), createdAt: new Date().toISOString(),
      fields: notesField ? [{ fieldId: notesField.id, value: text.trim(), isMissing: false }] : [] };
  }
  return {
    category: matches.length === 1 ? matches[0].field.label : matches.map(m => m.field.label).join('・'),
    value: matches.length === 1 ? matches[0].value : matches.map(m => `${m.field.label} ${m.value}`).join(' ／ '),
    transcript: text.trim(),
    createdAt: new Date().toISOString(),
    fields: matches.map(m => ({ fieldId: m.field.id, value: m.value, isMissing: false })),
  };
}

// --- key情報を持たない従来フォーマット向けの構造化（後方互換） -------------------------

function legacyStructure(text: string, fields: FormatField[]): Draft {
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

export function structure(text: string, fields: FormatField[]): Draft {
  // 施設schema由来のフィールド（key付き）があれば、そのschemaへの構造化マッピングを優先する。
  if (fields.some(f => f.key)) return structureByKeys(text, fields);
  return legacyStructure(text, fields);
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
