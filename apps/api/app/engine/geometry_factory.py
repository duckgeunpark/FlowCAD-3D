"""Geometry factory: turns domain components into renderable SceneElements.

The backend owns physical sizing, adjacent-node topology context, and normalized
vectors. The frontend consumes this flat Scene Document contract and builds
Three.js meshes.
"""
from __future__ import annotations

import math
from typing import Any

from ..domain.components import CrossSection, Node, Run
from ..domain.enums import ComponentKind, DuctShape
from ..domain.geometry import Vec3
from ..domain.scene import JointPort, SceneElement

ParamMap = dict[str, float | str | list[float]]

# Colour palette keyed by component kind (hex strings, consumed verbatim by CSS/three).
_PALETTE: dict[ComponentKind, str] = {
    ComponentKind.PIPE_SEGMENT: "#9aa7b4",
    ComponentKind.DUCT_SEGMENT: "#c9b377",
    ComponentKind.ELBOW: "#6c8cd5",
    ComponentKind.TEE: "#5cb88a",
    ComponentKind.VALVE: "#d56c6c",
    ComponentKind.TRANSITION: "#b07cd5",
    ComponentKind.DAMPER: "#d59a4f",
    ComponentKind.ERROR_MARKER: "#ef4444",
}


class GeometryFactory:
    """Produces :class:`SceneElement` objects from domain primitives."""

    def build_error_marker(self, marker_info: dict[str, Any], eid: str) -> SceneElement:
        pos = marker_info["position"]
        desc = marker_info["desc"]
        jno = marker_info["joint_no"]
        return SceneElement(
            id=eid,
            kind=ComponentKind.ERROR_MARKER,
            params={"position": list(pos.as_tuple())},
            color=_PALETTE[ComponentKind.ERROR_MARKER],
            user_data={
                "itemNo": f"ERR-{jno}",
                "jointNo": jno,
                "spec": "DRC 불일치 감지",
                "desc": desc,
                "description": desc,
            },
            joints=[],
        )

    def build_segment(self, run: Run, a: Node, b: Node, eid: str) -> SceneElement:
        """A straight run between two same-section nodes."""
        section = self._section_for(run, a)
        start, end = _trimmed_segment_points(run, a, b)
        trimmed_length = (end - start).length()
        if section.shape is DuctShape.ROUND:
            kind = (
                ComponentKind.PIPE_SEGMENT
                if run.mode.value == "pipe"
                else ComponentKind.DUCT_SEGMENT
            )
            params: ParamMap = {
                "start": list(start.as_tuple()),
                "end": list(end.as_tuple()),
                "radius": section.outer_diameter / 2.0,
                "direction": _unit_list(b.position - a.position),
            }
        else:
            kind = ComponentKind.DUCT_SEGMENT
            params = {
                "start": list(start.as_tuple()),
                "end": list(end.as_tuple()),
                "width": section.width,
                "height": section.height,
                "direction": _unit_list(b.position - a.position),
            }
        return SceneElement(
            id=eid,
            kind=kind,
            params=params,
            color=_PALETTE[kind],
            user_data=self._user_data(a, extra={"length_mm": str(
                round(trimmed_length, 1))}, run=run),
            joints=[
                _joint_port(eid, a, "start", start, _unit_list(a.position - b.position),
                            open_=a.fitting is None),
                _joint_port(eid, b, "end", end, _unit_list(b.position - a.position),
                            open_=b.fitting is None),
            ],
        )

    def build_transition(self, run: Run, a: Node, b: Node, eid: str) -> SceneElement:
        """A tapered duct transition between two different adjacent sections."""
        from_section = self._section_for(run, a)
        to_section = self._section_for(run, b)
        params: ParamMap = {
            "start": list(a.position.as_tuple()),
            "end": list(b.position.as_tuple()),
            "direction": _unit_list(b.position - a.position),
            **_section_params("from", from_section),
            **_section_params("to", to_section),
        }
        return SceneElement(
            id=eid,
            kind=ComponentKind.TRANSITION,
            params=params,
            color=_PALETTE[ComponentKind.TRANSITION],
            user_data=self._user_data(a, extra={"length_mm": str(
                round((b.position - a.position).length(), 1))}, run=run),
            joints=[
                _joint_port(eid, a, "start", a.position, _unit_list(a.position - b.position),
                            open_=a.fitting is None),
                _joint_port(eid, b, "end", b.position, _unit_list(b.position - a.position),
                            open_=b.fitting is None),
            ],
        )

    def build_fitting(
        self,
        run: Run,
        node: Node,
        eid: str,
        prev_node: Node | None = None,
        next_node: Node | None = None,
    ) -> SceneElement:
        """A fitting placed at a node (elbow/tee/valve/damper/transition)."""
        kind = node.fitting
        assert kind is not None
        section = self._section_for(run, node)
        in_dir = _direction(prev_node.position, node.position) if prev_node else None
        out_dir = _direction(node.position, next_node.position) if next_node else None
        primary = out_dir or in_dir or [1.0, 0.0, 0.0]
        radius = self._nominal_radius(section)
        params: ParamMap = {
            "position": list(node.position.as_tuple()),
            "radius": radius,
            "direction": primary,
        }
        roll_deg = _roll_degrees(node, section)
        params["rollDeg"] = roll_deg
        if in_dir:
            params["inDirection"] = in_dir
        if out_dir:
            params["outDirection"] = out_dir

        if kind is ComponentKind.ELBOW:
            if section.shape is DuctShape.ROUND:
                params["bendRadius"] = section.bend_radius or radius * 3.0
            else:
                params.update(_section_dims(section))
                params["bendRadius"] = max(section.width, section.height) * 0.9
        elif kind is ComponentKind.TEE:
            branch = _branch_direction(primary, in_dir, out_dir)
            if abs(roll_deg) > 1e-9:
                branch = _rotate_list(branch, primary, roll_deg)
            params.update({
                "mainDirection": primary,
                "branchDirection": branch,
                "runLength": max(radius * 5.0, 400.0),
                "branchLength": max(radius * 4.0, 300.0),
            })
            params.update(_section_dims(section))
        elif kind is ComponentKind.VALVE:
            params.update({
                "bodyLength": max(radius * 4.0, 250.0),
                "flangeRadius": radius * 1.25,
                "flangeThickness": max(radius * 0.28, 18.0),
                "handleRadius": radius * 1.35,
            })
        elif kind is ComponentKind.DAMPER:
            params.update(_section_dims(section))
            params.update({
                "bodyLength": max(radius * 3.0, 300.0),
                "bladeThickness": max(min(radius * 0.08, 30.0), 8.0),
            })
        elif kind is ComponentKind.TRANSITION:
            if next_node is not None:
                to_section = self._section_for(run, next_node)
                params.update({
                    "start": list(node.position.as_tuple()),
                    "end": list(next_node.position.as_tuple()),
                    "direction": _unit_list(next_node.position - node.position),
                    **_section_params("from", section),
                    **_section_params("to", to_section),
                })
            elif prev_node is not None:
                from_section = self._section_for(run, prev_node)
                params.update({
                    "start": list(prev_node.position.as_tuple()),
                    "end": list(node.position.as_tuple()),
                    "direction": _unit_list(node.position - prev_node.position),
                    **_section_params("from", from_section),
                    **_section_params("to", section),
                })
            else:
                half = max(radius * 2.0, 150.0)
                params.update({
                    "start": [node.position.x - half, node.position.y, node.position.z],
                    "end": [node.position.x + half, node.position.y, node.position.z],
                    **_section_params("from", section),
                    **_section_params("to", section),
                })
        else:
            params["radius"] = radius * _FITTING_SCALE.get(kind, 1.0)
        joints = _fitting_joints(eid, kind, node, radius, params, in_dir, out_dir)
        return SceneElement(
            id=eid,
            kind=kind,
            params=params,
            color=_PALETTE.get(kind, "#ffffff"),
            user_data=self._user_data(node, run=run),
            joints=joints,
        )

    # -- helpers --------------------------------------------------------------
    @staticmethod
    def _section_for(run: Run, node: Node) -> CrossSection:
        return node.section or run.section

    @staticmethod
    def _nominal_radius(section: CrossSection) -> float:
        if section.shape is DuctShape.ROUND:
            return section.outer_diameter / 2.0
        return max(section.width, section.height) / 2.0

    @staticmethod
    def _user_data(node: Node, extra: dict[str, str] | None = None, run: Run | None = None) -> dict[str, str]:
        from .catalog import get_part_family

        sec = node.section or (run.section if run else None)
        shape = sec.shape if sec else DuctShape.ROUND
        mode_str = run.mode.value if run else "pipe"
        family = get_part_family(node.fitting, shape, mode_str)

        data = {
            "itemNo": node.metadata.item_no or node.metadata.drawing_no or "",
            "drawingNo": node.metadata.drawing_no,
            "fittingNo": node.metadata.fitting_no,
            "jointNo": node.metadata.joint_no,
            "spec": node.metadata.spec,
            "partFamily": family.family_code,
            "familyName": family.family_name,
        }
        data.update(node.metadata.extra)
        if extra:
            data.update(extra)
        return data


