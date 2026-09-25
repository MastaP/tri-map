import type { Race } from './data/types.ts';

/** GitHub repository URL; empty when unknown (local build without a remote). */
export const REPO_URL: string = __REPO_URL__.replace(/\/+$/, '');

/** "Report a correction" link: a pre-filled GitHub issue. */
export function correctionUrl(race?: Race): string | null {
  if (!REPO_URL) return null;
  const title = race ? `Correction: ${race.name} (${race.id})` : 'Race data correction';
  const body = race
    ? `Race: ${race.name}\nId: \`${race.id}\`\nOfficial page: ${race.url}\n\nWhat is wrong / what should it be?\n\nSource confirming the correct information:\n`
    : 'Which race, what is wrong, and a source confirming the correct information:\n';
  return `${REPO_URL}/issues/new?${new URLSearchParams({ title, body, labels: 'data' }).toString()}`;
}
