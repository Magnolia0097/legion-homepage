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
    gemini_model: str = "gemini-2.0-flash-lite"

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
