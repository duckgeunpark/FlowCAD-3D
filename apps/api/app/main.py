"""FastAPI application entry point."""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api import router
from .config import settings


def create_app() -> FastAPI:
    app = FastAPI(title=settings.app_name, version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        # No cookies/credentials in the MVP; keep this False so an accidental
        # "*" origin can never combine with credentialed CORS. Scope methods.
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
        allow_origin_regex=settings.cors_origin_regex,
    )
    app.include_router(router)
    return app


app = create_app()
