"""
model2_placement.py
OWNED BY: Person B (AI Model Person)

WHAT THIS FILE DOES:
Builds our "Model 2": workload placement recommendations.

IMPORTANT HONESTY NOTE (read this before presenting to judges):
The real Alibaba trace does NOT contain a label saying "this
placement was optimal." So instead of pretending to train a
classifier on a label that doesn't exist, we do the technically
correct thing: we use Model 1's real, validated failure-risk
predictions, aggregate them per physical machine, and recommend
placing new jobs on the machines with the lowest historical risk.

This is a legitimate, defensible technique - it's literally how
many real risk-aware schedulers work (score candidates, pick the
best). If a judge asks "how is this trained?", the honest answer
is: "It's not a separately trained classifier - it's a decision
layer built on Model 1's real, validated predictions." That is a
BETTER answer than claiming a fake ground-truth label exists.

HOW TO RUN:
    python model2_placement.py

REQUIRES:
    data/cluster_data_real.csv
    models/model1.pkl

CREATES:
    results/node_risk_scores.csv   <- every real machine, ranked by risk
"""

import os
import pandas as pd
import pickle

DATA_FILE = "data/cluster_data_real.csv"
MODEL_FILE = "models/model1.pkl"
OUTPUT_FILE = "results/node_risk_scores.csv"

FEATURES = [
    "task_role", "cpu_usage_pct", "gpu_usage_pct",
    "mem_pressure", "gpu_mem_pressure", "cpu_gpu_ratio",
    "io_bytes_total", "io_ops_total", "avg_io_size",
]


def recommend_top_nodes(node_scores, top_n=10):
    """Returns the N healthiest real machines to place a new job on."""
    healthiest = node_scores.sort_values("avg_risk_score").head(top_n)
    return healthiest


def recommend_avoid_nodes(node_scores, top_n=10):
    """Returns the N riskiest real machines to avoid."""
    riskiest = node_scores.sort_values("avg_risk_score", ascending=False).head(top_n)
    return riskiest


def main():
    print("Loading real data and trained Model 1...")
    data = pd.read_csv(DATA_FILE)

    with open(MODEL_FILE, "rb") as f:
        model = pickle.load(f)

    print(f"Scoring {len(data):,} real instances with Model 1...")
    data["risk_score"] = model.predict_proba(data[FEATURES])[:, 1] * 100

    print("Aggregating risk per real machine (node)...")
    node_scores = data.groupby("node_id").agg(
        avg_risk_score=("risk_score", "mean"),
        max_risk_score=("risk_score", "max"),
        num_instances=("risk_score", "count"),
        actual_failure_rate=("will_fail", "mean"),
    ).reset_index()

    node_scores = node_scores[node_scores["num_instances"] >= 5].copy()
    node_scores = node_scores.sort_values("avg_risk_score")

    print(f"\nScored {len(node_scores):,} real machines with enough history.")

    print("\n--- TOP 10 HEALTHIEST MACHINES (recommend for new jobs) ---")
    print(recommend_top_nodes(node_scores).to_string(index=False))

    print("\n--- TOP 10 RISKIEST MACHINES (avoid / investigate) ---")
    print(recommend_avoid_nodes(node_scores).to_string(index=False))

    correlation = node_scores["avg_risk_score"].corr(node_scores["actual_failure_rate"])
    print(f"\nCorrelation between predicted risk and REAL failure rate: {correlation:.3f}")
    print("(Closer to 1.0 means our risk scores genuinely track real failures)")

    os.makedirs("results", exist_ok=True)
    node_scores.to_csv(OUTPUT_FILE, index=False)
    print(f"\nSaved full ranked machine list to: {OUTPUT_FILE}")

    with open("results/model2_correlation.txt", "w") as f:
        f.write(f"correlation={correlation}\n")


if __name__ == "__main__":
    main()
