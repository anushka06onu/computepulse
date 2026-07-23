#!/usr/bin/env python3
"""Recompute REAL holdout metrics from data + trained model (no placeholders)."""

from __future__ import annotations

import json
import pickle
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    brier_score_loss,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
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


def baseline_predict(row) -> int:
    """Match baseline_model.py rules exactly."""
    risky = (
        row["cpu_usage_pct"] > 400
        or row["gpu_usage_pct"] > 80
        or row["mem_pressure"] > 0.9
    )
    return int(risky)


def expected_calibration_error(
    y_true: np.ndarray, proba: np.ndarray, n_bins: int = 10
) -> float:
    bins = np.linspace(0, 1, n_bins + 1)
    ece = 0.0
    for i in range(n_bins):
        lo, hi = bins[i], bins[i + 1]
        mask = (proba >= lo) & (proba < hi if i < n_bins - 1 else proba <= hi)
        if not mask.any():
            continue
        ece += float(mask.mean()) * abs(
            float(y_true[mask].mean()) - float(proba[mask].mean())
        )
    return float(ece)


def main() -> None:
    data = pd.read_csv(ROOT / "data/cluster_data_real.csv")
    train_df, test_df = train_test_split(
        data, test_size=0.2, random_state=42, stratify=data["will_fail"]
    )
    y_true = test_df["will_fail"].to_numpy()
    X_te = test_df[FEATURES]

    # ── Baseline (rule-based, same holdout) ──────────────────────────
    base_pred = test_df.apply(baseline_predict, axis=1).to_numpy()
    b_acc = float(accuracy_score(y_true, base_pred))
    b_prec = float(precision_score(y_true, base_pred, zero_division=0))
    b_rec = float(recall_score(y_true, base_pred, zero_division=0))
    b_f1 = float(f1_score(y_true, base_pred, zero_division=0))
    b_auc = float(roc_auc_score(y_true, base_pred))
    (ROOT / "results/baseline_results.txt").write_text(
        f"accuracy={b_acc}\n"
        f"precision={b_prec}\n"
        f"recall={b_rec}\n"
        f"f1={b_f1}\n"
        f"auc={b_auc}\n"
    )

    # ── Failure risk model (same holdout) ────────────────────────────
    model_path = ROOT / "models/failure_risk_model.pkl"
    with model_path.open("rb") as f:
        model = pickle.load(f)

    pred = model.predict(X_te)
    proba = model.predict_proba(X_te)[:, 1]
    m_acc = float(accuracy_score(y_true, pred))
    m_prec = float(precision_score(y_true, pred, zero_division=0))
    m_rec = float(recall_score(y_true, pred, zero_division=0))
    m_f1 = float(f1_score(y_true, pred, zero_division=0))
    m_auc = float(roc_auc_score(y_true, proba))
    (ROOT / "results/model_results.txt").write_text(
        f"accuracy={m_acc}\n"
        f"precision={m_prec}\n"
        f"recall={m_rec}\n"
        f"f1={m_f1}\n"
        f"auc={m_auc}\n"
    )

    cm = confusion_matrix(y_true, pred)
    (ROOT / "results/confusion_matrix.txt").write_text(
        f"true_negative={int(cm[0][0])}\n"
        f"false_positive={int(cm[0][1])}\n"
        f"false_negative={int(cm[1][0])}\n"
        f"true_positive={int(cm[1][1])}\n"
    )

    # Real feature names from the trained model (not placeholder labels).
    if hasattr(model, "feature_importances_"):
        imp = list(zip(FEATURES, model.feature_importances_.tolist()))
    else:
        imp = [(f, 0.0) for f in FEATURES]
    imp.sort(key=lambda x: x[1], reverse=True)
    (ROOT / "results/feature_importance.txt").write_text(
        "".join(f"{feat}={score}\n" for feat, score in imp)
    )

    pr_auc = float(average_precision_score(y_true, proba))
    brier = float(brier_score_loss(y_true, proba))
    ece = expected_calibration_error(y_true, proba)
    order = np.argsort(-proba)
    pos = int(y_true.sum())
    k5 = max(1, int(0.05 * len(order)))
    k10 = max(1, int(0.10 * len(order)))
    top5_recall = float(y_true[order[:k5]].sum() / pos) if pos else 0.0
    top10_recall = float(y_true[order[:k10]].sum() / pos) if pos else 0.0

    te = test_df.copy()
    te["p"] = proba
    node = te.groupby("node_id").agg(p=("p", "mean"), fail=("will_fail", "mean"))
    node = node.sort_values("p", ascending=False)
    nk = max(1, int(0.05 * len(node)))
    failed_nodes = set(node.index[node["fail"] > 0])
    top_nodes = set(node.index[:nk])
    node_top5_recall = len(top_nodes & failed_nodes) / max(1, len(failed_nodes))

    computed_at = datetime.now(timezone.utc).isoformat()
    report = {
        "n_rows": int(len(data)),
        "n_test": int(len(test_df)),
        "n_train": int(len(train_df)),
        "split": {"test_size": 0.2, "random_state": 42, "stratify": "will_fail"},
        "roc_auc": m_auc,
        "pr_auc": pr_auc,
        "brier": brier,
        "ece": ece,
        "top5_recall": top5_recall,
        "top10_recall": top10_recall,
        "node_top5_recall": float(node_top5_recall),
        "model_version": "Failure risk model",
        "feature_set": FEATURES,
        "trained_at": datetime.fromtimestamp(
            model_path.stat().st_mtime, tz=timezone.utc
        ).isoformat(),
        "computed_at": computed_at,
        "provenance": (
            "Real holdout metrics on cluster_data_real.csv — baseline rules and "
            "Failure risk model scored on the identical stratified 20% test split "
            "(random_state=42). Not synthetic / not hand-tuned display numbers."
        ),
    }
    (ROOT / "results/eval_report.json").write_text(json.dumps(report, indent=2))
    (ROOT / "results/model_version.txt").write_text(
        f"model_version={report['model_version']}\n"
        f"n_rows={report['n_rows']}\n"
        f"n_test={report['n_test']}\n"
        f"computed_at={computed_at}\n"
    )

    print(
        json.dumps(
            {
                "n_test": report["n_test"],
                "baseline": {
                    "accuracy": b_acc,
                    "f1": b_f1,
                    "auc": b_auc,
                },
                "model": {
                    "accuracy": m_acc,
                    "f1": m_f1,
                    "auc": m_auc,
                },
                "confusion": {
                    "tn": int(cm[0][0]),
                    "fp": int(cm[0][1]),
                    "fn": int(cm[1][0]),
                    "tp": int(cm[1][1]),
                },
                "top_features": imp[:3],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
