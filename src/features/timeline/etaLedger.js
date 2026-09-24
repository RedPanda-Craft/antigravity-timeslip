  // --------------------------------------------------------------------------
  // Feature: Adaptive Delay Ledger & Soft ETA Engine
  // --------------------------------------------------------------------------

  const LEDGER_STORAGE_KEY = "__bettergravity_delay_ledger_v1";
  const LEDGER_MAX_SAMPLES = 30;

  const DelayLedger = {
    samples: [],
    p50Ms: 45000,
    p90Ms: 90000,

    init() {
      try {
        const raw = localStorage.getItem(LEDGER_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed?.samples)) {
            this.samples = parsed.samples.slice(-LEDGER_MAX_SAMPLES);
            this.recompute();
          }
        }
      } catch {}
    },

    save() {
      try {
        localStorage.setItem(
          LEDGER_STORAGE_KEY,
          JSON.stringify({
            version: 1,
            samples: this.samples,
            p50Ms: this.p50Ms,
            p90Ms: this.p90Ms
          })
        );
      } catch {}
    },

    addSample(durationMs, steps) {
      if (typeof durationMs !== "number" || isNaN(durationMs)) return;
      if (durationMs < 2000 || durationMs > 900000) return;
      this.samples.push({
        durationMs: Math.round(durationMs),
        steps: typeof steps === "number" ? steps : 1,
        ts: Date.now()
      });
      if (this.samples.length > LEDGER_MAX_SAMPLES) {
        this.samples.shift();
      }
      this.recompute();
      this.save();
    },

    recompute() {
      if (this.samples.length === 0) {
        this.p50Ms = 45000;
        this.p90Ms = 90000;
        return;
      }
      const sorted = this.samples.map((s) => s.durationMs).sort((a, b) => a - b);
      const n = sorted.length;
      this.p50Ms = Math.max(25000, sorted[Math.floor(0.5 * n)]);
      this.p90Ms = Math.max(60000, sorted[Math.min(n - 1, Math.floor(0.9 * n))]);
    },

    getFormat(elapsedSec, steps) {
      const p50Sec = Math.floor(this.p50Ms / 1000);
      const p90Sec = Math.floor(this.p90Ms / 1000);

      const timeStr = elapsedSec < 60 ? `${elapsedSec}s` : `${Math.floor(elapsedSec / 60)}m ${elapsedSec % 60}s`;
      const stepInfo = steps > 1 ? ` · Step ${steps}` : "";

      if (elapsedSec >= p90Sec) {
        return {
          text: `Deep Thinking (${timeStr}${stepInfo})`,
          isDeep: true
        };
      }

      if (elapsedSec < 15) {
        const estStr = p50Sec < 60 ? `~${Math.round(p50Sec / 5) * 5}s` : `~${Math.max(1, Math.round(p50Sec / 60))}m`;
        return {
          text: `Running (${timeStr} · Est. ${estStr})`,
          isDeep: false
        };
      }

      const targetSec = Math.max(p50Sec, elapsedSec + 15);
      const estStr = targetSec < 60 ? `~${Math.round(targetSec / 10) * 10}s` : `~${Math.ceil(targetSec / 60)}m`;
      return {
        text: `Running (${timeStr}${stepInfo} · Est. ${estStr})`,
        isDeep: false
      };
    }
  };

  DelayLedger.init();

  const activeRunningSessions = new Map();
  let RunningBadgeComponent = null;

  function getRunningBadge(z) {
    if (!RunningBadgeComponent) {
      RunningBadgeComponent = function RunningBadge({ summary, defaultText, cascadeId }) {
        const getStartMs = () => {
          const t = summary?.lastUserInputTime;
          if (!t) return Date.now();
          return Number(t.seconds || 0) * 1000 + Number(t.nanos || 0) / 1e6;
        };

        const [elapsed, setElapsed] = z.useState(() => {
          return Math.max(0, Math.floor((Date.now() - getStartMs()) / 1000));
        });

        const startStep = summary?.lastUserInputStepIndex ?? 0;
        const currentStep = summary?.stepCount ?? 0;
        const turnStepCount = currentStep > startStep ? currentStep - startStep : 1;

        z.useEffect(() => {
          if (cascadeId) {
            activeRunningSessions.set(cascadeId, {
              startMs: getStartMs(),
              startStep,
              lastStep: currentStep
            });
          }

          const calc = () => {
            const now = Date.now();
            setElapsed(Math.max(0, Math.floor((now - getStartMs()) / 1000)));
            if (cascadeId && activeRunningSessions.has(cascadeId)) {
              activeRunningSessions.get(cascadeId).lastStep = summary?.stepCount ?? currentStep;
            }
          };

          calc();
          const timer = setInterval(calc, 1000);
          return () => clearInterval(timer);
        }, [summary?.lastUserInputTime?.seconds, cascadeId, currentStep]);

        const format = DelayLedger.getFormat(elapsed, turnStepCount);

        return z.createElement(
          "span",
          {
            className: `inline-flex items-center gap-1 font-mono text-xs select-none ${
              format.isDeep ? "text-sky-400 font-semibold" : "text-primary font-medium"
            }`,
            style: { fontVariantNumeric: "tabular-nums" }
          },
          format.text
        );
      };
    }
    return RunningBadgeComponent;
  }

  globalThis.__bettergravityRenderStatus = function (z, summary, statusText, cascadeId) {
    if (!z || typeof z.createElement !== "function" || typeof z.useState !== "function") {
      return statusText;
    }

    if (cascadeId && activeRunningSessions.has(cascadeId)) {
      if (statusText !== "Running") {
        const session = activeRunningSessions.get(cascadeId);
        activeRunningSessions.delete(cascadeId);
        if (session && session.startMs > 0) {
          const durationMs = Date.now() - session.startMs;
          const totalSteps = Math.max(1, (summary?.stepCount ?? session.lastStep) - session.startStep);
          DelayLedger.addSample(durationMs, totalSteps);
        }
      }
    }

    if (statusText === "Running") {
      const Badge = getRunningBadge(z);
      return z.createElement(Badge, { summary, defaultText: statusText, cascadeId });
    }

    return statusText;
  };
