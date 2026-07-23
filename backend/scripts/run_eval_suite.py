#!/usr/bin/env python3
"""Continuous eval suite for ComputePulse AI releases."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def check(cond: bool, msg: str, errors: list[str]) -> None:
    if cond:
        print(f"  OK  {msg}")
    else:
        print(f" FAIL {msg}")
        errors.append(msg)


def main() -> int:
    errors: list[str] = []
    print("== artifact presence ==")
    for rel in [
        "data/cluster_data_real.csv",
        "models/failure_risk_model.pkl",
        "models/model_anomaly.pkl",
        "models/model_horizon.pkl",
        "results/eval_report.json",
        "results/placement_lift.json",
    ]:
        check((ROOT / rel).exists(), rel, errors)

    print("== eval_report ==")
    ev = json.loads((ROOT / "results/eval_report.json").read_text())
    check(ev.get("pr_auc", 0) > 0.5, f"pr_auc={ev.get('pr_auc')}", errors)
    check("top5_recall" in ev, "top5_recall present", errors)
    check("ece" in ev, "ece present", errors)
    check(ev.get("n_rows", 0) > 0, f"n_rows={ev.get('n_rows')}", errors)

    print("== placement_lift ==")
    lift = json.loads((ROOT / "results/placement_lift.json").read_text())
    check(lift.get("policy") == "risk_anomaly_v2", "policy risk_anomaly_v2", errors)

    print("== store fusion smoke ==")
    from api.services.store import store

    store.ensure_loaded()
    snap = store.get_snapshot(0)
    check("fused_risk" in snap.columns, "fused_risk column", errors)
    hs = store.health_score(snap)
    expected = round(100 - float(snap["fused_risk"].mean()), 1)
    check(hs["score"] == expected, f"health_score={hs['score']} == {expected}", errors)
    check(
        store.model_version == "Failure risk model",
        f"model_version={store.model_version}",
        errors,
    )

    print("== explain template (no network required) ==")
    from api.services.explain import template_summary

    s = template_summary(1, "critical", 90.0, ["High GPU contention"])
    check("Node 1" in s and "90.0" in s, "template includes frozen numbers", errors)

    print("== warning agent smoke ==")
    from api.services.warnings import scan_warnings

    before = 0
    shadow = ROOT / "results/shadow_log.jsonl"
    if shadow.exists():
        before = sum(1 for _ in shadow.open())

    result = scan_warnings(
        seed=0, critical=70, watch=40, explain_budget=0, log_shadow=True
    )
    check(result["counts"]["total"] >= 0, f"alerts total={result['counts']['total']}", errors)
    types = set(result["counts"]["by_type"])
    # With real data there should be at least one critical or unsafe_reclaim/watch
    has_node = any(
        a["type"] == "node_critical" for a in result["alerts"]
    ) or any(a.get("scores", {}).get("fused", 0) > 70 for a in result["alerts"])
    check(
        "node_critical" in types or has_node or result["counts"]["total"] > 0,
        "produced actionable alerts",
        errors,
    )
    if "node_critical" in types:
        crit = next(a for a in result["alerts"] if a["type"] == "node_critical")
        fused = crit["scores"].get("fused")
        check(
            fused is not None and f"{float(fused):.1f}" in crit["summary"]
            or (fused is not None and str(int(float(fused))) in crit["summary"]),
            "critical summary keeps fused number",
            errors,
        )
        check(
            crit.get("recommendation") is not None
            and "caveat" in (crit.get("recommendation") or {}),
            "critical has recommendation caveat",
            errors,
        )

    after = sum(1 for _ in shadow.open()) if shadow.exists() else 0
    check(after > before, "shadow_log grew after warning_scan", errors)

    print("== shadow log writable ==")
    store.append_shadow({"event": "eval_suite", "ok": True})
    check(shadow.exists(), "shadow_log.jsonl", errors)

    if errors:
        print(f"\n{len(errors)} failure(s)")
        return 1
    print("\nAll checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

