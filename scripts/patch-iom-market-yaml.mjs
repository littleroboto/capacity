/**
 * One-off style pass: vary IOM market YAML — campaign / programme dates,
 * resources (labs, staff headcount curve, testing slots), light BAU intensity jitter.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'public/data/markets');

const CODES = ['CH', 'AT', 'NL', 'BE', 'PT', 'CZ', 'SK', 'SL', 'UA'];

/** Shared template dates (current fixtures) → per-market replacements (full YYYY-MM-DD strings). */
const DATE_KEYS = [
  ['2026-04-11', 'e26_1'],
  ['2027-04-11', 'e27_1'],
  ['2026-07-09', 'e26_2'],
  ['2027-07-09', 'e27_2'],
  ['2026-07-27', 'e26_4'],
  ['2027-07-27', 'e27_4'],
  ['2026-11-30', 'e26_3'],
  ['2027-11-30', 'e27_3'],
  ['2026-01-07', 'p26_h1'],
  ['2026-09-10', 'p26_h2'],
  ['2027-01-07', 'p27_h1'],
  ['2027-09-10', 'p27_h2'],
];

const BY_MARKET = {
  CH: {
    dates: {
      e26_1: '2026-04-07',
      e27_1: '2027-04-07',
      e26_2: '2026-07-16',
      e27_2: '2027-07-16',
      e26_4: '2026-07-22',
      e27_4: '2027-07-22',
      e26_3: '2026-12-03',
      e27_3: '2027-12-03',
      p26_h1: '2026-01-13',
      p26_h2: '2026-08-28',
      p27_h1: '2027-01-13',
      p27_h2: '2027-08-28',
    },
    labs: 7,
    staff: 5,
    test: 5,
    months: [5, 5, 5, 4, 4, 3, 3, 3, 4, 5, 4, 3],
    bau: [0.84, 0.73, 0.36, 0.28, 0.44, 0.22, 0.25],
    posH2Dur: 58,
  },
  AT: {
    dates: {
      e26_1: '2026-04-18',
      e27_1: '2027-04-18',
      e26_2: '2026-07-02',
      e27_2: '2027-07-02',
      e26_4: '2026-08-04',
      e27_4: '2027-08-04',
      e26_3: '2026-11-24',
      e27_3: '2027-11-24',
      p26_h1: '2026-01-21',
      p26_h2: '2026-09-01',
      p27_h1: '2027-01-21',
      p27_h2: '2027-09-01',
    },
    labs: 5,
    staff: 5,
    test: 4,
    months: [5, 4, 5, 4, 4, 3, 3, 2, 4, 4, 4, 3],
    bau: [0.88, 0.76, 0.35, 0.31, 0.46, 0.21, 0.23],
    summerPrep: 26,
    summerDur: 32,
  },
  NL: {
    dates: {
      e26_1: '2026-03-30',
      e27_1: '2027-03-30',
      e26_2: '2026-07-22',
      e27_2: '2027-07-22',
      e26_4: '2026-07-18',
      e27_4: '2027-07-18',
      e26_3: '2026-12-08',
      e27_3: '2027-12-08',
      p26_h1: '2026-01-27',
      p26_h2: '2026-08-26',
      p27_h1: '2027-01-27',
      p27_h2: '2027-08-26',
    },
    labs: 6,
    staff: 5,
    test: 5,
    months: [5, 5, 4, 4, 3, 4, 3, 2, 4, 5, 5, 2],
    bau: [0.82, 0.71, 0.38, 0.27, 0.43, 0.24, 0.26],
    advPrep: 25,
    advDur: 28,
  },
  BE: {
    dates: {
      e26_1: '2026-04-04',
      e27_1: '2027-04-04',
      e26_2: '2026-07-13',
      e27_2: '2027-07-13',
      e26_4: '2026-08-01',
      e27_4: '2027-08-01',
      e26_3: '2026-11-27',
      e27_3: '2027-11-27',
      p26_h1: '2026-01-03',
      p26_h2: '2026-09-19',
      p27_h1: '2027-01-03',
      p27_h2: '2027-09-19',
    },
    labs: 6,
    staff: 4,
    test: 4,
    months: [4, 4, 4, 4, 3, 3, 3, 2, 3, 4, 4, 2],
    bau: [0.87, 0.75, 0.33, 0.29, 0.45, 0.23, 0.24],
    posH1Dur: 55,
  },
  PT: {
    dates: {
      e26_1: '2026-04-02',
      e27_1: '2027-04-02',
      e26_2: '2026-07-21',
      e27_2: '2027-07-21',
      e26_4: '2026-07-12',
      e27_4: '2027-07-12',
      e26_3: '2026-12-01',
      e27_3: '2027-12-01',
      p26_h1: '2026-01-19',
      p26_h2: '2026-08-30',
      p27_h1: '2027-01-19',
      p27_h2: '2027-08-30',
    },
    labs: 4,
    staff: 3,
    test: 3,
    months: [3, 3, 4, 4, 3, 3, 3, 2, 3, 3, 3, 2],
    bau: [0.81, 0.69, 0.34, 0.26, 0.48, 0.26, 0.27],
    monoPrep: 30,
  },
  CZ: {
    dates: {
      e26_1: '2026-04-14',
      e27_1: '2027-04-14',
      e26_2: '2026-06-28',
      e27_2: '2027-06-28',
      e26_4: '2026-07-31',
      e27_4: '2027-07-31',
      e26_3: '2026-11-22',
      e27_3: '2027-11-22',
      p26_h1: '2026-01-10',
      p26_h2: '2026-09-07',
      p27_h1: '2027-01-10',
      p27_h2: '2027-09-07',
    },
    labs: 6,
    staff: 4,
    test: 4,
    months: [4, 4, 4, 4, 3, 3, 3, 2, 3, 4, 4, 2],
    bau: [0.89, 0.74, 0.37, 0.3, 0.47, 0.22, 0.22],
    easterPrep: 27,
  },
  SK: {
    dates: {
      e26_1: '2026-04-09',
      e27_1: '2027-04-09',
      e26_2: '2026-07-06',
      e27_2: '2027-07-06',
      e26_4: '2026-07-24',
      e27_4: '2027-07-24',
      e26_3: '2026-12-05',
      e27_3: '2027-12-05',
      p26_h1: '2026-01-17',
      p26_h2: '2026-09-03',
      p27_h1: '2027-01-17',
      p27_h2: '2027-09-03',
    },
    labs: 5,
    staff: 4,
    test: 4,
    months: [4, 4, 4, 4, 3, 3, 3, 2, 3, 4, 4, 2],
    bau: [0.85, 0.72, 0.35, 0.27, 0.44, 0.24, 0.23],
    posH2Dur: 63,
  },
  SL: {
    dates: {
      e26_1: '2026-04-08',
      e27_1: '2027-04-08',
      e26_2: '2026-07-11',
      e27_2: '2027-07-11',
      e26_4: '2026-07-19',
      e27_4: '2027-07-19',
      e26_3: '2026-11-26',
      e27_3: '2027-11-26',
      p26_h1: '2026-01-31',
      p26_h2: '2026-08-22',
      p27_h1: '2027-01-31',
      p27_h2: '2027-08-22',
    },
    labs: 4,
    staff: 3,
    test: 3,
    months: [3, 3, 3, 4, 3, 3, 3, 2, 3, 3, 3, 2],
    bau: [0.83, 0.7, 0.36, 0.25, 0.42, 0.25, 0.26],
    summerDur: 27,
  },
  UA: {
    dates: {
      e26_1: '2026-04-20',
      e27_1: '2027-04-20',
      e26_2: '2026-07-24',
      e27_2: '2027-07-24',
      e26_4: '2026-08-07',
      e27_4: '2027-08-07',
      e26_3: '2026-12-14',
      e27_3: '2027-12-14',
      p26_h1: '2026-01-23',
      p26_h2: '2026-09-14',
      p27_h1: '2027-01-23',
      p27_h2: '2027-09-14',
    },
    labs: 5,
    staff: 3,
    test: 3,
    months: [3, 3, 3, 3, 3, 3, 3, 2, 3, 3, 3, 2],
    bau: [0.8, 0.68, 0.39, 0.24, 0.41, 0.27, 0.28],
    posH1Dur: 52,
    posH2Dur: 64,
  },
};

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const BAU_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function buildResources(p) {
  const lines = MONTH_NAMES.map((name, i) => `      ${name}: ${p.months[i]}`);
  return `resources:
  labs:
    capacity: ${p.labs}
  staff:
    capacity: ${p.staff}
    monthly_pattern_basis: absolute
    monthly_pattern:
${lines.join('\n')}
  testing_capacity: ${p.test}`;
}

