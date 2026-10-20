from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, HttpUrl


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class ResearchRequest(Contract):
    query: str = Field(min_length=1, max_length=10000)
    maxResults: int = Field(default=5, ge=1, le=10, strict=True)


class SearchPlan(Contract):
    query: str = Field(min_length=3, max_length=400)


class TavilySource(BaseModel):
    title: str = Field(min_length=1)
    url: HttpUrl
    content: str | None = None
    snippet: str | None = None
    published_date: str | None = None


class TavilyResponse(BaseModel):
    answer: str | None = None
    results: list[TavilySource]


class ResearchSource(Contract):
    title: str
    url: str
    snippet: str
    publishedAt: str | None = None


class Evidence(Contract):
    claim: str = Field(min_length=10, max_length=600)
    sourceIndex: int = Field(ge=0, strict=True)
    supportingQuote: str = Field(min_length=10, max_length=600)
    eventDate: str = Field(max_length=100)
    limitation: str = Field(max_length=500)


class ResearchTopics(Contract):
    relevantSourceIndices: list[Annotated[int, Field(ge=0, strict=True)]] = Field(min_length=1, max_length=10)
    trendingTopics: list[Annotated[str, Field(max_length=160)]] = Field(max_length=3)
    viralHooks: list[Annotated[str, Field(max_length=160)]] = Field(max_length=3)
    recommendedHashtags: list[Annotated[str, Field(max_length=80)]] = Field(max_length=5)
    contentAngles: list[Annotated[str, Field(max_length=160)]] = Field(max_length=3)


class ResearchSynthesis(ResearchTopics):
    evidence: list[Evidence] = Field(min_length=1, max_length=4)


class EvidenceChoice(Contract):
    claim: str = Field(min_length=10, max_length=600)
    sourceIndex: int = Field(ge=0, strict=True)
    quoteIndex: int = Field(ge=0, strict=True)
    eventDate: str = Field(max_length=100)
    limitation: str = Field(max_length=500)


class ResearchSelection(ResearchTopics):
    evidence: list[EvidenceChoice] = Field(min_length=1, max_length=4)


class SourcedEvidence(Contract):
    claim: str
    supportingQuote: str
    eventDate: str
    limitation: str
    sourceUrl: str


class ResearchResult(Contract):
    query: str
    trendingTopics: list[str]
    viralHooks: list[str]
    recommendedHashtags: list[str]
    contentAngles: list[str]
    sources: list[ResearchSource]
    evidence: list[SourcedEvidence]
    rawSummary: str | None = None


def validate_evidence(sources: list[ResearchSource], result: ResearchSynthesis) -> None:
    indices = set(result.relevantSourceIndices)
    if any(index >= len(sources) for index in indices):
        raise ValueError("Research refers to a source that was not supplied.")
    for index, item in enumerate(result.evidence):
        if item.sourceIndex not in indices:
            raise ValueError(f"Evidence item {index} refers to an unselected source index {item.sourceIndex}.")
        if item.supportingQuote not in sources[item.sourceIndex].snippet:
            raise ValueError(f"Evidence item {index} needs a verbatim quote from source index {item.sourceIndex}; its quote does not match.")
