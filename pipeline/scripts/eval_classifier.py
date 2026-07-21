"""분류 정확도 평가 — 라벨링된 감사 샘플 CSV로 confusion matrix·지표 산출.

입력: sample_for_audit.py가 뽑은 CSV에 사람이 label_actual을 채운 파일 (Phase 3).
DB·Gemini 호출 없이 CSV만으로 동작한다.

출력:
1. sentiment(예측) vs label_actual(정답) confusion matrix
2. 클래스별 precision / recall / f1 + 전체 accuracy
3. classified_by_model별 정확도 breakdown (컬럼이 채워져 있는 경우)
4. classify_hybrid(기존) vs classify_hybrid_v2_experimental(실험) 무료 경로 비교
   — is_question() 순서 문제(측정 가이드 Phase 1.5) 가설 검증용.
     두 버전 모두 use_gemini=False로 실행하므로 API 비용 없음.

실행: cd pipeline && uv run python scripts/eval_classifier.py audit_sample_20260720.csv
"""

from __future__ import annotations

import csv
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.processors.hybrid import classify_hybrid, classify_hybrid_v2_experimental

LABELS = ["positive", "negative", "neutral"]


def load_labeled_rows(csv_path: Path) -> list[dict]:
    """label_actual이 유효하게 채워진 행만 로드."""
    with csv_path.open(encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))

    labeled = []
    skipped = 0
    for row in rows:
        actual = (row.get("label_actual") or "").strip().lower()
        if actual in LABELS:
            row["label_actual"] = actual
            labeled.append(row)
        else:
            skipped += 1
    if skipped:
        print(f"⚠ label_actual 비어있거나 유효하지 않은 행 {skipped}건 제외 "
              f"(유효 라벨: {', '.join(LABELS)})")
    return labeled


# ── 지표 계산 ─────────────────────────────────────────────────────────────────

def confusion_matrix(pairs: list[tuple[str, str]]) -> dict[tuple[str, str], int]:
    """(actual, predicted) 쌍 목록 → {(actual, predicted): count}."""
    return Counter(pairs)


def print_confusion_matrix(matrix: dict[tuple[str, str], int], title: str) -> None:
    print(f"\n── {title} " + "─" * max(0, 60 - len(title)))
    corner = "actual / pred"
    header = f"{corner:>15}" + "".join(f"{lbl:>10}" for lbl in LABELS) + f"{'합계':>8}"
    print(header)
    for actual in LABELS:
        row_counts = [matrix.get((actual, pred), 0) for pred in LABELS]
        print(f"{actual:>15}" + "".join(f"{c:>10}" for c in row_counts) + f"{sum(row_counts):>8}")


def per_class_metrics(pairs: list[tuple[str, str]]) -> None:
    matrix = confusion_matrix(pairs)
    total = len(pairs)
    correct = sum(matrix.get((lbl, lbl), 0) for lbl in LABELS)
    print(f"\n{'class':>10} {'precision':>10} {'recall':>10} {'f1':>10} {'support':>8}")
    for lbl in LABELS:
        tp = matrix.get((lbl, lbl), 0)
        fp = sum(matrix.get((a, lbl), 0) for a in LABELS if a != lbl)
        fn = sum(matrix.get((lbl, p), 0) for p in LABELS if p != lbl)
        support = tp + fn
        precision = tp / (tp + fp) if tp + fp else 0.0
        recall = tp / (tp + fn) if tp + fn else 0.0
        f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
        print(f"{lbl:>10} {precision:>10.3f} {recall:>10.3f} {f1:>10.3f} {support:>8}")
    print(f"\n전체 accuracy: {correct}/{total} = {correct / total:.3f}" if total else "\n평가할 행 없음")


# ── 1·2·3. 저장된 예측 vs 정답 ────────────────────────────────────────────────

