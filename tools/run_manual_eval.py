#!/usr/bin/env python3
from __future__ import annotations

import html
import os
import re
from pathlib import Path
from typing import List, Tuple

import requests

ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = ROOT / "js" / "config.js"
LARF_PROMPT_PATH = ROOT / "Context" / "prompt_LARF.txt"
PAGES = {
    "pageBook1": ROOT / "html" / "pageBook1_larf.html",
    "pageBook2": ROOT / "html" / "pageBook2_larf.html",
    "pageBook3": ROOT / "html" / "pageBook3_larf.html",
}

DEFAULT_MODEL = "gpt-4.1-mini"
DEFAULT_HL_COLOR = "#E2ABE24D"

SYSTEM_TEMPLATE = (
    "This tool is designed for dyslexic students. Add extra spacing between paragraphs (insert blank lines between paragraphs).\n"
    "You are StudyBuddy. Answer using ONLY the information in {page_label}.\n"
    "If the answer is not in {page_label}, respond with this message using LARF tags: \"I don't know. It's not from the selected text. Ask me something from the text and I will reply! :)\"\n"
    "If the question is subjective, unclear, or not grounded in the text, respond with a clarification request using LARF tags.\n"
    "Do not use outside knowledge.\n"
    "Respond in clean HTML using only <p>, <ul>, <ol>, <li>, <mark>, <strong>, <u>, <em>, and <br>.\n"
    "Use a few helpful emojis where they add clarity or encouragement.\n"
    "Keep paragraphs short (about 2-4 lines, 2-3 sentences max).\n"
    "Use simple, everyday wording and avoid complex vocabulary.\n"
    "If you need to enumerate items, prefer bullet lists.\n"
    "Apply LARF annotations using only <mark>, <strong>, and <u>. Use <mark style=\"background-color:{hl_color};\"> for highlights.\n"
)


def read_model() -> str:
    if not CONFIG_PATH.exists():
        return DEFAULT_MODEL
    text = CONFIG_PATH.read_text(encoding="utf-8")
    match = re.search(r"OPENAI_MODEL\s*=\s*'([^']+)'", text)
    return match.group(1) if match else DEFAULT_MODEL


def strip_html(html_text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html_text)).strip()


def load_page_text(page_key: str) -> str:
    path = PAGES.get(page_key)
    if not path or not path.exists():
        return ""
    return strip_html(path.read_text(encoding="utf-8"))


def load_larf_prompt() -> str:
    if not LARF_PROMPT_PATH.exists():
        return ""
    return LARF_PROMPT_PATH.read_text(encoding="utf-8").strip()


def parse_questions(path: Path) -> List[Tuple[str, str, str]]:
    questions: List[Tuple[str, str, str]] = []
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split("\t")
        if len(parts) >= 3:
            page_key = parts[0].strip()
            q = parts[1].strip()
            expected = parts[2].strip()
        elif len(parts) == 2:
            page_key = parts[0].strip()
            q = parts[1].strip()
            expected = ""
        else:
            page_key, q, expected = "pageBook1", line, ""
        if page_key not in PAGES:
            page_key = "pageBook1"
        questions.append((page_key, q, expected))
    return questions


def call_openai(question: str, page_key: str) -> str:
    model = read_model()
    page_label = {
        "pageBook1": "Page 1",
        "pageBook2": "Page 2",
        "pageBook3": "Page 3",
    }.get(page_key, "this page")

    system_prompt = SYSTEM_TEMPLATE.format(page_label=page_label, hl_color=DEFAULT_HL_COLOR)
    larf_prompt = load_larf_prompt()
    if larf_prompt:
        system_prompt = f"{system_prompt}\n{larf_prompt}"

    page_text = load_page_text(page_key)
    context_block = f"\n\nContext from {page_label}:\n{page_text}" if page_text else ""
    user_text = f"{question}{context_block}"

    payload = {
        "model": model,
        "instructions": system_prompt,
        "input": [
            {
                "role": "user",
                "content": [{"type": "input_text", "text": user_text}],
            }
        ],
        "temperature": 0.2,
    }

    url = os.getenv("EVAL_PROXY_URL", "http://localhost:8000/api/response")
    res = requests.post(url, json=payload, timeout=60)
    if not res.ok:
        return f"<p><strong>ERROR:</strong> {html.escape(res.text)}</p>"

    data = res.json()
    if isinstance(data, dict) and isinstance(data.get("output_text"), str):
        return normalize_highlights(data["output_text"].strip())

    if isinstance(data, dict) and isinstance(data.get("output"), list):
        parts = []
        for item in data["output"]:
            for part in item.get("content", []):
                if part.get("type") == "output_text":
                    parts.append(part.get("text", ""))
        if parts:
            return normalize_highlights("\n".join(parts).strip())

    return "<p><strong>ERROR:</strong> No output_text in response.</p>"


def normalize_highlights(html_text: str) -> str:
    if not html_text:
        return html_text
    # Force all <mark> to use the pink highlight color
    html_text = re.sub(
        r"<mark\\s+style=\\\"background-color:[^\\\"]+\\\">",
        f"<mark style=\\\"background-color:{DEFAULT_HL_COLOR};\\\">",
        html_text,
        flags=re.IGNORECASE,
    )
    html_text = re.sub(
        r"<mark\\s*>",
        f"<mark style=\\\"background-color:{DEFAULT_HL_COLOR};\\\">",
        html_text,
        flags=re.IGNORECASE,
    )
    return html_text


