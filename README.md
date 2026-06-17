# StudyBuddy

An AI-powered reading assistant developed as a proof of concept for a master's thesis in Applied Computer Science at KU Leuven.

StudyBuddy helps dyslexic students engage with reading texts by providing a context-aware chat interface. The AI assistant (StudyBuddy) answers questions strictly based on the provided reading material, supporting comprehension without revealing answers to embedded comprehension questions.

## Prerequisites

- Python 3.10 or higher
- An OpenAI-compatible API key

## Installation

1. Clone the repository

2. Install dependencies
   ```bash
   pip install flask flask-cors requests python-dotenv
   ```

3. Create a `.env` file in the project root and add your API key
   ```
   OPENAI_API_KEY=your_api_key_here
   ```
   Optionally, set a custom API base URL (e.g. for Azure OpenAI or a local model):
   ```
   OPENAI_BASE_URL=https://api.openai.com
   ```

4. Install `cloudflared` — the app routes all AI requests through a Cloudflare tunnel, so this is required even for local use. A `.deb` installer for Linux is included in the repository:
   ```bash
   sudo dpkg -i cloudflared-linux-amd64.deb
   ```
   On other platforms, download the binary from the [Cloudflare Downloads page](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/).

5. Start the Flask server and the tunnel in two separate terminals:
   ```bash
   python server.py
   ```
   ```bash
   cloudflared tunnel --url http://localhost:8000
   ```

6. Cloudflare will print a public URL such as `https://some-random-words.trycloudflare.com`. Update `js/config.js` with this URL:
   ```js
   export const OPENAI_PROXY_URL = 'https://your-tunnel-url.trycloudflare.com/api/response';
   export const OPENAI_HEALTH_URL = 'https://your-tunnel-url.trycloudflare.com/api/health';
   ```

   > The tunnel URL changes every time `cloudflared` is restarted, so `config.js` must be updated each session.

7. Open the public tunnel URL in your browser and enter the access password

## Project Structure

```
studybuddy/
├── server.py           # Flask backend
├── index.html          # Mode selection screen
├── option1.html        # App – condition A
├── option2.html        # App – condition B
├── styles.css          # Global styles
├── js/                 # Frontend JavaScript modules
│   ├── chat.js         # Chat logic and filtering
│   ├── prompt.js       # System prompt builder
│   ├── rag.js          # Context retrieval
│   └── ...
├── Context/            # Reading texts and prompt files
├── tools/              # Evaluation scripts
└── .env                # API credentials (not committed)
```
