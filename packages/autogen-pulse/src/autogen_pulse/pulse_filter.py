"""Agent Pulse liveness filtering for AutoGen.

This module provides a small helper to filter a list of candidate agents down to
only those that have recently "pulsed" (proved liveness) on Agent Pulse.

API endpoint:
  GET {base_url}/api/v2/agent/{address}/alive

The API response format has evolved over time. This implementation supports
both the documented v2 shape:
  {"alive": bool, "lastPulse": number, "streakCount": number}

…and the currently observed shape:
  {"isAlive": bool, "lastPulseTimestamp": number, "streak": number, ...}

All timestamps are treated as Unix seconds (ms are auto-detected and converted).
"""

from __future__ import annotations

import json
import re
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any, Callable, Iterable, List, Optional, Sequence, Tuple, Union


DEFAULT_API_BASE_URL = "https://agent-pulse-nine.vercel.app"
DEFAULT_TIMEOUT_SECS = 10
DEFAULT_MAX_RETRIES = 3
DEFAULT_BACKOFF_SECS = 0.5
DEFAULT_USER_AGENT = "autogen-pulse/0.1.0"


class AgentPulseError(RuntimeError):
    """Raised when the Agent Pulse API request fails in a non-retryable way."""


@dataclass(frozen=True)
class AgentPulseStatus:
    """Parsed status returned by the Agent Pulse API."""

    address: str
    alive: Optional[bool]
    last_pulse_timestamp: Optional[int]
    streak_count: Optional[int]
    raw: dict


def parse_threshold(threshold: Union[str, int, float]) -> float:
    """Parse a human-friendly threshold into hours.

    Examples:
      - "24h" -> 24.0
      - "15m" -> 0.25
      - "2d"  -> 48.0

    If a number is provided, it is interpreted as hours.

    Args:
        threshold: A string like "24h"/"15m"/"2d" or a numeric hours value.

    Returns:
        Threshold in hours (float).

    Raises:
        ValueError: If the threshold cannot be parsed.
    """

    if isinstance(threshold, (int, float)):
        if threshold <= 0:
            raise ValueError("threshold must be > 0")
        return float(threshold)

    if not isinstance(threshold, str):
        raise ValueError(f"Unsupported threshold type: {type(threshold)!r}")

    s = threshold.strip().lower()
    m = re.match(r"^(?P<value>\d+(?:\.\d+)?)\s*(?P<unit>[smhd])$", s)
    if not m:
        raise ValueError(
            'threshold must look like "24h", "15m", "2d", or a numeric hour value'
        )

    value = float(m.group("value"))
    unit = m.group("unit")

    if value <= 0:
        raise ValueError("threshold must be > 0")

    if unit == "s":
        return value / 3600.0
    if unit == "m":
        return value / 60.0
    if unit == "h":
        return value
    if unit == "d":
        return value * 24.0

    # unreachable due to regex
    raise ValueError(f"Unsupported unit: {unit}")


def _normalize_address(address: str) -> str:
    address = address.strip()
    if not address:
        raise ValueError("Empty address")
    # Preserve 0x prefix casing, but normalize hex chars for consistent requests.
    if address.startswith("0x") or address.startswith("0X"):
        return "0x" + address[2:].lower()
    return address.lower()


def _get_agent_address(agent: Any) -> str:
    """Extract an address from a string/dict/object.

    Supported:
      - "0x..." (str)
      - {"address": "0x..."} (dict)
      - objects with .address or .wallet_address attributes
    """

    if isinstance(agent, str):
        return _normalize_address(agent)

    if isinstance(agent, dict):
        for key in (
            "address",
            "wallet_address",
            "walletAddress",
            "agent_address",
            "agentAddress",
        ):
            value = agent.get(key)
            if isinstance(value, str) and value.strip():
                return _normalize_address(value)

    for attr in (
        "address",
        "wallet_address",
        "walletAddress",
        "agent_address",
        "agentAddress",
    ):
        value = getattr(agent, attr, None)
        if isinstance(value, str) and value.strip():
            return _normalize_address(value)

    raise ValueError(
        "Could not extract an address from agent. Provide a string address, a dict with an "
        "'address' key, or an object with .address/.wallet_address."
    )


def _http_get_json(
    url: str,
    *,
    timeout_secs: int = DEFAULT_TIMEOUT_SECS,
    max_retries: int = DEFAULT_MAX_RETRIES,
    backoff_secs: float = DEFAULT_BACKOFF_SECS,
    headers: Optional[dict] = None,
) -> dict:
    headers = {"accept": "application/json", "user-agent": DEFAULT_USER_AGENT, **(headers or {})}

    last_err: Optional[BaseException] = None

    for attempt in range(max_retries + 1):
        try:
            req = urllib.request.Request(url, headers=headers, method="GET")
            with urllib.request.urlopen(req, timeout=timeout_secs) as resp:
                body = resp.read().decode("utf-8")
                return json.loads(body)
        except urllib.error.HTTPError as e:
            # Retry on 429 and 5xx; otherwise treat as permanent.
            status = getattr(e, "code", None)
            retryable = status in (408, 429) or (isinstance(status, int) and 500 <= status <= 599)
            last_err = e
            if attempt >= max_retries or not retryable:
                try:
                    body = e.read().decode("utf-8")
                except Exception:
                    body = ""
                raise AgentPulseError(
                    f"Agent Pulse API HTTP {status} for {url}. Body: {body[:200]}"
                ) from e
        except (urllib.error.URLError, TimeoutError) as e:
            last_err = e
            if attempt >= max_retries:
                raise AgentPulseError(f"Agent Pulse API request failed for {url}: {e}") from e

        # Exponential backoff (attempt 0 waits backoff_secs, attempt 1 waits 2x, etc.)
        sleep_for = backoff_secs * (2**attempt)
        time.sleep(sleep_for)

    # Should be unreachable.
    raise AgentPulseError(f"Agent Pulse API request failed for {url}: {last_err}")


