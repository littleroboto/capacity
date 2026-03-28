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
risk_heatmap_gamma_tech: 2.5
risk_heatmap_gamma_business: 2.5

resources:
  labs:
    capacity: 5
  staff:
    capacity: 4
  testing_capacity: 10

bau:
  days_in_use: [mo, tu, we, th, fr]
  weekly_cycle:
    labs_required: 1
    staff_required: 2
    support_days: 1
  integration_tests:
    day: Mon
    labs: 1

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
  payday_month_peak_multiplier: 1.12
  monthly_pattern:
    Jan: 0.56
    Feb: 0.58
    Mar: 0.69
    Apr: 0.77
    May: 0.85
    Jun: 0.91
    Jul: 0.97
    Aug: 0.92
    Sep: 0.84
    Oct: 0.72
    Nov: 0.60
    Dec: 1.0
  weekly_pattern:
    Mon: 0.6
    Tue: 0.7
    Wed: 0.8
    Thu: 0.9
    Fri: 1.0
    Sat: 1.0
    Sun: 0.8

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
