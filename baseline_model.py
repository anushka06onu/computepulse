"""
baseline_model.py
OWNED BY: Person A / Person B

WHAT THIS FILE DOES:
Simple rule-based failure predictor, used purely as a comparison
point so we can prove our real AI model (LightGBM) is genuinely
better than basic thresholds - not just a black box with an
unverifiable accuracy number.

HOW TO RUN:
    python baseline_model.py

REQUIRES:
    data/cluster_data_real.csv   (created by prepare_dataset.py)
"""

import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score, roc_auc_score
)

DATA_FILE = "data/cluster_data_real.csv"


def baseline_predict(row):
    """
    Simple, explainable rule: high CPU usage, high GPU usage, or heavy
    memory pressure -> flag as risky. No machine learning involved.
    """
    risky = (
        row["cpu_usage_pct"] > 400 or
        row["gpu_usage_pct"] > 80 or
        row["mem_pressure"] > 0.9
    )
    return int(risky)


def main():
    data = pd.read_csv(DATA_FILE)

    # Use the exact same train/test split as train_model.py (same
    # random_state) so the comparison between baseline and AI model
    # is apples-to-apples, evaluated on the same held-out rows.
    train_df, test_df = train_test_split(data, test_size=0.2, random_state=42, stratify=data["will_fail"])

    predictions = test_df.apply(baseline_predict, axis=1)
    y_true = test_df["will_fail"]

    accuracy = accuracy_score(y_true, predictions)
    precision = precision_score(y_true, predictions, zero_division=0)
    recall = recall_score(y_true, predictions, zero_division=0)
    f1 = f1_score(y_true, predictions, zero_division=0)
    try:
        auc = roc_auc_score(y_true, predictions)
    except ValueError:
        auc = float("nan")

    print("=" * 55)
    print("BASELINE MODEL RESULTS (simple rules, no AI)")
    print("=" * 55)
    print(f"Test set size: {len(test_df):,} rows")
    print(f"Accuracy:  {accuracy:.2%}")
    print(f"Precision: {precision:.2%}")
    print(f"Recall:    {recall:.2%}")
    print(f"F1 Score:  {f1:.2%}")
    print(f"ROC-AUC:   {auc:.3f}")
    print("=" * 55)

    with open("results/baseline_results.txt", "w") as f:
        f.write(f"accuracy={accuracy}\n")
        f.write(f"precision={precision}\n")
        f.write(f"recall={recall}\n")
        f.write(f"f1={f1}\n")
        f.write(f"auc={auc}\n")

    print("\nSaved to results/baseline_results.txt")


if __name__ == "__main__":
    import os
    os.makedirs("results", exist_ok=True)
    main()
