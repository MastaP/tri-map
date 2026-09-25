import { memo, useMemo } from 'react';
import { brandGlyphSvg, type BrandId } from '../data/brands.ts';
import { cn } from '../lib/cn.ts';

interface Props {
  brand: BrandId;
  /** Size of the core shape in px (the SVG adds a little padding for the ring). */
  size?: number;
  hollow?: boolean;
  title?: string;
  className?: string;
}

/** The brand's original monogram glyph (shape + colour + letter), same as on the map. */
export const BrandGlyph = memo(function BrandGlyph({ brand, size = 20, hollow, title, className }: Props) {
  const html = useMemo(
    () => brandGlyphSvg(brand, { hollow, title, ring: 'var(--tm-surface)' }),
    [brand, hollow, title],
  );
  const px = (size * 35) / 32;
  return (
    <span
      className={cn('inline-block shrink-0 [&>svg]:block [&>svg]:size-full', className)}
      style={{ width: px, height: px }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});
