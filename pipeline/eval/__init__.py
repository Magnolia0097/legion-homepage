"""분류 품질 평가 — 사람이 라벨링한 골든셋으로 분류기를 검증한다.

공개 레포 원칙: 게시글 원문·작성자는 커밋하지 않는다.
- 커밋: golden/golden_<ver>.csv (post_id, label, ambiguous), golden/golden_<ver>.meta.json (집계 메타)
- 로컬 전용(gitignore): .cache/golden_<ver>_posts.jsonl (제목·본문, DB에서 다시 받을 수 있음)
"""
