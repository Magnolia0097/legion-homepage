"""인벤 크롤러 수동 테스트 스크립트.

실행:
    cd pipeline
    uv run python scripts/test_inven.py

예상 결과:
    성공  → "수집: N건, 저장: N건" 출력 + Supabase Table Editor에서 확인
    0건   → parse_post_list()의 HTML 셀렉터 조정 필요 (실제 HTML 구조 확인)

주의:
    - 실행 시 실제 인벤 서버에 요청이 발생함
    - Supabase .env 설정이 완료되어 있어야 저장 가능
    - 3초 간격 때문에 max_pages=2 이상이면 그만큼 시간 소요
"""

import logging
import sys
from pathlib import Path

# pipeline/ 루트를 sys.path에 추가 (직접 실행 시 패키지 인식용)
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.collectors.inven import collect_inven_aion2, save_posts

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

if __name__ == "__main__":
    print("=== 인벤 크롤러 테스트 ===\n")

    posts = collect_inven_aion2(board_id=6388, max_pages=1)
    print(f"수집: {len(posts)}건")

    if not posts:
        print(
            "\n[0건 수집됨] HTML 셀렉터가 실제 구조와 다를 수 있음.\n"
            "→ pipeline/src/collectors/inven.py의 parse_post_list() 셀렉터 확인 필요.\n"
            "→ 브라우저에서 https://www.inven.co.kr/board/aion2/6388 열고\n"
            "  개발자 도구(F12) → Elements에서 게시글 행의 HTML 구조 확인."
        )
        sys.exit(0)

    print("\n첫 번째 게시글 샘플:")
    sample = posts[0]
    # 제목은 저작권 고려 — 터미널 출력 및 저장 자체는 허용, 외부 공개만 금지
    print(f"  source      : {sample['source']}")
    print(f"  external_id : {sample['external_id']}")
    print(f"  url         : {sample['url']}")
    print(f"  title       : {sample['title']}")
    print(f"  author      : {sample['author']}")
    print(f"  posted_at   : {sample['posted_at']}")
    print(f"  body        : {sample['body']}")

    print(f"\n저장 시도 중... ({len(posts)}건)")
    try:
        saved = save_posts(posts)
        print(f"저장: {saved}건 신규 (중복 제외)")
        print("\n✅ 테스트 완료. Supabase Table Editor → voice_raw_posts 에서 확인하세요.")
    except Exception as e:
        print(f"\n⚠️  DB 저장 실패: {e}")
        print("→ pipeline/.env 파일의 SUPABASE_* 값 확인 필요.")
        print("→ Supabase 대시보드에서 001_voice_tracker.sql 실행 여부 확인.")
