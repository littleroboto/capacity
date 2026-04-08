import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { ChevronDown, ChevronRight, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

const DEMO_WEEK = [0.72, 0.68, 0.85, 1.0, 0.92, 0.64, 0.58];
const DEMO_MONTH = [
  0.56, 0.62, 0.7, 0.74, 0.81, 0.91, 0.88, 0.79, 0.72, 0.68, 0.74, 1.0,
];

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(1, Math.max(0, n));
}

function parseWeight(raw: string): number {
  const t = raw.trim().replace(/,/g, '.');
  if (t === '' || t === '.' || t === '-' || t === '-.') return NaN;
  const v = Number.parseFloat(t);
  return Number.isFinite(v) ? clamp01(v) : NaN;
}

type Point = { x: number; y: number };

function sparkGeometry(
  weights: number[],
  w: number,
  h: number,
  padL: number,
  padR: number,
  padT: number,
  padB: number
) {
  const n = weights.length;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const denom = Math.max(1, n - 1);
  const points: Point[] = weights.map((wt, i) => ({
    x: padL + (innerW * i) / denom,
    y: padT + (1 - clamp01(wt)) * innerH,
  }));
  const lineD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
  const baseY = padT + innerH;
  const last = points[n - 1]!;
  const first = points[0]!;
  const areaD = `${lineD} L ${last.x.toFixed(2)} ${baseY} L ${first.x.toFixed(2)} ${baseY} Z`;
  return { w, h, padL, padR, padT, padB, innerW, innerH, points, lineD, areaD };
}

function TinyWeightField({
  value,
  onCommit,
  label,
}: {
  value: number;
  onCommit: (v: number) => void;
  label: string;
}) {
  const [text, setText] = useState(() => value.toFixed(2));
  const editing = useRef(false);

  useEffect(() => {
    if (!editing.current) setText(value.toFixed(2));
  }, [value]);

  return (
    <label className="flex flex-col gap-0.5">
      <span className="font-landing text-[8px] font-medium uppercase tracking-wide text-zinc-500">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        value={text}
        onFocus={() => {
          editing.current = true;
        }}
        onChange={(e) => {
          const next = e.target.value;
          setText(next);
          const p = parseWeight(next);
          if (Number.isFinite(p)) onCommit(p);
        }}
        onBlur={() => {
          editing.current = false;
          const p = parseWeight(text);
          const v = Number.isFinite(p) ? p : clamp01(value);
          setText(v.toFixed(2));
          onCommit(v);
        }}
        className={cn(
          'w-full rounded border border-white/[0.08] bg-black/45 px-1 py-1 text-center',
          'font-mono text-[10px] tabular-nums text-zinc-100 outline-none',
          'focus:border-blue-400/35 focus:ring-1 focus:ring-blue-400/20'
        )}
        aria-label={`${label} weight`}
      />
    </label>
  );
}

type SparkProps = {
  weights: number[];
  setWeights: Dispatch<SetStateAction<number[]>>;
  gradId: string;
  vbW: number;
  vbH: number;
  ariaLabel: string;
  hint: string;
};

