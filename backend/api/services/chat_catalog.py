"""Frozen ComputePulse product catalog for grounded chat help answers."""

from __future__ import annotations

from typing import Any

FEATURES: list[dict[str, Any]] = [
    {
        "id": "fleet",
        "title": "Fleet Overview",
        "path": "/app/fleet",
        "keywords": ["fleet", "overview", "dashboard", "kpi", "health"],
        "summary": (
            "See fleet-wide health KPIs and filter machines by critical, "
            "watch, or healthy status using fused risk thresholds."
        ),
        "how_to": (
            "Open Fleet Overview. Use status chips to filter. Click a node "
            "row to inspect it. Use Refresh in the top bar to resample a "
            "different historical moment."
        ),
    },
    {
        "id": "warnings",
        "title": "Warnings",
        "path": "/app/warnings",
        "keywords": ["warning", "warnings", "alert", "inbox", "critical alert"],
        "summary": (
            "Inbox of critical/watch/forecast/drift alerts with reasons and "
            "optional safer-host recommendations."
        ),
        "how_to": (
            "Open Warnings. Select an alert to read summary, reasons, and "
            "recommendation. Critical alerts match fused risk above the "
            "critical threshold."
        ),
    },
    {
        "id": "map",
        "title": "Cluster Map",
        "path": "/app/map",
        "keywords": ["map", "cluster map", "grid", "spatial"],
        "summary": (
            "Spatial / grid view of risk across the cluster so hotspots "
            "are easy to spot."
        ),
        "how_to": "Open Cluster Map and scan color-coded nodes by risk.",
    },
    {
        "id": "nodes",
        "title": "Node Explorer",
        "path": "/app/nodes",
        "keywords": ["node", "nodes", "explorer", "explain", "shap", "metrics"],
        "summary": (
            "Inspect a single machine: live metrics, SHAP risk drivers, "
            "timeline, and an AI system summary."
        ),
        "how_to": (
            "Open Node Explorer, enter or pick a node id, and read Status, "
            "metrics, and System Summary. Ask this chat about a node number "
            "for a guided brief."
        ),
    },
    {
        "id": "placement",
        "title": "Job Placement",
        "path": "/app/placement",
        "keywords": ["placement", "place job", "recommend", "prefer", "avoid"],
        "summary": (
            "Rank hosts to prefer or avoid for the next job using placement "
            "score (safety 60% + normality 30% + history 10%)."
        ),
        "how_to": (
            "Open Job Placement to see recommended and avoid lists. For a "
            "critical node, ask this chat where the job should go."
        ),
    },
    {
        "id": "optimize",
        "title": "Cost Optimization",
        "path": "/app/optimize",
        "keywords": ["optimize", "cost", "idle", "savings", "reclaim"],
        "summary": (
            "Surface underutilized GPUs and estimated dollar savings from "
            "reclaiming idle capacity."
        ),
        "how_to": "Open Cost Optimization and review idle / reclaim opportunities.",
    },
    {
        "id": "evidence",
        "title": "System Accuracy",
        "path": "/app/evidence",
        "keywords": ["evidence", "accuracy", "model", "holdout", "trust"],
        "summary": (
            "Model evidence and holdout metrics so you can trust predictions "
            "before acting."
        ),
        "how_to": "Open System Accuracy to review validation evidence and caveats.",
    },
    {
        "id": "compare",
        "title": "Compare Nodes",
        "path": "/app/compare",
        "keywords": ["compare", "side by side", "diff"],
        "summary": "Side-by-side comparison of selected nodes and their risk profiles.",
        "how_to": "Open Compare Nodes and select two or more node ids to compare.",
    },
    {
        "id": "demo",
        "title": "Run Demo",
        "path": "/app/demo",
        "keywords": [
            "demo",
            "run demo",
            "placement session",
            "queue",
            "place all",
            "run auto",
        ],
        "summary": (
            "Guided multi-job placement session: queue jobs, place next, "
            "run auto one-by-one, or place all at once. Each recommend host "
            "gets at most one session job."
        ),
        "how_to": (
            "Open Run Demo. Add jobs to the queue. Use Place next job, "
            "Run auto (one by one), or Place all at once. Review History "
            "for from→to and estimated savings."
        ),
    },
    {
        "id": "thresholds",
        "title": "Risk thresholds",
        "path": "/app/fleet",
        "keywords": ["threshold", "critical", "watch", "slider"],
        "summary": (
            "Critical and watch sliders in the top bar change how nodes are "
            "labeled fleet-wide (default critical=70, watch=40)."
        ),
        "how_to": (
            "Open the threshold controls in the app top bar and adjust "
            "critical / watch. Fleet, Warnings, and this chat all use the "
            "same values."
        ),
    },
    {
        "id": "refresh",
        "title": "Refresh seed",
        "path": "/app/fleet",
        "keywords": ["refresh", "seed", "resample"],
        "summary": (
            "Refresh resamples a different real historical fleet moment "
            "(new seed) so demos stay grounded in real data."
        ),
        "how_to": "Click Refresh in the top bar, then re-check Fleet or ask about a node again.",
    },
    {
        "id": "palette",
        "title": "Command palette",
        "path": "/app/fleet",
        "keywords": ["palette", "command", "shortcut", "ctrl+k", "cmd+k"],
        "summary": "Quick jump between pages via Ctrl/Cmd+K.",
        "how_to": "Press Ctrl+K (Windows/Linux) or Cmd+K (macOS) and pick a destination.",
    },
]

