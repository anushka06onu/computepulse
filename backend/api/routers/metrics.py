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
    ev = store.eval_report
    meta = store.meta()

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
        "eval": {
            "pr_auc": float(ev.get("pr_auc", 0)),
            "roc_auc": float(ev.get("roc_auc", 0)),
            "ece": float(ev.get("ece", 0)),
            "brier": float(ev.get("brier", 0)),
            "top5_recall": float(ev.get("top5_recall", 0)),
            "top10_recall": float(ev.get("top10_recall", 0)),
            "node_top5_recall": float(ev.get("node_top5_recall", 0)),
            "n_rows": int(ev.get("n_rows", 0)),
            "n_test": int(ev.get("n_test", 0)),
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
