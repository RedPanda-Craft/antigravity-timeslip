  // --------------------------------------------------------------------------
  // Feature: Timeslip Cockpit - TitleBar Round Icon & Catppuccin-Style HUD Menu
  // --------------------------------------------------------------------------

  // Google Material Symbols: history (temporal clock orbit, viewBox: 0 -960 960 960)
  const HISTORY_CLOCK_ICON_PATH =
    "M480-120q-138 0-240.5-91.5T122-440h82q14 104 92.5 172T480-200q117 0 198.5-81.5T760-480q0-117-81.5-198.5T480-760q-69 0-129 32t-101 88h110v80H120v-240h80v94q51-64 124.5-99T480-840q75 0 140.5 28.5t114 77q48.5 48.5 77 114T840-480q0 75-28.5 140.5t-77 114q-48.5 48.5-114 77T480-120Zm112-192L440-464v-216h80v184l128 128-56 56Z";

  let cockpitButtonHandle = null;
  let cockpitPopupEl = null;

  function isCockpitOpen() {
    return Boolean(cockpitPopupEl && cockpitPopupEl.classList.contains("is-open"));
  }

  function toggleTimeslipCockpit() {
    if (isCockpitOpen()) {
      closeTimeslipCockpit();
    } else {
      openTimeslipCockpit();
    }
  }

  function openTimeslipCockpit() {
    const triggerBtn =
      document.querySelector('[data-bettergravity-button="Timeslip"]') ||
      document.getElementById("bg-timeslip-titlebar-btn");

    if (!cockpitPopupEl) {
      cockpitPopupEl = createCockpitDOM();
      document.body.appendChild(cockpitPopupEl);
    }

    updateCockpitState();

    if (triggerBtn) {
      const rect = triggerBtn.getBoundingClientRect();
      const popupWidth = 284;
      let left = rect.right - popupWidth;
      if (left < 10) left = 10;
      if (left + popupWidth > window.innerWidth - 10) left = window.innerWidth - popupWidth - 10;
      cockpitPopupEl.style.top = `${rect.bottom + 6}px`;
      cockpitPopupEl.style.left = `${left}px`;
    } else {
      cockpitPopupEl.style.top = "38px";
      cockpitPopupEl.style.right = "100px";
      cockpitPopupEl.style.left = "auto";
    }

    requestAnimationFrame(() => {
      cockpitPopupEl.classList.add("is-open");
    });

    triggerBtn?.setAttribute?.("aria-pressed", "true");
    cockpitButtonHandle?.setActive?.(true);
  }

  function closeTimeslipCockpit() {
    if (cockpitPopupEl && cockpitPopupEl.classList.contains("is-open")) {
      cockpitPopupEl.classList.remove("is-open");
      const triggerBtn =
        document.querySelector('[data-bettergravity-button="Timeslip"]') ||
        document.getElementById("bg-timeslip-titlebar-btn");
      triggerBtn?.setAttribute?.("aria-pressed", "false");
      cockpitButtonHandle?.setActive?.(false);
    }
  }

  function createCockpitDOM() {
    const pop = document.createElement("div");
    pop.id = "bg-timeslip-cockpit-popup";
    pop.className = "bg-timeslip-cockpit-popup";
    pop.setAttribute("data-no-drag", "");

    pop.innerHTML = `
      <div class="bg-cockpit-header">
        <div class="bg-cockpit-title">Timeslip Cockpit</div>
        <div class="bg-cockpit-badge" id="bg-cockpit-badge">Active</div>
        <button type="button" class="bg-cockpit-close-btn" title="Close (Esc)">✕</button>
      </div>

      <!-- Section 1: Quick Launch -->
      <div class="bg-cockpit-section">
        <div class="bg-cockpit-section-label">QUICK LAUNCH</div>
        <div class="bg-cockpit-quick-grid">
          <button type="button" class="bg-cockpit-tool-card" id="bg-cockpit-btn-cards">
            <span class="bg-cockpit-card-icon">🗂️</span>
            <div class="bg-cockpit-card-text">
              <span class="bg-cockpit-card-name">Context Cards</span>
              <span class="bg-cockpit-card-sub" id="bg-cockpit-cards-count">Cards</span>
            </div>
          </button>
          <button type="button" class="bg-cockpit-tool-card" id="bg-cockpit-btn-extract">
            <span class="bg-cockpit-card-icon">📥</span>
            <div class="bg-cockpit-card-text">
              <span class="bg-cockpit-card-name">Extractor</span>
              <span class="bg-cockpit-card-sub">Export dialog</span>
            </div>
          </button>
        </div>
      </div>

      <!-- Section 2: Display Toggles -->
      <div class="bg-cockpit-section">
        <div class="bg-cockpit-section-label">INTERFACE DISPLAY</div>
        <div class="bg-cockpit-toggles-list">
          <div class="bg-cockpit-toggle-row">
            <div class="bg-cockpit-toggle-info">
              <span class="bg-cockpit-toggle-title">Timeline Rail</span>
              <span class="bg-cockpit-toggle-desc">Right-side navigation rail</span>
            </div>
            <button type="button" class="bg-cockpit-switch" id="bg-switch-rail" role="switch" aria-checked="true">
              <span class="bg-cockpit-switch-slider"></span>
            </button>
          </div>

          <div class="bg-cockpit-toggle-row">
            <div class="bg-cockpit-toggle-info">
              <span class="bg-cockpit-toggle-title">Telemetry Capsule</span>
              <span class="bg-cockpit-toggle-desc">TitleBar turns & compaction badge</span>
            </div>
            <button type="button" class="bg-cockpit-switch" id="bg-switch-health" role="switch" aria-checked="true">
              <span class="bg-cockpit-switch-slider"></span>
            </button>
          </div>

          <div class="bg-cockpit-toggle-row">
            <div class="bg-cockpit-toggle-info">
              <span class="bg-cockpit-toggle-title">Extract Pill</span>
              <span class="bg-cockpit-toggle-desc">TitleBar extract shortcut button</span>
            </div>
            <button type="button" class="bg-cockpit-switch" id="bg-switch-extract" role="switch" aria-checked="true">
              <span class="bg-cockpit-switch-slider"></span>
            </button>
          </div>

          <div class="bg-cockpit-toggle-row">
            <div class="bg-cockpit-toggle-info">
              <span class="bg-cockpit-toggle-title">Composer Cards</span>
              <span class="bg-cockpit-toggle-desc">Cards shortcut in chat composer</span>
            </div>
            <button type="button" class="bg-cockpit-switch" id="bg-switch-composer-cards" role="switch" aria-checked="true">
              <span class="bg-cockpit-switch-slider"></span>
            </button>
          </div>
        </div>
      </div>
    `;

    pop.querySelector(".bg-cockpit-close-btn")?.addEventListener("click", closeTimeslipCockpit);

    // Wire up Quick Launch buttons
    pop.querySelector("#bg-cockpit-btn-cards")?.addEventListener("click", () => {
      closeTimeslipCockpit();
      openCardsPopover();
    });

    pop.querySelector("#bg-cockpit-btn-extract")?.addEventListener("click", () => {
      closeTimeslipCockpit();
      openTimeslipExtractorModal();
    });

    // Wire up Switch Toggles
    const wireSwitch = (id, settingKey, applyFn) => {
      const btn = pop.querySelector(id);
      if (!btn) return;
      btn.addEventListener("click", () => {
        const next = !pluginSettings[settingKey];
        pluginSettings[settingKey] = next;
        savePluginSettings();
        applyFn(next);
        updateCockpitState();
      });
    };

    wireSwitch("#bg-switch-rail", "showRail", (val) => {
      const hud = document.getElementById("bg-timeline-hud");
      if (hud) hud.style.display = val ? "" : "none";
      if (val && typeof triggerRefresh === "function") triggerRefresh();
    });

    wireSwitch("#bg-switch-health", "showHealthPill", (val) => {
      const pill = document.getElementById("bg-header-health-pill");
      if (pill) pill.style.display = val ? "inline-flex" : "none";
      if (val && cachedHealthStats && typeof renderHeaderHealthPill === "function") {
        renderHeaderHealthPill(cachedHealthStats);
      }
    });

    wireSwitch("#bg-switch-extract", "showExtractPill", (val) => {
      const btn = document.getElementById("bg-header-export-btn");
      if (btn) btn.style.display = val ? "inline-flex" : "none";
      if (val && typeof renderHeaderExtractorBtn === "function") {
        const titleBar = document.querySelector('[data-testid="title-menu-bar"]');
        const pill = document.getElementById("bg-header-health-pill");
        renderHeaderExtractorBtn(titleBar, pill);
      }
    });

    wireSwitch("#bg-switch-composer-cards", "showComposerCards", (val) => {
      window.__bettergravityShowComposerCards = val;
      if (typeof setComposerCardsVisibility === "function") {
        setComposerCardsVisibility(val);
      }
    });

    return pop;
  }

  function updateCockpitState() {
    if (!cockpitPopupEl) return;

    // Update Cards count
    const cardsSub = cockpitPopupEl.querySelector("#bg-cockpit-cards-count");
    if (cardsSub) {
      cardsSub.textContent = `${timeslipCards.length} saved`;
    }

    // Update Switch States
    const setSwitch = (id, val) => {
      const btn = cockpitPopupEl.querySelector(id);
      if (btn) {
        btn.setAttribute("aria-checked", String(Boolean(val)));
        btn.classList.toggle("is-active", Boolean(val));
      }
    };

    setSwitch("#bg-switch-rail", pluginSettings.showRail !== false);
    setSwitch("#bg-switch-health", pluginSettings.showHealthPill !== false);
    setSwitch("#bg-switch-extract", pluginSettings.showExtractPill !== false);
    setSwitch("#bg-switch-composer-cards", pluginSettings.showComposerCards !== false);
  }

  const TIMESLIP_ONBOARDING_KEY = "bettergravity:timeslip:onboarding_v1";

  function triggerTimeslipOnboarding() {
    try {
      if (localStorage.getItem(TIMESLIP_ONBOARDING_KEY) === "true") return;
    } catch (_) {
      return;
    }

    setTimeout(() => {
      const btn =
        document.querySelector('[data-bettergravity-button="Timeslip"]') ||
        document.getElementById("bg-timeslip-titlebar-btn");
      if (!btn) return;

      // Avoid collision with other active callouts
      if (document.querySelector(".bg-onboarding-callout")) {
        setTimeout(triggerTimeslipOnboarding, 3500);
        return;
      }

      const dismiss = () => {
        try {
          localStorage.setItem(TIMESLIP_ONBOARDING_KEY, "true");
        } catch (_) {}
        callout.classList.remove("is-visible");
        setTimeout(() => callout.remove(), 250);
      };

      btn.addEventListener("click", dismiss, { once: true });

      const callout = document.createElement("div");
      callout.className = "bg-onboarding-callout";
      callout.setAttribute("data-no-drag", "true");
      callout.innerHTML = `
        <div class="bg-callout-caret"></div>
        <div class="bg-callout-header">
          <span class="bg-callout-icon">⏱️</span>
          <span class="bg-callout-title">Timeslip Ready</span>
        </div>
        <div class="bg-callout-body">
          Interactive conversation timeline, branch jump & context cards are active. Click to open Cockpit!
        </div>
        <div class="bg-callout-footer">
          <button type="button" class="bg-callout-btn" data-no-drag="true">Got it</button>
        </div>
      `;

      document.body.appendChild(callout);

      const rect = btn.getBoundingClientRect();
      const width = 240;
      let left = rect.left + rect.width / 2 - width / 2;
      left = Math.max(12, Math.min(window.innerWidth - width - 12, left));
      callout.style.top = `${rect.bottom + 8}px`;
      callout.style.left = `${left}px`;

      const caret = callout.querySelector(".bg-callout-caret");
      if (caret) {
        const caretLeft = Math.max(8, Math.min(width - 20, rect.left + rect.width / 2 - left - 6));
        caret.style.left = `${caretLeft}px`;
      }

      callout.querySelector(".bg-callout-btn")?.addEventListener("click", dismiss);

      requestAnimationFrame(() => {
        callout.classList.add("is-visible");
      });

      setTimeout(() => {
        if (document.body.contains(callout)) {
          dismiss();
        }
      }, 10000);
    }, 800);
  }

  function mountCockpitTitleBarButton() {
    if (cockpitButtonHandle) return;

    // 1. Try native BetterGravity plugin.ui.button
    try {
      if (plugin?.ui?.button && typeof plugin.ui.button === "function") {
        cockpitButtonHandle = plugin.ui.button({
          area: "titleBar",
          label: "Timeslip",
          icon: HISTORY_CLOCK_ICON_PATH,
          tooltip: "Timeslip Cockpit & Settings",
          onClick: toggleTimeslipCockpit
        });
        triggerTimeslipOnboarding();
        return;
      }
    } catch (_) {}

    // 2. Direct DOM fallback in TitleBar
    const titleBar = document.querySelector('[data-testid="title-menu-bar"]');
    if (!titleBar) return;

    let btn = document.getElementById("bg-timeslip-titlebar-btn");
    if (!btn) {
      btn = document.createElement("button");
      btn.type = "button";
      btn.id = "bg-timeslip-titlebar-btn";
      btn.className = "bg-timeslip-titlebar-btn";
      btn.setAttribute("data-no-drag", "");
      btn.setAttribute("aria-label", "Timeslip Cockpit");
      btn.setAttribute("title", "Timeslip Cockpit & Settings");
      btn.innerHTML = `<svg viewBox="0 -960 960 960" width="21" height="21"><path d="${HISTORY_CLOCK_ICON_PATH}" fill="currentColor"/></svg>`;

      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        toggleTimeslipCockpit();
      });

      titleBar.appendChild(btn);
      triggerTimeslipOnboarding();
    }
  }

  function unmountCockpit() {
    closeTimeslipCockpit();
    if (cockpitPopupEl) {
      cockpitPopupEl.remove();
      cockpitPopupEl = null;
    }
    if (cockpitButtonHandle) {
      cockpitButtonHandle.remove();
      cockpitButtonHandle = null;
    }
    document.getElementById("bg-timeslip-titlebar-btn")?.remove();
  }

  // Dismiss on outside click and Escape
  const onCockpitOutsideClick = (e) => {
    if (!cockpitPopupEl || !cockpitPopupEl.classList.contains("is-open")) return;
    const trigger =
      document.querySelector('[data-bettergravity-button="Timeslip"]') ||
      document.getElementById("bg-timeslip-titlebar-btn");
    if (cockpitPopupEl.contains(e.target) || trigger?.contains(e.target)) return;
    closeTimeslipCockpit();
  };

  const onCockpitKeydown = (e) => {
    if (e.key === "Escape" && cockpitPopupEl?.classList.contains("is-open")) {
      e.stopPropagation();
      closeTimeslipCockpit();
    }
  };

  window.addEventListener("click", onCockpitOutsideClick, true);
  window.addEventListener("keydown", onCockpitKeydown, true);