function DraggableSparkline({ weights, setWeights, gradId, vbW, vbH, ariaLabel, hint }: SparkProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragIdx = useRef<number | null>(null);

  const chartGeom = useMemo(() => sparkGeometry(weights, vbW, vbH, 10, 10, 8, 14), [weights, vbW, vbH]);

  const setFromClientY = useCallback(
    (clientY: number) => {
      const i = dragIdx.current;
      if (i === null || !svgRef.current) return;
      const r = svgRef.current.getBoundingClientRect();
      const { padT, innerH } = chartGeom;
      const scaleY = chartGeom.h / r.height;
      const ySvg = (clientY - r.top) * scaleY;
      const t = 1 - (ySvg - padT) / innerH;
      setWeights((prev) => {
        const next = [...prev];
        next[i] = clamp01(t);
        return next;
      });
    },
    [chartGeom, setWeights]
  );

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (dragIdx.current === null) return;
      setFromClientY(e.clientY);
    };
    const onUp = () => {
      dragIdx.current = null;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [setFromClientY]);

  return (
    <div className="rounded-md border border-white/[0.06] bg-black/40 px-1.5 pb-1.5 pt-2">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${chartGeom.w} ${chartGeom.h}`}
        className="block w-full max-h-[72px] touch-none select-none"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={ariaLabel}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(255,255,255)" stopOpacity="0.12" />
            <stop offset="100%" stopColor="rgb(255,255,255)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={chartGeom.areaD} fill={`url(#${gradId})`} className="pointer-events-none" />
        <path
          d={chartGeom.lineD}
          fill="none"
          stroke="rgb(255,255,255)"
          strokeWidth={1.1}
          strokeLinejoin="round"
          strokeLinecap="round"
          className="pointer-events-none opacity-95"
        />
        {chartGeom.points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={3.5}
            fill="rgb(255,255,255)"
            stroke="rgb(39,39,42)"
            strokeWidth={1}
            className="cursor-ns-resize"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              dragIdx.current = i;
            }}
          />
        ))}
      </svg>
      <p className="mt-1 text-center font-landing text-[8px] leading-snug text-zinc-500">{hint}</p>
    </div>
  );
}

