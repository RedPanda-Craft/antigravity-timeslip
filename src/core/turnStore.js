  // --------------------------------------------------------------------------
  // Core: Turn Store & Virtual List Trajectory Engine
  // --------------------------------------------------------------------------

  let cachedHealthStats = null;
  let activeScrollContainer = null;
  let activeScrollTeardown = null;

  const TURN_STORAGE_KEY = "__bg_conversation_turns_v1";
  const MAX_STORED_CONVERSATIONS = 30;
  const conversationTurnRegistry = new Map();

  function loadTurnRegistry() {
    let obj = null;
    try {
      const diskData = plugin.storage?.get?.("conversation_turns", null);
      if (diskData && typeof diskData === "object") {
        obj = diskData;
      }
    } catch (_) {}

    if (!obj) {
      try {
        const raw = localStorage.getItem(TURN_STORAGE_KEY);
        if (raw) {
          obj = JSON.parse(raw);
          if (obj && typeof obj === "object") {
            try {
              plugin.storage?.set?.("conversation_turns", obj);
            } catch (_) {}
          }
        }
      } catch (_) {}
    }

    if (obj) {
      for (const [k, v] of Object.entries(obj)) {
        if (Array.isArray(v)) conversationTurnRegistry.set(k, v);
      }
    }
  }
  loadTurnRegistry();

  let saveTurnDebounceTimer = null;
  function saveTurnRegistry(immediate = false) {
    if (immediate) {
      clearTimeout(saveTurnDebounceTimer);
      flushSaveTurnRegistry();
      return;
    }
    clearTimeout(saveTurnDebounceTimer);
    saveTurnDebounceTimer = setTimeout(flushSaveTurnRegistry, 300);
  }

  function flushSaveTurnRegistry() {
    try {
      if (conversationTurnRegistry.size > MAX_STORED_CONVERSATIONS) {
        const keys = Array.from(conversationTurnRegistry.keys());
        const toRemove = keys.slice(0, keys.length - MAX_STORED_CONVERSATIONS);
        toRemove.forEach((k) => conversationTurnRegistry.delete(k));
      }

      const exportObj = {};
      for (const [convId, list] of conversationTurnRegistry.entries()) {
        exportObj[convId] = (list || []).map((item, idx) => ({
          key: item.key || `turn_${idx}`,
          turnIndex: typeof item.turnIndex === "number" ? item.turnIndex : idx,
          globalStep: item.globalStep,
          snippet: item.snippet,
          prompt: (item.fullText || item.prompt || item.snippet || "").slice(0, 100)
        }));
      }
      try {
        plugin.storage?.set?.("conversation_turns", exportObj);
      } catch (_) {}
      localStorage.setItem(TURN_STORAGE_KEY, JSON.stringify(exportObj));
    } catch (err) {
      plugin.log?.warn?.(`[STORAGE_WARN] Failed to save turn registry: ${err.message}`);
    }
  }

  let isSyncingTrajectory = false;
  let lastSyncedId = null;
  let lastSyncedStepCount = -1;

  async function syncTrajectoryUserTurns(activeId, convView = null, forceSync = false) {
    if (!activeId || isSyncingTrajectory) return;
    const agentService = findAgentService();
    if (!agentService || typeof agentService.getCascadeTrajectory !== "function") return;

    const store = findHostStore();
    const summaries = store?.getState()?.trajectorySummaries?.summaries || {};
    const summary = summaries[activeId];
    const currentStepCount = summary?.stepCount ?? summary?.trajectoryMetadata?.stepCount ?? 0;

    let possibleTailTruncation = false;
    const turnList = conversationTurnRegistry.get(activeId);
    if (turnList && turnList.length > 1 && convView) {
      const scrollTarget = findScrollContainer(convView);
      if (scrollTarget) {
        const isAtBottom = scrollTarget.scrollTop + scrollTarget.clientHeight >= scrollTarget.scrollHeight - 60;
        if (isAtBottom) {
          const mounted = convView.querySelectorAll('[data-testid="user-input-step"]');
          if (mounted.length > 0) {
            const lastEl = mounted[mounted.length - 1];
            const lastTurn = findTurnIndexForStep(lastEl, turnList);
            if (lastTurn >= 0 && lastTurn < turnList.length - 1) {
              possibleTailTruncation = true;
            }
          }
        }
      }
    }

    const hasGaps = turnList && (turnList.some((t, i) => t.turnIndex !== i) || turnList.length === 0);

    if (
      !forceSync &&
      !possibleTailTruncation &&
      !hasGaps &&
      activeId === lastSyncedId &&
      currentStepCount > 0 &&
      currentStepCount === lastSyncedStepCount
    ) {
      return;
    }

    isSyncingTrajectory = true;
    try {
      let res = null;
      try {
        res = await agentService.getCascadeTrajectory({ cascadeId: activeId });
      } catch (_) {
        res = await agentService.getCascadeTrajectory(activeId);
      }
      const trajectory = res?.trajectory || res;
      const steps = trajectory?.steps || trajectory?.trajectorySteps || [];

      if (Array.isArray(steps)) {
        const prevTurnList = conversationTurnRegistry.get(activeId) || [];
        const freshTurns = [];
        let userTurnCount = 0;

        steps.forEach((s, idx) => {
          if (s.step?.case === "userInput") {
            const currentTurnIndex = userTurnCount++;
            const val = s.step.value || {};
            let text = "";
            if (Array.isArray(val.items)) {
              text = val.items
                .map((it) => {
                  if (typeof it === "string") return it;
                  if (it.chunk?.value && typeof it.chunk.value === "string") return it.chunk.value;
                  if (it.text && typeof it.text === "string") return it.text;
                  return "";
                })
                .join("")
                .trim();
            }
            if (!text && typeof val.query === "string") text = val.query.trim();
            if (!text && typeof val.userResponse === "string") text = val.userResponse.trim();
            text = text.replace(/^\[object Object\]\s*/g, "").trim();
            if (!text) text = `Turn #${currentTurnIndex + 1}`;

            freshTurns.push({
              key: `turn_${currentTurnIndex}`,
              turnIndex: currentTurnIndex,
              globalStep: idx,
              snippet: text.slice(0, 24) + (text.length > 24 ? "..." : ""),
              prompt: text.slice(0, 100),
              fullText: text
            });
          }
        });

        const isDifferent =
          freshTurns.length !== prevTurnList.length ||
          freshTurns.some((ft, i) => {
            const old = prevTurnList[i];
            return !old || old.turnIndex !== ft.turnIndex || old.globalStep !== ft.globalStep || old.prompt !== ft.prompt;
          });

        if (isDifferent) {
          conversationTurnRegistry.set(activeId, freshTurns);
          saveTurnRegistry();
          if (typeof renderTimelineHUD === "function") {
            renderTimelineHUD();
          }
        }

        lastSyncedId = activeId;
        lastSyncedStepCount = steps.length || currentStepCount;
      }
    } catch (err) {
      plugin.log?.warn?.(`[SYNC_TRAJECTORY_WARN] ${err.message}`);
    } finally {
      isSyncingTrajectory = false;
    }
  }

  function harvestAndGetTotalTurns(activeId, convView) {
    if (!conversationTurnRegistry.has(activeId)) {
      conversationTurnRegistry.set(activeId, []);
    }
    const turnList = conversationTurnRegistry.get(activeId);
    const mountedSteps = Array.from(convView.querySelectorAll('[data-testid="user-input-step"]'));
    let hasNewTurn = false;

    mountedSteps.forEach((el) => {
      const textEl =
        el.querySelector(".whitespace-pre-wrap") ||
        el.querySelector('[data-testid="user-input-step-text"]') ||
        el.querySelector("p") ||
        el;
      let fullText = (textEl?.textContent || "").trim();
      fullText = fullText.replace(/^\[object Object\]\s*/g, "").trim();
      if (!fullText) return;

      const { userStepIndex, globalStep } = resolveStepInfo(el);

      let existing = null;
      if (userStepIndex >= 0 && userStepIndex < turnList.length) {
        existing = turnList[userStepIndex];
      }
      if (!existing && globalStep >= 0) {
        existing = turnList.find((t) => t.globalStep === globalStep);
      }
      if (!existing && userStepIndex < 0) {
        existing = turnList.find((t) => t.fullText && t.fullText === fullText);
      }

      if (!existing) {
        const turnIndex = userStepIndex >= 0 ? userStepIndex : turnList.length;
        const newTurn = {
          key: `turn_${turnIndex}`,
          turnIndex,
          globalStep: globalStep >= 0 ? globalStep : -1,
          snippet: fullText.slice(0, 24) + (fullText.length > 24 ? "..." : ""),
          prompt: fullText.slice(0, 100),
          fullText
        };
        if (turnIndex < turnList.length) {
          turnList[turnIndex] = newTurn;
        } else {
          turnList.push(newTurn);
        }
        hasNewTurn = true;
      } else {
        if (existing.turnIndex === undefined) {
          existing.turnIndex = turnList.indexOf(existing);
        }
        if (globalStep >= 0 && existing.globalStep < 0) {
          existing.globalStep = globalStep;
          hasNewTurn = true;
        }
        if (
          fullText &&
          (!existing.fullText ||
            existing.fullText.length < fullText.length ||
            !existing.prompt ||
            existing.prompt.length < 50)
        ) {
          existing.fullText = fullText;
          existing.prompt = fullText.slice(0, 100);
          existing.snippet = fullText.slice(0, 24) + (fullText.length > 24 ? "..." : "");
          hasNewTurn = true;
        }
      }
    });

    turnList.sort((a, b) => {
      if (typeof a.turnIndex === "number" && typeof b.turnIndex === "number") return a.turnIndex - b.turnIndex;
      if (a.globalStep >= 0 && b.globalStep >= 0) return a.globalStep - b.globalStep;
      return 0;
    });

    if (hasNewTurn) {
      saveTurnRegistry();
    }

    if (turnList.length > 1 && mountedSteps.length > 0) {
      const scrollTarget = findScrollContainer(convView);
      if (scrollTarget) {
        const isAtBottom = scrollTarget.scrollTop + scrollTarget.clientHeight >= scrollTarget.scrollHeight - 60;
        if (isAtBottom) {
          const lastEl = mountedSteps[mountedSteps.length - 1];
          const lastTurn = findTurnIndexForStep(lastEl, turnList);
          if (lastTurn >= 0 && lastTurn < turnList.length - 1) {
            syncTrajectoryUserTurns(activeId, convView, true);
          }
        }
      }
    }

    return { turnList, totalTurns: turnList.length };
  }

  function findTurnIndexForStep(stepEl, turnList) {
    if (!stepEl || !Array.isArray(turnList) || turnList.length === 0) return -1;
    const { userStepIndex, globalStep } = resolveStepInfo(stepEl);

    // 1. Direct Physical Resolution (Highest SNR & Ground Truth)
    if (userStepIndex >= 0 && userStepIndex < turnList.length) {
      return userStepIndex;
    }

    if (globalStep >= 0) {
      const idx = turnList.findIndex((t) => t.globalStep >= 0 && t.globalStep === globalStep);
      if (idx >= 0) return idx;
    }

    // 2. Text Matching Fallback (if userStepIndex not found in Fiber)
    const textEl =
      stepEl.querySelector(".whitespace-pre-wrap") ||
      stepEl.querySelector('[data-testid="user-input-step-text"]') ||
      stepEl.querySelector("p") ||
      stepEl;
    let text = (textEl?.textContent || "").trim();
    if (text) {
      text = text.replace(/^\[object Object\]\s*/g, "").trim();
      const textSub = text.slice(0, 40);
      const idx = turnList.findIndex((t) => {
        const cand = (t.fullText || t.prompt || t.snippet || "").replace(/^\[object Object\]\s*/g, "").trim();
        if (!cand) return false;
        if (cand === text || text.startsWith(cand) || cand.startsWith(text)) return true;
        const candSub = cand.slice(0, 40);
        return candSub.length >= 15 && textSub.length >= 15 && (text.startsWith(candSub) || cand.startsWith(textSub));
      });
      if (idx >= 0) return idx;
    }

    return -1;
  }

  function findMountedStepEl(convView, targetTurnIdx, turnData) {
    if (!convView || targetTurnIdx < 0) return null;

    const activeId = getCurrentConversationId();
    const turnList = (activeId && conversationTurnRegistry.get(activeId)) || [];
    const targetData = turnData || (turnList && turnList[targetTurnIdx]);

    const elUserStep = convView.querySelector(`[data-user-step-index="${targetTurnIdx}"]`);
    if (elUserStep) return elUserStep;

    if (targetData && targetData.globalStep >= 0) {
      const elGlobal = convView.querySelector(`[data-step-index="${targetData.globalStep}"]`);
      if (elGlobal) return elGlobal;
    }

    const mounted = convView.querySelectorAll('[data-testid="user-input-step"]');
    const len = mounted.length;
    for (let i = 0; i < len; i++) {
      const el = mounted[i];
      const resolvedTurn = findTurnIndexForStep(el, turnList);
      if (resolvedTurn >= 0 && resolvedTurn === targetTurnIdx) return el;
    }

    const matchTarget = (targetData?.fullText || targetData?.prompt || targetData?.snippet || "").trim();
    if (matchTarget) {
      const targetPrefix = matchTarget.slice(0, 40);
      for (let i = 0; i < len; i++) {
        const el = mounted[i];
        const textEl = el.querySelector(".whitespace-pre-wrap") || el.querySelector("p") || el;
        const t = (textEl?.textContent || "").trim();
        if (
          t &&
          (t === matchTarget ||
            t.startsWith(targetPrefix) ||
            (targetPrefix.length >= 15 && targetPrefix.startsWith(t.slice(0, 40))))
        ) {
          return el;
        }
      }
    }
    return null;
  }
