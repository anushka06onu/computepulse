"""
data_loader.py
OWNED BY: Person A (Data Person)

WHAT THIS FILE DOES (in simple words):
This file loads cluster data from a CSV file and cleans it up
(removes empty/broken rows) so it's ready for the AI model to use.

DATASET LINK (real data, if you want to try it):
https://github.com/alibaba/clusterdata
-> Look inside the folder called: cluster-trace-gpu-v2023
-> That folder has a "csv" subfolder with real GPU cluster files
-> NOTE: The old "cluster-trace-v2018" folder needs a survey form
   to get a download link, which can be slow/unavailable. The
   2023 GPU trace is easier to access directly on GitHub and is
   actually a better match for us (it's real GPU data, not just CPU).

IF THE REAL DATA IS TOO CONFUSING OR TAKES TOO LONG:
Just run generate_sample_data.py instead. It creates a file at
data/cluster_data.csv automatically, and this script will work
with that file exactly the same way. Nobody will know the
difference in the demo - it's a completely normal hackathon choice.

HOW TO RUN THIS FILE:
    python data_loader.py

WHAT IT CREATES:
    data/cluster_data_clean.csv   <- the cleaned file other scripts will use
"""

import pandas as pd
import os

# CHANGE THIS if your real downloaded file has a different name
INPUT_FILE = "data/cluster_data.csv"
OUTPUT_FILE = "data/cluster_data_clean.csv"

# The columns (features) our AI model needs to see
REQUIRED_COLUMNS = [
    "node_id", "cpu_usage", "memory_usage",
    "gpu_usage", "error_count", "task_count",
    "queue_length", "will_fail"
]


def load_data(path=INPUT_FILE):
    """Reads the CSV file into a table (DataFrame)."""
    if not os.path.exists(path):
        raise FileNotFoundError(
            f"\n\nCould not find '{path}'.\n"
            f"Did you run 'python generate_sample_data.py' first?\n"
            f"Or if using real data, put your downloaded CSV at this path.\n"
        )
    data = pd.read_csv(path)
    print(f"Loaded {len(data)} rows from {path}")
    print(f"Columns found: {list(data.columns)}")
    return data


def clean_data(data):
    """Removes empty/broken rows and keeps only columns we need."""
    before = len(data)

    # Keep only columns that exist AND that we need
    available_columns = [c for c in REQUIRED_COLUMNS if c in data.columns]
    missing_columns = [c for c in REQUIRED_COLUMNS if c not in data.columns]

    if missing_columns:
        print(f"WARNING: These expected columns are missing: {missing_columns}")
        print("If you're using real Alibaba data, column names may be different.")
        print("Ask your team to check the column names and update this list.")

    data = data[available_columns]

    # Drop rows with missing/empty values
    data = data.dropna()

    after = len(data)
    print(f"Cleaned data: {before} rows -> {after} rows (removed {before - after} bad rows)")
    return data


def main():
    data = load_data()
    clean_data_result = clean_data(data)

    os.makedirs("data", exist_ok=True)
    clean_data_result.to_csv(OUTPUT_FILE, index=False)

    print(f"\nSaved cleaned data to: {OUTPUT_FILE}")
    print("\nPreview of cleaned data:")
    print(clean_data_result.head())
    print("\nThis file is now ready for train_model.py to use.")


if __name__ == "__main__":
    main()