function buildBau(bau) {
  const lines = BAU_DAYS.map((d, i) => `      ${d}: ${bau[i].toFixed(3)}`);
  // Trailing newline so `# Marketing` cannot glue to the Sun line if the blank line is missing.
  return `  market_it_weekly_load:
    weekday_intensity:
${lines.join('\n')}
`;
}

/** Only replace fixture dates inside campaigns + tech_programmes (never school_holidays / etc.). */
function applyDateMapScoped(s, spec) {
  const pairs = DATE_KEYS.map(([tpl, key]) => {
    const val = spec.dates[key];
    if (!val) throw new Error(`Missing date key ${key} for market`);
    return [tpl, val];
  });
  function patchSlice(startNeedle, endNeedle) {
    const start = s.indexOf(startNeedle);
    const end = s.indexOf(endNeedle, start);
    if (start < 0 || end < 0) throw new Error(`Section not found: ${startNeedle}`);
    let chunk = s.slice(start, end);
    for (const [from, to] of pairs) {
      chunk = chunk.split(from).join(to);
    }
    s = s.slice(0, start) + chunk + s.slice(end);
  }
  patchSlice('campaigns:\n', '\n# Tech programmes');
  patchSlice('tech_programmes:\n', '\n# Public holidays');
  return s;
}

