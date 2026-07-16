"""
baseline_model.py
OWNED BY: Person A or Person B (either can build this, it's simple)

WHAT THIS FILE DOES (in simple words):
This is our "dumb" comparison model. It uses simple IF-THEN rules,
no AI/machine learning at all. We need this so we can prove our
AI model (LightGBM) is actually smarter than just guessing with
basic rules.

Example rule: "If CPU usage is above 80%, mark it as risky."

HOW TO RUN THIS FILE:
    python baseline_model.py

WHAT IT PRINTS:
    The accuracy of this simple rule-based approach, so we can
    compare it later to our AI model's accuracy.
"""

import pandas as pd
from sklearn.metrics import accuracy_score, precision_score, recall_score

DATA_FILE = "data/cluster_data_clean.csv"


def baseline_predict(row):
    """
    Simple rule: if CPU is very high, OR GPU usage is very high,
    OR there are too many errors -> mark as risky (will fail = 1)
    Otherwise -> mark as safe (will fail = 0)
    """
    if row["cpu_usage"] > 80 or row["gpu_usage"] > 85 or row["error_count"] > 4:
        return 1
    return 0


def main():
    data = pd.read_csv(DATA_FILE)

    data["baseline_prediction"] = data.apply(baseline_predict, axis=1)

    accuracy = accuracy_score(data["will_fail"], data["baseline_prediction"])
    precision = precision_score(data["will_fail"], data["baseline_prediction"], zero_division=0)
    recall = recall_score(data["will_fail"], data["baseline_prediction"], zero_division=0)

    print("=" * 50)
    print("BASELINE MODEL RESULTS (simple rules, no AI)")
    print("=" * 50)
    print(f"Accuracy:  {accuracy:.2%}")
    print(f"Precision: {precision:.2%}")
    print(f"Recall:    {recall:.2%}")
    print("=" * 50)
    print("\nRemember this number! We compare our AI model against this.")

    # Save these numbers so the dashboard can show them later
    with open("baseline_results.txt", "w") as f:
        f.write(f"accuracy={accuracy}\n")
        f.write(f"precision={precision}\n")
        f.write(f"recall={recall}\n")

    print("\nSaved results to baseline_results.txt")


if __name__ == "__main__":
    main()
