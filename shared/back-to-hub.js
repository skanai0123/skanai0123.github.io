(function createBackToHubButton() {
  if (!document.body || document.getElementById("shared-back-to-hub-nav")) {
    return;
  }

  var nav = document.createElement("nav");
  nav.id = "shared-back-to-hub-nav";
  nav.className = "shared-hub-panel";
  nav.setAttribute("aria-label", "Navigation");

  var link = document.createElement("a");
  link.className = "shared-nav-link shared-back-link";
  link.href = "https://skanai0123.github.io/";
  link.textContent = "Back to Hub";

  var report = document.createElement("a");
  report.className = "shared-nav-link shared-report-link";
  report.target = "_blank";
  report.rel = "noopener noreferrer";
  report.textContent = "Report Bug";

  var formBase = "https://docs.google.com/forms/d/e/1FAIpQLSeeOYJFGdl41iEUR_sJ9tm7XFoa8xzdoNlXP7ZflNwjPkf8pQ/viewform";
  var entryPlaygroundName = "entry.1663149615";
  var path = window.location.pathname.replace(/\/+$/, "");
  var segs = path.split("/").filter(Boolean);
  var pageName = "Hub";
  if (segs.length > 0) {
    var last = segs[segs.length - 1];
    if (/\.html?$/i.test(last)) {
      if (/^index(\..+)?\.html?$/i.test(last) || /^index\.html?$/i.test(last)) {
        pageName = segs.length >= 2 ? segs[segs.length - 2] : "Hub";
      } else {
        pageName = last.replace(/\.html?$/i, "");
      }
    } else {
      pageName = last;
    }
  }
  var params = new URLSearchParams({
    usp: "pp_url"
  });
  params.set(entryPlaygroundName, pageName);
  report.href = formBase + "?" + params.toString();

  nav.appendChild(link);
  nav.appendChild(report);
  document.body.insertBefore(nav, document.body.firstChild);
})();