# Visual oversize factor so uncatalogued fittings read clearly against the pipe radius.
_FITTING_SCALE: dict[ComponentKind, float] = {
    ComponentKind.ELBOW: 1.15,
    ComponentKind.TEE: 1.25,
    ComponentKind.VALVE: 1.6,
    ComponentKind.DAMPER: 1.4,
    ComponentKind.TRANSITION: 1.3,
}


def sections_match(a: CrossSection, b: CrossSection) -> bool:
    return (
        a.shape is b.shape
        and abs(a.outer_diameter - b.outer_diameter) < 1e-6
        and abs(a.width - b.width) < 1e-6
        and abs(a.height - b.height) < 1e-6
    )


def _direction(a: Vec3, b: Vec3) -> list[float]:
    return _unit_list(b - a)


def _trimmed_segment_points(run: Run, a: Node, b: Node) -> tuple[Vec3, Vec3]:
    """Return straight segment endpoints that stop at fitting connection faces.

    Input nodes represent fitting centerlines. If straight pipe/duct geometry is
    drawn all the way to those centers, it visually penetrates elbows, tees,
    valves and dampers. Trimming here keeps the backend-owned physical sizing
    contract: the frontend receives already-attachable endpoints.
    """
    span = b.position - a.position
    length = span.length()
    if length <= 1e-9:
        return a.position, b.position

    start_clearance = _fitting_clearance(run, a)
    end_clearance = _fitting_clearance(run, b)
    total_clearance = start_clearance + end_clearance
    # Keep a small visible straight piece even on very short runs.
    if total_clearance > length * 0.9 and total_clearance > 0:
        scale = (length * 0.9) / total_clearance
        start_clearance *= scale
        end_clearance *= scale

    unit = span.scaled(1 / length)
    return (
        a.position + unit.scaled(start_clearance),
        b.position - unit.scaled(end_clearance),
    )


