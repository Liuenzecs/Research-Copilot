# Memory Design

## Memory Types
- PaperMemory
- SummaryMemory
- NoteMemory
- IdeaMemory
- RepoMemory
- ReproMemory
- ReflectionMemory
- UserResearchProfile

## Memory Layers
1. raw source
2. structured knowledge
3. semantic retrieval
4. user research profile

## Research-State Extensions
Paper-related state is stored explicitly in `paper_research_state`:
- reading_status
- interest_level
- repro_interest
- user_rating
- last_opened_at
- topic_cluster
- is_core_paper

## Reflection Memory
Reflection records are first-class objects and ingested as `ReflectionMemory` for semantic retrieval and progress reporting.
