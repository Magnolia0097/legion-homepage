"""골든셋 추출·라벨링 도구 테스트 — DB·터미널 없이 순수 로직만."""

from collections import Counter
from unittest.mock import patch

import pytest

from eval import golden
from eval.golden import (
    FrameRow,
    allocate,
    period_of,
    read_manifest,
    stratified_sample,
    write_manifest,
)
from eval.sample_golden import build_frame


def _frame(spec: dict[tuple[str, str], int]) -> list[FrameRow]:
    rows, pid = [], 1
    for (board, period), count in spec.items():
        for _ in range(count):
            rows.append(FrameRow(post_id=pid, board=board, period=period))
            pid += 1
    return rows


# ── 층화 추출 ─────────────────────────────────────────────────────────────────

def test_period_uses_kst_boundary():
    # UTC 9/30 15:00 = KST 10/1 00:00 → 10월 층
    assert period_of("2026-09-30T15:00:00+00:00") == "2026-10"
    assert period_of("2026-09-30T14:59:59Z") == "2026-09"


def test_allocate_is_proportional_and_sums_to_n():
    sizes = {("자유", "2026-08"): 700, ("검성", "2026-08"): 200, ("궁성", "2026-08"): 100}
    alloc = allocate(sizes, 300)
    assert alloc == {("자유", "2026-08"): 210, ("검성", "2026-08"): 60, ("궁성", "2026-08"): 30}


def test_allocate_largest_remainder_rounding():
    sizes = {("a", "m"): 1, ("b", "m"): 1, ("c", "m"): 1}
    alloc = allocate(sizes, 2)
    assert sum(alloc.values()) == 2
    assert sorted(alloc.values()) == [0, 1, 1]


def test_allocate_rejects_sample_larger_than_population():
    with pytest.raises(ValueError):
        allocate({("a", "m"): 5}, 6)


def test_sample_is_deterministic_for_same_seed():
    frame = _frame({("자유", "2026-07"): 500, ("검성", "2026-08"): 120, ("궁성", "2026-09"): 80})
    a, meta_a = stratified_sample(frame, 300, seed=7)
    b, meta_b = stratified_sample(list(reversed(frame)), 300, seed=7)  # 입력 순서 무관
    assert a == b and meta_a == meta_b
    c, _ = stratified_sample(frame, 300, seed=8)
    assert set(a) != set(c)


def test_sample_respects_strata_and_has_no_duplicates():
    spec = {("자유", "2026-07"): 500, ("검성", "2026-08"): 120, ("궁성", "2026-09"): 80}
    frame = _frame(spec)
    picked, meta = stratified_sample(frame, 70, seed=1)
    assert len(picked) == len(set(picked)) == 70
    stratum_of = {r.post_id: r.stratum for r in frame}
    assert Counter(stratum_of[p] for p in picked) == {
        ("자유", "2026-07"): 50, ("검성", "2026-08"): 12, ("궁성", "2026-09"): 8,
    }
    assert {(s["board"], s["period"]): s["population"] for s in meta["strata"]} == spec


def test_stratum_sample_independent_of_other_strata():
    """층별 시드 덕분에 다른 층 구성이 바뀌어도, 배분 수가 같으면 그 층의 표본은 그대로."""
    x = [FrameRow(post_id=i, board="자유", period="2026-07") for i in range(1, 101)]
    y = [FrameRow(post_id=1000 + i, board="검성", period="2026-08") for i in range(100)]
    z = [FrameRow(post_id=2000 + i, board="궁성", period="2026-09") for i in range(300)]
    picked_a, _ = stratified_sample(x + y, 20, seed=3)   # 자유 10건
    picked_b, _ = stratified_sample(x + z, 40, seed=3)   # 자유 10건
    in_x = lambda ids: sorted(i for i in ids if i <= 100)  # noqa: E731
    assert len(in_x(picked_a)) == 10
    assert in_x(picked_a) == in_x(picked_b)


def test_build_frame_excludes_spam_and_never_reads_predictions():
    rows = [
        {"id": 1, "title": "검성 상향 패치 이후 체감 어떠신가요 다들", "body": None,
         "board_name": "검성", "posted_at": "2026-08-01T00:00:00+00:00"},
        {"id": 2, "title": "짧음", "body": None,  # 15자 미만 → 스팸
         "board_name": "자유", "posted_at": "2026-08-01T00:00:00+00:00"},
        {"id": 3, "title": "보드 정보 없는 예전 수집분 게시글 제목입니다", "body": None,
         "board_name": None, "posted_at": "2026-05-01T00:00:00+00:00"},
    ]
    frame, texts, spam = build_frame(rows)
    assert spam == 1
    assert [r.post_id for r in frame] == [1, 3]
    assert frame[1].board == golden.UNKNOWN_BOARD
    assert all(not hasattr(r, "sentiment") for r in frame)
    assert "author" not in texts[1] and "url" not in texts[1]


# ── 매니페스트 입출력 (커밋 대상 파일) ─────────────────────────────────────────

def test_manifest_contains_only_id_label_ambiguous(tmp_path):
    path = tmp_path / "golden_t.csv"
    write_manifest(path, [
        {"post_id": 5, "label": "negative", "ambiguous": True, "title": "새면 안 되는 원문"},
        {"post_id": 9},
    ])
    text = path.read_text(encoding="utf-8")
    assert text.splitlines()[0] == "post_id,label,ambiguous"
    assert "원문" not in text
    assert read_manifest(path) == [
        {"post_id": 5, "label": "negative", "ambiguous": True},
        {"post_id": 9, "label": "", "ambiguous": False},
    ]


def test_manifest_rejects_unknown_label(tmp_path):
    path = tmp_path / "bad.csv"
    path.write_text("post_id,label,ambiguous\n1,angry,0\n", encoding="utf-8")
    with pytest.raises(ValueError):
        read_manifest(path)


def test_atomic_write_keeps_old_file_on_failure(tmp_path):
    path = tmp_path / "golden_t.csv"
    write_manifest(path, [{"post_id": 1, "label": "neutral"}])
    with patch("eval.golden.os.replace", side_effect=OSError("disk full")):
        with pytest.raises(OSError):
            write_manifest(path, [{"post_id": 1, "label": "positive"}])
    assert read_manifest(path)[0]["label"] == "neutral"
    assert list(tmp_path.glob("*.tmp")) == []
