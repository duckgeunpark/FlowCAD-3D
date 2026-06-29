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
    # Piece model: seg1 keeps its full 2000 length (end at x=2000), the elbow then
    # occupies one leg (bend=150) to its corner at x=2150 and a second leg up to the
    # out-face at [2150, 150], and seg3 runs its full 1500 north from there.
    seg2 = next(e for e in scene.elements if e.id == "A3")
    assert seg2.params["direction"] == pytest.approx([0.0, 1.0, 0.0])
    assert seg2.params["start"] == pytest.approx([2150.0, 150.0, 0.0])
    assert seg2.params["end"] == pytest.approx([2150.0, 1650.0, 0.0])


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


def test_rect_duct_elbow_bend_radius_is_half_width(service: GenerationService) -> None:
    """BNPP HVAC standard: rectangular duct elbow centerline radius R = W/2 (UNO)."""
    rows = [
        {"seq": 1, "system_type": "duct", "part_type": "straight",
         "size_a": 600, "size_b": 300, "length": 2000, "connect_port": "start"},
        {"seq": 2, "system_type": "duct", "part_type": "elbow", "angle": 90,
         "connect_to_seq": 1, "connect_port": "end"},
        {"seq": 3, "system_type": "duct", "part_type": "straight",
         "length": 1500, "connect_to_seq": 2, "connect_port": "out"},
    ]
    scene = service.generate(DesignMode.DUCT, rows)
    elbow = next(e for e in scene.elements if e.kind is ComponentKind.ELBOW)
    # Throat radius R = W/2 (=300) -> centerline bend radius = W = 600,
    # independent of the (smaller) height.
    assert elbow.params["bendRadius"] == pytest.approx(600.0)
    assert elbow.params["width"] == pytest.approx(600.0)
    assert elbow.params["height"] == pytest.approx(300.0)


def test_rect_duct_elbow_supports_45_degree_turn(service: GenerationService) -> None:
    """A 45° duct elbow turns the downstream run 45° and keeps the R=W/2 radius."""
    rows = [
        {"seq": 1, "system_type": "duct", "part_type": "straight",
         "size_a": 400, "size_b": 250, "length": 1000, "connect_port": "start"},
        {"seq": 2, "system_type": "duct", "part_type": "elbow", "angle": 45,
         "connect_to_seq": 1, "connect_port": "end"},
        {"seq": 3, "system_type": "duct", "part_type": "straight",
         "length": 1000, "connect_to_seq": 2, "connect_port": "out"},
    ]
    scene = service.generate(DesignMode.DUCT, rows)
    elbow = next(e for e in scene.elements if e.kind is ComponentKind.ELBOW)
    assert elbow.params["bendRadius"] == pytest.approx(400.0)  # centerline = W (throat W/2)
    seg = next(e for e in scene.elements if e.id == "A3")
    inv = 2 ** 0.5 / 2
    assert seg.params["direction"] == pytest.approx([inv, inv, 0.0], abs=1e-6)


def test_piece_model_straight_keeps_full_length_elbow_adds_arc(
    service: GenerationService,
) -> None:
    """Straights render at their authored length (no trim); the elbow is a
    separate piece whose length is its developed centerline arc."""
    import math

    rows = [
        {"seq": 1, "system_type": "pipe", "part_type": "straight", "size_a": 100,
         "length": 1500, "connect_port": "start"},
        {"seq": 2, "system_type": "pipe", "part_type": "elbow", "angle": 90,
         "connect_to_seq": 1, "connect_port": "end"},
    ]
    scene = service.generate(DesignMode.PIPE, rows)
    straight = next(e for e in scene.elements if e.id == "A1")
    # Full authored length, not trimmed back into the elbow.
    assert straight.params["start"] == pytest.approx([0.0, 0.0, 0.0])
    assert straight.params["end"] == pytest.approx([1500.0, 0.0, 0.0])
    straight_bom = next(b for b in scene.bom if b.element_id == "A1")
    assert straight_bom.length_mm == pytest.approx(1500.0)

    # Elbow length = R_centerline * turn angle. For OD 100, leg = bend_radius = 150,
    # 90° turn -> R_centerline = 150, arc = 150 * (π/2).
    elbow_bom = next(b for b in scene.bom if b.element_id == "A2")
    assert elbow_bom.length_mm == pytest.approx(150.0 * math.pi / 2.0, abs=0.5)

    # The straight's end joint meets the elbow's in joint (joint-to-joint).
    elbow = next(e for e in scene.elements if e.id == "A2")
    in_joint = next(j for j in elbow.joints if j.role == "in")
    end_joint = next(j for j in straight.joints if j.role == "end")
    assert list(end_joint.position) == pytest.approx(list(in_joint.position))
    assert end_joint.no == in_joint.no  # share one number -> resolved as connected


