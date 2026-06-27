"""Normalised geometric primitives shared by all exporters.

Each :class:`SceneElement` maps to exactly one primitive (cylinder / box /
sphere). Centralising this mapping means the four exporters never re-interpret
the Scene Document contract differently. Mirrors the frontend GeometryFactory.

Coordinates stay in engineering space (x=east, y=north, z=up, millimetres) —
unlike the three.js renderer, CAD/BIM formats are natively z-up.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

from ..domain.scene import SceneElement
from .base import ExporterError


@dataclass(frozen=True, slots=True)
class Cylinder:
    start: tuple[float, float, float]
    end: tuple[float, float, float]
    radius: float

    @property
    def axis(self) -> tuple[float, float, float]:
        dx, dy, dz = (self.end[i] - self.start[i] for i in range(3))
        length = math.sqrt(dx * dx + dy * dy + dz * dz) or 1.0
        return (dx / length, dy / length, dz / length)

    @property
    def length(self) -> float:
        return math.dist(self.start, self.end)


@dataclass(frozen=True, slots=True)
class Box:
    """Box spanning ``start`` -> ``end`` along its local length axis."""

    start: tuple[float, float, float]
    end: tuple[float, float, float]
    width: float
    height: float

    @property
    def center(self) -> tuple[float, float, float]:
        return tuple((self.start[i] + self.end[i]) / 2 for i in range(3))  # type: ignore[return-value]

    @property
    def length(self) -> float:
        return math.dist(self.start, self.end)


@dataclass(frozen=True, slots=True)
class Sphere:
    center: tuple[float, float, float]
    radius: float


Primitive = Cylinder | Box | Sphere


class PrimitiveError(ExporterError):
    """Raised when a scene element lacks the params its kind requires."""


def element_to_primitive(element: SceneElement) -> Primitive:
    """Map one Scene Document element to a CAD primitive."""
    p = element.params
    kind = element.kind.value
    try:
        if kind in ("pipe_segment", "duct_segment") and "start" in p and "width" not in p:
            return Cylinder(
                start=_vec(p["start"]), end=_vec(p["end"]), radius=float(p["radius"]),
            )
        if kind == "duct_segment":  # rectangular
            return Box(
                start=_vec(p["start"]), end=_vec(p["end"]),
                width=float(p["width"]), height=float(p["height"]),
            )
        if kind == "transition" and "start" in p and "end" in p:
            width = max(
                float(p.get("fromWidth", 0.0) or 0.0),
                float(p.get("toWidth", 0.0) or 0.0),
                float(p.get("fromRadius", 0.0) or 0.0) * 2,
                float(p.get("toRadius", 0.0) or 0.0) * 2,
            )
            height = max(
                float(p.get("fromHeight", 0.0) or 0.0),
                float(p.get("toHeight", 0.0) or 0.0),
                float(p.get("fromRadius", 0.0) or 0.0) * 2,
                float(p.get("toRadius", 0.0) or 0.0) * 2,
            )
            return Box(
                start=_vec(p["start"]), end=_vec(p["end"]),
                width=width or 1.0, height=height or 1.0,
            )
        if kind in ("valve", "damper"):
            c = _vec(p["position"])
            s = float(p["radius"]) * 1.6
            half = s / 2
            return Box(
                start=(c[0], c[1], c[2] - half), end=(c[0], c[1], c[2] + half),
                width=s, height=s,
            )
        # elbow / tee / transition (joint markers)
        return Sphere(center=_vec(p["position"]), radius=float(p["radius"]))
    except (KeyError, TypeError, ValueError) as exc:
        raise PrimitiveError(
            f"element {element.id!r} ({kind}) has invalid geometry params") from exc


def _vec(value: object) -> tuple[float, float, float]:
    seq = list(value)  # type: ignore[arg-type]
    return (float(seq[0]), float(seq[1]), float(seq[2]))
