from pathlib import Path
from functools import lru_cache

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[1] / ".env",
        extra="ignore",
    )
    frontend_origin: str = "http://localhost:3000"
    backend_service_token: SecretStr = SecretStr("")
    database_url: SecretStr = SecretStr("")
    credential_encryption_key: SecretStr = SecretStr("")
    tavily_api_key: SecretStr = SecretStr("")
    groq_api_key: SecretStr = SecretStr("")
    groq_base_url: str = "https://api.groq.com/openai/v1"
    groq_model: str = "openai/gpt-oss-20b"
    sensenova_api_key: SecretStr = SecretStr("")
    sensenova_base_url: str = ""
    sensenova_model: str = ""
    research_model_timeout_seconds: float = Field(default=75, ge=1, le=120)
    research_total_timeout_seconds: float = Field(default=240, ge=1, le=300)
    tavily_timeout_seconds: float = Field(default=30, ge=1, le=60)
    google_client_id: str = ""
    google_client_secret: SecretStr = SecretStr("")
    google_redirect_uri: str = "http://localhost:3000/api/auth/callback/google"
    session_secret: SecretStr = SecretStr("")
    cookie_secure: bool = False
    zernio_base_url: str = ""
    meta_graph_version: str = "v26.0"
    meta_ads_writes_enabled: bool = False
    meta_ads_activation_enabled: bool = False
    meta_insights_sync_seconds: float = Field(default=900, ge=60)
    imagekit_private_key: SecretStr = SecretStr("")
    imagekit_url_endpoint: str = ""
    cloudflare_account_id: str = ""
    cloudflare_api_token: SecretStr = SecretStr("")
    cloudflare_image_model: str = "@cf/black-forest-labs/flux-1-schnell"
    media_generation_timeout_seconds: float = Field(default=180, ge=30, le=300)
    ffmpeg_path: str = "ffmpeg"
    ffprobe_path: str = "ffprobe"
    worker_poll_seconds: float = Field(default=5, ge=1)
    publishing_enabled: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
