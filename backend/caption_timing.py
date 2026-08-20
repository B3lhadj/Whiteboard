"""Utilities for turning Whisper word timestamps into readable caption cues."""

from __future__ import annotations

import math
import re
from typing import Iterable, Mapping


_NO_SPACE_BEFORE = re.compile(r"^[,.;:!?%\)\]\}]")


def _finite_number(value) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _join_words(words: list[dict]) -> str:
    text = ""
    for word in words:
        token = word["text"].strip()
        if not token:
            continue
        if not text or _NO_SPACE_BEFORE.match(token) or token.startswith("'"):
            text += token
        else:
            text += f" {token}"
    return text.strip()


def build_caption_cues(
    timed_words: Iterable[Mapping],
    *,
    max_words: int = 9,
    max_chars: int = 48,
    max_duration: float = 4.5,
    gap_break: float = 0.65,
) -> list[dict]:
    """Group timestamped words without changing their original time boundaries."""
    words: list[dict] = []
    for item in timed_words:
        start = _finite_number(item.get("start"))
        end = _finite_number(item.get("end"))
        text = str(item.get("text") or "").strip()
        if start is None or end is None or not text:
            continue
        start = max(0.0, start)
        end = max(start + 0.01, end)
        words.append({"start": start, "end": end, "text": text})

    words.sort(key=lambda item: (item["start"], item["end"]))
    cues: list[dict] = []
    current: list[dict] = []

    def flush() -> None:
        if not current:
            return
        cues.append({
            "start": current[0]["start"],
            "end": current[-1]["end"],
            "text": _join_words(current),
            "words": [dict(word) for word in current],
        })
        current.clear()

    for word in words:
        if current:
            previous = current[-1]
            proposed = current + [word]
            gap = word["start"] - previous["end"]
            duration = word["end"] - current[0]["start"]
            sentence_break = (
                previous["text"].endswith((".", "?", "!"))
                and previous["end"] - current[0]["start"] >= 1.2
            )
            should_break = (
                gap >= gap_break
                or len(current) >= max_words
                or len(_join_words(proposed)) > max_chars
                or duration > max_duration
                or sentence_break
            )
            if should_break:
                flush()
        current.append(word)
    flush()
    return cues