def test_side_tap_branches_main_without_splitting_it(
    service: GenerationService,
) -> None:
    """A duct branch taps the side of a continuous main straight (HVAC branching):
    the main stays whole, the branch starts on its side surface, and the two share
    a joint so the branch reads as connected."""
    rows = [
        {"seq": 1, "system_type": "duct", "part_type": "straight",
         "size_a": 500, "size_b": 300, "length": 2000, "connect_port": "start"},
        {"seq": 2, "system_type": "duct", "part_type": "straight",
         "size_a": 300, "size_b": 200, "length": 800, "angle": 90,
         "connect_to_seq": 1, "connect_port": "tap@0.5"},
    ]
    scene = service.generate(DesignMode.DUCT, rows)
    main = next(e for e in scene.elements if e.id == "A1")
    branch = next(e for e in scene.elements if e.id == "A2")
    # Main stays one continuous straight 0..2000 (not split by the branch).
    assert main.params["start"] == pytest.approx([0.0, 0.0, 0.0])
    assert main.params["end"] == pytest.approx([2000.0, 0.0, 0.0])
    # Branch starts on the main's side surface at mid-length (width/2 = 250 offset).
    bstart = next(j for j in branch.joints if j.role == "start")
    assert list(bstart.position) == pytest.approx([1000.0, 250.0, 0.0])
    # The main exposes a matching tap joint there -> branch reads as connected.
    tap = next(j for j in main.joints if j.role == "tap")
    assert list(tap.position) == pytest.approx(list(bstart.position))
    assert tap.no == bstart.no
    assert not bstart.open


def test_tee_branch_child_joint_meets_branch_joint(service: GenerationService) -> None:
    """A straight hung off a tee's branch must start exactly at the tee's branch
    joint (not float inside toward the tee center)."""
    rows = [
        {"seq": 1, "system_type": "pipe", "part_type": "straight", "size_a": 100,
         "length": 2000, "connect_port": "start"},
        {"seq": 2, "system_type": "pipe", "part_type": "tee", "size_a": 100,
         "connect_to_seq": 1, "connect_port": "end"},
        {"seq": 3, "system_type": "pipe", "part_type": "straight", "length": 1500,
         "connect_to_seq": 2, "connect_port": "out"},
        {"seq": 4, "system_type": "pipe", "part_type": "straight", "length": 1000,
         "connect_to_seq": 2, "connect_port": "branch"},
    ]
    scene = service.generate(DesignMode.PIPE, rows)
    tee = next(e for e in scene.elements if e.kind is ComponentKind.TEE)
    branch_joint = next(j for j in tee.joints if j.role == "branch")
    branch_seg = next(e for e in scene.elements if e.id == "A4")
    seg_start = next(j for j in branch_seg.joints if j.role == "start")
    assert list(seg_start.position) == pytest.approx(list(branch_joint.position))

    # The main-run child still meets the tee's out joint (unchanged behaviour).
    out_joint = next(j for j in tee.joints if j.role == "out")
    main_seg = next(e for e in scene.elements if e.id == "A3")
    main_start = next(j for j in main_seg.joints if j.role == "start")
    assert list(main_start.position) == pytest.approx(list(out_joint.position))


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


