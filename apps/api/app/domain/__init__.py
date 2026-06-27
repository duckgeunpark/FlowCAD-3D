"""Domain layer: framework-free entities, value objects and the scene contract."""
from .components import CrossSection, Metadata, Network, Node, Run
from .enums import ComponentKind, DesignMode, DuctShape
from .geometry import Vec3
from .scene import BomRow, JointPort, SceneDocument, SceneElement

__all__ = [
    "CrossSection",
    "Metadata",
    "Network",
    "Node",
    "Run",
    "ComponentKind",
    "DesignMode",
    "DuctShape",
    "Vec3",
    "BomRow",
    "JointPort",
    "SceneDocument",
    "SceneElement",
]
