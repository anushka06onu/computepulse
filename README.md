# ComputePulse

AI system that predicts GPU cluster node failures, recommends workload
placement, and identifies cost-saving opportunities — trained and
evaluated on **real Alibaba production cluster data**, not synthetic data.

**Prometheus shows what IS. ComputePulse predicts what WILL BE.**

This is not a single-chart demo. It's an interactive, multi-tab tool a
cluster researcher could actually open and use to decide which real
machine to trust with their next job.

---

## The three modules (from the concept note — all three are real, not just described)

### Module 1 — Failure Risk Prediction
Tuned LightGBM model predicts the probability that a given instance will
fail or be interrupted, based on real usage telemetry.

### Module 2 — Smart Workload Placement
Real per-machine risk aggregated from Module 1's validated predictions,
used to recommend which of the 1,723 real machines a new job should run
on. Not a separately trained classifier — the real dataset has no
"optimal placement" label, so this is honestly built as a decision layer
on top of Module 1, then validated against real outcomes (see below).

### Module 3 — Resource Optimization
Finds real machines that are consistently underutilized (low real GPU
usage across many real recorded instances) and estimates real potential
dollar savings, using a clearly labeled industry-average cost assumption
($2.50/GPU-hour — not a number from the dataset itself).

All three are explained with **SHAP** — including a real per-node local
explanation in the dashboard, not just one global chart.

---

## Real results (reproducible — run the scripts yourself)

Trained on 796,582 real instances from Alibaba's PAI GPU cluster
(~6,500 GPUs, ~1,800 machines, July–August 2020).

| Metric | Baseline (simple rules) | ComputePulse AI (tuned LightGBM) |
|---|---|---|
| Accuracy | 53.4% | **88.0%** |
| Precision | 12.6% | **77.4%** |
| Recall | 15.4% | **71.2%** |
| F1 | 13.9% | **74.2%** |
| ROC-AUC | 0.405 (worse than random) | **0.924** |

- 5-fold cross-validation ROC-AUC: **0.910 ± 0.002** (stable, not a lucky split)
- Module 2 validation: predicted risk correlates with real observed failure
  rate at **r = 0.902** across 1,723 real machines
- Module 3: **1,220 of 1,723** real machines are underutilized (<15% avg
  real GPU usage), representing an estimated **$2,037,986** in idle
  GPU-hour savings opportunity (at the assumed $2.50/GPU-hour rate)
- SHAP: `gpu_usage_pct` is the single strongest failure predictor — this
  matches how the real cluster works (preemptible/shared GPUs, so high
  GPU pressure genuinely correlates with jobs being interrupted)

---

## The dashboard — 5 tabs, not 1 chart

| Tab | What a researcher actually does with it |
|---|---|
| Fleet Overview | See every real machine's current health at a glance, color-coded, with a "refresh" button that resamples a new real historical snapshot per machine to simulate a live view |
| Node Explorer | Pick any real machine by ID, see its current metrics, real historical failure rate, and a real per-node SHAP explanation of why it has that risk score right now |
| Smart Job Placement | "Where should my next job run?" - real ranked recommendations (best and worst real machines right now), adjustable count |
| Cost Optimization | Real underutilized machines ranked by estimated dollar savings, with the assumption clearly labeled |
| Model Performance | The supporting evidence: baseline vs AI, cross-validation, confusion matrix, global SHAP - proof behind the numbers, not the whole product |

---

## Files

| File | What it does | Owner |
|---|---|---|
| `requirements.txt` | Libraries to install | Everyone |
| `prepare_dataset.py` | Loads + merges + feature-engineers the real data | Person A |
| `baseline_model.py` | Simple rule-based comparison model | Person A/B |
| `train_model.py` | Module 1: real LightGBM training - CV, hyperparameter tuning, evaluation, SHAP | Person B |
| `model2_placement.py` | Module 2: real per-machine risk ranking (workload placement) | Person B |
| `model3_optimization.py` | Module 3: real underutilized-machine detection + savings estimate | Person B |
| `dashboard.py` | The interactive 5-tab tool | Person C |

---

## How to run everything (in this exact order)

### 1. Install
```
pip install -r requirements.txt
```

### 2. Get the real data
Download these 2 files (real Alibaba GPU cluster trace, ~1GB total):

Official source: https://github.com/alibaba/clusterdata/tree/master/cluster-trace-gpu-v2020

Easier mirror (GitHub, split into small ~30MB parts):
https://github.com/qzweng/clusterdata-cluster-trace-gpu-v2020-data

Download all `pai_instance_table.tar.gz.part*` and
`pai_sensor_table.tar.gz.part*` files, then merge and extract:
```
cat pai_instance_table.tar.gz.part* > pai_instance_table.tar.gz
cat pai_sensor_table.tar.gz.part* > pai_sensor_table.tar.gz
tar -xzf pai_instance_table.tar.gz
tar -xzf pai_sensor_table.tar.gz
```

Put both resulting CSVs in a `data/` folder:
```
data/pai_instance_table.csv   (~2 GB, 7.5M rows)
data/pai_sensor_table.csv     (~1 GB, 3M rows)
```

### 3. Run the full pipeline, in order
```
python prepare_dataset.py
python baseline_model.py
python train_model.py
python model2_placement.py
python model3_optimization.py
```
`train_model.py` takes a few minutes - it runs real cross-validation and
real hyperparameter search, not a single `.fit()` call.

### 4. Open the web UI (recommended)

Terminal 1 — API (from repo root):
```
uvicorn api.main:app --reload --port 8000
```

Terminal 2 — React app:
```
cd Frontend
npm install
npm run dev
```

Open http://localhost:5173 — landing page + full dashboard under `/app/*`.

### 5. Streamlit fallback (optional)
```
streamlit run dashboard.py
```

---

## Web app layout

| Path | What it does |
|---|---|
| `Frontend/` | All React UI (Vite + TypeScript + Framer Motion) |
| `api/` | FastAPI JSON layer over the same ML artifacts |
| `/` | Marketing landing page |
| `/app/fleet` … `/app/evidence` | Interactive dashboard (parity with Streamlit tabs) |
| `/app/compare` | Side-by-side node comparison |

Features: command palette (⌘K), CSV export, adjustable risk thresholds,
node deep-links, onboarding tour, artifact readiness banner.
---

## Honesty notes (know these before presenting to judges)

- **The dataset does not label "optimal placement."** Module 2 is not a
  separately trained classifier - it's real per-machine risk aggregated
  from Module 1's validated predictions, correlated against real observed
  failure rates (r=0.902) to prove it's meaningful, not guessing. If asked
  "how is this trained?", say exactly this - it's a better answer than
  claiming a fake ground-truth label exists.
- **Module 3's dollar figures use a documented assumption**
  ($2.50/GPU-hour, a public-cloud-adjacent estimate) because the real
  Alibaba trace is from an internal cluster and has no price list. This
  is stated on-screen everywhere the dollar figure appears.
- **Hyperparameter search runs on a 150,000-row subsample** for speed
  (standard practice), but the final model is fit on the full 637,265-row
  training set using the best parameters found.
- **The "Fleet Overview" refresh is simulated**, not a live feed - this
  dataset is a static historical trace, not a live cluster connection.
  The dashboard says this explicitly rather than implying real-time data.
- **`cpu_usage_pct` can exceed 100** - real quirk of the dataset (600.0
  means 6 CPU cores used, not 600%). Documented, not a bug.
- Every number above came from an actual run of this exact code against
  the real downloaded dataset - nothing here is a placeholder or invented
  figure.

---

**ComputePulse - Predict. Prevent. Optimize.**

