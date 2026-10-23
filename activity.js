/**
 * activity.js — Shared activity page logic for ARDF/Foxhunting LMS
 * Handles: checkbox persistence, progress bar, tier tracking,
 *          calibration sliders, reflective journals, concept-check
 *          MCQ, Google Sheets submission, done banner.
 */

(function () {
  "use strict";

  /* ──────────────────────────────────────────────────────────────
     CONFIG — override before this script on each page:
       window.ACT_ID        = "1"           // activity number (string)
       window.ACT_CHECKBOXES = 12           // total checkboxes on page
       window.ACT_TIERS      = ["t1","t2"]  // tier ids expected to complete
       window.GS_ENDPOINT    = "https://script.google.com/macros/s/AKfy.../exec"
  ─────────────────────────────────────────────────────────────── */
  const ACT_ID        = window.ACT_ID        || "0";
  const ACT_TOTAL_CHK = window.ACT_CHECKBOXES || 0;
  const ACT_TIERS     = window.ACT_TIERS      || [];
  const GS_ENDPOINT   = window.GS_ENDPOINT    || "";

  const LS_PREFIX     = "fox_chk_";
  const LS_DONE       = "fox_done";
  const QUIZ_MIN_PASS = 0.8; // 80 %
  const JOURNAL_MIN_WORDS = 15;

  /* ── UTILS ─────────────────────────────────────────────────── */
  function lsGet(key) {
    try { return JSON.parse(localStorage.getItem(key)); }
    catch (_) { return null; }
  }

  function lsSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); }
    catch (_) { /* storage unavailable */ }
  }

  function countWords(str) {
    return str.trim().split(/\s+/).filter(Boolean).length;
  }

  function showToast(msg, durationMs) {
    let el = document.getElementById("lms-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "lms-toast";
      el.className = "toast";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add("visible");
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.remove("visible"), durationMs || 2800);
  }

  /* ── 1. PROGRESS BAR ───────────────────────────────────────── */
  function refreshProgressBar() {
    const fill = document.querySelector(".progress-bar__fill");
    if (!fill) return;

    const key   = LS_PREFIX + ACT_ID;
    const saved = lsGet(key) || {};

    // Count checked boxes for THIS activity
    let checked = 0;
    const allChk = document.querySelectorAll(
      `input[type="checkbox"][data-act="${ACT_ID}"]`
    );

    if (allChk.length > 0) {
      allChk.forEach(cb => { if (saved[cb.dataset.idx] === true) checked++; });
      fill.style.width = allChk.length
        ? Math.round((checked / allChk.length) * 100) + "%"
        : "0%";
    } else if (ACT_TOTAL_CHK > 0) {
      // fallback: use stored count
      const n = Object.values(saved).filter(Boolean).length;
      fill.style.width = Math.round((n / ACT_TOTAL_CHK) * 100) + "%";
    }
  }

  /* ── 2. CHECKBOX PERSISTENCE ───────────────────────────────── */
  function initCheckboxes() {
    const key   = LS_PREFIX + ACT_ID;
    const saved = lsGet(key) || {};

    const checkboxes = document.querySelectorAll(
      `input[type="checkbox"][data-act="${ACT_ID}"]`
    );

    // Restore saved state
    checkboxes.forEach(cb => {
      const idx = cb.dataset.idx;
      if (idx && saved[idx]) {
        cb.checked = true;
        cb.closest("li") && cb.closest("li").classList.add("checked");
      }

      cb.addEventListener("change", () => {
        const store = lsGet(key) || {};
        if (cb.dataset.idx) store[cb.dataset.idx] = cb.checked;
        lsSet(key, store);

        const li = cb.closest("li");
        if (li) li.classList.toggle("checked", cb.checked);

        refreshProgressBar();
        checkTierCompletion();
        checkActivityDone();
      });
    });

    refreshProgressBar();
  }

  /* ── 3. TIER COMPLETION TRACKING ──────────────────────────── */
  function checkTierCompletion() {
    ACT_TIERS.forEach(tierId => {
      const section = document.querySelector(`[data-tier="${tierId}"]`);
      if (!section) return;

      const boxes = section.querySelectorAll(
        `input[type="checkbox"][data-act="${ACT_ID}"]`
      );
      if (!boxes.length) return;

      const allChecked = Array.from(boxes).every(cb => cb.checked);
      const header = section.querySelector(".tier-header");
      if (!header) return;

      if (allChecked) {
        header.dataset.complete = "true";
        if (!header.querySelector(".tier-tick")) {
          const tick = document.createElement("span");
          tick.className = "tier-tick";
          tick.textContent = " ✓";
          tick.style.cssText = "color:#1FA898;font-size:.9em;";
          header.appendChild(tick);
        }
      } else {
        header.dataset.complete = "";
        const tick = header.querySelector(".tier-tick");
        if (tick) tick.remove();
      }
    });
  }

  /* ── 4. ACTIVITY DONE CHECK ────────────────────────────────── */
  function checkActivityDone() {
    const journalOk = allJournalsOk();
    const quizOk    = window._quizPassed === true;

    // All checkboxes ticked?
    const key = LS_PREFIX + ACT_ID;
    const saved = lsGet(key) || {};
    const checkboxes = document.querySelectorAll(
      `input[type="checkbox"][data-act="${ACT_ID}"]`
    );
    const allChecked = checkboxes.length === 0 ||
      Array.from(checkboxes).every(cb => cb.checked);

    // All tiers complete?
    const tiersComplete = ACT_TIERS.every(tierId => {
      const section = document.querySelector(`[data-tier="${tierId}"]`);
      if (!section) return true;
      const boxes = section.querySelectorAll(
        `input[type="checkbox"][data-act="${ACT_ID}"]`
      );
      return !boxes.length || Array.from(boxes).every(cb => cb.checked);
    });

    // Concept check present? must pass
    const hasQuiz = !!document.querySelector(".concept-check");
    const quizGate = !hasQuiz || quizOk;

    // Journal present? must pass
    const hasJournal = !!document.querySelector(".journal-prompt");
    const journalGate = !hasJournal || journalOk;

    const done = allChecked && tiersComplete && quizGate && journalGate;

    if (done) {
      markActivityDone();
    }
  }

  function markActivityDone() {
    // Record in localStorage
    const doneList = lsGet(LS_DONE) || {};
    if (!doneList[ACT_ID]) {
      doneList[ACT_ID] = true;
      lsSet(LS_DONE, doneList);
      submitToSheets();
    }

    // Show done banner
    const banner = document.getElementById("done-banner");
    if (banner) banner.classList.add("visible");

    // Set progress bar to 100%
    const fill = document.querySelector(".progress-bar__fill");
    if (fill) fill.style.width = "100%";
  }

  /* ── 5. PRE/POST CALIBRATION SLIDERS ──────────────────────── */
  function initCalibrationSliders() {
    const sliders = document.querySelectorAll(".cal-slider");
    sliders.forEach(slider => {
      const valEl = document.getElementById(slider.dataset.valTarget);

      function update() {
        if (valEl) valEl.textContent = slider.value;
        // Store value
        const storeKey = "fox_cal_" + ACT_ID + "_" + slider.id;
        lsSet(storeKey, slider.value);
      }

      // Restore saved value
      const stored = lsGet("fox_cal_" + ACT_ID + "_" + slider.id);
      if (stored !== null) {
        slider.value = stored;
        if (valEl) valEl.textContent = stored;
      } else {
        if (valEl) valEl.textContent = slider.value;
      }

      slider.addEventListener("input", update);
    });
  }

  /* ── 6. REFLECTIVE JOURNAL WORD CHECKER ───────────────────── */
  function initJournals() {
    const prompts = document.querySelectorAll(".journal-prompt");
    prompts.forEach((prompt, i) => {
      const ta       = prompt.querySelector("textarea");
      const countEl  = prompt.querySelector(".journal-prompt__wordcount");
      if (!ta) return;

      // Restore saved journal text
      const storeKey = "fox_journal_" + ACT_ID + "_" + i;
      const saved = lsGet(storeKey);
      if (saved) ta.value = saved;

      function onInput() {
        const n = countWords(ta.value);
        lsSet(storeKey, ta.value);
        if (countEl) {
          countEl.textContent = `${n} / ${JOURNAL_MIN_WORDS} words minimum`;
          countEl.classList.toggle("ok", n >= JOURNAL_MIN_WORDS);
        }
        checkActivityDone();
      }

      ta.addEventListener("input", onInput);
      onInput(); // initial count
    });
  }

  function allJournalsOk() {
    const prompts = document.querySelectorAll(".journal-prompt");
    if (!prompts.length) return true;
    return Array.from(prompts).every(prompt => {
      const ta = prompt.querySelector("textarea");
      return ta && countWords(ta.value) >= JOURNAL_MIN_WORDS;
    });
  }

  /* ── 7. CONCEPT CHECK MCQ ──────────────────────────────────── */
  function initConceptCheck() {
    const form = document.getElementById("concept-form");
    if (!form) return;

    const submitBtn = form.querySelector(".quiz-submit");
    const resultEl  = form.querySelector(".quiz-result");

    // Re-check submit button state on any radio change
    form.addEventListener("change", () => {
      const questions = form.querySelectorAll(".quiz-q");
      const answered  = Array.from(questions).every(q =>
        q.querySelector("input[type='radio']:checked")
      );
      if (submitBtn) submitBtn.disabled = !answered;
    });

    if (submitBtn) submitBtn.disabled = true;

    if (submitBtn) {
      submitBtn.addEventListener("click", () => {
        const questions = form.querySelectorAll(".quiz-q");
        let correct = 0;

        questions.forEach(q => {
          const selected = q.querySelector("input[type='radio']:checked");
          if (!selected) return;

          const correctVal = q.dataset.answer;
          const labels     = q.querySelectorAll(".quiz-options label");

          labels.forEach(lbl => {
            const radio = lbl.querySelector("input[type='radio']");
            if (!radio) return;
            lbl.classList.remove("correct", "incorrect");
            if (radio.value === correctVal) {
              lbl.classList.add("correct");
            } else if (radio.checked) {
              lbl.classList.add("incorrect");
            }
          });

          if (selected.value === correctVal) correct++;

          // Lock inputs
          q.querySelectorAll("input[type='radio']").forEach(r => r.disabled = true);
        });

        const pct = questions.length ? correct / questions.length : 0;
        const passed = pct >= QUIZ_MIN_PASS;

        window._quizPassed = passed;

        if (resultEl) {
          resultEl.style.display = "block";
          resultEl.className = "quiz-result " + (passed ? "pass" : "fail");
          const score = Math.round(pct * 100);
          if (passed) {
            resultEl.textContent =
              `✓ Passed! You got ${correct} of ${questions.length} correct (${score}%). Great work!`;
          } else {
            resultEl.textContent =
              `✗ ${correct} of ${questions.length} correct (${score}%). You need ${Math.round(QUIZ_MIN_PASS * 100)}% to pass. Review the material and try again.`;
            // Allow retry: unlock inputs after short delay
            setTimeout(() => {
              questions.forEach(q => {
                const inputs = q.querySelectorAll("input[type='radio']");
                inputs.forEach(r => {
                  r.disabled = false;
                  r.checked  = false;
                });
                q.querySelectorAll(".quiz-options label")
                  .forEach(l => l.classList.remove("correct","incorrect"));
              });
              if (submitBtn) submitBtn.disabled = true;
            }, 3000);
          }
        }

        if (passed) {
          submitBtn.disabled = true;
          checkActivityDone();
          showToast("Concept check passed! 🎯");
        }
      });
    }
  }

  /* ── 8. TAB SYSTEM ─────────────────────────────────────────── */
  function initTabs() {
    document.querySelectorAll(".tab-bar").forEach(bar => {
      const container = bar.closest("[data-tabs]") || bar.parentElement;
      const panels    = container.querySelectorAll(".tab-panel");
      const btns      = bar.querySelectorAll(".tab-btn");

      function activate(idx) {
        btns.forEach((b, i) => {
          b.setAttribute("aria-selected", i === idx ? "true" : "false");
        });
        panels.forEach((p, i) => {
          p.classList.toggle("active", i === idx);
        });
        // Store last tab
        if (container.id) lsSet("fox_tab_" + container.id, idx);
      }

      // Restore last tab
      const saved = container.id
        ? (lsGet("fox_tab_" + container.id) || 0)
        : 0;
      activate(saved);

      btns.forEach((btn, i) => {
        btn.addEventListener("click", () => activate(i));
      });
    });
  }

  /* ── 9. FILL-IN BLANK CHECKER ──────────────────────────────── */
  function initBlanks() {
    document.querySelectorAll(".blank-field[data-answer]").forEach(input => {
      input.addEventListener("blur", () => {
        const correct = (input.dataset.answer || "").trim().toLowerCase();
        const given   = input.value.trim().toLowerCase();
        input.classList.remove("correct","incorrect");
        if (given === "") return;
        if (given === correct) {
          input.classList.add("correct");
          showToast("Correct! ✓", 1800);
        } else {
          input.classList.add("incorrect");
        }
      });
    });
  }

  /* ── 10. GOOGLE SHEETS SUBMISSION ──────────────────────────── */
  function submitToSheets() {
    if (!GS_ENDPOINT) return;

    const journals = {};
    document.querySelectorAll(".journal-prompt").forEach((p, i) => {
      const ta = p.querySelector("textarea");
      if (ta) journals["journal_" + (i + 1)] = ta.value;
    });

    const payload = {
      activityId:  ACT_ID,
      timestamp:   new Date().toISOString(),
      userAgent:   navigator.userAgent,
      ...journals,
    };

    // Fire-and-forget (no-cors so we don't block)
    fetch(GS_ENDPOINT, {
      method:  "POST",
      mode:    "no-cors",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
    }).catch(() => {
      // Submission failure is non-blocking; already saved locally
    });
  }

  /* ── 11. DONE BANNER INIT ──────────────────────────────────── */
  function initDoneBanner() {
    const doneList = lsGet(LS_DONE) || {};
    if (doneList[ACT_ID]) {
      const banner = document.getElementById("done-banner");
      if (banner) banner.classList.add("visible");

      const fill = document.querySelector(".progress-bar__fill");
      if (fill) fill.style.width = "100%";
    }
  }

  /* ── 12. NAVSEL CLOSE ON OUTSIDE CLICK ─────────────────────── */
  function initNavSel() {
    document.querySelectorAll(".navsel").forEach(details => {
      document.addEventListener("click", e => {
        if (!details.contains(e.target)) details.removeAttribute("open");
      });
    });
  }

  /* ── INIT ──────────────────────────────────────────────────── */
  function init() {
    initCheckboxes();
    initCalibrationSliders();
    initJournals();
    initConceptCheck();
    initTabs();
    initBlanks();
    initDoneBanner();
    initNavSel();
    checkTierCompletion();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
