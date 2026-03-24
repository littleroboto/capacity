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
  return `country: ${country || 'DE'}

resources:
  labs:
    capacity: 5
  teams: {}

bau:
  weekly_promo_cycle:
    day: Tue
    labs: 2
    support_days: 2

campaigns: []
holidays: {}
trading:
  weekly_pattern:
    default: medium
    Thu: high
    Fri: high
    Sat: very_high
`;
}

/** Default YAML when no per-market copy exists in storage or fetch failed. */
export function defaultDslForMarket(country: string): string {
  return BUNDLED_BY_MARKET[country] ?? minimalDsl(country);
}
