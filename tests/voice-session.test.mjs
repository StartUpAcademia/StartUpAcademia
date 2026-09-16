import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
function load(path, extra={}) { const exports={}; vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,crypto,Date,...extra});return exports; }
const parser=load('../lib/structure-local.ts');
const {VoiceSession,commandOf}=load('../lib/voice/session.ts',{require:()=>parser});
const fields=['体温','血圧','食事摂取量','水分量','特記事項'].map((label,i)=>({id:String(i),label,type:'数値',order:i,required:false}));
const residents=[{id:'r1',name:'田中 花子',roomNumber:'304'}];
const mem=()=>{const m=new Map();return{getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v)}};
function setup() {
 const store=load('../lib/storage.ts',{require:()=>({DEFAULT_FORMAT_FIELDS:fields}),window:{localStorage:mem(),dispatchEvent(){}},sessionStorage:mem(),Event:class{}});
 const selected=[], spoken=[];
 const session=new VoiceSession({residents,staffId:'s1',fields:()=>fields,append:store.appendDraft,selected:r=>selected.push(r.id),speak:async t=>{spoken.push(t)},update(){}});
 return {session,store,selected,spoken};
}
test('wake command accepts common iPhone transcription variants',()=>{
 for(const text of ['Hey Care','Hey ケア','へいケア','「ヘイ ケア」と言いました']) assert.equal(commandOf(text),'wake');
});
test('temperature variants go only into temperature; custom field and residual note',()=>{
 for(const text of ['体温は39.4°c','体温は39.4°C','体温は３９．４℃','体温は39度4分']) {const r=parser.structureLocal(text,fields);assert.equal(r[0].value,'39.4℃');assert.equal(r[4].value,'');}
 const r=parser.structureLocal('体温は39.4度。血圧は120の80。水分量は200ml。右腕に赤みがあります。',fields);assert.equal(r[0].value,'39.4℃');assert.equal(r[1].value,'120 / 80');assert.equal(r[3].value,'200ml');assert.equal(r[4].value,'右腕に赤みがあります');
});
test('blood pressure variants go into blood pressure instead of special notes',()=>{
 for(const text of ['血圧は120の80','血圧120/80','血圧は120対80','血圧上が120下が80','血圧は上が120、下が80','血圧は120 80','血圧は120で下が80']) {
  const r=parser.structureLocal(text,fields);
  assert.equal(r[1].value,'120 / 80',text);
  assert.equal(r[4].value,'',text);
 }
});
test('select resident before content; yes updates draft only; button commits all once',async()=>{
 const {session,store,selected}=setup();await session.hear('ヘイケア');await session.hear('田中花子さん');assert.deepEqual(selected,['r1']);assert.equal(session.snapshot.state,'RECORDING');
 await session.hear('体温は39.4°c');assert.equal(store.getDraft('r1'),null);await session.hear('はい');assert.equal(store.getRecords().length,0);assert.equal(store.getDraft('r1').fields[0].value,'39.4℃');
 await session.hear('血圧は120の80。右腕に赤みがあります');await session.hear('はい');assert.equal(store.getRecords().length,0);assert.equal(session.snapshot.resident.id,'r1');
 store.commitDraft('r1');assert.equal(store.getRecords().length,1);assert.equal(store.getRecords()[0].fields.length,3);assert.throws(()=>store.commitDraft('r1'));assert.equal(store.getRecords().length,1);
});
test('end never publishes unconfirmed content or empty records',async()=>{
 const {session,store}=setup();await session.hear('ヘイケア');await session.hear('田中花子さん');await session.hear('体温39.4度');await session.hear('エンド');assert.equal(store.getRecords().length,0);assert.equal(store.getDraft('r1'),null);
});
test('correction and duplicate yes do not publish',async()=>{
 const {session,store}=setup();await session.hear('ヘイケア');await session.hear('田中花子さん');await session.hear('体温39度');await session.hear('訂正');await session.hear('体温39.4度');await Promise.all([session.hear('はい'),session.hear('はい')]);assert.equal(store.getRecords().length,0);assert.equal(store.getDraft('r1').rawTranscript,'体温39.4度');
});

