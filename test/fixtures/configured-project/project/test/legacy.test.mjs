import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv } from '../src/csv.mjs';
import { importTasks } from '../src/tasks.mjs';
test('existing simple CSV API', () => assert.deepEqual(parseCsv('id,title,status\na,First,todo\n'), [['id','title','status'],['a','First','todo']]));
test('existing successful upsert API', () => { const result=importTasks([{id:'a',title:'Old',done:false}], 'id,title,status\na,New,done\nb,Second,todo\n');assert.equal(result.added,1);assert.equal(result.updated,1);assert.deepEqual(result.tasks.map(t=>[t.id,t.title,t.done]),[['a','New',true],['b','Second',false]]); });
test('existing regression: a later bad row must not change input', () => { const existing=[{id:'a',title:'Original',done:false}];assert.throws(()=>importTasks(existing,'id,title,status\na,Changed,done\nb,Bad,invalid\n'));assert.deepEqual(existing,[{id:'a',title:'Original',done:false}]); });
