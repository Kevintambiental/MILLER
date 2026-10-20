# MILLER · EDMUNDS

EDMUNDS is a soil-contaminant transport simulator. The Next.js landing page
adds an interactive, stratified 3D soil model; the original scientific
simulator remains available as a self-contained offline `index.html` and is
embedded without changing its solver, controls, catalog, or charts.

## Requirements and local development

- Node.js 20 LTS (Node.js 18.17 or newer is required by Next.js 14)
- npm

```sh
npm install
npm run dev
```

Open `http://localhost:3000`. The development pre-script copies the standalone
simulator into Next.js's public directory and generates the small local
`public/models/soil-cutaway.glb` and `public/models/cargo-truck.glb` models
before the app starts.

## Checks and production build

```sh
npm test
npm run build
npm start
```

The tests validate both generated GLB 2.0 assets, including the soil strata,
truck mesh/materials, POSITION bounds, and asset-size budgets. `npm run build`
prepares the same local simulator and model assets before exporting the static
site to `out/`. `npm start` serves that export locally.

## GitHub Pages deployment

The `Deploy to GitHub Pages` workflow builds and publishes the Next.js static
export at `https://kevintambiental.github.io/MILLER/`. Enable GitHub Pages in
the repository settings with **GitHub Actions** as the build and deployment
source. The workflow configures the `/MILLER` base path and prefixes the local
simulator and GLB asset URLs so the landing page, truck scene, and scientific
simulator all load under the project-site path.

## Vercel deployment

Import this repository into Vercel and use the detected Next.js framework and
default `npm run build` command. The build uses Next.js static export and does
not require a Next.js server runtime. The export includes the scientific
simulator and locally generated GLB assets; neither needs runtime downloads.

## Model, data, and provenance

- The 3D soil section is original procedural geometry generated locally by
  `scripts/generate-soil-model.mjs`: five wavy strata, a textured terrain
  surface, and an exposed section in a compact glTF 2.0 binary (`.glb`). It
  uses no downloaded or third-party 3D assets.
- The truck model is original procedural geometry generated locally by
  `scripts/generate-cargo-truck.mjs` as a compact `.glb`: a red long-nose
  tractor with chrome details, tandem dual wheels, and an industrial stainless
  steel tanker with a lower discharge pipe mounted at the rear end of the
  tanker. It is not an authentic or licensed
  Kenworth model and carries no manufacturer logos.
- The truck travels along the soil block's long axis, stays within the
  modeled terrain, and releases animated droplets from the tanker discharge
  pipe near the configured source. Controls next to the 3D model start a run,
  play/pause it, and seek through the same simulator timeline. Three orthogonal
  internal sections (X-Z, Y-Z, and X-Y) through the configured
  source location and depth render concentrations sampled from the matching
  solver cells. When the soil profile form is empty, starting from the scene
  loads the simulator's clearly labeled synthetic example; existing or partial
  input is never overwritten. The completed run starts playback automatically.
  Only cells above the entered detectable threshold are colored; the front and depth
  readouts use the same field. The spill marker only appears where the
  calculated surface-source cells contain contaminant; it does not affect the
  solver. The illustrative vehicle and soil texture are separate from the
  numerical result.
- The soil strata are a visual cross-section, not additional measured input.
  The plume envelope in the landing-page scene is reconstructed from the
  simulator's current calculated concentration field and shares its selected
  profile and simulation clock. It is absent until a run has been calculated.
- The original offline selector contains 864 EPA/ORNL RSL Fall 2024 entries.
  Available parameter values retain their source labels and are not filled
  with invented values. EPA screening levels in mg/kg are not treated as
  aqueous mg/L. Catalog source: [EPA Regional Screening Levels](https://www.epa.gov/risk/regional-screening-levels-rsls);
  consult that source and its terms for the underlying public data.
- Demonstration inputs already present in the standalone tool are identified
  there as synthetic examples, not site measurements.

The repository's independent web simulator does not replace the
`Kevintambiental/EDMUNDS` Python project.
