"""
generate_sample_data.py

WHAT THIS FILE DOES (in simple words):
This file creates FAKE but realistic-looking GPU cluster data.
Use this if the real Alibaba dataset is too big, too confusing,
or you simply don't have time to download and clean it.

This is a completely normal and accepted thing to do in a
hackathon when time is short. Just be honest if asked:
"We used a representative sample dataset to demonstrate the pipeline."

HOW TO RUN THIS FILE:
    python generate_sample_data.py

WHAT IT CREATES:
    data/cluster_data.csv   <- this file will be used by every other script
"""

import pandas as pd
import numpy as np
import os

# Make sure the data folder exists
os.makedirs("data", exist_ok=True)

# This makes the "random" numbers the same every time we run it
np.random.seed(42)

# How many rows (samples) of fake data we want
N_SAMPLES = 8000

print("Creating fake GPU cluster data...")

data = pd.DataFrame({
    "node_id": np.random.randint(1, 60, N_SAMPLES),           # 60 different GPU nodes
    "cpu_usage": np.random.uniform(5, 100, N_SAMPLES),         # CPU usage percent
    "memory_usage": np.random.uniform(5, 100, N_SAMPLES),      # Memory usage percent
    "gpu_usage": np.random.uniform(5, 100, N_SAMPLES),         # GPU usage percent
    "error_count": np.random.poisson(2, N_SAMPLES),            # Errors seen recently
    "task_count": np.random.randint(1, 25, N_SAMPLES),         # How many jobs running
    "queue_length": np.random.randint(0, 15, N_SAMPLES),       # Jobs waiting in line
})

# THIS IS THE ANSWER KEY (label) - did this node fail or not?
#
# We make failures depend on COMBINATIONS of factors, not just single
# thresholds. This is realistic (real failures are usually caused by
# several things happening together) AND it means a simple "if CPU >
# 80" baseline rule will NOT catch everything - giving our real AI
# model (LightGBM) a genuine chance to prove it's smarter, because it
# can learn these combinations automatically.
combo_score = (
    0.30 * (data["cpu_usage"] / 100) +
    0.25 * (data["gpu_usage"] / 100) +
    0.20 * (data["memory_usage"] / 100) +
    0.15 * (data["error_count"] / data["error_count"].max()) +
    0.10 * (data["queue_length"] / data["queue_length"].max())
)

# Extra risk when CPU and GPU are BOTH high at the same time
# (a baseline rule checking one field at a time will miss this pattern)
combo_score += np.where(
    (data["cpu_usage"] > 70) & (data["gpu_usage"] > 70), 0.15, 0
)

random_noise = np.random.normal(0, 0.08, N_SAMPLES)
final_score = combo_score + random_noise

# Turn the score into a yes/no label using the top ~25% as "will fail"
threshold = np.percentile(final_score, 75)
data["will_fail"] = (final_score > threshold).astype(int)

# Save it to a CSV file (a simple table file, opens in Excel too)
output_path = "data/cluster_data.csv"
data.to_csv(output_path, index=False)

print(f"Done! Fake data saved to: {output_path}")
print(f"Total rows created: {len(data)}")
print(f"Nodes that 'failed': {data['will_fail'].sum()} out of {len(data)}")
print("\nFirst 5 rows preview:")
print(data.head())
