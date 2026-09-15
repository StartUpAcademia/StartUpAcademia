import type { FormatField, CareRecordFieldValue } from './types';

export function structureLocal(transcript: string, fields: FormatField[]): CareRecordFieldValue[] {
  const text = transcript.normalize('NFKC').replace(/ヘイ\s*ケア|記録開始|送信/g, '').trim();
  const note = fields.find(f => /特記|備考|メモ/.test(f.label));
  const values = new Map<string, string>();
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const names = fields.flatMap(f => {
    const aliases = [f.label.normalize('NFKC')];
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
    } else if (/血圧/.test(field.label)) {
      match = raw.match(/^(?:上(?:が|は)?\s*)?(\d{2,3})\s*(?:の|\/|、|,|で)\s*(?:下(?:が|は)?\s*)?(\d{2,3})/);
      if (match) value = match[1] + ' / ' + match[2];
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
