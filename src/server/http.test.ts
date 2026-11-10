import { describe, expect, it } from 'vitest';
import { guardPost } from './http';

const post = (headers: Record<string, string>) => new Request('https://spaceminer.test/api/claims', { method: 'POST', headers: { host: 'spaceminer.test', ...headers }, body: '{}' });

describe('guardPost', () => {
  it('lets same-site JSON through', () => {
    expect(guardPost(post({ 'content-type': 'application/json' }))).toBeNull();
    expect(guardPost(post({ 'content-type': 'application/json; charset=utf-8', origin: 'https://spaceminer.test' }))).toBeNull();
  });
  it('rejects bodies not declared as JSON (cross-site forms)', () => {
    expect(guardPost(post({ 'content-type': 'text/plain' }))?.status).toBe(415);
    expect(guardPost(post({}))?.status).toBe(415);
  });
  it('rejects requests from another origin', () => {
    expect(guardPost(post({ 'content-type': 'application/json', origin: 'https://evil.test' }))?.status).toBe(403);
    expect(guardPost(post({ 'content-type': 'application/json', origin: 'null' }))?.status).toBe(403);
  });
});
