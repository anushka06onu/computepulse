from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from api.routers import chat, demo, explain, fleet, metrics, nodes, optimize, placement, warnings
from api.services.store import health_status

try:
    from dotenv import load_dotenv

    backend_root = Path(__file__).resolve().parents[1]
    load_dotenv(backend_root / ".env")
    # Optional monorepo root .env
    load_dotenv(backend_root.parent / ".env")
except ImportError:
    pass

app = FastAPI(
    title="ComputePulse API",
    description="Cluster health intelligence — file-backed ML artifacts",
    version="1.0.0",
)

_default_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
]
_extra = [
    o.strip()
    for o in os.getenv("FRONTEND_ORIGINS", os.getenv("FRONTEND_ORIGIN", "")).split(",")
    if o.strip()
]
_allow_origins = _default_origins + _extra
# Render / production: set FRONTEND_ORIGINS=https://your-frontend.vercel.app
if os.getenv("CORS_ALLOW_ALL", "true").lower() in {"1", "true", "yes"}:
    _allow_origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allow_origins,
    allow_credentials=_allow_origins != ["*"],
    allow_methods=["*"],
    allow_headers=["*"],

)

app.include_router(fleet.router)
app.include_router(nodes.router)
app.include_router(placement.router)
app.include_router(optimize.router)
app.include_router(metrics.router)
app.include_router(demo.router)
app.include_router(explain.router)
app.include_router(warnings.router)
app.include_router(chat.router)


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

static_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "Frontend", "dist")
if os.path.exists(static_dir):
    assets_dir = os.path.join(static_dir, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{catchall:path}")
    def serve_frontend(catchall: str):
        if catchall.startswith("api"):
            return {"detail": "Not Found"}
        index_file = os.path.join(static_dir, "index.html")
        if os.path.exists(index_file):
            return FileResponse(index_file)
        return {"error": "Frontend build index.html not found"}

