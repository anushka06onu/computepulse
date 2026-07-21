"""
model3_optimization.py
OWNED BY: Person B (AI Model Person)

WHAT THIS FILE DOES:
Builds our "Model 3": resource optimization.

Finds real machines in the cluster that are consistently underutilized
(low GPU/CPU usage across many real instances) and estimates real
dollar savings if that capacity were reallocated or powered down.

HONESTY NOTE: The real Alibaba trace does not include a $-per-GPU-hour
price (it's an internal production cluster, not a public cloud price
list). We use a documented, clearly-labeled industry-average assumption
($2.50/GPU-hour, roughly in line with public cloud A100/V100 on-demand
pricing at the time) to convert idle GPU-hours into a dollar estimate.
This assumption is stated explicitly everywhere it's used - never
presented as if it came from the dataset itself.

HOW TO RUN:
    python model3_optimization.py

REQUIRES:
    data/cluster_data_real.csv

CREATES:
    results/optimization_opportunities.csv
"""

import os
import pandas as pd

DATA_FILE = "data/cluster_data_real.csv"
OUTPUT_FILE = "results/optimization_opportunities.csv"

# Documented assumption - clearly labeled everywhere it's used.
ASSUMED_COST_PER_GPU_HOUR = 2.50

# A machine is "underutilized" if its average GPU usage across all its
# real recorded instances is below this threshold.
UNDERUTILIZED_GPU_THRESHOLD = 15.0


def main():
    print("Loading real dataset...")
    data = pd.read_csv(DATA_FILE)

    print("Aggregating real utilization per machine...")
    node_util = data.groupby("node_id").agg(
        avg_gpu_usage_pct=("gpu_usage_pct", "mean"),
        avg_cpu_usage_pct=("cpu_usage_pct", "mean"),
        total_hours_observed=("duration_hours", lambda x: x[x >= 0].sum()),
        num_instances=("gpu_usage_pct", "count"),
        failure_rate=("will_fail", "mean"),
    ).reset_index()

    # Only trust machines with a reasonable amount of real history
    node_util = node_util[node_util["num_instances"] >= 5].copy()

    node_util["is_underutilized"] = node_util["avg_gpu_usage_pct"] < UNDERUTILIZED_GPU_THRESHOLD

    # Estimate real idle GPU-hours: hours observed * (1 - utilization fraction)
    node_util["estimated_idle_hours"] = (
        node_util["total_hours_observed"] * (1 - node_util["avg_gpu_usage_pct"] / 100)
    ).clip(lower=0)

    node_util["estimated_savings_usd"] = (
        node_util["estimated_idle_hours"] * ASSUMED_COST_PER_GPU_HOUR
    ).round(2)

    node_util = node_util.sort_values("estimated_savings_usd", ascending=False)

    opportunities = node_util[node_util["is_underutilized"]].copy()

    print(f"\nFound {len(opportunities):,} real machines below {UNDERUTILIZED_GPU_THRESHOLD}% "
          f"average GPU utilization (out of {len(node_util):,} machines with enough history).")

    total_savings = opportunities["estimated_savings_usd"].sum()
    print(f"\nTotal estimated savings opportunity across all underutilized machines: "
          f"${total_savings:,.2f}")
    print(f"(Based on assumed ${ASSUMED_COST_PER_GPU_HOUR}/GPU-hour - a documented industry-average "
          f"estimate, not a figure from the dataset itself.)")

    print("\n--- TOP 10 BIGGEST SAVINGS OPPORTUNITIES (real machines) ---")
    print(opportunities.head(10).to_string(index=False))

    os.makedirs("results", exist_ok=True)
    node_util.to_csv(OUTPUT_FILE, index=False)
    print(f"\nSaved full ranked machine list to: {OUTPUT_FILE}")

    with open("results/model3_summary.txt", "w") as f:
        f.write(f"total_machines_analyzed={len(node_util)}\n")
        f.write(f"underutilized_machines={len(opportunities)}\n")
        f.write(f"total_estimated_savings_usd={total_savings}\n")
        f.write(f"assumed_cost_per_gpu_hour={ASSUMED_COST_PER_GPU_HOUR}\n")
        f.write(f"underutilized_threshold_pct={UNDERUTILIZED_GPU_THRESHOLD}\n")


if __name__ == "__main__":
    main()
