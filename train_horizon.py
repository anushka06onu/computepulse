#!/usr/bin/env python3
"""Train short-horizon risk regressor → models/model_horizon.pkl."""

from __future__ import annotations

import pickle
from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split

ROOT = Path(__file__).resolve().parent
FEATURES = [
    "task_role",
    "cpu_usage_pct",
    "gpu_usage_pct",
    "mem_pressure",
    "gpu_mem_pressure",
    "cpu_gpu_ratio",
    "io_bytes_total",
    "io_ops_total",
    "avg_io_size",
]


def main() -> None:
    data = pd.read_csv(ROOT / "data/cluster_data_real.csv")
    with (ROOT / "models/model1.pkl").open("rb") as f:
        risk_model = pickle.load(f)

    # Target: next-row risk within same node (shifted). Fall back to current risk.
    frames = []
    for _, g in data.groupby("node_id", sort=False):
        g = g.copy()
        g["curr_risk"] = risk_model.predict_proba(g[FEATURES])[:, 1] * 100
        g["next_risk"] = g["curr_risk"].shift(-1)
        frames.append(g)
    df = pd.concat(frames, ignore_index=True)
    df = df.dropna(subset=["next_risk"])

    X = df[FEATURES + ["curr_risk"]]
    y = df["next_risk"]
    X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.2, random_state=42)

    model = lgb.LGBMRegressor(
        n_estimators=120,
        learning_rate=0.05,
        num_leaves=31,
        random_state=42,
        n_jobs=-1,
        verbosity=-1,
    )
    model.fit(X_tr, y_tr)
    pred = model.predict(X_te)
    mae = float(np.mean(np.abs(pred - y_te)))
    artifact = {
        "model": model,
        "features": FEATURES,
        "extra": ["curr_risk"],
        "mae": mae,
        "horizon_steps": 3,
    }
    out = ROOT / "models/model_horizon.pkl"
    with out.open("wb") as f:
        pickle.dump(artifact, f)
    print(f"Saved {out} mae={mae:.3f}")


if __name__ == "__main__":
    main()
