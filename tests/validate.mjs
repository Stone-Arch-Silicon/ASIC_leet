import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=n=>JSON.parse(fs.readFileSync(new URL('../dist/'+n,import.meta.url),'utf8'));
const problems=[...read('lab-problems.json'),...read('advanced-problems.json')], guide=read('guide.json');
assert.equal(problems.length,52);assert.equal(new Set(problems.map(p=>p.id)).size,52);
for(const p of problems){
 for(const f of ['id','track','title','level','kind','lab','prompt','artifact','hint'])assert.ok(typeof p[f]==='string'&&p[f].length,`${p.id} ${f}`);
 for(const f of ['solution','rubric','followups','theory','sources'])assert.ok(Array.isArray(p[f])&&p[f].length,`${p.id} ${f}`);
 assert.ok(['Digital PD','Analog PD','RTL','Verification'].includes(p.track));assert.ok(['Easy','Medium','Hard'].includes(p.level));assert.ok(['Report','Code','Debug','Design'].includes(p.kind));
 if(p.numeric){assert.ok(Number.isFinite(p.numeric.answer));assert.ok(p.numeric.tolerance>=0);}
 for(const s of p.sources){if(typeof s==='object')assert.equal(new URL(s.url).protocol,'https:');}
}
const expected={L04:.28,L07:58,L08:4,L12:282/298*100,L15:3,L16:23.3,L18:(11-3.1)/11*100,L20:.65,L21:10,L23:75,A01:.06,A04:93000,A06:60,A07:28,A11:1.5,A16:92,A18:4,A24:20};
for(const[id,value]of Object.entries(expected)){const p=problems.find(p=>p.id===id);assert.ok(Math.abs(p.numeric.answer-value)<Math.max(p.numeric.tolerance,1e-8),id);}
assert.equal(guide.length,12);assert.equal(guide.flatMap(g=>g.cards).length,31);
assert.ok(guide[5].cards[0].code.includes('compile_ultra'));assert.ok(guide[6].cards[1].code.includes('create_test_protocol -infer_asynch -infer_clock\ndft_drc -verbose'));
console.log('PASS: 52 problems; 18 numeric fixtures; 12 guide topics / 31 cards; required lab corrections.');
