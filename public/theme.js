(() => {
  "use strict";
  const STORAGE_KEY = "gitstack-theme";
  const root = document.documentElement;

  function preferredTheme() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "dark" || saved === "light") return saved;
    return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light";
  }

  function applyTheme(theme) {
    const normalized = theme === "dark" ? "dark" : "light";
    root.dataset.theme = normalized;
    root.style.colorScheme = normalized;
    document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
      const isDark = normalized === "dark";
      button.setAttribute("aria-pressed", String(isDark));
      button.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
      button.setAttribute("title", isDark ? "Light mode" : "Dark mode");
      button.innerHTML = `<i data-lucide="${isDark ? "sun" : "moon"}"></i><span>${isDark ? "Light" : "Dark"}</span>`;
    });
    window.lucide?.createIcons?.();
  }

  function createThemeToggle() {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "theme-toggle";
    button.dataset.themeToggle = "";
    button.addEventListener("click", () => {
      const next = root.dataset.theme === "dark" ? "light" : "dark";
      localStorage.setItem(STORAGE_KEY, next);
      applyTheme(next);
    });
    return button;
  }

  function addHeaderBrand() {
    const pageTitle = document.querySelector(".student-page-title, .instructor-page-title");
    if (!pageTitle || pageTitle.querySelector(".topbar-brand")) return;
    const isInstructor = document.body.classList.contains("instructor-app");
    const brand = document.createElement("a");
    brand.className = "topbar-brand";
    brand.href = isInstructor ? "instructor-dashboard.html" : "student-dashboard.html";
    brand.setAttribute("aria-label", "GitStack dashboard home");
    brand.innerHTML = `<span class="topbar-brand-mark"><i data-lucide="git-branch"></i></span><span class="topbar-brand-word">Git<span>Stack</span></span>`;
    const mobileMenu = pageTitle.querySelector("[data-mobile-menu]");
    if (mobileMenu?.nextSibling) pageTitle.insertBefore(brand, mobileMenu.nextSibling);
    else pageTitle.prepend(brand);
  }

  function installControls() {
    addHeaderBrand();
    if (!document.querySelector("[data-theme-toggle]")) {
      const container = document.querySelector(".student-top-actions, .instructor-top-actions, .nav-actions");
      if (container) container.prepend(createThemeToggle());
    }
    applyTheme(root.dataset.theme || preferredTheme());
  }

  applyTheme(preferredTheme());
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", installControls, { once: true });
  else installControls();
})();