def _fitting_clearance(run: Run, node: Node) -> float:
    """Distance from fitting center to straight-run connection face."""
    if node.fitting is None:
        return 0.0

    section = node.section or run.section
    radius = GeometryFactory._nominal_radius(section)
    kind = node.fitting

    if kind is ComponentKind.ELBOW:
        if section.shape is DuctShape.ROUND:
            return section.bend_radius or radius * 3.0
        return max(section.width, section.height) * 0.9
    if kind is ComponentKind.TEE:
        return max(radius * 5.0, 400.0) / 2.0
    if kind is ComponentKind.VALVE:
        body_length = max(radius * 4.0, 250.0)
        flange_thickness = max(radius * 0.28, 18.0)
        return body_length / 2.0 + flange_thickness / 2.0
    if kind is ComponentKind.DAMPER:
        return max(radius * 3.0, 300.0) / 2.0
    if kind is ComponentKind.TRANSITION:
        return max(radius * 2.0, 150.0)
    return radius * _FITTING_SCALE.get(kind, 1.0)


def _joint_base(node: Node) -> str:
    explicit = node.metadata.joint_no.strip()
    if explicit:
        return explicit
    # Stable fallback: same physical coordinate produces the same joint base.
    return f"J-{round(node.position.x)}-{round(node.position.y)}-{round(node.position.z)}"


