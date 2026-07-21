#!/usr/bin/env python3
"""Train IsolationForest anomaly detector → models/model_anomaly.pkl."""

from __future__ import annotations

import pickle
from pathlib import Path

import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

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
    X = data[FEATURES].fillna(0)
    sample = X.sample(n=min(80_000, len(X)), random_state=42)
    pipe = Pipeline(
        [
            ("scaler", StandardScaler()),
            (
                "iforest",
                IsolationForest(
                    n_estimators=200,
                    contamination=0.08,
                    random_state=42,
                    n_jobs=-1,
                ),
            ),
        ]
    )
    pipe.fit(sample)
    # Calibration range for 0–1 mapping
    raw = -pipe.decision_function(sample)
    artifact = {
        "pipeline": pipe,
        "features": FEATURES,
        "raw_min": float(raw.min()),
        "raw_max": float(raw.max()),
    }
    out = ROOT / "models/model_anomaly.pkl"
    with out.open("wb") as f:
        pickle.dump(artifact, f)
    print(f"Saved {out}")


if __name__ == "__main__":
    main()
