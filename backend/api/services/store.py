"""
Load ComputePulse artifacts once and serve snapshot / SHAP / metrics.
Supports fused risk, anomaly, horizon, eval report, shadow log, drift.
"""

from __future__ import annotations

import hashlib
import json
import pickle
import time
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np
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

W_RISK = 0.75
W_ANOMALY = 0.25
FUSION = {"w_risk": W_RISK, "w_anomaly": W_ANOMALY}

REQUIRED = {
    "data/cluster_data_real.csv": "python prepare_dataset.py",
    "models/model1.pkl": "python train_model.py",
    "models/model_anomaly.pkl": "python train_anomaly.py",
    "results/baseline_results.txt": "python baseline_model.py",
    "results/model_results.txt": "python train_model.py",
    "results/node_risk_scores.csv": "python model2_placement.py",
    "results/optimization_opportunities.csv": "python model3_optimization.py",
    "results/eval_report.json": "python scripts/eval_report.py",
}


def grade_for(score: float) -> str:
    if score >= 85:
        return "Excellent"
    if score >= 70:
        return "Good"
    if score >= 55:
        return "Fair"
    return "Poor"


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


def _model_version_from_pkl(path: Path) -> str:
    h = hashlib.sha256(path.read_bytes()).hexdigest()[:12]
    return f"model1@{h}"


