# ComputePulse: Predictive Cluster Intelligence
**Team Name:** Aletheia  
**Team Members:** Fateha Hossain Anushka (Team Leader), MD Nazmul Islam, Hanjala Habib Sadik

**Prometheus shows what IS. ComputePulse predicts what WILL BE.**

ComputePulse is an AI-powered predictive system that forecasts the health and future state of GPU clusters. It enables system administrators to make proactive decisions instead of reactive ones, Designed to estimate potential resource savings and reduce avoidable compute waste under configurable cost assumptions.

---

## 🛑 Problem Statement
GPU clusters are incredibly expensive infrastructure, often costing millions of dollars per month. Current monitoring tools (like Prometheus, Grafana, and Kubernetes dashboards) are purely **reactive**—they show what is happening right now, but they cannot tell you what is about to fail. 

**The Real Impact:**
- A single GPU failure during a training run costs **$600–$1,200** in lost compute and researcher time.
- Poor job placement and resource contention result in **10–15% wasted GPU resources**.
- System administrators are forced into a constant state of firefighting, with no visibility into the hidden patterns that precede hardware or job failures.

## 🎯 Who Gets the Help (Target Audience)
- **ML Platform Teams** managing internal GPU clusters at tech companies.
- **Research Institutions & Universities** managing large shared compute clusters.
- **Cloud Providers** seeking to optimize their underlying resource allocation.
- **Enterprise AI Operations Teams** running hybrid or on-premises GPU infrastructure.

## 💡 How It Helps (The Solution)
ComputePulse shifts cluster management from *recovery* to *prevention*. By analyzing historical telemetry data, it learns the subtle signatures of impending failures and suboptimal allocations. 

Instead of waiting for a node to crash, ComputePulse provides a **2-hour advance warning**, allowing administrators to seamlessly migrate critical jobs. Furthermore, it continuously analyzes cluster utilization to identify specific machines where GPUs are sitting idle, providing Scenario-based cost-saving estimates using a documented GPU-hour assumption.
---

## 🏗 Architecture & Modules

ComputePulse operates through three integrated AI modules on a shared feature pipeline. **All models are trained and evaluated on real production cluster data from Alibaba (Alibaba Cluster Trace 2018), not synthetic data.**

### Module 1: Failure Risk Prediction
- **Input:** Node telemetry (CPU %, memory %, temperature proxies, job duration).
- **Output:** Failure probability score (0–100%) for the next 2 hours.
- **Benefit:** Alerts admins to migrate critical jobs away from at-risk nodes before failure occurs.

### Module 2: Intelligent Workload Placement
- **Input:** Incoming job specifications, current node states, and failure risk scores.
- **Output:** Recommended node for optimal placement.
- **Benefit:** Prevents resource contention and cascading failures by avoiding high-risk or overloaded nodes.

### Module 3: Resource Optimization
- **Input:** Current cluster allocation and historical utilization patterns.
- **Output:** Identifies underutilized GPUs and estimates exact cost savings (assuming an industry average of $2.50/GPU-hour).
- **Benefit:** Enables proactive cost optimization, potentially saving organizations hundreds of thousands of dollars monthly.

### Interactive Operator Agent (Chatbot)
- **Technology:** Groq LLM (Llama-3.1-8b) with RAG using Hugging Face embeddings.
- **Function:** Understands natural language requests (e.g., "which machines are risky?", "move job 452 to a safe node").
- **Benefit:** Allows operations teams to diagnose failures and execute workload migrations instantly using conversational AI.

### Live Simulation (Run Demo)
- **Function:** A fully interactive step-by-step simulation to demonstrate how ComputePulse proactively handles scheduling.
- **Benefit:** Allows administrators to queue simulated AI training jobs and watch the placement engine dynamically select the safest and most underutilized nodes.

**Unified Health Score:** All outputs feed into a single Health Score (0–100%) per node:
*Health Score = 50% (Failure Prevention) + 30% (Load Balance) + 20% (Efficiency)*

---

## 🛠 Technology Stack (What We Used)

**Machine Learning & Data Engineering:**
- **LightGBM:** Proven gradient boosting framework used for tabular cluster telemetry data. Extremely fast and highly accurate for this specific domain.
- **SHAP (SHapley Additive exPlanations):** Used for Explainable AI. Every single prediction is explained so admins know *why* a node is risky (e.g., "CPU +3%, memory pressure +5%").
- **Pandas, NumPy, Scikit-learn:** For data ingestion, preprocessing, and model evaluation.

