(() => {
  "use strict";

  const state = { user: null };

  async function api(path, options = {}) {
    const response = await fetch(path, {
      credentials: "same-origin",
      ...options,
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {})
      }
    });
    const body = response.status === 204 ? null : await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(body?.error || `Request failed (${response.status}).`);
      error.status = response.status;
      error.body = body;
      throw error;
    }
    return body;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatDate(value, fallback = "—") {
    if (!value) return fallback;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? fallback : date.toLocaleString(window.GitStackLanguage?.getLanguage?.() === "bn" ? "bn-BD" : undefined);
  }

  function formatDateOnly(value, fallback = "—") {
    if (!value) return fallback;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? fallback : date.toLocaleDateString(window.GitStackLanguage?.getLanguage?.() === "bn" ? "bn-BD" : undefined);
  }

  function statusClass(status) {
    return String(status || "UNKNOWN").toLowerCase();
  }

  function statusLabel(status) {
    return String(status || "UNKNOWN").replaceAll("_", " ");
  }

  function roleLabel(role) {
    return String(role || "Member").replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function toast(message, kind = "info") {
    let stack = document.querySelector(".toast-stack");
    if (!stack) {
      stack = document.createElement("div");
      stack.className = "toast-stack";
      document.body.append(stack);
    }
    const item = document.createElement("div");
    item.className = `toast ${kind}`;
    item.textContent = message;
    stack.append(item);
    setTimeout(() => item.remove(), 3600);
  }

  async function ensureInstructor() {
    try {
      const data = await api("/api/auth/me");
      if (!['instructor', 'admin'].includes(data.user.role)) {
        window.location.replace(data.user.role === 'student' ? "student-dashboard.html" : "home.html");
        return null;
      }
      state.user = data.user;
      document.querySelectorAll("[data-instructor-name]").forEach((el) => {
        el.textContent = data.user.fullName || "Instructor";
      });
      document.querySelectorAll("[data-instructor-designation]").forEach((el) => {
        el.textContent = data.user.designation || "Instructor";
      });
      return data.user;
    } catch (error) {
      if (error.status === 401) {
        const target = encodeURIComponent(location.pathname + location.search);
        window.location.replace(`login.html?role=instructor&next=${target}`);
        return null;
      }
      throw error;
    }
  }

  async function logout() {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    window.location.assign("login.html?role=instructor");
  }

  function initShell() {
    const sidebar = document.querySelector(".instructor-sidebar");
    const menuButton = document.querySelector("[data-mobile-menu]");
    let backdrop = document.querySelector(".sidebar-backdrop");
    if (!backdrop) {
      backdrop = document.createElement("button");
      backdrop.type = "button";
      backdrop.className = "sidebar-backdrop";
      backdrop.setAttribute("aria-label", "Close navigation");
      document.body.append(backdrop);
    }

    const closeNavigation = () => {
      sidebar?.classList.remove("open");
      backdrop?.classList.remove("open");
      menuButton?.setAttribute("aria-expanded", "false");
    };

    const toggleNavigation = () => {
      const willOpen = !sidebar?.classList.contains("open");
      sidebar?.classList.toggle("open", willOpen);
      backdrop?.classList.toggle("open", willOpen);
      menuButton?.setAttribute("aria-expanded", String(willOpen));
    };

    menuButton?.setAttribute("aria-expanded", "false");
    menuButton?.addEventListener("click", toggleNavigation);
    backdrop?.addEventListener("click", closeNavigation);
    document.querySelectorAll(".instructor-nav a").forEach((link) => {
      link.addEventListener("click", closeNavigation);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeNavigation();
    });
    const nav = document.querySelector(".instructor-nav");
    if (nav && !nav.querySelector('[data-page="collaboration"]')) {
      const giteaLink = nav.querySelector('[data-page="gitea"]');
      const link = document.createElement("a");
      link.dataset.page = "collaboration";
      link.href = "instructor-collaboration.html";
      link.innerHTML = '<i data-lucide="network"></i>Collaboration';
      if (giteaLink) giteaLink.insertAdjacentElement("afterend", link);
      else nav.append(link);
    }

    document.querySelectorAll("[data-logout]").forEach((button) => button.addEventListener("click", logout));
    const current = document.body.dataset.instructorPage;
    document.querySelectorAll(".instructor-nav a[data-page]").forEach((link) => {
      link.classList.toggle("active", link.dataset.page === current);
    });
    window.lucide?.createIcons?.();
  }

  window.GitStackInstructor = {
    api,
    ensureInstructor,
    escapeHtml,
    formatDate,
    formatDateOnly,
    statusClass,
    statusLabel,
    roleLabel,
    toast,
    state
  };

  document.addEventListener("DOMContentLoaded", initShell);
})();
