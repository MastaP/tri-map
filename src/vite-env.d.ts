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

/** Race records from data/races (or the fixtures), validated at build time. */
declare module 'virtual:trimap-races' {
  const records: import('./data/schema.ts').RaceRecord[];
  export default records;
}

/** Registration status files from data/registration (or the fixtures), validated at build time. */
declare module 'virtual:trimap-registration' {
  const data: import('./data/registration.ts').RegistrationData;
  export default data;
}
