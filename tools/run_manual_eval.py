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
DEFAULT_TEMPERATURE = 0.2
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

PROMPT_PRESETS = {
    "baseline": "",
    "strict": (
        "Be strict and concise. Prefer direct answers over long explanations.\n"
        "Avoid restating the full context unless explicitly requested.\n"
    ),
    "teaching": (
        "Use a supportive, didactic style.\n"
        "When possible, include one short clarification sentence after the direct answer.\n"
    ),
}


def read_model() -> str:
    env_model = os.getenv("EVAL_MODEL", "").strip()
    if env_model:
        return env_model
    if not CONFIG_PATH.exists():
        return DEFAULT_MODEL
    text = CONFIG_PATH.read_text(encoding="utf-8")
    match = re.search(r"OPENAI_MODEL\s*=\s*'([^']+)'", text)
    return match.group(1) if match else DEFAULT_MODEL


def read_temperature() -> float:
    raw = os.getenv("EVAL_TEMPERATURE", "").strip()
    if not raw:
        return DEFAULT_TEMPERATURE
    try:
        val = float(raw)
    except Exception:
        return DEFAULT_TEMPERATURE
    if val < 0:
        return 0.0
    if val > 2:
        return 2.0
    return val


def read_prompt_preset() -> str:
    preset = os.getenv("EVAL_PROMPT_PRESET", "baseline").strip().lower()
    if preset in PROMPT_PRESETS:
        return preset
    return "baseline"


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
    temperature = read_temperature()
    prompt_preset = read_prompt_preset()
    page_label = {
        "pageBook1": "Page 1",
        "pageBook2": "Page 2",
        "pageBook3": "Page 3",
    }.get(page_key, "this page")

    system_prompt = SYSTEM_TEMPLATE.format(page_label=page_label, hl_color=DEFAULT_HL_COLOR)
    larf_prompt = load_larf_prompt()
    if larf_prompt:
        system_prompt = f"{system_prompt}\n{larf_prompt}"
    preset_suffix = PROMPT_PRESETS.get(prompt_preset, "")
    if preset_suffix:
        system_prompt = f"{system_prompt}\n{preset_suffix}"

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
        "temperature": temperature,
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
        # If both are page-redirect messages, treat as strong match.
        if "Please change to Page" in resp_text and "Please change to Page" in exp_text:
            return 5
        # If expected is page-redirect, the strict "I don't know (not from selected text)"
        # fallback is still a good answer, but slightly below explicit redirect.
        resp_l = resp_text.lower()
        exp_l = exp_text.lower()
        expected_page_redirect = (
            "please change to page" in exp_l
            or "cannot reply to it from page" in exp_l
        )
        idk_selected_text_fallback = (
            "i don't know. it's not from the selected text" in resp_l
            or "i dont know. it's not from the selected text" in resp_l
            or "ask me something from the text and i will reply" in resp_l
        )
        if expected_page_redirect and idk_selected_text_fallback:
            return 4
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
        page_safe = html.escape(page)
        q_safe = html.escape(q)
        auto_attr = str(auto_score) if auto_score else ""
        return (
            f"<tr data-qn=\"{qn}\" data-page=\"{page_safe}\" data-auto-score=\"{auto_attr}\">"
            f"<td>{qn}</td>"
            f"<td>{page_safe}</td>"
            f"<td>{q_safe}</td>"
            f"<td class=\"resp\">{resp}</td>"
            f"<td class=\"expected\">{format_expected(expected)}</td>"
            f"<td class=\"auto-score\">{auto_score if auto_score else ''}</td>"
            f"<td><input type=\"number\" min=\"1\" max=\"5\" step=\"1\" class=\"score-input\" data-qn=\"{qn}\" /></td>"
            "</tr>"
        )

    body_rows = "\n".join(row_html(*r) for r in rows)
    auto_avg = f"{(sum(auto_scores)/len(auto_scores)):.2f}" if auto_scores else "N/A"
    generated_at = __import__("datetime").datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    return f"""<!DOCTYPE html>
<html lang=\"en\">
<head>
  <meta charset=\"UTF-8\" />
  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />
  <title>Manual Evaluation Report</title>
  <style>
    :root {{
      --bg: #f8fbff;
      --line: #d8e0ea;
      --ink: #1f2d3d;
      --muted: #4a5b70;
      --accent: #2f5f8f;
      --warn: #a26700;
      --warn-bg: #fff6d9;
      --bad-bg: #ffe8e8;
    }}
    body {{ font-family: Arial, sans-serif; margin: 24px; color: var(--ink); background: var(--bg); }}
    h1, h2 {{ margin: 0 0 8px; }}
    .note {{ color: var(--muted); font-size: 13px; }}
    table {{ width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 14px; background: #fff; }}
    th, td {{ border: 1px solid var(--line); padding: 8px 10px; vertical-align: top; }}
    th {{ background: #edf4fb; text-align: left; position: sticky; top: 0; z-index: 1; }}
    .resp p {{ margin: 0 0 8px; }}
    .expected {{ color: #2a3b4f; }}
    .controls {{ display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin: 14px 0; }}
    .control-inline {{ display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: var(--muted); }}
    button {{ border: 1px solid #bdd0e6; background: #eaf3fd; color: #1d4770; border-radius: 8px; padding: 7px 10px; cursor: pointer; }}
    button:hover {{ background: #deecfb; }}
    button:disabled {{ opacity: .6; cursor: default; }}
    select {{ border: 1px solid var(--line); border-radius: 6px; padding: 5px 7px; background: #fff; }}
    .score-input {{ width: 64px; }}
    .summary {{ font-size: 14px; }}
    .summary-grid {{ display: grid; grid-template-columns: repeat(4, minmax(180px, 1fr)); gap: 8px; margin: 8px 0 14px; }}
    .summary-box {{ border: 1px solid var(--line); border-radius: 10px; background: #fff; padding: 10px; }}
    .summary-box .label {{ font-size: 12px; color: var(--muted); margin-bottom: 4px; }}
    .summary-box .value {{ font-size: 18px; font-weight: 700; }}
    tr[data-row-state=\"warn\"] {{ background: var(--warn-bg); }}
    tr[data-row-state=\"bad\"] {{ background: var(--bad-bg); }}
    #runStatus {{ min-height: 20px; color: var(--muted); }}
    .progress-wrap {{ margin: 6px 0 10px; display: none; }}
    .progress-track {{ width: 100%; height: 12px; border-radius: 999px; background: #e7eef6; overflow: hidden; border: 1px solid var(--line); }}
    .progress-fill {{ height: 100%; width: 0%; background: linear-gradient(90deg, #73a7dd, #2f5f8f); transition: width .3s ease; }}
    .progress-meta {{ margin-top: 6px; font-size: 12px; color: var(--muted); display: flex; justify-content: space-between; gap: 10px; }}
    .progress-question {{ margin-top: 4px; font-size: 12px; color: #2f4d6d; }}
    #runLogs {{ margin-top: 8px; white-space: pre-wrap; font-size: 12px; background: #0f1720; color: #d6e2f1; border-radius: 8px; padding: 10px; display: none; }}
    @media (max-width: 1100px) {{
      .summary-grid {{ grid-template-columns: repeat(2, minmax(160px, 1fr)); }}
    }}
  </style>
</head>
<body>
  <h1>Manual Evaluation Report</h1>
  <p class=\"note\">Generated from the local RAG responses. Use <strong>Run Evaluation</strong> to refresh this page from the current model behavior. Fill scores (1–5) manually.</p>
  <p class=\"note\">Generated at: <code id=\"generatedAt\">{generated_at}</code></p>
  <div class=\"section\">
    <h2>RAG Parameters</h2>
    <ul>
      <li>Model: {read_model()}</li>
      <li>Temperature: {read_temperature()}</li>
      <li>Context: single page text (per question)</li>
      <li>Prompt: {read_prompt_preset()} + LARF + StudyBuddy system constraints</li>
    </ul>
  </div>

  <div class=\"controls\">
    <button id=\"runEval\">Run Evaluation</button>
    <button id=\"runSweep\">Run Sweep</button>
    <label class=\"control-inline\">Model
      <input id=\"runModel\" type=\"text\" value=\"{read_model()}\" style=\"width:160px;\" />
    </label>
    <label class=\"control-inline\">Temp
      <input id=\"runTemp\" type=\"number\" min=\"0\" max=\"2\" step=\"0.1\" value=\"{read_temperature()}\" style=\"width:80px;\" />
    </label>
    <label class=\"control-inline\">Prompt
      <select id=\"runPrompt\">
        <option value=\"baseline\">baseline</option>
        <option value=\"strict\">strict</option>
        <option value=\"teaching\">teaching</option>
      </select>
    </label>
    <label class=\"control-inline\">Sweep Temps
      <input id=\"sweepTemps\" type=\"text\" value=\"0.0,0.2,0.5\" style=\"width:120px;\" />
    </label>
    <label class=\"control-inline\">Sweep Prompts
      <input id=\"sweepPrompts\" type=\"text\" value=\"baseline,strict,teaching\" style=\"width:190px;\" />
    </label>
  </div>

  <div class=\"summary-grid\">
    <div class=\"summary-box\"><div class=\"label\">Auto Average</div><div class=\"value\" id=\"autoAvg\">{auto_avg}</div></div>
  </div>
  <div id=\"runStatus\" class=\"summary\"></div>
  <div id=\"progressWrap\" class=\"progress-wrap\">
    <div class=\"progress-track\"><div id=\"progressFill\" class=\"progress-fill\"></div></div>
    <div class=\"progress-meta\">
      <span id=\"progressText\">0%</span>
      <span id=\"progressCounts\">0/0</span>
      <span id=\"progressElapsed\">0.0s</span>
    </div>
    <div id=\"progressQuestion\" class=\"progress-question\"></div>
  </div>
  <pre id=\"runLogs\"></pre>

  <h2>Run History</h2>
  <table id=\"historyTable\">
    <thead>
      <tr>
        <th>Timestamp</th>
        <th>Mode</th>
        <th>Model</th>
        <th>Temp</th>
        <th>Prompt</th>
        <th>Auto Avg</th>
        <th>Duration (s)</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody id=\"historyBody\"></tbody>
  </table>

  <script>
    const runBtn = document.getElementById('runEval');
    const sweepBtn = document.getElementById('runSweep');
    const runModel = document.getElementById('runModel');
    const runTemp = document.getElementById('runTemp');
    const runPrompt = document.getElementById('runPrompt');
    const sweepTemps = document.getElementById('sweepTemps');
    const sweepPrompts = document.getElementById('sweepPrompts');
    const runStatus = document.getElementById('runStatus');
    const progressWrap = document.getElementById('progressWrap');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    const progressCounts = document.getElementById('progressCounts');
    const progressElapsed = document.getElementById('progressElapsed');
    const progressQuestion = document.getElementById('progressQuestion');
    const runLogs = document.getElementById('runLogs');
    const historyBody = document.getElementById('historyBody');
    let pollTimer = null;

    function parseCsvList(raw) {{
      return String(raw || '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
    }}

    function getSingleConfig() {{
      return {{
        model: (runModel.value || '').trim() || null,
        temperature: Number(runTemp.value),
        prompt_preset: (runPrompt.value || 'baseline').trim() || 'baseline',
      }};
    }}

    function getSweepConfigs() {{
      const temps = parseCsvList(sweepTemps.value)
        .map((x) => Number(x))
        .filter((x) => Number.isFinite(x));
      const prompts = parseCsvList(sweepPrompts.value)
        .map((x) => x.toLowerCase())
        .filter((x) => ['baseline', 'strict', 'teaching'].includes(x));
      const model = (runModel.value || '').trim() || null;
      const configs = [];
      temps.forEach((t) => {{
        prompts.forEach((p) => {{
          configs.push({{ model, temperature: t, prompt_preset: p }});
        }});
      }});
      return configs;
    }}

    function renderStatus(status) {{
      const percent = Number(status.percent || 0);
      const total = Number(status.total || 0);
      const current = Number(status.current || 0);
      const runIndex = Number(status.run_index || 0);
      const runTotal = Number(status.run_total || 0);
      progressFill.style.width = `${{Math.max(0, Math.min(percent, 100))}}%`;
      progressText.textContent = `${{Math.round(percent)}}%`;
      progressCounts.textContent = total ? `${{current}}/${{total}}` : '0/0';
      progressElapsed.textContent = `${{Number(status.elapsed_seconds || 0).toFixed(1)}}s`;
      const page = status.current_page || '';
      const question = status.current_question || '';
      const runMeta = runTotal > 0 ? `Run ${{runIndex}}/${{runTotal}}` : '';
      const qMeta = question ? `${{page}}: ${{question}}` : '';
      progressQuestion.textContent = [runMeta, qMeta].filter(Boolean).join(' | ');
    }}

    async function pollStatusOnce() {{
      const res = await fetch('/api/manual-eval/status', {{ cache: 'no-store' }});
      const data = await res.json();
      const status = data.status || {{}};
      renderStatus(status);
      if (Array.isArray(status.log_tail) && status.log_tail.length) {{
        runLogs.textContent = status.log_tail.join('\\n');
        runLogs.style.display = 'block';
      }}
      if (status.running) {{
        runStatus.textContent = 'Running evaluation... this can take a while.';
        return false;
      }}
      if (status.ok === true) {{
        runStatus.textContent = `Run completed in ${{status.duration_seconds || status.elapsed_seconds || 0}}s. Reloading report...`;
        clearInterval(pollTimer);
        pollTimer = null;
        setTimeout(() => window.location.reload(), 700);
        return true;
      }}
      if (status.ok === false) {{
        runStatus.textContent = `Run failed: ${{status.error || 'Unknown error'}}`;
        clearInterval(pollTimer);
        pollTimer = null;
        runBtn.disabled = false;
        sweepBtn.disabled = false;
        loadHistory();
        return true;
      }}
      return false;
    }}

    function startPollingStatus() {{
      if (pollTimer) return;
      pollTimer = setInterval(() => {{
        pollStatusOnce().catch((err) => {{
          runStatus.textContent = `Status error: ${{err.message || err}}`;
        }});
      }}, 1000);
      pollStatusOnce().catch((err) => {{
        runStatus.textContent = `Status error: ${{err.message || err}}`;
      }});
    }}

    async function runEvaluation() {{
      runBtn.disabled = true;
      sweepBtn.disabled = true;
      runStatus.textContent = 'Starting evaluation...';
      progressWrap.style.display = 'block';
      progressFill.style.width = '0%';
      progressText.textContent = '0%';
      progressCounts.textContent = '0/0';
      progressElapsed.textContent = '0.0s';
      progressQuestion.textContent = '';
      runLogs.style.display = 'none';
      runLogs.textContent = '';
      try {{
        const res = await fetch('/api/manual-eval/run', {{
          method: 'POST',
          headers: {{ 'Content-Type': 'application/json' }},
          body: JSON.stringify(getSingleConfig()),
        }});
        const data = await res.json();
        if (!res.ok && res.status !== 409) {{
          const err = data.error || data.stderr || 'Unknown error';
          runStatus.textContent = `Run failed: ${{err}}`;
          runLogs.textContent = [data.stdout || '', data.stderr || ''].filter(Boolean).join('\\n\\n');
          runLogs.style.display = runLogs.textContent ? 'block' : 'none';
          progressWrap.style.display = 'none';
          runBtn.disabled = false;
          sweepBtn.disabled = false;
          return;
        }}
        runStatus.textContent = res.status === 409
          ? 'Evaluation already running. Tracking progress...'
          : 'Evaluation started. Tracking progress...';
        startPollingStatus();
      }} catch (err) {{
        runStatus.textContent = `Run failed: ${{err.message || err}}`;
        progressWrap.style.display = 'none';
        runBtn.disabled = false;
        sweepBtn.disabled = false;
      }}
    }}

    async function runSweep() {{
      const configs = getSweepConfigs();
      if (!configs.length) {{
        runStatus.textContent = 'Sweep config is empty. Add temps and prompts.';
        return;
      }}
      runBtn.disabled = true;
      sweepBtn.disabled = true;
      runStatus.textContent = `Starting sweep with ${{configs.length}} runs...`;
      progressWrap.style.display = 'block';
      progressFill.style.width = '0%';
      progressText.textContent = '0%';
      progressCounts.textContent = '0/0';
      progressElapsed.textContent = '0.0s';
      progressQuestion.textContent = '';
      runLogs.style.display = 'none';
      runLogs.textContent = '';
      try {{
        const res = await fetch('/api/manual-eval/sweep', {{
          method: 'POST',
          headers: {{ 'Content-Type': 'application/json' }},
          body: JSON.stringify({{ configs }}),
        }});
        const data = await res.json();
        if (!res.ok && res.status !== 409) {{
          runStatus.textContent = `Sweep failed: ${{data.error || 'Unknown error'}}`;
          progressWrap.style.display = 'none';
          runBtn.disabled = false;
          sweepBtn.disabled = false;
          return;
        }}
        runStatus.textContent = res.status === 409
          ? 'Evaluation already running. Tracking progress...'
          : 'Sweep started. Tracking progress...';
        startPollingStatus();
      }} catch (err) {{
        runStatus.textContent = `Sweep failed: ${{err.message || err}}`;
        progressWrap.style.display = 'none';
        runBtn.disabled = false;
        sweepBtn.disabled = false;
      }}
    }}

    function renderHistory(rows) {{
      if (!historyBody) return;
      historyBody.innerHTML = '';
      (rows || []).slice().reverse().forEach((entry) => {{
        const cfg = entry.config || {{}};
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${{entry.timestamp || ''}}</td>
          <td>${{entry.mode || 'single'}}</td>
          <td>${{cfg.model || ''}}</td>
          <td>${{cfg.temperature ?? ''}}</td>
          <td>${{cfg.prompt_preset || ''}}</td>
          <td>${{entry.auto_avg ?? ''}}</td>
          <td>${{entry.duration_seconds ?? ''}}</td>
          <td>${{entry.ok ? 'ok' : 'fail'}}</td>
        `;
        historyBody.appendChild(tr);
      }});
    }}

    async function loadHistory() {{
      try {{
        const res = await fetch('/api/manual-eval/history', {{ cache: 'no-store' }});
        const data = await res.json();
        if (data && data.ok) renderHistory(data.history || []);
      }} catch (_) {{
        // ignore history failures in UI
      }}
    }}

    runBtn.addEventListener('click', runEvaluation);
    sweepBtn.addEventListener('click', runSweep);

    loadHistory();
  </script>
</body>
</html>
"""


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

    model = read_model()
    temperature = read_temperature()
    prompt_preset = read_prompt_preset()
    print(
        f"Using config -> model={model}, temperature={temperature}, prompt_preset={prompt_preset}",
        flush=True,
    )

    rows: List[Tuple[int, str, str, str, str]] = []
    for idx, (page_key, question, expected) in enumerate(questions, start=1):
        print(f"[{idx}/{len(questions)}] {page_key}: {question}", flush=True)
        response = call_openai(question, page_key)
        rows.append((idx, page_key, question, response, expected))

    output_path.write_text(build_html(rows), encoding="utf-8")
    print(f"Saved: {output_path}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
