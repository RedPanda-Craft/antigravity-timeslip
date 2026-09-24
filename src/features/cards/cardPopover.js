  // --------------------------------------------------------------------------
  // Feature: Timeslip Context Cards - Popover HUD & Composer Injection Hook
  // --------------------------------------------------------------------------

  let cardsPopoverEl = null;
  let activeCardSearch = "";
  let activeCardTag = "all";
  let hasHookedComposer = false;

  let activeCardTab = "cards"; // "cards" | "recent"

  function isCardsPopoverOpen() {
    return Boolean(cardsPopoverEl && cardsPopoverEl.classList.contains("is-open"));
  }

  function toggleCardsPopover(anchorEl = null) {
    if (isCardsPopoverOpen()) {
      closeCardsPopover();
    } else {
      openCardsPopover(anchorEl);
    }
  }

  function openCardsPopover(anchorEl = null) {
    if (!cardsPopoverEl) {
      cardsPopoverEl = createCardsPopoverDOM();
      document.body.appendChild(cardsPopoverEl);
    }

    renderCardsPopoverContent();

    // Position relative to anchor or rail or default top-right
    if (anchorEl) {
      const rect = anchorEl.getBoundingClientRect();
      const popoverWidth = 320;
      let left = rect.left;
      if (left + popoverWidth > window.innerWidth - 10) {
        left = window.innerWidth - popoverWidth - 10;
      }
      if (left < 10) left = 10;

      let top;
      if (rect.top > window.innerHeight / 2) {
        // Lower half of screen (e.g. composer) -> pop above anchor
        top = rect.top - 460 - 8;
        if (top < 10) top = 10;
      } else {
        // Upper half of screen (e.g. titlebar or rail) -> pop below
        top = rect.bottom + 8;
        if (top + 460 > window.innerHeight) top = window.innerHeight - 470;
      }

      cardsPopoverEl.style.left = `${left}px`;
      cardsPopoverEl.style.top = `${top}px`;
      cardsPopoverEl.style.right = "auto";
    } else {
      cardsPopoverEl.style.right = "52px";
      cardsPopoverEl.style.top = "60px";
      cardsPopoverEl.style.left = "auto";
    }

    requestAnimationFrame(() => {
      cardsPopoverEl.classList.add("is-open");
      document.querySelectorAll(".bg-cards-trigger-btn").forEach((b) => b.classList.add("bg-btn-active"));
      const searchInput = cardsPopoverEl.querySelector(".bg-cards-search-input");
      if (searchInput) searchInput.focus();
      attachComposerDropTarget();
    });
  }

  function closeCardsPopover() {
    if (cardsPopoverEl) {
      cardsPopoverEl.classList.remove("is-open");
      document.querySelectorAll(".bg-cards-trigger-btn").forEach((b) => b.classList.remove("bg-btn-active"));
    }
  }

  function createCardsPopoverDOM() {
    const pop = document.createElement("div");
    pop.id = "bg-timeslip-cards-popover";
    pop.className = "bg-cards-popover";
    pop.setAttribute("data-no-drag", "");

    pop.innerHTML = `
      <div class="bg-cards-popover-header">
        <div class="bg-cards-popover-title">
          <span class="bg-cards-title-icon">📁</span>
          <span>Context Cards</span>
        </div>
        <button type="button" class="bg-cards-close-btn" title="Close Cards (Esc)">✕</button>
      </div>
      <div class="bg-popover-tabs">
        <button type="button" class="bg-popover-tab ${activeCardTab === "cards" ? "active" : ""}" data-tab="cards">
          <span>⭐</span> <span>Cards</span> <span class="bg-tab-badge bg-tab-badge-cards">${timeslipCards.length}</span>
        </button>
        <button type="button" class="bg-popover-tab ${activeCardTab === "recent" ? "active" : ""}" data-tab="recent">
          <span>🕒</span> <span>Side Stash</span> <span class="bg-tab-badge bg-tab-badge-recent">${recentBtw.length}/${MAX_RECENT_BTW}</span>
        </button>
      </div>
      <div class="bg-cards-search-box">
        <input type="text" class="bg-cards-search-input" placeholder="${activeCardTab === "cards" ? "🔍 Search cards, content, or tags..." : "🔍 Search recent side discussions..."}" value="${escapeHtml(activeCardSearch)}" />
      </div>
      <div class="bg-cards-tags-bar" id="bg-cards-tags-bar"></div>
      <div class="bg-cards-list-container" id="bg-cards-list-container"></div>
      <div class="bg-recent-footer-bar" id="bg-recent-footer-bar" style="display:none;"></div>
      <div class="bg-cards-popover-footer" id="bg-cards-popover-footer">
        <span class="bg-cards-tip">Drag any card directly into chat · Click 📌 to pin</span>
      </div>
    `;

    pop.querySelector(".bg-cards-close-btn")?.addEventListener("click", closeCardsPopover);

    pop.querySelectorAll(".bg-popover-tab").forEach((tabBtn) => {
      tabBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const targetTab = tabBtn.dataset.tab;
        if (activeCardTab !== targetTab) {
          activeCardTab = targetTab;
          activeCardSearch = "";
          const sInput = pop.querySelector(".bg-cards-search-input");
          if (sInput) sInput.value = "";
          renderCardsPopoverContent();
        }
      });
    });

    const searchInput = pop.querySelector(".bg-cards-search-input");
    searchInput?.addEventListener("input", (e) => {
      activeCardSearch = (e.target.value || "").trim().toLowerCase();
      if (activeCardTab === "cards") {
        renderCardsList(pop);
      } else {
        renderRecentList(pop);
      }
    });

    return pop;
  }

  function updateCardsPopoverCounts() {
    if (!cardsPopoverEl) return;
    const cardsBadge = cardsPopoverEl.querySelector(".bg-tab-badge-cards");
    if (cardsBadge) cardsBadge.textContent = String(timeslipCards.length);
    const recentBadge = cardsPopoverEl.querySelector(".bg-tab-badge-recent");
    if (recentBadge) recentBadge.textContent = `${recentBtw.length}/${MAX_RECENT_BTW}`;
  }

  function renderCardsPopoverContent() {
    if (!cardsPopoverEl) return;

    cardsPopoverEl.querySelectorAll(".bg-popover-tab").forEach((tab) => {
      tab.classList.toggle("active", tab.dataset.tab === activeCardTab);
    });

    const tagsBar = cardsPopoverEl.querySelector("#bg-cards-tags-bar");
    const footerRecent = cardsPopoverEl.querySelector("#bg-recent-footer-bar");
    const footerCards = cardsPopoverEl.querySelector("#bg-cards-popover-footer");
    const searchInput = cardsPopoverEl.querySelector(".bg-cards-search-input");

    updateCardsPopoverCounts();

    if (activeCardTab === "cards") {
      if (tagsBar) tagsBar.style.display = "flex";
      if (footerRecent) footerRecent.style.display = "none";
      if (footerCards) footerCards.style.display = "block";
      if (searchInput) searchInput.placeholder = "🔍 Search cards, content, or tags...";
      renderTagsBar(cardsPopoverEl);
      renderCardsList(cardsPopoverEl);
    } else {
      if (tagsBar) tagsBar.style.display = "none";
      if (footerRecent) footerRecent.style.display = "flex";
      if (footerCards) footerCards.style.display = "none";
      if (searchInput) searchInput.placeholder = "🔍 Search recent side discussions...";
      renderRecentList(cardsPopoverEl);
      renderRecentFooter(cardsPopoverEl);
    }
  }

  function renderTagsBar(container) {
    const bar = container.querySelector("#bg-cards-tags-bar");
    if (!bar) return;
    bar.innerHTML = "";

    const tags = ["all", "pinned", ...collectAllCardTags(timeslipCards)];
    tags.forEach((t) => {
      const pill = document.createElement("button");
      pill.type = "button";
      pill.className = `bg-card-tag-pill ${activeCardTag === t ? "is-active" : ""}`;
      pill.textContent = t === "all" ? "All" : t === "pinned" ? "📌 Pinned" : `#${t}`;
      pill.addEventListener("click", () => {
        activeCardTag = t;
        renderTagsBar(container);
        renderCardsList(container);
      });
      bar.appendChild(pill);
    });
  }

  function renderCardsList(container) {
    const listEl = container.querySelector("#bg-cards-list-container");
    if (!listEl) return;
    listEl.innerHTML = "";

    let filtered = sortCardsPinnedFirst(timeslipCards);

    if (activeCardTag === "pinned") {
      filtered = filtered.filter((c) => Boolean(c.isPinned));
    } else if (activeCardTag !== "all") {
      filtered = filtered.filter((c) => Array.isArray(c.tags) && c.tags.includes(activeCardTag));
    }

    if (activeCardSearch) {
      filtered = filtered.filter((c) => {
        const titleMatch = (c.title || "").toLowerCase().includes(activeCardSearch);
        const contentMatch = (c.content || "").toLowerCase().includes(activeCardSearch);
        const tagMatch = Array.isArray(c.tags) && c.tags.some((t) => t.toLowerCase().includes(activeCardSearch));
        return titleMatch || contentMatch || tagMatch;
      });
    }

    if (filtered.length === 0) {
      listEl.innerHTML = `
        <div class="bg-cards-empty">
          <div class="bg-cards-empty-icon">📭</div>
          <div class="bg-cards-empty-text">No context cards found</div>
          <div class="bg-cards-empty-sub">Extract turns from Timeline or promote from Side Stash</div>
        </div>
      `;
      return;
    }

    filtered.forEach((card) => {
      const cardEl = document.createElement("div");
      cardEl.className = `bg-card-node-item ${card.isPinned ? "is-pinned" : ""}`;
      cardEl.setAttribute("draggable", "true");

      cardEl.innerHTML = `
        <div class="bg-card-node-header">
          <div class="bg-card-node-title" title="${escapeHtml(card.title)}">
            ${card.isPinned ? "📌 " : ""}${escapeHtml(card.title)}
          </div>
          <div class="bg-card-node-actions">
            <button type="button" class="bg-card-action-btn bg-card-pin-btn" title="${card.isPinned ? "Unpin" : "Pin"}">
              ${card.isPinned ? "★" : "☆"}
            </button>
            <button type="button" class="bg-card-action-btn bg-card-copy-btn" title="Copy Content">📋 Copy</button>
            <button type="button" class="bg-card-action-btn bg-card-del-btn" title="Delete Card">🗑️</button>
          </div>
        </div>
        <div class="bg-card-content" title="Click to expand/collapse full card">${escapeHtml(card.content)}</div>
      `;

      cardEl.addEventListener("dragstart", (e) => {
        const plainText = (card.content || "").trim();
        const cardData = {
          id: card.id,
          title: card.title,
          content: plainText,
          timestamp: card.timestamp
        };
        e.dataTransfer.setData("application/x-bettergravity-card", JSON.stringify(cardData));
        e.dataTransfer.setData("text/plain", plainText);
        e.dataTransfer.effectAllowed = "copy";
      });

      cardEl.querySelector(".bg-card-content")?.addEventListener("click", (e) => {
        e.stopPropagation();
        e.currentTarget.classList.toggle("expanded");
      });

      cardEl.querySelector(".bg-card-pin-btn")?.addEventListener("click", (e) => {
        e.stopPropagation();
        togglePinCard(card.id);
        renderCardsPopoverContent();
      });

      cardEl.querySelector(".bg-card-copy-btn")?.addEventListener("click", (e) => {
        e.stopPropagation();
        navigator.clipboard?.writeText(card.content || "");
        showToast("Card content copied to clipboard", "success");
      });

      cardEl.querySelector(".bg-card-del-btn")?.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteCard(card.id);
        renderCardsPopoverContent();
      });

      listEl.appendChild(cardEl);
    });
  }

  function renderRecentList(container) {
    const listEl = container.querySelector("#bg-cards-list-container");
    if (!listEl) return;
    listEl.innerHTML = "";

    let filtered = [...recentBtw];

    if (activeCardSearch) {
      const q = activeCardSearch.toLowerCase();
      filtered = filtered.filter((it) => {
        const titleMatch = (it.title || "").toLowerCase().includes(q);
        const contentMatch = (it.content || "").toLowerCase().includes(q);
        const qMatch = (it.question || "").toLowerCase().includes(q);
        return titleMatch || contentMatch || qMatch;
      });
    }

    if (filtered.length === 0) {
      const emptyMsg = recentBtw.length === 0
        ? `No staged side notes<br/><span style="font-size:10.5px;color:#6c7086;margin-top:4px;display:inline-block;">Auto-staged from side discussions, max 25 items (FIFO)</span>`
        : "No matching staged records found";
      listEl.innerHTML = `<div style="color:#6c7086;font-size:11.5px;text-align:center;padding:28px 0;line-height:1.5;">${emptyMsg}</div>`;
      return;
    }

    filtered.forEach((item) => {
      const itemEl = document.createElement("div");
      itemEl.className = "bg-recent-item";
      itemEl.setAttribute("draggable", "true");

      const displayTitle = (item.title || "").replace(/^(?:Side Question:\s*)+/gi, "").trim() || "Side Note";
      const displayContent = (item.content || "").replace(/^(?:Side Question:\s*)+/gi, "Side Question: ");

      itemEl.innerHTML = `
        <div class="bg-recent-item-header">
          <span class="bg-recent-item-title" title="${escapeHtml(displayTitle)}">💡 ${escapeHtml(displayTitle)}</span>
          <span class="bg-recent-time">🕒 ${formatRelativeTime(item.timestamp)}</span>
        </div>
        <div class="bg-card-content" title="Click to expand/collapse full text">${escapeHtml(displayContent)}</div>
        <div class="bg-card-footer">
          <div class="bg-recent-item-status">
            ${
              item.isPromoted
                ? `<span class="bg-recent-promoted-badge" title="Saved to permanent cards">⭐ Faved</span>`
                : `<span class="bg-recent-staged-badge" title="Staged (FIFO rolling eviction)">🕒 Staged</span>`
            }
          </div>
          <div class="bg-card-actions">
            <button type="button" class="bg-card-action-btn ${item.isPromoted ? 'bg-recent-promoted-btn' : 'bg-recent-promote-btn'}" title="${item.isPromoted ? 'Click to cancel favorite (Un-fav)' : 'Save to permanent Context Cards'}">
              ${item.isPromoted ? '⭐ Faved' : '☆ Fav'}
            </button>
            <button type="button" class="bg-card-action-btn bg-card-copy-btn" title="Copy text to clipboard">📋 Copy</button>
            <button type="button" class="bg-card-del-btn bg-recent-del-btn" title="Discard this staged note">🗑️</button>
          </div>
        </div>
      `;

      itemEl.addEventListener("dragstart", (e) => {
        let plainText = (displayContent || "").trim();
        const cardData = {
          id: item.id,
          title: displayTitle,
          content: plainText,
          timestamp: item.timestamp
        };
        e.dataTransfer.setData("application/x-bettergravity-card", JSON.stringify(cardData));
        e.dataTransfer.setData("text/plain", plainText);
        e.dataTransfer.effectAllowed = "copy";
      });

      itemEl.querySelector(".bg-card-content")?.addEventListener("click", (e) => {
        e.stopPropagation();
        e.currentTarget.classList.toggle("expanded");
      });

      const favBtn = itemEl.querySelector(".bg-recent-promoted-btn, .bg-recent-promote-btn");
      favBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        if (item.isPromoted) {
          unpromoteRecentCard(item);
          renderCardsPopoverContent();
          showToast(`Removed "${displayTitle}" from Context Cards`, "info");
        } else {
          promoteRecentToCard(item);
          renderCardsPopoverContent();
          showToast(`Saved "${displayTitle}" to Context Cards!`, "success");
        }
      });

      itemEl.querySelector(".bg-card-copy-btn")?.addEventListener("click", (e) => {
        e.stopPropagation();
        navigator.clipboard?.writeText(displayContent);
        showToast("Copied to clipboard", "success");
      });

      itemEl.querySelector(".bg-recent-del-btn")?.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        recentBtw = recentBtw.filter((it) => it.id !== item.id);
        saveRecentBtw(recentBtw);
        renderCardsPopoverContent();
        showToast("Staged record discarded", "info");
      });

      listEl.appendChild(itemEl);
    });
  }

  function renderRecentFooter(container) {
    const footerBar = container.querySelector("#bg-recent-footer-bar");
    if (!footerBar) return;
    const unpromotedCount = recentBtw.filter((it) => !it.isPromoted).length;
    footerBar.innerHTML = `
      <button type="button" class="bg-recent-clear-btn" ${unpromotedCount === 0 ? "disabled style='opacity:0.4;cursor:default;'" : ""} title="Clear unpromoted staged records">🗑️ Clear Stash (${unpromotedCount})</button>
    `;

    footerBar.querySelector(".bg-recent-clear-btn")?.addEventListener("click", (e) => {
      e.stopPropagation();
      const cleared = clearRecentStash();
      if (cleared > 0) {
        renderCardsPopoverContent();
        showToast(`Cleared ${cleared} staged records`, "info");
      }
    });
  }

  // --------------------------------------------------------------------------
  // Drag & Drop Card Text Directly into Chat Composer
  // --------------------------------------------------------------------------

  async function insertTextIntoComposer(text) {
    if (!text) return false;
    const box = document.querySelector('[data-testid="agent-input-box"]');
    if (!box) return false;

    // Locate the editable node (Lexical or textarea)
    let root = null;
    for (const node of box.querySelectorAll("[contenteditable]")) {
      if (!node.isContentEditable) continue;
      if (node.__lexicalEditor) {
        root = node;
        break;
      }
      root = root || node;
    }
    if (!root) {
      root = box.querySelector("textarea") || box.querySelector('[contenteditable="true"]') || box;
    }

    // 1. Textarea or Input field
    if (root instanceof HTMLTextAreaElement || root instanceof HTMLInputElement) {
      root.focus();
      const start = root.selectionStart ?? root.value.length;
      const end = root.selectionEnd ?? root.value.length;
      const existing = root.value;
      const toInsert = existing.trim() ? `\n\n${text}` : text;
      root.setRangeText(toInsert, start, end, "end");
      root.dispatchEvent(new Event("input", { bubbles: true }));
      showToast("Card text copied to prompt", "success");
      return true;
    }

    // 2. Lexical Editor
    const editor = root.__lexicalEditor;
    if (editor && typeof editor.focus === "function") {
      editor.focus();
    } else {
      root.focus();
    }

    // Place caret at the end
    const sel = window.getSelection();
    if (!sel || !root.contains(sel.anchorNode)) {
      const range = document.createRange();
      range.selectNodeContents(root);
      range.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(range);
    }

    const existingText = (root.textContent || "").trim();
    const toInsert = existingText ? `\n\n${text}` : text;
    const initialLen = (root.textContent || "").length;

    // Strategy 1: Native clipboard paste via execCommand (most reliable in Electron/Lexical)
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(toInsert);
        document.execCommand("paste");
      }
    } catch (_) {}

    // Strategy 2: Synthetic ClipboardEvent if text didn't update
    if ((root.textContent || "").length === initialLen) {
      try {
        const dt = new DataTransfer();
        dt.setData("text/plain", toInsert);
        const pasteEvt = new ClipboardEvent("paste", {
          bubbles: true,
          cancelable: true,
          clipboardData: dt
        });
        root.dispatchEvent(pasteEvt);
      } catch (_) {}
    }

    // Strategy 3: Multiline insertText line by line if still not updated
    if ((root.textContent || "").length === initialLen) {
      try {
        const lines = toInsert.split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (i > 0) {
            document.execCommand("insertParagraph", false, null);
          }
          if (lines[i].length > 0) {
            document.execCommand("insertText", false, lines[i]);
          }
        }
      } catch (_) {}
    }

    // Strategy 4: Fallback single line insertText
    if ((root.textContent || "").length === initialLen) {
      try {
        document.execCommand("insertText", false, toInsert.replace(/\n+/g, " "));
      } catch (_) {}
    }

    showToast("Card text copied to prompt", "success");
    return true;
  }

  function attachComposerDropTarget() {
    const legacySlot = document.getElementById("bg-timeslip-attached-slot");
    if (legacySlot) legacySlot.remove();

    const box = document.querySelector('[data-testid="agent-input-box"]');
    if (!box || box.dataset.bgTimeslipDropTargetAttached) return;

    box.dataset.bgTimeslipDropTargetAttached = "true";

    box.addEventListener(
      "dragover",
      (e) => {
        if (
          e.dataTransfer.types.includes("application/x-bettergravity-card") ||
          e.dataTransfer.types.includes("text/plain")
        ) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          box.classList.add("bg-composer-drop-active");
        }
      },
      true
    );

    box.addEventListener(
      "dragleave",
      (e) => {
        if (!box.contains(e.relatedTarget)) {
          box.classList.remove("bg-composer-drop-active");
        }
      },
      true
    );

    box.addEventListener(
      "drop",
      (e) => {
        box.classList.remove("bg-composer-drop-active");
        const rawCard = e.dataTransfer.getData("application/x-bettergravity-card");
        let textToInsert = "";
        if (rawCard) {
          try {
            const parsed = JSON.parse(rawCard);
            textToInsert = (parsed.content || "").trim();
          } catch (_) {}
        }
        if (!textToInsert) {
          textToInsert = (e.dataTransfer.getData("text/plain") || "").trim();
        }

        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        if (!textToInsert) return;

        setTimeout(() => {
          insertTextIntoComposer(textToInsert);
        }, 30);
      },
      true
    );
  }

  function renderRailCardsIcon(rail) {
    if (!rail) return;
    let existing = rail.querySelector(".bg-timeline-action-cards");
    if (!existing) {
      existing = document.createElement("div");
      existing.className = "bg-timeline-node bg-timeline-action-cards";
      existing.title = "Timeslip Context Cards";
      existing.innerHTML = `
        <div class="bg-timeline-action-icon">🗂️</div>
        <div class="bg-timeline-card bg-turn-details">
          <div class="bg-timeline-card-header">
            <span class="bg-timeline-step-label">Context Cards</span>
          </div>
          <div class="bg-timeline-snippet">Browse and attach saved cards (${timeslipCards.length})</div>
        </div>
      `;
      existing.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleCardsPopover(existing);
      });
      const exportNode = rail.querySelector(".bg-timeline-action-export");
      if (exportNode && exportNode.nextSibling) {
        exportNode.after(existing);
      } else {
        rail.prepend(existing);
      }
    }
  }

  function renderHeaderCardsBtn(titleBar, exportBtn) {
    if (!titleBar) return;
    let btn = document.getElementById("bg-header-cards-btn");
    if (!btn) {
      btn = document.createElement("div");
      btn.id = "bg-header-cards-btn";
      btn.className = "bg-header-action-pill bg-header-cards-pill";
      btn.setAttribute("data-no-drag", "");
      btn.setAttribute("role", "button");
      btn.setAttribute("tabindex", "0");
      btn.title = "Timeslip Context Cards";
      btn.innerHTML = `
        <span class="bg-header-pill-icon">🗂️</span>
        <span class="bg-header-pill-text">Cards</span>
      `;

      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        toggleCardsPopover(btn);
      });
    }

    if (exportBtn && exportBtn.parentElement === titleBar) {
      if (exportBtn.nextElementSibling !== btn) {
        exportBtn.after(btn);
      }
    } else if (btn.parentElement !== titleBar) {
      titleBar.appendChild(btn);
    }
  }

  function isComposerCardsEnabled() {
    return pluginSettings.showComposerCards !== false;
  }

  function setComposerCardsVisibility(visible) {
    window.__bettergravityShowComposerCards = visible;
    if (visible) {
      mountComposerCardsButton();
    } else {
      unmountComposerCardsButton();
    }
  }

  function mountComposerCardsButton() {
    if (!isComposerCardsEnabled()) {
      unmountComposerCardsButton();
      return;
    }

    const box = document.querySelector('[data-testid="agent-input-box"]');
    if (!box) return;

    let btn = box.querySelector(".bg-cards-trigger-btn");
    if (!btn) {
      btn = document.createElement("button");
      btn.type = "button";
      btn.className = `bg-cards-trigger-btn ${isCardsPopoverOpen() ? "bg-btn-active" : ""}`;
      btn.title = "Context Cards (Alt+C)";
      btn.setAttribute("data-no-drag", "true");
      btn.innerHTML = `
        <span class="bg-sc-icon">🗂️</span>
        <span class="bg-sc-label">Cards</span>
      `;
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleCardsPopover(btn);
      });
    }

    const plusBtn = box.querySelector('button[aria-label="Add context"]');
    if (plusBtn && plusBtn.parentElement) {
      if (btn.previousElementSibling !== plusBtn || btn.parentElement !== plusBtn.parentElement) {
        plusBtn.after(btn);
      }
    } else {
      const targetParent =
        box.querySelector('button[data-testid="model-selector-trigger"]')?.closest(".flex.min-w-0.flex-1") ||
        box.querySelector(".flex.min-w-0.flex-1.items-center") ||
        box.querySelector(".flex.w-full.items-center.justify-between") ||
        box;
      if (btn.parentElement !== targetParent) {
        targetParent.appendChild(btn);
      }
    }
  }

  function unmountComposerCardsButton() {
    document.querySelectorAll(".bg-cards-trigger-btn").forEach((b) => b.remove());
  }

