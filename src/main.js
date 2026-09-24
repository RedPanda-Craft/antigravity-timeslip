  // --------------------------------------------------------------------------
  // Main: Pipeline Orchestration & Plugin Lifecycle Management
  // --------------------------------------------------------------------------

  function isUserTyping() {
    const active = document.activeElement;
    if (!active) return false;
    const tag = active.tagName ? active.tagName.toLowerCase() : "";
    if (tag === "textarea" || tag === "input") return true;
    if (active.isContentEditable) return true;
    return Boolean(
      active.closest(
        'textarea, input, [contenteditable], [data-testid*="input"], [data-testid*="composer"], .bg-inline-edit-box'
      )
    );
  }

  let refreshDebounceTimer = null;
  function scheduleRefresh(delay = 200) {
    clearTimeout(refreshDebounceTimer);
    refreshDebounceTimer = setTimeout(triggerRefresh, delay);
  }

  function triggerRefresh() {
    if (isUserTyping()) {
      scheduleRefresh(400);
      return;
    }
    renderTimelineHUD();
  }

  let lastTrackedConvId = null;
  const pollInterval = setInterval(() => {
    if (isUserTyping()) return;
    const activeId = getCurrentConversationId();
    if (activeId !== lastTrackedConvId) {
      clearJumpWarmth();
      lastTrackedConvId = activeId;
      triggerRefresh();
    }
  }, 300);

  let isStoreSubscribed = false;
  const storeSubCheck = setInterval(() => {
    if (isStoreSubscribed) {
      clearInterval(storeSubCheck);
      return;
    }
    const store = findHostStore();
    if (store && typeof store.subscribe === "function") {
      isStoreSubscribed = true;
      store.subscribe(() => {
        if (isUserTyping()) return;
        scheduleRefresh(300);
      });
      clearInterval(storeSubCheck);
    }
  }, 500);

  plugin.dom.observe('[data-testid="title-menu-bar"]', (target) => {
    if (isUserTyping()) return;
    if (target?.closest?.('#bg-timeline-hud, #bg-header-health-pill, #bg-header-export-btn, #bg-timeslip-titlebar-btn, textarea, [contenteditable]')) return;
    if (typeof mountCockpitTitleBarButton === "function") {
      mountCockpitTitleBarButton();
    }
    if (cachedHealthStats && typeof renderHeaderHealthPill === "function") {
      renderHeaderHealthPill(cachedHealthStats);
    }
    if (typeof renderHeaderExtractorBtn === "function") {
      const pill = document.getElementById("bg-header-health-pill");
      const titleBar = document.querySelector('[data-testid="title-menu-bar"]');
      if (titleBar) renderHeaderExtractorBtn(titleBar, pill);
    }
  });

  plugin.dom.observe('[data-testid="conversation-view"]', (target) => {
    if (isUserTyping()) return;
    if (target?.closest?.('#bg-timeline-hud, #bg-header-health-pill, #bg-header-export-btn, #bg-header-cards-btn, textarea, [contenteditable]')) return;
    if (typeof hookComposerSubmit === "function") {
      hookComposerSubmit();
    }
    if (typeof mountComposerCardsButton === "function") {
      mountComposerCardsButton();
    }
    scheduleRefresh(250);
  });

  const onComposerSendKeydown = (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      const activeEl = document.activeElement;
      if (
        activeEl &&
        (activeEl.matches("textarea, [contenteditable]") ||
          activeEl.closest('[data-testid="agent-input-box"], .bg-chat-composer'))
      ) {
        clearJumpWarmth();
      }
    }
  };

  const onComposerSendClick = (e) => {
    const btn = e.target?.closest?.(
      'button[data-testid*="send"], button[aria-label*="Send"], button[aria-label*="发送"], [data-testid="send-button"]'
    );
    if (btn) {
      clearJumpWarmth();
    }
  };

  const onUndoActionClick = (e) => {
    const target = e.target;
    if (!target) return;
    const text = target.textContent || "";
    if (
      text.includes("Undo") ||
      text.includes("回滚") ||
      text.includes("撤销") ||
      target.closest?.('[data-testid*="undo"], [data-action*="undo"]')
    ) {
      lastSyncedStepCount = -1;
      setTimeout(() => {
        const activeId = getCurrentConversationId();
        const convView = document.querySelector('[data-testid="conversation-view"]');
        if (activeId) {
          syncTrajectoryUserTurns(activeId, convView, true);
        }
      }, 150);
    }
  };

  window.addEventListener("keydown", onComposerSendKeydown, true);
  window.addEventListener("click", onComposerSendClick, true);
  window.addEventListener("click", onUndoActionClick, true);

  setTimeout(triggerRefresh, 600);
  setTimeout(triggerRefresh, 1500);

  if (typeof mountCockpitTitleBarButton === "function") {
    mountCockpitTitleBarButton();
  }
  if (typeof mountComposerCardsButton === "function") {
    mountComposerCardsButton();
  }

  // --------------------------------------------------------------------------
  // Lifecycle Disposal
  // --------------------------------------------------------------------------
  plugin.onDispose(() => {
    window.removeEventListener("keydown", onComposerSendKeydown, true);
    window.removeEventListener("click", onComposerSendClick, true);
    window.removeEventListener("click", onUndoActionClick, true);
    clearJumpWarmth();
    activeRelayJumpToken++;
    hideTimelineTooltip();
    if (typeof activeScrollTeardown === "function") {
      activeScrollTeardown();
      activeScrollTeardown = null;
    }
    clearInterval(pollInterval);
    clearInterval(storeSubCheck);
    clearTimeout(refreshDebounceTimer);

    document
      .querySelectorAll(".bg-step-jump-bubble, .bg-step-jump-pulse, .bg-step-jump-warmth, .bg-step-jump-fading")
      .forEach((el) => {
        el.classList.remove("bg-step-jump-bubble", "bg-step-jump-pulse", "bg-step-jump-warmth", "bg-step-jump-fading");
      });

    document.getElementById("bg-timeline-hud")?.remove();
    document.getElementById("bg-header-health-pill")?.remove();
    document.getElementById("bg-header-export-btn")?.remove();
    document.getElementById("bg-timeslip-extractor-overlay")?.remove();
    document.getElementById("bg-timeslip-cards-popover")?.remove();
    document.getElementById("bg-timeslip-attached-slot")?.remove();
    document.getElementById("bg-timeline-toast-container")?.remove();

    if (typeof unmountComposerCardsButton === "function") {
      unmountComposerCardsButton();
    }
    if (typeof unmountCockpit === "function") {
      unmountCockpit();
    }
    if (typeof saveTurnRegistry === "function") {
      saveTurnRegistry(true);
    }
    if (typeof flushSaveCards === "function") {
      flushSaveCards();
    }

    delete globalThis.__bettergravityRenderStatus;
    delete globalThis.__bettergravityTimeslipExtract;
    delete globalThis.__bettergravityTimeslipCards;
    delete globalThis.__bettergravityTimeslipCockpit;
  });

  globalThis.__bettergravityTimeslipCards = {
    open: (anchor) => (typeof openCardsPopover === "function" ? openCardsPopover(anchor) : null),
    close: () => (typeof closeCardsPopover === "function" ? closeCardsPopover() : null),
    toggle: (anchor) => (typeof toggleCardsPopover === "function" ? toggleCardsPopover(anchor) : null),
    add: (content, title, origin, tags) => (typeof addCard === "function" ? addCard(content, title, origin, tags) : null),
    attach: (card) => (typeof attachCardToComposer === "function" ? attachCardToComposer(card) : null)
  };

  globalThis.__bettergravityTimeslipCockpit = {
    open: () => (typeof openTimeslipCockpit === "function" ? openTimeslipCockpit() : null),
    close: () => (typeof closeTimeslipCockpit === "function" ? closeTimeslipCockpit() : null),
    toggle: () => (typeof toggleTimeslipCockpit === "function" ? toggleTimeslipCockpit() : null)
  };
