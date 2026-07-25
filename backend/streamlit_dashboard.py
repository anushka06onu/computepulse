"""ComputePulse Streamlit dashboard — Daily Action Brief at the top.

Run from repo (with venv active):
  cd backend && streamlit run streamlit_dashboard.py

Uses the same brief_logic as the FastAPI route. No model training in-session.
"""
from __future__ import annotations

import sys
from pathlib import Path

import streamlit as st

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from api.services.brief_logic import build_daily_brief  # noqa: E402
from api.services.store import store  # noqa: E402

st.set_page_config(
    page_title="ComputePulse · Daily Action Brief",
    page_icon="📋",
    layout="wide",
    initial_sidebar_state="collapsed",
)

st.markdown(
    """
    <style>
      .block-container { padding-top: 1.4rem; max-width: 1100px; }
      .dab-title { font-size: 1.75rem; font-weight: 700; margin-bottom: 0.2rem; }
      .dab-sub { color: #5b6472; margin-bottom: 1rem; }
      .conflict-a {
        background: #fdecea; border: 1px solid #e8a39a; border-radius: 10px;
        padding: 0.85rem 1rem;
      }
      .conflict-b {
        background: #e8f6ee; border: 1px solid #8fc9a8; border-radius: 10px;
        padding: 0.85rem 1rem;
      }
      .reason {
        background: #f4f6f8; border-left: 3px solid #2a9d8f;
        padding: 0.65rem 0.9rem; border-radius: 0 8px 8px 0; margin-top: 0.5rem;
      }
    </style>
    """,
    unsafe_allow_html=True,
)


@st.cache_resource(show_spinner="Loading model artifacts…")
def _load_brief():
    store.ensure_loaded()
    return build_daily_brief(store)


st.markdown('<div class="dab-title">Daily Action Brief</div>', unsafe_allow_html=True)
st.markdown(
    '<div class="dab-sub">Top five actions across the real 1,728-node fleet — '
    "failure risk, placement history, and idle GPUs joined into one ranked plan. "
    "Conflicts are shown side by side.</div>",
    unsafe_allow_html=True,
)

try:
    brief = _load_brief()
except Exception as exc:  # noqa: BLE001
    st.error(f"Brief failed to load: {exc}")
    st.stop()

c1, c2, c3 = st.columns(3)
c1.metric("Actions to review", brief["total_actions"], border=True)
c2.metric(
    "Conflicts flagged",
    brief.get("total_conflicts", len(brief["conflicts"])),
    border=True,
)
c3.metric(
    "Est. savings in top 5",
    f"${brief['total_savings']:,.0f}",
    border=True,
)

st.divider()
st.subheader("Ranked actions")

for action in brief["actions"]:
    badge = " · CONFLICT" if action.get("has_conflict") else ""
    with st.container(border=True):
        st.markdown(
            f"**#{action['rank']}** — {action['action_text']}{badge}"
        )
        m1, m2, m3 = st.columns(3)
        m1.metric("Model 1 · Risk", f"{action['risk_score']:.0f}%")
        m2.metric("Model 2 · Placement", f"{action['avg_risk_score']:.0f}%")
        if action["is_underutilized"]:
            m3.metric("Model 3 · Savings", f"${action['estimated_savings_usd']:,.0f}")
        else:
            m3.metric("Model 3 · GPU", f"{action['gpu_usage_pct']:.0f}%")

        st.markdown(
            f'<div class="reason"><strong>Reason · </strong>{action["reason"]}</div>',
            unsafe_allow_html=True,
        )

        conflict = action.get("conflict")
        if conflict:
            st.caption(f"Conflict flag — {conflict['type']}")
            left, right = st.columns(2)
            with left:
                st.markdown(
                    f'<div class="conflict-a"><strong>{conflict["model_a"]}</strong><br/>'
                    f'{conflict["model_a_says"]}</div>',
                    unsafe_allow_html=True,
                )
            with right:
                st.markdown(
                    f'<div class="conflict-b"><strong>{conflict["model_b"]}</strong><br/>'
                    f'{conflict["model_b_says"]}</div>',
                    unsafe_allow_html=True,
                )

if brief["conflicts"]:
    st.divider()
    st.subheader(f"All model conflicts ({len(brief['conflicts'])})")
    for c in brief["conflicts"]:
        with st.container(border=True):
            st.markdown(f"**Node {c['node_id']}** — {c['type']} ({c['severity']})")
            left, right = st.columns(2)
            with left:
                st.markdown(
                    f'<div class="conflict-a"><strong>{c["model_a"]}</strong><br/>'
                    f'{c["model_a_says"]}</div>',
                    unsafe_allow_html=True,
                )
            with right:
                st.markdown(
                    f'<div class="conflict-b"><strong>{c["model_b"]}</strong><br/>'
                    f'{c["model_b_says"]}</div>',
                    unsafe_allow_html=True,
                )

st.caption(brief.get("caveat", ""))
