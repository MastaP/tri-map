import {
  Bike,
  CalendarPlus,
  ChevronLeft,
  ExternalLink,
  Footprints,
  Link as LinkIcon,
  MapPin,
  Star,
  Waves,
  X,
} from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { correctionUrl } from '../config.ts';
import { BRANDS, DISTANCES } from '../data/brands.ts';
import { REGIONS } from '../data/regions.ts';
import type { Race } from '../data/types.ts';
import { cn } from '../lib/cn.ts';
import { formatDate, formatDateRange, formatLongDate, formatMonthLong, type ISODate } from '../lib/dates.ts';
import { buildIcs, icsFileName } from '../lib/ics.ts';
import { countdownTo, raceLink } from '../lib/raceText.ts';
import { BrandGlyph } from './BrandGlyph.tsx';
import { Flag } from './Flag.tsx';
import { ChampionshipBadge, DistanceBadge } from './RaceBits.tsx';

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
  onSelect: (id: string) => void;
}

const SWIM_LABEL = { ocean: 'Open water (sea)', lake: 'Lake', river: 'River / canal' } as const;

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
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
      className="grid size-9 place-items-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-fg active:scale-95"
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
  onSelect,
}: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const next = race.nextEdition;
  const d = DISTANCES[race.distance];
  const correction = correctionUrl(race);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
    headingRef.current?.focus({ preventScroll: true });
  }, [race.id]);

  const downloadIcs = () => {
    if (!next || next.estimated) return;
    const ics = buildIcs(race, next, new Date(), raceLink(race.id));
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
    onToast((await copyText(raceLink(race.id))) ? 'Link copied' : 'Could not copy the link');
  };

  return (
    <article aria-labelledby="race-detail-title" className="flex h-full min-h-0 flex-col bg-surface">
      <div className="flex h-12 shrink-0 items-center gap-1 border-b border-line px-2">
        {variant === 'panel' ? (
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 items-center gap-1 rounded-full pr-3 pl-2 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <ChevronLeft className="size-4" /> All races
            <kbd className="ml-1 hidden rounded border border-line px-1 text-[10px] leading-4 text-faint xl:inline">
              Esc
            </kbd>
          </button>
        ) : (
          <span className="mx-auto h-1.5 w-10 rounded-full bg-line-strong" aria-hidden="true" />
        )}
        <div className={cn('flex items-center', variant === 'panel' && 'ml-auto')}>
          <IconButton
            label={starred ? 'Remove from shortlist' : 'Add to shortlist'}
            onClick={() => onToggleStar(race.id)}
            pressed={starred}
          >
            <Star className={cn('size-[18px]', starred && 'fill-current text-independent')} />
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
            <BrandGlyph brand={race.brand} size={26} hollow={next?.estimated} />
            <span>{race.series ?? BRANDS[race.brand].label}</span>
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
            <DistanceBadge distance={race.distance} long />
            {race.championship && <ChampionshipBadge title={race.championship} />}
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-[15px] text-muted">
            <Flag code={race.country} className="h-3.5 w-[19px]" />
            <span>
              {race.city}, {race.countryName}
            </span>
            <span className="text-faint">· {REGIONS[race.region].label}</span>
          </p>

          {/* Next edition */}
          <section aria-label="Next race" className="mt-5 rounded-2xl border border-line bg-surface-2 p-4">
            <p className="text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">Next race</p>
            {!next ? (
              <p className="mt-1 font-display text-2xl font-bold uppercase">No upcoming edition</p>
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
                className="inline-flex h-10 flex-auto items-center justify-center gap-2 rounded-xl bg-ink px-3.5 text-sm font-semibold whitespace-nowrap text-on-ink transition-transform hover:opacity-90 active:scale-[0.98]"
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
                className="inline-flex h-10 flex-auto items-center justify-center gap-2 rounded-xl border border-line-strong bg-surface px-3.5 text-sm font-semibold whitespace-nowrap transition-colors hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <CalendarPlus className="size-4" /> Add to calendar
              </button>
            </div>
          </section>

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
                      <span className="text-[11px] font-semibold tracking-wide text-muted uppercase">Also here</span>
                      <DistanceBadge distance={s.distance} />
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {s.nextEdition
                          ? s.nextEdition.estimated
                            ? `≈ ${formatMonthLong(s.nextEdition.date)}`
                            : formatDate(s.nextEdition.date)
                          : s.name}
                      </span>
                      <ChevronLeft className="size-4 rotate-180 text-muted transition-transform group-hover:translate-x-0.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Distance */}
          <section aria-label="Distance" className="mt-5">
            <div className="grid grid-cols-3 overflow-hidden rounded-2xl border border-line">
              {(
                [
                  ['Swim', d.swim, Waves],
                  ['Bike', d.bike, Bike],
                  ['Run', d.run, Footprints],
                ] as const
              ).map(([label, km, Icon], i) => (
                <div key={label} className={cn('px-3 py-3', i > 0 && 'border-l border-line')}>
                  <Icon className="size-4 text-muted" aria-hidden="true" />
                  <p className="tabular mt-1.5 font-display text-[24px] leading-none font-bold">
                    {km}
                    <span className="ml-0.5 text-[13px] font-semibold text-muted">km</span>
                  </p>
                  <p className="mt-0.5 text-[12px] text-muted">{label}</p>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[12px] text-faint">
              {d.long} · {d.total} km total
            </p>
          </section>

          {/* Facts */}
          <dl className="mt-5 divide-y divide-line rounded-2xl border border-line text-sm">
            {race.swim && (
              <div className="flex gap-3 px-4 py-3">
                <dt className="w-20 shrink-0 text-muted">Swim</dt>
                <dd>{SWIM_LABEL[race.swim]}</dd>
              </div>
            )}
            <div className="flex gap-3 px-4 py-3">
              <dt className="w-20 shrink-0 text-muted">Venue</dt>
              <dd className="min-w-0">
                {race.city}, {race.countryName}
                <a
                  href={`https://www.openstreetmap.org/?mlat=${race.lat}&mlon=${race.lng}#map=13/${race.lat}/${race.lng}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-0.5 flex items-center gap-1 text-[12px] text-muted underline-offset-2 hover:text-fg hover:underline"
                >
                  <MapPin className="size-3" /> {race.lat.toFixed(3)}, {race.lng.toFixed(3)}
                </a>
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
              className="font-display text-[13px] font-semibold tracking-[0.1em] text-muted uppercase"
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
              {next?.estimated && (
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
              {race.sources.map((s, i) => (
                <span key={s}>
                  {i > 0 && ', '}
                  <a href={s} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-fg">
                    {new URL(s).hostname.replace(/^www\./, '')}
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
                  className="font-medium text-muted underline underline-offset-2 hover:text-fg"
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
