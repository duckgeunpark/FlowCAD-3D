"""Plan_v2 assembly engine tests: coordinate-free, angle-driven auto-routing."""
from __future__ import annotations

import pytest

from app.domain.enums import ComponentKind, DesignMode
from app.engine.assembly import AssemblyError, is_assembly_input
from app.services.generation_service import GenerationService
from app.specs.repository import InMemorySpecRepository


@pytest.fixture()
def service() -> GenerationService:
    return GenerationService(specs=InMemorySpecRepository())


def _kinds(scene) -> list[ComponentKind]:
    return [e.kind for e in scene.elements]


def _codes(scene) -> list[str]:
    return [d.code for d in scene.diagnostics]


def _diag_by_code(scene, code: str):
    return next(d for d in scene.diagnostics if d.code == code)


# --------------------------------------------------------------------------- #
# Routing
# --------------------------------------------------------------------------- #
def test_part_type_routes_to_assembly_engine() -> None:
    assert is_assembly_input([{"seq": 1, "part_type": "straight"}]) is True
    assert is_assembly_input([{"seq": 1, "fitting": "elbow"}]) is False
    assert is_assembly_input([{"seq": 1, "part_type": ""}]) is False


def test_legacy_rows_bypass_assembly_engine(service: GenerationService) -> None:
    """Rows without part_type keep using the original vertex-model parser."""
    rows = [
        {"run_id": "R1", "seq": 1, "x": 0, "y": 0, "z": 0, "nominal": "100A", "schedule": "Sch40"},
        {"run_id": "R1", "seq": 2, "x": 1000, "y": 0, "z": 0, "nominal": "100A", "schedule": "Sch40"},
    ]
    scene = service.generate(DesignMode.PIPE, rows)
    assert _kinds(scene).count(ComponentKind.PIPE_SEGMENT) == 1


# --------------------------------------------------------------------------- #
# Core Plan_v2 promise: no coordinates, no direction — just angle + topology
# --------------------------------------------------------------------------- #
def test_straight_elbow_straight_auto_routes_by_angle(service: GenerationService) -> None:
    rows = [
        {"seq": 1, "system_type": "pipe", "part_type": "straight", "size_a": 100,
         "length": 2000, "connect_to_seq": "", "connect_port": "start"},
        {"seq": 2, "system_type": "pipe", "part_type": "elbow", "angle": 90,
         "connect_to_seq": 1, "connect_port": "end"},
        {"seq": 3, "system_type": "pipe", "part_type": "straight",
         "length": 1500, "connect_to_seq": 2, "connect_port": "out"},
    ]
    scene = service.generate(DesignMode.PIPE, rows)
    kinds = _kinds(scene)
    assert kinds.count(ComponentKind.PIPE_SEGMENT) == 2
    assert ComponentKind.ELBOW in kinds

    elbow = next(e for e in scene.elements if e.kind is ComponentKind.ELBOW)
    assert elbow.params["inDirection"] == pytest.approx([1.0, 0.0, 0.0])
    assert elbow.params["outDirection"] == pytest.approx([0.0, 1.0, 0.0])

    # The third part inherits Ø from seq1 and turns north purely from the angle.
    seg2 = next(e for e in scene.elements if e.id == "A3")
    assert seg2.params["direction"] == pytest.approx([0.0, 1.0, 0.0])
    assert seg2.params["end"] == pytest.approx([2000.0, 1500.0, 0.0])


def test_elbow_45_turns_45_degrees(service: GenerationService) -> None:
    rows = [
        {"seq": 1, "system_type": "pipe", "part_type": "straight", "size_a": 100, "length": 1000},
        {"seq": 2, "system_type": "pipe", "part_type": "elbow", "angle": 45,
         "connect_to_seq": 1, "connect_port": "end"},
        {"seq": 3, "system_type": "pipe", "part_type": "straight", "length": 1000,
         "connect_to_seq": 2, "connect_port": "out"},
    ]
    scene = service.generate(DesignMode.PIPE, rows)
    seg2 = next(e for e in scene.elements if e.id == "A3")
    inv = 2 ** 0.5 / 2
    assert seg2.params["direction"] == pytest.approx([inv, inv, 0.0], abs=1e-6)


