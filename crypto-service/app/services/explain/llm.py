"""Provider-agnostic LLM client over plain httpx (Anthropic Messages API, OpenAI Chat Completions,
or any OpenAI-compatible endpoint). Timeouts, retries and REPORTED token usage on every call."""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any, Protocol

import httpx
from tenacity import AsyncRetrying, retry_if_exception, stop_after_attempt, wait_exponential

from app.config import Settings
from app.errors import UpstreamError


@dataclass
class LLMResult:
    text: str
    input_tokens: int | None  # as reported by the provider (None if it reported nothing)
    output_tokens: int | None
    latency_ms: float
    model: str


class LLMClient(Protocol):
    provider: str
    model: str

    async def complete(self, system: str, user: str, max_tokens: int = 400, temperature: float = 0.0
                       ) -> LLMResult: ...

    async def aclose(self) -> None: ...


def _retryable(exc: BaseException) -> bool:
    if isinstance(exc, httpx.TransportError):
        return True
    return isinstance(exc, httpx.HTTPStatusError) and exc.response.status_code in (429, 500, 502, 503, 529)


class _HttpLLM:
    provider = "base"

    def __init__(self, model: str, api_key: str, base_url: str, timeout_s: float, attempts: int = 2) -> None:
        self.model = model
        self._key = api_key
        self._client = httpx.AsyncClient(base_url=base_url, timeout=httpx.Timeout(timeout_s, connect=5.0))
        self._attempts = attempts

    async def aclose(self) -> None:
        await self._client.aclose()

    def _request(self, system: str, user: str, max_tokens: int, temperature: float
                 ) -> tuple[str, dict[str, str], dict[str, Any]]:
        raise NotImplementedError

    def _parse(self, data: dict[str, Any]) -> tuple[str, int | None, int | None]:
        raise NotImplementedError

    async def complete(self, system: str, user: str, max_tokens: int = 400, temperature: float = 0.0
                       ) -> LLMResult:
        path, headers, body = self._request(system, user, max_tokens, temperature)
        start = time.perf_counter()
        try:
            async for attempt in AsyncRetrying(stop=stop_after_attempt(self._attempts),
                                               wait=wait_exponential(min=0.5, max=4),
                                               retry=retry_if_exception(_retryable), reraise=True):
                with attempt:
                    r = await self._client.post(path, headers=headers, json=body)
                    r.raise_for_status()
                    data = r.json()
        except httpx.HTTPStatusError as exc:
            raise UpstreamError(self.provider, f"http {exc.response.status_code}") from exc
        except httpx.HTTPError as exc:
            raise UpstreamError(self.provider, type(exc).__name__) from exc
        try:
            text, tin, tout = self._parse(data)
        except (KeyError, IndexError, TypeError) as exc:
            raise UpstreamError(self.provider, "unexpected response shape") from exc
        return LLMResult(text.strip(), tin, tout, (time.perf_counter() - start) * 1000, self.model)


class AnthropicLLM(_HttpLLM):
    provider = "anthropic"

    def _request(self, system: str, user: str, max_tokens: int, temperature: float
                 ) -> tuple[str, dict[str, str], dict[str, Any]]:
        headers = {"x-api-key": self._key, "anthropic-version": "2023-06-01"}
        body = {"model": self.model, "max_tokens": max_tokens, "temperature": temperature, "system": system,
                "messages": [{"role": "user", "content": user}]}
        return "/v1/messages", headers, body

    def _parse(self, data: dict[str, Any]) -> tuple[str, int | None, int | None]:
        text = "".join(b.get("text", "") for b in data["content"] if b.get("type") == "text")
        usage = data.get("usage") or {}
        return text, usage.get("input_tokens"), usage.get("output_tokens")


class OpenAILLM(_HttpLLM):
    provider = "openai"
    json_mode = False  # send response_format=json_object (opt-in: some compatible servers reject the field)

    def _request(self, system: str, user: str, max_tokens: int, temperature: float
                 ) -> tuple[str, dict[str, str], dict[str, Any]]:
        headers = {"authorization": f"Bearer {self._key}"}
        body = {"model": self.model, "max_tokens": max_tokens, "temperature": temperature,
                "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]}
        if self.json_mode:
            body["response_format"] = {"type": "json_object"}
        return "/chat/completions", headers, body

    def _parse(self, data: dict[str, Any]) -> tuple[str, int | None, int | None]:
        text = data["choices"][0]["message"]["content"] or ""
        usage = data.get("usage") or {}
        return text, usage.get("prompt_tokens"), usage.get("completion_tokens")


def build_llm(settings: Settings) -> LLMClient | None:
    if not settings.llm_configured:
        return None
    key = settings.llm_api_key.get_secret_value()
    if settings.llm_provider == "anthropic":
        return AnthropicLLM(settings.llm_model, key, settings.llm_base_url or "https://api.anthropic.com",
                            settings.llm_timeout_s)
    if settings.llm_provider == "openai":
        oa = OpenAILLM(settings.llm_model, key, settings.llm_base_url or "https://api.openai.com/v1",
                       settings.llm_timeout_s)
        oa.json_mode = settings.llm_json_mode
        return oa
    if not settings.llm_base_url:
        raise RuntimeError("LLM_PROVIDER=openai_compatible needs LLM_BASE_URL")
    client = OpenAILLM(settings.llm_model, key, settings.llm_base_url, settings.llm_timeout_s)
    client.provider = "openai_compatible"
    client.json_mode = settings.llm_json_mode
    return client
