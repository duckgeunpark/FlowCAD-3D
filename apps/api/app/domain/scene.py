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
class SceneDocument:
    """Top-level payload returned to the client."""

    units: str = "mm"
    bounds_min: Vec3 = field(default_factory=Vec3)
    bounds_max: Vec3 = field(default_factory=Vec3)
    elements: list[SceneElement] = field(default_factory=list)
    bom: list[BomRow] = field(default_factory=list)
