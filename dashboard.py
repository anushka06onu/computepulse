"""
dashboard.py
OWNED BY: Person C (Frontend Person)

WHAT THIS FILE DOES (in simple words):
This file creates our website (dashboard) using Streamlit.
It shows:
  - Baseline accuracy vs AI model accuracy (side by side)
  - A table of nodes with their risk score
  - A simple recommendation for each node
  - A chart comparing baseline vs AI

HOW TO RUN THIS FILE:
    streamlit run dashboard.py

(A browser window will open automatically showing the dashboard.)

BEFORE RUNNING THIS, MAKE SURE THESE FILES EXIST:
    data/cluster_data_clean.csv   (from data_loader.py)
    model1.pkl                    (from train_model.py)
    baseline_results.txt          (from baseline_model.py)
    model_results.txt             (from train_model.py)
    feature_importance.txt        (from train_model.py)

If any of these are missing, this dashboard will show a friendly
message telling you which script to run first.
"""

import streamlit as st
import pandas as pd
import pickle
import os
import plotly.graph_objects as go

st.set_page_config(page_title="ComputePulse", layout="wide", page_icon="🖥️")


# ---------- HELPER FUNCTIONS ----------

def read_key_value_file(path):
    """Reads simple 'key=value' text files into a dictionary."""
    result = {}
    if not os.path.exists(path):
        return result
    with open(path, "r") as f:
        for line in f:
            if "=" in line:
                key, value = line.strip().split("=", 1)
                result[key] = float(value)
    return result


def recommend_action(risk_score):
    """Turns a risk score number into a simple, human-readable action."""
    if risk_score > 70:
        return "🔴 Move jobs away from this node"
    elif risk_score > 40:
        return "🟡 Watch this node closely"
    else:
        return "🟢 Node is healthy"


# ---------- CHECK REQUIRED FILES EXIST ----------

required_files = {
    "data/cluster_data_clean.csv": "Run: python data_loader.py",
    "model1.pkl": "Run: python train_model.py",
    "baseline_results.txt": "Run: python baseline_model.py",
    "model_results.txt": "Run: python train_model.py",
}

missing = [f for f in required_files if not os.path.exists(f)]

if missing:
    st.title("🖥️ ComputePulse Dashboard")
    st.warning("Some files are missing before this dashboard can show real results:")
    for f in missing:
        st.write(f"❌ **{f}** — {required_files[f]}")
    st.info("Run the missing scripts above in order, then refresh this page.")
    st.stop()


# ---------- LOAD EVERYTHING ----------

data = pd.read_csv("data/cluster_data_clean.csv")

with open("model1.pkl", "rb") as f:
    model = pickle.load(f)

baseline_results = read_key_value_file("baseline_results.txt")
model_results = read_key_value_file("model_results.txt")
feature_importance = read_key_value_file("feature_importance.txt")

FEATURES = ["cpu_usage", "memory_usage", "gpu_usage", "error_count", "task_count", "queue_length"]
available_features = [f for f in FEATURES if f in data.columns]

# Get AI risk score (0-100%) for every row
data["risk_score"] = model.predict_proba(data[available_features])[:, 1] * 100
data["recommendation"] = data["risk_score"].apply(recommend_action)


# ---------- PAGE HEADER ----------

st.title("🖥️ ComputePulse: Cluster Health Dashboard")
st.write("AI system that predicts GPU cluster failures before they happen.")
st.write("**Prometheus shows what IS. ComputePulse predicts what WILL BE.**")

st.divider()


# ---------- TOP METRICS ----------

col1, col2, col3, col4 = st.columns(4)

baseline_acc = baseline_results.get("accuracy", 0) * 100
model_acc = model_results.get("accuracy", 0) * 100
improvement = model_acc - baseline_acc

col1.metric("Baseline Accuracy", f"{baseline_acc:.1f}%")
col2.metric("ComputePulse AI Accuracy", f"{model_acc:.1f}%", delta=f"{improvement:+.1f}%")
col3.metric("Nodes Monitored", str(data["node_id"].nunique()))
col4.metric("High Risk Nodes Now", str((data["risk_score"] > 70).sum()))

st.divider()


# ---------- BASELINE VS AI CHART ----------

st.subheader("📊 Baseline vs ComputePulse AI")

fig = go.Figure()
fig.add_trace(go.Bar(
    name="Baseline (simple rules)",
    x=["Accuracy", "Precision", "Recall"],
    y=[
        baseline_results.get("accuracy", 0) * 100,
        baseline_results.get("precision", 0) * 100,
        baseline_results.get("recall", 0) * 100,
    ],
    marker_color="lightblue",
))
fig.add_trace(go.Bar(
    name="ComputePulse AI (LightGBM)",
    x=["Accuracy", "Precision", "Recall"],
    y=[
        model_results.get("accuracy", 0) * 100,
        model_results.get("precision", 0) * 100,
        model_results.get("recall", 0) * 100,
    ],
    marker_color="darkblue",
))
fig.update_layout(barmode="group", height=400, yaxis_title="Percent (%)")
st.plotly_chart(fig, use_container_width=True)

st.divider()


# ---------- NODE RISK TABLE ----------

st.subheader("🔍 Live Node Risk Scores & Recommendations")

display_data = data[["node_id"] + available_features + ["risk_score", "recommendation"]].copy()
display_data = display_data.sort_values("risk_score", ascending=False).head(20)
display_data["risk_score"] = display_data["risk_score"].round(1)

st.dataframe(display_data, use_container_width=True)

st.divider()


# ---------- FEATURE IMPORTANCE (SHAP) ----------

if feature_importance:
    st.subheader("🧠 Why Does the AI Make These Predictions? (SHAP Explainability)")

    importance_df = pd.DataFrame(
        list(feature_importance.items()), columns=["Feature", "Importance"]
    ).sort_values("Importance", ascending=True)

    fig2 = go.Figure(go.Bar(
        x=importance_df["Importance"],
        y=importance_df["Feature"],
        orientation="h",
        marker_color="teal",
    ))
    fig2.update_layout(height=350, xaxis_title="Importance (higher = matters more)")
    st.plotly_chart(fig2, use_container_width=True)

    st.caption(
        "This chart shows which cluster metrics matter most when ComputePulse "
        "decides a node is at risk. This is what makes our AI explainable, "
        "not a black box."
    )

st.divider()
st.caption("ComputePulse — Predict. Prevent. Optimize.")
