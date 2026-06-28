"""Domain entities: the parsed, mode-agnostic representation of a network.

A *node* is a point on the centerline carrying metadata (drawing/fitting/joint
numbers). The routing engine connects consecutive nodes of a run with segments
and places fitting geometry at nodes whose ``fitting`` is not ``None``.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .enums import ComponentKind, DesignMode, DuctShape
from .geometry import Vec3


@dataclass(slots=True)
class Metadata:
    """Tracking metadata bound 1:1 onto every generated mesh (plan §3.2)."""

    drawing_no: str = ""
    fitting_no: str = ""
    joint_no: str = ""
    item_no: str = ""
    spec: str = ""
    joint_nos: list[str] = field(default_factory=list)
    extra: dict[str, str] = field(default_factory=dict)


@dataclass(slots=True)
class CrossSection:
    """Resolved physical cross-section of a component, computed from the spec DB.

    For pipes: ``outer_diameter`` is meaningful (round). For rectangular ducts:
    ``width`` / ``height`` are meaningful. ``wall_thickness`` is informational.
    """

    shape: DuctShape
    outer_diameter: float = 0.0
    width: float = 0.0
    height: float = 0.0
    wall_thickness: float = 0.0
    bend_radius: float = 0.0


@dataclass(slots=True)
class Node:
    """A centerline node belonging to a run."""

    position: Vec3
    metadata: Metadata
    fitting: ComponentKind | None = None  # placed AT this node (elbow/tee/valve...)
    section: CrossSection | None = None
    # Which port of the neighboring ``fitting`` this endpoint connects to
    # (e.g. "branch" vs "out"). Lets the trim use the correct arm length so the
    # straight's joint lands exactly on the fitting's port joint, not its center.
    fitting_port: str | None = None


@dataclass(slots=True)
class Run:
    """An ordered polyline of nodes forming one continuous pipe/duct run."""

    mode: DesignMode
    section: CrossSection
    nodes: list[Node] = field(default_factory=list)


@dataclass(slots=True)
class Network:
    """The full parsed model handed to the geometry engine."""

    mode: DesignMode
    runs: list[Run] = field(default_factory=list)
    error_markers: list[dict[str, Any]] = field(default_factory=list)
