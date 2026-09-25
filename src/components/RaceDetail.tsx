import {
  ArrowRight,
  Bike,
  CalendarPlus,
  ChevronLeft,
  ExternalLink,
  Footprints,
  History,
  Link as LinkIcon,
  MapPin,
  Navigation,
  Star,
  Waves,
  X,
} from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { correctionUrl, RACE_PAGES } from '../config.ts';
import { BRANDS, DISTANCES, formatKm } from '../data/brands.ts';
import { isNearStandard, raceLegs } from '../data/course.ts';
import { REGIONS } from '../data/regions.ts';
import type { Race } from '../data/types.ts';
import { cn } from '../lib/cn.ts';
import { formatDate, formatDateRange, formatLongDate, formatMonthLong, type ISODate } from '../lib/dates.ts';
import { copyText } from '../lib/clipboard.ts';
import { buildIcs, icsFileName } from '../lib/ics.ts';
import { TOUCH_INLINE } from '../lib/touch.ts';
import {
  countdownTo,
  ENTRY_EXPLAINER,
  firstYear,
  raceLink,
  seriesLabel,
  shortRaceName,
  sourceLabels,
  SWIM_LABEL,
  SWIM_LONG,
  TERRAIN_LABEL,
} from '../lib/raceText.ts';
import { BrandGlyph } from './BrandGlyph.tsx';
import { Flag } from './Flag.tsx';
import { ChampionshipBadge, DistanceBadge, EntryBadge, NonStandardBadge, TerrainGlyph } from './RaceBits.tsx';

interface Props {
  race: Race;
  today: ISODate;
  starred: boolean;
  onToggleStar: (id: string) => void;
  onClose: () => void;
  onToast: (text: string) => void;
  /** Desktop shows a "back to results" affordance; mobile a close button. */
  variant: 'panel' | 'sheet';
  /** Other races at the same venue (e.g. the half on the same weekend). */
  siblings: Race[];
  /** The race that replaces this one (`continuedAs`), if it is in the data. */
  successor: Race | null;
  /** Races this one replaces ("Formerly …"). */
  predecessors: Race[];
  onSelect: (id: string) => void;
  /** Replaces the close button row's left side on the mobile sheet (the drag handle). */
  handle?: ReactNode;
  /** Whether estimated dates are shown (off by default: only announced dates). */
  showEstimated: boolean;
  onShowEstimated: () => void;
}

function IconButton({
  label,
  onClick,
  children,
  pressed,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className="relative grid size-9 place-items-center rounded-full text-muted transition-colors before:absolute before:-inset-1 hover:bg-surface-2 hover:text-fg active:scale-95 pointer-coarse:size-11"
    >
      {children}
    </button>
  );
}

