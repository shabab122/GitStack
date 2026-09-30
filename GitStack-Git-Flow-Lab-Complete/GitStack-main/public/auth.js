(() => {
  "use strict";

  const modalMarkup = `
    <div class="role-modal" id="roleModal" hidden>
      <div class="role-modal-backdrop" data-role-close></div>
      <section class="role-dialog" role="dialog" aria-modal="true" aria-labelledby="roleDialogTitle">
        <button class="role-close" type="button" aria-label="Close" data-role-close>
          <i data-lucide="x"></i>
        </button>
        <span class="guide-label">CHOOSE YOUR ROLE</span>
        <h2 id="roleDialogTitle">How will you use GitStack?</h2>
        <p>Select your account type before continuing.</p>
        <div class="role-options">
          <button class="role-option" type="button" data-role="student">
            <i data-lucide="graduation-cap"></i>
            <strong>Student</strong>
            <span>Learn Git, complete missions, join teams and view your assessment.</span>
          </button>
          <button class="role-option" type="button" data-role="instructor">
            <i data-lucide="presentation"></i>
            <strong>Instructor</strong>
            <span>Create teams, assign missions, monitor activity and review reports.</span>
          </button>
        </div>
      </section>
    </div>`;

  let pendingAction = null;

  const LAST_ACCOUNT_KEY = "gitstack-last-accounts-v1";

  function readLastAccounts() {
    try {
      const parsed = JSON.parse(localStorage.getItem(LAST_ACCOUNT_KEY) || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function rememberAccount({ role, identifier, displayName }) {
    if (!role || !identifier) return;
    const accounts = readLastAccounts();
    accounts[role] = {
      identifier: String(identifier).trim(),
      displayName: String(displayName || identifier).trim(),
      updatedAt: Date.now()
    };
    localStorage.setItem(LAST_ACCOUNT_KEY, JSON.stringify(accounts));
  }

  function forgetAccount(role) {
    const accounts = readLastAccounts();
    delete accounts[role];
    localStorage.setItem(LAST_ACCOUNT_KEY, JSON.stringify(accounts));
  }

  async function offerCredentialToBrowser(identifier, password, displayName) {
    // Passwords are never written to localStorage/sessionStorage by GitStack.
    // When supported, the browser's own password manager receives the
    // credential and remains responsible for protecting/filling it.
    if (!identifier || !password || !window.PasswordCredential || !navigator.credentials?.store) return;
    try {
      const credential = new PasswordCredential({
        id: String(identifier),
        password: String(password),
        name: String(displayName || identifier)
      });
      await navigator.credentials.store(credential);
    } catch {
      // Browsers may decline programmatic storage or use their native save UI.
    }
  }

  async function fillFromBrowserCredential(savedIdentifier) {
    const identifierInput = document.getElementById("loginEmail");
    const passwordInput = document.getElementById("loginPassword");
    if (!identifierInput || !passwordInput) return false;

    identifierInput.value = savedIdentifier || "";
    identifierInput.dispatchEvent(new Event("input", { bubbles: true }));

    if (window.PasswordCredential && navigator.credentials?.get) {
      try {
        const credential = await navigator.credentials.get({
          password: true,
          mediation: "required"
        });
        if (credential?.type === "password" && credential.id && credential.password) {
          // Prefer the explicitly selected browser credential. The backend
          // still verifies both role and password before any login occurs.
          identifierInput.value = credential.id;
          passwordInput.value = credential.password;
          identifierInput.dispatchEvent(new Event("input", { bubbles: true }));
          passwordInput.dispatchEvent(new Event("input", { bubbles: true }));
          passwordInput.focus();
          return true;
        }
      } catch {
        // User cancelled or the browser does not expose a credential here.
      }
    }

    passwordInput.focus();
    return false;
  }

  function renderReturningAccount() {
    const form = document.querySelector('[data-auth-form="login"]');
    if (!form) return;
    const role = getRole();
    const account = readLastAccounts()[role];
    document.querySelector(".returning-account")?.remove();
    if (!account?.identifier) return;

    const panel = document.createElement("section");
    panel.className = "returning-account";
    panel.setAttribute("aria-label", "Previously used account");
    panel.innerHTML = `
      <div class="returning-account-icon"><i data-lucide="user-check"></i></div>
      <div class="returning-account-copy">
        <span>Previously used account</span>
        <strong data-no-translate>${escapeHtmlForAuth(account.displayName || account.identifier)}</strong>
        <small data-no-translate>${escapeHtmlForAuth(account.identifier)}</small>
        <p>Your browser password manager can fill the password securely. GitStack does not store your password on this device.</p>
      </div>
      <div class="returning-account-actions">
        <button type="button" class="returning-use">Use this account</button>
        <button type="button" class="returning-forget">Forget</button>
      </div>`;

    form.parentElement?.insertBefore(panel, form);
    panel.querySelector(".returning-use")?.addEventListener("click", async () => {
      const button = panel.querySelector(".returning-use");
      button.disabled = true;
      const filledPassword = await fillFromBrowserCredential(account.identifier);
      button.disabled = false;
      if (!filledPassword) {
        const message = form.querySelector(".form-message");
        if (message) {
          message.className = "form-message info show";
          message.textContent = "No saved browser password was available. Your account ID has been filled; choose the saved password from your browser if prompted.";
        }
      }
    });
    panel.querySelector(".returning-forget")?.addEventListener("click", () => {
      forgetAccount(role);
      panel.remove();
    });
    createIcons();
  }

  function escapeHtmlForAuth(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function createIcons() {
    window.lucide?.createIcons?.();
  }

  function ensureModal() {
    let modal = document.getElementById("roleModal");
    if (!modal) {
      document.body.insertAdjacentHTML("beforeend", modalMarkup);
      modal = document.getElementById("roleModal");
      createIcons();
    }
    return modal;
  }

  function inferAction(anchor) {
    const href = (anchor.getAttribute("href") || "").toLowerCase();
    const text = (anchor.textContent || "").trim().toLowerCase();
    if (href.includes("signup") || text.includes("sign up")) return "signup";
    if (href.includes("login") || text.includes("login")) return "login";
    return null;
  }

  document.addEventListener("click", (event) => {
    const anchor = event.target.closest("a");
    if (!anchor || anchor.matches("[data-auth-direct]")) return;

    const action = inferAction(anchor);
    if (!action) return;

    event.preventDefault();
    pendingAction = action;
    ensureModal().hidden = false;
    document.body.style.overflow = "hidden";
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest("[data-role-close]")) return;
    const modal = document.getElementById("roleModal");
    if (modal) modal.hidden = true;
    document.body.style.overflow = "";
    pendingAction = null;
  });

  document.addEventListener("click", (event) => {
    const option = event.target.closest("[data-role]");
    if (!option || !pendingAction) return;

    event.preventDefault();
    const action = pendingAction;
    const role = option.dataset.role;
    pendingAction = null;
    window.location.assign(`${action}.html?role=${encodeURIComponent(role)}`);
  });

  function getRole() {
    const role = new URLSearchParams(window.location.search).get("role");
    return role === "instructor" ? "instructor" : "student";
  }

  function setRoleContent() {
    const role = getRole();
    document.querySelectorAll("[data-role-label]").forEach((element) => {
      element.textContent = role === "instructor" ? "Instructor account" : "Student account";
    });
    document.querySelectorAll("[data-role-input]").forEach((element) => {
      element.value = role;
    });
    document.querySelectorAll("[data-role-switch-link]").forEach((element) => {
      element.href = `${element.dataset.roleSwitchLink}.html?role=${encodeURIComponent(role)}`;
    });
  }

  function passwordStrength(password) {
    return [
      password.length >= 8,
      /[A-Z]/.test(password) && /[a-z]/.test(password),
      /\d/.test(password),
      /[^A-Za-z0-9]/.test(password)
    ].filter(Boolean).length;
  }

  document.querySelectorAll("[data-password-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const input = document.getElementById(button.dataset.passwordToggle);
      if (!input) return;
      input.type = input.type === "password" ? "text" : "password";
      button.innerHTML =
        input.type === "password"
          ? '<i data-lucide="eye"></i>'
          : '<i data-lucide="eye-off"></i>';
      createIcons();
    });
  });

  const passwordInput = document.getElementById("password");
  const meter = document.querySelector(".password-meter");
  passwordInput?.addEventListener("input", () => {
    meter?.setAttribute("data-strength", String(passwordStrength(passwordInput.value)));
  });

  async function apiRequest(path, payload) {
    const response = await fetch(path, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = response.status === 204 ? {} : await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Request failed.");
    }
    return data;
  }

  document.querySelectorAll("[data-auth-form]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      const message = form.querySelector(".form-message");
      const submit = form.querySelector('button[type="submit"]');
      const formData = new FormData(form);
      const action = form.dataset.authForm;

      message.className = "form-message";
      submit.disabled = true;
      submit.setAttribute("aria-busy", "true");

      try {
        if (action === "signup") {
          const password = String(formData.get("password") || "");
          const confirmation = String(formData.get("confirmPassword") || "");

          if (password !== confirmation) {
            throw new Error("Passwords do not match.");
          }

          form.dataset.authResult = JSON.stringify(await apiRequest("/api/auth/register", {
            fullName: formData.get("fullName"),
            universityId: formData.get("institutionId"),
            email: formData.get("email"),
            department: formData.get("department"),
            semester: formData.get("semester"),
            role: formData.get("role"),
            password
          }));
        } else {
          form.dataset.authResult = JSON.stringify(await apiRequest("/api/auth/login", {
            identifier: formData.get("email"),
            role: formData.get("role"),
            password: formData.get("password")
          }));
        }

        const result = JSON.parse(form.dataset.authResult || "{}");
        const role = String(formData.get("role") || getRole());
        const identifier = String(
          action === "signup" ? formData.get("email") : formData.get("email")
        ).trim();
        const displayName = String(
          result.user?.fullName || formData.get("fullName") || identifier
        ).trim();
        const credentialPassword = String(formData.get("password") || "");
        rememberAccount({ role, identifier, displayName });
        void offerCredentialToBrowser(identifier, credentialPassword, displayName);

        message.className = "form-message success show";
        message.textContent =
          action === "signup"
            ? "Account created securely. Redirecting..."
            : "Login successful. Redirecting...";

        const requestedNext = new URLSearchParams(window.location.search).get("next");
        const safeNext = requestedNext && requestedNext.startsWith("/") && !requestedNext.startsWith("//")
          ? requestedNext
          : null;
        const destination = result.user?.role === "student"
          ? (safeNext || "student-dashboard.html")
          : result.user?.role === "instructor"
            ? (safeNext || "instructor-dashboard.html")
            : "home.html";
        form.reset();
        meter?.setAttribute("data-strength", "0");
        window.setTimeout(() => window.location.assign(destination), 700);
      } catch (error) {
        message.className = "form-message error show";
        message.textContent =
          error instanceof TypeError
            ? "Cannot reach the GitStack server. Start it with npm run dev and open http://localhost:3000."
            : error.message;
      } finally {
        submit.disabled = false;
        submit.removeAttribute("aria-busy");
      }
    });
  });

  document.addEventListener("DOMContentLoaded", () => {
    setRoleContent();
    renderReturningAccount();
    createIcons();
  });
})();