"""
train_model.py
OWNED BY: Person B (AI Model Person)

WHAT THIS FILE DOES (in simple words):
This is the most important file in our whole project.
It trains our real AI model (LightGBM) to guess which GPU nodes
will fail, using the cleaned data from data_loader.py.

It also uses SHAP to explain WHY the model made its guesses
(which numbers mattered most).

HOW TO RUN THIS FILE:
    python train_model.py

WHAT IT CREATES:
    model1.pkl              <- the trained AI model (Person C will load this)
    model_results.txt       <- accuracy numbers for the dashboard
    feature_importance.txt  <- which features matter most (from SHAP)

BEFORE RUNNING THIS:
    Make sure you already ran:
    1. python generate_sample_data.py   (or got real data)
    2. python data_loader.py
"""

import pandas as pd
import numpy as np
import lightgbm as lgb
import shap
import pickle

from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, precision_score, recall_score

DATA_FILE = "data/cluster_data_clean.csv"
MODEL_OUTPUT = "model1.pkl"

FEATURES = ["cpu_usage", "memory_usage", "gpu_usage", "error_count", "task_count", "queue_length"]
TARGET = "will_fail"


def load_and_split_data():
    """Loads cleaned data and splits it into training (80%) and testing (20%)."""
    data = pd.read_csv(DATA_FILE)

    # Only keep feature columns that actually exist in the file
    available_features = [f for f in FEATURES if f in data.columns]

    X = data[available_features]
    y = data[TARGET]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )
    print(f"Training on {len(X_train)} rows, testing on {len(X_test)} rows.")
    return X_train, X_test, y_train, y_test, available_features


def train_lightgbm(X_train, y_train):
    """Trains the LightGBM AI model."""
    print("\nTraining LightGBM model... (this takes a few seconds)")
    model = lgb.LGBMClassifier(
        num_leaves=31,
        learning_rate=0.05,
        n_estimators=150,
        random_state=42,
        verbose=-1,
    )
    model.fit(X_train, y_train)
    print("Model training complete!")
    return model


def evaluate_model(model, X_test, y_test):
    """Checks how good the model's guesses are."""
    predictions = model.predict(X_test)

    accuracy = accuracy_score(y_test, predictions)
    precision = precision_score(y_test, predictions, zero_division=0)
    recall = recall_score(y_test, predictions, zero_division=0)

    print("\n" + "=" * 50)
    print("AI MODEL RESULTS (LightGBM)")
    print("=" * 50)
    print(f"Accuracy:  {accuracy:.2%}")
    print(f"Precision: {precision:.2%}")
    print(f"Recall:    {recall:.2%}")
    print("=" * 50)

    return {"accuracy": accuracy, "precision": precision, "recall": recall}


def explain_with_shap(model, X_test, features):
    """
    Uses SHAP to find out which features (CPU, memory, errors, etc.)
    matter most for the model's predictions. This is what makes our
    project 'explainable AI' instead of a black box.
    """
    print("\nCalculating SHAP feature importance...")
    explainer = shap.TreeExplainer(model)
    shap_values = explainer.shap_values(X_test)

    # For a binary classifier, shap_values may be a list [class_0, class_1]
    if isinstance(shap_values, list):
        values_to_use = shap_values[1]
    else:
        values_to_use = shap_values

    importance = np.abs(values_to_use).mean(axis=0)

    results = list(zip(features, importance))
    results.sort(key=lambda x: x[1], reverse=True)

    print("\nWhich factors matter most (highest = most important):")
    for feat, score in results:
        print(f"  {feat}: {score:.4f}")

    return results


def main():
    X_train, X_test, y_train, y_test, features = load_and_split_data()

    model = train_lightgbm(X_train, y_train)
    metrics = evaluate_model(model, X_test, y_test)
    importance_results = explain_with_shap(model, X_test, features)

    # Save the trained model so dashboard.py can load it later
    with open(MODEL_OUTPUT, "wb") as f:
        pickle.dump(model, f)
    print(f"\nModel saved to: {MODEL_OUTPUT}")

    # Save accuracy numbers for the dashboard to display
    with open("model_results.txt", "w") as f:
        for key, value in metrics.items():
            f.write(f"{key}={value}\n")
    print("Saved model_results.txt")

    # Save feature importance for the dashboard to display
    with open("feature_importance.txt", "w") as f:
        for feat, score in importance_results:
            f.write(f"{feat}={score}\n")
    print("Saved feature_importance.txt")

    print("\nALL DONE! Send 'model1.pkl' to Person C (Frontend Person) now.")


if __name__ == "__main__":
    main()