def test_inline_valve_mates_flush_with_neighbour_pipes(service: GenerationService) -> None:
    """A straight->valve->straight chain must leave no gap at either valve face."""
    rows = [
        {"seq": 1, "system_type": "pipe", "part_type": "straight", "size_a": 100, "length": 1000},
        {"seq": 2, "system_type": "pipe", "part_type": "valve",
         "connect_to_seq": 1, "connect_port": "end"},
        {"seq": 3, "system_type": "pipe", "part_type": "straight", "size_a": 100, "length": 1000,
         "connect_to_seq": 2, "connect_port": "out"},
    ]
    scene = service.generate(DesignMode.PIPE, rows)
    seg_in = next(e for e in scene.elements if e.id == "A1")
    valve = next(e for e in scene.elements if e.id == "A2")
    seg_out = next(e for e in scene.elements if e.id == "A3")

    valve_in = next(j for j in valve.joints if j.role == "in").position
    valve_out = next(j for j in valve.joints if j.role == "out").position
    # upstream pipe ends exactly on the valve inlet face; downstream starts on outlet
    assert seg_in.params["end"] == pytest.approx(valve_in)
    assert seg_out.params["start"] == pytest.approx(valve_out)


def test_unknown_connect_target_emits_error_marker(service: GenerationService) -> None:
    rows = [
        {"seq": 1, "system_type": "pipe", "part_type": "straight", "size_a": 100, "length": 1000},
        {"seq": 2, "system_type": "pipe", "part_type": "straight", "size_a": 100, "length": 1000,
         "connect_to_seq": 99, "connect_port": "end"},
    ]
    scene = service.generate(DesignMode.PIPE, rows)
    markers = [e for e in scene.elements if e.kind is ComponentKind.ERROR_MARKER]
    assert markers and "찾을 수 없음" in markers[0].user_data["desc"]


def test_duplicate_seq_is_rejected(service: GenerationService) -> None:
    rows = [
        {"seq": 1, "system_type": "pipe", "part_type": "straight", "size_a": 100, "length": 1000},
        {"seq": 1, "system_type": "pipe", "part_type": "straight", "size_a": 100, "length": 1000},
    ]
    with pytest.raises(AssemblyError):
        service.generate(DesignMode.PIPE, rows)


def test_elbow_turn_does_not_leak_into_roll(service: GenerationService) -> None:
    rows = [
        {"seq": 1, "system_type": "pipe", "part_type": "straight", "size_a": 100, "length": 1000},
        {"seq": 2, "system_type": "pipe", "part_type": "elbow", "angle": 90,
         "connect_to_seq": 1, "connect_port": "end"},
    ]
    scene = service.generate(DesignMode.PIPE, rows)
    elbow = next(e for e in scene.elements if e.kind is ComponentKind.ELBOW)
    assert elbow.params["rollDeg"] == pytest.approx(0.0)


def test_negative_elbow_angle_turns_the_other_way(service: GenerationService) -> None:
    rows = [
        {"seq": 1, "system_type": "pipe", "part_type": "straight", "size_a": 100, "length": 1000},
        {"seq": 2, "system_type": "pipe", "part_type": "elbow", "angle": -90,
         "connect_to_seq": 1, "connect_port": "end"},
        {"seq": 3, "system_type": "pipe", "part_type": "straight", "length": 1000,
         "connect_to_seq": 2, "connect_port": "out"},
    ]
    scene = service.generate(DesignMode.PIPE, rows)
    seg = next(e for e in scene.elements if e.id == "A3")
    assert seg.params["direction"] == pytest.approx([0.0, -1.0, 0.0])


def test_direction_vector_form_is_accepted(service: GenerationService) -> None:
    rows = [
        {"seq": 1, "system_type": "pipe", "part_type": "straight", "size_a": 100,
         "length": 1000, "direction": "1,0,1"},
    ]
    scene = service.generate(DesignMode.PIPE, rows)
    seg = next(e for e in scene.elements if e.kind is ComponentKind.PIPE_SEGMENT)
    inv = 1000 * (2 ** 0.5 / 2)
    assert seg.params["end"] == pytest.approx([inv, 0.0, inv], abs=1e-6)


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
