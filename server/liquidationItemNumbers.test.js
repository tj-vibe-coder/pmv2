'use strict';
const { test } = require('node:test'); const assert = require('node:assert/strict');
const express = require('express'); const fs = require('node:fs'); const vm = require('node:vm');
const { physicalNumbering, numberedRows, prepareNumberedRows, reserveNumberedRows, chronologicalRows } = require('./liquidationItemNumbers');
const { createLiquidationItemNumbersRouter } = require('./liquidationItemNumbersRouter');
const { receiptReviewHash } = require('./liquidationReceiptReview');
const { FinanceFirestore } = require('./test-support/financeFirestore');
const fixture = require('../src/utils/liquidation/__fixtures__/lq016-physical-order.json');
const saved = () => ({ user_id: 'kim', status: 'submitted', form_no: fixture.formNo, total_amount: 13828,
  rows_json: JSON.stringify(fixture.rows.map(({ expectedPhysicalItemNo, ...row }) => row)),
  receipts_json: JSON.stringify([{ id: 'paper7', rowId: fixture.targetRowId, oneDriveId: 'original-paper', filename: 'physical-receipt.pdf' }]) });
test('all 27 legacy references match the verified physical chronology, not stored positions', () => {
  const liq = saved(); const numbering = physicalNumbering(liq);
  assert.equal(numbering.numbers[fixture.targetRowId], 7);
  assert.equal(JSON.parse(liq.rows_json).findIndex(r => r.id === fixture.targetRowId), 3);
  for (const row of fixture.rows) assert.equal(numbering.numbers[row.id], row.expectedPhysicalItemNo);
});
test('date/amount corrections and display order preserve every physical number and receipt link', () => {
  const liq = saved(); const rows = numberedRows(liq);
  const changed = rows.map(row => row.id === fixture.targetRowId ? { ...row, date: '2026-06-29', amount: 600 } : row);
  assert.equal(chronologicalRows(changed)[0].physicalItemNo, 7);
  const prepared = prepareNumberedRows([...changed].reverse(), liq, { id: 'rj' });
  const after = { ...liq, rows_json: JSON.stringify(prepared.rows), physical_item_numbering: prepared.numbering };
  for (const row of numberedRows(after)) assert.equal(row.physicalItemNo, physicalNumbering(liq).numbers[row.id]);
  assert.equal(numberedRows(after).find(r => r.id === fixture.targetRowId).physicalItemNo, 7);
  assert.equal(after.receipts_json, liq.receipts_json);
  assert.deepEqual(numberedRows(after).sort((a,b) => b.amount-a.amount).map(r => [r.id,r.physicalItemNo]).sort(), numberedRows(liq).map(r=>[r.id,r.physicalItemNo]).sort());
});
test('deletion/re-addition and new rows do not reuse old physical references', () => {
  const liq = saved(); const first = prepareNumberedRows(numberedRows(liq).filter(r=>r.id!==fixture.targetRowId), liq);
  const current = { ...liq, rows_json: JSON.stringify(first.rows), physical_item_numbering: first.numbering };
  const next = prepareNumberedRows([...first.rows, { id:'new-expense',date:'2026-01-01',amount:50 }],current);
  assert.equal(next.numbering.numbers['new-expense'],28); assert.equal(next.numbering.numbers[fixture.targetRowId],7);
  assert.equal(next.numbering.nextItemNo,29);
  assert.throws(()=>prepareNumberedRows([...first.rows,{id:'new-expense',physicalItemNo:7}],current),/reserved/);
  assert.throws(()=>prepareNumberedRows(numberedRows(liq).map(r=>({...r,physicalItemNo:1})),liq),/cannot change/);
});
test('malformed IDs, duplicate numbers and corrupted ledgers fail closed', () => {
  assert.throws(()=>prepareNumberedRows([{id:'a'},{id:'a'}]),/unique permanent/);
  assert.throws(()=>prepareNumberedRows([{id:'a',physicalItemNo:0}]),/positive integer/);
  assert.throws(()=>physicalNumbering({...saved(),physical_item_numbering:{version:1,numbers:{a:1,b:1},nextItemNo:2}}),/Invalid saved/);
});
test('transactional reservations keep concurrent new-item numbers unique and never overwrite older reservations', async () => {
  const db = new FinanceFirestore({ liquidations: { liq:saved() } }); const ref=db.collection('liquidations').doc('liq');
  const rows=numberedRows(saved());
  const results=await Promise.allSettled(['a','b'].map(id=>reserveNumberedRows(db,ref,[...rows,{id,physicalItemNo:28,date:'2026-10-15'}],{id:'rj'})));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  const state=db.store.liquidations.liq.physical_item_numbering;
  assert.equal(state.nextItemNo,29); assert.equal(state.numbers[fixture.targetRowId],7);
  assert.equal(db.store.liquidations.liq.rows_json,saved().rows_json);
});
async function server(t, seed = saved()) {
  const db=new FinanceFirestore({liquidations:{liq:seed}}); const app=express();app.use(express.json());
  app.use('/api/liquidations',createLiquidationItemNumbersRouter({db,requireActiveUser:async(req,res)=>{
    if(!req.headers['x-role']){res.status(401).json({error:'Unauthorized'});return null;}
    return {id:req.headers['x-user']||'rj',role:req.headers['x-role'],scannerScope:req.headers['x-scanner']};
  }}));
  const listener=app.listen(0,'127.0.0.1');await new Promise(r=>listener.once('listening',r));t.after(()=>new Promise(r=>listener.close(r)));
  const request=async(body,role='superadmin',user='rj',scanner='')=>{const res=await fetch(`http://127.0.0.1:${listener.address().port}/api/liquidations/liq/item-numbering/initialize`,{method:'POST',headers:{'Content-Type':'application/json','x-role':role,'x-user':user,'x-scanner':scanner},body:JSON.stringify(body)});return{status:res.status,body:await res.json()};};
  return {db,request,body:{expectedContentHash:receiptReviewHash(seed),expectedItemNumbers:physicalNumbering(seed).numbers}};
}
test('explicit initialization is metadata-only, hash/mapping-guarded, idempotent and actor-audited',async t=>{
  const s=await server(t); const before=structuredClone(s.db.store.liquidations.liq);
  assert.equal((await s.request(s.body)).status,200);
  const after={...s.db.store.liquidations.liq};delete after.physical_item_numbering;assert.deepEqual(after,before);
  assert.equal(receiptReviewHash(s.db.store.liquidations.liq),s.body.expectedContentHash);
  assert.equal(s.db.store.liquidations.liq.physical_item_numbering.numbers[fixture.targetRowId],7);
  assert.equal((await s.request(s.body)).body.alreadyInitialized,true);
  assert.equal(Object.keys(s.db.store['liquidations/liq/item_numbering_history']).length,1);
  assert.equal(s.db.store.liquidations.liq.physical_item_numbering.initializedBy,'rj');
});
test('initializer rejects wrong mapping, stale data, pending revisions, wrong owner and scanner without writes',async t=>{
  const s=await server(t);
  for(const [body,role,user,scanner,status] of [[{...s.body,expectedContentHash:'stale'},'superadmin','rj','',409],
    [{...s.body,expectedItemNumbers:{}},'superadmin','rj','',409],[s.body,'user','other','',403],[s.body,'tax_filer','rj','',403],[s.body,'superadmin','rj','scan',403]]) {
    assert.equal((await s.request(body,role,user,scanner)).status,status); assert.equal(s.db.store.liquidations.liq.physical_item_numbering,undefined);
  }
  s.db.store.liquidations.liq.pending_revision={rows_json:'[]'};assert.equal((await s.request(s.body)).status,409);
});
for(const file of ['server.js','functions/server.js'])test(`${file}: GET returns the same 27-reference preview without saving or changing content hash`,async()=>{
  const source=fs.readFileSync(file,'utf8'); const a=source.indexOf("app.get('/api/liquidations/:id'");const b=source.indexOf("app.post('/api/liquidations',",a);let handler;
  const db=new FinanceFirestore({liquidations:{liq:saved()}});const before=structuredClone(db.store);
  vm.runInNewContext(source.slice(a,b),{app:{get:(_path,fn)=>{handler=fn;}},getCurrentUser:async()=>({role:'superadmin'}),db,require:name=>require('../'+name),console});
  let result;const res={status(){return this;},json(body){result=body;}};await handler({params:{id:'liq'}},res);
  assert.equal(result.success,true); assert.equal(JSON.parse(result.liquidation.rows_json).find(r=>r.id===fixture.targetRowId).physicalItemNo,7);
  assert.equal(result.liquidation.receipt_review_content_hash,receiptReviewHash(saved()));assert.deepEqual(db.store,before);
});
for (const file of ['server.js','functions/server.js']) {
  test(`${file}: draft update and pending proposal pin the saved pre-correction numbering`, async()=>{
    for (const kind of ['draft','proposal']) {
      const source=fs.readFileSync(file,'utf8');
      const start=source.indexOf(kind==='draft'?"app.put('/api/liquidations/:id'":"app.post('/api/liquidations/:id/propose-edit'");
      const end=source.indexOf(kind==='draft'?'// Admin-only: mark an out-of-pocket':"app.post('/api/liquidations/:id/revision/approve'",start);
      const liq={...saved(),status:kind==='draft'?'draft':'submitted'};
      const db=new FinanceFirestore({liquidations:{liq}});let handler;let result;let status=200;
      const context={app:{put:(_path,fn)=>handler=fn,post:(_path,fn)=>handler=fn},db,
        getCurrentUser:async()=>({id:'kim',role:'user',full_name:'Kim'}),console,
        parseLiqRows:raw=>typeof raw==='string'?JSON.parse(raw):raw||[],require:name=>require('../'+name)};
      vm.runInNewContext(source.slice(start,end),context);
      const changed=numberedRows(liq).map(row=>row.id===fixture.targetRowId?{...row,date:'2026-06-29'}:row);
      const res={status(code){status=code;return this;},json(body){result=body;return this;}};
      await handler({params:{id:'liq'},body:{rows_json:changed,receipts_json:JSON.parse(liq.receipts_json),total_amount:13828,status:kind==='draft'?'draft':'submitted'}},res);
      assert.equal(status,200);assert.equal(result.success,true);
      if(kind!=='draft')assert.equal(db.store.liquidations.liq.physical_item_numbering.numbers[fixture.targetRowId],7);
      if(kind==='draft'){
        // Drafts have no paper copy yet: numbers follow the corrected dates.
        const expected=Object.fromEntries(chronologicalRows(changed).map((row,i)=>[row.id,i+1]));
        assert.deepEqual(db.store.liquidations.liq.physical_item_numbering.numbers,expected);
        assert.equal(JSON.parse(db.store.liquidations.liq.rows_json).find(r=>r.id===fixture.targetRowId).date,'2026-06-29');
      }else{
        assert.equal(JSON.parse(db.store.liquidations.liq.pending_revision.rows_json).find(r=>r.id===fixture.targetRowId).physicalItemNo,7);
        assert.equal(db.store.liquidations.liq.rows_json,liq.rows_json);
      }
    }
  });
}
test('migration 004 only plans explicit forms and preserves the verified LQ016 baseline',()=>{
  const {plan}=require('../scripts/migrations/004-physical-item-numbers');
  const liq={id:'lq016',...saved()};
  assert.throws(()=>plan({liquidations:[liq]},[]),/Explicit/);
  const manifest=plan({liquidations:[liq]},['lq016']);
  assert.equal(manifest.operations[0].body.expectedItemNumbers[fixture.targetRowId],7);
  assert.equal(manifest.operations[0].body.expectedContentHash,receiptReviewHash(liq));
  assert.throws(()=>plan({liquidations:[{...liq,pending_revision:{}}]},['lq016']),/pending/);
});
test('Functions predeploy includes the numbering core and initialization router',()=>{
  const path=require('node:path');const {execFileSync}=require('node:child_process');
  const dir=fs.mkdtempSync(path.join(process.cwd(),'.physical-numbering-package-'));
  try{
    fs.mkdirSync(path.join(dir,'scripts'));fs.mkdirSync(path.join(dir,'server'));
    fs.copyFileSync('scripts/prepare-functions.js',path.join(dir,'scripts/prepare-functions.js'));
    for(const name of ['liquidationItemNumbers.js','liquidationItemNumbersRouter.js','liquidationReceiptReview.js'])fs.copyFileSync(`server/${name}`,path.join(dir,'server',name));
    fs.writeFileSync(path.join(dir,'server.js'),"module.exports=require('./server/liquidationItemNumbersRouter');\n");
    execFileSync(process.execPath,['scripts/prepare-functions.js'],{cwd:dir,stdio:'pipe'});
    assert.equal(typeof require(path.join(dir,'functions/server.js')).createLiquidationItemNumbersRouter,'function');
    const bundled=require(path.join(dir,'functions/server/liquidationItemNumbers.js'));
    assert.equal(bundled.physicalNumbering(saved()).numbers[fixture.targetRowId],7);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('draft lines are numbered by date on every save, ignoring client hints', () => {
  const { draftNumberedRows } = require('./liquidationItemNumbers');
  // The order RJ added them on LQ26-022: newest first. Hints follow entry order.
  const raw = [
    { id: 'oct14', date: '2026-10-14', amount: 3994, physicalItemNo: 1 },
    { id: 'sep22', date: '2026-09-22', amount: 870, physicalItemNo: 2 },
    { id: 'sep16', date: '2026-09-16', amount: 2044, physicalItemNo: 3 },
    { id: 'sep18', date: '2026-09-18', amount: 500, physicalItemNo: 4 },
    { id: 'nodate', date: '', amount: 1 },
  ];
  const { rows, numbering } = draftNumberedRows(raw, { id: 'rj' });
  assert.deepEqual(numbering.numbers, { sep16: 1, sep18: 2, sep22: 3, oct14: 4, nodate: 5 });
  assert.equal(numbering.nextItemNo, 6);
  assert.equal(numbering.basis, 'draft-date-order');
  assert.ok(rows.every(r => !('physicalItemNo' in r)));
  assert.deepEqual(rows.map(r => r.id), raw.map(r => r.id));
  // Once submitted, the ledger is fixed: a later exception line takes the next number.
  const submitted = { rows_json: JSON.stringify(rows), physical_item_numbering: numbering };
  const next = prepareNumberedRows([...rows, { id: 'late', date: '2026-09-01', amount: 5 }], submitted);
  assert.equal(next.numbering.numbers.late, 6);
  assert.equal(next.numbering.numbers.sep16, 1);
});
