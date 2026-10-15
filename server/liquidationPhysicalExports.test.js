'use strict';
const { test } = require('node:test'); const assert = require('node:assert/strict');
const fs = require('node:fs'); const vm = require('node:vm'); const ts = require('typescript');
const { jsPDF: RealPdf } = require('jspdf'); const { autoTable: realTable } = require('jspdf-autotable'); const XLSX = require('xlsx');
const fixture = require('../src/utils/liquidation/__fixtures__/lq016-physical-order.json');
const { numberedRows } = require('./liquidationItemNumbers');
const source=ts.createSourceFile('LiquidationFormPage.tsx',fs.readFileSync('src/components/LiquidationFormPage.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const helpers={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/utils/liquidation/receiptRows.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,helpers);
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/utils/liquidationDocNo.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,helpers);
function actualExport(name,context){
  let initializer;
  function visit(node){if(ts.isVariableDeclaration(node)&&node.name.getText(source)===name)initializer=node.initializer;ts.forEachChild(node,visit);}visit(source);
  assert.ok(initializer,`${name} exists`);
  const js=ts.transpileModule(`var run = ${initializer.getText(source)};`,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  vm.createContext(context);vm.runInContext(js,context);return context.run;
}
function data(){
  const rows=numberedRows({rows_json:fixture.rows}).map(row=>({...row,particulars:row.id===fixture.targetRowId?'Diesel physical Item7':'Fixture expense',date:row.id===fixture.targetRowId?'2026-06-29':row.date}));
  return {rows,formNo:fixture.formNo,dateOfSubmission:'2026-09-02',employeeName:'Fixture Employee',employeeNumber:'',totalAmount:rows.reduce((n,r)=>n+r.amount,0),...helpers.exports};
}
test('actual PDF generator retains Item7 after correction, all27 numbers and receipt caption',async()=>{
  let buffer;const bodies=[];const texts=[];
  function CapturedPdf(options){const doc=new RealPdf(options);const text=doc.text.bind(doc);doc.text=(value,...args)=>{texts.push(Array.isArray(value)?value.join(' '):String(value));return text(value,...args);};doc.save=()=>{buffer=Buffer.from(doc.output('arraybuffer'));};return doc;}
  const context={...data(),jsPDF:CapturedPdf,autoTable:(doc,options)=>{bodies.push(...options.body);return realTable(doc,options);},arialNarrowBase64:'',process:{env:{}},require:()=>{throw new Error('Logo omitted in export fixture');},exports:{},user:{full_name:'Fixture Employee'},loadedReimb:null,caId:'',selectedCa:null,
    receipts:[{rowId:fixture.targetRowId,filename:'physical-item7.pdf'}],isImageReceipt:()=>false,isCorporateOneDriveConfigured:()=>false,oneDriveSignedIn:false,setSubmitSuccess:()=>{}};
  await actualExport('exportToPDF',context)();
  assert.equal(buffer.subarray(0,5).toString(),'%PDF-');assert.equal(bodies[0][0],'7');assert.equal(bodies[0][1],'2026-06-29');
  assert.deepEqual(bodies.map(row=>Number(row[0])).sort((a,b)=>a-b),Array.from({length:27},(_,i)=>i+1));
  assert.ok(texts.some(text=>text.includes('Item 7')&&text.includes('physical-item7.pdf')));
  fs.writeFileSync('/tmp/ioct-lq016-fixed-numbering-fixture.pdf',buffer);
});
test('actual XLSX generator preserves the same27 fixed item references',()=>{
  let buffer;const context={...data(),XLSX:{...XLSX,writeFile:wb=>{buffer=XLSX.write(wb,{bookType:'xlsx',type:'buffer'});}}};
  actualExport('handleExport',context)();const wb=XLSX.read(buffer,{type:'buffer'});const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1});
  assert.equal(rows[3][0],'Item #');assert.equal(rows[4][0],7);assert.equal(rows[4][1],'2026-06-29');
  assert.deepEqual(rows.slice(4).map(row=>row[0]).sort((a,b)=>a-b),Array.from({length:27},(_,i)=>i+1));
});