class Store:
    def __init__(self) -> None:
        self._ready = False
        self.data: pd.DataFrame | None = None
        self.model = None
        self.explainer = None
        self.anomaly_artifact: dict[str, Any] | None = None
        self.horizon_artifact: dict[str, Any] | None = None
        self.node_scores: pd.DataFrame | None = None
        self.optimization: pd.DataFrame | None = None
        self.baseline_results: dict[str, Any] = {}
        self.model_results: dict[str, Any] = {}
        self.cv_results: dict[str, Any] = {}
        self.confusion: dict[str, Any] = {}
        self.feature_importance: dict[str, Any] = {}
        self.model2_corr: dict[str, Any] = {}
        self.model3_summary: dict[str, Any] = {}
        self.eval_report: dict[str, Any] = {}
        self.placement_lift: dict[str, Any] = {}
        self.model_version: str = "model1@unknown"
        self.feature_set: list[str] = list(FEATURES)
        self.trained_at: str | None = None
        self.refresh_seed = 0
        self._ref_feature_means: dict[str, float] = {}
        self._ref_feature_stds: dict[str, float] = {}

    def ensure_loaded(self) -> None:
        if self._ready:
            return
        missing = missing_artifacts()
        if missing:
            raise RuntimeError(
                "Missing artifacts: " + ", ".join(m["file"] for m in missing)
            )
        self.data = pd.read_csv(_path("data/cluster_data_real.csv"))
        model_path = _path("models/model1.pkl")
        with model_path.open("rb") as f:
            self.model = pickle.load(f)
        self.explainer = shap.TreeExplainer(self.model)
        self.model_version = _model_version_from_pkl(model_path)
        self.trained_at = datetime.fromtimestamp(
            model_path.stat().st_mtime, tz=timezone.utc
        ).isoformat()

        with _path("models/model_anomaly.pkl").open("rb") as f:
            self.anomaly_artifact = pickle.load(f)

        hz = _path("models/model_horizon.pkl")
        if hz.exists():
            with hz.open("rb") as f:
                self.horizon_artifact = pickle.load(f)

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

        eval_path = _path("results/eval_report.json")
        self.eval_report = json.loads(eval_path.read_text())
        self.feature_set = list(self.eval_report.get("feature_set", FEATURES))
        if self.eval_report.get("model_version"):
            self.model_version = str(self.eval_report["model_version"])

        lift_path = _path("results/placement_lift.json")
        if lift_path.exists():
            self.placement_lift = json.loads(lift_path.read_text())

        # Reference stats for PSI drift
        for col in FEATURES:
            series = self.data[col].astype(float)
            self._ref_feature_means[col] = float(series.mean())
            self._ref_feature_stds[col] = float(series.std() or 1.0)

        self._ready = True

    def meta(self) -> dict[str, Any]:
        return {
            "model_version": self.model_version,
            "feature_set": self.feature_set,
            "trained_at": self.trained_at,
            "fusion": dict(FUSION),
            "n_rows": int(len(self.data)) if self.data is not None else None,
        }

    def bump_seed(self) -> int:
        self.refresh_seed += 1
        self._snapshot_cached.cache_clear()
        return self.refresh_seed

    def anomaly_scores(self, frame: pd.DataFrame) -> np.ndarray:
        assert self.anomaly_artifact is not None
        pipe = self.anomaly_artifact["pipeline"]
        feats = self.anomaly_artifact.get("features", FEATURES)
        X = frame[feats].fillna(0)
        raw = -pipe.decision_function(X)
        lo = float(self.anomaly_artifact.get("raw_min", raw.min()))
        hi = float(self.anomaly_artifact.get("raw_max", raw.max()))
        if hi <= lo:
            return np.clip((raw - raw.min()) / (raw.max() - raw.min() + 1e-9), 0, 1)
        return np.clip((raw - lo) / (hi - lo + 1e-9), 0, 1)

    def fuse(self, risk: float, anomaly: float) -> float:
        return float(W_RISK * risk + W_ANOMALY * anomaly * 100)

    def enrich_snapshot(self, sample: pd.DataFrame) -> pd.DataFrame:
        sample = sample.copy()
        sample["risk_score"] = self.model.predict_proba(sample[FEATURES])[:, 1] * 100
        sample["anomaly_score"] = self.anomaly_scores(sample)
        sample["fused_risk"] = [
            self.fuse(float(r), float(a))
            for r, a in zip(sample["risk_score"], sample["anomaly_score"])
        ]
        ranks = sample["fused_risk"].rank(method="min", ascending=False)
        n = max(1, len(sample))
        sample["fleet_rank"] = ranks.astype(int)
        sample["risk_percentile"] = (1 - (ranks - 1) / n) * 100
        return sample

    @lru_cache(maxsize=8)
    def _snapshot_cached(self, seed: int) -> pd.DataFrame:
        assert self.data is not None and self.model is not None
        sample = self.data.groupby("node_id", group_keys=False).sample(
            n=1, random_state=seed
        )
        return self.enrich_snapshot(sample).reset_index(drop=True)

    def get_snapshot(self, seed: int | None = None) -> pd.DataFrame:
        self.ensure_loaded()
        if seed is None:
            seed = self.refresh_seed
        return self._snapshot_cached(seed)

    def status_code(
        self, risk: float, critical: float = 70, watch: float = 40
    ) -> str:
        if risk > critical:
            return "critical"
        if risk > watch:
            return "watch"
        return "healthy"

    def health_score(self, snapshot: pd.DataFrame) -> dict[str, Any]:
        col = "fused_risk" if "fused_risk" in snapshot.columns else "risk_score"
        score = round(100 - float(snapshot[col].mean()), 1)
        return {"score": score, "grade": grade_for(score), "fusion": dict(FUSION)}

    def hist_fail_rate(self, node_id: int) -> float:
        assert self.data is not None
        hist = self.data[self.data["node_id"] == node_id]
        if hist.empty:
            return 0.0
        return float(hist["will_fail"].mean())

    def placement_components(
        self, fused_risk: float, anomaly: float, hist_fail: float
    ) -> dict[str, float]:
        return {
            "safety": round(100 - fused_risk, 2),
            "normality": round(100 - anomaly * 100, 2),
            "history": round(100 - hist_fail * 100, 2),
        }

    def placement_score(
        self, fused_risk: float, anomaly: float, hist_fail: float
    ) -> float:
        c = self.placement_components(fused_risk, anomaly, hist_fail)
        return round(0.6 * c["safety"] + 0.3 * c["normality"] + 0.1 * c["history"], 2)

    def node_timeline(
        self, node_id: int, limit: int = 40, *, include_forecast: bool = True
    ) -> list[dict[str, Any]]:
        self.ensure_loaded()
        assert self.data is not None and self.model is not None
        hist = self.data[self.data["node_id"] == node_id].tail(limit).copy()
        if hist.empty:
            return []
        hist["risk_score"] = self.model.predict_proba(hist[FEATURES])[:, 1] * 100
        hist["anomaly_score"] = self.anomaly_scores(hist)
        hist["fused_risk"] = [
            self.fuse(float(r), float(a))
            for r, a in zip(hist["risk_score"], hist["anomaly_score"])
        ]

        out: list[dict[str, Any]] = []
        for i, (_, r) in enumerate(hist.iterrows()):
            out.append(
                {
                    "index": i,
                    "risk_score": round(float(r["risk_score"]), 2),
                    "fused_risk": round(float(r["fused_risk"]), 2),
                    "forecast_risk": None,
                    "cpu_usage_pct": round(float(r["cpu_usage_pct"]), 2),
                    "gpu_usage_pct": round(float(r["gpu_usage_pct"]), 2),
                    "status": str(r["status"]),
                }
            )
        if include_forecast:
            forecasts = self._forecast_from_last(hist)
            base_idx = len(out)
            for step, fr in enumerate(forecasts, start=1):
                out.append(
                    {
                        "index": base_idx + step - 1,
                        "risk_score": None,
                        "fused_risk": None,
                        "forecast_risk": round(float(fr), 2),
                        "cpu_usage_pct": None,
                        "gpu_usage_pct": None,
                        "status": "forecast",
                    }
                )
        return out

    def _forecast_from_last(self, hist: pd.DataFrame) -> list[float]:
        if self.horizon_artifact is None or hist.empty:
            # Simple persistence + small drift
            last = float(hist["risk_score"].iloc[-1])
            return [min(100.0, last * (1 + 0.02 * s)) for s in range(1, 4)]

        model = self.horizon_artifact["model"]
        steps = int(self.horizon_artifact.get("horizon_steps", 3))
        row = hist.iloc[-1]
        curr = float(row["risk_score"])
        feats = list(self.horizon_artifact.get("features", FEATURES))
        preds: list[float] = []
        for _ in range(steps):
            X = pd.DataFrame(
                [{**{f: float(row[f]) for f in feats}, "curr_risk": curr}]
            )
            curr = float(np.clip(model.predict(X)[0], 0, 100))
            preds.append(curr)
        return preds

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
        return [{"feature": f, "impact": float(v)} for f, v in zip(FEATURES, local)]

    def pack_node_row(
        self,
        r: pd.Series,
        critical: float = 70,
        watch: float = 40,
    ) -> dict[str, Any]:
        risk = float(r["risk_score"])
        anomaly = float(r["anomaly_score"])
        fused = float(r["fused_risk"])
        return {
            "node_id": int(r["node_id"]),
            "risk_score": round(risk, 2),
            "anomaly_score": round(anomaly, 4),
            "fused_risk": round(fused, 2),
            "risk_percentile": round(float(r["risk_percentile"]), 2),
            "fleet_rank": int(r["fleet_rank"]),
            "cpu_usage_pct": round(float(r["cpu_usage_pct"]), 2),
            "gpu_usage_pct": round(float(r["gpu_usage_pct"]), 2),
            "mem_pressure": round(float(r["mem_pressure"]), 3),
            "duration_hours": round(float(r["duration_hours"]), 2),
            "status": str(r["status"]),
            "health": self.status_code(fused, critical, watch),
        }

    def append_shadow(self, event: dict[str, Any]) -> None:
        path = _path("results/shadow_log.jsonl")
        path.parent.mkdir(parents=True, exist_ok=True)
        event = {**event, "ts": time.time()}
        with path.open("a") as f:
            f.write(json.dumps(event) + "\n")

    def drift_psi(self, snapshot: pd.DataFrame, threshold: float = 0.25) -> dict[str, Any]:
        """Approximate PSI via mean-shift z-scores (feature-level)."""
        scores: dict[str, float] = {}
        for col in FEATURES:
            ref_mu = self._ref_feature_means.get(col, 0.0)
            ref_sd = self._ref_feature_stds.get(col, 1.0) or 1.0
            cur = float(snapshot[col].astype(float).mean())
            # Map |z| into a PSI-like score
            z = abs(cur - ref_mu) / ref_sd
            scores[col] = float(min(1.0, z / 4.0))
        max_psi = max(scores.values()) if scores else 0.0
        return {
            "psi": round(max_psi, 4),
            "high": max_psi >= threshold,
            "threshold": threshold,
            "by_feature": {k: round(v, 4) for k, v in scores.items()},
            "message": (
                "Feature drift warning: snapshot distribution diverges from training reference."
                if max_psi >= threshold
                else None
            ),
        }


store = Store()
