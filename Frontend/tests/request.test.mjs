import test from 'node:test';
import assert from 'node:assert/strict';
import { requestJson } from '../src/api/request.ts';

test('request lifecycle handles success, errors, and stalled response bodies', async (t) => {
  const original = globalThis.fetch;
  try {
    await t.test('successful response preserves JSON', async () => {
      globalThis.fetch = async () => ({ok:true,json:async () => ({ready:true})});
      assert.deepEqual(await requestJson('/api/test'), {ready:true});
    });
    await t.test('API detail is surfaced', async () => {
      globalThis.fetch = async () => ({ok:false,status:422,json:async () => ({detail:'Checkpoint unavailable'})});
      await assert.rejects(requestJson('/api/test'), /Checkpoint unavailable/);
    });
    await t.test('non-JSON HTTP failure is readable', async () => {
      globalThis.fetch = async () => ({ok:false,status:503,json:async () => {throw new Error('HTML')}});
      await assert.rejects(requestJson('/api/test'), /HTTP 503/);
    });
    await t.test('stalled connection is aborted', async () => {
      globalThis.fetch = (_url,{signal}) => new Promise((_resolve,reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), {once:true}));
      await assert.rejects(requestJson('/api/test',{},20), /too long/);
    });
    await t.test('timeout covers response body reading', async () => {
      globalThis.fetch = async (_url,{signal}) => ({ok:true,json:() => new Promise((_resolve,reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), {once:true}))});
      await assert.rejects(requestJson('/api/test',{},20), /too long/);
    });
  } finally { globalThis.fetch=original; }
});
