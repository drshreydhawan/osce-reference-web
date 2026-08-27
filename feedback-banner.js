(function () {
  var DISMISS_KEY = "osce_feedback_dismissed_v2";
  if (localStorage.getItem(DISMISS_KEY)) return;

  var style = document.createElement("style");
  style.textContent =
    "#osce-fb-banner{position:fixed;left:16px;bottom:16px;z-index:9999;" +
    "width:360px;max-width:calc(100vw - 32px);background:#1c1917;color:#f5f2ed;border-radius:12px;" +
    "padding:16px 18px;box-shadow:0 8px 30px rgba(0,0,0,.25);" +
    "font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif;font-size:14px;line-height:1.5;}" +
    "#osce-fb-banner h4{margin:0 0 4px;font-size:15px;font-weight:600;}" +
    "#osce-fb-banner p{margin:0 0 12px;color:#d6d3d1;}" +
    "#osce-fb-banner .osce-fb-row{display:flex;gap:8px;}" +
    "#osce-fb-banner button{cursor:pointer;border-radius:8px;padding:8px 14px;font-size:13px;font-weight:600;border:none;}" +
    "#osce-fb-give{background:#f5f2ed;color:#1c1917;}" +
    "#osce-fb-dismiss{background:transparent;color:#d6d3d1;}" +
    "#osce-fb-modal{position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.5);" +
    "display:flex;align-items:center;justify-content:center;padding:16px;overflow-y:auto;}" +
    "#osce-fb-modal .osce-fb-card{background:#fff;color:#1c1917;border-radius:14px;padding:22px;" +
    "max-width:460px;width:100%;font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif;" +
    "max-height:calc(100vh - 32px);overflow-y:auto;}" +
    "#osce-fb-modal h3{margin:0 0 4px;font-size:17px;}" +
    "#osce-fb-modal p.osce-fb-sub{margin:0 0 16px;color:#78716c;font-size:13px;}" +
    "#osce-fb-modal .osce-fb-field{margin-bottom:16px;}" +
    "#osce-fb-modal .osce-fb-label{display:block;font-size:13px;font-weight:600;margin-bottom:6px;}" +
    "#osce-fb-modal .osce-fb-label span{font-weight:400;color:#78716c;}" +
    "#osce-fb-modal .osce-fb-stars{display:flex;gap:6px;}" +
    "#osce-fb-modal .osce-fb-stars button{background:none;border:none;font-size:24px;cursor:pointer;color:#ddd8cf;padding:0;}" +
    "#osce-fb-modal .osce-fb-stars button.active{color:#e0a020;}" +
    "#osce-fb-modal textarea{width:100%;min-height:90px;border:1px solid #ddd8cf;border-radius:8px;" +
    "padding:10px;font-family:inherit;font-size:14px;resize:vertical;}" +
    "#osce-fb-modal .osce-fb-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:6px;}" +
    "#osce-fb-modal .osce-fb-actions button{cursor:pointer;border-radius:8px;padding:9px 16px;" +
    "font-size:13px;font-weight:600;border:none;}" +
    "#osce-fb-cancel{background:#f5f2ed;color:#1c1917;}" +
    "#osce-fb-submit{background:#2a6049;color:#fff;}" +
    "#osce-fb-thanks{font-size:14px;color:#14532d;}";
  document.head.appendChild(style);

  var banner = document.createElement("div");
  banner.id = "osce-fb-banner";
  banner.innerHTML =
    "<h4>Help OSCE Coach make this better</h4>" +
    "<p>We build this free, for every ADC candidate — not just our own students. " +
    "Two minutes of honest feedback genuinely shapes what we build next.</p>" +
    '<div class="osce-fb-row">' +
    '<button id="osce-fb-give">Give feedback →</button>' +
    '<button id="osce-fb-dismiss">Not now</button>' +
    "</div>";
  document.body.appendChild(banner);

  function dismissBanner() {
    banner.remove();
    localStorage.setItem(DISMISS_KEY, "1");
  }
  document.getElementById("osce-fb-dismiss").onclick = dismissBanner;

  document.getElementById("osce-fb-give").onclick = function () {
    banner.remove();
    openModal();
  };

  function starRow(containerId, onPick) {
    var el = document.getElementById(containerId);
    for (var i = 1; i <= 5; i++) {
      (function (n) {
        var b = document.createElement("button");
        b.type = "button";
        b.textContent = "★";
        b.onclick = function () {
          onPick(n);
          Array.prototype.forEach.call(el.children, function (star, idx) {
            star.classList.toggle("active", idx < n);
          });
        };
        el.appendChild(b);
      })(i);
    }
  }

  function openModal() {
    var usefulness = 0;
    var realism = 0;
    var modal = document.createElement("div");
    modal.id = "osce-fb-modal";
    modal.innerHTML =
      '<div class="osce-fb-card">' +
      "<h3>Feedback for OSCE Coach</h3>" +
      '<p class="osce-fb-sub">Anonymous — no login, no email needed. Rate what applies, skip what doesn\'t.</p>' +
      '<div class="osce-fb-field">' +
      '<label class="osce-fb-label">How useful is this? <span>(is it actually helping you prep?)</span></label>' +
      '<div class="osce-fb-stars" id="osce-fb-useful"></div>' +
      "</div>" +
      '<div class="osce-fb-field">' +
      '<label class="osce-fb-label">How close to the real exam? <span>(stations, style, difficulty)</span></label>' +
      '<div class="osce-fb-stars" id="osce-fb-realism"></div>' +
      "</div>" +
      '<div class="osce-fb-field">' +
      '<label class="osce-fb-label">Anything specific? <span>(what\'s wrong, missing, or should change — the more detail the better)</span></label>' +
      '<textarea id="osce-fb-text" placeholder="e.g. \'Station X felt nothing like my actual exam because...\' or \'The ideal-answers page needs...\'"></textarea>' +
      "</div>" +
      '<div class="osce-fb-actions">' +
      '<button id="osce-fb-cancel">Cancel</button>' +
      '<button id="osce-fb-submit">Send</button>' +
      "</div>" +
      "</div>";
    document.body.appendChild(modal);

    starRow("osce-fb-useful", function (n) {
      usefulness = n;
    });
    starRow("osce-fb-realism", function (n) {
      realism = n;
    });

    document.getElementById("osce-fb-cancel").onclick = function () {
      modal.remove();
      localStorage.setItem(DISMISS_KEY, "1");
    };

    document.getElementById("osce-fb-submit").onclick = function () {
      var text = document.getElementById("osce-fb-text").value.trim();
      if (!text && !usefulness && !realism) return;
      var card = modal.querySelector(".osce-fb-card");
      card.innerHTML = '<p id="osce-fb-thanks">Thanks — genuinely appreciated. 🙏</p>';
      setTimeout(function () {
        modal.remove();
      }, 1400);
      localStorage.setItem(DISMISS_KEY, "1");
      fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          usefulnessRating: usefulness || undefined,
          realismRating: realism || undefined,
          page: location.pathname,
        }),
      }).catch(function () {});
    };
  }
})();
