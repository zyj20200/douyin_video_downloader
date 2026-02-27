from __future__ import annotations

import json
import logging
import os
import queue
import threading
from pathlib import Path

from flask import Flask, Response, jsonify, render_template, request, send_file

from downloader import (
    ContentTypeValidationError,
    DouyinAPIError,
    DouyinDownloader,
    DownloadFailedError,
)
from utils import (
    InvalidDouyinURLError,
    LinkResolutionError,
    VideoIdExtractionError,
    setup_logging,
)


BASE_DIR = Path(__file__).resolve().parent
LOGS_DIR = BASE_DIR / "logs"
DOWNLOAD_DIR = BASE_DIR / "downloads"
LOGGER = setup_logging(LOGS_DIR)

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 1024 * 1024 * 5


class _QueueLogHandler(logging.Handler):
    """Logging handler that pushes formatted records into a queue."""

    def __init__(self, log_queue: queue.Queue):
        super().__init__()
        self.log_queue = log_queue

    def emit(self, record: logging.LogRecord) -> None:
        self.log_queue.put(self.format(record))


@app.get("/health")
def health() -> tuple[dict[str, str], int]:
    return {"status": "ok"}, 200


@app.route("/")
def index():
    return render_template("index.html")


@app.get("/api/download-stream")
def download_stream():
    share_input = (request.args.get("url") or "").strip()
    mode = (request.args.get("mode") or "video").strip().lower()
    if mode not in {"video", "audio", "cover"}:
        mode = "video"

    def _sse(data: dict) -> str:
        return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"

    def generate():
        if not share_input:
            yield _sse({"type": "error", "message": "请提供有效的抖音分享链接"})
            return

        log_queue: queue.Queue[str | None] = queue.Queue()

        stream_logger = logging.getLogger(f"douyin_stream_{id(log_queue)}")
        stream_logger.setLevel(logging.DEBUG)
        stream_logger.propagate = False
        handler = _QueueLogHandler(log_queue)
        handler.setFormatter(logging.Formatter("%(asctime)s | %(levelname)s | %(message)s"))
        stream_logger.addHandler(handler)

        result_holder: dict = {}
        error_holder: dict = {}

        def do_download():
            try:
                with DouyinDownloader(
                    output_dir=DOWNLOAD_DIR,
                    timeout=(10, 30),
                    max_retries=3,
                    backoff_factor=1.0,
                    logger=stream_logger,
                ) as downloader:
                    result = downloader.download_from_share_url(
                        share_input=share_input,
                        mode=mode,
                        show_progress=False,
                    )
                    result_holder["data"] = result
            except (
                InvalidDouyinURLError,
                LinkResolutionError,
                VideoIdExtractionError,
                DouyinAPIError,
                DownloadFailedError,
                ContentTypeValidationError,
            ) as exc:
                LOGGER.error("Stream download failed: %s", exc)
                error_holder["message"] = str(exc)
            except Exception as exc:
                LOGGER.exception("Unexpected stream error: %s", exc)
                error_holder["message"] = "服务器内部错误，请查看日志"
            finally:
                log_queue.put(None)

        thread = threading.Thread(target=do_download, daemon=True)
        thread.start()

        yield _sse({"type": "log", "level": "INFO", "message": "开始处理下载请求..."})

        while True:
            try:
                msg = log_queue.get(timeout=60)
            except queue.Empty:
                yield _sse({"type": "ping"})
                continue
            if msg is None:
                break
            level = "INFO"
            if "| WARNING |" in msg:
                level = "WARNING"
            elif "| ERROR |" in msg:
                level = "ERROR"
            elif "| DEBUG |" in msg:
                level = "DEBUG"
            yield _sse({"type": "log", "level": level, "message": msg})

        thread.join(timeout=5)

        if "data" in result_holder:
            r = result_holder["data"]
            yield _sse({
                "type": "done",
                "success": True,
                "video_id": r.video_id,
                "title": r.title,
                "mode": r.mode,
                "filename": r.file_path.name,
                "download_name": r.file_path.name,
            })
        else:
            yield _sse({
                "type": "done",
                "success": False,
                "error": error_holder.get("message", "未知错误"),
            })

    return Response(generate(), mimetype="text/event-stream", headers={
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
    })


@app.get("/api/file/<filename>")
def api_serve_file(filename: str):
    safe_name = Path(filename).name
    file_path = DOWNLOAD_DIR / safe_name
    if not file_path.is_file():
        return jsonify(success=False, error="文件不存在"), 404
    return send_file(file_path, as_attachment=True, download_name=safe_name)


if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=False, threaded=True)
