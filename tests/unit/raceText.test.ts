import { describe, expect, it } from 'vitest';
import {
  courseSummary,
  firstYear,
  isWorldChampionship,
  raceLink,
  shortChampionship,
  whenText,
} from '../../src/lib/raceText.ts';
import { DISTANCES } from '../../src/data/brands.ts';

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
    expect(shortChampionship('T100 Triathlon World Championship Final')).toBe('World Championship Final');
    expect(raceLink('challenge-roth-full', 'https://x.github.io/tri-map/?region=europe#top')).toBe(
      'https://x.github.io/tri-map/?race=challenge-roth-full',
    );
    expect(raceLink('challenge-roth-full', 'https://x.github.io/tri-map/index.html?q=a#t', { page: true })).toBe(
      'https://x.github.io/tri-map/race/challenge-roth-full/',
    );
  });

  it('keeps World Championships prominent and treats other titles as regional', () => {
    expect(isWorldChampionship('IRONMAN World Championship')).toBe(true);
    expect(isWorldChampionship('IRONMAN 70.3 World Championship')).toBe(true);
    expect(isWorldChampionship('T100 Triathlon World Championship Final')).toBe(true);
    expect(isWorldChampionship('IRONMAN European Championship')).toBe(false);
    expect(isWorldChampionship('The Championship (Challenge Family)')).toBe(false);
  });

  it('describes course profiles, successor years and the T100 distance', () => {
    expect(courseSummary({ bike: 'hilly', run: 'flat' })).toBe('hilly bike, flat run');
    expect(courseSummary({ run: 'rolling' })).toBe('rolling run');
    expect(courseSummary({})).toBe('');
    expect(
      firstYear({
        editions: [
          { date: '2027-02-20', status: 'cancelled' },
          { date: '2028-02-19', status: 'confirmed' },
        ],
      }),
    ).toBe('2028');
    expect(DISTANCES.t100.badge).toBe('T100 · 100 km');
    expect(DISTANCES.full.badge).toBe('Full');
  });
});
