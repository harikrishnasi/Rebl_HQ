// Applies the saved theme before first paint (no flash). External so the CSP
// can forbid inline scripts (script-src 'self') without needing 'unsafe-inline'.
try {
  if (localStorage.getItem("rebl.theme") === "light") {
    document.documentElement.dataset.theme = "light";
    document.addEventListener("DOMContentLoaded", function () {
      var m = document.querySelector('meta[name="theme-color"]');
      if (m) m.setAttribute("content", "#F5F4F2");
    });
  }
} catch (e) {}