def test_direction_override_takes_precedence(service: GenerationService) -> None:
    rows = [
        {"seq": 1, "system_type": "pipe", "part_type": "straight", "size_a": 100,
         "length": 1000, "direction": "U"},
    ]
    scene = service.generate(DesignMode.PIPE, rows)
    seg = next(e for e in scene.elements if e.kind is ComponentKind.PIPE_SEGMENT)
    assert seg.params["end"] == pytest.approx([0.0, 0.0, 1000.0])


# --------------------------------------------------------------------------- #
# Connection rule engine (Plan_v2 검증 포인트)
# --------------------------------------------------------------------------- #
def test_same_diameter_connection_has_no_error(service: GenerationService) -> None:
    rows = [
        {"seq": 1, "system_type": "pipe", "part_type": "straight", "size_a": 100, "length": 1000},
        {"seq": 2, "system_type": "pipe", "part_type": "straight", "size_a": 100,
         "length": 1000, "connect_to_seq": 1, "connect_port": "end"},
    ]
    scene = service.generate(DesignMode.PIPE, rows)
    assert ComponentKind.ERROR_MARKER not in _kinds(scene)


def test_diameter_mismatch_raises_error_marker(service: GenerationService) -> None:
    rows = [
        {"seq": 1, "system_type": "pipe", "part_type": "straight", "size_a": 100, "length": 1000},
        {"seq": 2, "system_type": "pipe", "part_type": "straight", "size_a": 150,
         "length": 1000, "connect_to_seq": 1, "connect_port": "end"},
    ]
    scene = service.generate(DesignMode.PIPE, rows)
    assert ComponentKind.ERROR_MARKER in _kinds(scene)


def test_rect_duct_dimension_mismatch_raises_error_marker(service: GenerationService) -> None:
    rows = [
        {"seq": 1, "system_type": "duct", "part_type": "straight",
         "size_a": 400, "size_b": 300, "length": 1000},
        {"seq": 2, "system_type": "duct", "part_type": "straight",
         "size_a": 500, "size_b": 300, "length": 1000,
         "connect_to_seq": 1, "connect_port": "end"},
    ]
    scene = service.generate(DesignMode.DUCT, rows)
    assert ComponentKind.ERROR_MARKER in _kinds(scene)


def test_round_duct_same_diameter_ok(service: GenerationService) -> None:
    rows = [
        {"seq": 1, "system_type": "duct", "part_type": "straight",
         "shape": "round", "size_a": 350, "length": 1000},
        {"seq": 2, "system_type": "duct", "part_type": "straight",
         "shape": "round", "size_a": 350, "length": 1000,
         "connect_to_seq": 1, "connect_port": "end"},
    ]
    scene = service.generate(DesignMode.DUCT, rows)
    assert ComponentKind.ERROR_MARKER not in _kinds(scene)


def test_reducer_bridges_sizes_without_error(service: GenerationService) -> None:
    rows = [
        {"seq": 1, "system_type": "pipe", "part_type": "straight", "size_a": 100, "length": 1000},
        {"seq": 2, "system_type": "pipe", "part_type": "reducer", "size_a": 80, "length": 300,
         "connect_to_seq": 1, "connect_port": "end"},
        {"seq": 3, "system_type": "pipe", "part_type": "straight", "size_a": 80, "length": 1000,
         "connect_to_seq": 2, "connect_port": "end"},
    ]
    scene = service.generate(DesignMode.PIPE, rows)
    assert ComponentKind.ERROR_MARKER not in _kinds(scene)
    transition = next(e for e in scene.elements if e.kind is ComponentKind.TRANSITION)
    assert transition.params["fromRadius"] == pytest.approx(50.0)
    assert transition.params["toRadius"] == pytest.approx(40.0)


