"""IFC4 exporter (IfcOpenShell) — BIM target for Revit / Navisworks.

Builds a minimal but valid spatial hierarchy (Project > Site > Building >
Storey) and emits each component as an IfcPipeSegment / IfcDuctSegment / fitting
with a swept-solid body and a property set carrying the tracking metadata.
"""
from __future__ import annotations

import tempfile
from pathlib import Path

from ..domain.enums import ExportFormat
from ..domain.scene import SceneDocument
from .base import Exporter, ExporterError
from .primitives import Box, Cylinder, Sphere, element_to_primitive
from .vecmath import cross, normalize, unit

# IFC product class per Scene element kind.
_PRODUCT_CLASS = {
    "pipe_segment": "IfcPipeSegment",
    "duct_segment": "IfcDuctSegment",
    "elbow": "IfcPipeFitting",
    "tee": "IfcPipeFitting",
    "transition": "IfcDuctFitting",
    "valve": "IfcValve",
    "damper": "IfcDamper",
}


class IfcExporter(Exporter):
    format = ExportFormat.IFC
    media_type = "application/x-ifc"
    file_ext = "ifc"

    @classmethod
    def is_available(cls) -> bool:
        try:
            import ifcopenshell  # noqa: F401
            return True
        except ImportError:
            return False

    def export(self, scene: SceneDocument) -> bytes:
        try:
            import ifcopenshell
            from ifcopenshell import guid
        except ImportError as exc:  # pragma: no cover
            raise ExporterError("ifcopenshell is not installed") from exc

        f = ifcopenshell.file(schema="IFC4")
        ctx, storey = self._scaffold(f, guid)

        products = []
        for element in scene.elements:
            prim = element_to_primitive(element)
            solid = self._solid(f, prim)
            rep = f.create_entity(
                "IfcShapeRepresentation", ContextOfItems=ctx,
                RepresentationIdentifier="Body", RepresentationType="SweptSolid",
                Items=[solid])
            product = f.create_entity(
                _PRODUCT_CLASS.get(element.kind.value, "IfcBuildingElementProxy"),
                GlobalId=guid.new(),
                Name=self.safe_name(element.id, element.user_data),
                ObjectPlacement=self._placement(f),
                Representation=f.create_entity(
                    "IfcProductDefinitionShape", Representations=[rep]),
            )
            self._attach_pset(f, guid, product, element.user_data)
            products.append(product)

        if products:
            f.create_entity(
                "IfcRelContainedInSpatialStructure", GlobalId=guid.new(),
                RelatingStructure=storey, RelatedElements=products)

        return self._to_bytes(f)

    # -- scaffold -------------------------------------------------------------
    def _scaffold(self, f, guid):
        unit = f.create_entity("IfcSIUnit", UnitType="LENGTHUNIT",
                               Name="METRE", Prefix="MILLI")
        units = f.create_entity("IfcUnitAssignment", Units=[unit])
        ctx = f.create_entity(
            "IfcGeometricRepresentationContext", ContextType="Model",
            CoordinateSpaceDimension=3, Precision=1e-5,
            WorldCoordinateSystem=self._axis(f))
        project = f.create_entity(
            "IfcProject", GlobalId=guid.new(), Name="FlowCAD 3D",
            UnitsInContext=units, RepresentationContexts=[ctx])

        site = f.create_entity("IfcSite", GlobalId=guid.new(), Name="Site",
                               ObjectPlacement=self._placement(f))
        building = f.create_entity("IfcBuilding", GlobalId=guid.new(),
                                   Name="Building", ObjectPlacement=self._placement(f))
        storey = f.create_entity("IfcBuildingStorey", GlobalId=guid.new(),
                                 Name="Storey", ObjectPlacement=self._placement(f))
        for parent, child in ((project, site), (site, building), (building, storey)):
            f.create_entity("IfcRelAggregates", GlobalId=guid.new(),
                            RelatingObject=parent, RelatedObjects=[child])
        return ctx, storey

    # -- geometry -------------------------------------------------------------
    def _solid(self, f, prim):
        if isinstance(prim, Cylinder):
            profile = f.create_entity("IfcCircleProfileDef", ProfileType="AREA",
                                      Radius=prim.radius)
            return self._extrude(f, profile, prim.start, prim.axis, prim.length)
        if isinstance(prim, Box):
            profile = f.create_entity("IfcRectangleProfileDef", ProfileType="AREA",
                                      XDim=prim.width, YDim=prim.height)
            axis = unit(prim.start, prim.end)
            return self._extrude(f, profile, prim.start, axis, prim.length)
        # Sphere fitting -> short circular stub marker
        profile = f.create_entity("IfcCircleProfileDef", ProfileType="AREA",
                                  Radius=prim.radius)
        base = (prim.center[0], prim.center[1], prim.center[2] - prim.radius * 0.3)
        return self._extrude(f, profile, base, (0, 0, 1), prim.radius * 0.6)

    def _extrude(self, f, profile, origin, zdir, depth):
        position = self._axis(f, origin, zdir)
        direction = f.create_entity("IfcDirection", DirectionRatios=(0.0, 0.0, 1.0))
        return f.create_entity(
            "IfcExtrudedAreaSolid", SweptArea=profile, Position=position,
            ExtrudedDirection=direction, Depth=float(depth))

    def _axis(self, f, origin=(0, 0, 0), zdir=(0, 0, 1)):
        z = normalize(zdir)
        ref = (1.0, 0.0, 0.0) if abs(z[0]) < 0.9 else (0.0, 1.0, 0.0)
        x = normalize(cross(ref, z))
        loc = f.create_entity("IfcCartesianPoint",
                              Coordinates=tuple(float(c) for c in origin))
        return f.create_entity(
            "IfcAxis2Placement3D", Location=loc,
            Axis=f.create_entity("IfcDirection", DirectionRatios=z),
            RefDirection=f.create_entity("IfcDirection", DirectionRatios=x))

    def _placement(self, f, rel=None):
        loc = f.create_entity("IfcCartesianPoint", Coordinates=(0.0, 0.0, 0.0))
        a2 = f.create_entity("IfcAxis2Placement3D", Location=loc)
        return f.create_entity("IfcLocalPlacement", PlacementRelTo=rel,
                               RelativePlacement=a2)

    # -- metadata -------------------------------------------------------------
    def _attach_pset(self, f, guid, product, user_data) -> None:
        props = [
            f.create_entity("IfcPropertySingleValue", Name=k,
                            NominalValue=f.create_entity("IfcText", str(v)))
            for k, v in user_data.items() if v
        ]
        if not props:
            return
        pset = f.create_entity("IfcPropertySet", GlobalId=guid.new(),
                               Name="Pset_FlowCAD", HasProperties=props)
        f.create_entity("IfcRelDefinesByProperties", GlobalId=guid.new(),
                        RelatedObjects=[product], RelatingPropertyDefinition=pset)

    def _to_bytes(self, f) -> bytes:
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "model.ifc"
            f.write(str(path))
            return path.read_bytes()
