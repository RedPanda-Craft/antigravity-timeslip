  // --------------------------------------------------------------------------
  // Feature: Timeline Rail, Nodes, Cards, Pulse Jump & Scroll-Spy
  // --------------------------------------------------------------------------

  let activeJumpBubble = null;
  let activeJumpTimer = null;
  let activeIgniteTimer = null;

  function clearJumpWarmth() {
    if (activeJumpTimer) {
      clearTimeout(activeJumpTimer);
      activeJumpTimer = null;
    }
    if (activeIgniteTimer) {
      clearTimeout(activeIgniteTimer);
      activeIgniteTimer = null;
    }
    if (activeJumpBubble && activeJumpBubble.isConnected) {
      const oldBubble = activeJumpBubble;
      oldBubble.classList.remove("bg-step-jump-pulse", "bg-step-jump-bubble");
      oldBubble.classList.add("bg-step-jump-fading");
      setTimeout(() => {
        oldBubble.classList.remove("bg-step-jump-warmth", "bg-step-jump-fading");
      }, 260);
    }
    document.querySelectorAll(".bg-step-jump-pulse, .bg-step-jump-bubble").forEach((el) => {
      el.classList.remove("bg-step-jump-pulse", "bg-step-jump-bubble");
    });
    activeJumpBubble = null;
  }

  function jumpToStep(stepEl, blockPosition = "start", shouldScroll = true) {
    if (!stepEl) return;
    try {
      const isSmooth = pluginSettings.autoJumpSmooth !== false;
      const textEl = stepEl.querySelector?.(".whitespace-pre-wrap");
      const bubbleEl =
        textEl?.closest?.(".bg-card, [class*='bg-card']") ||
        stepEl.querySelector?.('[data-testid="lifted-context-menu-trigger"] > .bg-card') ||
        stepEl.querySelector?.('[data-testid="lifted-context-menu-trigger"] > div') ||
        stepEl.querySelector?.('.bg-card, [class*="bg-card"]') ||
        stepEl.querySelector?.('[data-testid="lifted-context-menu-trigger"]') ||
        (stepEl.getAttribute?.("data-testid") === "user-input-step" ? stepEl.firstElementChild || stepEl : stepEl);

      if (shouldScroll) {
        if (typeof stepEl.scrollIntoView === "function") {
          stepEl.scrollIntoView({ behavior: isSmooth ? "smooth" : "auto", block: blockPosition });
        } else if (typeof bubbleEl?.scrollIntoView === "function") {
          bubbleEl.scrollIntoView({ behavior: isSmooth ? "smooth" : "auto", block: blockPosition });
        }
      }

      if (bubbleEl) {
        clearJumpWarmth();
        activeJumpBubble = bubbleEl;

        const igniteGlow = () => {
          if (activeJumpBubble !== bubbleEl || !bubbleEl.isConnected) return;
          bubbleEl.classList.remove("bg-step-jump-pulse", "bg-step-jump-bubble", "bg-step-jump-warmth", "bg-step-jump-fading");
          void bubbleEl.offsetWidth;
          bubbleEl.classList.add("bg-step-jump-bubble");
          activeJumpTimer = setTimeout(() => {
            if (activeJumpBubble === bubbleEl && bubbleEl.isConnected) {
              bubbleEl.classList.remove("bg-step-jump-pulse", "bg-step-jump-bubble");
              bubbleEl.classList.add("bg-step-jump-warmth");
            }
          }, 1850);
        };

        if (isSmooth) {
          activeIgniteTimer = setTimeout(igniteGlow, 360);
        } else {
          igniteGlow();
        }
      }
    } catch (err) {
      plugin.log?.warn?.(`[JUMP_ERR] ${err.message}`);
    }
  }

  let activeRelayJumpToken = 0;

  function smartVirtualRelayJump(convView, turnIdx, turnData, totalTurns) {
    if (!convView) return;

    const scrollTarget = findScrollContainer(convView);
    if (!scrollTarget) return;

    const immediateEl = findMountedStepEl(convView, turnIdx, turnData);
    if (immediateEl) {
      const shouldScroll = turnIdx !== 0 || scrollTarget.scrollTop > 15;
      jumpToStep(immediateEl, "start", shouldScroll);
      if (turnIdx === 0) scrollTarget.scrollTop = 0;
      settleProgrammaticScroll(turnIdx, 550);
      return;
    }

    const jumpToken = ++activeRelayJumpToken;
    const originalOverflowAnchor = scrollTarget.style.overflowAnchor;
    const originalScrollBehavior = scrollTarget.style.scrollBehavior;
    scrollTarget.style.setProperty("overflow-anchor", "none", "important");
    scrollTarget.style.setProperty("scroll-behavior", "auto", "important");

    let stylesRestored = false;
    const restoreScrollStyles = () => {
      if (stylesRestored) return;
      stylesRestored = true;
      activeRestoreScrollStyles = null;
      if (originalOverflowAnchor) {
        scrollTarget.style.overflowAnchor = originalOverflowAnchor;
      } else {
        scrollTarget.style.removeProperty("overflow-anchor");
      }
      if (originalScrollBehavior) {
        scrollTarget.style.scrollBehavior = originalScrollBehavior;
      } else {
        scrollTarget.style.removeProperty("scroll-behavior");
      }
    };
    activeRestoreScrollStyles = restoreScrollStyles;

    if (turnIdx <= 1) {
      const startTime = performance.now();
      const enforceTop = () => {
        if (activeRelayJumpToken !== jumpToken) {
          restoreScrollStyles();
          return;
        }
        scrollTarget.scrollTop = 0;

        if (turnIdx === 0) {
          const el = findMountedStepEl(convView, 0, turnData);
          if (el) {
            jumpToStep(el, "start", false);
            scrollTarget.scrollTop = 0;
            settleProgrammaticScroll(0, 550);
            setTimeout(restoreScrollStyles, 550);
            return;
          }
        }

        const el = findMountedStepEl(convView, turnIdx, turnData);
        if (el) {
          jumpToStep(el, "start", true);
          settleProgrammaticScroll(turnIdx, 550);
          setTimeout(restoreScrollStyles, 550);
          return;
        }

        if (performance.now() - startTime < 800) {
          requestAnimationFrame(enforceTop);
        } else {
          scrollTarget.scrollTop = 0;
          setTimeout(() => {
            if (activeRelayJumpToken !== jumpToken) return;
            const finalEl = findMountedStepEl(convView, turnIdx, turnData);
            if (finalEl) {
              jumpToStep(finalEl, "start", turnIdx !== 0);
              if (turnIdx === 0) scrollTarget.scrollTop = 0;
            }
            settleProgrammaticScroll(turnIdx, 550);
            setTimeout(restoreScrollStyles, 550);
          }, 40);
        }
      };

      requestAnimationFrame(enforceTop);
      return;
    }

    if (turnIdx >= totalTurns - 2) {
      const startTime = performance.now();
      const enforceBottom = () => {
        if (activeRelayJumpToken !== jumpToken) {
          restoreScrollStyles();
          return;
        }
        scrollTarget.scrollTop = scrollTarget.scrollHeight;

        const el = findMountedStepEl(convView, turnIdx, turnData);
        if (el) {
          jumpToStep(el, "start");
          settleProgrammaticScroll(turnIdx, 550);
          setTimeout(restoreScrollStyles, 550);
          return;
        }

        if (performance.now() - startTime < 800) {
          requestAnimationFrame(enforceBottom);
        } else {
          scrollTarget.scrollTop = scrollTarget.scrollHeight;
          setTimeout(() => {
            if (activeRelayJumpToken !== jumpToken) return;
            const finalEl = findMountedStepEl(convView, turnIdx, turnData);
            if (finalEl) jumpToStep(finalEl, "start");
            settleProgrammaticScroll(turnIdx, 550);
            setTimeout(restoreScrollStyles, 550);
          }, 40);
        }
      };

      requestAnimationFrame(enforceBottom);
      return;
    }

    const maxScroll = Math.max(1, scrollTarget.scrollHeight - scrollTarget.clientHeight);
    const initialTargetTop = (turnIdx / Math.max(1, totalTurns - 1)) * maxScroll;
    scrollTarget.scrollTop = initialTargetTop;

    let attempts = 0;
    const maxAttempts = 15;
    const checkAndConverge = () => {
      if (activeRelayJumpToken !== jumpToken) {
        restoreScrollStyles();
        return;
      }
      attempts++;
      const el = findMountedStepEl(convView, turnIdx, turnData);
      if (el) {
        jumpToStep(el, "start");
        settleProgrammaticScroll(turnIdx, 550);
        setTimeout(restoreScrollStyles, 550);
        return;
      }

      if (attempts >= maxAttempts) {
        const finalEl = findMountedStepEl(convView, turnIdx, turnData);
        if (finalEl) jumpToStep(finalEl, "start");
        settleProgrammaticScroll(turnIdx, 550);
        setTimeout(restoreScrollStyles, 550);
        return;
      }

      const mounted = convView.querySelectorAll('[data-testid="user-input-step"]');
      if (mounted.length > 0) {
        const activeId = getCurrentConversationId();
        const turnList = (activeId && conversationTurnRegistry.get(activeId)) || [];
        const firstMountedTurn = findTurnIndexForStep(mounted[0], turnList);
        if (firstMountedTurn >= 0) {
          const turnDiff = turnIdx - firstMountedTurn;
          if (turnDiff !== 0) {
            const currentScrollHeight = Math.max(1, scrollTarget.scrollHeight);
            const stepDelta = (turnDiff / Math.max(1, totalTurns)) * (currentScrollHeight * 0.6);
            scrollTarget.scrollTop += stepDelta;
          }
        }
      }
      setTimeout(checkAndConverge, 40);
    };

    setTimeout(checkAndConverge, 40);
  }

  let lockedTargetTurnIdx = null;
  let isProgrammaticScrolling = false;
  let programmaticScrollTimer = null;
  let activeRestoreScrollStyles = null;
  let timelineTooltipTimer = null;

  function hideTimelineTooltip(tooltipEl) {
    if (timelineTooltipTimer) {
      clearTimeout(timelineTooltipTimer);
      timelineTooltipTimer = null;
    }
    if (tooltipEl) {
      tooltipEl.classList.remove("bg-tooltip-visible");
    }
  }

  function settleProgrammaticScroll(targetTurnIdx, delay = 550) {
    clearTimeout(programmaticScrollTimer);
    programmaticScrollTimer = setTimeout(() => {
      lockedTargetTurnIdx = null;
      isProgrammaticScrolling = false;
      setActiveTimelineNode(targetTurnIdx, true);
    }, delay);
  }

  function breakProgrammaticLock() {
    if (lockedTargetTurnIdx !== null || isProgrammaticScrolling) {
      lockedTargetTurnIdx = null;
      isProgrammaticScrolling = false;
      clearTimeout(programmaticScrollTimer);
      if (activeRestoreScrollStyles) {
        activeRestoreScrollStyles();
        activeRestoreScrollStyles = null;
      }
    }
  }

  let currentActiveTurnIdx = -1;

  function getDividerAccumulatedHeight(targetTurnIdx, totalTurns) {
    let h = 0;
    if (targetTurnIdx > 8 && totalTurns >= 10) h += 21;
    if (targetTurnIdx > 18 && totalTurns >= 20) h += 21;
    if (targetTurnIdx > 18 && totalTurns >= 20 && (cachedHealthStats?.compactionCount || 0) >= 1) h += 21;
    if (targetTurnIdx > 28 && totalTurns >= 30) h += 21;
    if (targetTurnIdx > 36 && totalTurns >= 38 && (cachedHealthStats?.compactionCount || 0) >= 2) h += 21;
    if (targetTurnIdx > 38 && totalTurns >= 40) h += 21;
    return h;
  }

  function keepActiveNodeInRailView(rail, targetNode, targetTurnIdx, totalTurns) {
    if (!rail) return;
    if (rail.matches(":hover") || rail.dataset.manualBrowsing === "true") return;

    const railH = rail.clientHeight;
    const railScroll = rail.scrollTop;
    if (railH <= 0) return;

    let nodeCenterY;
    if (targetNode && targetNode.offsetParent === rail) {
      nodeCenterY = targetNode.offsetTop + 18;
    } else if (targetNode) {
      nodeCenterY = targetNode.offsetTop - rail.offsetTop + 18;
    } else {
      nodeCenterY = targetTurnIdx * 39 + 26 + getDividerAccumulatedHeight(targetTurnIdx, totalTurns);
    }

    const relativeY = nodeCenterY - railScroll;
    const topSafe = railH * 0.2;
    const bottomSafe = railH * 0.8;

    if (relativeY < topSafe || relativeY > bottomSafe) {
      const idealTop = Math.max(0, nodeCenterY - railH * 0.45);
      rail.scrollTo({
        top: idealTop,
        behavior: "smooth"
      });
    }
  }

  function setActiveTimelineNode(targetTurnIdx, force = false, totalTurns = 0) {
    if (!force && currentActiveTurnIdx === targetTurnIdx) return;
    currentActiveTurnIdx = targetTurnIdx;
    const rail = document.querySelector(".bg-timeline-rail");
    if (!rail) return;
    const nodes = rail.querySelectorAll(".bg-timeline-node");
    let activeNodeEl = null;
    nodes.forEach((node) => {
      const idx = parseInt(node.getAttribute("data-turn-index"), 10);
      if (idx === targetTurnIdx) {
        node.classList.add("bg-node-active");
        activeNodeEl = node;
      } else {
        node.classList.remove("bg-node-active");
      }
    });

    const total = Math.max(totalTurns || 0, nodes.length);
    keepActiveNodeInRailView(rail, activeNodeEl, targetTurnIdx, total);
  }

  function updateScrollSpy(convView, turnList, totalTurns) {
    if (lockedTargetTurnIdx !== null || isProgrammaticScrolling) return;

    const rail = document.querySelector(".bg-timeline-rail");
    if (!rail || !convView) return;

    const nodes = rail.querySelectorAll(".bg-timeline-node");
    if (nodes.length === 0) return;

    const activeId = getCurrentConversationId();
    const liveTurnList = (activeId && conversationTurnRegistry.get(activeId)) || turnList || [];
    const effectiveTurns = liveTurnList.length > 0 ? liveTurnList : turnList || [];
    const actualTotal = Math.max(totalTurns || 0, effectiveTurns.length, nodes.length);
    const scrollTarget = findScrollContainer(convView);
    if (!scrollTarget || actualTotal <= 0) return;

    const isScrollable = scrollTarget.scrollHeight > scrollTarget.clientHeight + 20;
    if (isScrollable) {
      if (scrollTarget.scrollTop <= 15) {
        setActiveTimelineNode(0, false, actualTotal);
        return;
      }
      const maxScroll = Math.max(1, scrollTarget.scrollHeight - scrollTarget.clientHeight);
      if (scrollTarget.scrollTop >= maxScroll - 20) {
        setActiveTimelineNode(actualTotal - 1, false, actualTotal);
        return;
      }
    }

    const mountedSteps = convView.querySelectorAll('[data-testid="user-input-step"]');
    const viewRect = convView.getBoundingClientRect();
    const readingLine = viewRect.top + 160;

    let activeTurnIdx = -1;
    if (mountedSteps.length > 0 && Array.isArray(effectiveTurns) && effectiveTurns.length > 0) {
      let lastPassedEl = null;

      for (let i = 0; i < mountedSteps.length; i++) {
        const el = mountedSteps[i];
        const r = el.getBoundingClientRect();
        if (r.top <= readingLine) {
          lastPassedEl = el;
        } else {
          break;
        }
      }

      if (lastPassedEl) {
        activeTurnIdx = findTurnIndexForStep(lastPassedEl, effectiveTurns);
      } else {
        const firstEl = mountedSteps[0];
        const firstTurnIdx = findTurnIndexForStep(firstEl, effectiveTurns);
        if (firstTurnIdx > 0) {
          activeTurnIdx = firstTurnIdx - 1;
        } else if (firstTurnIdx === 0) {
          activeTurnIdx = 0;
        }
      }
    }

    if (activeTurnIdx >= 0) {
      setActiveTimelineNode(activeTurnIdx, false, actualTotal);
    }
  }

  function renderTimelineHUD() {
    const convView =
      document.querySelector('[data-testid="conversation-view"]') ||
      document.querySelector(".ant-layout-content");
    if (!convView) {
      document.getElementById("bg-header-health-pill")?.remove();
      document.getElementById("bg-header-export-btn")?.remove();
      document.getElementById("bg-timeline-hud")?.remove();
      return;
    }

    const currentPos = window.getComputedStyle(convView).position;
    if (currentPos === "static") {
      convView.style.position = "relative";
    }

    const activeId = getCurrentConversationId();
    if (!activeId) return;

    syncTrajectoryUserTurns(activeId, convView);

    const { turnList, totalTurns } = harvestAndGetTotalTurns(activeId, convView);
    if (totalTurns === 0) {
      document.getElementById("bg-header-health-pill")?.remove();
      document.getElementById("bg-header-export-btn")?.remove();
      document.getElementById("bg-timeline-hud")?.remove();
      return;
    }

    const health = evaluateHealthState(totalTurns, convView);

    let hasBranchesAnywhere = false;
    try {
      const branchTree = globalThis.__bettergravityBranchTree;
      if (branchTree && typeof branchTree.hasChildren === "function") {
        hasBranchesAnywhere = branchTree.hasChildren(activeId);
      } else if (branchTree && typeof branchTree.getStoredBranchMeta === "function") {
        const meta = branchTree.getStoredBranchMeta() || {};
        hasBranchesAnywhere = Object.values(meta).some(
          (m) => m && (m.motherId === activeId || m.parentId === activeId)
        );
      }
    } catch (_) {}

    renderHeaderHealthPill(health);

    let hud = document.getElementById("bg-timeline-hud");
    if (!hud) {
      hud = document.createElement("div");
      hud.id = "bg-timeline-hud";
      hud.className = "bg-timeline-hud";
      convView.appendChild(hud);
    }

    if (pluginSettings.showRail === false) {
      hud.style.display = "none";
      return;
    } else {
      hud.style.display = "";
    }

    let tooltipEl = hud.querySelector(".bg-timeline-tooltip");
    if (!tooltipEl) {
      tooltipEl = document.createElement("div");
      tooltipEl.className = "bg-timeline-tooltip";
      hud.appendChild(tooltipEl);
    }

    let rail = hud.querySelector(".bg-timeline-rail");
    if (!rail) {
      rail = document.createElement("div");
      rail.className = "bg-timeline-rail";
      hud.appendChild(rail);
    }

    if (!rail.dataset.listenersAttached) {
      rail.dataset.listenersAttached = "true";
      let manualBrowsingTimer = null;
      rail.addEventListener("mouseleave", () => {
        hideTimelineTooltip(tooltipEl);
        clearTimeout(manualBrowsingTimer);
        rail.dataset.manualBrowsing = "false";
      });
      rail.addEventListener(
        "wheel",
        () => {
          rail.dataset.manualBrowsing = "true";
          clearTimeout(manualBrowsingTimer);
          manualBrowsingTimer = setTimeout(() => {
            rail.dataset.manualBrowsing = "false";
          }, 1200);
        },
        { passive: true }
      );
      rail.addEventListener(
        "scroll",
        () => {
          hideTimelineTooltip(tooltipEl);
        },
        { passive: true }
      );
    }

    rail.querySelectorAll(".bg-timeline-node").forEach((nEl) => {
      nEl.removeAttribute("title");
    });

    const lastRenderedConv = rail.dataset.renderedConvId;
    const lastRenderedCount = parseInt(rail.dataset.renderedTotal || "0", 10);
    const lastSignature = rail.dataset.renderedSignature || "";

    const currentSignature = (turnList || [])
      .map((t) => (t?.prompt || t?.snippet || "").slice(0, 30))
      .slice(0, 15)
      .join("|");

    const needsRebuild = lastRenderedConv !== activeId || lastRenderedCount !== totalTurns;

    if (needsRebuild) {
      currentActiveTurnIdx = -1;
      rail.dataset.renderedConvId = activeId;
      rail.dataset.renderedTotal = String(totalTurns);
      rail.dataset.renderedSignature = currentSignature;
      rail.innerHTML = "";

      for (let turnIdx = 0; turnIdx < totalTurns; turnIdx++) {
        const turnData = turnList[turnIdx] || {
          globalStep: -1,
          snippet: `Turn #${turnIdx + 1}`,
          fullText: ""
        };

        // Split Divider 1: 2 Chunks (after Turn 8)
        if (turnIdx === 8 && totalTurns >= 10) {
          const chunkDiv = document.createElement("div");
          chunkDiv.className = "bg-timeline-divider bg-divider-chunk";
          chunkDiv.innerHTML = `
            <div class="bg-timeline-divider-line"></div>
            <div class="bg-timeline-divider-tag">📦 2 Chunks</div>
            <div class="bg-timeline-divider-line"></div>
          `;
          rail.appendChild(chunkDiv);
        }

        // Split Divider 2: 4 Chunks & 1st Compaction (after Turn 18)
        if (turnIdx === 18 && totalTurns >= 20) {
          const chunkDiv = document.createElement("div");
          chunkDiv.className = "bg-timeline-divider bg-divider-chunk";
          chunkDiv.innerHTML = `
            <div class="bg-timeline-divider-line"></div>
            <div class="bg-timeline-divider-tag">📦 4 Chunks</div>
            <div class="bg-timeline-divider-line"></div>
          `;
          rail.appendChild(chunkDiv);

          if (health.compactionCount >= 1) {
            const compDiv = document.createElement("div");
            compDiv.className = "bg-timeline-divider bg-divider-compaction";
            compDiv.innerHTML = `
              <div class="bg-timeline-divider-line"></div>
              <div class="bg-timeline-divider-tag">🗜️ 1st Compaction</div>
              <div class="bg-timeline-divider-line"></div>
            `;
            rail.appendChild(compDiv);
          }
        }

        // Split Divider 3: 6 Chunks (after Turn 28)
        if (turnIdx === 28 && totalTurns >= 30) {
          const chunkDiv = document.createElement("div");
          chunkDiv.className = "bg-timeline-divider bg-divider-chunk";
          chunkDiv.innerHTML = `
            <div class="bg-timeline-divider-line"></div>
            <div class="bg-timeline-divider-tag">📦 6 Chunks</div>
            <div class="bg-timeline-divider-line"></div>
          `;
          rail.appendChild(chunkDiv);
        }

        // Split Divider 4: 2nd Compaction (after Turn 36)
        if (turnIdx === 36 && totalTurns >= 38 && health.compactionCount >= 2) {
          const compDiv = document.createElement("div");
          compDiv.className = "bg-timeline-divider bg-divider-compaction";
          compDiv.innerHTML = `
            <div class="bg-timeline-divider-line"></div>
            <div class="bg-timeline-divider-tag">🗜️ 2nd Compaction</div>
            <div class="bg-timeline-divider-line"></div>
          `;
          rail.appendChild(compDiv);
        }

        // Split Divider 5: 8 Chunks (after Turn 38, CEILING)
        if (turnIdx === 38 && totalTurns >= 40) {
          const chunkDiv = document.createElement("div");
          chunkDiv.className = "bg-timeline-divider bg-divider-chunk";
          chunkDiv.innerHTML = `
            <div class="bg-timeline-divider-line"></div>
            <div class="bg-timeline-divider-tag">📦 8 Chunks (Cap)</div>
            <div class="bg-timeline-divider-line"></div>
          `;
          rail.appendChild(chunkDiv);
        }

        const redThresh = pluginSettings.redThreshold ?? 36;
        const orangeThresh = pluginSettings.orangeThreshold ?? 19;
        const yellowThresh = pluginSettings.yellowThreshold ?? 9;

        let nodeColor = "green";
        if (turnIdx >= redThresh - 1) {
          nodeColor = "red";
        } else if (turnIdx >= orangeThresh - 1) {
          nodeColor = "orange";
        } else if (turnIdx >= yellowThresh - 1) {
          nodeColor = "yellow";
        }

        const hasBranches = hasBranchesAnywhere && (turnIdx === 0 || turnIdx === 1);

        const node = document.createElement("div");
        node.className = `bg-timeline-node bg-node-${nodeColor}`;
        node.setAttribute("data-turn-index", String(turnIdx));

        const promptText = (turnData.fullText || turnData.prompt || turnData.snippet || "").trim();
        const previewText = promptText.length > 80 ? promptText.slice(0, 80) + "..." : promptText;
        node.dataset.prompt = previewText;

        node.innerHTML = `
          <div class="bg-timeline-dot bg-dot-${nodeColor}"></div>
          <div class="bg-timeline-card bg-turn-details">
            <div class="bg-timeline-card-header">
              <span class="bg-timeline-step-label">Turn ${turnIdx + 1}</span>
              ${hasBranches ? '<span class="bg-timeline-branch-indicator">🌿 Branch</span>' : ""}
            </div>
            <div class="bg-timeline-snippet">${escapeHtml(turnData.snippet)}</div>
          </div>
        `;

        node.removeAttribute("title");

        node.addEventListener("mouseenter", () => {
          hideTimelineTooltip(tooltipEl);
          timelineTooltipTimer = setTimeout(() => {
            timelineTooltipTimer = null;
            const nodeRect = node.getBoundingClientRect();
            const hudRect = hud.getBoundingClientRect();
            const midY = nodeRect.top - hudRect.top + nodeRect.height / 2;
            tooltipEl.style.top = `${midY}px`;
            const currentText = node.dataset.prompt || previewText;
            tooltipEl.innerHTML = `<div class="bg-timeline-tooltip-body">${escapeHtml(currentText)}</div>`;
            tooltipEl.classList.add("bg-tooltip-visible");
          }, 350);
        });

        node.addEventListener("mouseleave", () => {
          hideTimelineTooltip(tooltipEl);
        });

        node.addEventListener("click", (e) => {
          e.stopPropagation();
          hideTimelineTooltip(tooltipEl);

          lockedTargetTurnIdx = turnIdx;
          isProgrammaticScrolling = true;
          setActiveTimelineNode(turnIdx, true, totalTurns);
          clearTimeout(programmaticScrollTimer);
          programmaticScrollTimer = setTimeout(() => {
            lockedTargetTurnIdx = null;
            isProgrammaticScrolling = false;
          }, 2000);

          const currentTurnList = (activeId && conversationTurnRegistry.get(activeId)) || [];
          const freshTurnData = currentTurnList[turnIdx] || turnData;
          smartVirtualRelayJump(convView, turnIdx, freshTurnData, totalTurns);
        });

        rail.appendChild(node);
      }

      updateScrollSpy(convView, turnList, totalTurns);
    } else if (lastSignature !== currentSignature) {
      rail.dataset.renderedSignature = currentSignature;
      const snippetEls = rail.querySelectorAll(".bg-timeline-snippet");
      const nodeEls = rail.querySelectorAll(".bg-timeline-node");
      snippetEls.forEach((snipEl, idx) => {
        const d = turnList[idx];
        if (d && d.snippet) {
          snipEl.textContent = d.snippet;
        }
      });
      nodeEls.forEach((nEl, idx) => {
        nEl.removeAttribute("title");
        const d = turnList[idx];
        if (d) {
          const promptText = (d.fullText || d.prompt || d.snippet || "").trim();
          const previewText = promptText.length > 80 ? promptText.slice(0, 80) + "..." : promptText;
          nEl.dataset.prompt = previewText;
        }
      });
    }

    const scrollTarget = findScrollContainer(convView);
    if (scrollTarget && activeScrollContainer !== scrollTarget) {
      if (typeof activeScrollTeardown === "function") {
        activeScrollTeardown();
        activeScrollTeardown = null;
      }
      activeScrollContainer = scrollTarget;

      let scrollThrottleTimer = null;
      const onScroll = () => {
        if (!scrollThrottleTimer) {
          scrollThrottleTimer = requestAnimationFrame(() => {
            updateScrollSpy(convView);
            scrollThrottleTimer = null;
          });
        }
      };

      scrollTarget.addEventListener("scroll", onScroll, { passive: true });
      convView.addEventListener("scroll", onScroll, { passive: true, capture: true });
      window.addEventListener("wheel", breakProgrammaticLock, { passive: true, capture: true });
      window.addEventListener("pointerdown", breakProgrammaticLock, { passive: true, capture: true });

      activeScrollTeardown = () => {
        scrollTarget.removeEventListener("scroll", onScroll);
        convView.removeEventListener("scroll", onScroll, { capture: true });
        window.removeEventListener("wheel", breakProgrammaticLock, { capture: true });
        window.removeEventListener("pointerdown", breakProgrammaticLock, { capture: true });
        if (scrollThrottleTimer) cancelAnimationFrame(scrollThrottleTimer);
      };
    }

    updateScrollSpy(convView, turnList, totalTurns);
  }
