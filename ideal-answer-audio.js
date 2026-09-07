(function () {
  var style = document.createElement("style");
  style.textContent =
    ".ia-audio-btn{display:inline-flex;align-items:center;gap:6px;margin:0 0 10px;padding:7px 14px;" +
    "border-radius:20px;border:1px solid var(--border);background:var(--card);color:var(--text);" +
    "font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;}" +
    ".ia-audio-btn:hover{border-color:#2A6049;}" +
    ".ia-audio-btn[data-state=loading]{opacity:.6;cursor:wait;}" +
    ".ia-audio-btn[data-state=error]{border-color:#b91c1c;color:#b91c1c;}" +
    ".ia-audio-player{display:none;width:100%;margin:0 0 10px;}" +
    ".ia-audio-player.active{display:block;}";
  document.head.appendChild(style);

  var LABELS = { idle: "🔊 Listen to this answer", loading: "Loading…", error: "Couldn't load audio — try again" };

  document.querySelectorAll(".case-card[id^='st-']").forEach(function (card) {
    var brief = card.querySelector(".ia-brief");
    if (!brief) return;

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ia-audio-btn";
    btn.dataset.state = "idle";
    btn.textContent = LABELS.idle;

    var audio = document.createElement("audio");
    audio.className = "ia-audio-player";
    audio.controls = true;
    audio.preload = "none";

    brief.insertAdjacentElement("afterend", audio);
    brief.insertAdjacentElement("afterend", btn);

    btn.addEventListener("click", function () {
      if (audio.classList.contains("active")) {
        // Already loaded — the click just toggled focus to a native control below; do nothing extra.
        return;
      }
      btn.dataset.state = "loading";
      btn.textContent = LABELS.loading;
      audio.src = "/api/ideal-answer-audio?station=" + encodeURIComponent(card.id);
      audio.addEventListener(
        "error",
        function () {
          btn.dataset.state = "error";
          btn.textContent = LABELS.error;
        },
        { once: true }
      );
      audio.addEventListener(
        "loadedmetadata",
        function () {
          audio.classList.add("active");
          btn.style.display = "none";
          audio.play().catch(function () {});
        },
        { once: true }
      );
      audio.load();
    });
  });
})();
