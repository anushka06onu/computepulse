"""
Load ComputePulse artifacts once and serve snapshot / SHAP / metrics.
Logic mirrors dashboard.py.
"""

from __future__ import annotations

import os
import pickle
from functools import lru_cache
from pathlib import Path
from typing import Any

import pandas as pd
import shap

ROOT = Path(__file__).resolve().parents[2]

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

REASON_MAP = {
    "cpu_usage_pct": "High CPU pressure",
    "mem_pressure": "High memory pressure",
    "gpu_usage_pct": "High GPU contention",
    "gpu_mem_pressure": "High GPU memory pressure",
    "io_ops_total": "Heavy I/O",
    "io_bytes_total": "Heavy I/O",
    "avg_io_size": "Large I/O operations",
    "cpu_gpu_ratio": "Unbalanced CPU/GPU ratio",
    "task_role": "Risky task role",
}


def grade_for(score: float) -> str:
    if score >= 85:
        return "Excellent"
    if score >= 70:
        return "Good"
    if score >= 55:
        return "Fair"
    return "Poor"


REQUIRED = {
    "data/cluster_data_real.csv": "python prepare_dataset.py",
    "models/model1.pkl": "python train_model.py",
    "results/baseline_results.txt": "python baseline_model.py",
    "results/model_results.txt": "python train_model.py",
    "results/node_risk_scores.csv": "python model2_placement.py",
    "results/optimization_opportunities.csv": "python model3_optimization.py",
}


def _path(rel: str) -> Path:
    return ROOT / rel


def read_key_value_file(path: Path) -> dict[str, Any]:
    result: dict[str, Any] = {}
    if not path.exists():
        return result
    with path.open("r") as f:
        for line in f:
            if "=" not in line:
                continue
            key, value = line.strip().split("=", 1)
            try:
                result[key] = float(value)
            except ValueError:
                result[key] = value
    return result


def missing_artifacts() -> list[dict[str, str]]:
    missing = []
    for rel, cmd in REQUIRED.items():
        if not _path(rel).exists():
            missing.append({"file": rel, "command": cmd})
    return missing


def health_status() -> dict[str, Any]:
    missing = missing_artifacts()
    return {
        "ready": len(missing) == 0,
        "missing": missing,
        "root": str(ROOT),
    }


class Store:
    def __init__(self) -> None:
        self._ready = False
        self.data: pd.DataFrame | None = None
        self.model = None
        self.explainer = None
        self.node_scores: pd.DataFrame | None = None
        self.optimization: pd.DataFrame | None = None
        self.baseline_results: dict[str, Any] = {}
        self.model_results: dict[str, Any] = {}
        self.cv_results: dict[str, Any] = {}
        self.confusion: dict[str, Any] = {}
        self.feature_importance: dict[str, Any] = {}
        self.model2_corr: dict[str, Any] = {}
        self.model3_summary: dict[str, Any] = {}
        self.refresh_seed = 0

    def ensure_loaded(self) -> None:
        if self._ready:
            return
        missing = missing_artifacts()
        if missing:
            raise RuntimeError(
                "Missing artifacts: " + ", ".join(m["file"] for m in missing)
            )
        self.data = pd.read_csv(_path("data/cluster_data_real.csv"))
        with _path("models/model1.pkl").open("rb") as f:
            self.model = pickle.load(f)
        self.explainer = shap.TreeExplainer(self.model)
        self.node_scores = pd.read_csv(_path("results/node_risk_scores.csv"))
        self.optimization = pd.read_csv(
            _path("results/optimization_opportunities.csv")
        )
        self.baseline_results = read_key_value_file(
            _path("results/baseline_results.txt")
        )
        self.model_results = read_key_value_file(_path("results/model_results.txt"))
        self.cv_results = read_key_value_file(_path("results/cv_results.txt"))
        self.confusion = read_key_value_file(_path("results/confusion_matrix.txt"))
        self.feature_importance = read_key_value_file(
            _path("results/feature_importance.txt")
        )
        self.model2_corr = read_key_value_file(
            _path("results/model2_correlation.txt")
        )
        self.model3_summary = read_key_value_file(
            _path("results/model3_summary.txt")
        )
        self._ready = True

    def bump_seed(self) -> int:
        self.refresh_seed += 1
        return self.refresh_seed

    @lru_cache(maxsize=8)
    def _snapshot_cached(self, seed: int) -> pd.DataFrame:
        assert self.data is not None and self.model is not None
        sample = self.data.groupby("node_id", group_keys=False).sample(
            n=1, random_state=seed
        )
        sample = sample.copy()
        sample["risk_score"] = (
            self.model.predict_proba(sample[FEATURES])[:, 1] * 100
        )
        return sample.reset_index(drop=True)

    def get_snapshot(self, seed: int | None = None) -> pd.DataFrame:
        self.ensure_loaded()
        if seed is None:
            seed = self.refresh_seed
        return self._snapshot_cached(seed)

    def status_code(self, risk: float, critical: float = 70, watch: float = 40) -> str:
        if risk > critical:
            return "critical"
        if risk > watch:
            return "watch"
        return "healthy"

    def health_score(self, snapshot: pd.DataFrame) -> dict[str, Any]:
        score = round(100 - float(snapshot["risk_score"].mean()), 1)
        return {"score": score, "grade": grade_for(score)}

    def node_timeline(self, node_id: int, limit: int = 40) -> list[dict[str, Any]]:
        self.ensure_loaded()
        assert self.data is not None and self.model is not None
        hist = self.data[self.data["node_id"] == node_id].tail(limit).copy()
        if hist.empty:
            return []
        hist["risk_score"] = self.model.predict_proba(hist[FEATURES])[:, 1] * 100
        out = []
        for i, (_, r) in enumerate(hist.iterrows()):
            out.append(
                {
                    "index": i,
                    "risk_score": round(float(r["risk_score"]), 2),
                    "cpu_usage_pct": round(float(r["cpu_usage_pct"]), 2),
                    "gpu_usage_pct": round(float(r["gpu_usage_pct"]), 2),
                    "status": str(r["status"]),
                }
            )
        return out

    def shap_reasons(
        self, row: pd.Series, failure_rate: float = 0.0, top_k: int = 3
    ) -> list[str]:
        contribs = self.local_shap(row)
        positives = sorted(
            (c for c in contribs if c["impact"] > 0),
            key=lambda x: x["impact"],
            reverse=True,
        )
        feats: list[str] = []
        for c in positives:
            text = REASON_MAP.get(c["feature"])
            if text and text not in feats:
                feats.append(text)
        repeated = failure_rate > 0.25
        limit = top_k - 1 if repeated else top_k
        reasons = feats[:limit]
        if repeated:
            reasons.append("Repeated failures")
        return reasons or ["Elevated overall risk"]

    def local_shap(self, row: pd.Series) -> list[dict[str, Any]]:
        assert self.explainer is not None
        row_features = row[FEATURES].to_frame().T.astype(float)
        shap_vals = self.explainer.shap_values(row_features)
        if isinstance(shap_vals, list):
            local = shap_vals[1][0]
        else:
            local = shap_vals[0]
        return [
            {"feature": f, "impact": float(v)}
            for f, v in zip(FEATURES, local)
        ]


store = Store()
