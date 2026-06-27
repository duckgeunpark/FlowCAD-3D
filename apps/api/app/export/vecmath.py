"""Small shared 3D vector helpers for the exporters (DRY).

Pure tuples, no numpy dependency — exporters need only a handful of ops and
must agree on the same "stable perpendicular" convention for oriented frames.
"""
from __future__ import annotations

import math

Vec = tuple[float, float, float]


def normalize(v: Vec) -> Vec:
    n = math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) or 1.0
    return (v[0] / n, v[1] / n, v[2] / n)


def cross(a: Vec, b: Vec) -> Vec:
    return (a[1] * b[2] - a[2] * b[1],
            a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0])


def unit(a: Vec, b: Vec) -> Vec:
    return normalize((b[0] - a[0], b[1] - a[1], b[2] - a[2]))


def perpendicular(z: Vec) -> Vec:
    """A stable unit vector perpendicular to ``z`` (for building local frames)."""
    ref = (1.0, 0.0, 0.0) if abs(z[0]) < 0.9 else (0.0, 1.0, 0.0)
    return normalize(cross(ref, z))
