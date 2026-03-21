from __future__ import annotations

import re
from dataclasses import dataclass

_TOKEN_RE = re.compile(r'[a-z0-9]+|[\u3400-\u4dbf\u4e00-\u9fff]+')
_MULTI_SPACE = re.compile(r'\s+')


def _normalize(text: str) -> str:
    lowered = text.strip().lower()
    parts = _TOKEN_RE.findall(lowered)
    return _MULTI_SPACE.sub(' ', ' '.join(parts)).strip()


@dataclass(frozen=True, slots=True)
class ClassicPaperSeed:
    key: str
    canonical_title: str
    aliases: tuple[str, ...]
    topics: tuple[str, ...]
    priority: int
    kind: str = 'foundation'


CLASSIC_PAPER_SEEDS: tuple[ClassicPaperSeed, ...] = (
    ClassicPaperSeed(
        key='attention_is_all_you_need',
        canonical_title='Attention Is All You Need',
        aliases=('attention is all you need',),
        topics=('llm',),
        priority=100,
    ),
    ClassicPaperSeed(
        key='few_shot_learners',
        canonical_title='Language Models are Few-Shot Learners',
        aliases=('language models are few-shot learners',),
        topics=('llm',),
        priority=96,
    ),
    ClassicPaperSeed(
        key='instructgpt',
        canonical_title='Training language models to follow instructions with human feedback',
        aliases=(
            'training language models to follow instructions with human feedback',
            'instructgpt',
        ),
        topics=('llm', 'alignment'),
        priority=94,
    ),
    ClassicPaperSeed(
        key='cot',
        canonical_title='Chain-of-Thought Prompting Elicits Reasoning in Large Language Models',
        aliases=(
            'chain-of-thought prompting elicits reasoning in large language models',
            'chain of thought prompting elicits reasoning in large language models',
        ),
        topics=('llm', 'reasoning'),
        priority=92,
    ),
    ClassicPaperSeed(
        key='self_consistency',
        canonical_title='Self-Consistency Improves Chain of Thought Reasoning in Language Models',
        aliases=(
            'self-consistency improves chain of thought reasoning in language models',
            'self consistency improves chain of thought reasoning in language models',
        ),
        topics=('llm', 'reasoning'),
        priority=90,
    ),
    ClassicPaperSeed(
        key='react',
        canonical_title='ReAct: Synergizing Reasoning and Acting in Language Models',
        aliases=(
            'react synergizing reasoning and acting in language models',
            'react: synergizing reasoning and acting in language models',
        ),
        topics=('llm', 'agent', 'reasoning', 'tool_use'),
        priority=98,
    ),
    ClassicPaperSeed(
        key='toolformer',
        canonical_title='Toolformer',
        aliases=('toolformer',),
        topics=('llm', 'tool_use'),
        priority=91,
    ),
    ClassicPaperSeed(
        key='tree_of_thoughts',
        canonical_title='Tree of Thoughts: Deliberate Problem Solving with Large Language Models',
        aliases=(
            'tree of thoughts deliberate problem solving with large language models',
            'tree of thoughts',
        ),
        topics=('llm', 'reasoning'),
        priority=89,
    ),
    ClassicPaperSeed(
        key='reflexion',
        canonical_title='Reflexion: Language Agents with Verbal Reinforcement Learning',
        aliases=(
            'reflexion language agents with verbal reinforcement learning',
            'reflexion',
        ),
        topics=('llm', 'agent', 'reasoning'),
        priority=88,
    ),
    ClassicPaperSeed(
        key='voyager',
        canonical_title='Voyager: An Open-Ended Embodied Agent with Large Language Models',
        aliases=(
            'voyager an open-ended embodied agent with large language models',
            'voyager',
        ),
        topics=('llm', 'agent'),
        priority=86,
    ),
    ClassicPaperSeed(
        key='autogen',
        canonical_title='AutoGen: Enabling Next-Gen LLM Applications via Multi-Agent Conversation',
        aliases=(
            'autogen enabling next-gen llm applications via multi-agent conversation',
            'autogen enabling next gen llm applications via multi agent conversation',
            'autogen',
        ),
        topics=('llm', 'agent'),
        priority=87,
    ),
    ClassicPaperSeed(
        key='rag',
        canonical_title='Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks',
        aliases=(
            'retrieval-augmented generation for knowledge-intensive nlp tasks',
            'retrieval augmented generation for knowledge intensive nlp tasks',
            'retrieval-augmented generation for knowledge intensive nlp tasks',
        ),
        topics=('llm', 'rag'),
        priority=95,
    ),
    ClassicPaperSeed(
        key='zero_shot_reasoners',
        canonical_title='Large Language Models are Zero-Shot Reasoners',
        aliases=('large language models are zero-shot reasoners',),
        topics=('llm', 'reasoning'),
        priority=84,
    ),
)

CLASSIC_PAPER_SEEDS_BY_KEY = {seed.key: seed for seed in CLASSIC_PAPER_SEEDS}


def match_classic_seed(title: str) -> ClassicPaperSeed | None:
    normalized_title = _normalize(title)
    if not normalized_title:
        return None

    for seed in CLASSIC_PAPER_SEEDS:
        for alias in seed.aliases:
            normalized_alias = _normalize(alias)
            if not normalized_alias:
                continue
            if normalized_title == normalized_alias or normalized_alias in normalized_title:
                return seed
    return None


def relevant_classic_seeds(topic_keys: list[str], *, limit: int = 6) -> list[ClassicPaperSeed]:
    normalized_topics = {item.strip() for item in topic_keys if item and item.strip()}
    if not normalized_topics:
        return []

    ranked = [
        seed
        for seed in CLASSIC_PAPER_SEEDS
        if normalized_topics & set(seed.topics)
    ]
    ranked.sort(
        key=lambda seed: (
            len(normalized_topics & set(seed.topics)),
            seed.priority,
        ),
        reverse=True,
    )
    return ranked[:limit]
