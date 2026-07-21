# ComputePulse Backend (FastAPI)

Python API + ML artifacts for ComputePulse. Deploy this folder to **Render**.

## Local run

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill GROQ_API_KEY / HF_TOKEN if using explain
uvicorn api.main:app --reload --host 127.0.0.1 --port 8000
```

Health: http://127.0.0.1:8000/api/health

From repo root: `make api` or `make dev` (API + Frontend).

## Layout

| Path | Role |
|------|------|
| `api/` | FastAPI app (`api.main:app`) |
| `data/` | Training / inference CSVs (needs `cluster_data_real.csv`) |
| `models/` | `model1.pkl`, `model_anomaly.pkl`, `model_horizon.pkl` |
| `results/` | Metrics, placement, optimization, eval report |
| `scripts/` | Eval / report helpers |
| `train_*.py`, `prepare_dataset.py`, … | Offline training pipeline |
| `dashboard.py` | Legacy Streamlit UI |

## Deploy on Render (step by step)

### 1. Push this repo to GitHub

Include runtime artifacts under `backend/data`, `backend/models`, `backend/results`
(see root `.gitignore` exceptions). Free Render builds from Git — missing pickles
or CSV → `/api/health` reports `ready: false`.

### 2. Create a Web Service

1. [Render Dashboard](https://dashboard.render.com) → **New** → **Web Service**
2. Connect the GitHub repo
3. Settings:

| Field | Value |
|-------|--------|
| **Root Directory** | `backend` |
| **Runtime** | Python 3 |
| **Build Command** | `pip install -r requirements.txt` |
| **Start Command** | `uvicorn api.main:app --host 0.0.0.0 --port $PORT` |
| **Health Check Path** | `/api/health` |

Or use Blueprint: from repo root, **New** → **Blueprint** → select `backend/render.yaml`
(or move/copy `render.yaml` to repo root with `rootDir: backend`).

### 3. Environment variables

| Key | Required | Example |
|-----|----------|---------|
| `FRONTEND_ORIGINS` | Yes (prod) | `https://your-app.vercel.app` (comma-separated OK) |
| `GROQ_API_KEY` | For LLM explain | from Groq console |
| `HF_TOKEN` | For embeddings | from Hugging Face |
| `GROQ_MODEL` | Optional | `llama-3.1-8b-instant` |
| `CORS_ALLOW_ALL` | Dev only | `true` (not for production) |

### 4. After deploy

- Open `https://<service>.onrender.com/api/health` → `"ready": true`
- Docs: `https://<service>.onrender.com/docs`
- Point Frontend at the API:

```bash
# Frontend/.env.production
VITE_API_BASE=https://<service>.onrender.com
```

Rebuild/redeploy the Frontend so browser calls go to Render (not Vite proxy).

### 5. Free-tier notes

- Cold starts after idle (~1 min)
- Keep `data/` + `models/` under ~100MB if possible (this project is fine)
- Do **not** commit `.env` secrets

## Train / rebuild artifacts (optional)

```bash
cd backend
python prepare_dataset.py
python train_model.py
python train_anomaly.py
python train_horizon.py
python model2_placement.py
python model3_optimization.py
python baseline_model.py
python scripts/eval_report.py
```
