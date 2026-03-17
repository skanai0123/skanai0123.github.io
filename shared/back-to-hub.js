(function createBackToHubButton() {
  if (!document.body || document.getElementById("shared-back-to-hub-nav")) {
    return;
  }

  var bodyData = document.body.dataset || {};
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
  var entryLabName = "entry.1663149615";
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
  params.set(entryLabName, pageName);
  report.href = formBase + "?" + params.toString();

  nav.appendChild(link);
  nav.appendChild(report);
  document.body.insertBefore(nav, document.body.firstChild);

  function renderMeta(metaSource) {
    var metaItems = [];
    var version = bodyData.pageVersion || metaSource.version;
    var updated = bodyData.pageUpdated || metaSource.updated;
    var copyright = bodyData.pageCopyright || metaSource.copyright;

    if (version) {
      metaItems.push("v" + version);
    }
    if (updated) {
      metaItems.push("Updated: " + updated);
    }
    if (copyright) {
      metaItems.push(copyright);
    }

    if (metaItems.length === 0) {
      return;
    }

    var meta = nav.querySelector(".shared-hub-meta");
    if (!meta) {
      meta = document.createElement("div");
      meta.className = "shared-hub-meta";
      nav.appendChild(meta);
    }

    meta.replaceChildren();
    metaItems.forEach(function(item) {
      var line = document.createElement("div");
      line.className = "shared-hub-meta-line";
      line.textContent = item;
      meta.appendChild(line);
    });
  }

  renderMeta({});

  function normalizeDate(value) {
    if (!value) {
      return "";
    }

    var date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "";
    }

    return date.toISOString().slice(0, 10);
  }

  function fetchJson(url) {
    return fetch(url, {
      headers: {
        Accept: "application/vnd.github+json"
      }
    }).then(function(response) {
      if (!response.ok) {
        throw new Error("Failed to fetch " + url);
      }
      return response.json();
    });
  }

  Promise.all([
    fetchJson("https://api.github.com/repos/skanai0123/skanai0123.github.io/tags?per_page=1")
      .then(function(tags) {
        return Array.isArray(tags) && tags.length > 0 ? tags[0].name || "" : "";
      })
      .catch(function() {
        return "";
      }),
    fetchJson("https://api.github.com/repos/skanai0123/skanai0123.github.io/commits?per_page=1")
      .then(function(commits) {
        var commit = Array.isArray(commits) && commits.length > 0 ? commits[0] : null;
        var committedAt = commit && commit.commit && commit.commit.committer
          ? commit.commit.committer.date
          : "";
        return {
          updated: normalizeDate(committedAt),
          fallbackVersion: "0.0.0"
        };
      })
      .catch(function() {
        return {
          updated: "",
          fallbackVersion: "0.0.0"
        };
      })
  ])
    .then(function(results) {
      var commitMeta = results[1] || {};
      renderMeta({
        version: results[0] || commitMeta.fallbackVersion || "",
        updated: commitMeta.updated || "",
        copyright: "© 2026 skanai"
      });
    })
    .catch(function() {
      // Keep local data attributes only when GitHub metadata is unavailable.
    });
})();
