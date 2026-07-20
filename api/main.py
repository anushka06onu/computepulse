from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routers import demo, fleet, metrics, nodes, optimize, placement
from api.services.store import health_status

app = FastAPI(
    title="ComputePulse API",
    description="Cluster health intelligence — file-backed ML artifacts",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(fleet.router)
app.include_router(nodes.router)
app.include_router(placement.router)
app.include_router(optimize.router)
app.include_router(metrics.router)
app.include_router(demo.router)


@app.get("/api/health")
def health():
    return health_status()


@app.on_event("startup")
def warmup():
    status = health_status()
    if status["ready"]:
        from api.services.store import store

        try:
            store.ensure_loaded()
        except Exception as exc:  # noqa: BLE001
            print(f"Warmup skipped: {exc}")
