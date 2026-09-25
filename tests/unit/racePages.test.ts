import { describe, expect, it } from 'vitest';
import { racePageHtml, raceWhenText } from '../../scripts/racePages.ts';
import { fixtureRaces, TODAY } from './helpers.ts';

const races = fixtureRaces();
const race = (id: string) => races.find((r) => r.id === id)!;
const meta = (html: string, name: string) =>
  html.match(new RegExp(`<meta (?:name|property)="${name}" content="([^"]*)"`))?.[1];

describe('per-race share pages', () => {
  it('names the race and its next announced date', () => {
    const html = racePageHtml(race('ironman-frankfurt-full'), 'https://x.github.io/tri-map/', undefined, TODAY);
    expect(html).toContain('<title>IRONMAN Frankfurt · Sun 27 Jun 2027 · TriMap</title>');
    expect(meta(html, 'og:description')).toBe(
      'Sun 27 Jun 2027 · Frankfurt am Main, Germany · Full distance (3.8 / 180 / 42.2 km). Open entry.',
    );
  });

  it('never states an estimated date: the next date is "not announced yet"', () => {
    const roth = race('challenge-roth-full');
    expect(roth.nextEdition?.estimated).toBe(true);
    expect(raceWhenText(roth)).toBeNull();
    const html = racePageHtml(roth, '', undefined, TODAY);
    expect(html).toContain('<title>Challenge Roth · TriMap</title>');
    expect(meta(html, 'og:description')).toBe(
      'Next date not announced yet · last held Sun 5 Jul 2026 · Roth, Germany · Full distance (3.8 / 180 / 42.2 km). Open entry.',
    );
    expect(html).not.toMatch(/≈|TBA|2027/);
  });

  it('gives the official km of a near-standard race', () => {
    const html = racePageHtml(race('independent-celtman-full'), '', undefined, TODAY);
    expect(meta(html, 'og:description')).toBe(
      'Sat 19 Jun 2027 · Shieldaig, United Kingdom · Non-standard full distance (3.4 / 202 / 41 km). Entry by ballot.',
    );
  });

  it('points a replaced race at its successor', () => {
    const html = racePageHtml(race('challenge-wanaka-half'), '', 'T100 Wanaka', TODAY);
    expect(meta(html, 'og:description')).toBe(
      'No future edition announced · Wānaka, New Zealand · Half distance (1.9 / 90 / 21.1 km). Continues as T100 Wanaka.',
    );
  });
});
