import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const deploy = readFileSync(join(import.meta.dirname, '..', '..', '.github', 'workflows', 'deploy.yml'), 'utf8');

/** The `on:` block of the workflow (up to the next top-level key). */
const triggers = deploy.match(/^on:\n((?:[ #].*\n|\n)*)/m)?.[1] ?? '';

describe('deploy workflow', () => {
  it('rebuilds weekly, so the per-race pages and their next dates do not go stale', () => {
    const cron = triggers.match(/^ {2}schedule:\n {4}- cron: '([^']+)'/m)?.[1];
    expect(cron).toBe('0 5 * * 1'); // Mondays 05:00 UTC
    expect(cron!.split(' ')).toHaveLength(5);
  });

  it('keeps deploying on push to main, on demand, with the Pages permissions', () => {
    expect(triggers).toMatch(/^ {2}push:\n {4}branches: \[main\]$/m);
    expect(triggers).toMatch(/^ {2}workflow_dispatch:$/m);
    expect(deploy).toMatch(/^permissions:\n {2}contents: read\n {2}pages: write\n {2}id-token: write$/m);
  });
});