def get_agent_status(
    address: str,
    *,
    api_base_url: str = DEFAULT_API_BASE_URL,
    timeout_secs: int = DEFAULT_TIMEOUT_SECS,
    max_retries: int = DEFAULT_MAX_RETRIES,
    backoff_secs: float = DEFAULT_BACKOFF_SECS,
) -> AgentPulseStatus:
    """Fetch and parse Agent Pulse status for an address."""

    norm = _normalize_address(address)
    url = f"{api_base_url.rstrip('/')}/api/v2/agent/{norm}/alive"
    payload = _http_get_json(
        url,
        timeout_secs=timeout_secs,
        max_retries=max_retries,
        backoff_secs=backoff_secs,
    )

    alive = payload.get("alive")
    if alive is None:
        alive = payload.get("isAlive")

    last_pulse = payload.get("lastPulse")
    if last_pulse is None:
        last_pulse = payload.get("lastPulseTimestamp")

    streak = payload.get("streakCount")
    if streak is None:
        streak = payload.get("streak")

    # Normalize timestamp seconds (convert ms to seconds when it looks like ms)
    last_pulse_ts: Optional[int]
    if last_pulse is None:
        last_pulse_ts = None
    else:
        try:
            lp = int(last_pulse)
            if lp > 10_000_000_000:  # ~2286-11-20 in seconds; treat larger as ms
                lp = lp // 1000
            last_pulse_ts = lp
        except Exception:
            last_pulse_ts = None

    try:
        streak_count = int(streak) if streak is not None else None
    except Exception:
        streak_count = None

    return AgentPulseStatus(
        address=norm,
        alive=bool(alive) if alive is not None else None,
        last_pulse_timestamp=last_pulse_ts,
        streak_count=streak_count,
        raw=payload,
    )


def _is_recent(status: AgentPulseStatus, *, now_ts: int, threshold_seconds: int) -> bool:
    if status.last_pulse_timestamp is None:
        # If the API did not return a timestamp, fall back to the boolean when present.
        return bool(status.alive)

    staleness = max(0, now_ts - int(status.last_pulse_timestamp))
    return staleness <= threshold_seconds


def filter_alive_agents(
    agents: Iterable[Any],
    threshold_hours: Union[int, float] = 24,
    *,
    api_base_url: str = DEFAULT_API_BASE_URL,
    timeout_secs: int = DEFAULT_TIMEOUT_SECS,
    max_retries: int = DEFAULT_MAX_RETRIES,
    backoff_secs: float = DEFAULT_BACKOFF_SECS,
    address_getter: Optional[Callable[[Any], str]] = None,
    drop_on_error: bool = True,
) -> List[Any]:
    """Filter a list/iterable of agents to only those alive within the threshold.

    The returned list preserves the original agent objects.

    Args:
        agents: Iterable of candidate agents. Each element can be:
            - a string address ("0x...")
            - a dict with an "address" key
            - an object with .address or .wallet_address
        threshold_hours: Maximum staleness (in hours) allowed.
        api_base_url: Agent Pulse API base URL.
        timeout_secs: Request timeout.
        max_retries: Retry count for network/429/5xx.
        backoff_secs: Initial exponential backoff delay.
        address_getter: Optional custom function to extract address from an agent.
        drop_on_error: If True (default), agents that cannot be checked are excluded.
            If False, errors are raised.

    Returns:
        List of agents that have pulsed within the threshold.
    """

    if threshold_hours <= 0:
        raise ValueError("threshold_hours must be > 0")

    now_ts = int(time.time())
    threshold_seconds = int(float(threshold_hours) * 3600)

    alive_agents: List[Any] = []

    for agent in agents:
        try:
            addr = address_getter(agent) if address_getter else _get_agent_address(agent)
            status = get_agent_status(
                addr,
                api_base_url=api_base_url,
                timeout_secs=timeout_secs,
                max_retries=max_retries,
                backoff_secs=backoff_secs,
            )
            if _is_recent(status, now_ts=now_ts, threshold_seconds=threshold_seconds):
                alive_agents.append(agent)
        except Exception:
            if drop_on_error:
                continue
            raise

    return alive_agents


def filter_alive(
    agents: Iterable[Any],
    *,
    threshold: Union[str, int, float] = "24h",
    **kwargs: Any,
) -> List[Any]:
    """Convenience wrapper that accepts a human-friendly threshold like "24h"."""

    threshold_hours = parse_threshold(threshold)
    return filter_alive_agents(agents, threshold_hours=threshold_hours, **kwargs)
