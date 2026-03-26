/**
 * Bundled YAML for offline / failed-fetch fallback. Markets that only exist as files under
 * `public/data/markets/` use `defaultDslForMarket` → `minimalDsl` until you add a `?raw` import here (optional).
 */
import auDsl from '../../public/data/markets/AU.yaml?raw';
import caDsl from '../../public/data/markets/CA.yaml?raw';
import deDsl from '../../public/data/markets/DE.yaml?raw';
import esDsl from '../../public/data/markets/ES.yaml?raw';
import frDsl from '../../public/data/markets/FR.yaml?raw';
import itDsl from '../../public/data/markets/IT.yaml?raw';
import plDsl from '../../public/data/markets/PL.yaml?raw';
import ukDsl from '../../public/data/markets/UK.yaml?raw';

const BUNDLED_BY_MARKET: Record<string, string> = {
  AU: auDsl,
  CA: caDsl,
  DE: deDsl,
  ES: esDsl,
  FR: frDsl,
  IT: itDsl,
  PL: plDsl,
  UK: ukDsl,
};

function minimalDsl(country: string): string {
  return `market: ${country || 'DE'}

resources:
  labs:
    capacity: 5
  staff:
    capacity: 6

bau:
  days_in_use: [mo, tu, we, th, fr]
  weekly_cycle:
    labs_required: 2
    staff_required: 0
    support_days: 2

campaigns: []

public_holidays:
  auto: false
  dates: []
  staffing_multiplier: 0.5

school_holidays:
  auto: false
  dates: []
  staffing_multiplier: 0.85

trading:
  weekly_pattern:
    Mon: 0.7
    Tue: 0.72
    Wed: 0.74
    Thu: 0.8
    Fri: 0.95
    Sat: 1.0
    Sun: 0.6

tech:
  weekly_pattern:
    weekdays: medium
    weekend: low
  labs_scale: 2
  teams_scale: 1
`;
}

/** Default YAML when no per-market copy exists in storage or fetch failed. */
export function defaultDslForMarket(country: string): string {
  return BUNDLED_BY_MARKET[country] ?? minimalDsl(country);
}
