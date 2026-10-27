import asyncio
import json
import re
import logging
import time
from typing import TypeVar

import httpx
from langchain_openai import ChatOpenAI
from pydantic import BaseModel, ValidationError

from app.config import Settings
from app.schemas.research import TavilyResponse

T = TypeVar("T", bound=BaseModel)
log = logging.getLogger("socialix.providers")


class ResearchError(Exception):
    def __init__(self, stage: str, message: str, retryable: bool = False):
        super().__init__(message)
        self.stage = stage
        self.retryable = retryable


def parse_model_json(text: str, schema: type[T]) -> T:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```$", "", text)
    return schema.model_validate_json(text)


class ResearchProviders:
    def __init__(self, settings: Settings, http: httpx.AsyncClient):
        self.settings = settings
        self.http = http
        self.deadline = None
        self.last_text_provider = None
        self.last_text_model = None

    def remaining(self, stage, seconds):
        budget = min(seconds, self.deadline - time.monotonic()) if self.deadline is not None else seconds
        if budget <= 0:
            raise ResearchError(stage, f"Research time budget exhausted during {stage}; retry resumes saved progress.", True)
        return budget

    async def structured(self, stage: str, system: str, user: str, schema: type[T]) -> T:
        settings = self.settings
        providers = [
            ("Groq", settings.groq_api_key, settings.groq_base_url, settings.groq_model, True),
            ("SenseNova", settings.sensenova_api_key, settings.sensenova_base_url, settings.sensenova_model, False),
        ]
        errors = []
        for provider, api_key, base_url, model_name, json_mode in providers:
            if not all((api_key.get_secret_value(), base_url, model_name)):
                continue
            try:
                result = await self._structured_with(
                    provider, api_key, base_url, model_name, json_mode, stage, system, user, schema
                )
                self.last_text_provider = provider
                self.last_text_model = model_name
                return result
            except ResearchError as error:
                errors.append(error)
                log.warning("Text provider failed stage=%s provider=%s; trying fallback", stage, provider)
        if len(errors) == 1:
            raise errors[0]
        if errors:
            raise ResearchError(
                stage,
                f"Groq and SenseNova failed during {stage}: " + "; ".join(str(error) for error in errors),
                any(error.retryable for error in errors),
            )
        raise ResearchError(stage, "Neither Groq nor SenseNova is configured in the Python backend.")

    async def _structured_with(self, provider: str, api_key, base_url: str, model_name: str,
                               json_mode: bool, stage: str, system: str, user: str,
                               schema: type[T]) -> T:
        settings = self.settings
        token_limit = {"skill_selection": 1024, "query_planning": 1024, "evidence_synthesis": 4096, "master_planning": 4096,
                       "content_generation": 4096, "editorial_review": 2048, "growth_strategy": 4096,
                       "caption_editing": 2048, "visual_generation": 4096, "image_planning": 2048,
                       "carousel_generation": 4096, "reel_generation": 4096,
                       "meta_campaign_guidance": 2048}.get(stage)

        def model_for(limit):
            options = dict(
                api_key=api_key,
                base_url=base_url,
                model=model_name,
                timeout=settings.research_model_timeout_seconds,
                max_retries=0,
                temperature=0.1,
                use_responses_api=False,
                stream_usage=False,
                reasoning_effort="low" if json_mode else "none",
            )
            if json_mode:
                options["max_completion_tokens"] = limit
            elif limit:
                options["extra_body"] = {"max_tokens": limit}
            model = ChatOpenAI(**options)
            return model.bind(response_format={"type": "json_object"}) if json_mode else model

        model = model_for(token_limit)
        messages = [
            ("system", system + "\nReturn only JSON matching this schema:\n" + json.dumps(schema.model_json_schema())),
            ("human", user),
        ]
        # Groq guarantees JSON syntax; every provider is still validated against the application schema.
        for attempt in range(2):
            budget = self.remaining(stage, settings.research_model_timeout_seconds)
            started = time.monotonic()
            response = None
            log.info("Provider started provider=%s stage=%s attempt=%s input_chars=%s token_limit=%s deadline_s=%s",
                     provider, stage, attempt + 1, sum(len(m[1]) for m in messages), token_limit, budget)
            try:
                async with asyncio.timeout(budget):
                    response = await model.ainvoke(messages)
                if response is None:
                    raise ValueError("Empty model response")
                finish = response.response_metadata.get("finish_reason")
                log.info("Provider completed provider=%s stage=%s attempt=%s elapsed_s=%.2f finish=%s",
                         provider, stage, attempt + 1, time.monotonic() - started, finish)
                if finish == "length":
                    if attempt == 0 and token_limit:
                        token_limit = min(token_limit * 2, 8192)
                        model = model_for(token_limit)
                        messages.append(("human", "The previous response was truncated. Return a complete, concise JSON object from scratch. Keep required facts and fields; omit commentary."))
                        continue
                    raise ResearchError(stage, f"{provider} reached its output limit during {stage} after {attempt + 1} attempts; no incomplete response was accepted.", True)
                if not isinstance(response.content, str):
                    raise ValueError("Expected text response")
                return parse_model_json(response.content, schema)
            except ResearchError:
                raise
            except (ValidationError, ValueError) as error:
                issues = error.errors(include_input=False, include_url=False, include_context=False)[:6] if isinstance(error, ValidationError) else [{"loc": [], "type": "invalid_response", "msg": "Expected JSON text."}]
                if isinstance(error, ValidationError):
                    for issue, detail in zip(issues, error.errors(include_url=False)[:6]):
                        if issue["type"] == "string_too_long":
                            issue["actualCharacters"] = len(detail["input"])
                            issue["rewriteToAtMostCharacters"] = max(1, int(detail["ctx"]["max_length"] * .7))
                        elif issue["type"] == "too_long" and isinstance(detail["input"], list):
                            issue["actualItems"] = len(detail["input"])
                            issue["rewriteToAtMostItems"] = max(1, int(detail["ctx"]["max_length"] * .7))
                fields = "; ".join(f"{'.'.join(map(str, issue['loc'])) or 'response'}: {issue['type']}" for issue in issues)
                log.warning("Provider invalid_output provider=%s stage=%s attempt=%s elapsed_s=%.2f fields=%s", provider, stage, attempt + 1, time.monotonic() - started, fields)
                if attempt == 0:
                    if response is not None and isinstance(response.content, str):
                        messages.append(("assistant", response.content[:20000]))
                    messages.append(("human", "Correct these validation errors and return the complete JSON object. Preserve facts; do not invent evidence. " + json.dumps(issues)))
                    continue
                raise ResearchError(stage, f"{provider} returned invalid structured output during {stage}: {fields}.") from None
            except Exception as error:
                timed_out = isinstance(error, (TimeoutError, httpx.TimeoutException)) or "timeout" in type(error).__name__.lower()
                status = getattr(error, "status_code", None)
                log.warning("Provider provider=%s stage=%s attempt=%s elapsed_s=%.2f error=%s status=%s cause=%s",
                    provider, stage, attempt + 1, time.monotonic() - started,
                    type(error).__name__, status, type(error.__cause__).__name__ if error.__cause__ else None)
                retryable = timed_out or status == 429 or (isinstance(status, int) and status >= 500)
                if attempt == 0 and retryable:
                    await asyncio.sleep(min(1, self.remaining(stage, 1)))
                    continue
                message = (f"{provider} timed out during {stage} with {budget:g}s available on the last attempt "
                           f"({attempt + 1} attempts).") if timed_out else f"{provider} request failed during {stage}."
                raise ResearchError(stage, message, retryable) from None
        raise AssertionError("Unreachable")

    async def search(self, query: str, max_results: int, news: bool) -> TavilyResponse:
        key = self.settings.tavily_api_key.get_secret_value()
        if not key:
            raise ResearchError("web_search", "Tavily is not configured in the Python backend.")
        payload = {"api_key": key, "query": query, "max_results": max_results,
                   "search_depth": "advanced", "include_answer": True}
        if news:
            payload.update(topic="news", time_range="week")
        try:
            response = await self.http.post("https://api.tavily.com/search", json=payload,
                                            timeout=self.remaining("web_search", self.settings.tavily_timeout_seconds))
            response.raise_for_status()
            return TavilyResponse.model_validate(response.json())
        except httpx.TimeoutException:
            raise ResearchError("web_search", "Tavily timed out during web search.", True) from None
        except httpx.HTTPStatusError as error:
            status = error.response.status_code
            raise ResearchError("web_search", f"Tavily request failed ({status}).", status == 429 or status >= 500) from None
        except (ValidationError, ValueError):
            raise ResearchError("web_search", "Tavily returned an invalid research response.") from None
        except httpx.RequestError:
            raise ResearchError("web_search", "Unable to connect to Tavily.", True) from None
