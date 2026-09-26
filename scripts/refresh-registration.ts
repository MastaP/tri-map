/**
 * npm run refresh:registration [-- --dry-run]
 *
 * Both registration refreshes, one after the other: IRONMAN (ironman.com, by hand only)
 * then T100. The T100 refresh runs even when the IRONMAN one fails; the exit code is 1 when
 * either failed (each leaves its committed file unchanged when it fails). Never run in CI:
 * the IRONMAN refresh refuses to run in GitHub Actions; the deploy workflow runs only
 * `npm run refresh:t100`.
 */
import { runIronmanRefresh, runT100Refresh } from './registration/run.ts';

const dryRun = process.argv.includes('--dry-run');
console.log('── IRONMAN ──');
const ironman = await runIronmanRefresh({ dryRun });
console.log('\n── T100 ──');
const t100 = await runT100Refresh({ dryRun });
console.log(`\nIRONMAN: ${ironman ? 'ok' : 'FAILED'} · T100: ${t100 ? 'ok' : 'FAILED'}`);
process.exitCode = ironman && t100 ? 0 : 1;
