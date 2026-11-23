import { describe, expect, it } from 'vitest';
import { nearbyRaces, racePageHtml, raceWhenText } from '../../scripts/racePages.ts';
import { robotsTxt, sitemapXml } from '../../scripts/sitemap.ts';
import { attachRegistration, type RegistrationData } from '../../src/data/registration.ts';
import { fixtureRaces, fixtureRegistrationFiles, TODAY } from './helpers.ts';

const SITE = 'https://x.github.io/tri-map/';
const registration = Object.fromEntries(
  fixtureRegistrationFiles().map((f) => [f.name.replace(/\.json$/, ''), JSON.parse(f.text)]),
) as RegistrationData;
const races = attachRegistration(fixtureRaces(), registration, TODAY);
const race = (id: string) => races.find((r) => r.id === id)!;
const meta = (html: string, name: string) =>
  html.match(new RegExp(`<meta (?:name|property)="${name}" content="([^"]*)"`))?.[1];
const page = (id: string, extra: Partial<Parameters<typeof racePageHtml>[1]> = {}) =>
  racePageHtml(race(id), { siteUrl: '', today: TODAY, ...extra });
/** The schema.org event data of a page, if any. */
const eventData = (html: string) => {
  const m = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s);
  return m ? (JSON.parse(m[1]!) as Record<string, unknown>) : null;
};
/** The text of the page body, tags dropped. */
const bodyText = (html: string) =>
  html
    .slice(html.indexOf('<body>'))
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

describe('per-race pages', () => {
  it('names the race and its next announced date', () => {
    const html = page('ironman-frankfurt-full', { siteUrl: SITE });
    expect(html).toContain('<title>IRONMAN Frankfurt · Sun 27 Jun 2027 · TriMap</title>');
    expect(meta(html, 'og:description')).toBe(
      'Sun 27 Jun 2027 · Frankfurt am Main, Germany · Full distance (3.8 / 180 / 42.2 km). Open entry.',
    );
    expect(html).toContain('<link rel="canonical" href="https://x.github.io/tri-map/race/ironman-frankfurt-full/" />');
    // The app's icons, with a PNG for browsers without SVG favicons and one for iOS.
    expect(html).toContain('<link rel="icon" type="image/svg+xml" href="../../favicon.svg" />');
    expect(html).toContain('<link rel="icon" type="image/png" sizes="32x32" href="../../favicon-32.png" />');
    expect(html).toContain('<link rel="apple-touch-icon" href="../../apple-touch-icon.png" />');
  });

  it('is a page of its own: the race details, readable without JavaScript, and a link into the app', () => {
    const html = page('ironman-frankfurt-full');
    expect(html).not.toMatch(/http-equiv="refresh"|location\.replace/);
    expect(html).toContain('<a class="btn primary" href="../../?race=ironman-frankfurt-full">Open on the map</a>');
    const text = bodyText(html);
    expect(text).toContain('Distance Full distance: 3.8 km swim, 180 km bike, 42.2 km run (226 km)');
    expect(text).toContain('Entry Open: anyone can sign up on the official website, first come, first served.');
    expect(text).toContain('Sun 28 Jun 2026 · held');
    expect(text).toContain('Sun 27 Jun 2027');
    expect(html).not.toContain('noindex');
  });

  it('never states an estimated date: the next date is "not announced yet"', () => {
    const roth = race('challenge-roth-full');
    expect(roth.nextEdition?.estimated).toBe(true);
    expect(raceWhenText(roth)).toBeNull();
    const html = page('challenge-roth-full');
    expect(html).toContain('<title>Challenge Roth · TriMap</title>');
    expect(meta(html, 'og:description')).toBe(
      'Next date not announced yet · last held Sun 5 Jul 2026 · Roth, Germany · Full distance (3.8 / 180 / 42.2 km). Open entry.',
    );
    expect(html).not.toMatch(/≈|TBA|2027/);
    expect(eventData(html)).toBeNull();
  });

  it('gives the official km of a near-standard race', () => {
    const html = page('independent-celtman-full');
    expect(meta(html, 'og:description')).toBe(
      'Sat 19 Jun 2027 · Shieldaig, United Kingdom · Non-standard full distance (3.4 / 202 / 41 km). Entry by ballot.',
    );
    expect(bodyText(html)).toContain('Non-standard distance');
    expect(bodyText(html)).toContain('Ballot');
  });

  it('points a replaced race at its successor, and keeps it out of search results', () => {
    const html = page('challenge-wanaka-half', { successor: race('t100-wanaka-t100') });
    expect(meta(html, 'og:description')).toBe(
      'No future edition announced · Wānaka, New Zealand · Half distance (1.9 / 90 / 21.1 km). Continues as T100 Wanaka.',
    );
    expect(html).toContain('<a href="../t100-wanaka-t100/">T100 Wanaka</a>');
    expect(html).toContain('<meta name="robots" content="noindex" />');
  });

  it('shows the registration status with the day it was checked', () => {
    const text = bodyText(page('ironman-cozumel-full'));
    expect(text).toContain('Registration Sold out as of 24 Sep 2026. No entries left.');
    expect(text).toContain('the ironman.com race finder; entry page');
  });

  it('links the nearest listed races, other distances at the same venue first', () => {
    const near = nearbyRaces(race('challenge-almere-amsterdam-full'), races, 3);
    expect(near.map((n) => n.race.id)).toEqual([
      'challenge-almere-amsterdam-half',
      'independent-rbr-almere-long-duathlon',
      'independent-tt-almere-42k-time-trial',
    ]);
    expect(near[0]!.km).toBe(0);
    // Races with no edition to enter are not linked.
    expect(nearbyRaces(race('t100-wanaka-t100'), races, 30).map((n) => n.race.id)).not.toContain(
      'challenge-wanaka-half',
    );
    const html = page('challenge-almere-amsterdam-full', { nearby: near });
    expect(bodyText(html)).toContain('Challenge Almere-Amsterdam · Half · Sat 11 Sep 2027 · same venue');
  });
});

