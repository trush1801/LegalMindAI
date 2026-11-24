# ai-service/app/services/generation_service.py

"""
Part 12C — Gemini Generation & Grounded Citations
Part 12D — supports one regeneration pass with validator feedback
"""

import json
import re
from typing import Any, Dict, List, Optional

from langchain_core.prompts import ChatPromptTemplate
from langchain_google_genai import ChatGoogleGenerativeAI

from app.config.settings import settings


def _clean_json_markdown(raw_text: Any) -> str:
    if isinstance(raw_text, list):
        parts = []
        for p in raw_text:
            if isinstance(p, dict) and "text" in p:
                parts.append(p["text"])
            elif isinstance(p, str):
                parts.append(p)
        raw_text = "".join(parts)
    elif not isinstance(raw_text, str):
        raw_text = str(raw_text)

    cleaned = raw_text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\n?", "", cleaned)
        cleaned = re.sub(r"\n?```$", "", cleaned)
    return cleaned.strip()


def _get_llm():
    if not settings.GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY is not set in environment or settings.")

    model_name = getattr(settings, "GEMINI_MODEL", None) or "gemini-2.0-flash"
    return ChatGoogleGenerativeAI(
        model=model_name,
        google_api_key=settings.GEMINI_API_KEY,
        temperature=0.1,
        response_mime_type="application/json",
    )


def _format_context(filtered_chunks: List[Dict[str, Any]]) -> str:
    blocks = []
    for i, chunk in enumerate(filtered_chunks or []):
        page = chunk.get("page", "Unknown")
        section = chunk.get("section", "Unknown")
        text = (chunk.get("text") or "").strip()
        blocks.append(f"[Chunk #{i + 1} | Page {page} | Section: {section}]\n{text}")
    return "\n\n".join(blocks) if blocks else "No context chunks available."


def _format_risks(risk_findings: Optional[List[Dict[str, Any]]]) -> str:
    if not risk_findings:
        return "No severe risk findings flagged."
    items = []
    for rf in risk_findings[:5]:
        title = rf.get("riskTitle", rf.get("category", "Legal Risk"))
        level = str(rf.get("riskLevel", "MEDIUM")).upper()
        expl = rf.get("explanation", rf.get("clauseText", ""))
        items.append(f"- [{level} RISK] {title}: {expl}")
    return "\n".join(items)


_SYSTEM = """You are LegalMind AI, an expert legal analyst assistant.
Answer ONLY using the provided Document Context and Risk Findings.

STRICT GROUNDING RULES:
1. Base your answer ONLY on Document Context and Risk Findings.
2. Do NOT invent facts, parties, amounts, or dates absent from context.
3. Every factual claim must be supportable by an excerpt copied from the context.
4. Citations MUST use Page and Section labels exactly as shown in the chunk headers when possible.
5. Each citation excerpt MUST be a verbatim (or near-verbatim) span copied from a context chunk.

Respond with valid JSON only — no markdown — matching exactly:
{{
  "answer": "Detailed clear explanation answering the query...",
  "citations": [
    {{
      "page": "1",
      "section": "section label from chunk header",
      "excerpt": "Exact quote copied from a context chunk"
    }}
  ]
}}
"""


def generate_gemini_answer(
    query: str,
    intent: str,
    route_taken: str,
    filtered_chunks: List[Dict[str, Any]],
    risk_findings: Optional[List[Dict[str, Any]]] = None,
    validator_feedback: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Generate grounded answer + citations.
    If validator_feedback is provided, this is a Part 12D regeneration pass.
    """
    formatted_context = _format_context(filtered_chunks)
    risk_text = _format_risks(risk_findings)

    feedback_block = ""
    if validator_feedback:
        feedback_block = f"""
--- CITATION VALIDATOR FEEDBACK (FIX THESE ISSUES) ---
{validator_feedback}

You MUST fix invalid citations. Copy excerpts verbatim from the Document Context chunks.
Drop any claim you cannot support with a real excerpt.
"""

    human = """Query: {query}
Intent: {intent}
Graph Path: {route_taken}

--- DOCUMENT CONTEXT CHUNKS ---
{context}

--- IDENTIFIED RISK FINDINGS ---
{risk_findings}
{feedback}
Return the JSON answer now:"""

    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", _SYSTEM),
            ("human", human),
        ]
    )

    try:
        llm = _get_llm()
        chain = prompt | llm
        raw_response = chain.invoke(
            {
                "query": query,
                "intent": intent,
                "route_taken": route_taken,
                "context": formatted_context,
                "risk_findings": risk_text,
                "feedback": feedback_block,
            }
        )
        content = _clean_json_markdown(raw_response.content)
        parsed = json.loads(content)
        return {
            "answer": parsed.get("answer", "No answer generated."),
            "citations": parsed.get("citations", []) or [],
            "generation_status": "SUCCESS_REGEN" if validator_feedback else "SUCCESS",
        }
    except Exception as e:
        return {
            "answer": f"Unable to generate AI answer due to processing error: {str(e)}",
            "citations": [
                {
                    "page": c.get("page", "Unknown"),
                    "section": c.get("section", "Unknown"),
                    "excerpt": ((c.get("text") or "")[:100] + "..."),
                }
                for c in (filtered_chunks or [])[:2]
            ],
            "generation_status": f"ERROR: {str(e)}",
        }