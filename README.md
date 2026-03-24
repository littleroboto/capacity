# Capacity ATC — operational runway

React + TypeScript tool: edit a **YAML DSL**, run an internal **capacity / risk pipeline**, and inspect a **week-based runway heatmap** (7 columns = Mon–Sun) for the selected country.

## Run

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

Output in `dist/`. Static market YAML lives under `public/data/markets/`.

## Documentation

**[docs/CAPACITY-RUNWAY.md](docs/CAPACITY-RUNWAY.md)** — full reference:

- What is built vs stubbed  
- **DSL field-by-field rules** and defaults  
- Pipeline math (capacity, risk, holidays, display noise)  
- Runway UI behaviour  
- Browser storage keys  

## Quick facts

- **YAML only** (multi-document `---` for multiple countries).  
- **Runway** shows the **header country** only.  
- **Heatmap colour** = **risk_score** (10-step green→red), with small **deterministic noise** for texture.  
- **AI** panel is a placeholder (no API).
