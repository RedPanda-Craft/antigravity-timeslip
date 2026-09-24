  // --------------------------------------------------------------------------
  // Core: Utilities, Reflection & Host DOM Discovery
  // --------------------------------------------------------------------------

  function loadPluginSettings() {
    let saved = null;
    try {
      saved = plugin.storage?.get?.("settings", null);
    } catch (_) {}
    if (!saved) {
      try {
        let raw = localStorage.getItem("__bettergravity_timeslip_settings");
        if (!raw) {
          raw = localStorage.getItem("__bettergravity_voyager_settings");
        }
        if (raw) saved = JSON.parse(raw);
      } catch (_) {}
    }
    return Object.assign(
      {
        redThreshold: 36,
        orangeThreshold: 19,
        yellowThreshold: 9,
        autoJumpSmooth: true,
        showRail: true,
        showHealthPill: true,
        showExtractPill: true,
        showComposerCards: true
      },
      saved || {}
    );
  }

  const pluginSettings = loadPluginSettings();

  function savePluginSettings() {
    try {
      plugin.storage?.set?.("settings", pluginSettings);
    } catch (_) {}
    try {
      localStorage.setItem("__bettergravity_timeslip_settings", JSON.stringify(pluginSettings));
    } catch (_) {}
  }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function showToast(message, type = "info") {
    let container = document.getElementById("bg-timeline-toast-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "bg-timeline-toast-container";
      container.style.cssText = `
        position: fixed;
        bottom: 24px;
        right: 24px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        z-index: 9999;
        pointer-events: none;
      `;
      document.body.appendChild(container);
    }

    const toast = document.createElement("div");
    const colors = {
      info: "#3b82f6",
      success: "#10b981",
      warning: "#f59e0b",
      error: "#ef4444"
    };
    toast.style.cssText = `
      padding: 8px 14px;
      border-radius: 8px;
      background: rgba(22, 22, 30, 0.96);
      border: 1px solid ${colors[type] || colors.info};
      color: #fff;
      font-size: 12px;
      box-shadow: 0 4px 14px rgba(0,0,0,0.4);
      pointer-events: auto;
      transition: opacity 200ms ease, transform 200ms ease;
      opacity: 0;
      transform: translateY(10px);
    `;
    toast.textContent = message;
    container.appendChild(toast);

    requestAnimationFrame(() => {
      toast.style.opacity = "1";
      toast.style.transform = "translateY(0)";
    });

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(10px)";
      setTimeout(() => toast.remove(), 220);
    }, 2800);
  }

  function findFiber(el) {
    if (!el) return null;
    const key = Object.keys(el).find(
      (k) => k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$")
    );
    return key ? el[key] : null;
  }

  function findHostStore() {
    const rootEl = document.getElementById("root") || document.body;
    let fiber = findFiber(rootEl);
    for (let depth = 0; fiber && depth < 60; depth += 1, fiber = fiber.child || fiber.sibling) {
      const s =
        fiber.memoizedProps?.value?.store ||
        fiber.memoizedProps?.store ||
        fiber.stateNode?.store;
      if (s && typeof s.getState === "function") return s;
    }
    return null;
  }

  let cachedAgentService = null;
  function findAgentService() {
    if (
      cachedAgentService &&
      (typeof cachedAgentService.getCascadeTrajectory === "function" ||
        typeof cachedAgentService.forkConversation === "function")
    ) {
      return cachedAgentService;
    }

    const anchors = [
      document.querySelector('[data-testid="conversation-view"]'),
      document.querySelector('[data-testid="conversation-row-sidebar"]'),
      document.querySelector('[data-testid="agent-input-box"]'),
      document.getElementById("root"),
      document.body
    ];

    for (const anchor of anchors) {
      if (!anchor) continue;
      let fiber = findFiber(anchor);
      for (let depth = 0; fiber && depth < 45; depth += 1, fiber = fiber.return) {
        const as =
          fiber.memoizedProps?.agentService ||
          fiber.memoizedProps?.value?.agentService ||
          fiber.memoizedProps?.value;
        if (as && (typeof as.getCascadeTrajectory === "function" || typeof as.forkConversation === "function")) {
          cachedAgentService = as;
          return as;
        }
        let dep = fiber.dependencies?.firstContext;
        for (let i = 0; dep && i < 30; i += 1, dep = dep.next) {
          const mv = dep.memoizedValue?.agentService || dep.memoizedValue;
          if (mv && (typeof mv.getCascadeTrajectory === "function" || typeof mv.forkConversation === "function")) {
            cachedAgentService = mv;
            return mv;
          }
        }
      }
    }
    return null;
  }

  function getCurrentConversationId(contextEl = null) {
    const hash = window.location.hash || window.location.pathname || "";
    const match = hash.match(/(?:cascade|conversation)[/=]([a-zA-Z0-9_-]+)/);
    if (match && match[1]) return match[1];

    const store = findHostStore();
    const state = store?.getState();
    const activeId =
      state?.cascade?.activeCascadeId ||
      state?.conversations?.activeConversationId ||
      state?.trajectories?.activeTrajectoryId;
    if (activeId) return activeId;

    const convView =
      contextEl?.closest?.('[data-testid="conversation-view"]') ||
      document.querySelector('[data-testid="conversation-view"]');
    if (convView) {
      const attrId =
        convView.getAttribute("data-cascade-id") ||
        convView.getAttribute("data-conversation-id");
      if (attrId) return attrId;
    }
    return null;
  }

  function getConversationTitle(cascadeId) {
    if (!cascadeId) return "";
    const store = findHostStore();
    try {
      const summary = store?.getState()?.trajectorySummaries?.summaries?.[cascadeId];
      if (summary?.summary) return summary.summary;
      if (summary?.title) return summary.title;
    } catch {}
    const row = document.querySelector(`[data-cascade-id="${CSS.escape(cascadeId)}"]`);
    const label = row?.querySelector("a[aria-label]")?.getAttribute("aria-label");
    if (label) return label;
    return cascadeId;
  }

  const stepInfoCache = new WeakMap();

  function resolveStepInfo(stepEl) {
    if (!stepEl) return { stepIndex: -1, userStepIndex: -1, globalStep: -1, convId: "" };

    const currentText = (stepEl.textContent || "").slice(0, 30);
    const cached = stepInfoCache.get(stepEl);
    if (
      cached &&
      (cached.userStepIndex >= 0 || cached.stepIndex >= 0) &&
      cached.convId &&
      cached.textPrefix === currentText
    ) {
      return cached;
    }

    let userStepIndex = -1;
    let globalStep = -1;
    let convId = "";

    const stepContainer =
      stepEl.closest("[data-user-step-index]") ||
      stepEl.closest("[data-step-index]") ||
      stepEl;

    const rawUserStep =
      stepEl.getAttribute("data-user-step-index") ||
      stepContainer.getAttribute("data-user-step-index");
    if (
      rawUserStep !== null &&
      rawUserStep !== "" &&
      !isNaN(parseInt(rawUserStep, 10)) &&
      parseInt(rawUserStep, 10) >= 0
    ) {
      userStepIndex = parseInt(rawUserStep, 10);
    }

    const rawStep =
      stepEl.getAttribute("data-step-index") ||
      stepContainer.getAttribute("data-step-index");
    if (
      rawStep !== null &&
      rawStep !== "" &&
      !isNaN(parseInt(rawStep, 10)) &&
      parseInt(rawStep, 10) >= 0
    ) {
      globalStep = parseInt(rawStep, 10);
    }

    convId =
      stepEl.getAttribute("data-step-cascade-id") ||
      stepContainer.getAttribute("data-cascade-id") ||
      stepContainer.getAttribute("data-step-cascade-id") ||
      "";

    if (userStepIndex < 0 || globalStep < 0 || !convId) {
      let fiber = findFiber(stepEl);
      for (let depth = 0; fiber && depth < 35; depth += 1, fiber = fiber.return) {
        for (const props of [fiber.memoizedProps, fiber.pendingProps]) {
          if (!props || typeof props !== "object") continue;

          if (!convId) {
            if (typeof props.cascadeId === "string" && props.cascadeId) {
              convId = props.cascadeId;
            } else if (typeof props.conversationId === "string" && props.conversationId) {
              convId = props.conversationId;
            }
          }

          if (userStepIndex < 0) {
            if (typeof props.userStepIndex === "number" && props.userStepIndex >= 0) {
              userStepIndex = props.userStepIndex;
            } else if (typeof props.userStep?.userStepIndex === "number" && props.userStep.userStepIndex >= 0) {
              userStepIndex = props.userStep.userStepIndex;
            }
          }

          if (globalStep < 0) {
            if (typeof props.stepIndex === "number" && props.stepIndex >= 0) {
              globalStep = props.stepIndex;
            } else if (typeof props.step?.stepIndex === "number" && props.step.stepIndex >= 0) {
              globalStep = props.step.stepIndex;
            }
          }
        }

        if (globalStep < 0 && fiber.key !== null && fiber.key !== undefined && /^\d+$/.test(String(fiber.key))) {
          const k = parseInt(fiber.key, 10);
          if (k >= 0) {
            const p = fiber.memoizedProps;
            if (p?.step || p?.metadata) {
              globalStep = k;
            }
          }
        }

        if (userStepIndex >= 0 && globalStep >= 0 && convId) break;
      }
    }

    if (!convId) {
      convId = getCurrentConversationId(stepEl);
    }

    const stepIndex = userStepIndex >= 0 ? userStepIndex : globalStep;
    const resolved = { stepIndex, userStepIndex, globalStep, convId, textPrefix: currentText };
    if (stepIndex >= 0) {
      stepInfoCache.set(stepEl, resolved);
    }
    return resolved;
  }

  function findScrollContainer(convView) {
    if (!convView) return null;
    if (
      convView.scrollHeight > convView.clientHeight + 20 &&
      window.getComputedStyle(convView).overflowY.match(/auto|scroll/)
    ) {
      return convView;
    }
    const candidates = [
      convView.querySelector('[data-testid="conversation-view-scroll-container"]'),
      convView.querySelector(".overflow-y-auto:not(#bg-timeline-hud *)"),
      convView.querySelector('[data-virtuoso-scroller="true"]'),
      convView.querySelector('[data-testid*="virtuoso"]'),
      convView.querySelector('[class*="scroll"]:not(#bg-timeline-hud *)')
    ];
    for (const c of candidates) {
      if (c && c.scrollHeight > c.clientHeight + 20) return c;
    }
    const shallow = convView.querySelectorAll(
      ":scope > div, :scope > div > div, :scope > div > div > div, :scope > div > div > div > div"
    );
    for (let i = 0; i < shallow.length; i++) {
      const el = shallow[i];
      if (el.id === "bg-timeline-hud" || el.closest("#bg-timeline-hud")) continue;
      if (el.scrollHeight > el.clientHeight + 30) {
        const o = window.getComputedStyle(el).overflowY;
        if (o === "auto" || o === "scroll") {
          return el;
        }
      }
    }
    return convView;
  }
