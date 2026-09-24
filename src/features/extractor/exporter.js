  // --------------------------------------------------------------------------
  // Feature: Timeslip Extractor - Data Gathering, Serializer & Exporter Engine
  // --------------------------------------------------------------------------

  async function fetchFullTrajectoryData(activeId) {
    if (!activeId) return [];
    const agentService = findAgentService();
    const turnListFromRegistry = conversationTurnRegistry.get(activeId) || [];

    let trajectorySteps = [];
    if (agentService && typeof agentService.getCascadeTrajectory === "function") {
      try {
        let res = null;
        try {
          res = await agentService.getCascadeTrajectory({ cascadeId: activeId, verbosity: 3 });
        } catch (_) {
          res = await agentService.getCascadeTrajectory(activeId);
        }
        const traj = res?.trajectory || res;
        trajectorySteps = traj?.steps || traj?.trajectorySteps || [];
      } catch (err) {
        plugin.log?.warn?.(`[EXTRACT_RPC_WARN] ${err.message}`);
      }
    }

    if (Array.isArray(trajectorySteps) && trajectorySteps.length > 0) {
      const turns = [];
      let currentTurn = null;

      trajectorySteps.forEach((s, stepIdx) => {
        const stepCase = s.step?.case;
        const val = s.step?.value || {};

        if (stepCase === "userInput") {
          let text = "";
          const attachments = [];
          if (Array.isArray(val.items)) {
            val.items.forEach((it) => {
              if (typeof it === "string") text += it;
              else if (it.chunk?.value) text += it.chunk.value;
              else if (it.text) text += it.text;
              else if (it.media?.uri || it.media?.path) {
                attachments.push(it.media.uri || it.media.path);
              }
            });
          }
          if (!text && typeof val.query === "string") text = val.query;
          if (!text && typeof val.userResponse === "string") text = val.userResponse;
          text = text.replace(/^\[object Object\]\s*/g, "").trim();

          const turnIdx = turns.length;
          currentTurn = {
            turnIndex: turnIdx,
            globalStep: stepIdx,
            userQuery: text || `Turn #${turnIdx + 1}`,
            assistantResponse: "",
            codeBlocks: [],
            toolCalls: [],
            thinking: "",
            attachments
          };
          turns.push(currentTurn);
        } else if (stepCase === "plannerResponse") {
          if (!currentTurn) {
            currentTurn = {
              turnIndex: 0,
              globalStep: stepIdx,
              userQuery: "Initial Prompt",
              assistantResponse: "",
              codeBlocks: [],
              toolCalls: [],
              thinking: "",
              attachments: []
            };
            turns.push(currentTurn);
          }

          let respText = "";
          if (typeof val.response === "string") respText = val.response;
          else if (typeof val.content === "string") respText = val.content;
          else if (typeof val.text === "string") respText = val.text;
          else if (Array.isArray(val.candidates)) {
            respText = val.candidates
              .map((c) => c?.content?.parts?.map((p) => p.text || "").join("") || "")
              .join("\n");
          }

          if (respText) {
            currentTurn.assistantResponse = currentTurn.assistantResponse
              ? currentTurn.assistantResponse + "\n\n" + respText.trim()
              : respText.trim();
          }

          if (val.thought || val.thinking) {
            const th = String(val.thought || val.thinking).trim();
            currentTurn.thinking = currentTurn.thinking
              ? currentTurn.thinking + "\n\n" + th
              : th;
          }

          if (Array.isArray(val.toolCalls)) {
            val.toolCalls.forEach((tc) => {
              currentTurn.toolCalls.push({
                name: tc.name || tc.toolName || "tool",
                args: tc.args || tc.parameters || {},
                output: ""
              });
            });
          }
        } else if (stepCase === "generic") {
          // Tool execution output
          if (currentTurn && currentTurn.toolCalls.length > 0) {
            const lastTc = currentTurn.toolCalls[currentTurn.toolCalls.length - 1];
            let outText = "";
            if (typeof val.output === "string") outText = val.output;
            else if (typeof val.content === "string") outText = val.content;
            if (outText && !lastTc.output) {
              lastTc.output = outText.slice(0, 1000);
            }
          }
        }
      });

      if (turns.length > 0) return turns;
    }

    // Fallback: Build from turnStore & mounted DOM
    const fallbackTurns = [];
    const convView = document.querySelector('[data-testid="conversation-view"]');

    turnListFromRegistry.forEach((t, idx) => {
      let assistantText = "";
      if (convView) {
        const stepEl = findMountedStepEl(convView, idx, t);
        if (stepEl) {
          let nextEl = stepEl.nextElementSibling;
          while (nextEl && nextEl.getAttribute("data-testid") !== "user-input-step") {
            const respBody =
              nextEl.querySelector(".markdown, .prose, [class*='markdown']") ||
              nextEl;
            if (respBody) {
              const txt = (respBody.textContent || "").trim();
              if (txt) {
                assistantText += (assistantText ? "\n\n" : "") + txt;
              }
            }
            nextEl = nextEl.nextElementSibling;
          }
        }
      }

      fallbackTurns.push({
        turnIndex: idx,
        globalStep: t.globalStep ?? idx,
        userQuery: t.fullText || t.prompt || t.snippet || `Turn #${idx + 1}`,
        assistantResponse: assistantText,
        codeBlocks: [],
        toolCalls: [],
        thinking: "",
        attachments: []
      });
    });

    return fallbackTurns;
  }

  function serializeToMarkdown(selectedTurns, options, meta = {}) {
    const lines = [];
    const title = meta.title || "Conversation Export";
    const dateStr = new Date().toLocaleString();

    lines.push(`# ${title}`);
    lines.push(`> Exported with Timeslip on ${dateStr} · ${selectedTurns.length} turns\n`);
    lines.push("---\n");

    selectedTurns.forEach((turn, i) => {
      lines.push(`## Turn ${turn.turnIndex + 1}\n`);

      if (options.user !== false && turn.userQuery) {
        lines.push(`### User\n`);
        lines.push(turn.userQuery.trim());
        if (options.attachments && Array.isArray(turn.attachments) && turn.attachments.length > 0) {
          lines.push(`\n**Attachments:**`);
          turn.attachments.forEach((att) => lines.push(`- \`${att}\``));
        }
        lines.push("\n");
      }

      if (options.thinking && turn.thinking) {
        lines.push(`> **Thought Process:**\n> ` + turn.thinking.replace(/\n/g, "\n> ") + "\n");
      }

      if (options.assistant !== false && turn.assistantResponse) {
        lines.push(`### Assistant\n`);
        let text = turn.assistantResponse.trim();
        if (options.codeBlocks === false) {
          text = text.replace(/```[\s\S]*?```/g, "[Code Block Omitted]");
        }
        lines.push(text);
        lines.push("\n");
      }

      if (options.toolCalls && Array.isArray(turn.toolCalls) && turn.toolCalls.length > 0) {
        lines.push(`#### Tool Executions\n`);
        turn.toolCalls.forEach((tc) => {
          lines.push(`- **Tool:** \`${tc.name}\``);
          if (tc.output) {
            lines.push(`  \`\`\`\n  ${tc.output.slice(0, 300).trim()}\n  \`\`\``);
          }
        });
        lines.push("\n");
      }

      lines.push("---\n");
    });

    return lines.join("\n");
  }

  function serializeToJSON(selectedTurns, options, meta = {}) {
    const payload = {
      title: meta.title || "Conversation Export",
      conversationId: meta.conversationId || "",
      exportedAt: new Date().toISOString(),
      generator: "Timeslip Conversation Extractor",
      totalTurns: selectedTurns.length,
      turns: selectedTurns.map((t) => {
        const item = {
          turnIndex: t.turnIndex,
          globalStep: t.globalStep
        };
        if (options.user !== false) {
          item.user = t.userQuery;
          if (options.attachments && t.attachments?.length) item.attachments = t.attachments;
        }
        if (options.thinking && t.thinking) item.thinking = t.thinking;
        if (options.assistant !== false) {
          item.assistant = t.assistantResponse;
        }
        if (options.toolCalls && t.toolCalls?.length) item.toolCalls = t.toolCalls;
        return item;
      })
    };
    return JSON.stringify(payload, null, 2);
  }

  async function copyTextToClipboard(text) {
    if (!text) return false;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (_) {}

    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      const success = document.execCommand("copy");
      textarea.remove();
      return success;
    } catch (_) {
      return false;
    }
  }

  function downloadFileBlob(content, filename, mimeType = "text/markdown;charset=utf-8") {
    try {
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        a.remove();
        URL.revokeObjectURL(url);
      }, 100);
      return true;
    } catch (err) {
      showToast(`Export download failed: ${err.message}`, "error");
      return false;
    }
  }
