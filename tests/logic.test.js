import test from 'node:test';
import assert from 'node:assert/strict';
import {applyPlacement,shuffle,validateCustom,pairAgreement,validPack} from '../logic.js';
import {categories} from '../data.js';

test('content library: 18 categories and 108 curated packs, every pack distinct',()=>{
 assert.equal(categories.length,18);
 assert.equal(categories.reduce((sum,c)=>sum+c.packs.length,0),108);
 const ids=new Set();for(const c of categories){assert(!ids.has(c.id));ids.add(c.id);assert(c.packs.length>=6);for(const p of c.packs)assert(validPack(p),JSON.stringify(p));}
});
test('irreversible placements: 5 reveals exactly fill each slot',()=>{
 const items=['A','B','C','D','E'];let placements=Array(5).fill(null),index=0;
 for(const slot of [1,4,0,3,2]){const r=applyPlacement(placements,items,index,slot);placements=r.placements;index=r.index;assert.equal(r.complete,index===5);}
 assert.deepEqual(placements,['C','A','E','D','B']);assert.equal(index,5);
});
test('already locked slot is rejected without mutating state',()=>{
 const items=['A','B','C','D','E'];const original=[null,'A',null,null,null];
 assert.throws(()=>applyPlacement(original,items,1,1),/locked/);assert.equal(original[1],'A');
});
test('invalid turn, invalid slots and duplicate content fail closed',()=>{
 assert.throws(()=>applyPlacement(Array(5).fill(null),['A','B','C','D','E'],2,0),/progression/);
 assert.throws(()=>applyPlacement(Array(5).fill(null),['A','B','C','D','E'],0,5),/Invalid slot/);
 assert.throws(()=>applyPlacement(Array(5).fill(null),['A','B','A','D','E'],0,0),/distinct/);
});
test('custom input validation',()=>{
 assert.equal(validateCustom('Favorite meals',['Biryani','Dosa','Pizza','Idli','Pasta']),'');
 assert.match(validateCustom('Hi',['A','B','C','D','E']),/title/);
 assert.match(validateCustom('Food debate',['Dosa','Dosa','Pizza','Rice','Bread']),/repeat/);
 assert.match(validateCustom('Food debate',['Dosa','Rice']),/exactly five/);
});
test('10-pair agreement scores are mathematically valid',()=>{
 const a=['A','B','C','D','E'];assert.equal(pairAgreement(a,a),10);assert.equal(pairAgreement(a,[...a].reverse()),0);
 assert.equal(pairAgreement(a,['B','A','C','D','E']),9);
 assert.throws(()=>pairAgreement(a,['A','B','C','D','X']),/permutations/);
});
test('shuffling preserves five distinct items',()=>{
 const arr=['A','B','C','D','E'];assert.deepEqual(shuffle(arr,()=>0),['B','C','D','E','A']);assert.deepEqual(arr,['A','B','C','D','E']);
});
