#!/usr/bin/env python3
"""Compute holdout eval metrics → results/eval_report.json."""

from __future__ import annotations

import hashlib
import json
import pickle
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import average_precision_score, brier_score_loss, roc_auc_score
from sklearn.model_selection import train_test_split

ROOT = Path(__file__).resolve().parents[1]
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


def expected_calibration_error(y_true: np.ndarray, proba: np.ndarray, n_bins: int = 10) -> float:
    bins = np.linspace(0, 1, n_bins + 1)
    ece = 0.0
    for i in range(n_bins):
        lo, hi = bins[i], bins[i + 1]
        mask = (proba >= lo) & (proba < hi if i < n_bins - 1 else proba <= hi)
        if not mask.any():
            continue
        ece += float(mask.mean()) * abs(float(y_true[mask].mean()) - float(proba[mask].mean()))
    return float(ece)


def main() -> None:
    data = pd.read_csv(ROOT / "data/cluster_data_real.csv")
    X, y = data[FEATURES], data["will_fail"]
    _, X_te, _, y_te = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)

    model_path = ROOT / "models/model1.pkl"
    with model_path.open("rb") as f:
        model = pickle.load(f)

    proba = model.predict_proba(X_te)[:, 1]
    y_arr = y_te.to_numpy()
    order = np.argsort(-proba)
    pos = int(y_arr.sum())
    k5 = max(1, int(0.05 * len(order)))
    k10 = max(1, int(0.10 * len(order)))
    top5_recall = float(y_arr[order[:k5]].sum() / pos) if pos else 0.0
    top10_recall = float(y_arr[order[:k10]].sum() / pos) if pos else 0.0

    te = data.loc[X_te.index].copy()
    te["p"] = proba
    node = te.groupby("node_id").agg(p=("p", "mean"), fail=("will_fail", "mean"))
    node = node.sort_values("p", ascending=False)
    nk = max(1, int(0.05 * len(node)))
    failed_nodes = set(node.index[node["fail"] > 0])
    top_nodes = set(node.index[:nk])
    node_top5_recall = len(top_nodes & failed_nodes) / max(1, len(failed_nodes))

    h = hashlib.sha256(model_path.read_bytes()).hexdigest()[:12]
    report = {
        "n_rows": int(len(data)),
        "n_test": int(len(X_te)),
        "roc_auc": float(roc_auc_score(y_arr, proba)),
        "pr_auc": float(average_precision_score(y_arr, proba)),
        "brier": float(brier_score_loss(y_arr, proba)),
        "ece": expected_calibration_error(y_arr, proba),
        "top5_recall": top5_recall,
        "top10_recall": top10_recall,
        "node_top5_recall": float(node_top5_recall),
        "model_version": f"model1@{h}",
        "feature_set": FEATURES,
        "trained_at": None,
    }
    out = ROOT / "results/eval_report.json"
    out.write_text(json.dumps(report, indent=2))
    (ROOT / "results/model_version.txt").write_text(
        f"model_version={report['model_version']}\nn_rows={report['n_rows']}\n"
    )
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