def _joint_no(node: Node, role: str) -> str:
    jnos = node.metadata.joint_nos
    if jnos:
        if role in ("start", "in"):
            return jnos[0]
        if role in ("end", "out"):
            return jnos[1] if len(jnos) > 1 else jnos[0]
        if role == "branch":
            return jnos[2] if len(jnos) > 2 else jnos[-1]
        return jnos[0]
    # Fallback to base without appending unnecessary IN/OUT suffixes
    return _joint_base(node)


def _joint_port(
    eid: str,
    node: Node,
    role: str,
    position: Vec3,
    direction: list[float],
    open_: bool = False,
) -> JointPort:
    return JointPort(
        id=f"{eid}-{role}",
        no=_joint_no(node, role),
        position=list(position.as_tuple()),
        direction=direction,
        role=role,
        open=open_,
    )


def _fitting_joints(
    eid: str,
    kind: ComponentKind,
    node: Node,
    radius: float,
    params: ParamMap,
    in_dir: list[float] | None,
    out_dir: list[float] | None,
) -> list[JointPort]:
    center = node.position
    primary = _vec_from_list(params.get("direction", [1.0, 0.0, 0.0]))
    in_vec = _vec_from_list(in_dir) if in_dir else primary
    out_vec = _vec_from_list(out_dir) if out_dir else primary

    if kind is ComponentKind.ELBOW:
        bend = float(params.get("bendRadius", radius * 3.0))
        return [
            _joint_port(eid, node, "in", center - in_vec.scaled(bend), _unit_list(in_vec.scaled(-1))),
            _joint_port(eid, node, "out", center + out_vec.scaled(bend), _unit_list(out_vec)),
        ]

    if kind is ComponentKind.TEE:
        main = _vec_from_list(params.get("mainDirection", params.get("direction", [1.0, 0.0, 0.0])))
        branch = _vec_from_list(params.get("branchDirection", [0.0, 1.0, 0.0]))
        run_half = float(params.get("runLength", max(radius * 5.0, 400.0))) / 2.0
        branch_length = float(params.get("branchLength", max(radius * 4.0, 300.0)))
        return [
            _joint_port(eid, node, "in", center - main.scaled(run_half), _unit_list(main.scaled(-1))),
            _joint_port(eid, node, "out", center + main.scaled(run_half), _unit_list(main)),
            _joint_port(eid, node, "branch", center + branch.scaled(branch_length), _unit_list(branch)),
        ]

    if kind in (ComponentKind.VALVE, ComponentKind.DAMPER):
        if kind is ComponentKind.VALVE:
            half = float(params.get("bodyLength", max(radius * 4.0, 250.0))) / 2.0
            half += float(params.get("flangeThickness", max(radius * 0.28, 18.0))) / 2.0
        else:
            half = float(params.get("bodyLength", max(radius * 3.0, 300.0))) / 2.0
        return [
            _joint_port(eid, node, "in", center - primary.scaled(half), _unit_list(primary.scaled(-1))),
            _joint_port(eid, node, "out", center + primary.scaled(half), _unit_list(primary)),
        ]

    if kind is ComponentKind.TRANSITION:
        start_raw = params.get("start")
        end_raw = params.get("end")
        start = _vec_from_list(start_raw) if isinstance(start_raw, list) else center - primary.scaled(max(radius * 2.0, 150.0))
        end = _vec_from_list(end_raw) if isinstance(end_raw, list) else center + primary.scaled(max(radius * 2.0, 150.0))
        direction = _unit_list(end - start)
        return [
            _joint_port(eid, node, "in", start, _unit_list(_vec_from_list(direction).scaled(-1))),
            _joint_port(eid, node, "out", end, direction),
        ]

    scaled = radius * _FITTING_SCALE.get(kind, 1.0)
    return [
        _joint_port(eid, node, "in", center - primary.scaled(scaled), _unit_list(primary.scaled(-1))),
        _joint_port(eid, node, "out", center + primary.scaled(scaled), _unit_list(primary)),
    ]


