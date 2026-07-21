"""
dashboard.py
OWNED BY: Person C (Frontend Person)

WHAT THIS FILE DOES:
The real ComputePulse tool - not a single results page, but a working
multi-tab dashboard a researcher could actually use:

  Tab 1 - Fleet Overview: every real machine, color-coded by health,
          refreshable (re-samples a real historical snapshot per node
          to simulate a live feed - see note in that tab).
  Tab 2 - Node Explorer: pick any real machine by ID, see its current
          snapshot, real risk score, and a REAL per-node SHAP
          explanation (not just a global chart).
  Tab 3 - Smart Job Placement: "where should I run my next job?" -
          real ranked recommendations from Model 2, filterable by
          workload type.
  Tab 4 - Cost Optimization: Model 3's real underutilized-machine
          list with estimated dollar savings.
  Tab 5 - Model Performance: baseline vs AI, cross-validation,
          confusion matrix, global SHAP - the supporting evidence,
          not the whole product.

HOW TO RUN:
    streamlit run dashboard.py

REQUIRES (run these first, in order):
    python prepare_dataset.py
    python baseline_model.py
    python train_model.py
    python model2_placement.py
    python model3_optimization.py
"""

import streamlit as st
import pandas as pd
import numpy as np
import pickle
import os
import shap
import plotly.graph_objects as go
import plotly.express as px

st.set_page_config(page_title="ComputePulse", layout="wide", page_icon="🖥️")

FEATURES = [
    "task_role", "cpu_usage_pct", "gpu_usage_pct",
    "mem_pressure", "gpu_mem_pressure", "cpu_gpu_ratio",
    "io_bytes_total", "io_ops_total", "avg_io_size",
]


def read_key_value_file(path):
    result = {}
    if not os.path.exists(path):
        return result
    with open(path, "r") as f:
        for line in f:
            if "=" in line:
                key, value = line.strip().split("=", 1)
                try:
                    result[key] = float(value)
                except ValueError:
                    result[key] = value
    return result


# ---------- CHECK REQUIRED FILES ----------

required = {
    "data/cluster_data_real.csv": "python prepare_dataset.py",
    "models/model1.pkl": "python train_model.py",
    "results/baseline_results.txt": "python baseline_model.py",
    "results/model_results.txt": "python train_model.py",
    "results/node_risk_scores.csv": "python model2_placement.py",
    "results/optimization_opportunities.csv": "python model3_optimization.py",
}
missing = [f for f in required if not os.path.exists(f)]

if missing:
    st.title("🖥️ ComputePulse")
    st.warning("Run these scripts first, in order:")
    for f in missing:
        st.write(f"❌ `{f}` — run: `{required[f]}`")
    st.stop()


# ---------- LOAD EVERYTHING (cached so the app stays fast) ----------

@st.cache_data
def load_data():
    return pd.read_csv("data/cluster_data_real.csv")


@st.cache_resource
def load_model():
    with open("models/model1.pkl", "rb") as f:
        return pickle.load(f)


@st.cache_resource
def load_explainer(_model):
    return shap.TreeExplainer(_model)


data = load_data()
model = load_model()
explainer = load_explainer(model)

node_scores = pd.read_csv("results/node_risk_scores.csv")
optimization = pd.read_csv("results/optimization_opportunities.csv")

baseline_results = read_key_value_file("results/baseline_results.txt")
model_results = read_key_value_file("results/model_results.txt")
cv_results = read_key_value_file("results/cv_results.txt")
confusion = read_key_value_file("results/confusion_matrix.txt")
feature_importance = read_key_value_file("results/feature_importance.txt")
model2_corr = read_key_value_file("results/model2_correlation.txt")
model3_summary = read_key_value_file("results/model3_summary.txt")



# ---------- HEADER ----------

st.title("🖥️ ComputePulse: Cluster Health Intelligence")
st.write(
    "Trained and evaluated on **real Alibaba GPU cluster production data** "
    "(cluster-trace-gpu-v2020) — ~6,500 real GPUs, ~1,800 real machines, "
    "July–August 2020. Not synthetic data."
)

if "refresh_seed" not in st.session_state:
    st.session_state.refresh_seed = 0

col_refresh, col_spacer = st.columns([1, 5])
with col_refresh:
    if st.button("🔄 Refresh Live Snapshot"):
        st.session_state.refresh_seed += 1

