"""The Scene Document: the serializable contract between backend & frontend.

The backend computes geometry *parameters* (not vertices); the frontend
GeometryFactory turns each element into a Three.js mesh. Keeping this contract
small and explicit is what lets the two engines evolve independently.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from .enums import ComponentKind
from .geometry import Vec3


@dataclass(slots=True)
class JointPort:
    """A connection point attached to an item."""

    id: str
    no: str
    position: list[float]
    direction: list[float]
    role: str
    open: bool = False


@dataclass(slots=True)
class SceneElement:
    """One renderable element. ``params`` are kind-specific (see GeometryFactory)."""

    id: str
    kind: ComponentKind
    params: dict[str, float | str | list[float]]
    color: str
    user_data: dict[str, str]
    item_no: str = ""
    joints: list[JointPort] = field(default_factory=list)


@dataclass(slots=True)
class BomRow:
    """A bill-of-materials row, linked to a scene element by ``element_id``."""

    element_id: str
    item_no: str
    joint_no: str
    joint_nos: str
    fitting_no: str
    drawing_no: str
    description: str
    spec: str
    length_mm: float = 0.0


@dataclass(slots=True)
class Diagnostic:
    """A structured validation message tied to an input row (Plan_v2 §사용성).

    Unlike the 3D ``ERROR_MARKER`` element (which only the viewer renders), a
    diagnostic carries the offending ``seq`` so the input table can highlight the
    exact row and the UI can list the *reason* and a *recommended fix*.
    """

    level: str  # "error" | "warning" | "info"
    code: str  # machine-stable code, e.g. "DIAMETER_MISMATCH"
    seq: str  # the offending row's seq ("" if not row-specific)
    message: str  # human-readable reason (Korean)
    suggestion: str = ""  # recommended correction, if any
    position: list[float] | None = None  # 3D anchor, when applicable


@dataclass(slots=True)
class SceneDocument:
    """Top-level payload returned to the client."""

    units: str = "mm"
    bounds_min: Vec3 = field(default_factory=Vec3)
    bounds_max: Vec3 = field(default_factory=Vec3)
    elements: list[SceneElement] = field(default_factory=list)
    bom: list[BomRow] = field(default_factory=list)
    diagnostics: list[Diagnostic] = field(default_factory=list)
