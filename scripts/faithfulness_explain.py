#!/usr/bin/env python3
"""Faithfulness: Groq/template brief must not invent risk numbers."""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from api.services.explain import explain_node, template_summary
from api.services.store import store
from api.services.warnings import scan_warnings


def _check_summary_percents(summary: str, fused: float, risk: float) -> str | None:
    if not summary:
        return "empty summary"
    nums = [float(x) for x in re.findall(r"(\d+\.\d+|\d+)\s*%", summary)]
    for n in nums:
        if n > 100:
            return f"invented percent {n}"
        if n >= 40 and abs(n - fused) > 15 and abs(n - risk) > 15:
            if abs(n - (100 - fused)) > 15:
                return f"unexplained percent {n} (fused={fused}, risk={risk})"
    return None


def main() -> int:
    store.ensure_loaded()
    snap = store.get_snapshot(0).sort_values("fused_risk", ascending=False)
    node_id = int(snap.iloc[0]["node_id"])
    row = snap.iloc[0]
    fused = round(float(row["fused_risk"]), 2)
    risk = round(float(row["risk_score"]), 2)

    tpl = template_summary(node_id, "critical", fused, ["High GPU contention"])
    assert str(node_id) in tpl
    assert f"{fused:.1f}" in tpl or str(fused) in tpl

    result = explain_node(node_id, seed=0, rich=False)
    summary = result["summary"]
    if str(node_id) not in summary:
        print("FAIL: summary missing node id")
        return 1
    err = _check_summary_percents(summary, fused, risk)
    if err:
        print(f"FAIL: {err}")
        print(summary)
        return 1

    print("PASS faithfulness (explain template)")
    print("llm_used=", result["llm_used"], "embedding_used=", result["embedding_used"])

    # Warning agent summaries must keep fused % when present
    warnings = scan_warnings(seed=0, explain_budget=0, log_shadow=False)
    crit = next((a for a in warnings["alerts"] if a["type"] == "node_critical"), None)
    if crit is None:
        print("FAIL: no node_critical alert to check")
        return 1
    cf = float(crit["scores"]["fused"])
    cr = float(crit["scores"]["risk"])
    werr = _check_summary_percents(crit["summary"], cf, cr)
    if werr:
        print(f"FAIL warning: {werr}")
        print(crit["summary"])
        return 1
    if str(crit["node_id"]) not in crit["summary"]:
        print("FAIL: warning summary missing node id")
        return 1
    print("PASS faithfulness (warning critical summary)")
    print("providers=", result["providers"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