st.caption(
    "This dataset is a historical trace, not a live feed. 'Refresh' re-samples a "
    "different real historical instance per machine, simulating what a live "
    "monitoring view would show — every number shown is still real, just from a "
    "different real moment in the trace."
)

tab1, tab2, tab3, tab4, tab5 = st.tabs([
    "🏠 Fleet Overview", "🔍 Node Explorer", "🎯 Smart Job Placement",
    "💰 Cost Optimization", "📊 Model Performance",
])


# ---------- SHARED: get a "current snapshot" per node (real, resampled on refresh) ----------

@st.cache_data
def get_current_snapshot(seed):
    """Picks one real historical instance per node to act as its 'current' reading."""
    sample = data.groupby("node_id", group_keys=False).sample(n=1, random_state=seed)
    sample["risk_score"] = model.predict_proba(sample[FEATURES])[:, 1] * 100
    return sample.reset_index(drop=True)


snapshot = get_current_snapshot(st.session_state.refresh_seed)


def status_label(risk):
    if risk > 70:
        return "🔴 Critical"
    elif risk > 40:
        return "🟡 Watch"
    else:
        return "🟢 Healthy"


# ============================================================
# TAB 1: FLEET OVERVIEW
# ============================================================
with tab1:
    st.subheader("Real-time Fleet Health (simulated from real historical snapshots)")

    col1, col2, col3, col4 = st.columns(4)
    col1.metric("Total Machines", f"{snapshot['node_id'].nunique():,}")
    col2.metric("🔴 Critical Now", int((snapshot["risk_score"] > 70).sum()))
    col3.metric("🟡 Watch Now", int(((snapshot["risk_score"] > 40) & (snapshot["risk_score"] <= 70)).sum()))
    col4.metric("🟢 Healthy Now", int((snapshot["risk_score"] <= 40).sum()))

    st.divider()

    fleet_view = snapshot[["node_id", "risk_score", "cpu_usage_pct", "gpu_usage_pct", "mem_pressure", "duration_hours", "status"]].copy()
    fleet_view["health"] = fleet_view["risk_score"].apply(status_label)
    fleet_view = fleet_view.sort_values("risk_score", ascending=False)
    fleet_view = fleet_view.rename(columns={
        "node_id": "Node ID", "risk_score": "Risk %", "cpu_usage_pct": "CPU %",
        "gpu_usage_pct": "GPU %", "mem_pressure": "Mem Pressure",
        "duration_hours": "Duration (hrs)", "status": "Last Real Status", "health": "Health",
    })

    st.dataframe(
        fleet_view.round(1),
        use_container_width=True,
        height=450,
    )
    st.caption(
        f"Showing all {len(fleet_view):,} real machines. 'Duration (hrs)' is the real "
        f"job runtime from the trace (-1 means the instance never logged a normal "
        f"completion time, which is common for interrupted/failed jobs)."
    )

    fig_dist = px.histogram(
        snapshot, x="risk_score", nbins=40,
        title="Distribution of current risk scores across the real fleet",
        labels={"risk_score": "Risk Score (%)"},
    )
    fig_dist.update_layout(height=350)
    st.plotly_chart(fig_dist, use_container_width=True)