/** Targeted block tweaks: match campaign name line then replace next duration/prep lines until impact. */
function patchCampaignBlock(s, nameSubstr, patch) {
  const re = new RegExp(
    `((?:  - name: [^\n]*${nameSubstr}[^\n]*\n)(?:    [^\n]+\n)*?)(    duration: )\\d+(\n    testing_prep_duration: )\\d+`,
    'gm'
  );
  return s.replace(re, (_, head, dLabel, mid) => {
    return `${head}${dLabel}${patch.duration}${mid}${patch.prep}`;
  });
}

function patchProgrammeDuration(s, nameSubstr, duration) {
  const re = new RegExp(
    `(  - name: [^\n]*${nameSubstr}[^\n]*\n    start_date: [^\n]+\n    duration: )\\d+`,
    'gm'
  );
  return s.replace(re, `$1${duration}`);
}

for (const code of CODES) {
  const spec = BY_MARKET[code];
  const fp = path.join(DIR, `${code}.yaml`);
  let s = fs.readFileSync(fp, 'utf8');

  s = s.replace(
    /resources:\n  labs:\n    capacity: \d+\n  staff:\n    capacity: \d+\n    monthly_pattern_basis: absolute\n    monthly_pattern:\n(?:      .+\n)+?  testing_capacity: \d+/m,
    buildResources(spec)
  );

  s = s.replace(
    /  market_it_weekly_load:\n    weekday_intensity:\n(?:      .+\n){7}/m,
    buildBau(spec.bau)
  );

  s = applyDateMapScoped(s, spec);

  if (spec.summerDur != null || spec.summerPrep != null) {
    s = patchCampaignBlock(s, 'Campaign 2 \\(Summer\\)', {
      duration: spec.summerDur ?? 30,
      prep: spec.summerPrep ?? 28,
    });
  }
  if (spec.advDur != null || spec.advPrep != null) {
    s = patchCampaignBlock(s, 'Campaign 3 \\(Advent\\)', {
      duration: spec.advDur ?? 30,
      prep: spec.advPrep ?? 28,
    });
  }
  if (spec.monoPrep != null) {
    s = patchCampaignBlock(s, 'Campaign 4 \\(Monopoly\\)', {
      duration: 30,
      prep: spec.monoPrep,
    });
  }
  if (spec.easterPrep != null) {
    s = patchCampaignBlock(s, 'Campaign 1 \\(Easter\\)', {
      duration: 30,
      prep: spec.easterPrep,
    });
  }

  if (spec.posH1Dur != null) {
    s = patchProgrammeDuration(s, 'POS Deployment H1', spec.posH1Dur);
  }
  if (spec.posH2Dur != null) {
    s = patchProgrammeDuration(s, 'POS Deployment H2', spec.posH2Dur);
  }

  fs.writeFileSync(fp, s, 'utf8');
  console.log('patched', code);
}
