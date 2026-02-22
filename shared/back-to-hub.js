(function createBackToHubButton() {
  if (!document.body || document.getElementById("shared-back-to-hub-nav")) {
    return;
  }

  var nav = document.createElement("nav");
  nav.id = "shared-back-to-hub-nav";
  nav.className = "shared-hub-panel";
  nav.setAttribute("aria-label", "Navigation");

  var link = document.createElement("a");
  link.className = "shared-back-link";
  link.href = "https://skanai0123.github.io/";
  link.textContent = "Back to Hub";

  nav.appendChild(link);
  document.body.insertBefore(nav, document.body.firstChild);
})();
