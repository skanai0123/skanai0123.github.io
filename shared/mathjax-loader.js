(function () {
  if (window.__sharedMathJaxLoaderInstalled) return;
  window.__sharedMathJaxLoaderInstalled = true;

  const defaults = {
    tex: {
      inlineMath: [["\\(", "\\)"]],
      displayMath: [["\\[", "\\]"]]
    },
    svg: {
      fontCache: "global"
    }
  };

  if (!window.MathJax) {
    window.MathJax = defaults;
  } else {
    window.MathJax.tex = window.MathJax.tex || defaults.tex;
    window.MathJax.svg = window.MathJax.svg || defaults.svg;
  }

  function toNodeList(target) {
    if (!target) return undefined;
    if (Array.isArray(target)) return target;
    return [target];
  }

  window.renderMath = function (target) {
    if (window.MathJax && typeof window.MathJax.typesetPromise === "function") {
      return window.MathJax.typesetPromise(toNodeList(target));
    }
    return Promise.resolve();
  };

  const SCRIPT_ID = "shared-mathjax-tex-svg";
  const existing = document.getElementById(SCRIPT_ID);
  if (existing) return;

  const script = document.createElement("script");
  script.id = SCRIPT_ID;
  script.defer = true;
  script.src = "https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js";
  script.onload = function () {
    window.renderMath().finally(function () {
      window.dispatchEvent(new Event("mathjax:ready"));
    });
  };
  document.head.appendChild(script);
})();
