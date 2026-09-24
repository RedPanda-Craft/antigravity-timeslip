  // --------------------------------------------------------------------------
  // Feature: Timeslip Extractor - Modal UI, Turn Multi-Select & Batch Actions
  // --------------------------------------------------------------------------

  let activeExtractorModal = null;

  function renderHeaderExtractorBtn(titleBar, healthPill) {
    if (!titleBar || pluginSettings.showExtractPill === false) {
      document.getElementById("bg-header-export-btn")?.remove();
      return;
    }
    let btn = document.getElementById("bg-header-export-btn");
    if (!btn) {
      btn = document.createElement("div");
      btn.id = "bg-header-export-btn";
      btn.className = "bg-header-action-pill bg-header-export-pill";
      btn.setAttribute("data-no-drag", "");
      btn.setAttribute("role", "button");
      btn.setAttribute("tabindex", "0");
      btn.title = "Extract / Export Conversation (Timeslip)";
      btn.innerHTML = `
        <span class="bg-header-pill-icon">📥</span>
        <span class="bg-header-pill-text">Extract</span>
      `;

      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        openTimeslipExtractorModal();
      });
    }

    if (healthPill && healthPill.parentElement === titleBar) {
      if (healthPill.nextElementSibling !== btn) {
        healthPill.after(btn);
      }
    } else if (btn.parentElement !== titleBar) {
      titleBar.appendChild(btn);
    }
  }

  function renderRailExtractorIcon(rail, activeId) {
    if (!rail) return;
    let existing = rail.querySelector(".bg-timeline-action-export");
    if (!existing) {
      existing = document.createElement("div");
      existing.className = "bg-timeline-node bg-timeline-action-export";
      existing.title = "Extract / Export Conversation (Timeslip)";
      existing.innerHTML = `
        <div class="bg-timeline-action-icon">📥</div>
        <div class="bg-timeline-card bg-turn-details">
          <div class="bg-timeline-card-header">
            <span class="bg-timeline-step-label">Extract Dialog</span>
          </div>
          <div class="bg-timeline-snippet">Open Timeslip conversation extractor</div>
        </div>
      `;
      existing.addEventListener("click", (e) => {
        e.stopPropagation();
        openTimeslipExtractorModal(activeId);
      });
      rail.prepend(existing);
    }
  }

  globalThis.__bettergravityTimeslipExtract = function (convId) {
    openTimeslipExtractorModal(convId || getCurrentConversationId());
  };

  async function openTimeslipExtractorModal(targetConvId = null) {
    const activeId = targetConvId || getCurrentConversationId();
    if (!activeId) {
      showToast("No active conversation found to extract", "warning");
      return;
    }

    if (activeExtractorModal) {
      activeExtractorModal.remove();
      activeExtractorModal = null;
    }

    const rawTurns = await fetchFullTrajectoryData(activeId);
    if (!rawTurns || rawTurns.length === 0) {
      showToast("No conversation turns found to extract", "warning");
      return;
    }

    const title = getConversationTitle(activeId) || "Current Conversation";

    // State for modal
    const selectedTurnIndices = new Set(rawTurns.map((_, i) => i)); // default all selected
    const filterOptions = {
      user: true,
      assistant: true,
      codeBlocks: true,
      attachments: true,
      thinking: false,
      toolCalls: false
    };

    // Backdrop
    const overlay = document.createElement("div");
    overlay.id = "bg-timeslip-extractor-overlay";
    overlay.className = "bg-timeslip-modal-overlay";
    overlay.setAttribute("data-no-drag", "");

    // Modal
    const modal = document.createElement("div");
    modal.className = "bg-timeslip-modal";

    // Header
    const header = document.createElement("div");
    header.className = "bg-timeslip-modal-header";
    header.innerHTML = `
      <div class="bg-timeslip-modal-header-left">
        <span class="bg-timeslip-modal-title">📥 Timeslip Conversation Extractor</span>
        <span class="bg-timeslip-modal-subtitle">${escapeHtml(title)}</span>
      </div>
      <button class="bg-timeslip-modal-close-btn" aria-label="Close">✕</button>
    `;

    // Filter Options Toolbar
    const filterBar = document.createElement("div");
    filterBar.className = "bg-timeslip-filter-bar";
    filterBar.innerHTML = `
      <span class="bg-timeslip-bar-label">Content:</span>
      <label class="bg-timeslip-checkbox-label">
        <input type="checkbox" id="bg-opt-user" ${filterOptions.user ? "checked" : ""}> User Queries
      </label>
      <label class="bg-timeslip-checkbox-label">
        <input type="checkbox" id="bg-opt-assistant" ${filterOptions.assistant ? "checked" : ""}> Model Responses
      </label>
      <label class="bg-timeslip-checkbox-label">
        <input type="checkbox" id="bg-opt-code" ${filterOptions.codeBlocks ? "checked" : ""}> Code Blocks
      </label>
      <label class="bg-timeslip-checkbox-label">
        <input type="checkbox" id="bg-opt-attachments" ${filterOptions.attachments ? "checked" : ""}> Attachments
      </label>
      <label class="bg-timeslip-checkbox-label">
        <input type="checkbox" id="bg-opt-thinking" ${filterOptions.thinking ? "checked" : ""}> Deep Thinking
      </label>
      <label class="bg-timeslip-checkbox-label">
        <input type="checkbox" id="bg-opt-tools" ${filterOptions.toolCalls ? "checked" : ""}> Tool Calls
      </label>
    `;

    // Batch Actions Toolbar
    const batchBar = document.createElement("div");
    batchBar.className = "bg-timeslip-batch-bar";
    batchBar.innerHTML = `
      <div class="bg-timeslip-batch-left">
        <button class="bg-timeslip-mini-btn" id="bg-btn-select-all">Select All</button>
        <button class="bg-timeslip-mini-btn" id="bg-btn-deselect-all">Deselect All</button>
        <button class="bg-timeslip-mini-btn" id="bg-btn-invert">Invert</button>
        <button class="bg-timeslip-mini-btn" id="bg-btn-last-5">Last 5 Turns</button>
        <button class="bg-timeslip-mini-btn" id="bg-btn-last-1">Last Turn</button>
      </div>
      <div class="bg-timeslip-search-wrap">
        <input type="text" class="bg-timeslip-search-input" id="bg-turn-search" placeholder="Search turns...">
      </div>
    `;

    // Turn List Container
    const listContainer = document.createElement("div");
    listContainer.className = "bg-timeslip-turns-list";

    function renderTurnItems(searchTerm = "") {
      listContainer.innerHTML = "";
      const term = searchTerm.toLowerCase().trim();

      rawTurns.forEach((turn, idx) => {
        const queryText = turn.userQuery || "";
        const respText = turn.assistantResponse || "";

        if (term && !queryText.toLowerCase().includes(term) && !respText.toLowerCase().includes(term)) {
          return;
        }

        const isChecked = selectedTurnIndices.has(idx);

        let color = "green";
        if (idx >= 35) color = "red";
        else if (idx >= 18) color = "orange";
        else if (idx >= 8) color = "yellow";

        const item = document.createElement("div");
        item.className = `bg-timeslip-turn-item ${isChecked ? "bg-turn-selected" : ""}`;
        item.dataset.turnIndex = String(idx);

        const promptSnip = queryText.length > 90 ? queryText.slice(0, 90) + "..." : queryText;
        const respSnip = respText.length > 80 ? respText.slice(0, 80) + "..." : respText;

        item.innerHTML = `
          <input type="checkbox" class="bg-timeslip-turn-cb" ${isChecked ? "checked" : ""}>
          <span class="bg-timeslip-turn-badge bg-badge-${color}">Turn ${idx + 1}</span>
          <div class="bg-timeslip-turn-content">
            <div class="bg-timeslip-query-line">${escapeHtml(promptSnip)}</div>
            ${respSnip ? `<div class="bg-timeslip-resp-line">${escapeHtml(respSnip)}</div>` : ""}
          </div>
        `;

        const cb = item.querySelector(".bg-timeslip-turn-cb");
        const toggle = () => {
          if (selectedTurnIndices.has(idx)) {
            selectedTurnIndices.delete(idx);
            cb.checked = false;
            item.classList.remove("bg-turn-selected");
          } else {
            selectedTurnIndices.add(idx);
            cb.checked = true;
            item.classList.add("bg-turn-selected");
          }
          updateStats();
        };

        cb.addEventListener("change", (e) => {
          e.stopPropagation();
          toggle();
        });

        item.addEventListener("click", (e) => {
          if (e.target !== cb) toggle();
        });

        listContainer.appendChild(item);
      });
    }

    // Live Stats Bar
    const statsBar = document.createElement("div");
    statsBar.className = "bg-timeslip-stats-bar";

    function updateStats() {
      const selectedCount = selectedTurnIndices.size;
      const totalCount = rawTurns.length;

      const selectedTurns = rawTurns.filter((_, i) => selectedTurnIndices.has(i));
      let charCount = 0;
      selectedTurns.forEach((t) => {
        if (filterOptions.user) charCount += (t.userQuery || "").length;
        if (filterOptions.assistant) charCount += (t.assistantResponse || "").length;
        if (filterOptions.thinking) charCount += (t.thinking || "").length;
      });

      const estTokens = Math.round(charCount / 3.8);
      statsBar.innerHTML = `
        <span>Selected: <strong>${selectedCount}</strong> / ${totalCount} turns</span>
        <span>Estimated: <strong>~${estTokens.toLocaleString()}</strong> Tokens (${charCount.toLocaleString()} chars)</span>
      `;
    }

    // Action Footer
    const footer = document.createElement("div");
    footer.className = "bg-timeslip-modal-footer";
    footer.innerHTML = `
      <div class="bg-timeslip-footer-left">
        <button class="bg-timeslip-btn bg-btn-secondary" id="bg-btn-save-cards">🗂️ Save as Cards</button>
        <button class="bg-timeslip-btn bg-btn-secondary" id="bg-btn-copy-json">📋 Copy JSON</button>
        <button class="bg-timeslip-btn bg-btn-secondary" id="bg-btn-export-json">💾 Export .json</button>
      </div>
      <div class="bg-timeslip-footer-right">
        <button class="bg-timeslip-btn bg-btn-primary" id="bg-btn-copy-md">📋 Copy Markdown</button>
        <button class="bg-timeslip-btn bg-btn-primary" id="bg-btn-export-md">💾 Export .md</button>
        <button class="bg-timeslip-btn bg-btn-close" id="bg-btn-modal-close">Close</button>
      </div>
    `;

    // Assemble Modal
    modal.appendChild(header);
    modal.appendChild(filterBar);
    modal.appendChild(batchBar);
    modal.appendChild(listContainer);
    modal.appendChild(statsBar);
    modal.appendChild(footer);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    activeExtractorModal = overlay;

    // Initial render
    renderTurnItems();
    updateStats();

    // Event Wireup
    const closeModal = () => {
      overlay.remove();
      if (activeExtractorModal === overlay) {
        activeExtractorModal = null;
      }
    };

    header.querySelector(".bg-timeslip-modal-close-btn").addEventListener("click", closeModal);
    footer.querySelector("#bg-btn-modal-close").addEventListener("click", closeModal);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeModal();
    });

    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        closeModal();
        window.removeEventListener("keydown", onKeyDown);
      }
    };
    window.addEventListener("keydown", onKeyDown);

    // Filter checkbox handlers
    const setupFilterCb = (id, key) => {
      const el = filterBar.querySelector(id);
      if (el) {
        el.addEventListener("change", () => {
          filterOptions[key] = el.checked;
          updateStats();
        });
      }
    };
    setupFilterCb("#bg-opt-user", "user");
    setupFilterCb("#bg-opt-assistant", "assistant");
    setupFilterCb("#bg-opt-code", "codeBlocks");
    setupFilterCb("#bg-opt-attachments", "attachments");
    setupFilterCb("#bg-opt-thinking", "thinking");
    setupFilterCb("#bg-opt-tools", "toolCalls");

    // Batch buttons
    batchBar.querySelector("#bg-btn-select-all").addEventListener("click", () => {
      rawTurns.forEach((_, i) => selectedTurnIndices.add(i));
      renderTurnItems(batchBar.querySelector("#bg-turn-search").value);
      updateStats();
    });

    batchBar.querySelector("#bg-btn-deselect-all").addEventListener("click", () => {
      selectedTurnIndices.clear();
      renderTurnItems(batchBar.querySelector("#bg-turn-search").value);
      updateStats();
    });

    batchBar.querySelector("#bg-btn-invert").addEventListener("click", () => {
      rawTurns.forEach((_, i) => {
        if (selectedTurnIndices.has(i)) selectedTurnIndices.delete(i);
        else selectedTurnIndices.add(i);
      });
      renderTurnItems(batchBar.querySelector("#bg-turn-search").value);
      updateStats();
    });

    batchBar.querySelector("#bg-btn-last-5").addEventListener("click", () => {
      selectedTurnIndices.clear();
      const start = Math.max(0, rawTurns.length - 5);
      for (let i = start; i < rawTurns.length; i++) selectedTurnIndices.add(i);
      renderTurnItems(batchBar.querySelector("#bg-turn-search").value);
      updateStats();
    });

    batchBar.querySelector("#bg-btn-last-1").addEventListener("click", () => {
      selectedTurnIndices.clear();
      if (rawTurns.length > 0) selectedTurnIndices.add(rawTurns.length - 1);
      renderTurnItems(batchBar.querySelector("#bg-turn-search").value);
      updateStats();
    });

    batchBar.querySelector("#bg-turn-search").addEventListener("input", (e) => {
      renderTurnItems(e.target.value);
    });

    // Export Action Handlers
    const getSelectedTurns = () => {
      return rawTurns.filter((_, i) => selectedTurnIndices.has(i));
    };

    footer.querySelector("#bg-btn-copy-md").addEventListener("click", async () => {
      const turns = getSelectedTurns();
      if (turns.length === 0) {
        showToast("Please select at least 1 turn to export", "warning");
        return;
      }
      const md = serializeToMarkdown(turns, filterOptions, { title, conversationId: activeId });
      const success = await copyTextToClipboard(md);
      if (success) showToast(`Copied ${turns.length} turns as Markdown!`, "success");
      else showToast("Failed to copy Markdown to clipboard", "error");
    });

    footer.querySelector("#bg-btn-export-md").addEventListener("click", () => {
      const turns = getSelectedTurns();
      if (turns.length === 0) {
        showToast("Please select at least 1 turn to export", "warning");
        return;
      }
      const md = serializeToMarkdown(turns, filterOptions, { title, conversationId: activeId });
      const safeTitle = title.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5-]/g, "_").slice(0, 30);
      const filename = `Timeslip_Export_${safeTitle}_${Date.now()}.md`;
      const ok = downloadFileBlob(md, filename, "text/markdown;charset=utf-8");
      if (ok) showToast(`Exported ${turns.length} turns to ${filename}`, "success");
    });

    footer.querySelector("#bg-btn-copy-json").addEventListener("click", async () => {
      const turns = getSelectedTurns();
      if (turns.length === 0) {
        showToast("Please select at least 1 turn to export", "warning");
        return;
      }
      const json = serializeToJSON(turns, filterOptions, { title, conversationId: activeId });
      const success = await copyTextToClipboard(json);
      if (success) showToast(`Copied ${turns.length} turns as JSON!`, "success");
      else showToast("Failed to copy JSON to clipboard", "error");
    });

    footer.querySelector("#bg-btn-save-cards")?.addEventListener("click", () => {
      const turns = getSelectedTurns();
      if (turns.length === 0) {
        showToast("Please select at least 1 turn to save as card", "warning");
        return;
      }
      let savedCount = 0;
      turns.forEach((t) => {
        const query = (t.userQuery || "").trim();
        const resp = (t.assistantResponse || "").trim();
        const content = resp ? (query ? `Q: ${query}\n\nA: ${resp}` : resp) : query;
        if (content && typeof addCard === "function") {
          addCard(content, query ? query.slice(0, 24) : "Turn Note", {
            conversationId: activeId,
            source: "extractor",
            timestamp: Date.now()
          });
          savedCount++;
        }
      });
      if (savedCount > 0) {
        showToast(`Saved ${savedCount} context card(s)!`, "success");
      }
    });

    footer.querySelector("#bg-btn-export-json").addEventListener("click", () => {
      const turns = getSelectedTurns();
      if (turns.length === 0) {
        showToast("Please select at least 1 turn to export", "warning");
        return;
      }
      const json = serializeToJSON(turns, filterOptions, { title, conversationId: activeId });
      const safeTitle = title.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5-]/g, "_").slice(0, 30);
      const filename = `Timeslip_Export_${safeTitle}_${Date.now()}.json`;
      const ok = downloadFileBlob(json, filename, "application/json;charset=utf-8");
      if (ok) showToast(`Exported ${turns.length} turns to ${filename}`, "success");
    });
  }
