"""터미널 라벨링 도구 상태 기계 테스트 — 키 입력 → 라벨·이동·저장."""

from eval.golden import SKIP
from eval.label import LabelSession


# ── 라벨링 상태 기계 ──────────────────────────────────────────────────────────

def _session(labels: list[str], start=None):
    rows = [{"post_id": i + 1, "label": lbl, "ambiguous": False} for i, lbl in enumerate(labels)]
    saves: list[list[dict]] = []
    s = LabelSession(rows, save=lambda r: saves.append([dict(x) for x in r]), start=start)
    return s, saves


def test_resume_starts_at_first_unlabeled():
    s, _ = _session(["positive", "neutral", "", ""])
    assert s.idx == 2


def test_number_keys_label_save_and_advance():
    s, saves = _session(["", "", ""])
    assert s.handle("2") == "labeled"
    assert s.handle("1") == "labeled"
    assert [r["label"] for r in s.rows] == ["negative", "positive", ""]
    assert s.idx == 2
    assert len(saves) == 2  # 입력마다 즉시 저장


def test_skip_back_and_relabel():
    s, _ = _session(["", ""])
    assert s.handle("s") == "skipped"
    assert s.rows[0]["label"] == SKIP
    assert s.handle("b") == "back" and s.idx == 0
    assert s.handle("3") == "labeled"
    assert s.rows[0]["label"] == "neutral" and s.idx == 1


def test_ambiguous_toggle_stays_on_item():
    s, saves = _session(["", ""])
    assert s.handle("?") == "ambiguous_on"
    assert s.idx == 0 and s.rows[0]["ambiguous"] is True
    assert s.handle("1") == "labeled"
    assert s.rows[0] == {"post_id": 1, "label": "positive", "ambiguous": True}
    assert len(saves) == 2


def test_back_at_start_and_unknown_key_are_safe():
    s, saves = _session(["", ""])
    assert s.handle("b") == "back" and s.idx == 0
    assert s.handle("x") == "invalid"
    assert s.handle("n") == "next" and s.idx == 1
    assert saves == []


def test_done_after_last_item_and_back_reopens():
    s, _ = _session(["positive", ""])
    s.handle("2")
    assert s.done
    assert s.handle("1") == "invalid"
    s.handle("b")
    assert not s.done and s.current["post_id"] == 2


def test_quit_keys():
    s, _ = _session([""])
    assert s.handle("q") == "quit"
    assert s.handle("\x03") == "quit"  # Ctrl-C (raw 모드)
