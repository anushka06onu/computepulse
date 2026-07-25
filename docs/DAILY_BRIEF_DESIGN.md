# Daily Action Brief — design note

## Problem

Three models (failure risk, placement, idle GPU) each lived on their own screen. Operators had to reconcile them mentally. Models can disagree about the same node; hiding that disagreement is worse than showing it.

## Solution

**Daily Action Brief** sits on top of the three existing models:

1. **Combined brief** — simulated morning telemetry is scored by the loaded LightGBM risk model, placement (historical avg risk + live placement score), and idle-GPU reclaim (`util < 15%`, `$2.50/GPU-h` assumption). One **priority score** ranks a **top-five** action list.
2. **Conflict flag** — when two models disagree (risk vs placement, risk vs idle, placement vs idle), the node is flagged and **both views** render side by side.
3. **Reason line** — each action gets one sentence from its **top SHAP feature** (TreeExplainer on the existing risk model). No training in-session.

## Surfaces

- React: `/app/brief` and **top of Fleet** (`/app/fleet`)
- Streamlit: `backend/streamlit_dashboard.py` (brief first)
- API: `GET /api/fleet/daily-brief`

## Honesty

Simulated telemetry for the challenge slice; model artifacts are pre-trained. Dollar figures are assumed rates, not invoices. Engineered conflict nodes (9901–9903) use a Model-1 risk floor when the live score is soft so at least one conflict flag is always visible in demos.
