"""Application settings. Every secret and URL comes from the environment (see .env.example)."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Pack(BaseModel):
    id: str
    credits: int
    price_usd: float = Field(alias="priceUsd")
    label: str
    dodo_product_id: str | None = Field(default=None, alias="dodoProductId")

    model_config = {"populate_by_name": True}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_env: Literal["dev", "test", "prod"] = "dev"
    demo_mode: bool = False
    demo_replay: bool = False
    replay_fallback: bool = True
    frontend_url: str = "http://localhost:3000"
    cors_origins: str = "http://localhost:3000"
    session_secret: SecretStr = SecretStr("change_me")
    starting_credits: int = 3
    cache_ttl_seconds: int = 600
    admin_token: SecretStr = SecretStr("")
    log_salt: SecretStr = SecretStr("change_me")
    cookie_samesite: Literal["lax", "none", "strict"] = "lax"
    cookie_secure: bool = False
    database_url: str = "sqlite:///./data/cryptiq.sqlite"

    # rate limits (slowapi syntax)
    rate_limit_check: str = "30/minute"
    rate_limit_transcribe: str = "10/minute"
    max_request_bytes: int = 6 * 1024 * 1024
    # Only true when the app is reachable ONLY through Fly's proxy, which overwrites Fly-Client-IP
    trust_fly_client_ip: bool = False

    graph_engine: Literal["tigergraph", "networkx"] = "tigergraph"
    tg_host: str = ""
    tg_graph: str = "Cryptiq"
    tg_username: str = ""
    tg_password: SecretStr = SecretStr("")
    tg_secret: SecretStr = SecretStr("")
    tg_query_timeout_s: float = 8.0
    max_hop: int = 3
    max_subgraph_nodes: int = 120
    max_frontier: int = 5000

    data_dir: Path = Path("./data")
    artifacts_dir: Path = Path("./artifacts")
    ofac_list_path: Path = Path("./data/labels/ofac_btc.txt")
    ransomwhere_enabled: bool = False
    ransomwhere_path: Path | None = None

    llm_provider: Literal["anthropic", "openai", "openai_compatible"] = "anthropic"
    llm_model: str = ""
    llm_api_key: SecretStr = SecretStr("")
    llm_base_url: str = ""
    llm_timeout_s: float = 12.0
    llm_json_mode: bool = False  # OpenAI-style providers only: ask for response_format=json_object
    benchmark_max_tokens: int = 500_000
    benchmark_max_sample: int = 50

    wispr_api_key: SecretStr = SecretStr("")
    wispr_api_url: str = "https://platform-api.wisprflow.ai/api/v1/dash/api"
    sarvam_api_key: SecretStr = SecretStr("")
    sarvam_api_url: str = "https://api.sarvam.ai"
    sarvam_stt_model: str = ""
    sarvam_tts_model: str = ""
    sarvam_tts_speaker: str = ""
    voice_timeout_s: float = 15.0
    max_audio_bytes: int = 5 * 1024 * 1024
    max_audio_seconds: float = 30.0

    dodo_api_key: SecretStr = SecretStr("")
    dodo_webhook_secret: SecretStr = SecretStr("")
    dodo_env: Literal["test_mode", "live_mode"] = "test_mode"
    dodo_usage_meter_event: str = ""
    packs_json: str = (
        '[{"id":"starter","credits":5,"priceUsd":1,"label":"Starter","dodoProductId":"pdt_xxx"}]'
    )

    btc_network: Literal["testnet", "signet", "testnet4"] = "testnet"
    btc_receive_address: str = ""
    btc_explorer_base_url: str = ""
    btc_confirmations: int = 0
    btc_sats_per_usd: int = 0
    xmr_demo_address: str = ""
    invoice_ttl_minutes: int = 30

    # verdict thresholds: overridden by artifacts/model_card.json (chosen on validation)
    threshold_warn: int = 35
    threshold_block: int = 70

    @field_validator("dodo_env")
    @classmethod
    def _test_mode_only(cls, v: str) -> str:
        if v != "test_mode":
            raise ValueError("Cryptiq only supports Dodo test_mode")
        return v

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip() and o.strip() != "*"]

    @property
    def packs(self) -> list[Pack]:
        return [Pack.model_validate(p) for p in json.loads(self.packs_json)]

    def pack(self, pack_id: str) -> Pack | None:
        return next((p for p in self.packs if p.id == pack_id), None)

    @property
    def processed_dir(self) -> Path:
        return self.data_dir / "processed"

    @property
    def tg_configured(self) -> bool:
        creds = self.tg_secret.get_secret_value() or self.tg_password.get_secret_value()
        return bool(self.tg_host and creds)

    @property
    def llm_configured(self) -> bool:
        return bool(self.llm_model and self.llm_api_key.get_secret_value())


@lru_cache
def get_settings() -> Settings:
    return Settings()
