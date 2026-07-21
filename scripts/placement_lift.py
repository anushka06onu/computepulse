#!/usr/bin/env python3
"""Offline placement lift → results/placement_lift.json."""
from __future__ import annotations
import json, pickle
from pathlib import Path
import numpy as np, pandas as pd

ROOT = Path(__file__).resolve().parents[1]
FEATURES = ["task_role","cpu_usage_pct","gpu_usage_pct","mem_pressure","gpu_mem_pressure","cpu_gpu_ratio","io_bytes_total","io_ops_total","avg_io_size"]
W_RISK, W_ANOMALY = 0.75, 0.25

def main() -> None:
    data = pd.read_csv(ROOT / "data/cluster_data_real.csv")
    with open(ROOT / "models/model1.pkl", "rb") as f:
        m1 = pickle.load(f)
    with open(ROOT / "models/model_anomaly.pkl", "rb") as f:
        anom = pickle.load(f)
    pipe = anom["pipeline"]
    sample = data.groupby("node_id", group_keys=False).sample(n=1, random_state=0)
    risk = m1.predict_proba(sample[FEATURES])[:, 1] * 100
    raw = -pipe.decision_function(sample[FEATURES].fillna(0))
    lo, hi = float(anom.get("raw_min", raw.min())), float(anom.get("raw_max", raw.max()))
    anomaly = np.clip((raw - lo) / (hi - lo + 1e-9), 0, 1)
    fused = W_RISK * risk + W_ANOMALY * anomaly * 100
    fail = data.groupby("node_id")["will_fail"].mean().reindex(sample["node_id"]).to_numpy()
    score = 0.6 * (100 - fused) + 0.3 * (100 - anomaly * 100) + 0.1 * (100 - fail * 100)
    n, k = len(score), max(5, int(0.05 * len(score)))
    idx_v2 = np.argsort(-score)[:k]
    idx_risk = np.argsort(risk)[:k]
    idx_rand = np.random.default_rng(42).choice(n, size=k, replace=False)
    def fr(idx): return float(fail[idx].mean())
    br, rr, vr = fr(idx_rand), fr(idx_risk), fr(idx_v2)
    report = {
        "policy": "risk_anomaly_v2",
        "k": k,
        "n_nodes": int(n),
        "fail_rate_random": round(br, 4),
        "fail_rate_risk_only": round(rr, 4),
        "fail_rate_risk_anomaly_v2": round(vr, 4),
        "relative_reduction_vs_risk_only": round(float((rr - vr) / max(rr, 1e-9)), 4),
        "relative_reduction_vs_random": round(float((br - vr) / max(br, 1e-9)), 4),
    }
    (ROOT / "results/placement_lift.json").write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))

if __name__ == "__main__":
    main()
