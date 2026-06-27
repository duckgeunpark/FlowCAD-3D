"""Composition root / dependency injection wiring.

Constructing the object graph in one place (rather than inside route handlers)
keeps the wiring swappable — e.g. drop in a DB-backed SpecRepository for prod.
"""
from __future__ import annotations

from functools import lru_cache

from ..specs.repository import InMemorySpecRepository, SpecRepository
from ..services.export_service import ExportService
from ..services.generation_service import GenerationService


@lru_cache(maxsize=1)
def get_spec_repository() -> SpecRepository:
    return InMemorySpecRepository()


@lru_cache(maxsize=1)
def get_generation_service() -> GenerationService:
    return GenerationService(specs=get_spec_repository())


@lru_cache(maxsize=1)
def get_export_service() -> ExportService:
    return ExportService(generation=get_generation_service())
