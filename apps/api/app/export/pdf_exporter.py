"""2D isometric PDF exporter (matplotlib) — printable shop drawing.

Projects the 3D centerline network to an isometric view, draws segments as
lines, fittings as markers, and annotates joint numbers. This is a drawing
deliverable, not a CAD model (use DXF/STEP/IFC for geometry).
"""
from __future__ import annotations

import io
import math

from ..domain.enums import ExportFormat
from ..domain.scene import SceneDocument
from .base import Exporter, ExporterError
from .primitives import Box, Cylinder, Sphere, element_to_primitive

_COS30 = math.cos(math.radians(30))
_SIN30 = math.sin(math.radians(30))


def _iso(p: tuple[float, float, float]) -> tuple[float, float]:
    """Isometric projection: engineering (x,y,z up) -> 2D screen."""
    x, y, z = p
    return ((x - y) * _COS30, z + (x + y) * _SIN30)


class PdfExporter(Exporter):
    format = ExportFormat.PDF
    media_type = "application/pdf"
    file_ext = "pdf"

    @classmethod
    def is_available(cls) -> bool:
        try:
            import matplotlib  # noqa: F401
            return True
        except ImportError:
            return False

    def export(self, scene: SceneDocument) -> bytes:
        try:
            import matplotlib
            matplotlib.use("Agg")
            import matplotlib.pyplot as plt
        except ImportError as exc:  # pragma: no cover
            raise ExporterError("matplotlib is not installed") from exc

        fig, ax = plt.subplots(figsize=(11.69, 8.27))  # A4 landscape (inches)
        try:
            ax.set_aspect("equal")
            ax.axis("off")
            ax.set_title("FlowCAD 3D — Isometric Drawing", fontsize=12)

            for element in scene.elements:
                prim = element_to_primitive(element)
                color = element.color
                if isinstance(prim, (Cylinder, Box)):
                    (x0, y0), (x1, y1) = _iso(prim.start), _iso(prim.end)
                    ax.plot([x0, x1], [y0, y1], color=color,
                            linewidth=3 if isinstance(prim, Cylinder) else 5,
                            solid_capstyle="round")
                else:  # Sphere fitting
                    cx, cy = _iso(prim.center)
                    ax.plot(cx, cy, marker="o", color=color, markersize=8)
                self._annotate(ax, element, prim)

            fig.tight_layout()
            buf = io.BytesIO()
            fig.savefig(buf, format="pdf")
            return buf.getvalue()
        finally:
            plt.close(fig)

    @staticmethod
    def _annotate(ax, element, prim) -> None:
        joint = element.user_data.get("jointNo")
        if not joint:
            return
        center = prim.center if isinstance(prim, (Box, Sphere)) else tuple(
            (prim.start[i] + prim.end[i]) / 2 for i in range(3))
        sx, sy = _iso(center)
        ax.annotate(joint, (sx, sy), fontsize=7, color="#222",
                    textcoords="offset points", xytext=(4, 4))