// 施設の記録用紙（写真）から生成した固定9項目schema向けのケース（P-1章の完了確認シナリオ）。
// key/kind/aliasesを持つフィールドは、この施設専用の選択肢・形式で構造化される。
const FACILITY_SCHEMA_FIELDS = [
 {id:'f-temp',label:'体温',type:'数値',required:true,order:0,key:'body_temperature',kind:'number',unit:'℃',aliases:['体温','検温']},
 {id:'f-water',label:'水分摂取量',type:'数値',required:true,order:1,key:'water_intake',kind:'number',unit:'mL',aliases:['水分摂取量','水分量','飲水量','水分','お茶']},
 {id:'f-breakfast',label:'朝食の摂取量',type:'選択肢',required:true,order:2,key:'breakfast_intake',kind:'select',options:['全量','8割','5割','未摂取'],aliases:['朝食','朝食摂取量','朝食の摂取量']},
 {id:'f-defecation',label:'排便',type:'選択肢',required:true,order:3,key:'defecation',kind:'defecation',options:['普通','軟便','下痢'],aliases:['排便','便']},
 {id:'f-bathing',label:'入浴時間',type:'時刻',required:true,order:4,key:'bathing_time',kind:'time_range',aliases:['入浴時間','入浴']},
 {id:'f-notes',label:'特記事項',type:'自由記述',required:false,order:5,key:'special_notes',kind:'text',aliases:['特記事項','気づいたこと']},
];

test('facility schema: a single utterance with two values maps to two structured fields',()=>{
 const r=parser.structureLocal('体温37.2度、水分150',FACILITY_SCHEMA_FIELDS);
 const temp=r.find(f=>f.fieldId==='f-temp'), water=r.find(f=>f.fieldId==='f-water');
 assert.equal(temp.value,'37.2℃'); assert.equal(temp.isMissing,false);
 assert.equal(water.value,'150mL'); assert.equal(water.isMissing,false);
});
test('facility schema: 排便あり maps to defecation field with value "あり"',()=>{
 const r=parser.structureLocal('排便あり',FACILITY_SCHEMA_FIELDS);
 const defecation=r.find(f=>f.fieldId==='f-defecation');
 assert.equal(defecation.value,'あり'); assert.equal(defecation.isMissing,false);
});
test('facility schema: meal intake is limited to the fixed 4 options (全量/8割/5割/未摂取)',()=>{
 const r=parser.structureLocal('朝食は8割でした',FACILITY_SCHEMA_FIELDS);
 assert.equal(r.find(f=>f.fieldId==='f-breakfast').value,'8割');
});
test('facility schema: bathing time range and 未実施 are both recognized',()=>{
 const done=parser.structureLocal('入浴時間は10時30分から11時',FACILITY_SCHEMA_FIELDS);
 assert.equal(done.find(f=>f.fieldId==='f-bathing').value,'10:30〜11:00');
 const skipped=parser.structureLocal('入浴時間は未実施',FACILITY_SCHEMA_FIELDS);
 assert.equal(skipped.find(f=>f.fieldId==='f-bathing').value,'未実施');
});
test('facility schema: unmapped utterances are kept, not discarded (special_notes fallback)',()=>{
 const r=parser.structureLocal('廊下で少しふらついていました',FACILITY_SCHEMA_FIELDS);
 assert.equal(r.find(f=>f.fieldId==='f-notes').value,'廊下で少しふらついていました');
});
test('facility schema end-to-end: voice → draft (merged across utterances) → commit for 田中さん',async()=>{
 const store=load('../lib/storage.ts',{require:()=>({DEFAULT_FORMAT_FIELDS:FACILITY_SCHEMA_FIELDS}),window:{localStorage:mem(),dispatchEvent(){}},sessionStorage:mem(),Event:class{}});
 const selected=[];
 const session=new VoiceSession({residents,staffId:'s1',fields:()=>FACILITY_SCHEMA_FIELDS,append:store.appendDraft,selected:r=>selected.push(r.id),speak:async()=>{},update(){}});
 await session.hear('ヘイケア'); await session.hear('田中花子さん'); assert.deepEqual(selected,['r1']);
 await session.hear('体温37.2度、水分150'); await session.hear('はい');
 const draft1=store.getDraft('r1');
 assert.equal(draft1.fields.find(f=>f.fieldId==='f-temp').value,'37.2℃');
 assert.equal(draft1.fields.find(f=>f.fieldId==='f-water').value,'150mL');
 await session.hear('排便あり'); await session.hear('はい');
 const draft2=store.getDraft('r1');
 assert.equal(draft2.fields.find(f=>f.fieldId==='f-defecation').value,'あり');
 store.commitDraft('r1');
 assert.equal(store.getRecords().length,1);
 assert.equal(store.getRecords()[0].residentId,'r1');
});