def evaluate_stored_predictions(rows: list[dict]) -> None:
    pairs = [(r["label_actual"], (r.get("sentiment") or "").strip()) for r in rows]
    print_confusion_matrix(confusion_matrix(pairs), "저장된 분류 결과 (sentiment 컬럼) vs 정답")
    per_class_metrics(pairs)

    # classified_by_model별 breakdown — 컬럼이 채워진 행이 있을 때만
    by_model: dict[str, list[tuple[str, str]]] = defaultdict(list)
    for r in rows:
        model = (r.get("classified_by_model") or "").strip()
        if model:
            by_model[model].append((r["label_actual"], (r.get("sentiment") or "").strip()))

    if not by_model:
        print("\n(classified_by_model 컬럼이 비어 있어 모델별 breakdown 생략 — "
              "002 마이그레이션 이후 분류된 데이터부터 채워짐)")
        return

    print("\n── classified_by_model별 breakdown " + "─" * 26)
    print(f"{'model':>35} {'accuracy':>10} {'건수':>6}")
    for model, model_pairs in sorted(by_model.items(), key=lambda kv: -len(kv[1])):
        correct = sum(1 for a, p in model_pairs if a == p)
        print(f"{model:>35} {correct / len(model_pairs):>10.3f} {len(model_pairs):>6}")


# ── 4. hybrid v1 vs v2 무료 경로 비교 ────────────────────────────────────────

def evaluate_hybrid_versions(rows: list[dict]) -> None:
    """기존/실험 버전을 use_gemini=False로 재실행해 정답과 비교.

    보류(None) 판정은 정오답 계산에서 제외하고 건수만 표기 —
    실제 파이프라인이라면 Gemini로 넘어갔을 글이다.
    """
    results: dict[str, dict] = {}
    for name, fn in (
        ("classify_hybrid (기존)", classify_hybrid),
        ("classify_hybrid_v2_experimental", classify_hybrid_v2_experimental),
    ):
        pairs: list[tuple[str, str]] = []
        deferred = 0
        for r in rows:
            post = {"title": r.get("title") or "", "body": r.get("body") or ""}
            result, _ = fn(post, use_gemini=False)
            if result is None:
                deferred += 1
                continue
            pairs.append((r["label_actual"], result["sentiment"]))
        results[name] = {"pairs": pairs, "deferred": deferred}

    print("\n" + "=" * 62)
    print("hybrid v1(기존) vs v2(실험) — 무료 경로 재실행 비교")
    print("(보류=애매해서 Gemini로 넘어갔을 글, 정오답 계산에서 제외)")
    print("=" * 62)
    for name, res in results.items():
        pairs, deferred = res["pairs"], res["deferred"]
        correct = sum(1 for a, p in pairs if a == p)
        acc = f"{correct}/{len(pairs)} = {correct / len(pairs):.3f}" if pairs else "n/a"
        print(f"\n[{name}] 판정 {len(pairs)}건 / 보류 {deferred}건 / accuracy {acc}")
        print_confusion_matrix(confusion_matrix(pairs), f"{name} vs 정답")

    # 두 버전이 다르게 판정한 글 목록 — 순서 버그 영향 케이스를 직접 확인
    print("\n── v1과 v2 판정이 갈린 글 " + "─" * 36)
    diff_count = 0
    for r in rows:
        post = {"title": r.get("title") or "", "body": r.get("body") or ""}
        v1, _ = classify_hybrid(post, use_gemini=False)
        v2, _ = classify_hybrid_v2_experimental(post, use_gemini=False)
        s1 = v1["sentiment"] if v1 else "(보류)"
        s2 = v2["sentiment"] if v2 else "(보류)"
        if s1 != s2:
            diff_count += 1
            mark_v1 = "○" if s1 == r["label_actual"] else "×"
            mark_v2 = "○" if s2 == r["label_actual"] else "×"
            print(f"  정답={r['label_actual']:<8} v1={s1:<8}{mark_v1} v2={s2:<8}{mark_v2} | "
                  f"{(r.get('title') or '')[:40]}")
    if not diff_count:
        print("  (없음)")
    else:
        print(f"  총 {diff_count}건")


def main() -> None:
    if len(sys.argv) != 2:
        print("사용법: uv run python scripts/eval_classifier.py <라벨링된_CSV_경로>")
        sys.exit(1)

    csv_path = Path(sys.argv[1])
    if not csv_path.exists():
        print(f"파일 없음: {csv_path}")
        sys.exit(1)

    rows = load_labeled_rows(csv_path)
    if not rows:
        print("label_actual이 채워진 행이 없습니다 — 라벨링 후 다시 실행하세요.")
        sys.exit(1)

    print(f"라벨링된 평가 대상: {len(rows)}건")
    evaluate_stored_predictions(rows)
    evaluate_hybrid_versions(rows)


if __name__ == "__main__":
    main()