def _vec_from_list(value: object) -> Vec3:
    if isinstance(value, list) and len(value) >= 3:
        return Vec3(float(value[0]), float(value[1]), float(value[2]))
    return Vec3(1.0, 0.0, 0.0)


def _unit_list(v: Vec3) -> list[float]:
    length = v.length()
    if length <= 1e-9:
        return [1.0, 0.0, 0.0]
    return [v.x / length, v.y / length, v.z / length]


def _branch_direction(
    primary: list[float],
    in_dir: list[float] | None,
    out_dir: list[float] | None,
) -> list[float]:
    if in_dir and out_dir:
        # At an actual corner, use the outgoing direction as the branch cue.
        dot = sum(in_dir[i] * out_dir[i] for i in range(3))
        if abs(dot) < 0.95:
            return out_dir
    # Fallback perpendicular in plan if no real branch leg is present in MVP input.
    x, y, z = primary
    candidate = [-y, x, 0.0]
    mag = (candidate[0] ** 2 + candidate[1] ** 2 + candidate[2] ** 2) ** 0.5
    if mag <= 1e-9:
        return [1.0, 0.0, 0.0]
    return [candidate[0] / mag, candidate[1] / mag, candidate[2] / mag]


def _roll_degrees(node: Node, section: CrossSection) -> float:
    raw = (
        node.metadata.extra.get("rotation")
        or node.metadata.extra.get("rotation_deg")
        or node.metadata.extra.get("angle")
        or node.metadata.extra.get("orientation")
        or 0
    )
    try:
        degrees = float(raw)
    except (TypeError, ValueError):
        degrees = 0.0
    if section.shape is DuctShape.RECTANGULAR:
        return round(degrees / 90.0) * 90.0
    return degrees


def _rotate_list(vector: list[float], axis: list[float], degrees: float) -> list[float]:
    rotated = _rotate_vec(_vec_from_list(vector), _vec_from_list(axis), degrees)
    return _unit_list(rotated)


def _rotate_vec(vector: Vec3, axis: Vec3, degrees: float) -> Vec3:
    axis_length = axis.length()
    if axis_length <= 1e-9 or abs(degrees) <= 1e-9:
        return vector
    k = axis.scaled(1 / axis_length)
    theta = math.radians(degrees)
    cos_t = math.cos(theta)
    sin_t = math.sin(theta)
    cross = Vec3(
        k.y * vector.z - k.z * vector.y,
        k.z * vector.x - k.x * vector.z,
        k.x * vector.y - k.y * vector.x,
    )
    dot = k.x * vector.x + k.y * vector.y + k.z * vector.z
    return (
        vector.scaled(cos_t)
        + cross.scaled(sin_t)
        + k.scaled(dot * (1 - cos_t))
    )


def _section_dims(section: CrossSection) -> ParamMap:
    if section.shape is DuctShape.ROUND:
        return {"radius": section.outer_diameter / 2.0}
    return {"width": section.width, "height": section.height}


def _section_params(prefix: str, section: CrossSection) -> ParamMap:
    if section.shape is DuctShape.ROUND:
        return {
            f"{prefix}Shape": "round",
            f"{prefix}Radius": section.outer_diameter / 2.0,
            f"{prefix}Width": 0.0,
            f"{prefix}Height": 0.0,
        }
    return {
        f"{prefix}Shape": "rectangular",
        f"{prefix}Radius": 0.0,
        f"{prefix}Width": section.width,
        f"{prefix}Height": section.height,
    }