PLAYBOOKS: list[dict[str, Any]] = [
    {
        "id": "first_visit",
        "title": "How ComputePulse works (first visit)",
        "keywords": [
            "how does",
            "how to use",
            "getting started",
            "first",
            "overview of system",
            "work the system",
        ],
        "steps": [
            "Open Fleet Overview to see critical / watch / healthy counts.",
            "Open Warnings for the highest-risk machines.",
            "Open a critical node in Node Explorer (or ask this chat: Node 1477).",
            "Use Job Placement or Run Demo to move work onto safer hosts.",
            "Check System Accuracy when you want model evidence.",
        ],
        "links": [
            {"label": "Fleet Overview", "path": "/app/fleet"},
            {"label": "Warnings", "path": "/app/warnings"},
            {"label": "Run Demo", "path": "/app/demo"},
        ],
    },
    {
        "id": "fused_risk",
        "title": "What is fused risk / critical / watch / healthy?",
        "keywords": [
            "fused risk",
            "what is critical",
            "what is watch",
            "healthy",
            "status meaning",
        ],
        "steps": [
            "Fused risk combines model failure risk and anomaly into one 0–100 score.",
            "Above the critical threshold (default 70) → critical.",
            "Above watch (default 40) but not critical → watch.",
            "Otherwise → healthy.",
            "Thresholds are adjustable in the top bar and apply across the app.",
        ],
        "links": [
            {"label": "Fleet Overview", "path": "/app/fleet"},
            {"label": "Node Explorer", "path": "/app/nodes"},
        ],
    },
    {
        "id": "safe_place",
        "title": "How do I place a job safely?",
        "keywords": [
            "place a job",
            "safely",
            "placement how",
            "recommend host",
            "move workload",
        ],
        "steps": [
            "Find a risky assign host in Warnings or Fleet (critical).",
            "Open Job Placement for fleet-wide prefer / avoid ranking.",
            "Or open Run Demo: Add jobs, then Place next / Run auto / Place all.",
            "Demo enforces exclusive hosts (one job per recommend node per session).",
            "Ask this chat about a node number for why it is risky and where to go.",
        ],
        "links": [
            {"label": "Job Placement", "path": "/app/placement"},
            {"label": "Run Demo", "path": "/app/demo"},
        ],
    },
    {
        "id": "trust_model",
        "title": "How do I trust the model?",
        "keywords": ["trust", "evidence", "accuracy", "holdout", "model quality"],
        "steps": [
            "Open System Accuracy for holdout / evidence metrics.",
            "Node Explorer and Warnings show SHAP-style reasons, not black-box scores only.",
            "Treat recommendations as decision support — not automatic remediations.",
        ],
        "links": [{"label": "System Accuracy", "path": "/app/evidence"}],
    },
    {
        "id": "run_demo",
        "title": "How do I run the demo?",
        "keywords": ["run the demo", "demo how", "place all", "run auto"],
        "steps": [
            "Go to Run Demo.",
            "Add jobs to the queue (Add job / Add 3 jobs).",
            "Place next job for one storyboard, Run auto for sequential placement, "
            "or Place all at once for an instant batch.",
            "Review History for Job · From · To · Fit · $ saved.",
        ],
        "links": [{"label": "Run Demo", "path": "/app/demo"}],
    },
]


def feature_by_id(feature_id: str) -> dict[str, Any] | None:
    for f in FEATURES:
        if f["id"] == feature_id:
            return f
    return None


def match_feature(message: str) -> dict[str, Any] | None:
    text = message.lower()
    best: dict[str, Any] | None = None
    best_score = 0
    for f in FEATURES:
        score = 0
        title = str(f["title"]).lower()
        if title in text:
            score += 5
        for kw in f.get("keywords", []):
            if str(kw).lower() in text:
                score += 2
        if score > best_score:
            best_score = score
            best = f
    return best if best_score >= 2 else None


def match_playbook(message: str) -> dict[str, Any] | None:
    text = message.lower()
    best: dict[str, Any] | None = None
    best_score = 0
    for p in PLAYBOOKS:
        score = 0
        if str(p["title"]).lower() in text:
            score += 5
        for kw in p.get("keywords", []):
            if str(kw).lower() in text:
                score += 2
        if score > best_score:
            best_score = score
            best = p
    return best if best_score >= 2 else None


def catalog_markdown(
    *,
    feature_ids: list[str] | None = None,
    playbook_id: str | None = None,
    all_features: bool = False,
) -> str:
    lines: list[str] = []
    if all_features or feature_ids:
        lines.append("## Product features")
        selected = FEATURES
        if feature_ids:
            idset = set(feature_ids)
            selected = [f for f in FEATURES if f["id"] in idset]
        for f in selected:
            lines.append(
                f"- **{f['title']}** (`{f['path']}`): {f['summary']} "
                f"How: {f['how_to']}"
            )
    if playbook_id:
        pb = next((p for p in PLAYBOOKS if p["id"] == playbook_id), None)
        if pb:
            lines.append(f"## Playbook: {pb['title']}")
            for i, step in enumerate(pb["steps"], 1):
                lines.append(f"{i}. {step}")
            for link in pb.get("links", []):
                lines.append(f"- Link: {link['label']} → {link['path']}")
    return "\n".join(lines) if lines else ""


def list_feature_links() -> list[dict[str, str]]:
    return [{"label": f["title"], "path": f["path"]} for f in FEATURES]
