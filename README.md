# Douyin Video Downloader

**[中文文档](README_zh.md)**

A professional Douyin (TikTok China) video downloader with a modern Web UI and CLI support.

![](static\img\home.png)

## Features

- **Watermark-free video download** — automatically removes watermark (`playwm` -> `play`)
- **Multiple download modes** — video, audio-only, or cover image
- **Smart filename** — files are saved with the video title instead of just the ID
- **Real-time log streaming** — Web UI shows live download progress via Server-Sent Events (SSE)
- **Two-panel Web UI** — left panel for download config & history, right panel for real-time logs
- **Download history** — locally stored recent downloads with one-click re-download
- **Short link resolution** — supports `v.douyin.com` share links with automatic redirect following
- **WAF bypass** — built-in SHA-256 proof-of-work solver for Douyin's JS challenge
- **Exponential-backoff retries** — resilient to transient network and API errors
- **CLI + Web** — use from the terminal or through the browser

## Project Structure

```
douyin_video_downloader/
├── app.py              # Flask web application (SSE streaming, file serving)
├── downloader.py       # Core download engine
├── utils.py            # URL extraction, redirect resolution, logging
├── main.py             # CLI entry point
├── templates/
│   └── index.html      # Web UI template (two-column layout)
├── static/
│   ├── css/style.css   # Dark theme styles
│   └── js/app.js       # Frontend logic (SSE, history, log panel)
├── downloads/          # Downloaded files output directory
├── logs/               # Rotating log files
├── requirements.txt
├── runtime.txt         # Python version (3.10.14)
├── Procfile            # Deployment config
└── LICENSE             # MIT License
```

## Requirements

- Python 3.10+
- Dependencies: `requests`, `Flask`

```bash
pip install -r requirements.txt
```

## Web UI

```bash
python app.py
```

Open `http://127.0.0.1:5000` in your browser.

**Usage:**
1. Paste a Douyin share link in the input field
2. Select download type (video / audio / cover)
3. Click "Download" — real-time logs appear in the right panel
4. The file is automatically saved to your browser's download folder

## CLI Usage

Interactive mode:

```bash
python main.py
```

With arguments:

```bash
python main.py "https://v.douyin.com/xxxxx/" --mode video
python main.py "https://v.douyin.com/xxxxx/" --mode audio
python main.py "https://v.douyin.com/xxxxx/" --mode cover
```

Options:

| Flag | Default | Description |
|------|---------|-------------|
| `--mode` | `video` | Download mode: `video`, `audio`, or `cover` |
| `--output-dir` | `downloads` | Output directory |
| `--connect-timeout` | `10` | Connection timeout (seconds) |
| `--read-timeout` | `30` | Read timeout (seconds) |
| `--retries` | `3` | Max retry attempts |
| `--backoff-factor` | `1.0` | Exponential backoff multiplier |

## Deployment

This repo includes `Procfile`, `runtime.txt`, and `requirements.txt` for one-click deployment on Railway, Render, or Heroku.

```bash
gunicorn app:app --bind 0.0.0.0:$PORT --workers 2 --timeout 120
```

## License

[MIT](LICENSE)