# ============================================================
# TAB 2: NODE EXPLORER
# ============================================================
with tab2:
    st.subheader("Explore a Specific Real Machine")

    all_nodes = sorted(snapshot["node_id"].unique().tolist())
    selected_node = st.selectbox("Select a real machine (node ID):", all_nodes)

    node_row = snapshot[snapshot["node_id"] == selected_node].iloc[0]
    node_history = data[data["node_id"] == selected_node]

    col1, col2, col3, col4 = st.columns(4)
    col1.metric("Current Risk Score", f"{node_row['risk_score']:.1f}%")
    col2.metric("Health Status", status_label(node_row["risk_score"]))
    col3.metric("Real Instances on Record", f"{len(node_history):,}")
    col4.metric("Historical Failure Rate", f"{node_history['will_fail'].mean():.1%}")

    st.divider()

    col_left, col_right = st.columns([1, 1])

    with col_left:
        st.write("**Current snapshot (real values):**")
        snapshot_display = pd.DataFrame({
            "Metric": ["CPU Usage %", "GPU Usage %", "Memory Pressure", "GPU Memory Pressure",
                       "I/O Ops Total", "Duration (hrs)", "Last Real Status"],
            "Value": [
                f"{node_row['cpu_usage_pct']:.1f}", f"{node_row['gpu_usage_pct']:.1f}",
                f"{node_row['mem_pressure']:.2f}", f"{node_row['gpu_mem_pressure']:.2f}",
                f"{node_row['io_ops_total']:.0f}",
                f"{node_row['duration_hours']:.2f}" if node_row['duration_hours'] >= 0 else "unknown",
                node_row["status"],
            ],
        })
        st.dataframe(snapshot_display, use_container_width=True, hide_index=True)

    with col_right:
        st.write("**Why this risk score? (real SHAP explanation for THIS machine)**")
        row_features = node_row[FEATURES].to_frame().T.astype(float)
        shap_vals = explainer.shap_values(row_features)
        if isinstance(shap_vals, list):
            local_shap = shap_vals[1][0]
        else:
            local_shap = shap_vals[0]

        local_df = pd.DataFrame({"Feature": FEATURES, "Impact": local_shap}).sort_values("Impact")
        fig_local = go.Figure(go.Bar(
            x=local_df["Impact"], y=local_df["Feature"], orientation="h",
            marker_color=["crimson" if v > 0 else "seagreen" for v in local_df["Impact"]],
        ))
        fig_local.update_layout(height=300, xaxis_title="Push toward risk (+) / toward healthy (-)")
        st.plotly_chart(fig_local, use_container_width=True)

    st.divider()
    st.write(f"**Recent real historical instances on Node {selected_node}:**")
    st.dataframe(
        node_history[["cpu_usage_pct", "gpu_usage_pct", "mem_pressure", "duration_hours", "status"]]
        .tail(20).round(2),
        use_container_width=True,
    )


# ============================================================
# TAB 3: SMART JOB PLACEMENT
# ============================================================
with tab3:
    st.subheader("Where Should My Next Job Run?")
    st.write(
        "Model 2 recommendation: real per-machine risk aggregated from Model 1's "
        "validated predictions, correlated at **r = "
        f"{model2_corr.get('correlation', 0):.3f}** with real observed failure rates."
    )

    n_recommend = st.slider("How many machines to recommend?", 3, 20, 5)

    col_a, col_b = st.columns(2)

    with col_a:
        st.write(f"**✅ Top {n_recommend} recommended machines right now**")
        best = snapshot.sort_values("risk_score").head(n_recommend)
        best_display = best[["node_id", "risk_score", "cpu_usage_pct", "gpu_usage_pct"]].round(1)
        best_display.columns = ["Node ID", "Risk %", "CPU %", "GPU %"]
        st.dataframe(best_display, use_container_width=True, hide_index=True)

        if len(best) > 0:
            top_pick = best.iloc[0]
            st.success(
                f"**Recommended: Node {int(top_pick['node_id'])}** — {top_pick['risk_score']:.1f}% risk, "
                f"real historical failure rate "
                f"{node_scores[node_scores['node_id'] == top_pick['node_id']]['actual_failure_rate'].values[0]:.1%}"
            )

    with col_b:
        st.write(f"**🔴 Machines to avoid right now**")
        worst = snapshot.sort_values("risk_score", ascending=False).head(n_recommend)
        worst_display = worst[["node_id", "risk_score", "cpu_usage_pct", "gpu_usage_pct"]].round(1)
        worst_display.columns = ["Node ID", "Risk %", "CPU %", "GPU %"]
        st.dataframe(worst_display, use_container_width=True, hide_index=True)


# ============================================================
# TAB 4: COST OPTIMIZATION
# ============================================================
with tab4:
    st.subheader("Resource Optimization: Real Underutilized Machines")

    col1, col2, col3 = st.columns(3)
    col1.metric("Machines Analyzed", f"{int(model3_summary.get('total_machines_analyzed', 0)):,}")
    col2.metric("Underutilized Machines", f"{int(model3_summary.get('underutilized_machines', 0)):,}")
    col3.metric("Est. Total Savings", f"${model3_summary.get('total_estimated_savings_usd', 0):,.0f}")

    st.caption(
        f"'Underutilized' = average real GPU usage below "
        f"{model3_summary.get('underutilized_threshold_pct', 15):.0f}% across all real recorded "
        f"instances. Dollar estimate assumes "
        f"${model3_summary.get('assumed_cost_per_gpu_hour', 2.5):.2f}/GPU-hour — a documented "
        f"industry-average assumption, not a number from the dataset itself."
    )

    st.divider()

    opp_sorted = optimization[optimization["is_underutilized"]].sort_values(
        "estimated_savings_usd", ascending=False
    ).head(30)

    fig_opt = px.bar(
        opp_sorted.head(15), x="node_id", y="estimated_savings_usd",
        title="Top 15 real machines by estimated savings opportunity",
        labels={"node_id": "Node ID", "estimated_savings_usd": "Estimated Savings ($)"},
    )
    fig_opt.update_layout(height=400, xaxis_type="category")
    st.plotly_chart(fig_opt, use_container_width=True)

    st.write("**Full ranked list (real machines, real utilization):**")
    display_opt = opp_sorted[[
        "node_id", "avg_gpu_usage_pct", "avg_cpu_usage_pct",
        "total_hours_observed", "estimated_idle_hours", "estimated_savings_usd",
    ]].round(1)
    display_opt.columns = ["Node ID", "Avg GPU %", "Avg CPU %", "Hours Observed", "Idle Hours (est.)", "Savings ($)"]
    st.dataframe(display_opt, use_container_width=True, hide_index=True)


