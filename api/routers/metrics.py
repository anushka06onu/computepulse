from __future__ import annotations

from fastapi import APIRouter, HTTPException

from api.services.store import store

router = APIRouter(prefix="/api/metrics", tags=["metrics"])


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

    tp = float(cm.get("true_positive", 0))
    fn = float(cm.get("false_negative", 0))
    caught = tp / (tp + fn) if (tp + fn) > 0 else 0.0

    importance = [
        {"feature": k, "importance": float(v)}
        for k, v in store.feature_importance.items()
    ]
    importance.sort(key=lambda x: x["importance"])

    return {
        "baseline": {
            "accuracy": float(b.get("accuracy", 0)),
            "precision": float(b.get("precision", 0)),
            "recall": float(b.get("recall", 0)),
            "f1": float(b.get("f1", 0)),
            "auc": float(b.get("auc", 0)),
        },
        "model": {
            "accuracy": float(m.get("accuracy", 0)),
            "precision": float(m.get("precision", 0)),
            "recall": float(m.get("recall", 0)),
            "f1": float(m.get("f1", 0)),
            "auc": float(m.get("auc", 0)),
        },
        "cv": {
            "auc_mean": float(cv.get("cv_auc_mean", 0)),
            "auc_std": float(cv.get("cv_auc_std", 0)),
        },
        "confusion": {
            "true_negative": int(cm.get("true_negative", 0)),
            "false_positive": int(cm.get("false_positive", 0)),
            "false_negative": int(cm.get("false_negative", 0)),
            "true_positive": int(cm.get("true_positive", 0)),
            "failures_caught": round(caught, 4),
        },
        "feature_importance": importance,
        "comparison": [
            {
                "metric": "Accuracy",
                "baseline": float(b.get("accuracy", 0)) * 100,
                "model": float(m.get("accuracy", 0)) * 100,
            },
            {
                "metric": "Precision",
                "baseline": float(b.get("precision", 0)) * 100,
                "model": float(m.get("precision", 0)) * 100,
            },
            {
                "metric": "Recall",
                "baseline": float(b.get("recall", 0)) * 100,
                "model": float(m.get("recall", 0)) * 100,
            },
            {
                "metric": "F1",
                "baseline": float(b.get("f1", 0)) * 100,
                "model": float(m.get("f1", 0)) * 100,
            },
            {
                "metric": "ROC-AUC",
                "baseline": float(b.get("auc", 0)) * 100,
                "model": float(m.get("auc", 0)) * 100,
            },
        ],
    }
