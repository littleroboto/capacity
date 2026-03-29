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
  return `# Minimal market recipe (fallback when no bundled file exists).
# Same ideas as the full sample markets: capacity, routine work (BAU), holidays,
# and store rhythm. Edit values to match your organisation.

#
# Identity and heat-map contrast
# --------------------------------
#
market: ${country || 'DE'}
risk_heatmap_gamma_tech: 0.35
risk_heatmap_gamma_business: 0.35

#
# Capacity — labs, people, test slots
# -----------------------------------
#
resources:
  labs:
    capacity: 6
  staff:
    capacity: 4
  testing_capacity: 4

#
# Everyday workload (BAU)
# -----------------------
#
bau:
  days_in_use: [mo, tu, we, th, fr]
  weekly_cycle:
    labs_required: 1
    staff_required: 1
    support_days: 0

#
# Campaigns (none in this stub — add list entries like other markets)
# --------------------------------------------------------------------
#
campaigns: []

# Tech programmes — same date keys as campaigns, but only labs/teams/backend load (no store/campaign uplift).
tech_programmes: []

#
# Holidays — empty manual lists; turn auto: true to use catalog merge like UK/CA
# ------------------------------------------------------------------------------
#
public_holidays:
  auto: false
  dates: []
  staffing_multiplier: 1.0
  trading_multiplier: 1.0

school_holidays:
  auto: false
  dates: []
  staffing_multiplier: 1.0
  trading_multiplier: 1.0
  load_effects:
    lab_load_mult: 1.0
    team_load_mult: 1.0
    backend_load_mult: 1.0
    ops_activity_mult: 1.0
    commercial_activity_mult: 1.0

holidays:
  capacity_taper_days: 0
  lab_capacity_scale: 1.0

#
# Store trading rhythm
# ----------------------
#
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
`;
}

/** Default YAML when no per-market copy exists in storage or fetch failed. */
export function defaultDslForMarket(country: string): string {
  return BUNDLED_BY_MARKET[country] ?? minimalDsl(country);
}