export function LandingIsoControlsSidepanel() {
  const [patternsOpen, setPatternsOpen] = useState(true);
  const [weekWeights, setWeekWeights] = useState(() => [...DEMO_WEEK]);
  const [monthWeights, setMonthWeights] = useState(() => [...DEMO_MONTH]);

  const gidWeek = useId().replace(/:/g, '');
  const gidMonth = useId().replace(/:/g, '');

  return (
    <aside
      className={cn(
        'flex max-h-[min(52vh,420px)] flex-col overflow-hidden rounded-lg border border-white/[0.08] bg-[#0a0a0e]',
        'shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]'
      )}
      aria-label="Trading patterns"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-white/[0.06] px-2.5 py-2">
        <span className="font-landing text-xs font-semibold text-white">Trading patterns</span>
        <ChevronRight className="h-3.5 w-3.5 text-zinc-500" aria-hidden />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2.5 pb-2.5 pt-2">
        <p className="mb-3 font-landing text-[9px] leading-snug text-zinc-500">
          Trading and seasonal patterns shape how busy stores feel alongside the technology lane—tune weights to match
          each market.
        </p>

        <div className="mb-3">
          <p className="mb-1.5 font-landing text-[8px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            Runway lens
          </p>
          <div
            className="flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/[0.08] px-2 py-1.5"
            role="status"
            aria-label="Runway lens: Technology — combined tech headroom (fixed for this preview)"
          >
            <span
              className="flex h-3 w-3 shrink-0 items-center justify-center rounded-full border border-emerald-400/50 bg-emerald-400/20"
              aria-hidden
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 opacity-100" />
            </span>
            <span className="font-landing text-[9px] font-medium leading-tight text-zinc-200">Technology</span>
          </div>
          <div
            className="mt-2 space-y-1.5 rounded-md border border-white/[0.06] bg-black/30 px-2 py-2"
            role="note"
            aria-label="How campaign phases affect tower height on the 3D runway"
          >
            <p className="font-landing text-[8px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
              Campaign phases on the strip
            </p>
            <p className="font-landing text-[8px] leading-snug text-zinc-500">
              Extrusion uses the same readiness vs sustain split as day details in the app.
            </p>
            <ul className="space-y-1 font-landing text-[8px] leading-snug text-zinc-400">
              <li className="flex gap-1.5">
                <span
                  className="mt-0.5 h-2 w-2 shrink-0 rounded-sm bg-violet-500 shadow-[0_0_8px_rgba(139,92,246,0.45)]"
                  aria-hidden
                />
                <span>
                  <span className="font-semibold text-violet-200/90">Prep</span> — readiness / test load (
                  <code className="font-mono text-[7px] text-zinc-500">campaign_support</code> segment)
                </span>
              </li>
              <li className="flex gap-1.5">
                <span
                  className="mt-0.5 h-2 w-2 shrink-0 rounded-sm bg-cyan-500 shadow-[0_0_8px_rgba(34,211,238,0.35)]"
                  aria-hidden
                />
                <span>
                  <span className="font-semibold text-cyan-200/90">Live</span> — operational support (
                  <code className="font-mono text-[7px] text-zinc-500">live_campaign_support</code>)
                </span>
              </li>
            </ul>
          </div>
        </div>

        <div className="rounded-lg border border-blue-500/35 bg-[#080910]/90 p-2">
          <button
            type="button"
            onClick={() => setPatternsOpen((o) => !o)}
            className="mb-2 flex w-full items-center gap-1.5 text-left"
            aria-expanded={patternsOpen}
          >
            {patternsOpen ? (
              <ChevronUp className="h-3.5 w-3.5 shrink-0 text-blue-400/90" aria-hidden />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-blue-400/90" aria-hidden />
            )}
            <span className="font-landing text-[11px] font-semibold text-zinc-100">Business Patterns</span>
          </button>

          {patternsOpen ? (
            <div className="space-y-3 border-t border-blue-500/20 pt-2">
              <p className="font-landing text-[8px] leading-relaxed text-zinc-500">
                Values here offset how runway pressure is read from YAML blocks — same keys as the workbench.
              </p>

              <div>
                <p className="mb-1 font-landing text-[8px] font-semibold uppercase tracking-wide text-zinc-500">
                  Store week (Mon–Sun)
                </p>
                <DraggableSparkline
                  weights={weekWeights}
                  setWeights={setWeekWeights}
                  gradId={`wk-${gidWeek}`}
                  vbW={220}
                  vbH={52}
                  ariaLabel="Store week weight sparkline"
                  hint="Drag a point vertically to match the numeric fields (0–1)."
                />
                <div className="mt-1.5 grid grid-cols-7 gap-1">
                  {WEEKDAYS.map((d, i) => (
                    <TinyWeightField
                      key={d}
                      label={d}
                      value={weekWeights[i]!}
                      onCommit={(v) =>
                        setWeekWeights((prev) => {
                          const next = [...prev];
                          next[i] = v;
                          return next;
                        })
                      }
                    />
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-0.5 font-landing text-[8px] font-semibold uppercase tracking-wide text-zinc-500">
                  Monthly business weightings
                </p>
                <p className="mb-1.5 font-landing text-[8px] leading-relaxed text-zinc-500">
                  <code className="rounded bg-white/[0.06] px-0.5 font-mono text-[8px] text-zinc-400">
                    trading.monthly_pattern
                  </code>{' '}
                  +{' '}
                  <code className="rounded bg-white/[0.06] px-0.5 font-mono text-[8px] text-zinc-400">
                    trading.seasonal
                  </code>
                  .
                </p>
                <div className="mb-1.5 grid grid-cols-3 gap-1 sm:grid-cols-6">
                  {MONTHS.map((m, i) => (
                    <TinyWeightField
                      key={m}
                      label={m}
                      value={monthWeights[i]!}
                      onCommit={(v) =>
                        setMonthWeights((prev) => {
                          const next = [...prev];
                          next[i] = v;
                          return next;
                        })
                      }
                    />
                  ))}
                </div>
                <DraggableSparkline
                  weights={monthWeights}
                  setWeights={setMonthWeights}
                  gradId={`mo-${gidMonth}`}
                  vbW={220}
                  vbH={56}
                  ariaLabel="Monthly weightings sparkline"
                  hint="Drag to tune — synced with the fields above."
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
