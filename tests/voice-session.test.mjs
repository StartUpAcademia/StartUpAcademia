import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
function load(path, extra={}) { const exports={}; vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,crypto,Date,...extra});return exports; }
const parser=load('../lib/structure-local.ts');
const {VoiceSession}=load('../lib/voice/session.ts',{require:()=>parser});
const fields=['体温','血圧','食事摂取量','水分量','特記事項'].map((label,i)=>({id:String(i),label,type:'数値',order:i,required:false}));
const residents=[{id:'r1',name:'田中 花子',roomNumber:'304'}];
const mem=()=>{const m=new Map();return{getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v)}};
function setup() {
 const store=load('../lib/storage.ts',{require:()=>({DEFAULT_FORMAT_FIELDS:fields}),window:{localStorage:mem(),dispatchEvent(){}},sessionStorage:mem(),Event:class{}});
 const selected=[], spoken=[];
 const session=new VoiceSession({residents,staffId:'s1',fields:()=>fields,append:store.appendDraft,selected:r=>selected.push(r.id),speak:async t=>{spoken.push(t)},update(){}});
 return {session,store,selected,spoken};
}
test('temperature variants go only into temperature; custom field and residual note',()=>{
 for(const text of ['体温は39.4°c','体温は39.4°C','体温は３９．４℃','体温は39度4分']) {const r=parser.structureLocal(text,fields);assert.equal(r[0].value,'39.4℃');assert.equal(r[4].value,'');}
 const r=parser.structureLocal('体温は39.4度。血圧は120の80。水分量は200ml。右腕に赤みがあります。',fields);assert.equal(r[0].value,'39.4℃');assert.equal(r[1].value,'120 / 80');assert.equal(r[3].value,'200ml');assert.equal(r[4].value,'右腕に赤みがあります');
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