# ============================================================
# TAB 5: MODEL PERFORMANCE
# ============================================================
with tab5:
    st.subheader("Model Performance & Explainability (the evidence behind the numbers)")

    col1, col2, col3, col4 = st.columns(4)
    baseline_acc = baseline_results.get("accuracy", 0) * 100
    model_acc = model_results.get("accuracy", 0) * 100
    model_auc = model_results.get("auc", 0)
    baseline_auc = baseline_results.get("auc", 0)

    col1.metric("Baseline Accuracy", f"{baseline_acc:.1f}%")
    col2.metric("ComputePulse AI Accuracy", f"{model_acc:.1f}%", delta=f"{model_acc - baseline_acc:+.1f}%")
    col3.metric("ComputePulse ROC-AUC", f"{model_auc:.3f}", delta=f"{model_auc - baseline_auc:+.3f}")
    col4.metric("5-fold CV AUC", f"{cv_results.get('cv_auc_mean', 0):.3f} ± {cv_results.get('cv_auc_std', 0):.3f}")

    metrics_names = ["Accuracy", "Precision", "Recall", "F1", "ROC-AUC"]
    baseline_vals = [
        baseline_results.get("accuracy", 0) * 100, baseline_results.get("precision", 0) * 100,
        baseline_results.get("recall", 0) * 100, baseline_results.get("f1", 0) * 100,
        baseline_results.get("auc", 0) * 100,
    ]
    model_vals = [
        model_results.get("accuracy", 0) * 100, model_results.get("precision", 0) * 100,
        model_results.get("recall", 0) * 100, model_results.get("f1", 0) * 100,
        model_results.get("auc", 0) * 100,
    ]
    fig = go.Figure()
    fig.add_trace(go.Bar(name="Baseline", x=metrics_names, y=baseline_vals, marker_color="lightcoral"))
    fig.add_trace(go.Bar(name="ComputePulse AI", x=metrics_names, y=model_vals, marker_color="seagreen"))
    fig.update_layout(barmode="group", height=380, yaxis_title="Score (%)")
    st.plotly_chart(fig, use_container_width=True)

    col_cm, col_shap = st.columns(2)

    with col_cm:
        if confusion:
            st.write("**Confusion Matrix (real test set)**")
            cm_display = pd.DataFrame(
                [[int(confusion.get("true_negative", 0)), int(confusion.get("false_positive", 0))],
                 [int(confusion.get("false_negative", 0)), int(confusion.get("true_positive", 0))]],
                columns=["Predicted Healthy", "Predicted Failure"],
                index=["Actual Healthy", "Actual Failure"],
            )
            st.dataframe(cm_display, use_container_width=True)
            tp, fn = confusion.get("true_positive", 0), confusion.get("false_negative", 0)
            caught = tp / (tp + fn) if (tp + fn) > 0 else 0
            st.metric("Real Failures Caught", f"{caught:.1%}")

    with col_shap:
        if feature_importance:
            st.write("**Global feature importance (SHAP, real test data)**")
            importance_df = pd.DataFrame(
                list(feature_importance.items()), columns=["Feature", "Importance"]
            ).sort_values("Importance", ascending=True)
            fig2 = go.Figure(go.Bar(
                x=importance_df["Importance"], y=importance_df["Feature"], orientation="h", marker_color="teal",
            ))
            fig2.update_layout(height=300, xaxis_title="Mean |SHAP value|")
            st.plotly_chart(fig2, use_container_width=True)

st.divider()
st.caption("ComputePulse — Predict. Prevent. Optimize. Trained on real Alibaba GPU cluster production data.")
