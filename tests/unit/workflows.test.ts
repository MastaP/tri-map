import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const deploy = readFileSync(join(import.meta.dirname, '..', '..', '.github', 'workflows', 'deploy.yml'), 'utf8');

/** The `on:` block of the workflow (up to the next top-level key). */
const triggers = deploy.match(/^on:\n((?:[ #].*\n|\n)*)/m)?.[1] ?? '';

describe('deploy workflow', () => {
  it('rebuilds daily, so the T100 registration status and the per-race pages do not go stale', () => {
    const cron = triggers.match(/^ {2}schedule:\n {4}- cron: '([^']+)'/m)?.[1];
    expect(cron).toBe('0 5 * * *'); // every day 05:00 UTC
    expect(cron!.split(' ')).toHaveLength(5);
  });

  it('refreshes the T100 status before validating and building, without failing the deploy', () => {
    const steps = deploy.slice(deploy.indexOf('steps:'));
    const refresh = steps.indexOf('npm run refresh:t100');
    expect(refresh).toBeGreaterThan(steps.indexOf('npm ci'));
    expect(refresh).toBeLessThan(steps.indexOf('npm run validate:data'));
    expect(refresh).toBeLessThan(steps.indexOf('npm run build'));
    // A failed refresh logs a warning and the build uses the committed file.
    expect(steps).toMatch(/run: npm run refresh:t100 \|\| echo "::warning::[^"]+"/);
  });

  it('bounds the T100 refresh step in time, and a failure or timeout of it never fails the deploy', () => {
    const step = deploy.match(/^ {6}- name: Refresh T100 registration status\n((?: {8}.*\n)+)/m)?.[1] ?? '';
    expect(step).toMatch(/^ {8}timeout-minutes: 5$/m);
    expect(step).toMatch(/^ {8}continue-on-error: true$/m);
    expect(step).toMatch(/^ {8}run: npm run refresh:t100 /m);
  });

  it('never runs the IRONMAN refresh (ironman.com blocks GitHub-hosted runners)', () => {
    expect(deploy).not.toMatch(/run:.*refresh:(ironman|registration)/);
  });

  it('keeps deploying on push to main, on demand, with the Pages permissions', () => {
    expect(triggers).toMatch(/^ {2}push:\n {4}branches: \[main\]$/m);
    expect(triggers).toMatch(/^ {2}workflow_dispatch:$/m);
    expect(deploy).toMatch(/^permissions:\n {2}contents: read\n {2}pages: write\n {2}id-token: write$/m);
  });
});
