# ComputePulse Frontend

React + Vite + TypeScript UI for ComputePulse.

## Run

From repo root, start the API:

```bash
source .venv/bin/activate   # or your env with requirements.txt
uvicorn api.main:app --reload --port 8000
```

Then:

```bash
cd Frontend
npm install
npm run dev
```

Open http://localhost:5173

Vite proxies `/api/*` to `http://127.0.0.1:8000`.

## Scripts

- `npm run dev` — local development
- `npm run build` — production build to `dist/`
- `npm run preview` — preview production build

## Structure

```
src/
  pages/        Landing + dashboard views
  components/   Shell, tables, palette, tour, KPIs
  api/          Typed fetch client
  motion/       Framer Motion presets
  styles/       Design tokens + global CSS
  context/      Seed, thresholds, readiness
```
