"""LLM access for the pipeline: Groq first, Gemini as a fallback.

Both providers are used on their free tiers. Cron work is not latency
sensitive, so it defaults to the larger Groq model; the interactive endpoints
in the Next.js app use the small fast one.

Every call here asks for JSON and validates the result, because a pipeline that
silently writes malformed content to the database is worse than one that fails.
"""

from __future__ import annotations

import json
import logging
import os
import re
import time
from typing import Any

from dotenv import load_dotenv

from pipeline.config import (
    GEMINI_FALLBACK_MODELS,
    GROQ_FAST_FALLBACKS,
    GROQ_QUALITY_FALLBACKS,
)

load_dotenv()
logger = logging.getLogger("smartsarmaya.llm")

MAX_ATTEMPTS = 2
RETRY_DELAY = 4


class LlmUnavailableError(RuntimeError):
    """Raised when no configured provider could return a usable response."""


def _groq_key() -> str:
    return (os.environ.get("GROQ_API_KEY") or "").strip()


def _gemini_key() -> str:
    return (os.environ.get("GEMINI_API_KEY") or "").strip()


def _strip_fences(text: str) -> str:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```[a-zA-Z]*\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    return cleaned.strip()


def _extract_json(raw: str) -> dict[str, Any]:
    """Parse a JSON object from a model response, tolerating stray prose."""
    cleaned = _strip_fences(raw)
    try:
        parsed = json.loads(cleaned)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass

    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start != -1 and end > start:
        try:
            parsed = json.loads(cleaned[start : end + 1])
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            pass

    raise ValueError("Model response was not valid JSON.")


def _call_groq(system: str, user: str, model: str, max_tokens: int) -> str:
    from groq import Groq

    client = Groq(api_key=_groq_key())
    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        temperature=0.4,
        max_tokens=max_tokens,
        response_format={"type": "json_object"},
    )
    return response.choices[0].message.content or ""


def _call_gemini(system: str, user: str, max_tokens: int) -> str:
    import google.generativeai as genai

    genai.configure(api_key=_gemini_key())
    last_error: Exception | None = None
    for model_name in GEMINI_FALLBACK_MODELS:
        try:
            model = genai.GenerativeModel(model_name, system_instruction=system)
            response = model.generate_content(
                user,
                generation_config={
                    "temperature": 0.4,
                    "max_output_tokens": max_tokens,
                    "response_mime_type": "application/json",
                },
            )
            return response.text or ""
        except Exception as exc:  # noqa: BLE001 - try the next model
            last_error = exc
            logger.warning("Gemini model %s failed: %s", model_name, exc)
    raise LlmUnavailableError(f"All Gemini models failed: {last_error}")


def complete_json(
    system: str,
    user: str,
    *,
    fast: bool = False,
    max_tokens: int = 4096,
) -> tuple[dict[str, Any], str]:
    """Return (parsed JSON, model identifier used).

    Tries Groq, then Gemini. Raises LlmUnavailableError when neither works.
    """
    candidates = GROQ_FAST_FALLBACKS if fast else GROQ_QUALITY_FALLBACKS
    # Preserve order while removing duplicates from the configured override.
    models = list(dict.fromkeys(candidates))
    errors: list[str] = []

    if _groq_key():
        for model in models:
            for attempt in range(MAX_ATTEMPTS):
                try:
                    raw = _call_groq(system, user, model, max_tokens)
                    return _extract_json(raw), model
                except Exception as exc:  # noqa: BLE001 - try the next model
                    errors.append(f"groq/{model}: {exc}")
                    message = str(exc)
                    # A retired or unavailable model will never succeed, so move
                    # on immediately instead of burning the retry budget.
                    if "model_not_found" in message or "does not exist" in message:
                        logger.warning("Groq model %s is unavailable; trying the next one.", model)
                        break
                    logger.warning("Groq %s attempt %s failed: %s", model, attempt + 1, exc)
                    if attempt < MAX_ATTEMPTS - 1:
                        time.sleep(RETRY_DELAY)
    else:
        errors.append("groq: GROQ_API_KEY not set")

    if _gemini_key():
        try:
            raw = _call_gemini(system, user, max_tokens)
            return _extract_json(raw), "gemini"
        except Exception as exc:  # noqa: BLE001 - reported below
            errors.append(f"gemini: {exc}")
            logger.warning("Gemini fallback failed: %s", exc)
    else:
        errors.append("gemini: GEMINI_API_KEY not set")

    raise LlmUnavailableError("No LLM provider succeeded. " + " | ".join(errors))


def is_configured() -> bool:
    return bool(_groq_key() or _gemini_key())
