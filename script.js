(() => {
  "use strict";

  // Local backend (uvicorn). For your hosted backend use:
  // "https://mansik-santulan-score.onrender.com"
  const API_BASE = "http://127.0.0.1:8000";
  const REQUEST_TIMEOUT_MS = 90000; // Render free plan can take up to ~60 s to wake up

  const form = document.getElementById("predict-form");
  const submitBtn = document.getElementById("submit-btn");
  const resetBtn = document.getElementById("reset-btn");
  const errorRetryBtn = document.getElementById("error-retry-btn");

  const stateIdle = document.getElementById("state-idle");
  const stateLoading = document.getElementById("state-loading");
  const stateResult = document.getElementById("state-result");
  const stateError = document.getElementById("state-error");

  const scoreNumberEl = document.getElementById("score-number");
  const scoreBandEl = document.getElementById("score-band");
  const scoreContextEl = document.getElementById("score-context");
  const gaugeFill = document.getElementById("gauge-fill");
  const errorLabelEl = document.getElementById("error-label"); // may be null; handled below
  const errorCopyEl = document.getElementById("error-copy");

  const GAUGE_ARC_LENGTH = 314; // approx pi * r(100)

  // ---------- Gauge tick marks ----------
  function drawTicks() {
    document.querySelectorAll(".gauge-ticks").forEach((g) => {
      g.innerHTML = "";
      const cx = 120, cy = 140, rOuter = 100, rInner = 90;
      for (let i = 0; i <= 10; i += 2) {
        const angle = Math.PI - (i / 10) * Math.PI;
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", (cx + rOuter * Math.cos(angle)).toFixed(1));
        line.setAttribute("y1", (cy - rOuter * Math.sin(angle)).toFixed(1));
        line.setAttribute("x2", (cx + rInner * Math.cos(angle)).toFixed(1));
        line.setAttribute("y2", (cy - rInner * Math.sin(angle)).toFixed(1));
        g.appendChild(line);
      }
    });
  }
  drawTicks();

  // ---------- Stress level segmented control ----------
  const segGroup = document.getElementById("stress_level_group");
  const stressHiddenInput = document.getElementById("stress_level");
  segGroup.querySelectorAll(".seg-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      segGroup.querySelectorAll(".seg-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      stressHiddenInput.value = btn.dataset.value;
      clearFieldError(stressHiddenInput);
    });
  });

  // ---------- Field error helpers ----------
  function setFieldError(input, message) {
    const wrap = input.closest(".field");
    if (!wrap) return;
    wrap.classList.add("field-error");
    const msgEl = wrap.querySelector(".error-msg");
    if (msgEl) msgEl.textContent = message;
  }

  function clearFieldError(input) {
    const wrap = input.closest(".field");
    if (!wrap) return;
    wrap.classList.remove("field-error");
    const msgEl = wrap.querySelector(".error-msg");
    if (msgEl) msgEl.textContent = "";
  }

  function clearAllErrors() {
    form.querySelectorAll(".field").forEach((f) => f.classList.remove("field-error"));
    form.querySelectorAll(".error-msg").forEach((m) => (m.textContent = ""));
  }

  // ---------- Build the payload with the backend's exact key names ----------
  function numberOrNaN(value, parser) {
    return value === "" || value === null ? NaN : parser(value);
  }

  function collectPayload() {
    const fd = new FormData(form);
    return {
      age: numberOrNaN(fd.get("age"), (v) => parseInt(v, 10)),
      gender: fd.get("gender") || "",
      country: (fd.get("country") || "").trim(),
      Academic_Level: fd.get("academic_level") || "",
      Most_Used_Platform: fd.get("most_used_platform") || "",
      Purpose_Of_Use: fd.get("purpose_of_use") || "",
      Avg_Daily_Usage_Hours: numberOrNaN(fd.get("avg_daily_usage_hours"), parseFloat),
      Daily_Unlocks: numberOrNaN(fd.get("daily_unlocks"), (v) => parseInt(v, 10)),
      Study_Hours: numberOrNaN(fd.get("study_hours"), parseFloat),
      Physical_Activity_Hours: numberOrNaN(fd.get("physical_activity_hours"), parseFloat),
      Sleep_Hours_Per_Night: numberOrNaN(fd.get("sleep_hours_per_night"), parseFloat),
      Stress_Level: fd.get("stress_level") || "",
    };
  }

  // ---------- Client-side validation (same limits as the backend) ----------
  function validate(payload) {
    const errors = [];

    // [element id, payload key, min, max]
    const numericChecks = [
      ["age", "age", 10, 100],
      ["avg_daily_usage_hours", "Avg_Daily_Usage_Hours", 0, 24],
      ["daily_unlocks", "Daily_Unlocks", 0, 100],
      ["study_hours", "Study_Hours", 0, 24],
      ["physical_activity_hours", "Physical_Activity_Hours", 0, 2],
      ["sleep_hours_per_night", "Sleep_Hours_Per_Night", 0, 24],
    ];

    numericChecks.forEach(([id, key, min, max]) => {
      const input = document.getElementById(id);
      const val = payload[key];
      if (Number.isNaN(val)) {
        errors.push([input, "This field is required."]);
      } else if (val < min || val > max) {
        errors.push([input, `Must be between ${min} and ${max}.`]);
      }
    });

    [
      ["gender", "gender"],
      ["country", "country"],
      ["academic_level", "Academic_Level"],
      ["most_used_platform", "Most_Used_Platform"],
      ["purpose_of_use", "Purpose_Of_Use"],
    ].forEach(([id, key]) => {
      if (!payload[key] || String(payload[key]).trim() === "") {
        errors.push([document.getElementById(id), "This field is required."]);
      }
    });

    if (!payload.Stress_Level) {
      errors.push([stressHiddenInput, "Pick a stress level."]);
    }

    return errors;
  }

  // ---------- UI state ----------
  function showState(name) {
    [stateIdle, stateLoading, stateResult, stateError].forEach((el) => (el.hidden = true));
    ({ idle: stateIdle, loading: stateLoading, result: stateResult, error: stateError }[name]).hidden = false;
  }

  function setSubmitting(isSubmitting) {
    submitBtn.disabled = isSubmitting;
    submitBtn.classList.toggle("loading", isSubmitting);
  }

  function bandFor(score) {
    if (score < 4) {
      return {
        label: "Signal: strained",
        context: "Your responses suggest elevated strain right now. Small shifts in sleep or screen time can go a long way.",
      };
    }
    if (score < 7) {
      return {
        label: "Signal: balanced",
        context: "Your rhythm looks fairly steady, with some room to recover and reset.",
      };
    }
    return {
      label: "Signal: strong",
      context: "Your habits point to a well-supported, resilient baseline. Keep it up.",
    };
  }

  function renderResult(score) {
    const clamped = Math.max(0, Math.min(10, score));
    const { label, context } = bandFor(clamped);

    scoreNumberEl.textContent = score.toFixed(2);
    scoreBandEl.textContent = label;
    scoreContextEl.textContent = context;

    gaugeFill.style.transition = "none";
    gaugeFill.style.strokeDashoffset = String(GAUGE_ARC_LENGTH);
    showState("result");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        gaugeFill.style.transition = "";
        gaugeFill.style.strokeDashoffset = String(GAUGE_ARC_LENGTH * (1 - clamped / 10));
      });
    });
  }

  function renderError(label, copy) {
    if (errorLabelEl) errorLabelEl.textContent = label;
    errorCopyEl.textContent = errorLabelEl ? copy : `${label}. ${copy}`;
    showState("error");
  }

  // ---------- Map FastAPI 422 errors back onto the form ----------
  function applyServerValidationErrors(detail) {
    if (!Array.isArray(detail)) return false;
    let matched = false;
    detail.forEach((err) => {
      const field = Array.isArray(err.loc) ? err.loc[err.loc.length - 1] : null;
      // Backend names like "Academic_Level" map to ids like "academic_level"
      const target = field ? document.getElementById(String(field).toLowerCase()) : null;
      if (target) {
        setFieldError(target, err.msg || "Invalid value.");
        matched = true;
      }
    });
    return matched;
  }

  // ---------- Submit ----------
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearAllErrors();

    const payload = collectPayload();
    const clientErrors = validate(payload);

    if (clientErrors.length > 0) {
      clientErrors.forEach(([input, msg]) => input && setFieldError(input, msg));
      const first = clientErrors[0][0];
      if (first && first.type !== "hidden") first.focus();
      return;
    }

    setSubmitting(true);
    showState("loading");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(`${API_BASE}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (res.status === 422) {
        const body = await res.json().catch(() => null);
        const matched = body && applyServerValidationErrors(body.detail);
        renderError(
          "Check your inputs",
          matched
            ? "The API rejected a few fields. Details are marked on the form."
            : "The API rejected this submission. Please review your inputs and try again."
        );
        return;
      }

      if (!res.ok) {
        let detailMsg = `The API responded with status ${res.status}.`;
        const body = await res.json().catch(() => null);
        if (body && typeof body.detail === "string") detailMsg = body.detail;
        renderError("Prediction failed", detailMsg);
        return;
      }

      const data = await res.json();
      if (typeof data.predicted_mental_health_score !== "number") {
        renderError("Unexpected response", "The API responded, but the score was missing or malformed.");
        return;
      }

      renderResult(data.predicted_mental_health_score);
    } catch (err) {
      if (err.name === "AbortError") {
        renderError("Server is taking too long", "The backend may be waking up. Wait a minute and try again.");
      } else {
        renderError("Can't reach the server", `Couldn't connect to ${API_BASE}. Check that the backend is running.`);
      }
    } finally {
      clearTimeout(timer);
      setSubmitting(false);
    }
  });

  // Clear errors as the user edits
  form.querySelectorAll("input, select").forEach((el) => {
    el.addEventListener("input", () => clearFieldError(el));
    el.addEventListener("change", () => clearFieldError(el));
  });

  resetBtn.addEventListener("click", () => showState("idle"));
  errorRetryBtn.addEventListener("click", () => showState("idle"));
})();