from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routers import demo, explain, fleet, metrics, nodes, optimize, placement, warnings
from api.services.store import health_status

try:
    from dotenv import load_dotenv
    from pathlib import Path

    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
except ImportError:
    pass

app = FastAPI(
    title="ComputePulse API",
    description="Cluster health intelligence — file-backed ML artifacts",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
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


from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os

static_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "Frontend", "dist")
if os.path.exists(static_dir):
    # Mount assets folder
    assets_dir = os.path.join(static_dir, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    # Catch-all for React SPA router
    @app.get("/{catchall:path}")
    def serve_frontend(catchall: str):
        if catchall.startswith("api"):
            return {"detail": "Not Found"}
        index_file = os.path.join(static_dir, "index.html")
        if os.path.exists(index_file):
            return FileResponse(index_file)
        return {"error": "Frontend build index.html not found"}

