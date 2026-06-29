"""API DTOs (Pydantic). Kept separate from domain dataclasses on purpose:
the wire format can evolve independently of internal models.
"""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from ..domain.enums import DesignMode, ExportFormat
from ..domain.scene import SceneDocument


# Cap rows to bound per-request memory/CPU in the geometry & export backends.
MAX_ROWS = 5_000


class GenerateRequest(BaseModel):
    mode: DesignMode = Field(default=DesignMode.PIPE)
    rows: list[dict[str, Any]] = Field(default_factory=list, max_length=MAX_ROWS)


class ExportRequest(BaseModel):
    mode: DesignMode = Field(default=DesignMode.PIPE)
    format: ExportFormat
    rows: list[dict[str, Any]] = Field(default_factory=list, max_length=MAX_ROWS)


class Vec3DTO(BaseModel):
    x: float
    y: float
    z: float


class SceneElementDTO(BaseModel):
    id: str
    kind: str
    params: dict[str, Any]
    color: str
    userData: dict[str, str]
    itemNo: str
    joints: list[dict[str, Any]]


class BomRowDTO(BaseModel):
    elementId: str
    itemNo: str
    jointNo: str
    jointNos: str
    fittingNo: str
    drawingNo: str
    description: str
    spec: str
    lengthMm: float


class DiagnosticDTO(BaseModel):
    level: str
    code: str
    seq: str
    message: str
    suggestion: str
    position: list[float] | None


class SceneDocumentDTO(BaseModel):
    units: str
    boundsMin: Vec3DTO
    boundsMax: Vec3DTO
    elements: list[SceneElementDTO]
    bom: list[BomRowDTO]
    diagnostics: list[DiagnosticDTO]

    @classmethod
    def from_domain(cls, scene: SceneDocument) -> "SceneDocumentDTO":
        return cls(
            units=scene.units,
            boundsMin=Vec3DTO(x=scene.bounds_min.x, y=scene.bounds_min.y,
                              z=scene.bounds_min.z),
            boundsMax=Vec3DTO(x=scene.bounds_max.x, y=scene.bounds_max.y,
                              z=scene.bounds_max.z),
            elements=[
                SceneElementDTO(id=e.id, kind=e.kind.value, params=e.params,
                                color=e.color, userData=e.user_data,
                                itemNo=e.item_no,
                                joints=[{
                                    "id": j.id,
                                    "no": j.no,
                                    "position": j.position,
                                    "direction": j.direction,
                                    "role": j.role,
                                    "open": j.open,
                                } for j in e.joints])
                for e in scene.elements
            ],
            bom=[
                BomRowDTO(elementId=b.element_id, itemNo=b.item_no,
                          jointNo=b.joint_no, jointNos=b.joint_nos,
                          fittingNo=b.fitting_no, drawingNo=b.drawing_no,
                          description=b.description, spec=b.spec, lengthMm=b.length_mm)
                for b in scene.bom
            ],
            diagnostics=[
                DiagnosticDTO(level=d.level, code=d.code, seq=d.seq,
                              message=d.message, suggestion=d.suggestion,
                              position=d.position)
                for d in scene.diagnostics
            ],
        )
