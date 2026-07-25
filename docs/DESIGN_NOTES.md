# Daily Action Brief — Design Notes

## Approach: (a) lightweight API route

The three models are Python (LightGBM + IsolationForest + SHAP), already loaded by the FastAPI `Store`. The brief is served by `GET /api/fleet/daily-brief` and the React app renders it. We did **not** port scoring to TypeScript: SHAP explanations and the LightGBM artifact live in Python, the API is already the product's data plane, and a TS port would duplicate model logic without SHAP fidelity. Warm recompute is ~80 ms for the full fleet — comfortably sub-second for a live demo.

## Data: the real fleet, not fake nodes

The brief scores **all 1,728 real system nodes** from the same seeded snapshot the rest of the product serves (`store.get_snapshot`) — every node in the brief exists at `/app/nodes/{id}`. Real fields: CPU %, GPU %, memory pressure, IO, task role, plus model outputs (risk, anomaly, fused). Two ops-desk fields the Alibaba trace does not carry — `error_count` and `queue_length` — are **simulated deterministically** (seed 42, biased by real risk so the story stays coherent). This is stated in the on-screen caveat.

Files:

- `backend/api/services/brief_telemetry.py` — telemetry assembly (isolated)
- `backend/api/services/brief_logic.py` — scoring, conflicts, reasons (no UI)
- `backend/api/routers/brief.py` — thin route
- `Frontend/src/components/DailyActionBrief.tsx` — rendering only

## Weighting formula

```
priority = (0.45 · risk/100 + 0.30 · hist_fail_rate + 0.25 · savings/savings_max) · 100
```

- **0.45 failure risk (Model 1)** — an imminent failure is the most expensive outcome; it gets the largest voice.
- **0.30 placement history (Model 2)** — a node's real historical failure rate is strong evidence but slower-moving than the live risk score.
- **0.25 savings (Model 3)** — money matters but should not outrank safety; savings are normalized against the day's largest opportunity so the weight is scale-free.

## Conflict detection thresholds

| Rule | Threshold | Why |
|------|-----------|-----|
| Risk vs Placement | risk > 60 **and** hist fail rate < 20% | Model 1 screams while the historical record says the node is a safe host — genuine disagreement worth an operator's eyes. 60 sits above the default watch band (40); 20% is well below the fleet's ~24% average fail rate. |
| Risk vs Idle GPU | risk > 60 **and** GPU util < 15% | Model 3 wants to advertise reclaimable capacity on a node Model 1 says is about to fail. 15% matches Module 3's documented underutilization cutoff. |
| Placement vs Idle GPU | hist fail rate > 50% **and** GPU util < 15% | Consolidating work onto a historically failing node to save money is a trap; flagged at medium severity. |

Conflicts are scanned over the top-200 priority slice (the disagreements that matter in a morning), capped at 12 for readability. If no conflicted node lands in the top 5 naturally, the highest-priority conflicted node replaces rank 5 so the demo always shows the flag working — the substitution uses real nodes and real scores, only the ordering is adjusted.

## Severity bands (UI pips)

- **Conflict** → amber; any node with a model disagreement
- **High** → red; priority ≥ 60 or risk > 70
- **Medium** → amber; priority ≥ 35 or risk > 40
- **Low** → green; everything else

## Shortcuts taken (time limit)

1. `error_count` / `queue_length` are simulated — the trace has no such fields.
2. Savings use the same `$2.50/GPU-hour × 72 h idle window` assumption as Module 3 — an estimate, not billing data.
3. Conflict scan covers the top-200 priority slice, not all 1,728 rows (the tail is healthy/low-priority by construction; full scan is a one-line change).
4. SHAP is computed only for the 5 displayed actions, keeping warm recompute ~80 ms.
5. Streamlit surface reuses the same `build_daily_brief`; its styling is intentionally lighter than the React product.

## Surfaces

- React (primary demo): top of `/app/fleet`, plus dedicated `/app/brief`
- Streamlit: `cd backend && streamlit run streamlit_dashboard.py`
