const EXTERNAL_HOSTS = [
  "facebook.com",
  "fb.com",
  "messenger.com",
  "instagram.com",
  "threads.net",
  "chatgpt.com",
  "openai.com",
  "x.com",
  "twitter.com",
];

const SENSITIVE_HOST_RE = /(^|\.)(bank|banks|banking|finance|finances|creditunion|credit-union|savings|wealth|invest|broker|mortgage|loan|loans|card|cards|payment|payments|wallet|secure|login|account)\b/i;

const DEFAULT_EXTERNAL_SEARCH = "https://duckduckgo.com/?q=";
const STORAGE_KEY = "northstar-browser-state";

const refs = {
  form: document.getElementById("navForm"),
  addressBar: document.getElementById("addressBar"),
  openTabBtn: document.getElementById("openTabBtn"),
  backBtn: document.getElementById("backBtn"),
  forwardBtn: document.getElementById("forwardBtn"),
  reloadBtn: document.getElementById("reloadBtn"),
  homeBtn: document.getElementById("homeBtn"),
  landingView: document.getElementById("landingView"),
  frameView: document.getElementById("frameView"),
  externalView: document.getElementById("externalView"),
  browserFrame: document.getElementById("browserFrame"),
  externalTitle: document.getElementById("externalTitle"),
  externalDescription: document.getElementById("externalDescription"),
  externalLink: document.getElementById("externalLink"),
  returnHomeBtn: document.getElementById("returnHomeBtn"),
  currentSite: document.getElementById("currentSite"),
  statusPill: document.getElementById("statusPill"),
  historyList: document.getElementById("historyList"),
  historyCount: document.getElementById("historyCount"),
  toast: document.getElementById("toast"),
};

function createHomeEntry() {
  return {
    kind: "home",
    url: "",
    title: "Local home",
    mode: "home",
    openedAt: Date.now(),
  };
}

function createDefaultState() {
  return {
    entries: [createHomeEntry()],
    index: 0,
  };
}

function sanitizeEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const kind = entry.kind === "home" ? "home" : "site";
  const mode = entry.mode === "embedded" || entry.mode === "external" || entry.mode === "home" ? entry.mode : "embedded";
  const url = typeof entry.url === "string" ? entry.url : "";
  const title = typeof entry.title === "string" && entry.title.trim() ? entry.title : kind === "home" ? "Local home" : titleFromUrl(url);
  const reason = typeof entry.reason === "string" ? entry.reason : "";
  const openedAt = Number.isFinite(entry.openedAt) ? entry.openedAt : Date.now();

  if (kind === "home") {
    return createHomeEntry();
  }

  return {
    kind: "site",
    url,
    title,
    mode: mode === "home" ? "embedded" : mode,
    reason,
    openedAt,
  };
}

function loadState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return createDefaultState();
    }

    const parsed = JSON.parse(raw);
    const entries = Array.isArray(parsed.entries)
      ? parsed.entries.map(sanitizeEntry).filter(Boolean)
      : [];
    const hasHome = entries.some((entry) => entry.kind === "home");
    const resolvedEntries = hasHome ? entries : [createHomeEntry(), ...entries];
    const index = Number.isInteger(parsed.index)
      ? Math.min(Math.max(parsed.index, 0), resolvedEntries.length - 1)
      : resolvedEntries.length - 1;

    return {
      entries: resolvedEntries.length ? resolvedEntries : [createHomeEntry()],
      index: resolvedEntries.length ? index : 0,
    };
  } catch {
    return createDefaultState();
  }
}

function persistState() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage failures in private mode or restricted contexts.
  }
}

const state = loadState();

function normalizeInput(rawValue) {
  const value = rawValue.trim();
  if (!value) {
    return null;
  }

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    return value;
  }

  if (/^localhost(:\d+)?(\/|$)/i.test(value) || /^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/|$)/.test(value)) {
    return `http://${value}`;
  }

  if (value.includes(" ") || !value.includes(".")) {
    return `${DEFAULT_EXTERNAL_SEARCH}${encodeURIComponent(value)}`;
  }

  return `https://${value}`;
}

function hostnameFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

function titleFromUrl(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./i, "");
    return host || "Untitled";
  } catch {
    return url || "Untitled";
  }
}

function isSearchUrl(url) {
  return url.startsWith(DEFAULT_EXTERNAL_SEARCH);
}

function shouldOpenExternally(url) {
  if (isSearchUrl(url)) {
    return true;
  }

  const host = hostnameFromUrl(url);
  if (!host) {
    return false;
  }

  if (EXTERNAL_HOSTS.some((domain) => host === domain || host.endsWith(`.${domain}`))) {
    return true;
  }

  return SENSITIVE_HOST_RE.test(host);
}

function formatAge(timestamp) {
  const delta = Date.now() - timestamp;
  const minutes = Math.max(1, Math.floor(delta / 60000));

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function setToast(message) {
  refs.toast.textContent = message;
  refs.toast.classList.add("show");
  window.clearTimeout(setToast.hideTimer);
  setToast.hideTimer = window.setTimeout(() => {
    refs.toast.classList.remove("show");
  }, 2800);
}

function updateHistorySidebar() {
  const historyEntries = state.entries.slice(1).reverse();
  refs.historyCount.textContent = `${historyEntries.length} item${historyEntries.length === 1 ? "" : "s"}`;

  if (!historyEntries.length) {
    refs.historyList.innerHTML = `
      <li class="history-item" aria-disabled="true">
        <span class="history-title">Nothing launched yet</span>
        <span class="history-meta"><span>Use the address bar</span><span>Ready</span></span>
      </li>
    `;
    return;
  }

  refs.historyList.innerHTML = historyEntries
    .map(
      (entry, index) => `
        <li>
          <button
            class="history-item"
            type="button"
            data-history-index="${state.entries.length - 1 - index}"
          >
            <span class="history-title">${escapeHtml(entry.title)}</span>
            <span class="history-meta">
              <span>${escapeHtml(entry.mode)}</span>
              <span>${formatAge(entry.openedAt)}</span>
            </span>
          </button>
        </li>
      `,
    )
    .join("");
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function pushEntry(entry) {
  state.entries = state.entries.slice(0, state.index + 1);
  state.entries.push(entry);
  state.index = state.entries.length - 1;
  persistState();
}

function renderState() {
  const current = state.entries[state.index];
  const isHome = current.kind === "home";
  const isExternal = current.mode === "external";
  const isEmbedded = current.mode === "embedded";

  refs.backBtn.disabled = state.index <= 0;
  refs.forwardBtn.disabled = state.index >= state.entries.length - 1;
  refs.reloadBtn.disabled = isHome;

  refs.addressBar.value = current.url || "";
  refs.currentSite.textContent = current.title;

  if (isHome) {
    refs.statusPill.textContent = "Ready";
    refs.landingView.classList.remove("hidden");
    refs.frameView.classList.add("hidden");
    refs.externalView.classList.add("hidden");
    refs.browserFrame.src = "about:blank";
    document.title = "Northstar Browser";
    updateHistorySidebar();
    persistState();
    return;
  }

  refs.landingView.classList.add("hidden");

  if (isExternal) {
    refs.statusPill.textContent = "External";
    refs.frameView.classList.add("hidden");
    refs.externalView.classList.remove("hidden");
    refs.externalTitle.textContent = current.title;
    refs.externalDescription.textContent =
      current.reason || "This site was opened in a separate browser tab because it blocks embedding.";
    refs.externalLink.href = current.url;
    document.title = `Northstar Browser - ${current.title}`;
  } else if (isEmbedded) {
    refs.statusPill.textContent = "Preview";
    refs.externalView.classList.add("hidden");
    refs.frameView.classList.remove("hidden");
    refs.browserFrame.src = current.url;
    document.title = `Northstar Browser - ${current.title}`;
  }

  updateHistorySidebar();
  persistState();
}

function openInBrowser(url) {
  const popup = window.open(url, "_blank");
  if (popup) {
    try {
      popup.opener = null;
    } catch {
      // noop
    }
    return true;
  }
  return false;
}

function navigate(rawValue, options = {}) {
  const normalized = normalizeInput(rawValue);
  if (!normalized) {
    setToast("Enter a website or search query.");
    return;
  }

  const forceExternal = options.forceExternal === true;
  const external = forceExternal || shouldOpenExternally(normalized);
  const title = isSearchUrl(normalized) ? "Search results" : titleFromUrl(normalized);
  const reason = forceExternal
    ? "Opened externally because you selected Open tab."
    : external && !isSearchUrl(normalized)
      ? "Opened externally because this site is treated as protected or blocks framing."
      : "";

  if (external) {
    const opened = openInBrowser(normalized);
    if (!opened) {
      setToast("Popup blocked. Allow popups or use the Open tab flow again.");
    } else {
      setToast(`Opened ${title} in a new browser tab.`);
    }
  } else {
    setToast(`Previewing ${title} inside the browser pane.`);
  }

  pushEntry({
    kind: "site",
    url: normalized,
    title,
    mode: external ? "external" : "embedded",
    reason,
    openedAt: Date.now(),
  });

  renderState();
}

function goHome() {
  pushEntry(createHomeEntry());
  setToast("Returned to the browser home screen.");
  renderState();
}

function goBack() {
  if (state.index <= 0) {
    return;
  }
  state.index -= 1;
  persistState();
  renderState();
}

function goForward() {
  if (state.index >= state.entries.length - 1) {
    return;
  }
  state.index += 1;
  persistState();
  renderState();
}

function reloadCurrent() {
  const current = state.entries[state.index];
  if (current.kind === "home") {
    setToast("Home screen is already loaded.");
    return;
  }

  if (current.mode === "external") {
    const opened = openInBrowser(current.url);
    if (opened) {
      setToast("Reopened the external tab.");
    }
    return;
  }

  refs.browserFrame.src = current.url;
  setToast("Reloaded the preview pane.");
}

function focusAddressBar() {
  refs.addressBar.focus();
  refs.addressBar.select();
}

function handleQuickAction(event) {
  const target = event.target.closest("button[data-url], button[data-focus]");
  if (!target) {
    return;
  }

  if (target.dataset.focus === "address") {
    focusAddressBar();
    setToast("Paste a website, bank URL, or search query, then press Launch.");
    return;
  }

  const url = target.dataset.url;
  const mode = target.dataset.mode;
  navigate(url, { forceExternal: mode === "external" });
}

function bindEvents() {
  refs.form.addEventListener("submit", (event) => {
    event.preventDefault();
    navigate(refs.addressBar.value);
  });

  refs.openTabBtn.addEventListener("click", () => {
    navigate(refs.addressBar.value, { forceExternal: true });
  });

  refs.backBtn.addEventListener("click", goBack);
  refs.forwardBtn.addEventListener("click", goForward);
  refs.reloadBtn.addEventListener("click", reloadCurrent);
  refs.homeBtn.addEventListener("click", goHome);
  refs.returnHomeBtn.addEventListener("click", goHome);

  document.querySelector(".sidebar").addEventListener("click", handleQuickAction);

  refs.historyList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-history-index]");
    if (!button) {
      return;
    }
    const index = Number(button.dataset.historyIndex);
    if (Number.isNaN(index)) {
      return;
    }
    state.index = index;
    persistState();
    renderState();
    const current = state.entries[state.index];
    if (current.kind !== "home") {
      if (current.mode === "external") {
        const opened = openInBrowser(current.url);
        setToast(
          opened
            ? `Reopened ${current.title} in a new browser tab.`
            : "Popup blocked. Use Open tab to retry.",
        );
      } else {
        setToast(`Revisited ${current.title}.`);
      }
    }
  });
}

function bootstrap() {
  bindEvents();
  updateHistorySidebar();
  renderState();
  setToast("Ready. Launch a site or open one externally.");
}

bootstrap();
