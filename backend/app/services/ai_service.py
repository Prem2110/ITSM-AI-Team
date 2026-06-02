from __future__ import annotations
import json
import httpx
from ..config import app_config

_BASE = "https://openrouter.ai/api/v1"
_HEADERS_EXTRA = {
    "HTTP-Referer": "https://github.com/ITSM",
    "X-Title": "ITSM Predictive Analytics",
}


class AIService:
    def __init__(self, api_key: str, model: str = "openai/gpt-oss-120b:free") -> None:
        self.api_key = api_key
        self.model = model

    async def _chat(self, system: str, user: str) -> str:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(
                f"{_BASE}/chat/completions",
                headers={"Authorization": f"Bearer {self.api_key}", **_HEADERS_EXTRA},
                json={
                    "model": self.model,
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": user},
                    ],
                    "response_format": {"type": "json_object"},
                    "temperature": 0.1,
                },
            )
            r.raise_for_status()
            return r.json()["choices"][0]["message"]["content"]

    async def classify_incident(
        self,
        title: str,
        description: str,
        categories: list[str],
        priority_names: list[str],
    ) -> dict:
        scale = ", ".join(f"{i}={n}" for i, n in enumerate(priority_names))
        system = (
            "You are an ITSM incident classifier. "
            "Return JSON with exactly these keys: "
            "priority (int), category (string), confidence (float 0-1), reasoning (string, 1 sentence)."
        )
        user = (
            f"Classify this IT incident.\n"
            f"Priority scale (use the int): {scale}\n"
            f"Categories (pick one exactly): {', '.join(categories)}\n\n"
            f"Title: {title}\n"
            f"Description: {description or '(none)'}"
        )
        raw = await self._chat(system, user)
        result = json.loads(raw)
        result["priority"] = max(0, min(int(result.get("priority", len(priority_names) - 1)), len(priority_names) - 1))
        if result.get("category") not in categories:
            result["category"] = categories[0]
        result["confidence"] = round(float(result.get("confidence", 0.5)), 2)
        result["reasoning"] = str(result.get("reasoning", ""))
        return result

    async def find_similar_incidents(
        self,
        description: str,
        resolved_incidents: list[dict],
    ) -> list[dict]:
        if not resolved_incidents:
            return []
        system = (
            "You are an ITSM knowledge assistant. "
            "Given a new incident and resolved incidents, return JSON with key 'similar': "
            "a list of the top 3 most semantically relevant resolved incidents. "
            "Each item must have: id, number, title, similarity_reason (1 sentence), resolution_summary (1 sentence)."
        )
        lines = "\n".join(
            f"[{inc['number']}] ID={inc['id']} | {inc['title']} | Resolution: {inc.get('resolution_notes', 'N/A')[:120]}"
            for inc in resolved_incidents[:25]
        )
        user = f"New incident:\n{description}\n\nResolved incidents:\n{lines}"
        raw = await self._chat(system, user)
        result = json.loads(raw)
        return result.get("similar", [])

    async def suggest_assignee(
        self,
        category: str,
        priority_name: str,
        agent_stats: list[dict],
    ) -> dict:
        system = (
            "You are an ITSM workload optimizer. "
            "Return JSON with keys: suggested_agent_id (string), reasoning (string, 1-2 sentences), confidence (float 0-1)."
        )
        lines = "\n".join(
            f"{s['name']} (id={s['id']}): {s['open_count']} open tickets, "
            f"avg {s.get('avg_hours_by_category', {}).get(category, 'N/A')}h for {category} incidents, "
            f"{s['resolved_last_30d']} resolved last 30d"
            for s in agent_stats
        )
        user = (
            f"New incident: category={category}, priority={priority_name}\n"
            f"Agents:\n{lines}"
        )
        raw = await self._chat(system, user)
        result = json.loads(raw)
        result["confidence"] = round(float(result.get("confidence", 0.5)), 2)
        return result

    async def summarize_thread(self, title: str, events: list[dict]) -> dict:
        if not events:
            return {"summary": "No activity to summarize."}
        lines = "\n".join(f"[{e['type'].upper()}] {e['body']}" for e in events[:40])
        system = (
            "You are an ITSM support assistant. "
            "Summarize the incident activity thread in 2–3 sentences. "
            "Focus on what the problem is, what was tried, and current status. "
            "Return JSON with key: summary (string)."
        )
        raw = await self._chat(system, f"Incident: {title}\n\nActivity:\n{lines}")
        return {"summary": str(json.loads(raw).get("summary", ""))}

    async def draft_reply(self, title: str, state: str, events: list[dict]) -> dict:
        lines = "\n".join(f"[{e['type'].upper()}] {e['body']}" for e in events[-20:]) or "(no activity yet)"
        system = (
            "You are an ITSM support agent. "
            "Draft a professional, concise customer-facing reply for this incident. "
            "Be empathetic, clear about next steps, and sign off as 'Support Team'. "
            "Return JSON with key: draft (string)."
        )
        user = f"Incident: {title}\nCurrent state: {state}\n\nRecent activity:\n{lines}"
        raw = await self._chat(system, user)
        return {"draft": str(json.loads(raw).get("draft", ""))}

    async def draft_resolution(self, title: str, description: str, events: list[dict]) -> dict:
        lines = "\n".join(f"[{e['type'].upper()}] {e['body']}" for e in events[-30:]) or "(no activity yet)"
        system = (
            "You are an ITSM support agent writing a resolution note. "
            "Summarize how the incident was resolved in 2–4 sentences. "
            "Be specific about what was done. Do not include greetings. "
            "Return JSON with key: notes (string)."
        )
        user = f"Incident: {title}\nDescription: {description or '(none)'}\n\nActivity:\n{lines}"
        raw = await self._chat(system, user)
        return {"notes": str(json.loads(raw).get("notes", ""))}

    async def generate_handoff_report(self, open_incidents: list[dict]) -> dict:
        if not open_incidents:
            return {"report": "No open incidents at this time."}
        lines = "\n".join(
            f"- [{inc['number']}] {inc['title']} | State: {inc['state']} | "
            f"Priority: {inc['priority_name']} | Assignee: {inc['assignee'] or 'Unassigned'} | SLA: {inc['sla_status']}"
            for inc in open_incidents[:50]
        )
        system = (
            "You are an ITSM shift supervisor writing a handoff report. "
            "Produce a structured handoff report: start with a brief situation overview, "
            "then group incidents by urgency (SLA Breached first, then by priority). "
            "Include a recommended action for each. Use plain text with clear section headers. "
            "Return JSON with key: report (string, use \\n for line breaks)."
        )
        raw = await self._chat(system, f"Open incidents at shift end:\n\n{lines}")
        return {"report": str(json.loads(raw).get("report", ""))}
