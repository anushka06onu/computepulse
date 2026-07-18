"""
prepare_dataset.py
OWNED BY: Person A (Data Person)

WHAT THIS FILE DOES:
Loads the REAL Alibaba cluster-trace-gpu-v2020 data files
(pai_instance_table.csv and pai_sensor_table.csv), merges them,
engineers features, and saves a clean, ready-to-train dataset.

This is real production data from Alibaba's GPU cluster (PAI platform),
July-August 2020: ~6,500 GPUs across ~1,800 machines. Not synthetic.

---------------------------------------------------------------------
REQUIRED FILES (download before running this):

Official source (splits into ~30MB parts, needs merging):
https://github.com/alibaba/clusterdata/tree/master/cluster-trace-gpu-v2020
Direct download links (large files, hosted by Alibaba):
  pai_instance_table: https://aliopentrace.oss-cn-beijing.aliyuncs.com/v2020GPUTraces/pai_instance_table.tar.gz  (663 MB)
  pai_sensor_table:   https://aliopentrace.oss-cn-beijing.aliyuncs.com/v2020GPUTraces/pai_sensor_table.tar.gz    (388 MB)

If those Alibaba links are slow/blocked, use the GitHub mirror instead
(files split into small parts you can download directly):
https://github.com/qzweng/clusterdata-cluster-trace-gpu-v2020-data
Merge the split parts before extracting, e.g.:
  cat pai_instance_table.tar.gz.part* > pai_instance_table.tar.gz
  tar -xzf pai_instance_table.tar.gz
  (repeat for pai_sensor_table)

After extracting, put both CSV files here:
  data/pai_instance_table.csv
  data/pai_sensor_table.csv

---------------------------------------------------------------------
HOW TO RUN:
    python prepare_dataset.py

WHAT IT CREATES:
    data/cluster_data_real.csv   <- clean, feature-engineered, ready for training
"""

import pandas as pd
import numpy as np
import os

INSTANCE_FILE = "data/pai_instance_table.csv"
SENSOR_FILE = "data/pai_sensor_table.csv"
OUTPUT_FILE = "data/cluster_data_real.csv"

# The real files are large (7.5M + 3M rows). For a hackathon laptop,
# we work with a large-but-manageable random sample instead of the
# full file. This is a completely standard practice (sampling from a
# real production trace), not synthetic data - every row is real.
SENSOR_SAMPLE_ROWS = 800_000


# ---------- REAL COLUMN SCHEMAS (verified against official docs) ----------

INSTANCE_COLUMNS = [
    "job_name", "task_name", "inst_name", "worker_name",
    "inst_id", "status", "start_time", "end_time", "machine",
]

SENSOR_COLUMNS = [
    "job_name", "task_name", "worker_name", "inst_id", "machine",
    "gpu_name", "cpu_usage", "gpu_wrk_util", "avg_mem", "max_mem",
    "avg_gpu_wrk_mem", "max_gpu_wrk_mem", "read", "write",
    "read_count", "write_count",
]


def load_instance_table():
    """
    Loads the columns we need from pai_instance_table.csv: worker_name,
    status, machine, and now also start_time/end_time so we can compute
    real job duration in hours (a real researcher wants to know "how
    long has this been running", not just a risk percentage).
    """
    print("Loading pai_instance_table.csv (status + timing, memory-efficient)...")
    needed = ["worker_name", "status", "machine", "start_time", "end_time"]
    df = pd.read_csv(
        INSTANCE_FILE, header=None, names=INSTANCE_COLUMNS,
        usecols=needed,
        dtype={"worker_name": "string", "status": "category", "machine": "string"},
    )
    print(f"  -> {len(df):,} rows loaded")
    return df


def load_sensor_table():
    """
    Loads a large random sample of pai_sensor_table.csv, keeping only
    the numeric sensor columns plus worker_name (needed to join) and
    task_name (needed for the task_role feature). This keeps memory
    usage manageable even on a normal laptop.
    """
    print("Loading a sample of pai_sensor_table.csv (resource usage)...")

    needed = [
        "worker_name", "task_name", "cpu_usage", "gpu_wrk_util",
        "avg_mem", "max_mem", "avg_gpu_wrk_mem", "max_gpu_wrk_mem",
        "read", "write", "read_count", "write_count",
    ]

    # Count total rows without loading the whole file into memory
    total_rows = sum(1 for _ in open(SENSOR_FILE, "r"))
    print(f"  -> file has {total_rows:,} total rows")

    if total_rows > SENSOR_SAMPLE_ROWS:
        # Read in chunks and randomly keep a fraction of rows from each
        # chunk, so we never hold the full file in memory at once.
        keep_fraction = SENSOR_SAMPLE_ROWS / total_rows
        np.random.seed(42)

        chunks = []
        rows_kept = 0
        chunk_size = 200_000
        reader = pd.read_csv(
            SENSOR_FILE, header=None, names=SENSOR_COLUMNS,
            usecols=needed, chunksize=chunk_size,
        )
        for chunk in reader:
            mask = np.random.rand(len(chunk)) < keep_fraction
            kept = chunk[mask]
            chunks.append(kept)
            rows_kept += len(kept)
            if rows_kept >= SENSOR_SAMPLE_ROWS:
                break

        df = pd.concat(chunks, ignore_index=True)
    else:
        df = pd.read_csv(SENSOR_FILE, header=None, names=SENSOR_COLUMNS, usecols=needed)

    print(f"  -> {len(df):,} rows sampled")
    return df


