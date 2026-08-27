(function () {
  if (window.__osceSupportBot) return;
  window.__osceSupportBot = true;

  var OPEN_KEY = "osce_support_seen_v1";

  var style = document.createElement("style");
  style.textContent =
    "#osb-fab{position:fixed;right:20px;bottom:20px;z-index:9998;width:52px;height:52px;border-radius:50%;" +
    "background:#2a6049;color:#fff;border:none;cursor:pointer;font-size:22px;line-height:1;" +
    "box-shadow:0 6px 20px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;}" +
    "#osb-fab:hover{background:#22503c;}" +
    "#osb-panel{position:fixed;right:20px;bottom:20px;z-index:9999;width:400px;max-width:calc(100vw - 32px);" +
    "height:560px;max-height:calc(100vh - 40px);background:#fff;border-radius:14px;display:none;flex-direction:column;" +
    "box-shadow:0 12px 40px rgba(0,0,0,.28);overflow:hidden;" +
    "font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif;}" +
    "#osb-panel.open{display:flex;}" +
    "#osb-head{background:#1c1917;color:#f5f2ed;padding:12px 14px;display:flex;align-items:center;" +
    "justify-content:space-between;flex-shrink:0;}" +
    "#osb-head .t{font-size:14px;font-weight:600;}" +
    "#osb-head .s{font-size:11px;color:#a8a29e;margin-top:1px;}" +
    "#osb-close{background:none;border:none;color:#d6d3d1;font-size:20px;cursor:pointer;line-height:1;padding:0 4px;}" +
    "#osb-body{flex:1;overflow-y:auto;padding:14px;background:#f5f2ed;}" +
    "#osb-body .m{margin-bottom:12px;font-size:13.5px;line-height:1.55;}" +
    "#osb-body .m.u{text-align:right;}" +
    "#osb-body .m.u span{display:inline-block;background:#2a6049;color:#fff;padding:8px 11px;border-radius:12px 12px 2px 12px;max-width:85%;text-align:left;}" +
    "#osb-body .m.b span{display:inline-block;background:#fff;border:1px solid #e7e5e4;padding:9px 12px;" +
    "border-radius:12px 12px 12px 2px;max-width:92%;}" +
    "#osb-body .m.b p{margin:0 0 7px;}#osb-body .m.b p:last-child{margin-bottom:0;}" +
    "#osb-body .m.b ul{margin:6px 0 6px 18px;padding:0;}#osb-body .m.b li{margin-bottom:3px;}" +
    "#osb-body .m.b strong{font-weight:600;}" +
    "#osb-body .m.b code{background:#f5f2ed;padding:1px 4px;border-radius:3px;font-size:12px;}" +
    "#osb-src{margin-top:7px;font-size:11px;color:#78716c;}" +
    "#osb-src a{color:#2a6049;text-decoration:none;margin-right:8px;}" +
    "#osb-src a:hover{text-decoration:underline;}" +
    "#osb-ctx{font-size:11px;color:#78716c;padding:7px 14px;background:#eeeae3;border-bottom:1px solid #ddd8cf;" +
    "flex-shrink:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}" +
    "#osb-foot{border-top:1px solid #e7e5e4;padding:10px;display:flex;gap:8px;flex-shrink:0;background:#fff;}" +
    "#osb-in{flex:1;border:1px solid #ddd8cf;border-radius:8px;padding:9px 11px;font-size:13.5px;" +
    "font-family:inherit;resize:none;max-height:90px;}" +
    "#osb-send{background:#2a6049;color:#fff;border:none;border-radius:8px;padding:0 15px;font-weight:600;" +
    "cursor:pointer;font-size:13px;}" +
    "#osb-send:disabled{opacity:.5;cursor:default;}" +
    "#osb-hint{font-size:11px;color:#a8a29e;padding:0 14px 9px;background:#f5f2ed;}" +
    "@media(max-width:520px){#osb-panel{right:8px;left:8px;bottom:8px;width:auto;height:calc(100vh - 16px);}}";
  document.head.appendChild(style);

  var fab = document.createElement("button");
  fab.id = "osb-fab";
  fab.innerHTML = "💬";
  fab.title = "Ask about this page";
  document.body.appendChild(fab);

  // Some pages (e.g. index.html) already ship a TG4-specific chat button in the
  // bottom-right. Stack above it rather than covering it.
  (function avoidExistingFabs() {
    var others = document.querySelectorAll("#tg4-chat-btn, #tg4p-form");
    var lift = 0;
    for (var i = 0; i < others.length; i++) {
      var el = others[i];
      if (getComputedStyle(el).display === "none") continue;
      var r = el.getBoundingClientRect();
      // Only care about things hugging the bottom-right corner.
      if (window.innerWidth - r.right < 160 && window.innerHeight - r.bottom < 200) {
        lift = Math.max(lift, window.innerHeight - r.top + 12);
      }
    }
    if (lift) fab.style.bottom = lift + "px";
  })();

  var panel = document.createElement("div");
  panel.id = "osb-panel";
  panel.innerHTML =
    '<div id="osb-head"><div><div class="t">OSCE Coach assistant</div>' +
    '<div class="s">Ask about this station or anything on the site</div></div>' +
    '<button id="osb-close">×</button></div>' +
    '<div id="osb-ctx"></div>' +
    '<div id="osb-body"></div>' +
    '<div id="osb-hint">Study aid only — check doses against Therapeutic Guidelines.</div>' +
    '<div id="osb-foot"><textarea id="osb-in" rows="1" placeholder="e.g. What\'s the role of atorvastatin here?"></textarea>' +
    '<button id="osb-send">Ask</button></div>';
  document.body.appendChild(panel);

  var body = document.getElementById("osb-body");
  var input = document.getElementById("osb-in");
  var sendBtn = document.getElementById("osb-send");
  var ctxEl = document.getElementById("osb-ctx");

  /**
   * Work out which station/section the user is actually looking at, by finding
   * the case-card nearest the top of the viewport. Read live from the DOM so it
   * can never disagree with what's on screen.
   */
  function currentSection() {
    // .case-card = ideal-answers.html stations; .s-card = index.html stations.
    var cards = document.querySelectorAll(".case-card, .s-card");
    var best = null;
    var bestDist = Infinity;
    for (var i = 0; i < cards.length; i++) {
      var r = cards[i].getBoundingClientRect();
      if (r.bottom < 80) continue;
      var dist = Math.abs(r.top - 90);
      if (dist < bestDist) {
        bestDist = dist;
        best = cards[i];
      }
    }
    if (best) {
      var h = best.querySelector("h3, h2, .s-title, .pq-title");
      return {
        title: h ? h.textContent.replace(/\s+/g, " ").trim() : "",
        text: best.innerText.slice(0, 12000),
        anchor: best.id ? "#" + best.id : "",
      };
    }
    var main = document.querySelector("main");
    return {
      title: document.title,
      text: main ? main.innerText.slice(0, 6000) : "",
      anchor: "",
    };
  }

  function updateCtx() {
    var s = currentSection();
    ctxEl.textContent = s.title ? "Context: " + s.title : "Context: " + document.title;
  }

  function esc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function renderMd(t) {
    var h = esc(t);
    h = h.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    h = h.replace(/`([^`]+)`/g, "<code>$1</code>");
    var lines = h.split("\n");
    var out = "";
    var inList = false;
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i].trim();
      if (/^\|/.test(ln)) continue; // ignore stray table rows
      if (/^-{3,}$/.test(ln)) continue; // horizontal rule
      if (/^#{1,6}\s+/.test(ln)) {
        if (inList) { out += "</ul>"; inList = false; }
        out += "<p><strong>" + ln.replace(/^#{1,6}\s+/, "") + "</strong></p>";
        continue;
      }
      if (/^[-*]\s+/.test(ln) || /^\d+\.\s+/.test(ln)) {
        if (!inList) { out += "<ul>"; inList = true; }
        out += "<li>" + ln.replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, "") + "</li>";
      } else {
        if (inList) { out += "</ul>"; inList = false; }
        if (ln) out += "<p>" + ln + "</p>";
      }
    }
    if (inList) out += "</ul>";
    return out;
  }

  function addMsg(cls, html) {
    var d = document.createElement("div");
    d.className = "m " + cls;
    var sp = document.createElement("span");
    sp.innerHTML = html;
    d.appendChild(sp);
    body.appendChild(d);
    body.scrollTop = body.scrollHeight;
    return sp;
  }

  function open() {
    panel.classList.add("open");
    fab.style.display = "none";
    updateCtx();
    if (!localStorage.getItem(OPEN_KEY)) {
      addMsg("b", "<p>Ask me anything about the station you're reading, or anything else on this site — why a finding matters, what a drug is doing there, how to structure an answer.</p>");
      localStorage.setItem(OPEN_KEY, "1");
    }
    setTimeout(function () { input.focus(); }, 50);
  }
  function close() {
    panel.classList.remove("open");
    fab.style.display = "flex";
  }

  fab.onclick = open;
  document.getElementById("osb-close").onclick = close;

  input.addEventListener("input", function () {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 90) + "px";
  });
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      ask();
    }
  });
  sendBtn.onclick = ask;

  function ask() {
    var q = input.value.trim();
    if (!q) return;
    var section = currentSection();
    addMsg("u", esc(q));
    input.value = "";
    input.style.height = "auto";
    var out = addMsg("b", "…");
    sendBtn.disabled = true;

    fetch("/api/support", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: q,
        pageTitle: section.title || document.title,
        pagePath: location.pathname,
        pageContext: section.text,
        contextAnchor: section.anchor,
      }),
    })
      .then(function (res) {
        if (!res.ok || !res.body) throw new Error("bad response");
        var sources = [];
        try { sources = JSON.parse(res.headers.get("X-Sources") || "[]"); } catch (e) {}
        var reader = res.body.getReader();
        var dec = new TextDecoder();
        var text = "";
        out.textContent = "";
        function pump() {
          return reader.read().then(function (r) {
            if (r.done) {
              out.innerHTML = renderMd(text);
              if (sources.length) {
                var s = document.createElement("div");
                s.id = "osb-src";
                s.innerHTML = "Related: " + sources.slice(0, 3).map(function (x) {
                  return '<a href="' + x.href + '">' + esc(x.title) + "</a>";
                }).join("");
                out.appendChild(s);
              }
              body.scrollTop = body.scrollHeight;
              return;
            }
            text += dec.decode(r.value, { stream: true });
            out.textContent = text;
            body.scrollTop = body.scrollHeight;
            return pump();
          });
        }
        return pump();
      })
      .catch(function () {
        out.textContent = "Sorry — something went wrong. Please try again.";
      })
      .finally(function () {
        sendBtn.disabled = false;
        input.focus();
      });
  }

  window.addEventListener("scroll", function () {
    if (panel.classList.contains("open")) updateCtx();
  }, { passive: true });
})();