def test_rect_to_round_duct_transition(service: GenerationService) -> None:
    rows = [
        {"seq": 1, "system_type": "duct", "part_type": "straight",
         "size_a": 400, "size_b": 300, "length": 1000},
        {"seq": 2, "system_type": "duct", "part_type": "transition",
         "shape": "round", "size_a": 350, "length": 500,
         "connect_to_seq": 1, "connect_port": "end"},
        {"seq": 3, "system_type": "duct", "part_type": "straight",
         "shape": "round", "size_a": 350, "length": 1000,
         "connect_to_seq": 2, "connect_port": "end"},
    ]
    scene = service.generate(DesignMode.DUCT, rows)
    assert ComponentKind.ERROR_MARKER not in _kinds(scene)
    transition = next(e for e in scene.elements if e.kind is ComponentKind.TRANSITION)
    assert transition.params["fromShape"] == "rectangular"
    assert transition.params["toShape"] == "round"


# --------------------------------------------------------------------------- #
# Tee branch ports
# --------------------------------------------------------------------------- #
def test_tee_exposes_three_ports(service: GenerationService) -> None:
    rows = [
        {"seq": 1, "system_type": "pipe", "part_type": "straight", "size_a": 100, "length": 1000},
        {"seq": 2, "system_type": "pipe", "part_type": "tee",
         "connect_to_seq": 1, "connect_port": "end"},
        {"seq": 3, "system_type": "pipe", "part_type": "straight", "size_a": 100, "length": 1000,
         "connect_to_seq": 2, "connect_port": "out"},
        {"seq": 4, "system_type": "pipe", "part_type": "straight", "size_a": 100, "length": 800,
         "connect_to_seq": 2, "connect_port": "branch"},
    ]
    scene = service.generate(DesignMode.PIPE, rows)
    tee = next(e for e in scene.elements if e.kind is ComponentKind.TEE)
    assert {j.role for j in tee.joints} == {"in", "out", "branch"}
    # branch leg leaves the tee corner perpendicular to the main run
    branch_seg = next(e for e in scene.elements if e.id == "A4")
    assert branch_seg.params["direction"][2] == pytest.approx(0.0)
    assert abs(branch_seg.params["direction"][1]) == pytest.approx(1.0)


def test_disconnected_runs_do_not_overlap(service: GenerationService) -> None:
    rows = [
        {"seq": 1, "system_type": "pipe", "part_type": "straight", "size_a": 100, "length": 1000},
        {"seq": 2, "system_type": "pipe", "part_type": "straight", "size_a": 100, "length": 1000},
    ]
    scene = service.generate(DesignMode.PIPE, rows)
    seg1 = next(e for e in scene.elements if e.id == "A1")
    seg2 = next(e for e in scene.elements if e.id == "A2")
    assert seg1.params["start"][1] != seg2.params["start"][1]


def test_bom_has_one_row_per_element(service: GenerationService) -> None:
    rows = [
        {"seq": 1, "system_type": "pipe", "part_type": "straight", "size_a": 100,
         "length": 2000, "item_no": "P-1", "drawing_no": "DWG-01"},
        {"seq": 2, "system_type": "pipe", "part_type": "elbow", "angle": 90,
         "connect_to_seq": 1, "connect_port": "end", "fitting_no": "FIT-01"},
        {"seq": 3, "system_type": "pipe", "part_type": "straight", "length": 1500,
         "connect_to_seq": 2, "connect_port": "out"},
    ]
    scene = service.generate(DesignMode.PIPE, rows)
    assert len(scene.bom) == len(scene.elements)
    assert any(r.fitting_no == "FIT-01" for r in scene.bom)


# --------------------------------------------------------------------------- #
# Structured diagnostics (Plan_v2 §사용성): row-tied reason + recommended fix
# --------------------------------------------------------------------------- #
def test_valid_connection_emits_no_error_diagnostics(service: GenerationService) -> None:
    rows = [
        {"seq": 1, "system_type": "pipe", "part_type": "straight", "size_a": 100, "length": 1000},
        {"seq": 2, "system_type": "pipe", "part_type": "straight", "size_a": 100,
         "length": 1000, "connect_to_seq": 1, "connect_port": "end"},
    ]
    scene = service.generate(DesignMode.PIPE, rows)
    assert [d for d in scene.diagnostics if d.level == "error"] == []


