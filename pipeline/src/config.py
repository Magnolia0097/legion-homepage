from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # 인벤 크롤러
    inven_user_agent: str = "legion-voice-tracker/0.1"
    inven_request_interval: float = 3.0
    inven_board_ids: str = "6388,6438,6448,6449,6450,6451,6452,6453,6454"

    # Gemini API
    gemini_api_key: str
    # 무료 등급 한도(2026-11, 프로젝트 기준): 3.5·3.1 flash-lite 500 RPD, 2.5 flash-lite 20 RPD
    gemini_model: str = "gemini-3.5-flash-lite"

    # 분류기 모드:
    #   "batch"       = 모든 글을 LLM으로 묶어서 분류 (기본, 2026-11~). 미분류 글 → 예전 규칙으로 분류된 글 순.
    #                   LLM을 못 쓰면 최근 글만 키워드로 임시 분류하고 나중에 LLM으로 다시 매긴다.
    #   "hybrid"      = 질문/명백한 글은 무료 키워드, 애매한 의견글만 Gemini (2026-06~10 운영)
    #   "transformer" = 로컬 한국어 감성 BERT (무료·무제한, 맥락이해 일부)
    #   "local"       = 키워드 점수 (무료·무제한, 가볍지만 맥락 약함)
    #   "gemini"      = 글마다 LLM 요청 1번 (무료 한도 제약 큼)
    classifier_mode: str = "batch"

    # 실행(run) 1회당 Gemini 요청 상한 — 무료 RPD 한도 초과 방지.
    # batch 모드에선 '묶음 요청' 수: 40 x 50건 = 실행당 최대 2,000건, 하루 12회면 480요청(< 500 RPD).
    gemini_calls_per_run: int = 40

    # batch 모드 설정
    llm_batch_size: int = 50          # 요청 1번에 묶는 글 수
    llm_min_interval: float = 4.5     # 요청 간 최소 간격(초) — 무료 15 RPM 대비
    classify_time_budget: int = 600   # 분류 단계 최대 소요(초) — Actions 타임아웃 대비
    keyword_fallback_hours: int = 24  # LLM을 못 쓸 때 이 시간 안의 미분류 글만 키워드로 임시 분류

    # transformer 모드에서 쓸 한국어 감성 모델 (HuggingFace Hub)
    transformer_model: str = "sangrimlee/bert-base-multilingual-cased-nsmc"

    # Supabase
    supabase_url: str
    supabase_anon_key: str
    supabase_service_role_key: str

    @property
    def board_id_list(self) -> list[int]:
        return [int(b.strip()) for b in self.inven_board_ids.split(",")]


@lru_cache
def get_settings() -> Settings:
    return Settings()
