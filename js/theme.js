(function () {
  const themeKey = "theme";
  const themes = { light: "light", dark: "dark", system: "system" };

  function getSystemTheme() {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function getStoredTheme() {
    return localStorage.getItem(themeKey);
  }

  function setTheme(theme) {
    const root = document.documentElement;
    const resolved = theme === themes.system ? getSystemTheme() : theme;
    if (resolved === themes.dark) root.setAttribute("data-theme", "dark");
    else root.removeAttribute("data-theme");
    const button = document.getElementById("theme-toggle");
    if (button) button.textContent = resolved === "dark" ? "☀️" : "🌙";
  }

  function initTheme() {
    const stored = getStoredTheme();
    setTheme(stored || themes.system);
  }

  window.toggleTheme = function toggleTheme() {
    const current = getStoredTheme() || themes.system;
    let next;
    if (current === themes.system) next = getSystemTheme() === "dark" ? themes.light : themes.dark;
    else if (current === themes.dark) next = themes.light;
    else next = themes.dark;
    localStorage.setItem(themeKey, next);
    setTheme(next);
  };

  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    const stored = getStoredTheme();
    if (!stored || stored === themes.system) setTheme(themes.system);
  });

  initTheme();
})();
