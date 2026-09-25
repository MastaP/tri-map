import { describe, expect, it } from 'vitest';
import { raceLink, shortChampionship, whenText } from '../../src/lib/raceText.ts';

describe('race text helpers', () => {
  it('describes upcoming, running, estimated and missing dates', () => {
    const today = '2026-09-25';
    expect(whenText({ estimated: false, date: '2026-10-30', status: 'confirmed' }, today)).toBe('in 5 weeks');
    // A multi-day race that started yesterday and ends tomorrow is "on now", not "yesterday".
    expect(whenText({ estimated: false, date: '2026-09-24', endDate: '2026-09-26', status: 'confirmed' }, today)).toBe(
      'on now',
    );
    expect(whenText({ estimated: true, date: '2027-07-04', status: 'estimated', basedOn: '2026-07-05' }, today)).toBe(
      '≈ Jul 2027 · date TBA',
    );
    expect(whenText(null, today)).toBe('No upcoming date');
  });

  it('shortens championship names and builds race links', () => {
    expect(shortChampionship('IRONMAN 70.3 World Championship')).toBe('World Championship');
    expect(shortChampionship('Challenge Family European Championship')).toBe('European Championship');
    expect(raceLink('challenge-roth-full', 'https://x.github.io/tri-map/?region=europe#top')).toBe(
      'https://x.github.io/tri-map/?race=challenge-roth-full',
    );
  });
});