export function RaceDetail({
  race,
  today,
  starred,
  onToggleStar,
  onClose,
  onToast,
  variant,
  siblings,
  successor,
  predecessors,
  onSelect,
  handle,
  showEstimated,
  onShowEstimated,
}: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const next = race.nextEdition;
  const d = DISTANCES[race.distance];
  const legs = raceLegs(race);
  const nonStandard = isNearStandard(race);
  const correction = correctionUrl(race);
  const lastHeld = race.editions.findLast((e) => e.status !== 'cancelled' && (e.endDate ?? e.date) < today);
  const successorYear = successor ? firstYear(successor) : null;

  const successorLink = successor && (
    <button
      type="button"
      onClick={() => onSelect(successor.id)}
      className="group flex w-full items-center gap-3 rounded-xl border border-line-strong bg-surface px-3 py-2.5 text-left transition-colors hover:border-fg/40 hover:bg-surface-3"
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ink text-on-ink" aria-hidden="true">
        <ArrowRight className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] leading-snug">
          Continues as <span className="font-semibold">{successor.name}</span>
          {successorYear && <> from {successorYear}</>}
        </span>
        <span className="mt-0.5 block truncate text-[12px] text-muted">
          {successor.series ?? BRANDS[successor.brand].label} · {DISTANCES[successor.distance].badge}
        </span>
      </span>
      <ChevronLeft
        className="size-4 shrink-0 rotate-180 text-muted transition-transform group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </button>
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
    headingRef.current?.focus({ preventScroll: true });
  }, [race.id]);

  const downloadIcs = () => {
    if (!next || next.estimated) return;
    const ics = buildIcs(race, next, new Date(), raceLink(race.id, window.location.href, { page: RACE_PAGES }));
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = icsFileName(race, next.date);
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    onToast('Calendar event downloaded');
  };

  const copyLink = async () => {
    onToast(
      (await copyText(raceLink(race.id, window.location.href, { page: RACE_PAGES })))
        ? 'Link copied'
        : 'Could not copy the link',
    );
  };

  return (
    <article aria-labelledby="race-detail-title" className="flex h-full min-h-0 flex-col bg-surface">
      <div className="flex h-12 shrink-0 items-center gap-1 border-b border-line px-2">
        {variant === 'panel' ? (
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 items-center gap-1 rounded-full pr-3 pl-2 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-fg pointer-coarse:h-11"
          >
            <ChevronLeft className="size-4" /> All races
            <kbd className="ml-1 hidden rounded border border-line px-1 text-[10px] leading-4 text-faint xl:inline">
              Esc
            </kbd>
          </button>
        ) : (
          handle
        )}
        <div className="ml-auto flex items-center">
          <IconButton
            label={starred ? 'Remove from shortlist' : 'Add to shortlist'}
            onClick={() => onToggleStar(race.id)}
            pressed={starred}
          >
            <Star className={cn('size-[18px]', starred && 'fill-current text-amber-600 dark:text-amber-400')} />
          </IconButton>
          <IconButton label="Copy link to this race" onClick={copyLink}>
            <LinkIcon className="size-[18px]" />
          </IconButton>
          {variant === 'sheet' && (
            <IconButton label="Close" onClick={onClose}>
              <X className="size-5" />
            </IconButton>
          )}
        </div>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div key={race.id} className="animate-slide-in px-5 pt-5 pb-8">
          <div className="flex items-center gap-2 text-[12px] font-semibold tracking-[0.08em] text-muted uppercase">
            <BrandGlyph brand={race.brand} size={26} hollow={!next || next.estimated} />
            <span>{seriesLabel(race, BRANDS[race.brand].label)}</span>
          </div>
          <h2
            id="race-detail-title"
            ref={headingRef}
            tabIndex={-1}
            className="mt-2.5 font-display text-[34px] leading-[0.95] font-bold tracking-tight text-balance uppercase outline-none"
          >
            {race.name}
          </h2>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <DistanceBadge distance={race.distance} course={race.course} long />
            <EntryBadge entry={race.entry} />
            <NonStandardBadge race={race} />
            <ChampionshipBadge race={race} short={false} />
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-[15px] text-muted">
            <Flag code={race.country} className="h-3.5 w-[19px]" />
            <span>
              {race.city}, {race.countryName}
            </span>
            <span className="text-faint">· {REGIONS[race.region].label}</span>
          </p>
          {predecessors.length > 0 && (
            <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-[13px] text-muted">
              <History className="size-3.5 shrink-0" aria-hidden="true" />
              <span aria-hidden="true">Formerly</span>
              {predecessors.map((p, i) => (
                <span key={p.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(p.id)}
                    aria-label={`Formerly ${p.name}`}
                    className={cn(
                      'rounded font-semibold text-fg underline decoration-line-strong underline-offset-2 hover:decoration-fg',
                      TOUCH_INLINE,
                    )}
                  >
                    {p.name}
                  </button>
                  {i < predecessors.length - 1 && ','}
                </span>
              ))}
            </p>
          )}

          {/* Next edition */}
          <section aria-label="Next race" className="mt-5 rounded-2xl border border-line bg-surface-2 p-4">
            <p className="text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">Next race</p>
            {!next ? (
              <>
                <p className="mt-1 font-display text-[26px] leading-tight font-bold uppercase">
                  No future edition announced
                </p>
                <p className="mt-1 text-sm text-muted">
                  {lastHeld ? `Last held ${formatDate(lastHeld.date)}. ` : 'Every listed edition was cancelled. '}
                  {successor
                    ? 'The race carries on under a new name:'
                    : 'Check the official website for news of a future edition.'}
                </p>
                {successor && <div className="mt-3">{successorLink}</div>}
              </>
            ) : next.estimated && !showEstimated ? (
              // Only announced dates are shown by default; the estimate is one click away.
              <>
                <p className="mt-1 font-display text-[26px] leading-tight font-bold uppercase">
                  Next date not announced yet
                </p>
                <p className="mt-1 text-sm text-muted" data-testid="next-not-announced">
                  {lastHeld ? <>Last held {formatDate(lastHeld.date)} · </> : null}
                  <button
                    type="button"
                    onClick={onShowEstimated}
                    className={cn(
                      'rounded font-semibold text-fg underline decoration-line-strong underline-offset-2 hover:decoration-fg',
                      TOUCH_INLINE,
                    )}
                  >
                    Show estimated dates
                  </button>
                </p>
              </>
            ) : next.estimated ? (
              <>
                <p className="mt-1 font-display text-[28px] leading-tight font-bold text-muted">
                  ≈ {formatMonthLong(next.date.slice(0, 7))}
                </p>
                <p className="mt-1 text-sm text-muted">
                  Date not announced yet. Estimated from the {formatDate(next.basedOn)} edition; check the official
                  website.
                </p>
              </>
            ) : (
              <>
                <p className="mt-1 font-display text-[28px] leading-tight font-bold">
                  {next.endDate ? formatDateRange(next.date, next.endDate) : formatLongDate(next.date)}
                </p>
                <p className="mt-0.5 text-sm text-muted">
                  <span className="font-semibold text-fg">{countdownTo(next, today)}</span>
                  {next.status === 'tentative' && ' · provisional date, not yet confirmed'}
                </p>
              </>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <a
                href={race.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 flex-auto items-center justify-center gap-2 rounded-xl bg-ink px-3.5 text-sm font-semibold whitespace-nowrap text-on-ink transition-transform hover:opacity-90 active:scale-[0.98] pointer-coarse:h-11"
              >
                Official website <ExternalLink className="size-4" />
              </a>
              <button
                type="button"
                onClick={downloadIcs}
                disabled={!next || next.estimated}
                title={
                  !next || next.estimated
                    ? 'Available once the date is announced'
                    : 'Download an all-day calendar event (.ics)'
                }
                className="inline-flex h-10 flex-auto items-center justify-center gap-2 rounded-xl border border-line-strong bg-surface px-3.5 text-sm font-semibold whitespace-nowrap transition-colors hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-45 pointer-coarse:h-11"
              >
                <CalendarPlus className="size-4" /> Add to calendar
              </button>
            </div>
          </section>

          {next && successor && <div className="mt-3">{successorLink}</div>}

          {siblings.length > 0 && (
            <section aria-labelledby="same-venue-title" className="mt-3">
              <h3 id="same-venue-title" className="sr-only">
                Also at this venue
              </h3>
              <ul className="space-y-1.5">
                {siblings.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => onSelect(s.id)}
                      className="group flex w-full items-center gap-2.5 rounded-xl border border-dashed border-line-strong px-3 py-2 text-left text-sm transition-colors hover:border-solid hover:bg-surface-2"
                    >
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="text-[11px] font-semibold tracking-wide text-muted uppercase">
                            Also here
                          </span>
                          <DistanceBadge distance={s.distance} course={s.course} />
                          <EntryBadge entry={s.entry} />
                        </span>
                        <span className="min-w-0 font-medium text-pretty">
                          {shortRaceName(s, race)}
                          <span className="font-normal text-muted">
                            {' · '}
                            {s.nextEdition
                              ? s.nextEdition.estimated
                                ? showEstimated
                                  ? `≈ ${formatMonthLong(s.nextEdition.date)}`
                                  : 'date not announced yet'
                                : formatDate(s.nextEdition.date)
                              : 'no upcoming date'}
                          </span>
                        </span>
                      </span>
                      <ChevronLeft className="size-4 shrink-0 rotate-180 text-muted transition-transform group-hover:translate-x-0.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Course: distances plus swim type and bike / run profiles */}
          <section aria-labelledby="course-title" className="mt-5">
            <h3 id="course-title" className="sr-only">
              Course details
            </h3>
            <div className="grid grid-cols-3 overflow-hidden rounded-2xl border border-line">
              {(
                [
                  {
                    label: 'Swim',
                    km: legs.swim,
                    Icon: Waves,
                    detail: race.swim ? SWIM_LABEL[race.swim] : null,
                    title: race.swim ? SWIM_LONG[race.swim] : undefined,
                    terrain: undefined,
                    what: 'Swim type',
                  },
                  {
                    label: 'Bike',
                    km: legs.bike,
                    Icon: Bike,
                    detail: race.bike ? TERRAIN_LABEL[race.bike] : null,
                    title: race.bike ? `${TERRAIN_LABEL[race.bike]} bike course` : undefined,
                    terrain: race.bike,
                    what: 'Bike course',
                  },
                  {
                    label: 'Run',
                    km: legs.run,
                    Icon: Footprints,
                    detail: race.run ? TERRAIN_LABEL[race.run] : null,
                    title: race.run ? `${TERRAIN_LABEL[race.run]} run course` : undefined,
                    terrain: race.run,
                    what: 'Run course',
                  },
                ] as const
              ).map(({ label, km, Icon, detail, title, terrain, what }, i) => (
                <div key={label} className={cn('flex min-w-0 flex-col', i > 0 && 'border-l border-line')}>
                  <div className="px-3 pt-3 pb-2.5">
                    <Icon className="size-4 text-muted" aria-hidden="true" />
                    <p className="tabular mt-1.5 font-display text-[24px] leading-none font-bold">
                      {km}
                      <span className="ml-0.5 text-[13px] font-bold text-muted">km</span>
                    </p>
                    <p className="mt-0.5 text-[12px] text-muted">{label}</p>
                  </div>
                  <p
                    className={cn(
                      'mt-auto flex min-h-9 items-center gap-1.5 border-t border-line bg-surface-2/60 px-3 py-2 text-[12.5px] leading-tight',
                      detail ? 'font-semibold text-fg' : 'text-faint',
                    )}
                    title={title}
                  >
                    <span className="sr-only">{what}: </span>
                    {terrain && <TerrainGlyph terrain={terrain} />}
                    <span className="min-w-0">{detail ?? 'Not listed yet'}</span>
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[12px] text-faint" data-testid="course-total">
              {d.long} · {formatKm(legs.total)} total
              {nonStandard && (
                <>
                  {' '}
                  · standard {d.swim} / {d.bike} / {d.run} km
                </>
              )}
            </p>
          </section>

          {/* Facts */}
          <dl className="mt-5 divide-y divide-line rounded-2xl border border-line text-sm">
            <div className="flex gap-3 px-4 py-3">
              <dt className="w-20 shrink-0 text-muted">Entry</dt>
              <dd className="text-pretty">
                {next
                  ? ENTRY_EXPLAINER[race.entry]
                  : successor
                    ? `No longer held in this form: see ${successor.name}.`
                    : 'No future edition to enter.'}
              </dd>
            </div>
            {race.series && race.series !== seriesLabel(race, BRANDS[race.brand].label) && (
              <div className="flex gap-3 px-4 py-3">
                <dt className="w-20 shrink-0 text-muted">Series</dt>
                <dd className="text-pretty">{race.series}</dd>
              </div>
            )}
            <div className="flex gap-3 px-4 py-3">
              <dt className="w-20 shrink-0 text-muted">Venue</dt>
              <dd className="min-w-0">
                <span className="flex flex-wrap gap-x-3 gap-y-1">
                  <a
                    href={`https://www.openstreetmap.org/?mlat=${race.lat}&mlon=${race.lng}#map=13/${race.lat}/${race.lng}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-medium underline decoration-line-strong underline-offset-2 hover:decoration-fg pointer-coarse:min-h-11"
                  >
                    <MapPin className="size-3.5" aria-hidden="true" /> Open in maps
                  </a>
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${race.lat},${race.lng}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-medium underline decoration-line-strong underline-offset-2 hover:decoration-fg pointer-coarse:min-h-11"
                  >
                    <Navigation className="size-3.5" aria-hidden="true" /> Directions
                  </a>
                </span>
              </dd>
            </div>
            {race.notes && (
              <div className="flex gap-3 px-4 py-3">
                <dt className="w-20 shrink-0 text-muted">Notes</dt>
                <dd className="text-pretty">{race.notes}</dd>
              </div>
            )}
          </dl>

          {/* Editions */}
          <section aria-labelledby="editions-title" className="mt-5">
            <h3
              id="editions-title"
              className="font-display text-[13px] font-bold tracking-[0.1em] text-muted uppercase"
            >
              Known editions
            </h3>
            <ol className="mt-2 space-y-1">
              {race.editions.map((e) => {
                const past = (e.endDate ?? e.date) < today;
                const isNext = !!next && !next.estimated && next.date === e.date;
                return (
                  <li
                    key={e.date}
                    className={cn(
                      'flex items-center gap-3 rounded-xl px-3 py-2 text-sm',
                      isNext ? 'bg-accent-soft font-semibold' : past ? 'bg-transparent text-muted' : 'bg-surface-2',
                    )}
                  >
                    <span className="tabular w-10 font-display text-base font-bold">{e.date.slice(0, 4)}</span>
                    <span className={cn('tabular flex-1', e.status === 'cancelled' && 'line-through')}>
                      {formatDateRange(e.date, e.endDate)}
                    </span>
                    <span
                      className={cn(
                        'rounded-md px-1.5 py-0.5 text-[11px] font-semibold uppercase',
                        e.status === 'cancelled'
                          ? 'bg-danger/10 text-danger'
                          : e.status === 'tentative'
                            ? 'bg-surface-3 text-muted'
                            : past
                              ? 'text-muted'
                              : 'bg-surface text-fg',
                      )}
                    >
                      {e.status === 'confirmed' && past ? 'Held' : e.status}
                    </span>
                  </li>
                );
              })}
              {next?.estimated && showEstimated && (
                <li className="flex items-center gap-3 rounded-xl border border-dashed border-line-strong px-3 py-2 text-sm text-muted">
                  <span className="tabular w-10 font-display text-base font-bold">{next.date.slice(0, 4)}</span>
                  <span className="flex-1">≈ {formatMonthLong(next.date.slice(0, 7))}</span>
                  <span className="text-[11px] font-semibold uppercase">Estimated</span>
                </li>
              )}
            </ol>
          </section>

          {/* Small print */}
          <div className="mt-6 space-y-1 text-[12px] text-faint">
            <p>
              Sources:{' '}
              {sourceLabels(race.sources).map(({ url, label }, i) => (
                <span key={url}>
                  {i > 0 && ', '}
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className={cn('underline underline-offset-2 hover:text-fg', TOUCH_INLINE)}
                  >
                    {label}
                  </a>
                </span>
              ))}
            </p>
            <p>Dates verified {formatDate(race.verifiedAt)}. Always confirm on the official website.</p>
            {correction && (
              <p>
                <a
                  href={correction}
                  target="_blank"
                  rel="noreferrer"
                  className={cn('font-medium text-muted underline underline-offset-2 hover:text-fg', TOUCH_INLINE)}
                >
                  Report a correction
                </a>
              </p>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
