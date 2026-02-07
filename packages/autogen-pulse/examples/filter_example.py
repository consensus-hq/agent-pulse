"""Example: filter AutoGen candidates using Agent Pulse.

This script is intentionally lightweight:

- If `autogen` is installed, it demonstrates attaching an on-chain identity
  (wallet address) to AutoGen agent objects and filtering them.
- If `autogen` is not installed, it falls back to simple dataclass objects.

Run:
  cd packages/autogen-pulse
  pip install -e .
  python examples/filter_example.py

Optional:
  pip install pyautogen
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, List

from autogen_pulse import filter_alive


@dataclass
class Candidate:
    name: str
    wallet_address: str


def _build_candidates() -> List[Any]:
    # AutoGen integration path
    try:
        import autogen  # type: ignore

        # Constructing agents without LLM config varies across AutoGen versions.
        try:
            alice = autogen.AssistantAgent(name="alice", llm_config=False)
            bob = autogen.AssistantAgent(name="bob", llm_config=False)
        except TypeError:
            alice = autogen.AssistantAgent(name="alice", llm_config={})
            bob = autogen.AssistantAgent(name="bob", llm_config={})

        # Attach wallet addresses (Agent Pulse identity)
        alice.wallet_address = "0x9508752Ba171D37EBb3AA437927458E0a21D1e04"
        bob.wallet_address = "0x0000000000000000000000000000000000000000"

        return [alice, bob]
    except Exception:
        # Fallback: plain objects that still work with the filter.
        return [
            Candidate(
                name="demo-alive",
                wallet_address="0x9508752Ba171D37EBb3AA437927458E0a21D1e04",
            ),
            Candidate(
                name="demo-unknown",
                wallet_address="0x0000000000000000000000000000000000000000",
            ),
        ]


def main() -> None:
    candidates = _build_candidates()

    # Key one-liner
    alive = filter_alive(candidates, threshold="24h")

    print("Alive candidates:")
    for a in alive:
        name = getattr(a, "name", a.__class__.__name__)
        addr = getattr(a, "wallet_address", getattr(a, "address", ""))
        print(f"- {name} ({addr})")


if __name__ == "__main__":
    main()
