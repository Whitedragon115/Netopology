import type { LinkKind, NodeCategory } from '@/lib/api/types';
import { CATEGORY, LINK_KIND } from '@/lib/domain';
import { cn } from '@/lib/cn';

/** Small legend glyphs: a node shape and a link style. */
export function ShapeSample({ category }: { category: NodeCategory }) {
  const { shape, border } = CATEGORY[category];
  if (shape === 'cloud' || shape === 'hexagon') {
    return (
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-5 w-7.5 shrink-0 overflow-visible" aria-hidden>
        {shape === 'cloud' ? (
          <>
            <g style={{ fill: 'var(--node-border-hover)' }}>
              <rect x="0" y="36" width="100" height="64" rx="12" ry="24" />
              <ellipse cx="28" cy="44" rx="20" ry="30" />
              <ellipse cx="56" cy="31" rx="25" ry="30" />
              <ellipse cx="80" cy="46" rx="17" ry="26" />
            </g>
            <g style={{ fill: 'var(--node-bg)' }} transform="translate(5 6) scale(0.9 0.88)">
              <rect x="0" y="36" width="100" height="64" rx="12" ry="24" />
              <ellipse cx="28" cy="44" rx="20" ry="30" />
              <ellipse cx="56" cy="31" rx="25" ry="30" />
              <ellipse cx="80" cy="46" rx="17" ry="26" />
            </g>
          </>
        ) : (
          <polygon points="12,2 88,2 98,50 88,98 12,98 2,50" style={{ fill: 'var(--node-bg)', stroke: 'var(--node-border-hover)', strokeWidth: 1.5 }} vectorEffect="non-scaling-stroke" />
        )}
      </svg>
    );
  }
  return (
    <i
      className={cn(
        'block h-5 w-7.5 shrink-0 border-[1.5px] border-node-border-hover bg-node',
        shape === 'rounded' ? 'rounded-[5px]' : 'rounded-[1px]',
        border === 'double' && 'border-[3.5px] border-double',
        border === 'dashed' && 'border-dashed',
      )}
    />
  );
}

export function LinkSample({ kind, width = 34 }: { kind: LinkKind; width?: number }) {
  const y = 6;
  return (
    <svg width={width} height={12} className="shrink-0" aria-hidden>
      {kind === 'storage_mount' ? (
        <>
          <path d={`M2 ${y}H${width - 2}`} className="edge-casing" />
          <path d={`M2 ${y}H${width - 2}`} className="edge-core" style={{ stroke: 'var(--surface)' }} />
        </>
      ) : (
        <>
          <path d={`M2 ${y}H${width - 6}`} className={cn('edge-path', kind)} />
          {LINK_KIND[kind].directed && <path d={`M${width - 8} ${y - 4} ${width - 2} ${y} ${width - 8} ${y + 4}z`} style={{ fill: 'var(--link-line)' }} />}
        </>
      )}
    </svg>
  );
}