def test_diameter_mismatch_emits_diagnostic(service: GenerationService) -> None:
    rows = [
        {"seq": 1, "system_type": "pipe", "part_type": "straight", "size_a": 100, "length": 1000},
        {"seq": 2, "system_type": "pipe", "part_type": "straight", "size_a": 150,
         "length": 1000, "connect_to_seq": 1, "connect_port": "end"},
    ]
    scene = service.generate(DesignMode.PIPE, rows)
    diag = _diag_by_code(scene, "DIAMETER_MISMATCH")
    assert diag.level == "error"
    assert diag.seq == "2"  # the offending (child) row is flagged
    assert diag.suggestion  # a recommended fix is offered
    assert diag.position is not None  # has a 3D anchor → also gets an error marker


def test_rect_section_mismatch_emits_diagnostic(service: GenerationService) -> None:
    rows = [
        {"seq": 1, "system_type": "duct", "part_type": "straight",
         "size_a": 400, "size_b": 300, "length": 1000},
        {"seq": 2, "system_type": "duct", "part_type": "straight",
         "size_a": 500, "size_b": 300, "length": 1000,
         "connect_to_seq": 1, "connect_port": "end"},
    ]
    scene = service.generate(DesignMode.DUCT, rows)
    diag = _diag_by_code(scene, "SECTION_MISMATCH")
    assert diag.level == "error"
    assert diag.seq == "2"


def test_shape_mismatch_emits_diagnostic(service: GenerationService) -> None:
    """Round abutting rectangular without a transition is flagged as a shape error."""
    rows = [
        {"seq": 1, "system_type": "duct", "part_type": "straight",
         "shape": "round", "size_a": 350, "length": 1000},
        {"seq": 2, "system_type": "duct", "part_type": "straight",
         "size_a": 400, "size_b": 300, "length": 1000,
         "connect_to_seq": 1, "connect_port": "end"},
    ]
    scene = service.generate(DesignMode.DUCT, rows)
    diag = _diag_by_code(scene, "SHAPE_MISMATCH")
    assert diag.level == "error"
    assert "transition" in diag.suggestion.lower() or "변환관" in diag.suggestion


def test_missing_target_emits_error_diagnostic(service: GenerationService) -> None:
    rows = [
        {"seq": 1, "system_type": "pipe", "part_type": "straight", "size_a": 100, "length": 1000},
        {"seq": 2, "system_type": "pipe", "part_type": "straight", "size_a": 100,
         "length": 1000, "connect_to_seq": 99, "connect_port": "end"},  # seq 99 missing
    ]
    scene = service.generate(DesignMode.PIPE, rows)
    diag = _diag_by_code(scene, "MISSING_TARGET")
    assert diag.level == "error"
    assert diag.seq == "2"


def test_inherited_spec_emits_info_diagnostic(service: GenerationService) -> None:
    """A sizeless follow-on part inherits its parent's section and says so (info)."""
    rows = [
        {"seq": 1, "system_type": "pipe", "part_type": "straight", "size_a": 100, "length": 1000},
        {"seq": 2, "system_type": "pipe", "part_type": "straight", "length": 1000,
         "connect_to_seq": 1, "connect_port": "end"},  # no size → inherits Ø100
    ]
    scene = service.generate(DesignMode.PIPE, rows)
    diag = _diag_by_code(scene, "SPEC_INHERITED")
    assert diag.level == "info"
    assert diag.seq == "2"
    assert ComponentKind.ERROR_MARKER not in _kinds(scene)  # info is non-blocking


def test_error_diagnostics_match_error_markers(service: GenerationService) -> None:
    """Every error marker in the 3D scene has a backing error-level diagnostic."""
    rows = [
        {"seq": 1, "system_type": "pipe", "part_type": "straight", "size_a": 100, "length": 1000},
        {"seq": 2, "system_type": "pipe", "part_type": "straight", "size_a": 150,
         "length": 1000, "connect_to_seq": 1, "connect_port": "end"},
    ]
    scene = service.generate(DesignMode.PIPE, rows)
    markers = _kinds(scene).count(ComponentKind.ERROR_MARKER)
    anchored_errors = [
        d for d in scene.diagnostics if d.level == "error" and d.position is not None
    ]
    assert markers == len(anchored_errors)
    assert markers >= 1
