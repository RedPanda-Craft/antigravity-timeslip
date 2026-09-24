  // --------------------------------------------------------------------------
  // Feature: Timeslip Context Cards - Popover HUD & Composer Injection Hook
  // --------------------------------------------------------------------------

  let cardsPopoverEl = null;
  let activeCardSearch = "";
  let activeCardTag = "all";
  let hasHookedComposer = false;

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
      let left = rect.left - popoverWidth - 10;
      if (left < 10) left = 10;
      let top = rect.top;
      if (top + 460 > window.innerHeight) top = window.innerHeight - 470;
      if (top < 10) top = 10;
      cardsPopoverEl.style.left = `${left}px`;
      cardsPopoverEl.style.top = `${top}px`;
    } else {
      cardsPopoverEl.style.right = "52px";
      cardsPopoverEl.style.top = "60px";
      cardsPopoverEl.style.left = "auto";
    }

    requestAnimationFrame(() => {
      cardsPopoverEl.classList.add("is-open");
      const searchInput = cardsPopoverEl.querySelector(".bg-cards-search-input");
      if (searchInput) searchInput.focus();
    });
  }

  function closeCardsPopover() {
    if (cardsPopoverEl) {
      cardsPopoverEl.classList.remove("is-open");
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
          <span class="bg-cards-title-icon">🗂️</span>
          <span>Context Cards</span>
          <span class="bg-cards-count-badge" id="bg-cards-count-badge">0</span>
        </div>
        <button type="button" class="bg-cards-close-btn" title="Close Cards (Esc)">✕</button>
      </div>
      <div class="bg-cards-search-box">
        <input type="text" class="bg-cards-search-input" placeholder="Search cards or tags..." />
      </div>
      <div class="bg-cards-tags-bar" id="bg-cards-tags-bar"></div>
      <div class="bg-cards-list-container" id="bg-cards-list-container"></div>
      <div class="bg-cards-popover-footer">
        <span class="bg-cards-tip">Click 📌 to pin · Click 📎 to attach to prompt</span>
      </div>
    `;

    pop.querySelector(".bg-cards-close-btn")?.addEventListener("click", closeCardsPopover);

    const searchInput = pop.querySelector(".bg-cards-search-input");
    searchInput?.addEventListener("input", (e) => {
      activeCardSearch = (e.target.value || "").trim().toLowerCase();
      renderCardsList(pop);
    });

    return pop;
  }

  function renderCardsPopoverContent() {
    if (!cardsPopoverEl) return;
    const badge = cardsPopoverEl.querySelector("#bg-cards-count-badge");
    if (badge) badge.textContent = String(timeslipCards.length);

    renderTagsBar(cardsPopoverEl);
    renderCardsList(cardsPopoverEl);
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
          <div class="bg-cards-empty-sub">Extract turns from Timeline or save notes as cards</div>
        </div>
      `;
      return;
    }

    filtered.forEach((card) => {
      const cardEl = document.createElement("div");
      cardEl.className = `bg-card-node-item ${card.isPinned ? "is-pinned" : ""}`;

      const isAttached = attachedCards.some((c) => c.id === card.id);

      cardEl.innerHTML = `
        <div class="bg-card-node-header">
          <div class="bg-card-node-title" title="${escapeHtml(card.title)}">
            ${card.isPinned ? "📌 " : ""}${escapeHtml(card.title)}
          </div>
          <div class="bg-card-node-actions">
            <button type="button" class="bg-card-action-btn bg-card-pin-btn" title="${card.isPinned ? "Unpin" : "Pin"}">
              ${card.isPinned ? "★" : "☆"}
            </button>
            <button type="button" class="bg-card-action-btn bg-card-attach-btn ${isAttached ? "is-attached" : ""}" title="${isAttached ? "Attached to prompt" : "Attach to prompt"}">
              ${isAttached ? "✓" : "📎"}
            </button>
            <button type="button" class="bg-card-action-btn bg-card-copy-btn" title="Copy Content">📋</button>
            <button type="button" class="bg-card-action-btn bg-card-del-btn" title="Delete Card">🗑️</button>
          </div>
        </div>
        <div class="bg-card-node-snippet">${escapeHtml((card.content || "").slice(0, 140))}${(card.content || "").length > 140 ? "..." : ""}</div>
      `;

      cardEl.querySelector(".bg-card-pin-btn")?.addEventListener("click", (e) => {
        e.stopPropagation();
        togglePinCard(card.id);
        renderCardsPopoverContent();
      });

      cardEl.querySelector(".bg-card-attach-btn")?.addEventListener("click", (e) => {
        e.stopPropagation();
        if (isAttached) {
          detachCardFromComposer(card.id);
        } else {
          attachCardToComposer(card);
        }
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

  // --------------------------------------------------------------------------
  // Attached Cards Capsule Bar & React Fiber Submit Hook
  // --------------------------------------------------------------------------

  function renderAttachedCardsSlot() {
    const composer = document.querySelector('[data-testid="agent-input-box"]');
    if (!composer) return;

    let slot = document.getElementById("bg-timeslip-attached-slot");
    if (attachedCards.length === 0) {
      if (slot) slot.remove();
      return;
    }

    if (!slot) {
      slot = document.createElement("div");
      slot.id = "bg-timeslip-attached-slot";
      slot.className = "bg-attached-cards-bar";
      composer.prepend(slot);
    }

    slot.innerHTML = "";
    attachedCards.forEach((c) => {
      const cap = document.createElement("div");
      cap.className = "bg-attached-capsule";
      cap.title = `Attached Context: ${c.title}`;
      cap.innerHTML = `
        <span class="bg-capsule-icon">📎</span>
        <span class="bg-capsule-title">${escapeHtml(c.title)}</span>
        <button type="button" class="bg-capsule-remove" title="Remove attachment">✕</button>
      `;

      cap.querySelector(".bg-capsule-remove")?.addEventListener("click", (e) => {
        e.stopPropagation();
        detachCardFromComposer(c.id);
        renderCardsPopoverContent();
      });

      slot.appendChild(cap);
    });
  }

  function hookComposerSubmit() {
    const box = document.querySelector('[data-testid="agent-input-box"]');
    if (!box) return false;

    let fiber = null;
    for (const k in box) {
      if (k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$")) {
        fiber = box[k];
        break;
      }
    }
    if (!fiber) return false;

    let cur = fiber;
    let depth = 0;
    while (cur && depth < 25) {
      const props = cur.memoizedProps;
      if (props && typeof props.handleSubmit === "function") {
        if (!props.handleSubmit.__bgTimeslipHooked) {
          const origSubmit = props.handleSubmit;
          const hookedSubmit = async function (cc, ld, Gk, Xs, $R, aS) {
            if (attachedCards.length > 0) {
              const cardsText = attachedCards
                .map((c) => {
                  const clean = (c.content || "").trim();
                  return `[Context Card: ${c.title}]\n${clean}`;
                })
                .join("\n\n");

              const cardChunk = {
                chunk: {
                  case: "text",
                  value: `${cardsText}\n\n`
                }
              };

              if (Array.isArray(cc)) {
                cc = [cardChunk, ...cc];
              }

              plugin.log?.info?.(`[TIMESLIP_CARDS] Injected ${attachedCards.length} context card(s) into submit payload`);
              clearAttachedCards();
            }

            return origSubmit.call(this, cc, ld, Gk, Xs, $R, aS);
          };

          hookedSubmit.__bgTimeslipHooked = true;
          props.handleSubmit = hookedSubmit;
          hasHookedComposer = true;
        }
        return true;
      }
      cur = cur.return;
      depth += 1;
    }
    return false;
  }

  // Subscribe to store changes to keep attached capsules updated
  subscribeCardsChange(() => {
    renderAttachedCardsSlot();
  });

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
