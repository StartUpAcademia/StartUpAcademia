import type { FormatField, CareRecordFieldValue } from './types';

// 施設の記録用紙（写真）から生成した固定9項目のうち、体温・血圧・特記事項以外は
// この施設schema専用の選択肢・形式で値を判定する。field.kind が設定されているフィールドにのみ
// 適用され、kind未設定の既存フィールド（DEFAULT_FORMAT_FIELDS等）の挙動には影響しない。
const SCHEMA_MEAL_OPTIONS = ['全量', '8割', '5割', '未摂取', '全部', '完食', '10割', '9割', '7割', '6割', '4割', '3割', '2割', '1割', '0割', '半分'];
const SCHEMA_MEAL_PATTERN = new RegExp(`^(${SCHEMA_MEAL_OPTIONS.join('|')})`);

export function structureLocal(transcript: string, fields: FormatField[]): CareRecordFieldValue[] {
  const text = transcript.normalize('NFKC').replace(/ヘイ\s*ケア|記録開始|送信/g, '').trim();
  const note = fields.find(f => f.kind === 'text' || /特記|備考|メモ/.test(f.label));
  const values = new Map<string, string>();
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const names = fields.flatMap(f => {
    const aliases = [f.label.normalize('NFKC'), ...(f.aliases ?? []).map(a => a.normalize('NFKC'))];
    if (/体温/.test(f.label)) aliases.push('体温', '熱');
    if (/食事/.test(f.label)) aliases.push('食事', 'ご飯');
    if (/血圧/.test(f.label)) aliases.push('血圧');
    return [...new Set(aliases)].map(name => ({name, field: f}));
  }).filter(n => n.name).sort((a,b) => b.name.length - a.name.length);
  if (!names.length) return [];
  const hits = [...text.matchAll(new RegExp(names.map(n => escape(n.name)).join('|'), 'g'))];
  const remaining: string[] = [];
  const clean = (s: string) => s.replace(/^[\s、,。:：]*(?:は|が|を)?[\s、,:：]*/, '').replace(/[\s、,。]+$/, '').trim();
  remaining.push(hits.length ? clean(text.slice(0,hits[0].index)) : text);
  for (let i=0;i<hits.length;i++) {
    const hit = hits[i];
    const field = names.find(n => n.name === hit[0])!.field;
    const raw = clean(text.slice(hit.index! + hit[0].length, hits[i+1]?.index ?? text.length));
    let value = '';
    let match: RegExpMatchArray | null = null;
    if (/体温/.test(field.label)) {
      match = raw.match(/^(\d{2})(?:[.・点](\d+))?\s*(?:度|℃|°[cC])?\s*(?:(\d)分)?/);
      if (match) value = match[1] + (match[2] || match[3] ? '.' + (match[2] || match[3]) : '') + '℃';
    } else if (field.kind === 'blood_pressure' || /血圧/.test(field.label)) {
      match = raw.match(
        /^(?:上(?:が|は)?\s*)?(\d{2,3})(?:\s*(?:の|\/|対|と|から|、|,|で)\s*(?:下(?:が|は)?\s*)?|\s+|\s*下(?:が|は)?\s*)(\d{2,3})\s*(?:mmhg|ミリ(?:メートル)?水銀柱)?/i
      );
      if (match) value = match[1] + ' / ' + match[2];
    } else if (field.kind === 'number' && field.key === 'water_intake') {
      match = raw.match(/^(\d+(?:\.\d+)?)\s*(?:ミリリットル|ミリ|ml)?/i);
      if (match) value = match[1] + 'mL';
    } else if (field.kind === 'select') {
      match = raw.match(SCHEMA_MEAL_PATTERN);
      if (match) value = /全部|完食|10割/.test(match[1]) ? '全量' : match[1] === '半分' ? '5割' : match[1];
    } else if (field.kind === 'defecation') {
      match = raw.match(/^(\d+)\s*回\s*[・、,]?\s*(普通|軟便|下痢)?|^(普通|軟便|下痢)|^(あり|した|出た)|^(なし|していない)/);
      if (match) {
        if (match[1]) value = [`${match[1]}回`, match[2]].filter(Boolean).join('・');
        else if (match[3]) value = match[3];
        else if (match[4]) value = 'あり';
        else if (match[5]) value = 'なし';
      }
    } else if (field.kind === 'time_range') {
      match = raw.match(/^未実施/);
      if (match) value = '未実施';
      else {
        match = raw.match(/^(\d{1,2})(?:時|:)(\d{2})?.{0,3}(?:から|[~〜-])\s*(\d{1,2})(?:時|:)(\d{2})?/);
        if (match) value = `${match[1].padStart(2,'0')}:${(match[2]??'00').padStart(2,'0')}〜${match[3].padStart(2,'0')}:${(match[4]??'00').padStart(2,'0')}`;
      }
    } else if (/食事/.test(field.label)) {
      match = raw.match(/^(全部|全量|完食|半分|10割|[0-9]割)/);
      if (match) value = /全部|全量|完食/.test(match[1]) ? '10割' : match[1] === '半分' ? '5割' : match[1];
    } else if (/時刻|時間/.test(field.label)) {
      match = raw.match(/^(\d{1,2})(?:時|:)(半|\d{1,2}分?)?/);
      if (match) value = match[1].padStart(2,'0') + ':' + (match[2] === '半' ? '30' : (match[2] || '0').replace('分','').padStart(2,'0'));
    } else {
      match = raw.match(/^[^。\n]+/);
      if (match) value = match[0].replace(/(?:です|でした)$/, '').trim();
    }
    if (match && value) {
      values.set(field.id, field.id === note?.id && values.has(field.id) ? values.get(field.id) + '。' + value : value);
      const tail = clean(raw.slice(match[0].length).replace(/^\s*(?:でした|です|で)(?:[。\s、,]*)/, ''));
      if (tail) remaining.push(tail);
    } else if (raw) remaining.push(hit[0] + ' ' + raw);
  }
  if (note) {
    const rest = [values.get(note.id), ...remaining].filter(Boolean).join('。');
    if (rest) values.set(note.id, rest);
  }
  return fields.map(f => ({fieldId: f.id, value: values.get(f.id) || '', isMissing: !values.has(f.id)}));
}