describe('event data for search engines', () => {
  it('describes a confirmed next edition as a SportsEvent', () => {
    const data = eventData(page('ironman-frankfurt-full', { siteUrl: SITE }));
    expect(data).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'SportsEvent',
      name: 'IRONMAN Frankfurt',
      sport: 'Triathlon',
      startDate: '2027-06-27',
      eventStatus: 'https://schema.org/EventScheduled',
      location: {
        '@type': 'Place',
        address: { addressLocality: 'Frankfurt am Main', addressCountry: 'DE' },
        geo: { latitude: 50.1106, longitude: 8.6821 },
      },
      url: 'https://x.github.io/tri-map/race/ironman-frankfurt-full/',
      image: ['https://x.github.io/tri-map/og-image.png'],
      organizer: { '@type': 'Organization', name: 'IRONMAN', url: 'https://www.ironman.com' },
    });
  });

  it('leaves out a date that is not confirmed, and races with no edition to enter', () => {
    // Norseman 2027 is "TBC"; Wanaka's half has been replaced.
    expect(race('independent-norseman-full').nextEdition).toMatchObject({ status: 'tentative' });
    expect(eventData(page('independent-norseman-full'))).toBeNull();
    expect(eventData(page('challenge-wanaka-half'))).toBeNull();
  });

  it('cannot be broken out of by a name with markup in it', () => {
    const r = { ...race('ironman-frankfurt-full'), name: 'IRONMAN </script><b>x' };
    const html = racePageHtml(r, { siteUrl: '', today: TODAY });
    expect(html).not.toContain('</script><b>');
    expect(eventData(html)).toMatchObject({ name: 'IRONMAN </script><b>x' });
  });
});

describe('sitemap and robots.txt', () => {
  it('lists the home page and every race the app lists', () => {
    const xml = sitemapXml(SITE, races);
    expect(xml).toContain('<url><loc>https://x.github.io/tri-map/</loc></url>');
    expect(xml).toContain(
      '<url><loc>https://x.github.io/tri-map/race/ironman-frankfurt-full/</loc><lastmod>2026-09-20</lastmod></url>',
    );
    // Roth has only an estimated next date: still listed. Wanaka's half has no future edition.
    expect(xml).toContain('race/challenge-roth-full/');
    expect(xml).not.toContain('race/challenge-wanaka-half/');
    const listed = races.filter((r) => r.nextEdition).length;
    expect(xml.match(/<url>/g)).toHaveLength(listed + 1);
  });

  it('names the sitemap in robots.txt when the site URL is known', () => {
    expect(robotsTxt(SITE)).toBe('User-agent: *\nAllow: /\n\nSitemap: https://x.github.io/tri-map/sitemap.xml\n');
    expect(robotsTxt('')).toBe('User-agent: *\nAllow: /\n');
  });
});
