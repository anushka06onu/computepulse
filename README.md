# ComputePulse

AI system that predicts GPU cluster failures before they happen.

**Prometheus shows what IS. ComputePulse predicts what WILL BE.**

---

## What's in this folder

| File | What it does | Who owns it |
|---|---|---|
| `requirements.txt` | List of tools to install | Everyone |
| `generate_sample_data.py` | Creates fake but realistic cluster data (backup plan) | Person A |
| `data_loader.py` | Loads and cleans the data | Person A |
| `baseline_model.py` | Simple rule-based guess (no AI) - used for comparison | Person A / B |
| `train_model.py` | Trains the real AI model (LightGBM) + explains it (SHAP) | Person B |
| `dashboard.py` | The website showing everything | Person C |

---

## How to run everything (in this exact order)

### 1. Install the tools (only once)
```
pip install -r requirements.txt
```

### 2. Get the data ready
If you have real Alibaba GPU trace data, put it in `data/cluster_data.csv`
with these columns: node_id, cpu_usage, memory_usage, gpu_usage,
error_count, task_count, queue_length, will_fail

If you don't have real data yet, just run this instead:
```
python generate_sample_data.py
```

### 3. Clean the data
```
python data_loader.py
```

### 4. Check the baseline (simple rules, no AI)
```
python baseline_model.py
```

### 5. Train the real AI model
```
python train_model.py
```

### 6. Open the dashboard (website)
```
streamlit run dashboard.py
```

A browser window will open automatically. That's your live demo.

---

## Dataset info

Real data (optional): https://github.com/alibaba/clusterdata
Look for the folder `cluster-trace-gpu-v2023` — that one has real GPU
cluster data and is easier to access directly on GitHub than the older
2018 trace (which needs a survey form for a download link).

If real data is too slow or confusing to prepare in time, use
`generate_sample_data.py` instead. This is a completely normal and
accepted choice for a hackathon under time pressure.

---

## Team

- **Person A** — Data Pipeline (`generate_sample_data.py`, `data_loader.py`)
- **Person B** — AI Model (`baseline_model.py`, `train_model.py`)
- **Person C** — Dashboard (`dashboard.py`)

---

**ComputePulse — Predict. Prevent. Optimize.**
