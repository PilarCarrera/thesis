from __future__ import annotations

import os
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


@app.get('/<path:filename>')
def static_files(filename: str):
    return send_from_directory(str(ROOT), filename)


if __name__ == '__main__':
    port = int(os.getenv('PORT', '8000'))
    app.run(host='0.0.0.0', port=port, debug=True)