def merge_tables(instances, sensors):
    print("Merging instance status/timing with sensor readings on worker_name...")
    merged = sensors.merge(
        instances[["worker_name", "status", "machine", "start_time", "end_time"]],
        on="worker_name",
        how="inner",
    )
    print(f"  -> {len(merged):,} rows after merge")
    del instances, sensors
    return merged


def engineer_features(df):
    """
    Turns raw columns into a richer feature set. This is real feature
    engineering, not just passing raw numbers into the model - it's
    what separates a serious project from a toy one.
    """
    print("Engineering features...")

    df = df.copy()

    numeric_cols = [
        "cpu_usage", "gpu_wrk_util", "avg_mem", "max_mem",
        "avg_gpu_wrk_mem", "max_gpu_wrk_mem", "read", "write",
        "read_count", "write_count", "start_time", "end_time",
    ]
    for col in numeric_cols:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    # --- Core usage features ---
    df["cpu_usage_pct"] = df["cpu_usage"].clip(lower=0)          # can exceed 100 (multi-core)
    df["gpu_usage_pct"] = df["gpu_wrk_util"].clip(0, 100)

    # --- Memory pressure: how close to peak memory was this instance running? ---
    df["mem_pressure"] = df["avg_mem"] / (df["max_mem"] + 1e-6)
    df["gpu_mem_pressure"] = df["avg_gpu_wrk_mem"] / (df["max_gpu_wrk_mem"] + 1e-6)

    # --- Resource imbalance: CPU-heavy vs GPU-heavy workload ---
    # Capped to avoid extreme outliers when gpu_usage_pct is near zero
    # (division blow-up) - a few raw ratios were in the billions.
    df["cpu_gpu_ratio"] = (df["cpu_usage_pct"] / (df["gpu_usage_pct"] + 1e-6)).clip(upper=1000)

    # --- I/O intensity features ---
    df["io_bytes_total"] = df["read"].fillna(0) + df["write"].fillna(0)
    df["io_ops_total"] = df["read_count"].fillna(0) + df["write_count"].fillna(0)
    df["avg_io_size"] = df["io_bytes_total"] / (df["io_ops_total"] + 1)

    # --- Real duration in hours: the raw trace timestamps are in seconds
    # relative to the start of data collection. This answers "how long
    # has this job/node been running" with real numbers. Capped at 1500
    # hours (~62 days) since that's the real span of the trace collection
    # period (July-August 2020) - anything beyond that is a data artifact. ---
    df["duration_hours"] = ((df["end_time"] - df["start_time"]) / 3600).clip(lower=0, upper=1500)

    # --- Task role: worker / ps / evaluator, encoded as a number ---
    df["task_role"] = df["task_name"].astype("category").cat.codes

    # --- Machine identity: encode machine name as a number (our "node_id") ---
    df["node_id"] = df["machine"].astype("category").cat.codes

    # --- The label: did this instance fail or get interrupted? ---
    status_lower = df["status"].astype(str).str.lower()
    df["will_fail"] = status_lower.isin(["failed", "interrupted"]).astype(int)
    df["status"] = df["status"].astype(str)

    final_columns = [
        "node_id", "task_role",
        "cpu_usage_pct", "gpu_usage_pct",
        "mem_pressure", "gpu_mem_pressure", "cpu_gpu_ratio",
        "io_bytes_total", "io_ops_total", "avg_io_size",
        "duration_hours", "status",
        "will_fail",
    ]

    result = df[final_columns].copy()
    result = result.replace([np.inf, -np.inf], np.nan)

    # IMPORTANT: failed/interrupted instances often have a missing or
    # invalid end_time (the job didn't finish normally, so there's
    # nothing to log). If we dropped every row with ANY missing value,
    # we would disproportionately delete real failure examples - which
    # actually happened during testing and silently wiped out almost
    # all failures. So we handle duration_hours separately: missing
    # duration becomes -1 (a valid signal: "unknown/did not complete
    # normally"), while we still require the core usage features to be
    # present for every row.
    result["duration_hours"] = result["duration_hours"].fillna(-1)
    return result


def main():
    if not (os.path.exists(INSTANCE_FILE) and os.path.exists(SENSOR_FILE)):
        raise FileNotFoundError(
            "\n\nReal data files not found!\n"
            f"Expected:\n  {INSTANCE_FILE}\n  {SENSOR_FILE}\n\n"
            "See the instructions at the top of this file for download links.\n"
        )

    instances = load_instance_table()
    sensors = load_sensor_table()
    merged = merge_tables(instances, sensors)
    features = engineer_features(merged)

    before = len(features)
    core_features = [
        "cpu_usage_pct", "gpu_usage_pct", "mem_pressure", "gpu_mem_pressure",
        "cpu_gpu_ratio", "io_bytes_total", "io_ops_total", "avg_io_size",
    ]
    features = features.dropna(subset=core_features)
    after = len(features)
    print(f"Dropped {before - after:,} rows with missing values after feature engineering.")

    os.makedirs("data", exist_ok=True)
    features.to_csv(OUTPUT_FILE, index=False)

    print(f"\nSaved final dataset to: {OUTPUT_FILE}")
    print(f"Total rows: {len(features):,}")
    print(f"Failure rate: {features['will_fail'].mean():.1%}")
    print("\nColumn summary:")
    print(features.describe().T[["mean", "std", "min", "max"]])
    print("\nThis file is ready for train_model.py")


if __name__ == "__main__":
    main()
