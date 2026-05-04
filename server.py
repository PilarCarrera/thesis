from __future__ import annotations

import os
import re
import json
import subprocess
import sys
import threading
import time
from pathlib import Path

from flask import Flask, jsonify, request
from flask import send_from_directory

try:
    from dotenv import load_dotenv
except Exception:  # pragma: no cover - optional dependency
    load_dotenv = None

ROOT = Path(__file__).resolve().parent

def _load_env_fallback(env_path: Path) -> None:
    if not env_path.exists():
        return
    try:
        for line in env_path.read_text(encoding='utf-8').splitlines():
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            key, value = line.split('=', 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            os.environ.setdefault(key, value)
    except Exception:
        # If parsing fails, we still let explicit environment variables win.
        return


if load_dotenv:
    load_dotenv(ROOT / '.env')
else:
    _load_env_fallback(ROOT / '.env')


def _normalize_base_url(raw_url: str) -> str:
    raw_url = (raw_url or '').strip()
    if not raw_url:
        return 'https://api.openai.com'
    # Avoid double /v1 when users set OPENAI_BASE_URL=https://api.openai.com/v1
    if raw_url.rstrip('/').endswith('/v1'):
        return raw_url.rstrip('/')[:-3]
    return raw_url


OPENAI_API_KEY = os.getenv('OPENAI_API_KEY', '').strip()
OPENAI_BASE_URL = _normalize_base_url(os.getenv('OPENAI_BASE_URL', 'https://api.openai.com'))

app = Flask(__name__, static_folder=str(ROOT), static_url_path='')
HISTORY_PATH = ROOT / 'manual_eval_history.json'


_MANUAL_EVAL_LOCK = threading.Lock()
_MANUAL_EVAL_STATE = {
    'running': False,
    'started_at': None,
    'finished_at': None,
    'duration_seconds': None,
    'current': 0,
    'total': 0,
    'percent': 0,
    'current_page': '',
    'current_question': '',
    'last_line': '',
    'log_tail': [],
    'ok': None,
    'returncode': None,
    'error': '',
    'mode': 'single',
    'run_index': 0,
    'run_total': 0,
    'active_config': {},
    'results': [],
}


def _manual_eval_snapshot() -> dict:
    with _MANUAL_EVAL_LOCK:
        snap = dict(_MANUAL_EVAL_STATE)
    started_at = snap.get('started_at')
    if snap.get('running') and started_at:
        snap['elapsed_seconds'] = round(time.time() - started_at, 2)
    else:
        snap['elapsed_seconds'] = snap.get('duration_seconds')
    return snap


def _set_manual_eval_state(**kwargs) -> None:
    with _MANUAL_EVAL_LOCK:
        _MANUAL_EVAL_STATE.update(kwargs)


def _load_history() -> list[dict]:
    if not HISTORY_PATH.exists():
        return []
    try:
        raw = HISTORY_PATH.read_text(encoding='utf-8').strip()
        if not raw:
            return []
        data = json.loads(raw)
        if isinstance(data, list):
            return data
        return []
    except Exception:
        return []


def _save_history(rows: list[dict]) -> None:
    HISTORY_PATH.write_text(json.dumps(rows, ensure_ascii=True, indent=2), encoding='utf-8')


def _append_history(entry: dict) -> None:
    with _MANUAL_EVAL_LOCK:
        history = _load_history()
        history.append(entry)
        history = history[-500:]
        _save_history(history)


def _extract_auto_avg_from_report() -> float | None:
    report_path = ROOT / 'manual_evaluation_report.html'
    if not report_path.exists():
        return None
    text = report_path.read_text(encoding='utf-8', errors='ignore')
    match = re.search(r'id="autoAvg">([0-9]+(?:\.[0-9]+)?)<', text)
    if not match:
        return None
    try:
        return float(match.group(1))
    except Exception:
        return None


def _append_manual_eval_log(line: str) -> None:
    clean = (line or '').rstrip('\n')
    with _MANUAL_EVAL_LOCK:
        tail = _MANUAL_EVAL_STATE.setdefault('log_tail', [])
        tail.append(clean)
        if len(tail) > 200:
            del tail[: len(tail) - 200]
        _MANUAL_EVAL_STATE['last_line'] = clean


_PROGRESS_RE = re.compile(r'^\[(\d+)/(\d+)\]\s+([^:]+):\s*(.+)$')


def _update_manual_eval_progress_from_line(line: str) -> None:
    clean = (line or '').strip()
    match = _PROGRESS_RE.match(clean)
    if not match:
        return
    current = int(match.group(1))
    total = max(int(match.group(2)), 1)
    current_page = match.group(3).strip()
    current_question = match.group(4).strip()
    percent = int((current / total) * 100)
    _set_manual_eval_state(
        current=current,
        total=total,
        percent=min(max(percent, 0), 100),
        current_page=current_page,
        current_question=current_question,
    )


def _run_manual_eval_once(script_path: Path, config: dict, mode: str) -> dict:
    started = time.time()
    model = (config.get('model') or '').strip()
    temperature = config.get('temperature')
    prompt_preset = (config.get('prompt_preset') or 'baseline').strip() or 'baseline'
    env = os.environ.copy()
    if model:
        env['EVAL_MODEL'] = model
    if temperature is not None:
        env['EVAL_TEMPERATURE'] = str(temperature)
    env['EVAL_PROMPT_PRESET'] = prompt_preset

    proc = subprocess.Popen(
        [sys.executable, '-u', str(script_path)],
        cwd=str(ROOT),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
        env=env,
    )

    if proc.stdout:
        for line in proc.stdout:
            _append_manual_eval_log(line)
            _update_manual_eval_progress_from_line(line)

    returncode = proc.wait()
    ended = time.time()
    auto_avg = _extract_auto_avg_from_report()
    temp_value = None
    try:
        if str(temperature).strip() != '':
            temp_value = float(temperature)
    except Exception:
        temp_value = None

    result = {
        'ok': returncode == 0,
        'returncode': returncode,
        'duration_seconds': round(ended - started, 2),
        'mode': mode,
        'config': {
            'model': model or None,
            'temperature': temp_value,
            'prompt_preset': prompt_preset,
        },
        'auto_avg': auto_avg,
        'timestamp': time.strftime('%Y-%m-%d %H:%M:%S'),
    }
    _append_history(result)
    return result


def _run_manual_eval_worker(script_path: Path, mode: str, configs: list[dict]) -> None:
    started = time.time()
    _set_manual_eval_state(
        running=True,
        started_at=started,
        finished_at=None,
        duration_seconds=None,
        current=0,
        total=0,
        percent=0,
        current_page='',
        current_question='',
        last_line='',
        log_tail=[],
        ok=None,
        returncode=None,
        error='',
        mode=mode,
        run_index=0,
        run_total=len(configs),
        active_config={},
        results=[],
    )
    try:
        results: list[dict] = []
        for idx, config in enumerate(configs, start=1):
            _set_manual_eval_state(
                run_index=idx,
                active_config=config,
                current=0,
                total=0,
                percent=0,
                current_page='',
                current_question='',
                log_tail=[],
                last_line=f"Starting run {idx}/{len(configs)}",
            )
            result = _run_manual_eval_once(script_path, config, mode)
            results.append(result)
            _set_manual_eval_state(results=results)
            if not result['ok']:
                break
    except Exception as exc:
        _set_manual_eval_state(
            running=False,
            finished_at=time.time(),
            duration_seconds=round(time.time() - started, 2),
            ok=False,
            returncode=-1,
            error=f'Failed to start manual evaluation: {exc}',
        )
        return

    ended = time.time()
    final_ok = bool(configs) and all(r.get('ok') for r in _manual_eval_snapshot().get('results', []))
    final_return_code = 0 if final_ok else 1
    _set_manual_eval_state(
        running=False,
        finished_at=ended,
        duration_seconds=round(ended - started, 2),
        ok=final_ok,
        returncode=final_return_code,
        percent=100 if final_ok else _manual_eval_snapshot().get('percent', 0),
        error='' if final_ok else 'Manual evaluation failed. Check logs.',
    )


@app.get('/')
def index():
    return send_from_directory(str(ROOT), 'index.html')


@app.post('/api/response')
def proxy_response():
    if not OPENAI_API_KEY:
        return jsonify({'error': 'Missing OPENAI_API_KEY on the server.'}), 500

    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({'error': 'Invalid JSON payload.'}), 400

    import requests  # local import to keep module light for static use

    url = f"{OPENAI_BASE_URL.rstrip('/')}/v1/responses"
    try:
        res = requests.post(
            url,
            headers={
                'Content-Type': 'application/json',
                'Authorization': f"Bearer {OPENAI_API_KEY}",
            },
            json=payload,
            timeout=60,
        )
    except requests.RequestException as exc:
        return jsonify({'error': f'Upstream request failed: {exc}'}), 502

    return (res.text, res.status_code, {'Content-Type': res.headers.get('Content-Type', 'application/json')})


@app.get('/api/health')
def health_check():
    return jsonify(
        {
            'ok': True,
            'hasKey': bool(OPENAI_API_KEY),
            'baseUrl': OPENAI_BASE_URL,
        }
    )


@app.post('/api/manual-eval/run')
def run_manual_evaluation():
    script_path = ROOT / 'tools' / 'run_manual_eval.py'
    if not script_path.exists():
        return jsonify({'ok': False, 'error': f'Missing script: {script_path}'}), 404
    snap = _manual_eval_snapshot()
    if snap.get('running'):
        return jsonify({'ok': False, 'error': 'Manual evaluation is already running.', 'status': snap}), 409

    payload = request.get_json(silent=True) or {}
    config = {
        'model': payload.get('model'),
        'temperature': payload.get('temperature'),
        'prompt_preset': payload.get('prompt_preset') or 'baseline',
    }
    worker = threading.Thread(
        target=_run_manual_eval_worker,
        args=(script_path, 'single', [config]),
        daemon=True,
    )
    worker.start()
    return jsonify({'ok': True, 'started': True, 'status': _manual_eval_snapshot()})


@app.get('/api/manual-eval/status')
def manual_eval_status():
    return jsonify({'ok': True, 'status': _manual_eval_snapshot()})


@app.post('/api/manual-eval/sweep')
def run_manual_eval_sweep():
    script_path = ROOT / 'tools' / 'run_manual_eval.py'
    if not script_path.exists():
        return jsonify({'ok': False, 'error': f'Missing script: {script_path}'}), 404
    snap = _manual_eval_snapshot()
    if snap.get('running'):
        return jsonify({'ok': False, 'error': 'Manual evaluation is already running.', 'status': snap}), 409

    payload = request.get_json(silent=True) or {}
    configs = payload.get('configs')
    if not isinstance(configs, list) or not configs:
        return jsonify({'ok': False, 'error': 'Missing non-empty configs array.'}), 400

    normalized = []
    for item in configs:
        if not isinstance(item, dict):
            continue
        normalized.append(
            {
                'model': item.get('model'),
                'temperature': item.get('temperature'),
                'prompt_preset': item.get('prompt_preset') or 'baseline',
            }
        )
    if not normalized:
        return jsonify({'ok': False, 'error': 'No valid configs provided.'}), 400

    worker = threading.Thread(
        target=_run_manual_eval_worker,
        args=(script_path, 'sweep', normalized),
        daemon=True,
    )
    worker.start()
    return jsonify({'ok': True, 'started': True, 'status': _manual_eval_snapshot()})


@app.get('/api/manual-eval/history')
def manual_eval_history():
    return jsonify({'ok': True, 'history': _load_history()})


@app.get('/<path:filename>')
def static_files(filename: str):
    return send_from_directory(str(ROOT), filename)


if __name__ == '__main__':
    port = int(os.getenv('PORT', '8000'))
    app.run(host='0.0.0.0', port=port, debug=True)
