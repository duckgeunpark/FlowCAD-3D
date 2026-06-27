"""Geometry value objects (immutable). All units are millimetres (1 unit = 1 mm)."""
from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Vec3:
    """An immutable 3D vector / point in millimetres."""

    x: float = 0.0
    y: float = 0.0
    z: float = 0.0

    def __add__(self, other: "Vec3") -> "Vec3":
        return Vec3(self.x + other.x, self.y + other.y, self.z + other.z)

    def __sub__(self, other: "Vec3") -> "Vec3":
        return Vec3(self.x - other.x, self.y - other.y, self.z - other.z)

    def scaled(self, k: float) -> "Vec3":
        return Vec3(self.x * k, self.y * k, self.z * k)

    def length(self) -> float:
        return math.sqrt(self.x**2 + self.y**2 + self.z**2)

    def midpoint(self, other: "Vec3") -> "Vec3":
        return (self + other).scaled(0.5)

    def as_tuple(self) -> tuple[float, float, float]:
        return (self.x, self.y, self.z)
