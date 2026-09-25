/// <reference types="vitest/config" />
import { execSync } from 'node:child_process';
import { relative, resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { localToday } from './src/lib/dates.ts';
import { RaceFileSchema } from './src/data/schema.ts';
import { validateRaceFiles } from './src/data/validate.ts';
import { dataDirFor, readRaceFiles } from './scripts/raceFiles.ts';
import { racePageHtml } from './scripts/racePages.ts';

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

/**
 * `virtual:trimap-races`: every race record of the selected data set, validated here in
 * Node, so the browser neither ships zod nor re-validates. Invalid data fails the build
 * (and shows the Vite error overlay in dev).
 */
function raceDataModule(source: string | undefined): Plugin {
  const id = 'virtual:trimap-races';
  const resolved = `\0${id}`;
  return {
    name: 'trimap:race-data',
    resolveId(request) {
      return request === id ? resolved : undefined;
    },
    load(request) {
      if (request !== resolved) return undefined;
      const dir = dataDirFor(source);
      const files = readRaceFiles(dir);
      for (const f of files) this.addWatchFile(resolve(dir, f.name));
      const result = validateRaceFiles(files, localToday());
      if (result.errorCount) {
        const lines = result.issues
          .filter((i) => i.level === 'error')
          .slice(0, 30)
          .map((i) => `  ${i.file}${i.id ? ` [${i.id}]` : ''}: ${i.message}`);
        this.error(`Invalid race data:\n${lines.join('\n')}\nRun \`npm run validate:data\` for the full report.`);
      }
      // Ship the schema-parsed records (e.g. trimmed strings), exactly what validation approved.
      const records = files.flatMap((f) => RaceFileSchema.parse(JSON.parse(f.text)));
      // JSON.parse of a string literal is faster to evaluate than a large object literal.
      return `export default JSON.parse(${JSON.stringify(JSON.stringify(records))});`;
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

/**
 * Public URL of the site (for share previews): VITE_SITE_URL, else the GitHub Pages URL
 * of the repo (https://<owner>.github.io/<repo>/). Empty when unknown.
 */
function resolveSiteUrl(explicit: string | undefined, repoUrl: string): string {
  if (explicit) return explicit.endsWith('/') ? explicit : `${explicit}/`;
  const m = repoUrl.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)$/);
  if (!m) return '';
  const owner = m[1]!.toLowerCase();
  const repo = m[2]!;
  return repo.toLowerCase() === `${owner}.github.io`
    ? `https://${owner}.github.io/`
    : `https://${owner}.github.io/${repo}/`;
}

/**
 * Share previews and first paint:
 * - absolute og:image / og:url / canonical when the site URL is known;
 * - <link rel="preload"> for the two fonts the first screen uses;
 * - one small page per race (race/<id>/index.html) whose title and preview tags name the
 *   race, so a shared race link unfurls in chats; it forwards to ./?race=<id>.
 */
function sitePages(source: string | undefined, siteUrl: string): Plugin {
  return {
    name: 'trimap:site-pages',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        let out = html;
        if (siteUrl) {
          out = out
            .replace('content="./og-image.png"', `content="${siteUrl}og-image.png"`)
            .replace(
              '<meta name="twitter:card"',
              `<meta property="og:url" content="${siteUrl}" />\n    <link rel="canonical" href="${siteUrl}" />\n    <meta name="twitter:card"`,
            );
        }
        const fonts = Object.keys(ctx.bundle ?? {}).filter((f) =>
          /(inter-latin-wght-normal|barlow-condensed-latin-700-normal)-[\w-]+\.woff2$/.test(f),
        );
        const preload = fonts
          .map((f) => `<link rel="preload" href="./${f}" as="font" type="font/woff2" crossorigin />`)
          .join('\n    ');
        return preload ? out.replace('</title>', `</title>\n    ${preload}`) : out;
      },
    },
    generateBundle() {
      const files = readRaceFiles(dataDirFor(source));
      const result = validateRaceFiles(files, localToday());
      const names = new Map(result.races.map((r) => [r.id, r.name]));
      for (const race of result.races) {
        this.emitFile({
          type: 'asset',
          fileName: `race/${race.id}/index.html`,
          source: racePageHtml(race, siteUrl, race.continuedAs ? names.get(race.continuedAs) : undefined),
        });
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const source = process.env.VITE_RACE_DATA ?? env.VITE_RACE_DATA;
  const repoUrl = resolveRepoUrl(process.env.VITE_REPO_URL ?? env.VITE_REPO_URL);
  const siteUrl = resolveSiteUrl(process.env.VITE_SITE_URL ?? env.VITE_SITE_URL, repoUrl);
  return {
    base: './',
    define: {
      __REPO_URL__: JSON.stringify(repoUrl),
    },
    plugins: [react(), tailwindcss(), raceDataGuard(source), raceDataModule(source), sitePages(source, siteUrl)],
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
