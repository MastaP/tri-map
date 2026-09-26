/**
 * npm run refresh:t100 [-- --dry-run]
 *
 * Reads the registration status of the T100 World Championship Tour races mapped in
 * data/registration/t100-sources.json and writes data/registration/t100.json: the next
 * edition from the PTO entry platform, its status from t100triathlon.com (or, when that
 * cannot be read, from the platform's explicit signals only). The deploy workflow runs it
 * before every build (daily), so each deploy bundles a fresh status; if it fails or runs
 * out of time, the build uses the committed file.
 *
 * Nothing is written (exit 1) when most requests fail or no edition could be read; a race
 * whose status cannot be read keeps its previous status for the same edition. It stops
 * making requests after 3 minutes (see T100_LIMITS in scripts/registration/run.ts).
 */
import { runT100Refresh } from './registration/run.ts';

process.exitCode = (await runT100Refresh({ dryRun: process.argv.includes('--dry-run') })) ? 0 : 1;
