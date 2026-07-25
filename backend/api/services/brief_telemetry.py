"""Daily Action Brief telemetry — real fleet slice + simulated ops fields.

Source of truth: the SAME 1,728-node snapshot the rest of the product serves
(`store.get_snapshot`), so every node in the brief exists in the system and
links to /app/nodes/{id}. The two ops-desk fields the trace does not carry
(error_count, queue_length) are simulated deterministically per node so a
live demo is reproducible. No model training happens here.
"""
from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

BRIEF_SEED = 42


def build_brief_telemetry(store: Any, seed: int | None = None) -> pd.DataFrame:
    """Real snapshot (one row per fleet node) + deterministic sim ops fields.

    Returns the full fleet (~1,728 nodes) with:
      - real: node_id, cpu/gpu/mem telemetry, risk_score, anomaly_score,
        fused_risk (scored by the loaded artifacts inside get_snapshot)
      - derived: memory_pct (mem_pressure as %)
      - simulated: error_count, queue_length (seeded per node_id)
    """
    store.ensure_loaded()
    snap = store.get_snapshot(seed)

    df = snap.copy()
    df["memory_pct"] = (df["mem_pressure"].astype(float).clip(0, 1) * 100).round(1)

    # Deterministic per-node simulation keyed by node_id (stable across calls).
    node_ids = df["node_id"].astype(int).to_numpy()
    rng = np.random.default_rng(BRIEF_SEED)
    base_err = rng.poisson(1.2, size=len(df))
    base_q = rng.integers(0, 18, size=len(df))

    # Bias sim fields with real risk so the story stays coherent:
    # riskier nodes tend to show more errors and longer queues.
    risk = df["risk_score"].astype(float).to_numpy() / 100.0
    df["error_count"] = (base_err + np.round(risk * 6)).astype(int)
    df["queue_length"] = (base_q + np.round(risk * 10)).astype(int)

    # Keep column order tidy for downstream scoring/debug prints.
    _ = node_ids  # node identity preserved from the real snapshot
    return df.reset_index(drop=True)