def build_html(rows: List[Tuple[int, str, str, str, str]]) -> str:
    auto_scores = []

    def to_tokens(text: str) -> set[str]:
        words = re.findall(r"[a-z0-9']+", text.lower())
        return set(w for w in words if len(w) > 2)

    def score_response(resp_html: str, expected: str) -> int:
        if not expected.strip():
            return 0
        resp_text = strip_html(resp_html)
        exp_text = expected
        if not resp_text.strip():
            return 1
        # If both are page-redirect messages, treat as strong match
        if "Please change to Page" in resp_text and "Please change to Page" in exp_text:
            return 5
        resp_tokens = to_tokens(resp_text)
        exp_tokens = to_tokens(exp_text)
        if not resp_tokens or not exp_tokens:
            return 2
        overlap = len(resp_tokens & exp_tokens)
        ratio = overlap / max(1, len(exp_tokens))
        if ratio >= 0.8:
            return 5
        if ratio >= 0.6:
            return 4
        if ratio >= 0.4:
            return 3
        if ratio >= 0.2:
            return 2
        return 1

    def format_expected(expected: str) -> str:
        if not expected:
            return ""
        escaped = html.escape(expected)
        return (
            f"<p><mark style=\\\"background-color:{DEFAULT_HL_COLOR};\\\">"
            f"<strong>Expected:</strong> <u>{escaped}</u></mark></p>"
        )

    def row_html(qn: int, page: str, q: str, resp: str, expected: str) -> str:
        auto_score = score_response(resp, expected)
        if auto_score:
            auto_scores.append(auto_score)
        return (
            "<tr>"
            f"<td>{qn}</td>"
            f"<td>{html.escape(page)}</td>"
            f"<td>{html.escape(q)}</td>"
            f"<td class=\"resp\">{resp}</td>"
            f"<td class=\"expected\">{format_expected(expected)}</td>"
            f"<td class=\"auto-score\">{auto_score if auto_score else ''}</td>"
            "<td><input type=\"number\" min=\"1\" max=\"5\" class=\"score-input\" /></td>"
            "</tr>"
        )

    body_rows = "\n".join(row_html(*r) for r in rows)
    auto_avg = f"{(sum(auto_scores)/len(auto_scores)):.2f}" if auto_scores else "N/A"
    return f"""<!DOCTYPE html>
<html lang=\"en\">
<head>
  <meta charset=\"UTF-8\" />
  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />
  <title>Manual Evaluation Report</title>
  <style>
    body {{ font-family: Arial, sans-serif; margin: 24px; color: #1f2d3d; }}
    h1, h2 {{ margin: 0 0 8px; }}
    .note {{ color: #4a5b70; font-size: 13px; }}
    table {{ width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 14px; }}
    th, td {{ border: 1px solid #d8e0ea; padding: 8px 10px; vertical-align: top; }}
    th {{ background: #f4f7fb; text-align: left; }}
    .resp p {{ margin: 0 0 8px; }}
    .expected {{ color: #2a3b4f; }}
    .controls {{ display: flex; gap: 12px; align-items: center; margin: 12px 0; }}
    .score-input {{ width: 64px; }}
    .summary {{ margin-top: 12px; font-size: 14px; }}
  </style>
</head>
<body>
  <h1>Manual Evaluation Report</h1>
  <p class=\"note\">Generated from the local RAG responses. Questions and responses are auto-filled when you run <code>tools/run_manual_eval.py</code>. Fill scores (1–5) manually.</p>
  <div class=\"section\">
    <h2>RAG Parameters</h2>
    <ul>
      <li>Model: {read_model()}</li>
      <li>Temperature: 0.2</li>
      <li>Context: single page text (per question)</li>
      <li>Prompt: LARF + StudyBuddy system constraints</li>
    </ul>
  </div>

  <div class=\"controls\">
    <button id=\"calcScore\">Calculate score</button>
    <div id=\"scoreResult\" class=\"summary\"></div>
    <div class=\"summary\">Auto average: {auto_avg}</div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Q#</th>
        <th>Page</th>
        <th>User Question</th>
        <th>System Response</th>
        <th>Expected Response</th>
        <th>Auto Score</th>
        <th>Score (1–5)</th>
      </tr>
    </thead>
    <tbody>
      {body_rows}
    </tbody>
  </table>
  <script>
    const btn = document.getElementById('calcScore');
    const result = document.getElementById('scoreResult');
    btn.addEventListener('click', () => {{
      const inputs = Array.from(document.querySelectorAll('.score-input'));
      const values = inputs
        .map((i) => parseFloat(i.value))
        .filter((v) => !Number.isNaN(v));
      if (!values.length) {{
        result.textContent = 'No scores entered yet.';
        return;
      }}
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      result.textContent = `Average score: ${{avg.toFixed(2)}} (based on ${{values.length}} responses)`;
    }});
  </script>
</body>
  </body>
</html>
""".format(body_rows=body_rows, auto_avg=f\"{(sum(auto_scores)/len(auto_scores)):.2f}\" if auto_scores else \"N/A\")


def main() -> int:
    questions_path = ROOT / "manual_eval_questions.txt"
    output_path = ROOT / "manual_evaluation_report.html"

    if not questions_path.exists():
        print(
            "Missing manual_eval_questions.txt. Create it with one question per line.\n"
            "Optional: prefix with page key and tab, e.g. `pageBook2\tWhat is a glacier?`."
        )
        return 1

    questions = parse_questions(questions_path)
    if not questions:
        print("No questions found.")
        return 1

    rows: List[Tuple[int, str, str, str, str]] = []
    for idx, (page_key, question, expected) in enumerate(questions, start=1):
        print(f"[{idx}/{len(questions)}] {page_key}: {question}")
        response = call_openai(question, page_key)
        rows.append((idx, page_key, question, response, expected))

    output_path.write_text(build_html(rows), encoding="utf-8")
    print(f"Saved: {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
