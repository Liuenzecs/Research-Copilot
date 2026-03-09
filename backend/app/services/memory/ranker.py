from __future__ import annotations


def rank_memories(rows: list[dict]) -> list[dict]:
    rows.sort(key=lambda x: (x.get('importance', 0.0), -x.get('distance', 0.0)), reverse=True)
    return rows
