  // --------------------------------------------------------------------------
  // Feature: Dual-Axis Health Monitor & TitleBar Health Capsule Pill
  // --------------------------------------------------------------------------

  function evaluateHealthState(totalTurns, convView) {
    let chunkCount = 1;
    if (totalTurns <= 8) chunkCount = 2;
    else if (totalTurns <= 18) chunkCount = 4;
    else if (totalTurns <= 28) chunkCount = 6;
    else chunkCount = 8;

    let compactionCount = 0;
    if (convView) {
      const topContainers = convView.querySelectorAll(
        ':scope > div, [data-testid*="system"], [data-testid*="summary"], [data-testid*="notice"], [data-testid="user-input-step"], [data-testid="agent-turn"]'
      );
      const scanLimit = Math.min(topContainers.length, 8);
      for (let i = 0; i < scanLimit; i++) {
        const txt = topContainers[i].textContent || "";
        if (
          txt.includes("Resuming from a compaction") ||
          txt.includes("CONTEXT_SUMMARY") ||
          txt.includes("truncated to fit within the context window")
        ) {
          compactionCount = 1;
          break;
        }
      }
    }

    const redThresh = pluginSettings.redThreshold ?? 36;
    const orangeThresh = pluginSettings.orangeThreshold ?? 19;
    const yellowThresh = pluginSettings.yellowThreshold ?? 9;

    if (totalTurns >= orangeThresh && compactionCount === 0) {
      compactionCount = 1;
    }
    if (totalTurns >= redThresh) {
      compactionCount = 2;
    }

    let chunkLevel = 0;
    if (chunkCount >= 8 && totalTurns >= redThresh) chunkLevel = 3;
    else if (chunkCount >= 5) chunkLevel = 2;
    else if (chunkCount >= 3) chunkLevel = 1;

    let compactionLevel = 0;
    if (compactionCount >= 2 || totalTurns >= redThresh) compactionLevel = 3;
    else if (compactionCount === 1 || totalTurns >= orangeThresh) compactionLevel = 2;
    else if (totalTurns >= yellowThresh) compactionLevel = 1;

    const finalLevel = Math.max(chunkLevel, compactionLevel);
    const colorNames = ["green", "yellow", "orange", "red"];
    const colorName = colorNames[finalLevel] || "green";

    return {
      stepCount: totalTurns,
      chunkCount,
      compactionCount,
      level: finalLevel,
      color: colorName
    };
  }

  function renderHeaderHealthPill(health) {
    const titleBar = document.querySelector('[data-testid="title-menu-bar"]');
    if (!titleBar || pluginSettings.showHealthPill === false) {
      document.getElementById("bg-header-health-pill")?.remove();
      return;
    }

    let pill = document.getElementById("bg-header-health-pill");
    if (!pill) {
      pill = document.createElement("div");
      pill.id = "bg-header-health-pill";
      pill.className = "bg-header-health-pill";
      pill.setAttribute("data-no-drag", "");
      pill.setAttribute("role", "button");
      pill.setAttribute("tabindex", "0");
      pill.style.cursor = "pointer";
      pill.addEventListener("click", (e) => {
        e.stopPropagation();
        const hud = document.getElementById("bg-timeline-hud");
        if (hud) {
          hud.style.display = hud.style.display === "none" ? "" : "none";
        }
      });
      pill.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.stopPropagation();
          e.preventDefault();
          const hud = document.getElementById("bg-timeline-hud");
          if (hud) {
            hud.style.display = hud.style.display === "none" ? "" : "none";
          }
        }
      });
    }

    const petBtn =
      titleBar.querySelector('button[data-bettergravity-button="Pet"]') ||
      titleBar.querySelector('button[aria-label*="Pet" i]');

    if (petBtn && petBtn.parentElement === titleBar) {
      if (petBtn.nextElementSibling !== pill) {
        petBtn.after(pill);
      }
    } else if (pill.parentElement !== titleBar) {
      titleBar.appendChild(pill);
    }

    const kbSize = (health.chunkCount || 1) * 100;
    pill.className = `bg-header-health-pill bg-pill-${health.color}`;
    pill.title = `${health.stepCount} turns · ${health.compactionCount} compactions · ${health.chunkCount} Chunks (${kbSize}kb)\nClick: toggle timeline`;
    pill.innerHTML = `
      <span class="bg-header-pill-dot bg-dot-${health.color}"></span>
      <span class="bg-header-pill-text">${health.stepCount} turns · ${health.compactionCount} comp · ${health.chunkCount}C</span>
    `;
    cachedHealthStats = health;

    // Trigger extractor header pill injection if available
    if (typeof renderHeaderExtractorBtn === "function") {
      renderHeaderExtractorBtn(titleBar, pill);
    }
  }