**Backend System:**
- **Python 3 & FastAPI:** Provides a blazing-fast JSON API layer over the ML artifacts.
- **Groq (Llama-3.1-8b) & Hugging Face Embeddings:** Used to generate plain-English, grounded explanations for warnings and anomalous cluster behaviors.

**Frontend Dashboard:**
- **React, TypeScript, Vite:** A modern, lightning-fast frontend application.
- **Framer Motion & Recharts:** For smooth micro-animations and interactive data visualization.
- **Three.js (WebGL):** For rendering a high-performance 3D spatial map of all 8,000+ nodes simultaneously.

---

## 📊 Real Results & Performance

Trained on 796,582 real instances from Alibaba's PAI GPU cluster (~6,500 GPUs, ~1,800 machines).

| Metric | Baseline (simple rules) | ComputePulse AI (tuned LightGBM) |
|---|---|---|
| Accuracy | 53.4% | **88.0%** |
| Precision | 12.6% | **77.4%** |
| Recall | 15.4% | **71.2%** |
| F1 | 13.9% | **74.2%** |
| ROC-AUC | 0.405 (worse than random) | **0.924** |

- **Validation:** 5-fold cross-validation ROC-AUC of **0.910 ± 0.002** (highly stable).
- **Placement Correlation:** Predicted risk correlates with real observed failure rates at **r = 0.902** across 1,723 real machines.
- **Optimization:** Identified **1,220 of 1,723** real machines as underutilized (<15% average real GPU usage), representing an estimated **$2,037,986** in idle GPU-hour savings opportunity.

---

## 📁 Project Structure

| Directory/File | Description |
|---|---|
| `/backend/` | Contains the ML pipeline and FastAPI server. |
| `backend/prepare_dataset.py` | Loads, merges, and feature-engineers the real Alibaba cluster data. |
| `backend/train_model.py` | Module 1: LightGBM training (CV, hyperparameter tuning, evaluation, SHAP). |
| `backend/model2_placement.py` | Module 2: Workload placement and risk ranking logic. |
| `backend/model3_optimization.py` | Module 3: Underutilized machine detection and savings estimation. |
| `backend/api/main.py` | FastAPI server exposing endpoints for the dashboard. |
| `/Frontend/` | Contains the React/Vite interactive dashboard application. |
| `Frontend/src/pages/` | Code for the interactive tabs (Fleet, Cluster Map, Warnings, Node Explorer, Evidence, Run Demo). |

---

## 🚀 How to Run (Instructions)

### 1. Install Dependencies
```bash
cd backend
pip install -r requirements.txt
```

### 2. Get the Real Data
Download the real Alibaba GPU cluster trace (~1GB total).
- Easier mirror (GitHub, split into small ~30MB parts): [https://github.com/qzweng/clusterdata-cluster-trace-gpu-v2020-data](https://github.com/qzweng/clusterdata-cluster-trace-gpu-v2020-data)

Download all `pai_instance_table.tar.gz.part*` and `pai_sensor_table.tar.gz.part*` files, then merge and extract:
```bash
cat pai_instance_table.tar.gz.part* > pai_instance_table.tar.gz
cat pai_sensor_table.tar.gz.part* > pai_sensor_table.tar.gz
tar -xzf pai_instance_table.tar.gz
tar -xzf pai_sensor_table.tar.gz
```
Put both resulting CSVs in the `backend/data/` folder.

### 3. Run the Full ML Pipeline (In Order)
```bash
cd backend
python prepare_dataset.py
python baseline_model.py
python train_model.py
python model2_placement.py
python model3_optimization.py
```

### 4. Start the Application
Start the FastAPI backend (Terminal 1):
```bash
cd backend
uvicorn api.main:app --reload --port 8000
```
Start the React frontend (Terminal 2):
```bash
cd Frontend
npm install
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## ⚖️ Honesty Notes 
- **The dataset does not explicitly label "optimal placement."** Module 2 aggregates Module 1's validated predictions and correlates them against real observed failure rates to prove it's meaningful, not guessing.
- **Module 3's dollar figures use a documented assumption** ($2.50/GPU-hour) because the real Alibaba trace is from an internal cluster and has no price list. 
- **The "Fleet Overview" refresh is simulated**, not a live feed, as this dataset is a static historical trace. The dashboard says this explicitly rather than implying real-time data.
- **Every number above came from an actual run of this exact code against the real downloaded dataset** - nothing here is a placeholder or invented figure.
