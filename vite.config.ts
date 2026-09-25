/// <reference types="vitest/config" />
import { execSync } from 'node:child_process';
import { relative } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { localToday } from './src/lib/dates.ts';
import { validateRaceFiles } from './src/data/validate.ts';
import { dataDirFor, readRaceFiles } from './scripts/raceFiles.ts';

/**
 * Fails the production build when the race data is missing or invalid, so a broken data
 * file can never be deployed. (`npm run validate:data` is the main, more verbose gate.)
 */
function raceDataGuard(source: string | undefined): Plugin {
  return {
    name: 'trimap:race-data-guard',
    apply: 'build',
    buildStart() {
      const dir = dataDirFor(source);
      const files = readRaceFiles(dir);
      const rel = relative(process.cwd(), dir);
      if (!files.length) this.error(`No race data found: ${rel}/*.json is empty or missing.`);
      const result = validateRaceFiles(files, localToday());
      if (result.errorCount) {
        const lines = result.issues
          .filter((i) => i.level === 'error')
          .slice(0, 30)
          .map((i) => `  ${i.file}${i.id ? ` [${i.id}]` : ''}: ${i.message}`);
        this.error(
          `Race data in ${rel} has ${result.errorCount} error(s):\n${lines.join('\n')}\nRun \`npm run validate:data\` for the full report.`,
        );
      }
      this.info?.(
        `race data: ${result.races.length} races from ${files.length} files in ${rel} (${result.warningCount} warnings)`,
      );
    },
  };
}

/** Public GitHub URL of this repo: VITE_REPO_URL, else GitHub Actions env, else the git remote. */
function resolveRepoUrl(explicit: string | undefined): string {
  if (explicit) return explicit;
  if (process.env.GITHUB_REPOSITORY) {
    return `${process.env.GITHUB_SERVER_URL ?? 'https://github.com'}/${process.env.GITHUB_REPOSITORY}`;
  }
  try {
    const remote = execSync('git remote get-url origin', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
    const m = remote.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
    if (m) return `https://github.com/${m[1]}`;
  } catch {
    /* no git or no remote */
  }
  return '';
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const source = process.env.VITE_RACE_DATA ?? env.VITE_RACE_DATA;
  return {
    base: './',
    define: {
      __REPO_URL__: JSON.stringify(resolveRepoUrl(process.env.VITE_REPO_URL ?? env.VITE_REPO_URL)),
    },
    plugins: [react(), tailwindcss(), raceDataGuard(source)],
    worker: { format: 'es' },
    build: {
      target: 'es2022',
      chunkSizeWarningLimit: 1200,
    },
    server: {
      port: 5173,
    },
    test: {
      include: ['tests/unit/**/*.test.ts'],
      environment: 'node',
    },
  };
});
