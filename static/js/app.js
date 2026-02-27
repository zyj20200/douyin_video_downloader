(function () {
  "use strict";

  const MODES = { video: "视频", audio: "音频", cover: "封面" };
  const HISTORY_KEY = "douyin_dl_history";
  const MAX_HISTORY = 10;

  /* --- DOM refs --- */
  const urlInput = document.getElementById("url-input");
  const pasteBtn = document.getElementById("paste-btn");
  const modeBtns = document.querySelectorAll(".mode-btn");
  const downloadBtn = document.getElementById("download-btn");
  const statusArea = document.getElementById("status-area");
  const statusMsg = document.getElementById("status-message");
  const logContent = document.getElementById("log-content");
  const clearLogBtn = document.getElementById("clear-log-btn");
  const historySection = document.getElementById("history-section");
  const historyList = document.getElementById("history-list");
  const clearHistoryBtn = document.getElementById("clear-history");

  let selectedMode = "video";
  let currentEventSource = null;

  /* --- Mode selector --- */
  modeBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      modeBtns.forEach(function (b) { b.classList.remove("active"); });
      btn.classList.add("active");
      selectedMode = btn.dataset.mode;
    });
  });

  /* --- Paste button --- */
  pasteBtn.addEventListener("click", async function () {
    try {
      const text = await navigator.clipboard.readText();
      urlInput.value = text;
      urlInput.focus();
    } catch (_) {
      urlInput.focus();
    }
  });

  /* --- Status helpers --- */
  function showStatus(text, type) {
    statusMsg.className = "status-message " + type;
    statusMsg.textContent = text;
    statusArea.classList.remove("hidden");
  }

  function hideStatus() {
    statusArea.classList.add("hidden");
  }

  function setLoading(on) {
    if (on) {
      downloadBtn.classList.add("loading");
      downloadBtn.disabled = true;
    } else {
      downloadBtn.classList.remove("loading");
      downloadBtn.disabled = false;
    }
  }

  /* --- Log helpers --- */
  function clearLog() {
    logContent.innerHTML = '<div class="log-empty">点击「开始下载」后，日志将在此处实时显示</div>';
  }

  function appendLog(message, level) {
    /* Remove placeholder on first real log */
    var empty = logContent.querySelector(".log-empty");
    if (empty) empty.remove();

    var line = document.createElement("div");
    line.className = "log-line level-" + (level || "INFO") + " log-line-new";
    line.textContent = message;
    logContent.appendChild(line);
    logContent.scrollTop = logContent.scrollHeight;
    line.addEventListener("animationend", function () {
      line.classList.remove("log-line-new");
    });
  }

  clearLogBtn.addEventListener("click", clearLog);

  /* --- Download via SSE --- */
  downloadBtn.addEventListener("click", function () {
    var url = urlInput.value.trim();
    if (!url) {
      showStatus("请输入抖音分享链接", "error");
      urlInput.focus();
      return;
    }

    if (currentEventSource) {
      currentEventSource.close();
      currentEventSource = null;
    }

    hideStatus();
    setLoading(true);

    /* Clear log and start fresh */
    var empty = logContent.querySelector(".log-empty");
    if (empty) empty.remove();
    /* Keep previous logs but add a separator if there's existing content */
    if (logContent.children.length > 0) {
      var sep = document.createElement("div");
      sep.className = "log-line level-DEBUG";
      sep.textContent = "─".repeat(40);
      logContent.appendChild(sep);
    }

    showStatus("正在解析链接并下载，请稍候...", "info");

    var params = new URLSearchParams({ url: url, mode: selectedMode });
    var evtSource = new EventSource("/api/download-stream?" + params.toString());
    currentEventSource = evtSource;

    evtSource.onmessage = function (event) {
      var data;
      try {
        data = JSON.parse(event.data);
      } catch (_) {
        return;
      }

      if (data.type === "log") {
        appendLog(data.message, data.level);
      } else if (data.type === "error") {
        appendLog(data.message, "ERROR");
        showStatus(data.message, "error");
        evtSource.close();
        currentEventSource = null;
        setLoading(false);
      } else if (data.type === "done") {
        evtSource.close();
        currentEventSource = null;

        if (data.success) {
          appendLog("下载完成！文件: " + data.download_name, "SUCCESS");
          showStatus("下载成功！正在保存文件...", "success");
          addHistory(data);

          var a = document.createElement("a");
          a.href = "/api/file/" + encodeURIComponent(data.filename);
          a.download = data.download_name;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        } else {
          appendLog("下载失败: " + (data.error || "未知错误"), "ERROR");
          showStatus(data.error || "下载失败，请检查链接是否正确", "error");
        }
        setLoading(false);
      }
    };

    evtSource.onerror = function () {
      evtSource.close();
      currentEventSource = null;
      appendLog("连接中断", "ERROR");
      showStatus("连接中断，请重试", "error");
      setLoading(false);
    };
  });

  urlInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      downloadBtn.click();
    }
  });

  /* --- History --- */
  function loadHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; }
    catch (_) { return []; }
  }

  function saveHistory(items) {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(items));
  }

  function addHistory(data) {
    var items = loadHistory();
    items.unshift({
      title: data.title || data.video_id,
      video_id: data.video_id,
      mode: data.mode,
      filename: data.filename,
      download_name: data.download_name,
      time: new Date().toLocaleString("zh-CN"),
    });
    if (items.length > MAX_HISTORY) items = items.slice(0, MAX_HISTORY);
    saveHistory(items);
    renderHistory();
  }

  function renderHistory() {
    var items = loadHistory();
    if (items.length === 0) {
      historySection.classList.add("hidden");
      return;
    }

    historySection.classList.remove("hidden");
    historyList.innerHTML = "";

    items.forEach(function (item) {
      var modeLabel = MODES[item.mode] || item.mode;
      var modeIcon = item.mode === "video" ? "\u25B6" : item.mode === "audio" ? "\u266B" : "\u25A3";

      var div = document.createElement("div");
      div.className = "history-item";
      div.innerHTML =
        '<div class="history-icon ' + item.mode + '">' + modeIcon + "</div>" +
        '<div class="history-info">' +
        '  <div class="history-title">' + escapeHtml(item.title) + "</div>" +
        '  <div class="history-meta">' + modeLabel + " &middot; " + item.time + "</div>" +
        "</div>" +
        '<a class="history-download" href="/api/file/' +
        encodeURIComponent(item.filename) +
        '" download="' + escapeHtml(item.download_name) + '" title="重新下载">' +
        '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>' +
        '<polyline points="7 10 12 15 17 10"/>' +
        '<line x1="12" y1="15" x2="12" y2="3"/>' +
        "</svg></a>";
      historyList.appendChild(div);
    });
  }

  function escapeHtml(str) {
    var el = document.createElement("span");
    el.textContent = str;
    return el.innerHTML;
  }

  clearHistoryBtn.addEventListener("click", function () {
    saveHistory([]);
    renderHistory();
  });

  renderHistory();
})();
