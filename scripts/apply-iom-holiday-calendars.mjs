/**
 * Replace `public_holidays` + `school_holidays` blocks in IOM market YAML with
 * country-specific calendars (2026 focus; school lists may span 2025–2027).
 * Sources: PublicHolidays.ch (Zürich), publicholidays.at, .nl, .be, serviço público PT,
 * publicholidays.cz, publicholidays.eu (SK), gov.si / EU calendars (SI), official UA calendar (zakon.rada.gov.ua).
 * School dates are regional — one representative region per country; see comments in YAML.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(__dirname, '../public/data/markets');

/** Inclusive YYYY-MM-DD enumeration (UTC date math, no DST issues). */
function enumerateRange(start, end) {
  const out = [];
  const [sy, sm, sd] = start.split('-').map(Number);
  const [ey, em, ed] = end.split('-').map(Number);
  let y = sy;
  let m = sm;
  let d = sd;
  while (y < ey || (y === ey && (m < em || (m === em && d <= ed)))) {
    out.push(
      `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    );
    d += 1;
    const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
    if (d > dim) {
      d = 1;
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }
  }
  return out;
}

function uniqueSorted(dates) {
  return [...new Set(dates)].sort();
}

function formatPublicLines(dates) {
  return uniqueSorted(dates)
    .map((dt) => `    - '${dt}'`)
    .join('\n');
}

function formatSchoolLines(ranges) {
  const lines = [];
  for (const { comment, start, end } of ranges) {
    lines.push(`    # ${comment}`);
    for (const dt of enumerateRange(start, end)) {
      lines.push(`    - '${dt}'`);
    }
  }
  return lines.join('\n');
}

const CAL = {
  CH: {
    note: 'Kanton Zürich (public); school = Stadt Zürich / Kanton Zürich ferien.',
    public: [
      '2026-01-01',
      '2026-04-03',
      '2026-04-06',
      '2026-05-01',
      '2026-05-14',
      '2026-05-25',
      '2026-08-01',
      '2026-12-25',
      '2026-12-26',
    ],
    school: [
      {
        comment: '2025-12-22 – 2026-01-02 — Zürich winter (school year 2025/26)',
        start: '2025-12-22',
        end: '2026-01-02',
      },
      {
        comment: '2026-02-09 – 2026-02-20 — Zürich Sportferien',
        start: '2026-02-09',
        end: '2026-02-20',
      },
      {
        comment: '2026-04-20 – 2026-05-01 — Zürich Frühlingsferien',
        start: '2026-04-20',
        end: '2026-05-01',
      },
      {
        comment: '2026-05-14 – 2026-05-15 — Auffahrt (short break)',
        start: '2026-05-14',
        end: '2026-05-15',
      },
      {
        comment: '2026-07-13 – 2026-08-14 — Zürich summer',
        start: '2026-07-13',
        end: '2026-08-14',
      },
      {
        comment: '2026-12-21 – 2027-01-01 — Zürich Christmas (school year 2026/27)',
        start: '2026-12-21',
        end: '2027-01-01',
      },
    ],
  },
  AT: {
    note: 'National statutory; school ≈ Wien + common bundesweit windows (BMBWF Ferienkalender).',
    public: [
      '2026-01-01',
      '2026-01-06',
      '2026-04-03',
      '2026-04-06',
      '2026-05-01',
      '2026-05-14',
      '2026-05-25',
      '2026-06-04',
      '2026-08-15',
      '2026-10-26',
      '2026-11-01',
      '2026-12-08',
      '2026-12-25',
      '2026-12-26',
    ],
    school: [
      {
        comment: '2025-12-24 – 2026-01-06 — Christmas (bundesweit)',
        start: '2025-12-24',
        end: '2026-01-06',
      },
      {
        comment: '2026-03-28 – 2026-04-06 — Easter (typical window)',
        start: '2026-03-28',
        end: '2026-04-06',
      },
      {
        comment: '2026-05-23 – 2026-05-25 — Pfingsten',
        start: '2026-05-23',
        end: '2026-05-25',
      },
      {
        comment: '2026-07-04 – 2026-09-06 — Summer (Wien / Ost cluster; Länder vary)',
        start: '2026-07-04',
        end: '2026-09-06',
      },
      {
        comment: '2026-10-27 – 2026-10-31 — Herbstferien (typical)',
        start: '2026-10-27',
        end: '2026-10-31',
      },
      {
        comment: '2026-12-24 – 2027-01-06 — Christmas (school year 2026/27)',
        start: '2026-12-24',
        end: '2027-01-06',
      },
    ],
  },
  NL: {
    note: 'Nationwide recognised public days; school = regio Midden (Rijksoverheid 2026/27).',
    public: [
      '2026-01-01',
      '2026-04-03',
      '2026-04-05',
      '2026-04-06',
      '2026-04-27',
      '2026-05-05',
      '2026-05-14',
      '2026-05-24',
      '2026-05-25',
      '2026-12-25',
      '2026-12-26',
    ],
    school: [
      {
        comment: '2025-12-20 – 2026-01-04 — Kerstvakantie (all regions, approximate start)',
        start: '2025-12-20',
        end: '2026-01-04',
      },
      {
        comment: '2026-02-21 – 2026-03-01 — Voorjaarsvakantie (Midden; advisory dates vary)',
        start: '2026-02-21',
        end: '2026-03-01',
      },
      {
        comment: '2026-04-25 – 2026-05-03 — Meivakantie (Midden, approximate)',
        start: '2026-04-25',
        end: '2026-05-03',
      },
      {
        comment: '2026-07-18 – 2026-08-30 — Zomervakantie regio Midden',
        start: '2026-07-18',
        end: '2026-08-30',
      },
      {
        comment: '2026-10-17 – 2026-10-25 — Herfstvakantie (Midden, approximate)',
        start: '2026-10-17',
        end: '2026-10-25',
      },
      {
        comment: '2026-12-19 – 2027-01-03 — Kerstvakantie (mandatory window, all regions)',
        start: '2026-12-19',
        end: '2027-01-03',
      },
    ],
  },
  BE: {
    note: 'Belgian national labour holidays; school ≈ Vlaamse Gemeenschap (Flanders).',
    public: [
      '2026-01-01',
      '2026-04-06',
      '2026-05-01',
      '2026-05-14',
      '2026-05-25',
      '2026-07-21',
      '2026-08-15',
      '2026-11-01',
      '2026-11-11',
      '2026-12-25',
    ],
    school: [
      {
        comment: '2025-12-22 – 2026-01-04 — Kerstvakantie (Vlaanderen, approximate)',
        start: '2025-12-22',
        end: '2026-01-04',
      },
      {
        comment: '2026-02-16 – 2026-02-20 — Krokusvakantie (Flanders, typical week)',
        start: '2026-02-16',
        end: '2026-02-20',
      },
      {
        comment: '2026-04-03 – 2026-04-12 — Paasvakantie (around Easter)',
        start: '2026-04-03',
        end: '2026-04-12',
      },
      {
        comment: '2026-07-01 – 2026-08-31 — Zomervakantie (Vlaanderen)',
        start: '2026-07-01',
        end: '2026-08-31',
      },
      {
        comment: '2026-10-26 – 2026-10-30 — Herfstvakantie (Flanders, approximate)',
        start: '2026-10-26',
        end: '2026-10-30',
      },
      {
        comment: '2026-12-21 – 2027-01-03 — Kerstvakantie',
        start: '2026-12-21',
        end: '2027-01-03',
      },
    ],
  },
  PT: {
    note: 'Feriados nacionais (Diário da República); school ≈ mainland calendar.',
    public: [
      '2026-01-01',
      '2026-04-03',
      '2026-04-05',
      '2026-04-25',
      '2026-05-01',
      '2026-06-04',
      '2026-06-10',
      '2026-08-15',
      '2026-10-05',
      '2026-11-01',
      '2026-12-01',
      '2026-12-08',
      '2026-12-25',
    ],
    school: [
      {
        comment: '2025-12-20 – 2026-01-04 — Natal (approximate)',
        start: '2025-12-20',
        end: '2026-01-04',
      },
      {
        comment: '2026-02-14 – 2026-02-18 — Carnaval (many municipalities)',
        start: '2026-02-14',
        end: '2026-02-18',
      },
      {
        comment: '2026-03-28 – 2026-04-06 — Easter break (approximate)',
        start: '2026-03-28',
        end: '2026-04-06',
      },
      {
        comment: '2026-06-20 – 2026-09-13 — Summer (mainland, approximate)',
        start: '2026-06-20',
        end: '2026-09-13',
      },
      {
        comment: '2026-12-19 – 2027-01-04 — Christmas',
        start: '2026-12-19',
        end: '2027-01-04',
      },
    ],
  },
  CZ: {
    note: 'Státní svátky ČR; school ≈ MŠMT typical windows.',
    public: [
      '2026-01-01',
      '2026-04-03',
      '2026-04-06',
      '2026-05-01',
      '2026-05-08',
      '2026-07-05',
      '2026-07-06',
      '2026-09-28',
      '2026-10-28',
      '2026-11-17',
      '2026-12-24',
      '2026-12-25',
      '2026-12-26',
    ],
    school: [
      {
        comment: '2025-12-23 – 2026-01-04 — Winter',
        start: '2025-12-23',
        end: '2026-01-04',
      },
      {
        comment: '2026-02-16 – 2026-02-22 — Spring half-term (jarní prázdniny, approximate)',
        start: '2026-02-16',
        end: '2026-02-22',
      },
      {
        comment: '2026-04-01 – 2026-04-06 — Easter',
        start: '2026-04-01',
        end: '2026-04-06',
      },
      {
        comment: '2026-07-01 – 2026-08-31 — Summer',
        start: '2026-07-01',
        end: '2026-08-31',
      },
      {
        comment: '2026-10-26 – 2026-10-30 — Autumn (approximate)',
        start: '2026-10-26',
        end: '2026-10-30',
      },
      {
        comment: '2026-12-23 – 2027-01-02 — Christmas',
        start: '2026-12-23',
        end: '2027-01-02',
      },
    ],
  },
  SK: {
    note: 'Štátne sviatky SR (vlada.gov.sk); school ≈ typical školský rok.',
    public: [
      '2026-01-01',
      '2026-01-06',
      '2026-04-03',
      '2026-04-06',
      '2026-05-01',
      '2026-05-08',
      '2026-07-05',
      '2026-08-29',
      '2026-09-01',
      '2026-09-15',
      '2026-11-01',
      '2026-11-17',
      '2026-12-24',
      '2026-12-25',
      '2026-12-26',
    ],
    school: [
      {
        comment: '2025-12-23 – 2026-01-07 — Winter (through Troji králi vicinity)',
        start: '2025-12-23',
        end: '2026-01-07',
      },
      {
        comment: '2026-02-16 – 2026-02-24 — Spring break (approximate)',
        start: '2026-02-16',
        end: '2026-02-24',
      },
      {
        comment: '2026-04-01 – 2026-04-07 — Easter',
        start: '2026-04-01',
        end: '2026-04-07',
      },
      {
        comment: '2026-06-16 – 2026-08-31 — Summer (approximate)',
        start: '2026-06-16',
        end: '2026-08-31',
      },
      {
        comment: '2026-10-28 – 2026-10-31 — Autumn (approximate)',
        start: '2026-10-28',
        end: '2026-10-31',
      },
      {
        comment: '2026-12-22 – 2027-01-08 — Christmas',
        start: '2026-12-22',
        end: '2027-01-08',
      },
    ],
  },
  SL: {
    note: 'Slovenia national work-free days (gov.si); Easter per Gregorian 2026.',
    public: [
      '2026-01-01',
      '2026-01-02',
      '2026-02-08',
      '2026-04-05',
      '2026-04-06',
      '2026-04-27',
      '2026-05-01',
      '2026-05-02',
      '2026-05-25',
      '2026-06-25',
      '2026-08-15',
      '2026-10-31',
      '2026-11-01',
      '2026-12-25',
      '2026-12-26',
    ],
    school: [
      {
        comment: '2025-12-25 – 2026-01-05 — Winter',
        start: '2025-12-25',
        end: '2026-01-05',
      },
      {
        comment: '2026-02-01 – 2026-02-08 — February break (approximate)',
        start: '2026-02-01',
        end: '2026-02-08',
      },
      {
        comment: '2026-04-01 – 2026-04-07 — Easter',
        start: '2026-04-01',
        end: '2026-04-07',
      },
      {
        comment: '2026-06-25 – 2026-08-31 — Summer',
        start: '2026-06-25',
        end: '2026-08-31',
      },
      {
        comment: '2026-10-26 – 2026-10-30 — Autumn (approximate)',
        start: '2026-10-26',
        end: '2026-10-30',
      },
      {
        comment: '2026-12-25 – 2027-01-05 — Christmas',
        start: '2026-12-25',
        end: '2027-01-05',
      },
    ],
  },
  UA: {
    note: 'Ukraine state holidays (zakon.rada.gov.ua calendar); Orthodox Easter 2026; school ≈ indicative.',
    public: [
      '2026-01-01',
      '2026-01-07',
      '2026-03-08',
      '2026-04-19',
      '2026-04-20',
      '2026-05-01',
      '2026-05-09',
      '2026-06-07',
      '2026-06-28',
      '2026-07-28',
      '2026-08-24',
      '2026-10-14',
      '2026-12-25',
    ],
    school: [
      {
        comment: '2025-12-25 – 2026-01-11 — Winter (approximate)',
        start: '2025-12-25',
        end: '2026-01-11',
      },
      {
        comment: '2026-03-23 – 2026-03-31 — Spring (approximate)',
        start: '2026-03-23',
        end: '2026-03-31',
      },
      {
        comment: '2026-04-17 – 2026-04-22 — Orthodox Easter window (approximate)',
        start: '2026-04-17',
        end: '2026-04-22',
      },
      {
        comment: '2026-06-01 – 2026-08-31 — Summer (approximate)',
        start: '2026-06-01',
        end: '2026-08-31',
      },
      {
        comment: '2026-10-26 – 2026-10-31 — Autumn (approximate)',
        start: '2026-10-26',
        end: '2026-10-31',
      },
      {
        comment: '2026-12-25 – 2027-01-10 — Christmas / New Year (approximate)',
        start: '2026-12-25',
        end: '2027-01-10',
      },
    ],
  },
};

function buildHolidayBlock(meta) {
  const pub = formatPublicLines(meta.public);
  const sch = formatSchoolLines(meta.school);
  return `# Public holidays — bank / national closures (${meta.note})

public_holidays:
  auto: false
  dates:
${pub}
  staffing_multiplier: 0.25
  trading_multiplier: 1.0

# School breaks — explicit dates (${meta.note.split(';')[1]?.trim() || 'regional; verify locally'})

school_holidays:
  auto: false
  dates:
${sch}
  staffing_multiplier: 0.75
  trading_multiplier: 1.0
  load_effects:
    lab_load_mult: 1.0
    team_load_mult: 1.0
    backend_load_mult: 1.0
    ops_activity_mult: 1.0
    commercial_activity_mult: 1.0`;
}

for (const code of ['CH', 'AT', 'NL', 'BE', 'PT', 'CZ', 'SK', 'SL', 'UA']) {
  const meta = CAL[code];
  const fp = path.join(DIR, `${code}.yaml`);
  let s = fs.readFileSync(fp, 'utf8');
  const start = s.indexOf('# Public holidays — bank / national closures');
  const end = s.indexOf('commercial_activity_mult: 1.0', start);
  if (start < 0 || end < 0) throw new Error(`${code}: holiday block not found`);
  const endLine = s.indexOf('\n', end);
  const before = s.slice(0, start);
  const after = s.slice(endLine + 1);
  const block = buildHolidayBlock(meta);
  fs.writeFileSync(fp, `${before}${block}\n${after}`, 'utf8');
  console.log('holidays ->', code);
}
