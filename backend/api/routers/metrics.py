from __future__ import annotations

from fastapi import APIRouter, HTTPException

from api.services.store import store

router = APIRouter(prefix="/api/metrics", tags=["metrics"])


def _f1(precision: float, recall: float) -> float:
    denom = precision + recall
    return (2.0 * precision * recall / denom) if denom > 0 else 0.0


def _metric(primary: dict, key: str, *fallbacks: float) -> float:
    raw = primary.get(key)
    try:
        val = float(raw) if raw is not None else 0.0
    except (TypeError, ValueError):
        val = 0.0
    if val and val == val:  # non-zero and not NaN
        return val
    for fb in fallbacks:
        try:
            fbv = float(fb)
        except (TypeError, ValueError):
            continue
        if fbv and fbv == fbv:
            return fbv
    return 0.0 if val != val else val


@router.get("")
def metrics():
    try:
        store.ensure_loaded()
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e

    b = store.baseline_results
    m = store.model_results
    cv = store.cv_results
    cm = store.confusion
    ev = store.eval_report
    meta = store.meta()

    b_acc = _metric(b, "accuracy")
    b_prec = _metric(b, "precision")
    b_rec = _metric(b, "recall")
    b_f1 = _metric(b, "f1", _f1(b_prec, b_rec))
    b_auc = _metric(b, "auc")

    m_acc = _metric(m, "accuracy")
    m_prec = _metric(m, "precision")
    m_rec = _metric(m, "recall")
    m_f1 = _metric(m, "f1", _f1(m_prec, m_rec))
    # model_results.txt was sometimes truncated without auc — prefer holdout eval / CV
    m_auc = _metric(
        m,
        "auc",
        ev.get("roc_auc", 0),
        cv.get("cv_auc_mean", 0),
    )

    tp = float(cm.get("true_positive", 0))
    fn = float(cm.get("false_negative", 0))
    caught = tp / (tp + fn) if (tp + fn) > 0 else 0.0

    importance = [
        {"feature": k, "importance": float(v)}
        for k, v in store.feature_importance.items()
    ]
    importance.sort(key=lambda x: x["importance"])
    # Normalize for chart readability (relative share of total gain/splits).
    imp_total = sum(x["importance"] for x in importance) or 1.0
    importance_pct = [
        {
            "feature": x["feature"],
            "importance": round(100.0 * x["importance"] / imp_total, 2),
            "raw": x["importance"],
        }
        for x in importance
    ]

    n_test = int(ev.get("n_test", 0))
    n_rows = int(ev.get("n_rows", 0))
    provenance = str(
        ev.get("provenance")
        or (
            "Real holdout metrics on cluster_data_real.csv — baseline rules and "
            "Failure risk model scored on the identical stratified 20% test split "
            "(random_state=42)."
        )
    )

    return {
        "baseline": {
            "accuracy": b_acc,
            "precision": b_prec,
            "recall": b_rec,
            "f1": b_f1,
            "auc": b_auc,
        },
        "model": {
            "accuracy": m_acc,
            "precision": m_prec,
            "recall": m_rec,
            "f1": m_f1,
            "auc": m_auc,
        },
        "cv": {
            "auc_mean": float(cv.get("cv_auc_mean", 0)),
            "auc_std": float(cv.get("cv_auc_std", 0)),
        },
        "eval": {
            "pr_auc": float(ev.get("pr_auc", 0)),
            "roc_auc": float(ev.get("roc_auc", 0)),
            "ece": float(ev.get("ece", 0)),
            "brier": float(ev.get("brier", 0)),
            "top5_recall": float(ev.get("top5_recall", 0)),
            "top10_recall": float(ev.get("top10_recall", 0)),
            "node_top5_recall": float(ev.get("node_top5_recall", 0)),
            "n_rows": n_rows,
            "n_test": n_test,
            "provenance": provenance,
            "computed_at": ev.get("computed_at"),
            "split": ev.get("split"),
        },
        "provenance": {
            "real": True,
            "source": "holdout_eval",
            "dataset": "data/cluster_data_real.csv",
            "n_rows": n_rows,
            "n_test": n_test,
            "split": ev.get("split")
            or {"test_size": 0.2, "random_state": 42, "stratify": "will_fail"},
            "baseline": "rule thresholds (baseline_model.py) on same test split",
            "model": "Failure risk model (LightGBM) probabilities on same test split",
            "note": provenance,
            "computed_at": ev.get("computed_at"),
        },
        "fusion": meta["fusion"],
        "model_version": meta["model_version"],
        "feature_set": meta["feature_set"],
        "trained_at": meta["trained_at"],
        "placement_lift": store.placement_lift or None,
        "confusion": {
            "true_negative": int(cm.get("true_negative", 0)),
            "false_positive": int(cm.get("false_positive", 0)),
            "false_negative": int(cm.get("false_negative", 0)),
            "true_positive": int(cm.get("true_positive", 0)),
            "failures_caught": round(caught, 4),
        },
        "feature_importance": importance_pct,
        "comparison": [
            {
                "metric": "Accuracy",
                "baseline": b_acc * 100,
                "model": m_acc * 100,
            },
            {
                "metric": "Precision",
                "baseline": b_prec * 100,
                "model": m_prec * 100,
            },
            {
                "metric": "Recall",
                "baseline": b_rec * 100,
                "model": m_rec * 100,
            },
            {
                "metric": "F1",
                "baseline": b_f1 * 100,
                "model": m_f1 * 100,
            },
            {
                "metric": "ROC-AUC",
                "baseline": b_auc * 100,
                "model": m_auc * 100,
            },
        ],
    }

