/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "fixtures" loads tests/fixtures/races instead of data/races. */
  readonly VITE_RACE_DATA?: string;
  readonly VITE_REPO_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** GitHub repository URL resolved at build time (env, GitHub Actions or git remote). */
declare const __REPO_URL__: string;
