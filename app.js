(() => {
  "use strict";
  const STORAGE_KEY = "lifeOS.data.v1";
  const SCHEMA_VERSION = 1;
  const $ = (id) => document.getElementById(id);
  const uid = (prefix) =>
    prefix +
    "_" +
    Date.now().toString(36) +
    "_" +
    Math.random().toString(36).slice(2, 8);
  const nowISO = () => new Date().toISOString();
  const localDate = (d = new Date()) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const dateFromISO = (s) => {
    const [y, m, d] = String(s).split("-").map(Number);
    return new Date(y, m - 1, d, 12, 0, 0, 0);
  };
  const escapeHTML = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const fmt = (sec) => {
    sec = Math.max(0, Math.floor(sec));
    const h = Math.floor(sec / 3600),
      m = Math.floor((sec % 3600) / 60),
      s = sec % 60;
    return h
      ? `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
      : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };
  const mins = (seconds) => `${Math.floor(seconds / 60)}m`;
  const humanMinutes = (m) => {
    m = Math.round(m || 0);
    const h = Math.floor(m / 60),
      r = m % 60;
    return h ? `${h}h ${r}m` : `${r}m`;
  };
  const humanDHM = (seconds) => {
    seconds = Math.max(0, Math.floor(seconds || 0));
    const totalMin = Math.floor(seconds / 60);
    const d = Math.floor(totalMin / 1440);
    const h = Math.floor((totalMin % 1440) / 60);
    const m = totalMin % 60;
    const parts = [];
    if (d > 0) parts.push(`${d}d`);
    if (d > 0 || h > 0) parts.push(`${h}h`);
    parts.push(`${m}m`);
    return parts.join(" ");
  };
  const weekStartDate = (date, startDay) => {
    const d = dateFromISO(date);
    const diff = (d.getDay() - Number(startDay) + 7) % 7;
    d.setDate(d.getDate() - diff);
    return localDate(d);
  };
  const addDays = (date, n) => {
    const d = dateFromISO(date);
    d.setDate(d.getDate() + n);
    return localDate(d);
  };
  const hmToMinutes = (h, m) =>
    Math.max(
      0,
      Number(h || 0) * 60 + Math.min(59, Math.max(0, Number(m || 0))),
    );
  const seed = () => {
    const cats = [
      {
        id: "cat_foundation",
        name: "Foundation",
        importance: 1,
        archived: false,
      },
      {
        id: "cat_responsibilities",
        name: "Responsibilities",
        importance: 2,
        archived: false,
      },
      {
        id: "cat_development",
        name: "Long-term Development",
        importance: 3,
        archived: false,
      },
      {
        id: "cat_relationships",
        name: "Relationships & Social Life",
        importance: 4,
        archived: false,
      },
      {
        id: "cat_memory",
        name: "Memory & Self-understanding",
        importance: 5,
        archived: false,
      },
      {
        id: "cat_management",
        name: "Problem Solving & Life Management",
        importance: 6,
        archived: false,
      },
    ];
    return {
      schemaVersion: SCHEMA_VERSION,
      lifeMap: {
        nodes: [],
        connections: [],
        customTypes: [],
        settings: { autoComplete: "manual" },
      },
      categories: cats,
      actions: [],
      tasks: [],
      logs: [],
      presets: [],
      reminders: [],
      reviews: {},
      settings: { weekStart: 1 },
      tracking: {
        activeActionId: null,
        segmentStart: null,
        accumulatedSeconds: 0,
        paused: false,
        pausedAt: null,
        originalStartAt: null,
      },
      focus: {
        presetId: null,
        running: false,
        paused: false,
        startedAt: null,
        pausedAt: null,
        elapsedBeforePause: 0,
        phaseIndex: 0,
        phaseStartedAt: null,
        phaseElapsedBeforePause: 0,
        alerted: false,
        mode: "both",
        trackingActionId: null,
      },
    };
  };
  let state = loadState();
  let toastTimer = null;
  let editingTaskId = null;
  let editingLogId = null;
  let reviewOffset = 0;
  let editingPresetId = null;
  let pipWindow = null;
  let lastReviewStart = "";
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return seed();
      const data = JSON.parse(raw);
      if (
        !data ||
        typeof data !== "object" ||
        !Array.isArray(data.actions) ||
        !Array.isArray(data.categories)
      )
        return seed();
      data.actions = (data.actions || []).map((a, i) => ({
        ...a,
        emoji: a.emoji || "",
        order: Number.isFinite(Number(a.order)) ? Number(a.order) : i,
        schedule: a.schedule || { type: "none", days: [] },
      }));
      data.tasks = (data.tasks || []).map((t) => ({
        ...t,
        tag: t.tag || "",
        dismissed: !!t.dismissed,
        source: t.source || "manual",
      }));
      data.reminders = (data.reminders || []).map((r) => ({
        ...r,
        emoji: r.emoji || "",
        history: r.history || [],
        rescheduledFrom: r.rescheduledFrom || null,
        archived: !!r.archived,
      }));
      return {
        ...seed(),
        ...data,
        schemaVersion: SCHEMA_VERSION,
        lifeMap: data.lifeMap || seed().lifeMap,
        settings: { ...seed().settings, ...(data.settings || {}) },
        tracking: { ...seed().tracking, ...(data.tracking || {}) },
        focus: { ...seed().focus, ...(data.focus || {}) },
        reviews: data.reviews || {},
      };
    } catch (e) {
      console.warn("Could not load Life OS data", e);
      return seed();
    }
  }
  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      notify("ডেটা সেভ করা যায়নি। Browser storage পূর্ণ কি না দেখো।");
    }
    try {
      window.lifeOSFirebase?.save(JSON.parse(JSON.stringify(state)));
    } catch (e) {
      console.warn("Cloud sync queue failed", e);
    }
  }
  function notify(msg) {
    const el = $("toast");
    el.textContent = msg;
    el.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add("hidden"), 2800);
  }
  function catById(id) {
    return state.categories.find((c) => c.id === id);
  }
  function actionById(id) {
    return state.actions.find((a) => a.id === id);
  }
  function reminderById(id) {
    return state.reminders.find((r) => r.id === id);
  }

  function computeInitialDueDate(schedule, fromDate) {
    if (schedule.type === "once") {
      return schedule.date || null;
    }

    const from = dateFromISO(fromDate);
    from.setHours(0, 0, 0, 0);

    if (schedule.type === "weekly") {
      const days = schedule.days || [];
      if (!days.length) return null;
      for (let i = 0; i < 14; i++) {
        const d = new Date(from);
        d.setDate(d.getDate() + i);
        if (days.includes(d.getDay())) return localDate(d);
      }
    } else if (schedule.type === "interval") {
      const weeks = Math.max(1, Number(schedule.weeks) || 1);
      const anchor = dateFromISO(schedule.anchorDate || localDate());
      const step = weeks * 7;
      let cursor = new Date(anchor);
      cursor.setHours(0, 0, 0, 0);
      while (cursor < from) cursor.setDate(cursor.getDate() + step);
      return localDate(cursor);
    }
    return null;
  }

  function computeNextAfter(schedule, afterDate) {
    if (schedule.type === "once") return null;
    return computeInitialDueDate(schedule, addDays(afterDate, 1));
  }

  const DAYS_BN = ["রবি", "সোম", "মঙ্গল", "বুধ", "বৃহস্পতি", "শুক্র", "শনি"];

  function describeSchedule(schedule) {
    if (schedule.type === "weekly") {
      const days = (schedule.days || []).map((d) => DAYS_BN[d]).join(", ");
      return `সাপ্তাহিক · ${days || "—"}`;
    }
    if (schedule.type === "interval") {
      return `প্রতি ${schedule.weeks || 1} সপ্তাহে · ${DAYS_BN[schedule.day] || "?"}`;
    }
    if (schedule.type === "once") {
      return `একবার · ${schedule.date || "—"}`;
    }
    return "—";
  }

  function getReminderBuckets(date) {
    const all = state.reminders.filter((r) => !r.archived);
    const due = [],
      overdue = [];
    all.forEach((r) => {
      if (!r.nextDueDate) return;
      if (r.nextDueDate === date) due.push(r);
      else if (r.nextDueDate < date) overdue.push(r);
    });
    overdue.sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate));
    return { due, overdue };
  }
  function presetById(id) {
    return state.presets.find((p) => p.id === id);
  }
  function taskById(id) {
    return state.tasks.find((t) => t.id === id);
  }
  function activeAction() {
    return actionById(state.tracking.activeActionId);
  }
  function activePreset() {
    return presetById(state.focus.presetId);
  }
  function activePhase() {
    const p = activePreset();
    return p && p.phases ? p.phases[state.focus.phaseIndex] || null : null;
  }
  function currentTrackingSeconds() {
    const t = state.tracking;
    if (!t.activeActionId) return 0;
    const acc = Number(t.accumulatedSeconds) || 0;
    if (t.paused || !t.segmentStart) return acc;
    return (
      acc +
      Math.max(0, (Date.now() - new Date(t.segmentStart).getTime()) / 1000)
    );
  }
  function focusElapsed() {
    const f = state.focus;
    if (!f.running && !f.paused) return 0;
    if (f.paused) return f.elapsedBeforePause || 0;
    return (
      (f.elapsedBeforePause || 0) +
      Math.max(0, (Date.now() - new Date(f.startedAt).getTime()) / 1000)
    );
  }
  function phaseElapsed() {
    const f = state.focus;
    if (!f.running && !f.paused) return 0;
    if (f.paused) return f.phaseElapsedBeforePause || 0;
    return (
      (f.phaseElapsedBeforePause || 0) +
      Math.max(0, (Date.now() - new Date(f.phaseStartedAt).getTime()) / 1000)
    );
  }
  function fillSelect(el, items, placeholder, selected) {
    el.innerHTML = "";
    if (placeholder) {
      const o = document.createElement("option");
      o.value = "";
      o.textContent = placeholder;
      el.appendChild(o);
    }
    items.forEach((x) => {
      const o = document.createElement("option");
      o.value = x.id;
      o.textContent = (x.emoji ? x.emoji + " " : "") + x.name;
      el.appendChild(o);
    });
    if (selected) el.value = selected;
  }
  function activeCats() {
    return state.categories
      .filter((c) => !c.archived)
      .sort((a, b) => a.importance - b.importance);
  }
  function activeActions() {
    return state.actions
      .filter((a) => !a.archived)
      .sort(
        (a, b) =>
          (Number(a.order) || 0) - (Number(b.order) || 0) ||
          a.name.localeCompare(b.name),
      );
  }
  function categoryName(id) {
    return catById(id)?.name || "Archived / deleted category";
  }
  function actionName(id) {
    const a = actionById(id);
    return a
      ? (a.emoji ? a.emoji + " " : "") + a.name
      : "Archived / deleted action";
  }
  function actionEmojiName(a) {
    return a ? (a.emoji ? a.emoji + " " : "") + a.name : a?.name || "";
  }
  function getDayTasks(date) {
    return state.tasks.filter((t) => t.date === date);
  }
  function sessionsForDate(date) {
    return state.tasks.filter((t) => t.date === date && !t.dismissed);
  }
  function sessionExistsForAction(actionId, date) {
    return state.tasks.some((t) => t.actionId === actionId && t.date === date);
  }
  function sessionForAction(actionId, date) {
    return (
      state.tasks.find((t) => t.actionId === actionId && t.date === date) ||
      null
    );
  }
  function logsForDate(date) {
    return state.logs.filter((l) => l.date === date);
  }
  function logSecondsForAction(actionId, startDate = null, endDate = null) {
    return state.logs
      .filter(
        (l) =>
          l.actionId === actionId &&
          (!startDate || l.date >= startDate) &&
          (!endDate || l.date <= endDate),
      )
      .reduce((s, l) => s + (Number(l.durationSeconds) || 0), 0);
  }
  function allWeeklyTargetMinutes() {
    return activeActions().reduce(
      (s, a) => s + (Number(a.weeklyTarget) || 0),
      0,
    );
  }
  function addLog({
    actionId = null,
    taskId = null,
    startAt = null,
    endAt = null,
    durationSeconds = 0,
    date = localDate(),
    note = "",
    kind = "tracked",
    categoryId = null,
    breakForActionId = null,
  }) {
    const a = actionById(actionId);
    state.logs.push({
      id: uid("log"),
      actionId,
      taskId,
      categoryId: categoryId || a?.categoryId || null,
      startAt,
      endAt,
      durationSeconds: Math.max(0, Number(durationSeconds) || 0),
      date,
      note,
      kind,
      breakForActionId,
      createdAt: nowISO(),
    });
  }
  function closeTrackingSegment(endAt = nowISO()) {
    const t = state.tracking;

    const resetTracking = () => {
      t.activeActionId = null;
      t.segmentStart = null;
      t.accumulatedSeconds = 0;
      t.paused = false;
      t.pausedAt = null;
      t.originalStartAt = null;
    };

    if (!t.activeActionId) {
      resetTracking();
      persist();
      return;
    }

    const hadPause = (Number(t.accumulatedSeconds) || 0) > 0;
    const totalSeconds = currentTrackingSeconds();
    const actionId = t.activeActionId;

    if (totalSeconds > 0) {
      if (!hadPause && t.segmentStart) {
        // No pause → keep the interval-splitting behaviour so logs
        // still respect midnight boundaries.
        const start = new Date(t.segmentStart);
        const end = new Date(endAt);
        if (end > start) splitAndLogInterval(actionId, start, end, "tracked");
      } else {
        // Had pauses → save a single aggregated entry with total time.
        addLog({
          actionId,
          startAt: t.originalStartAt,
          endAt,
          durationSeconds: totalSeconds,
          date: localDate(),
          kind: "tracked",
        });
      }
    }

    resetTracking();
    persist();
  }
  function splitAndLogInterval(
    actionId,
    start,
    end,
    kind = "tracked",
    note = "",
    taskId = null,
    breakForActionId = null,
  ) {
    let cursor = new Date(start);
    while (cursor < end) {
      const date = localDate(cursor);
      const nextMidnight = dateFromISO(addDays(date, 1));
      nextMidnight.setHours(0, 0, 0, 0);
      const stop = end < nextMidnight ? end : nextMidnight;
      const seconds = (stop - cursor) / 1000;
      addLog({
        actionId,
        taskId,
        startAt: cursor.toISOString(),
        endAt: stop.toISOString(),
        durationSeconds: seconds,
        date,
        note,
        kind,
        breakForActionId,
      });
      cursor = new Date(stop);
    }
  }
  function startTracking(actionId, opts = {}) {
    if (!actionId) {
      notify("আগে একটি Action বেছে নাও।");
      return;
    }
    if (!actionById(actionId)) {
      notify("এই Action পাওয়া যায়নি।");
      return;
    }
    if (state.tracking.activeActionId === actionId) {
      notify("এই Action ইতিমধ্যে track হচ্ছে।");
      return;
    }
    closeTrackingSegment(nowISO());
    state.tracking.activeActionId = actionId;
    state.tracking.segmentStart = nowISO();
    state.tracking.accumulatedSeconds = 0;
    state.tracking.paused = false;
    state.tracking.pausedAt = null;
    state.tracking.originalStartAt = nowISO();
    persist();
    renderAll();
    notify(actionName(actionId) + " tracking শুরু হয়েছে।");
  }
  function stopTracking() {
    if (!state.tracking.activeActionId) {
      notify("কোনো Action track হচ্ছে না।");
      return;
    }
    closeTrackingSegment(nowISO());
    renderAll();
    notify("Time Tracking বন্ধ এবং সেভ হয়েছে।");
  }

  function pauseTracking() {
    const t = state.tracking;
    if (!t.activeActionId) return;
    if (t.paused) return;
    const now = Date.now();
    const segStart = t.segmentStart ? new Date(t.segmentStart).getTime() : now;
    const segSeconds = Math.max(0, (now - segStart) / 1000);
    t.accumulatedSeconds = (Number(t.accumulatedSeconds) || 0) + segSeconds;
    t.segmentStart = null;
    t.paused = true;
    t.pausedAt = nowISO();
    persist();
    renderAll();
    notify("⏸ Time Tracking paused।");
  }

  function resumeTracking() {
    const t = state.tracking;
    if (!t.activeActionId) return;
    if (!t.paused) return;
    t.segmentStart = nowISO();
    t.paused = false;
    t.pausedAt = null;
    persist();
    renderAll();
    notify("▶ Time Tracking resumed।");
  }

  function toggleTrackingPause() {
    const t = state.tracking;
    if (!t.activeActionId) return;
    if (t.paused) resumeTracking();
    else pauseTracking();
  }
  function createReminder({ name, emoji, schedule }) {
    const first = computeInitialDueDate(schedule, localDate()) || localDate();
    state.reminders.push({
      id: uid("rem"),
      name,
      emoji: emoji || "",
      schedule,
      nextDueDate: first,
      rescheduledFrom: null,
      history: [],
      archived: false,
      createdAt: nowISO(),
    });
    persist();
    return first;
  }

  function updateReminder(id, updates) {
    const r = reminderById(id);
    if (!r) return;
    Object.assign(r, updates);
    if (updates.schedule) {
      // schedule বদলালে nextDueDate নতুন করে হিসাব করব
      const base = r.nextDueDate || localDate();
      r.nextDueDate = computeInitialDueDate(r.schedule, base) || base;
    }
    persist();
  }

  function completeReminder(id) {
    const r = reminderById(id);
    if (!r) return;
    const completedOn = localDate();
    const scheduledFor = r.nextDueDate || completedOn;
    const base = scheduledFor > completedOn ? scheduledFor : completedOn;
    r.history = r.history || [];
    r.history.push({
      scheduledDate: scheduledFor,
      completedAt: nowISO(),
    });
    const next = computeNextAfter(r.schedule, base);
    r.rescheduledFrom = null;
    if (next) {
      r.nextDueDate = next;
      notify(`✓ ${r.name} সম্পন্ন — পরবর্তী: ${next}`);
    } else {
      r.nextDueDate = null;
      r.archived = true;
      notify(`✓ ${r.name} সম্পন্ন — এই reminder শেষ।`);
    }
    persist();
  }

  function rescheduleReminder(id, newDate) {
    const r = reminderById(id);
    if (!r) return;
    if (!r.rescheduledFrom) r.rescheduledFrom = r.nextDueDate;
    r.nextDueDate = newDate;
    persist();
    notify(`${r.name} → ${newDate} এ সরানো হয়েছে।`);
  }

  /* ---------- Reminder Reschedule Calendar ---------- */
  const reminderRescheduleState = {
    reminderId: null,
    viewYear: 0,
    viewMonth: 0,
    selectedDate: null,
  };

  const RR_MONTHS_BN = [
    "জানুয়ারি",
    "ফেব্রুয়ারি",
    "মার্চ",
    "এপ্রিল",
    "মে",
    "জুন",
    "জুলাই",
    "আগস্ট",
    "সেপ্টেম্বর",
    "অক্টোবর",
    "নভেম্বর",
    "ডিসেম্বর",
  ];

  function openReminderRescheduleModal(reminderId) {
    const r = reminderById(reminderId);
    if (!r) return;
    const base = r.nextDueDate || localDate();
    const [y, m] = base.split("-").map(Number);
    reminderRescheduleState.reminderId = reminderId;
    reminderRescheduleState.viewYear = y;
    reminderRescheduleState.viewMonth = m - 1;
    reminderRescheduleState.selectedDate = base;

    const nameEl = $("reminderRescheduleName");
    if (nameEl) nameEl.textContent = (r.emoji ? r.emoji + " " : "") + r.name;
    renderReminderCalendar();
    $("reminderRescheduleOverlay").classList.remove("hidden");
  }

  function closeReminderRescheduleModal() {
    $("reminderRescheduleOverlay")?.classList.add("hidden");
    reminderRescheduleState.reminderId = null;
  }

  function renderReminderCalendar() {
    const st = reminderRescheduleState;
    if (!st.reminderId) return;

    const monthLabel = $("rrMonthLabel");
    if (monthLabel) {
      monthLabel.textContent = `${RR_MONTHS_BN[st.viewMonth]} ${st.viewYear}`;
    }

    const startDow = new Date(st.viewYear, st.viewMonth, 1).getDay();
    const daysInMonth = new Date(st.viewYear, st.viewMonth + 1, 0).getDate();
    const prevDaysInMonth = new Date(st.viewYear, st.viewMonth, 0).getDate();
    const todayStr = localDate();

    const cells = [];
    for (let i = startDow - 1; i >= 0; i--) {
      const d = prevDaysInMonth - i;
      const dt = new Date(st.viewYear, st.viewMonth - 1, d);
      cells.push({ date: localDate(dt), day: d, other: true });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(st.viewYear, st.viewMonth, d);
      cells.push({ date: localDate(dt), day: d, other: false });
    }
    const tail = (7 - (cells.length % 7)) % 7;
    for (let d = 1; d <= tail; d++) {
      const dt = new Date(st.viewYear, st.viewMonth + 1, d);
      cells.push({ date: localDate(dt), day: d, other: true });
    }

    const grid = $("rrGrid");
    if (grid) {
      grid.innerHTML = cells
        .map((c) => {
          const cls = ["rr-cell"];
          if (c.other) cls.push("other");
          if (c.date === todayStr) cls.push("today");
          if (c.date === st.selectedDate) cls.push("selected");
          return `<button type="button" class="${cls.join(" ")}" data-rr-date="${c.date}">${c.day}</button>`;
        })
        .join("");
    }

    const sel = $("rrSelectedLabel");
    if (sel) {
      const nice = st.selectedDate
        ? new Date(st.selectedDate + "T12:00:00").toLocaleDateString("bn-BD", {
            weekday: "short",
            year: "numeric",
            month: "short",
            day: "numeric",
          })
        : "—";
      sel.textContent = `নির্বাচিত: ${nice}`;
    }
  }

  function shiftReminderCalendarMonth(delta) {
    const st = reminderRescheduleState;
    let m = st.viewMonth + delta;
    let y = st.viewYear;
    if (m < 0) {
      m = 11;
      y -= 1;
    } else if (m > 11) {
      m = 0;
      y += 1;
    }
    st.viewMonth = m;
    st.viewYear = y;
    renderReminderCalendar();
  }

  function setReminderCalendarDate(dateStr) {
    const st = reminderRescheduleState;
    st.selectedDate = dateStr;
    const [y, m] = dateStr.split("-").map(Number);
    st.viewYear = y;
    st.viewMonth = m - 1;
    renderReminderCalendar();
  }

  function bindReminderRescheduleCalendar() {
    $("rrPrevMonth")?.addEventListener("click", () =>
      shiftReminderCalendarMonth(-1),
    );
    $("rrNextMonth")?.addEventListener("click", () =>
      shiftReminderCalendarMonth(1),
    );

    $("rrGrid")?.addEventListener("click", (e) => {
      const b = e.target.closest("[data-rr-date]");
      if (!b) return;
      setReminderCalendarDate(b.dataset.rrDate);
    });

    document
      .querySelectorAll("#reminderRescheduleOverlay [data-rr-quick]")
      .forEach((b) =>
        b.addEventListener("click", () => {
          const kind = b.dataset.rrQuick;
          const today = localDate();
          let target = today;
          if (kind === "tomorrow") target = addDays(today, 1);
          else if (kind === "+7") target = addDays(today, 7);
          else if (kind === "+30") target = addDays(today, 30);
          setReminderCalendarDate(target);
        }),
      );

    $("rrCancel")?.addEventListener("click", closeReminderRescheduleModal);

    $("rrSave")?.addEventListener("click", () => {
      const st = reminderRescheduleState;
      if (!st.reminderId || !st.selectedDate) {
        closeReminderRescheduleModal();
        return;
      }
      const id = st.reminderId;
      const dt = st.selectedDate;
      closeReminderRescheduleModal();
      rescheduleReminder(id, dt);
      renderAll();
    });

    $("reminderRescheduleOverlay")?.addEventListener("click", (e) => {
      if (e.target === $("reminderRescheduleOverlay")) {
        closeReminderRescheduleModal();
      }
    });
  }

  function archiveReminder(id) {
    const r = reminderById(id);
    if (!r) return;
    r.archived = true;
    persist();
  }

  // ============================================================
  // LIFE MAP — PART 1: DATA, NODE HELPERS AND RENDERING
  // ============================================================

  const LIFE_MAP_TYPES = {
    goal: { label: "Goal", icon: "◎" },
    step: { label: "Step", icon: "↳" },
    barrier: { label: "Barrier", icon: "△" },
    loop: { label: "Loop", icon: "⟳" },
    belief: { label: "Belief", icon: "◇" },
    "skill-gap": { label: "Skill Gap", icon: "◈" },
    condition: { label: "Condition", icon: "○" },
    measure: { label: "Evidence", icon: "◫" },
    action: { label: "Action", icon: "✓" },
    research: { label: "Research", icon: "⌕" },
    decision: { label: "Decision", icon: "⑂" },
    experiment: { label: "Experiment", icon: "⬡" },
    trigger: { label: "Trigger", icon: "⚡" },
  };

  const LIFE_MAP_RELATIONS = {
    supports: "Supports",
    blocks: "Blocks",
    depends: "Depends on",
    addresses: "Addresses",
    parent: "Parent",
  };

  let lifeMapSelectedId = null;
  let lifeMapSelectedIds = new Set();
  let lifeMapAdditiveMode = false;
  let lifeMapNeedsFit = true;
  let lifeMapZoom = 1;
  let lifeMapPanX = 0;
  let lifeMapPanY = 0;
  let lifeMapDrag = null;
  let lifeMapResizeObserver = null;
  let lifeMapRenderScheduled = false;

  // Connection mode & drawing state
  let lifeMapConnectionMode = false;
  let lifeMapConnectionFilter = "all";
  let lifeMapSelectedConnectionId = null;
  let lifeMapDrawing = null; // { sourceId, type }
  let lifeMapEndpointDrag = null; // { connectionId, end, anchorId }
  let lifeMapAutoPanFrame = null;
  let lifeMapContextMenuNodeId = null;
  let lifeMapMultiSelectMode = false;
  let lifeMapRubberBand = null;
  let lifeMapRubberBandArmed = false;
  let lifeMapRubberBandEl = null;
  let lifeMapHoverCardTimer = null;
  let lifeMapHoverCardHideTimer = null;
  let lifeMapHoverCardNodeId = null;
  let lifeMapBulkEditMode = false;
  let lifeMapBulkEditIds = [];

  function normalizeLifeMap(input) {
    const data = input && typeof input === "object" ? input : {};

    const validTypes = new Set(Object.keys(LIFE_MAP_TYPES));
    const validStatuses = new Set([
      "not-started",
      "in-progress",
      "done",
      "active",
      "resolved",
      "observed",
      "tested",
      "achieved",
    ]);

    const nodes = Array.isArray(data.nodes)
      ? data.nodes
          .filter((n) => n && typeof n === "object" && n.id)
          .map((n, index) => ({
            id: String(n.id),
            name: String(n.name || "Untitled node"),
            type: validTypes.has(n.type) ? n.type : "step",
            status: validStatuses.has(n.status) ? n.status : "not-started",
            parentId: n.parentId ? String(n.parentId) : null,
            description: String(n.description || ""),
            x: Number.isFinite(Number(n.x))
              ? Math.max(10, Number(n.x))
              : 60 + (index % 3) * 235,
            y: Number.isFinite(Number(n.y))
              ? Math.max(10, Number(n.y))
              : 60 + Math.floor(index / 3) * 145,
            createdAt: n.createdAt || nowISO(),
            updatedAt: n.updatedAt || n.createdAt || nowISO(),
          }))
      : [];

    const nodeIds = new Set(nodes.map((n) => n.id));

    nodes.forEach((node) => {
      if (node.parentId === node.id || !nodeIds.has(node.parentId)) {
        node.parentId = null;
      }
    });

    const connections = Array.isArray(data.connections)
      ? data.connections
          .filter(
            (c) =>
              c &&
              c.id &&
              nodeIds.has(String(c.sourceId)) &&
              nodeIds.has(String(c.targetId)) &&
              c.sourceId !== c.targetId &&
              !!LIFE_MAP_RELATIONS[c.relation],
          )
          .map((c) => ({
            id: String(c.id),
            sourceId: String(c.sourceId),
            targetId: String(c.targetId),
            relation: LIFE_MAP_RELATIONS[c.relation] ? c.relation : "related",
            createdAt: c.createdAt || nowISO(),
          }))
      : [];

    return {
      nodes,
      connections,
      customTypes: Array.isArray(data.customTypes) ? data.customTypes : [],
      settings: {
        autoComplete: "manual",
        ...(data.settings || {}),
      },
    };
  }

  function lifeMapData() {
    if (!state.lifeMap) {
      state.lifeMap = normalizeLifeMap(null);
    }
    // Auto-migrate legacy parentId → "parent" connections once.
    // Runs on the first lifeMapData() call after page load.
    if (!state.lifeMap._migrated) {
      const map = state.lifeMap;
      const nodeIds = new Set(map.nodes.map((n) => n.id));
      const existing = new Set(
        map.connections
          .filter((c) => c.relation === "parent")
          .map((c) => c.sourceId + "→" + c.targetId),
      );
      let added = 0;
      map.nodes.forEach((node) => {
        if (!node.parentId) return;
        if (!nodeIds.has(node.parentId)) return;
        const key = node.parentId + "→" + node.id;
        if (existing.has(key)) return;
        map.connections.push({
          id: uid("lmconn"),
          sourceId: node.parentId,
          targetId: node.id,
          relation: "parent",
          createdAt: nowISO(),
        });
        existing.add(key);
        added++;
      });
      map._migrated = true;
      if (added > 0) {
        persist();
        console.log("[Life Map] Migrated " + added + " parent connections");
      }
    }
    return state.lifeMap;
  }

  function lifeMapNodeById(id) {
    return lifeMapData().nodes.find((node) => node.id === id) || null;
  }

  function lifeMapTypeLabel(type) {
    return LIFE_MAP_TYPES[type]?.label || "Custom Node";
  }

  function lifeMapStatusLabel(status) {
    const labels = {
      "not-started": "Not started",
      "in-progress": "In progress",
      done: "Done",
      active: "Active",
      resolved: "Resolved",
      observed: "Observed",
      tested: "Tested",
      achieved: "Achieved",
    };
    return labels[status] || status || "Not started";
  }

  function lifeMapRelationLabel(relation) {
    return LIFE_MAP_RELATIONS[relation] || "Related to";
  }

  function lifeMapCreateNode(data = {}) {
    const map = lifeMapData();

    const index = map.nodes.length;
    const node = {
      id: uid("lmnode"),
      name: String(data.name || "New node"),
      type: LIFE_MAP_TYPES[data.type] ? data.type : "goal",
      status: data.status || "not-started",
      parentId: data.parentId || null,
      description: String(data.description || ""),
      x: Number.isFinite(Number(data.x))
        ? Number(data.x)
        : 60 + (index % 3) * 235,
      y: Number.isFinite(Number(data.y))
        ? Number(data.y)
        : 60 + Math.floor(index / 3) * 145,
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };

    map.nodes.push(node);
    persist();

    return node;
  }

  function lifeMapDuplicateNodes(sourceIds, offset = 0) {
    if (!sourceIds || !sourceIds.length) return [];
    const map = lifeMapData();
    const idMap = new Map();
    const newIds = [];

    sourceIds.forEach((oldId) => {
      const oldNode = lifeMapNodeById(oldId);
      if (!oldNode) return;
      const newId = uid("lmnode");
      idMap.set(oldId, newId);
      newIds.push(newId);
      map.nodes.push({
        id: newId,
        name: oldNode.name,
        type: oldNode.type,
        status: oldNode.status,
        parentId: null,
        description: oldNode.description,
        x: (Number(oldNode.x) || 0) + offset,
        y: (Number(oldNode.y) || 0) + offset,
        createdAt: nowISO(),
        updatedAt: nowISO(),
      });
    });

    // Duplicate connections whose BOTH endpoints are inside the
    // duplicated set. External connections are intentionally not
    // copied — duplicate nodes start fresh, disconnected from the
    // surrounding graph.
    map.connections.forEach((conn) => {
      if (idMap.has(conn.sourceId) && idMap.has(conn.targetId)) {
        map.connections.push({
          id: uid("lmconn"),
          sourceId: idMap.get(conn.sourceId),
          targetId: idMap.get(conn.targetId),
          relation: conn.relation,
          createdAt: nowISO(),
        });
      }
    });

    persist();
    return newIds;
  }

  function lifeMapSaveNode(id, updates) {
    const node = lifeMapNodeById(id);
    if (!node) return false;

    const map = lifeMapData();

    if (updates.parentId) {
      if (updates.parentId === id) {
        notify("একটি Node নিজের Parent হতে পারবে না।");
        return false;
      }

      if (!lifeMapNodeById(updates.parentId)) {
        updates.parentId = null;
      }

      // Prevent hierarchy cycles.
      let ancestorId = updates.parentId;
      const visited = new Set([id]);

      while (ancestorId) {
        if (visited.has(ancestorId)) {
          notify("এই Parent দিলে Hierarchy-তে Cycle তৈরি হবে।");
          return false;
        }

        visited.add(ancestorId);
        ancestorId = lifeMapNodeById(ancestorId)?.parentId || null;
      }
    }

    Object.assign(node, updates, { updatedAt: nowISO() });

    // If parentId changed, sync the corresponding "parent" connection.
    if ("parentId" in updates) {
      map.connections = map.connections.filter(
        (c) => !(c.relation === "parent" && c.targetId === id),
      );
      if (updates.parentId) {
        map.connections.push({
          id: uid("lmconn"),
          sourceId: updates.parentId,
          targetId: id,
          relation: "parent",
          createdAt: nowISO(),
        });
      }
    }

    persist();
    return true;
  }

  function lifeMapDeleteNodeById(id) {
    const map = lifeMapData();
    const node = lifeMapNodeById(id);
    if (!node) return false;

    // Children become root nodes instead of being deleted.
    map.nodes.forEach((child) => {
      if (child.parentId === id) child.parentId = null;
    });

    map.nodes = map.nodes.filter((item) => item.id !== id);

    map.connections = map.connections.filter(
      (connection) => connection.sourceId !== id && connection.targetId !== id,
    );

    if (lifeMapSelectedId === id) lifeMapSelectedId = null;

    persist();
    return true;
  }

  function lifeMapOpenBulkEditModal(nodes) {
    if (!nodes || !nodes.length) return;
    lifeMapBulkEditMode = true;
    lifeMapBulkEditIds = nodes.map((n) => n.id);
    lifeMapHideHoverCard();

    const first = nodes[0];
    $("lifeMapNodeId").value = first.id;
    $("lifeMapNodeType").value = first.type;
    $("lifeMapNodeStatus").value = first.status;
    $("lifeMapNodeDescription").value = first.description || "";

    $("lifeMapNodeName").closest(".field").classList.add("hidden");
    $("lifeMapRelationships").classList.add("hidden");
    $("lifeMapDeleteNode").classList.add("hidden");
    $("lifeMapSaveNode").textContent = `Apply to ${nodes.length} nodes`;

    $("lifeMapModalTitle").textContent = `Bulk Edit — ${nodes.length} nodes`;
    $("lifeMapNodeModal").classList.remove("hidden");
  }

  function lifeMapConnectNodes(sourceId, targetId, relation) {
    if (!sourceId || !targetId || sourceId === targetId) {
      notify("দুটি আলাদা Node নির্বাচন করো।");
      return false;
    }
    if (!lifeMapNodeById(sourceId) || !lifeMapNodeById(targetId)) {
      notify("নির্বাচিত Node পাওয়া যায়নি।");
      return false;
    }
    if (!LIFE_MAP_RELATIONS[relation]) {
      notify("Connection type সঠিক নয়।");
      return false;
    }
    const map = lifeMapData();
    const exists = map.connections.some(
      (c) =>
        c.sourceId === sourceId &&
        c.targetId === targetId &&
        c.relation === relation,
    );
    if (exists) {
      notify("এই Connection আগে থেকেই আছে।");
      return false;
    }
    map.connections.push({
      id: uid("lmconn"),
      sourceId,
      targetId,
      relation,
      createdAt: nowISO(),
    });

    // Keep legacy parentId in sync for backward-compat helpers
    // (computeChildPosition, collectDescendants etc.)
    if (relation === "parent") {
      const child = lifeMapNodeById(targetId);
      if (child && !child.parentId) {
        child.parentId = sourceId;
      }
    }

    persist();
    return true;
  }

  function lifeMapDisconnect(connectionId) {
    const map = lifeMapData();
    const conn = map.connections.find((c) => c.id === connectionId);
    if (!conn) return;

    map.connections = map.connections.filter((c) => c.id !== connectionId);

    // If a parent connection was removed, keep the child's parentId in sync.
    if (conn.relation === "parent") {
      const child = lifeMapNodeById(conn.targetId);
      if (child) {
        const remaining = map.connections.filter(
          (c) => c.relation === "parent" && c.targetId === child.id,
        );
        child.parentId = remaining.length > 0 ? remaining[0].sourceId : null;
      }
    }

    persist();
  }

  function lifeMapRenderConnections(nodeId) {
    const host = $("lifeMapConnectionList");
    const wrap = $("lifeMapRelationships");
    if (!host || !wrap) return;

    if (!nodeId) {
      host.innerHTML =
        '<p class="muted tiny">এই Node-এর সঙ্গে এখনো কোনো সাধারণ Connection নেই।</p>';
      return;
    }

    const related = lifeMapData().connections.filter(
      (c) => c.sourceId === nodeId || c.targetId === nodeId,
    );

    host.innerHTML = related.length
      ? related
          .map((connection) => {
            const outgoing = connection.sourceId === nodeId;
            const otherId = outgoing
              ? connection.targetId
              : connection.sourceId;
            const other = lifeMapNodeById(otherId);
            if (!other) return "";
            const direction = outgoing ? "→" : "←";
            return `
              <div class="lifemap-connection-item">
                <div>
                  <strong>${direction} ${escapeHTML(other.name)}</strong>
                  <small>${escapeHTML(lifeMapRelationLabel(connection.relation))}</small>
                </div>
                <button type="button" data-lm-disconnect="${escapeHTML(connection.id)}">Remove</button>
              </div>
            `;
          })
          .join("")
      : '<p class="muted tiny">এই Node-এর সঙ্গে এখনো কোনো সাধারণ Connection নেই।</p>';
  }

  // lifeMapRenderInspector() — removed. Inspector panel disabled site-wide.

  /* ============================================================
     HOVER CARD
     ============================================================ */
  function lifeMapHideHoverCard() {
    clearTimeout(lifeMapHoverCardTimer);
    lifeMapHoverCardTimer = null;
    clearTimeout(lifeMapHoverCardHideTimer);
    lifeMapHoverCardHideTimer = null;
    lifeMapHoverCardNodeId = null;
    $("lifeMapHoverCard")?.classList.add("hidden");
  }

  function lifeMapShowHoverCard(nodeId) {
    // Don't show during any interactive mode
    if (
      lifeMapDrag ||
      lifeMapDrawing ||
      lifeMapRubberBandArmed ||
      lifeMapRubberBand ||
      lifeMapEndpointDrag
    )
      return;

    const node = lifeMapNodeById(nodeId);
    if (!node) return;

    const canvas = $("lifeMapCanvas");
    const nodeEl = canvas?.querySelector(
      `[data-lm-node="${CSS.escape(nodeId)}"]`,
    );
    if (!nodeEl) return;

    const card = $("lifeMapHoverCard");
    if (!card) return;

    const type = LIFE_MAP_TYPES[node.type] || {
      label: "Node",
      icon: "◇",
    };
    const shortDesc = node.description
      ? node.description.length > 220
        ? node.description.slice(0, 217) + "…"
        : node.description
      : "";

    card.innerHTML = `
      <div class="lifemap-hc-head">
        <span class="lifemap-hc-type">
          ${escapeHTML(type.icon)} ${escapeHTML(type.label)}
        </span>
      </div>
      <strong class="lifemap-hc-name">${escapeHTML(node.name)}</strong>
      ${shortDesc ? `<p class="lifemap-hc-desc">${escapeHTML(shortDesc)}</p>` : ""}
      <span class="lifemap-hc-status" data-status="${escapeHTML(node.status)}">
        ${escapeHTML(lifeMapStatusLabel(node.status))}
      </span>
    `;

    // Show off-screen first to measure
    card.style.left = "-9999px";
    card.style.top = "-9999px";
    card.classList.remove("hidden");

    const nodeRect = nodeEl.getBoundingClientRect();
    const cw = card.offsetWidth;
    const ch = card.offsetHeight;

    let left = nodeRect.right + 12;
    let top = nodeRect.top;
    if (left + cw > window.innerWidth - 8) left = nodeRect.left - cw - 12;
    if (left < 8) left = 8;
    if (top + ch > window.innerHeight - 8) top = window.innerHeight - ch - 8;
    if (top < 8) top = 8;

    card.style.left = left + "px";
    card.style.top = top + "px";
  }

  function lifeMapRenderNodeSelection() {
    document.querySelectorAll("#lifeMapNodes [data-lm-node]").forEach((el) => {
      const id = el.dataset.lmNode;
      const isSel = lifeMapSelectedIds.has(id);
      el.classList.toggle("selected", isSel && id === lifeMapSelectedId);
      // Dashed outline shows whenever the user is in an "additive"
      // selection session — even if only one node is selected — so
      // Ctrl/Shift+first-click gives immediate visual feedback.
      const showMulti =
        isSel && (lifeMapSelectedIds.size > 1 || lifeMapAdditiveMode);
      el.classList.toggle("multi-selected", showMulti);
    });
  }

  function lifeMapIntersectRect(rect, toward) {
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    const dx = toward.x - cx;
    const dy = toward.y - cy;
    if (dx === 0 && dy === 0) return { x: cx, y: cy };
    const hw = rect.w / 2;
    const hh = rect.h / 2;
    const tx = dx !== 0 ? hw / Math.abs(dx) : Infinity;
    const ty = dy !== 0 ? hh / Math.abs(dy) : Infinity;
    const t = Math.min(tx, ty);
    return { x: cx + dx * t, y: cy + dy * t };
  }

  function lifeMapIntersectRect(rect, toward) {
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    const dx = toward.x - cx;
    const dy = toward.y - cy;
    if (dx === 0 && dy === 0) return { x: cx, y: cy };
    const hw = rect.w / 2;
    const hh = rect.h / 2;
    const tx = dx !== 0 ? hw / Math.abs(dx) : Infinity;
    const ty = dy !== 0 ? hh / Math.abs(dy) : Infinity;
    const t = Math.min(tx, ty);
    return { x: cx + dx * t, y: cy + dy * t };
  }

  function lifeMapNodeRects() {
    const canvas = $("lifeMapCanvas");
    const rects = new Map();
    if (!canvas) return rects;
    lifeMapData().nodes.forEach((node) => {
      const el = canvas.querySelector(
        `[data-lm-node="${CSS.escape(node.id)}"]`,
      );
      const w = (el && el.offsetWidth) || 200;
      const h = (el && el.offsetHeight) || 100;
      rects.set(node.id, { x: node.x, y: node.y, w, h });
    });
    return rects;
  }

  function lifeMapRenderEdges() {
    const canvas = $("lifeMapCanvas");
    const svg = $("lifeMapEdges");
    if (!canvas || !svg) return;

    const width = canvas.clientWidth || 800;
    const height = canvas.clientHeight || 600;
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("width", width);
    svg.setAttribute("height", height);

    const nodes = lifeMapData().nodes;
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    const rects = lifeMapNodeRects();

    const edges = [];

    // Hierarchy (parent-child) — sourced from "parent" connections,
    // always rendered even when connect mode is OFF.
    lifeMapData().connections.forEach((conn) => {
      if (conn.relation !== "parent") return;
      const source = nodeMap.get(conn.sourceId);
      const target = nodeMap.get(conn.targetId);
      if (!source || !target) return;
      edges.push({
        source,
        target,
        relation: "hierarchy",
        id: conn.id,
      });
    });

    // User connections — only when mode ON, filtered by type
    if (lifeMapConnectionMode) {
      const filter = lifeMapConnectionFilter;
      lifeMapData().connections.forEach((conn) => {
        if (conn.relation === "parent") return;
        if (filter !== "all" && conn.relation !== filter) return;
        const source = nodeMap.get(conn.sourceId);
        const target = nodeMap.get(conn.targetId);
        if (!source || !target) return;
        edges.push({ source, target, relation: conn.relation, id: conn.id });
      });
    }

    const markers = ["hierarchy", "supports", "blocks", "depends", "addresses"]
      .map(
        (r) => `
        <marker id="lm-arrow-${r}" viewBox="0 0 10 10" refX="9" refY="5"
          markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path class="lifemap-marker lifemap-marker-${r}" d="M0,1 L9,5 L0,9 z"/>
        </marker>`,
      )
      .join("");

    svg.innerHTML =
      `<defs>${markers}</defs>` +
      edges
        .map((e) => {
          const rs = rects.get(e.source.id);
          const rt = rects.get(e.target.id);
          if (!rs || !rt) return "";
          const sc = { x: rs.x + rs.w / 2, y: rs.y + rs.h / 2 };
          const tc = { x: rt.x + rt.w / 2, y: rt.y + rt.h / 2 };
          const start = lifeMapIntersectRect(rs, tc);
          const end = lifeMapIntersectRect(rt, sc);
          const midX = (start.x + end.x) / 2;
          const path =
            Math.abs(end.x - start.x) > 40
              ? `M ${start.x} ${start.y} C ${midX} ${start.y}, ${midX} ${end.y}, ${end.x} ${end.y}`
              : `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
          const selected = e.id && e.id === lifeMapSelectedConnectionId;
          const dimmed =
            lifeMapConnectionMode && e.relation === "hierarchy"
              ? " dimmed"
              : "";
          const cls = `lifemap-edge${dimmed}${selected ? " selected" : ""}`;
          const dataAttr = e.id ? ` data-conn-id="${escapeHTML(e.id)}"` : "";

          // Hierarchy edges get an invisible wider hit-zone for click
          // selection. Non-hierarchy edges keep dot-based selection.
          const hitZone =
            e.relation === "hierarchy" && e.id
              ? `<path class="lifemap-edge-hit" data-conn-id="${escapeHTML(e.id)}" d="${path}"></path>`
              : "";

          return `<path class="${cls}" data-relation="${escapeHTML(e.relation)}"${dataAttr} marker-end="url(#lm-arrow-${e.relation})" d="${path}"></path>${hitZone}`;
        })
        .join("");

    lifeMapRenderConnectionDots(rects);
  }

  function lifeMapRenderConnectionDots(rects) {
    const host = $("lifeMapConnectionDots");
    if (!host) return;
    host.innerHTML = "";

    const filter = lifeMapConnectionFilter;
    lifeMapData().connections.forEach((conn) => {
      const isParent = conn.relation === "parent";

      if (isParent) {
        // Hierarchy edges stay dot-less by default — dots only appear
        // when this specific connection is selected.
        if (conn.id !== lifeMapSelectedConnectionId) return;
      } else {
        // Non-hierarchy connections keep the classic behaviour:
        // dots appear whenever connect mode is ON and filter matches.
        if (!lifeMapConnectionMode) return;
        if (filter !== "all" && conn.relation !== filter) return;
      }

      const rs = rects.get(conn.sourceId);
      const rt = rects.get(conn.targetId);
      if (!rs || !rt) return;
      const sc = { x: rs.x + rs.w / 2, y: rs.y + rs.h / 2 };
      const tc = { x: rt.x + rt.w / 2, y: rt.y + rt.h / 2 };
      const start = lifeMapIntersectRect(rs, tc);
      const end = lifeMapIntersectRect(rt, sc);
      const selected = conn.id === lifeMapSelectedConnectionId;
      const mk = (endName, pt) =>
        `<div class="lifemap-conn-dot${selected ? " selected" : ""}"
           data-conn-id="${escapeHTML(conn.id)}"
           data-end="${endName}"
           data-node-id="${escapeHTML(endName === "source" ? conn.sourceId : conn.targetId)}"
           style="left:${pt.x}px;top:${pt.y}px"
           title="Click to select · Drag to reconnect · Delete key to remove"></div>`;
      host.insertAdjacentHTML("beforeend", mk("source", start));
      host.insertAdjacentHTML("beforeend", mk("target", end));
    });
  }

  function lifeMapApplyViewport() {
    const transform = `translate(${lifeMapPanX}px, ${lifeMapPanY}px) scale(${lifeMapZoom})`;
    const edges = $("lifeMapEdges");
    const nodes = $("lifeMapNodes");
    const dots = $("lifeMapConnectionDots");
    const temp = $("lifeMapTempEdges");

    [edges, nodes, dots, temp].forEach((el) => {
      if (!el) return;
      el.style.transformOrigin = "0 0";
      el.style.transform = transform;
    });

    const label = $("lifeMapZoomLevel");
    if (label) label.textContent = `${Math.round(lifeMapZoom * 100)}%`;
  }

  function renderLifeMap() {
    const map = lifeMapData();
    const nodesHost = $("lifeMapNodes");
    const empty = $("lifeMapEmpty");
    const count = $("lifeMapNodeCount");

    if (!nodesHost) return;

    if (count) {
      count.textContent = `${map.nodes.length} Node${map.nodes.length === 1 ? "" : "s"}`;
    }
    if (empty) empty.classList.toggle("hidden", map.nodes.length > 0);

    nodesHost.innerHTML = map.nodes
      .map((node) => {
        const type = LIFE_MAP_TYPES[node.type] || {
          label: "Custom Node",
          icon: "◇",
        };
        const isSel = lifeMapSelectedIds.has(node.id);
        const isPrimary = isSel && node.id === lifeMapSelectedId;
        const isMulti = isSel && lifeMapSelectedIds.size > 1;
        const isDrawingSource =
          lifeMapDrawing && lifeMapDrawing.sourceId === node.id;

        const shortDescription = node.description
          ? node.description.length > 90
            ? node.description.slice(0, 87) + "…"
            : node.description
          : "";

        return `
          <div
            class="lifemap-node ${isPrimary ? "selected" : ""} ${isMulti ? "multi-selected" : ""} ${isDrawingSource ? "drawing-source" : ""}"
            data-lm-node="${escapeHTML(node.id)}"
            data-type="${escapeHTML(node.type)}"
            data-status="${escapeHTML(node.status)}"
            style="left:${node.x}px;top:${node.y}px"
            role="button"
            tabindex="0"
            aria-label="${escapeHTML(node.name)}"
          >
            <div class="lifemap-node-head">
              <span class="lifemap-node-type">
                <span class="lifemap-node-type-icon">${escapeHTML(type.icon)}</span>
                <span class="lifemap-node-type-label">${escapeHTML(type.label)}</span>
              </span>
            </div>
            <strong class="lifemap-node-name">${escapeHTML(node.name)}</strong>
            ${
              shortDescription
                ? `<span class="lifemap-node-description">${escapeHTML(shortDescription)}</span>`
                : ""
            }
            <div class="lifemap-node-foot">
              <span class="lifemap-node-status" data-status="${escapeHTML(node.status)}">${escapeHTML(lifeMapStatusLabel(node.status))}</span>
            </div>
            <button type="button" class="lifemap-node-btn lifemap-node-edit"
              data-lm-edit="${escapeHTML(node.id)}"
              title="Edit node" aria-label="Edit node">✎</button>
            <button type="button" class="lifemap-node-btn lifemap-node-add"
              data-lm-addchild="${escapeHTML(node.id)}"
              title="Add child node" aria-label="Add child node">+</button>
            <button type="button" class="lifemap-node-btn lifemap-node-connect"
              data-lm-connect="${escapeHTML(node.id)}"
              title="Create connection" aria-label="Create connection">⇄</button>
          </div>
        `;
      })
      .join("");

    lifeMapRenderEdges();
    lifeMapApplyViewport();

    const connectButton = $("lifeMapConnectMode");
    if (connectButton) {
      connectButton.setAttribute("aria-pressed", String(lifeMapConnectionMode));
    }

    // Re-apply active filter after DOM rebuild so pan/click/selection
    // changes never silently wipe the user's filter state.
    lifeMapApplyFilter();
  }

  /* ---------- Modal helpers ---------- */
  function lifeMapOpenNodeModal(id, isNew = false) {
    const node = lifeMapNodeById(id);
    if (!node) return;
    lifeMapHideHoverCard();

    $("lifeMapNodeId").value = node.id;
    $("lifeMapNodeName").value = node.name;
    $("lifeMapNodeType").value = node.type;
    $("lifeMapNodeStatus").value = node.status;
    $("lifeMapNodeDescription").value = node.description || "";

    const parent = node.parentId ? lifeMapNodeById(node.parentId) : null;
    $("lifeMapParentSearch").value = parent ? parent.name : "";

    lifeMapRenderParentOptions(node);
    lifeMapRenderConnections(node.id);

    $("lifeMapModalTitle").textContent = isNew ? "New Node" : "Edit Node";
    $("lifeMapNodeModal").classList.remove("hidden");
    setTimeout(() => $("lifeMapNodeName").focus(), 60);
  }

  function lifeMapCloseNodeModal() {
    $("lifeMapNodeModal").classList.add("hidden");
    if (lifeMapBulkEditMode) {
      lifeMapBulkEditMode = false;
      lifeMapBulkEditIds = [];
      $("lifeMapNodeName").closest(".field").classList.remove("hidden");
      $("lifeMapRelationships").classList.remove("hidden");
      $("lifeMapDeleteNode").classList.remove("hidden");
      $("lifeMapSaveNode").textContent = "Save Node";
    }
  }

  function lifeMapComputeChildPosition(parent) {
    const data = lifeMapData();
    const children = data.nodes.filter((n) => n.parentId === parent.id);
    if (!children.length) {
      return { x: parent.x + 260, y: parent.y };
    }
    const lowest = children.reduce((a, b) => (a.y >= b.y ? a : b));
    return { x: lowest.x, y: lowest.y + 150 };
  }

  function lifeMapAddChild(parentId) {
    const parent = lifeMapNodeById(parentId);
    if (!parent) return;

    const pos = lifeMapComputeChildPosition(parent);
    const node = lifeMapCreateNode({
      name: "New node",
      type: "step",
      parentId: parent.id,
      x: pos.x,
      y: pos.y,
    });

    // Create the hierarchy connection too
    lifeMapData().connections.push({
      id: uid("lmconn"),
      sourceId: parent.id,
      targetId: node.id,
      relation: "parent",
      createdAt: nowISO(),
    });

    lifeMapSelectedIds.clear();
    lifeMapSelectedIds.add(node.id);
    lifeMapSelectedId = node.id;
    lifeMapAdditiveMode = false;
    renderLifeMap();
    notify("Child node তৈরি হয়েছে।");
  }

  /* ---------- Type picker ---------- */
  function lifeMapOpenTypePicker(nodeId, buttonEl) {
    const picker = $("lifeMapTypePicker");
    if (!picker || !buttonEl) return;

    // Filter visible options by connect mode:
    //   Connect OFF  → Parent / Child (hierarchy)
    //   Connect ON   → Supports / Blocks / Depends / Addresses
    picker.querySelectorAll("[data-conn-type]").forEach((btn) => {
      const isHierarchy = ["parent", "child"].includes(btn.dataset.connType);
      const show = lifeMapConnectionMode ? !isHierarchy : isHierarchy;
      btn.classList.toggle("hidden", !show);
    });

    const title = picker.querySelector(".lifemap-type-picker-title");
    if (title) {
      title.textContent = lifeMapConnectionMode
        ? "Connection type"
        : "Hierarchy link";
    }

    const rect = buttonEl.getBoundingClientRect();
    picker.style.left = `${Math.min(window.innerWidth - 240, rect.right + 8)}px`;
    picker.style.top = `${Math.min(window.innerHeight - 260, rect.top - 8)}px`;
    picker.dataset.sourceId = nodeId;
    picker.classList.remove("hidden");
  }

  function lifeMapCloseTypePicker() {
    $("lifeMapTypePicker")?.classList.add("hidden");
  }

  /* ---------- Context menu ---------- */
  function lifeMapOpenContextMenu(nodeId, clientX, clientY) {
    const menu = $("lifeMapContextMenu");
    const node = lifeMapNodeById(nodeId);
    if (!menu || !node) return;

    const selNodes = [...lifeMapSelectedIds]
      .map((id) => lifeMapNodeById(id))
      .filter(Boolean);
    const isMulti = selNodes.length > 1;

    const statuses = [
      { value: "not-started", label: "Not started" },
      { value: "in-progress", label: "In progress" },
      { value: "done", label: "Done" },
      { value: "active", label: "Active" },
      { value: "resolved", label: "Resolved" },
      { value: "observed", label: "Observed" },
      { value: "tested", label: "Tested" },
      { value: "achieved", label: "Achieved" },
    ];

    const allSame = (val) =>
      selNodes.length > 0 && selNodes.every((n) => n.status === val);

    const suffix = isMulti ? ` (${selNodes.length})` : "";

    menu.innerHTML = `
      <button type="button" data-ctx-action="edit">✎ Edit${suffix}</button>
      <button type="button" data-ctx-action="duplicate">⧉ Duplicate${suffix}</button>
      <div class="lifemap-ctx-sub">
        <button type="button" class="lifemap-ctx-sub-toggle">◐ Status${suffix} <span class="lifemap-ctx-arrow">›</span></button>
        <div class="lifemap-ctx-submenu">
          ${statuses
            .map(
              (s) =>
                `<button type="button" data-ctx-action="status" data-status="${s.value}">${allSame(s.value) ? "✓ " : "　"}${s.label}</button>`,
            )
            .join("")}
        </div>
      </div>
      <button type="button" data-ctx-action="delete" class="danger">🗑 Delete${suffix}</button>
    `;
    menu.classList.remove("hidden");

    // Measure & reposition so the menu never spills off-screen.
    menu.style.left = "0px";
    menu.style.top = "0px";
    const margin = 8;
    const mRect = menu.getBoundingClientRect();
    let left = clientX;
    let top = clientY;
    if (left + mRect.width > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - mRect.width - margin);
    }
    if (top + mRect.height > window.innerHeight - margin) {
      // Not enough room below → open upward from the cursor.
      top = Math.max(margin, clientY - mRect.height);
    }
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;

    // Submenu: measure its real height, then flip upward if the
    // status toggle sits too low on the screen.
    const subWrap = menu.querySelector(".lifemap-ctx-sub");
    const submenu = menu.querySelector(".lifemap-ctx-submenu");
    const subToggle = menu.querySelector(".lifemap-ctx-sub-toggle");
    if (subWrap && submenu && subToggle) {
      subWrap.classList.remove("flip-up");
      const prevDisplay = submenu.style.display;
      const prevVis = submenu.style.visibility;
      submenu.style.display = "grid";
      submenu.style.visibility = "hidden";
      const subH = submenu.offsetHeight || 0;
      submenu.style.display = prevDisplay;
      submenu.style.visibility = prevVis;

      const toggleRect = subToggle.getBoundingClientRect();
      if (toggleRect.top + subH > window.innerHeight - margin) {
        subWrap.classList.add("flip-up");
      }
    }

    lifeMapContextMenuNodeId = nodeId;

    // JS-managed submenu hover: CSS :hover alone can miss a frame
    // while the mouse is between the toggle and the submenu, causing
    // the submenu to vanish mid-travel. Binding mouseenter/leave on
    // the wrapper keeps it open reliably.
    menu.querySelectorAll(".lifemap-ctx-sub").forEach((sub) => {
      const submenu = sub.querySelector(".lifemap-ctx-submenu");
      if (!submenu) return;
      let hideTimer = null;

      const openIt = () => {
        clearTimeout(hideTimer);
        hideTimer = null;
        submenu.classList.add("ctx-open");
      };

      const closeItLater = () => {
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => {
          submenu.classList.remove("ctx-open");
        }, 220);
      };

      sub.addEventListener("mouseenter", openIt);
      sub.addEventListener("mouseleave", closeItLater);
    });
  }

  function lifeMapCloseContextMenu() {
    $("lifeMapContextMenu")?.classList.add("hidden");
    lifeMapContextMenuNodeId = null;
  }

  /* ---------- Temp path (drawing line) ---------- */
  function lifeMapRenderTempPath(startPt, endPt, type) {
    const svg = $("lifeMapTempEdges");
    const canvas = $("lifeMapCanvas");
    if (!svg || !canvas) return;
    const width = canvas.clientWidth || 800;
    const height = canvas.clientHeight || 600;
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("width", width);
    svg.setAttribute("height", height);
    if (!startPt || !endPt) {
      svg.innerHTML = "";
      return;
    }
    // Normalize "child" → "parent" for the preview line so it inherits
    // the hierarchy look. The swap of source/target happens on commit.
    const visualType = type === "child" ? "parent" : type || "related";
    const midX = (startPt.x + endPt.x) / 2;
    const d = `M ${startPt.x} ${startPt.y} C ${midX} ${startPt.y}, ${midX} ${endPt.y}, ${endPt.x} ${endPt.y}`;
    svg.innerHTML = `<path class="lifemap-edge" data-relation="${escapeHTML(visualType)}" d="${d}" style="opacity:.85" />`;
  }

  /* ---------- Modal helpers ---------- */
  function lifeMapOpenNodeModal(id, isNew = false) {
    const node = lifeMapNodeById(id);
    if (!node) return;
    lifeMapHideHoverCard();

    $("lifeMapNodeId").value = node.id;
    $("lifeMapNodeName").value = node.name;
    $("lifeMapNodeType").value = node.type;
    $("lifeMapNodeStatus").value = node.status;
    $("lifeMapNodeDescription").value = node.description || "";

    lifeMapRenderConnections(node.id);

    $("lifeMapModalTitle").textContent = isNew ? "New Node" : "Edit Node";
    $("lifeMapNodeModal").classList.remove("hidden");

    setTimeout(() => $("lifeMapNodeName").focus(), 60);
  }

  function lifeMapCloseNodeModal() {
    $("lifeMapNodeModal").classList.add("hidden");
    if (lifeMapBulkEditMode) {
      lifeMapBulkEditMode = false;
      lifeMapBulkEditIds = [];
      $("lifeMapNodeName").closest(".field").classList.remove("hidden");
      $("lifeMapRelationships").classList.remove("hidden");
      $("lifeMapDeleteNode").classList.remove("hidden");
      $("lifeMapSaveNode").textContent = "Save Node";
    }
  }

  function lifeMapComputeChildPosition(parent) {
    const data = lifeMapData();
    const children = data.nodes.filter((n) => n.parentId === parent.id);
    if (!children.length) {
      return { x: parent.x + 260, y: parent.y };
    }
    const lowest = children.reduce((a, b) => (a.y >= b.y ? a : b));
    return { x: lowest.x, y: lowest.y + 150 };
  }

  function switchPage(page) {
    document
      .querySelectorAll(".nav button")
      .forEach((b) => b.classList.toggle("active", b.dataset.page === page));
    document
      .querySelectorAll(".page")
      .forEach((p) => p.classList.toggle("active", p.id === "page-" + page));

    if (page === "focus") renderFocus();
    if (page === "tracking") renderLogs();

    if (page === "lifemap") {
      const shouldFit = lifeMapNeedsFit;
      lifeMapNeedsFit = false;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (shouldFit) lifeMapFitView();
          else {
            lifeMapRenderEdges();
            lifeMapApplyViewport();
          }
        });
      });
    }
  }
  function getSelectedDate() {
    return $("dashboardDate").value || localDate();
  }
  function renderSelects() {
    const cats = activeCats(),
      acts = activeActions(),
      presets = state.presets;
    fillSelect($("actionCategory"), cats, "Category বেছে নাও");
    if ($("taskFilterCategory")) {
      const prev = $("taskFilterCategory").value;
      fillSelect($("taskFilterCategory"), cats, "সব Category", prev);
    }
    fillSelect($("startTrackingAction"), acts, "Action বেছে নাও");
    fillSelect($("trackingAction"), acts, "Action বেছে নাও");
    fillSelect($("manualAction"), acts, "Action বেছে নাও (ঐচ্ছিক)");
    fillSelect($("presetAction"), acts, "(Focus Timer আলাদা; tracking হবে না)");
    fillSelect($("logFilterAction"), acts, "সব Action");
    fillSelect(
      $("focusPreset"),
      presets,
      "Saved session বেছে নাও",
      state.focus.presetId,
    );
  }

  function scheduleMatches(a, date) {
    const s = a.schedule || { type: "none", days: [] };
    const day = dateFromISO(date).getDay();
    if (s.type === "daily") return true;
    if (s.type === "weekdays" || s.type === "weekly")
      return (s.days || []).includes(day);
    return false;
  }
  function ensureScheduledTasks(date) {
    // Idempotent: one session per action per date, regardless of completion status.
    // A dismissed (removed) session still counts, so it never regenerates.
    let changed = false;
    activeActions().forEach((a) => {
      if (scheduleMatches(a, date) && !sessionExistsForAction(a.id, date)) {
        state.tasks.push({
          id: uid("task"),
          actionId: a.id,
          name: a.name,
          categoryId: a.categoryId,
          date,
          plannedMinutes: Number(a.dailyTarget) || 0,
          tag: "",
          note: "",
          status: "todo",
          source: "schedule",
          dismissed: false,
          createdAt: nowISO(),
        });
        changed = true;
      }
    });
    if (changed) persist();
  }
  function sessionItemHtml(t) {
    const a = actionById(t.actionId);
    const emoji = a?.emoji ? a.emoji + " " : "";

    // Recorded = সব log যেগুলো এই action + এই date এর
    let actual = state.logs
      .filter((l) => l.actionId === t.actionId && l.date === t.date)
      .reduce((s, l) => s + l.durationSeconds, 0);

    // যদি এখন এই action ট্র্যাক হচ্ছে এবং সেগমেন্ট এই date-এ শুরু, live seconds যোগ
    if (
      state.tracking.activeActionId === t.actionId &&
      state.tracking.segmentStart &&
      localDate(new Date(state.tracking.segmentStart)) === t.date
    ) {
      actual += currentTrackingSeconds();
    }

    const tracking =
      !!state.tracking.activeActionId &&
      t.actionId === state.tracking.activeActionId;
    return `<div class="item ${t.status === "done" ? "done" : ""}"><input aria-label="Mark complete" type="checkbox" data-task-done="${t.id}" ${t.status === "done" ? "checked" : ""}><div class="content"><strong>${escapeHTML(emoji + t.name)}${tracking ? ` <span class="pill green">Tracking &middot; ${fmt(currentTrackingSeconds())}</span>` : ""}${t.tag ? ` <span class="pill">${escapeHTML(t.tag)}</span>` : ""}</strong><div class="tiny">${escapeHTML(categoryName(t.categoryId))} &middot; Planned ${humanMinutes(t.plannedMinutes)} &middot; Recorded ${humanMinutes(actual / 60)}${t.note ? " &middot; " + escapeHTML(t.note) : ""}</div></div><div class="actions"><button class="small" data-task-track="${t.id}">Track</button><button class="small" data-task-edit="${t.id}">Edit</button><button class="small danger" data-task-remove="${t.id}">Remove</button></div></div>`;
  }
  function renderToday() {
    const date = getSelectedDate();
    ensureScheduledTasks(date);
    $("todayLabel").textContent = new Date().toLocaleDateString("bn-BD", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
    $("dashboardDate").value = date;
    const fc = $("taskFilterCategory")?.value || "";
    const group = $("taskGroup")?.value || "action";
    const sessions = sessionsForDate(date).filter(
      (t) => !fc || t.categoryId === fc,
    );
    const host = $("todayTasks");
    if (!sessions.length)
      host.innerHTML =
        '<div class="empty">আজকের Sessions ফাঁকা। নিচের Other Actions প্যানেল থেকে Add করো।</div>';
    else {
      const keyOf =
        group === "category"
          ? (t) => categoryName(t.categoryId)
          : group === "importance"
            ? (t) => String(Number(catById(t.categoryId)?.importance) || 99)
            : group === "tag"
              ? (t) => t.tag || "Untagged"
              : null;
      const sorted = sessions
        .slice()
        .sort(
          keyOf
            ? (a, b) => String(keyOf(a)).localeCompare(String(keyOf(b)))
            : (a, b) =>
                (Number(actionById(a.actionId)?.order) || 0) -
                  (Number(actionById(b.actionId)?.order) || 0) ||
                String(a.name).localeCompare(String(b.name)),
        );
      let html = "",
        lastKey = null;
      sorted.forEach((t) => {
        if (keyOf) {
          const k = String(keyOf(t));
          if (k !== lastKey) {
            html += `<div class="grouphead">${escapeHTML(group === "importance" ? "Importance " + k : k)}</div>`;
            lastKey = k;
          }
        }
        html += sessionItemHtml(t);
      });
      host.innerHTML = html;
    }
    const allSess = sessionsForDate(date);
    const logs = logsForDate(date);
    const recorded =
      logs.reduce((s, l) => s + l.durationSeconds, 0) +
      (state.tracking.segmentStart &&
      localDate(new Date(state.tracking.segmentStart)) === date
        ? currentTrackingSeconds()
        : 0);
    $("todayRecorded").textContent = humanMinutes(recorded / 60);
    $("todayPlanned").textContent = humanMinutes(
      allSess
        .filter((t) => t.status !== "done")
        .reduce((s, t) => s + (t.plannedMinutes || 0), 0),
    );
    $("todayCompletion").textContent =
      `${allSess.filter((t) => t.status === "done").length} / ${allSess.length}`;
    renderOtherActions(date);
    renderTrackingMini();
    renderFocusMini();
  }
  function renderOtherActions(date) {
    const host = $("otherActions");
    const present = new Set(sessionsForDate(date).map((t) => t.actionId));
    const acts = activeActions().filter((a) => !present.has(a.id));
    if (!acts.length) {
      host.innerHTML =
        '<div class="empty">সব সক্রিয় Action আজকের Sessions-এ আছে।</div>';
      return;
    }
    host.innerHTML = acts
      .map((a) => {
        const dismissed = !!sessionForAction(a.id, date)?.dismissed;
        return `<div class="item"><div class="content"><strong>${escapeHTML(actionEmojiName(a))}</strong><div class="tiny">${escapeHTML(categoryName(a.categoryId))} &middot; Daily ${humanMinutes(a.dailyTarget)}${dismissed ? " &middot; আগে সরানো হয়েছিল" : ""}</div></div><div class="actions"><button class="small primary" data-other-add="${a.id}">${dismissed ? "আবার যোগ" : "Add"}</button></div></div>`;
      })
      .join("");
  }
  function reminderItemTodayHtml(r, status) {
    const emoji = r.emoji ? r.emoji + " " : "";
    const pill =
      status === "overdue"
        ? `<span class="pill red">Overdue · ${escapeHTML(r.nextDueDate)}</span>`
        : `<span class="pill green">Today</span>`;
    const resched = r.rescheduledFrom
      ? ` · rescheduled from ${escapeHTML(r.rescheduledFrom)}`
      : "";
    return `<div class="item"><input type="checkbox" aria-label="Mark done" data-reminder-done="${r.id}"><div class="content"><strong>${escapeHTML(emoji + r.name)} ${pill}</strong><div class="tiny">${escapeHTML(describeSchedule(r.schedule))}${resched}</div></div><div class="actions"><button class="small" data-reminder-reschedule="${r.id}">Reschedule</button></div></div>`;
  }

  function renderTodayReminders() {
    // ============ Nav badge update (সবসময় আজকের) ============
    const today = localDate();
    const { due, overdue } = getReminderBuckets(today);
    const totalToday = due.length + overdue.length;

    const badge = $("reminderNavBadge");
    if (badge) {
      if (totalToday > 0) {
        badge.textContent = String(totalToday);
        badge.classList.remove("hidden");
      } else {
        badge.textContent = "";
        badge.classList.add("hidden");
      }
    }

    // ============ Top card content ============
    const host = $("todayReminders");
    if (!host) return;

    if (!due.length && !overdue.length) {
      host.innerHTML =
        '<div class="empty">আজকের জন্য কোনো Reminder নেই। 🎉</div>';
      return;
    }

    let html = "";
    if (overdue.length) {
      html += `<div class="grouphead">Overdue (${overdue.length})</div>`;
      html += overdue.map((r) => reminderItemTodayHtml(r, "overdue")).join("");
    }
    if (due.length) {
      html += `<div class="grouphead"${overdue.length ? ' style="margin-top:14px"' : ""}>আজকের (${due.length})</div>`;
      html += due.map((r) => reminderItemTodayHtml(r, "due")).join("");
    }
    host.innerHTML = html;
  }

  function renderRemindersList() {
    const host = $("reminderList");
    if (!host) return;
    const all = state.reminders.filter((r) => !r.archived);
    $("reminderCountBadge").textContent = `${all.length} active`;
    if (!all.length) {
      host.innerHTML =
        '<div class="empty">এখনো কোনো Reminder নেই। বাম পাশ থেকে প্রথমটি তৈরি করো।</div>';
      return;
    }
    const sorted = all
      .slice()
      .sort((a, b) =>
        String(a.nextDueDate || "9999").localeCompare(
          String(b.nextDueDate || "9999"),
        ),
      );
    host.innerHTML = sorted
      .map((r) => {
        const emoji = r.emoji ? r.emoji + " " : "";
        const today = localDate();
        let pill;
        if (r.nextDueDate === today)
          pill = `<span class="pill green">Today</span>`;
        else if (r.nextDueDate < today)
          pill = `<span class="pill red">Overdue · ${escapeHTML(r.nextDueDate)}</span>`;
        else pill = `<span class="pill">${escapeHTML(r.nextDueDate)}</span>`;
        return `<div class="item"><div class="content"><strong>${escapeHTML(emoji + r.name)} ${pill}</strong><div class="tiny">${escapeHTML(describeSchedule(r.schedule))}${r.history?.length ? ` · ${r.history.length} বার সম্পন্ন` : ""}</div></div><div class="actions"><button class="small" data-reminder-reschedule="${r.id}">Reschedule</button><button class="small" data-reminder-edit="${r.id}">Edit</button><button class="small danger" data-reminder-archive="${r.id}">Archive</button></div></div>`;
      })
      .join("");
  }

  function resetReminderForm() {
    $("reminderEditId").value = "";
    $("reminderFormTitle").textContent = "নতুন Reminder";
    $("reminderForm").reset();
    $("reminderScheduleType").value = "weekly";
    $("reminderWeeklyWrap").classList.remove("hidden");
    $("reminderIntervalWrap").classList.add("hidden");
    $("reminderOnceWrap").classList.add("hidden"); // ← নতুন
    $("reminderOnceDate").value = localDate(); // ← নতুন
    $("reminderWeeks").value = 2;
    $("reminderIntervalDay").value = "2";
    $("reminderAnchor").value = localDate();
    document
      .querySelectorAll("#reminderWeeklyWrap .schedule-days input")
      .forEach((x) => (x.checked = false));
  }
  function openSessionModal(taskId) {
    const t = taskById(taskId);
    if (!t) return;
    editingTaskId = taskId;
    $("modalTitle").textContent = "Session Edit — " + t.name;
    const h = Math.floor((Number(t.plannedMinutes) || 0) / 60),
      m = (Number(t.plannedMinutes) || 0) % 60;
    $("sessName").value = t.name;
    $("sessHours").value = h;
    $("sessMins").value = m;
    $("sessTag").value = t.tag || "";
    $("sessNote").value = t.note || "";
    $("modalOverlay").classList.remove("hidden");
    setTimeout(() => $("sessName").focus(), 50);
  }
  function closeModal() {
    $("modalOverlay").classList.add("hidden");
    editingTaskId = null;
  }
  function openLogEditModal(logId) {
    const l = state.logs.find((x) => x.id === logId);
    if (!l) return;
    editingLogId = logId;
    $("logEditTitle").textContent = "Time Log Edit";

    // Populate action dropdown
    const acts = activeActions();
    const sel = $("logEditAction");
    sel.innerHTML = '<option value="">Action ছাড়া</option>';
    acts.forEach((a) => {
      const o = document.createElement("option");
      o.value = a.id;
      o.textContent = (a.emoji ? a.emoji + " " : "") + a.name;
      sel.appendChild(o);
    });

    // If the log's action was archived/deleted, add a placeholder option
    if (l.actionId && !acts.some((a) => a.id === l.actionId)) {
      const o = document.createElement("option");
      o.value = l.actionId;
      o.textContent = actionName(l.actionId) + " (archived)";
      sel.appendChild(o);
    }
    sel.value = l.actionId || "";

    // Fill date
    $("logEditDate").value = l.date || localDate();

    // Fill hours + minutes separately
    const totalMin = Math.round((Number(l.durationSeconds) || 0) / 60);
    $("logEditHours").value = Math.floor(totalMin / 60);
    $("logEditMins").value = totalMin % 60;

    // Fill note
    $("logEditNote").value = l.note || "";

    $("logEditOverlay").classList.remove("hidden");
    setTimeout(() => $("logEditHours").focus(), 50);
  }

  function closeLogEditModal() {
    $("logEditOverlay").classList.add("hidden");
    editingLogId = null;
  }
  function renderActions() {
    const list = $("actionList"),
      acts = activeActions(),
      target = allWeeklyTargetMinutes();
    $("weeklyBudgetBadge").textContent =
      `Weekly plan: ${humanMinutes(target)} / 168h`;
    $("budgetNotice").className = "notice" + (target > 10080 ? " error" : "");
    $("budgetNotice").textContent =
      target > 10080
        ? "সতর্কতা: Action Weekly Target-এর যোগফল ১৬৮ ঘণ্টা ছাড়িয়ে গেছে।"
        : "Action-এর Weekly Target-এর যোগফল ১৬৮ ঘণ্টার মধ্যে থাকতে হবে। Category-এর নিজস্ব time budget নেই।";
    if (!acts.length)
      list.innerHTML =
        '<div class="empty">এখনও কোনো Action নেই। বাম পাশ থেকে প্রথম Action তৈরি করো।</div>';
    else
      list.innerHTML = acts
        .map((a) => {
          const cat = catById(a.categoryId),
            weeklyActual = logSecondsForAction(
              a.id,
              weekStartDate(localDate(), state.settings.weekStart),
              addDays(weekStartDate(localDate(), state.settings.weekStart), 6),
            );
          return `<div class="item"><div class="content"><strong>${escapeHTML(actionEmojiName(a))}</strong><div class="tiny">${escapeHTML(cat?.name || "No category")} &middot; Daily ${humanMinutes(a.dailyTarget)} &middot; Weekly ${humanMinutes(a.weeklyTarget)} &middot; Actual this week ${humanMinutes(weeklyActual / 60)}</div>${a.description ? `<div class="tiny">${escapeHTML(a.description)}</div>` : ""}</div><div class="actions"><button class="small" data-action-up="${a.id}" aria-label="Move up">&uarr;</button><button class="small" data-action-down="${a.id}" aria-label="Move down">&darr;</button><details class="more-menu"><summary aria-label="More actions">&bull;&bull;&bull;</summary><div class="more-menu-pop"><button class="small" data-action-track="${a.id}">Track</button><button class="small" data-action-edit="${a.id}">Edit</button><button class="small danger" data-action-archive="${a.id}">Archive</button></div></details></div></div>`;
        })
        .join("");
    const cList = $("categoryList"),
      cats = activeCats();
    cList.innerHTML =
      cats
        .map(
          (c) =>
            `<div class="item"><div class="content"><strong>${escapeHTML(c.name)}</strong><div class="tiny">Importance rank: ${c.importance} &middot; ${state.actions.filter((a) => a.categoryId === c.id && !a.archived).length} Actions</div></div><div class="actions"><button class="small" data-category-edit="${c.id}">Edit</button><button class="small danger" data-category-archive="${c.id}">Archive</button></div></div>`,
        )
        .join("") || '<div class="empty">No categories</div>';
  }
  function renderTrackingMini() {
    const a = activeAction(),
      s = currentTrackingSeconds();
    const paused = !!state.tracking.paused;
    const pillCls = paused ? "pill" : "pill green";
    const pillTxt = paused ? "⏸ Paused" : "Tracking";
    const since = state.tracking.originalStartAt
      ? new Date(state.tracking.originalStartAt).toLocaleTimeString()
      : "—";

    $("trackingMini").innerHTML = a
      ? `<div class="row"><span class="${pillCls}">${pillTxt}</span><strong>${escapeHTML(actionEmojiName(a))}</strong></div><div class="metric" style="margin-top:10px">${fmt(s)}</div><div class="tiny">${paused ? "Paused at " + new Date(state.tracking.pausedAt).toLocaleTimeString() : "শুরু: " + since}</div>`
      : '<div class="muted">এখন কোনো Action track হচ্ছে না।</div>';

    $("trackingCurrent").innerHTML = a
      ? `<div class="notice${paused ? "" : " active"}"><strong>${escapeHTML(actionEmojiName(a))}</strong> ${paused ? "paused" : "track হচ্ছে"}<br><span class="metric">${fmt(s)}</span><br><span class="tiny">${paused ? "Paused at: " + new Date(state.tracking.pausedAt).toLocaleString() : "শুরু: " + since}</span></div>`
      : '<div class="empty">কোনো চলমান Time Tracking নেই।</div>';

    // Sync pause / resume button labels & disabled state
    const isTracking = !!a;
    const label = paused ? "Resume" : "Pause";
    ["pauseTrackingBtn", "trackingPause"].forEach((id) => {
      const btn = $(id);
      if (!btn) return;
      btn.textContent = label;
      btn.disabled = !isTracking;
    });
  }

  /* ---------- Floating Time Tracking Widget ---------- */
  function renderTrackingFabActions() {
    const sel = $("trackingFabAction");
    if (!sel) return;
    const prev = sel.value;
    const acts = activeActions();
    sel.innerHTML = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Action বেছে নাও";
    sel.appendChild(placeholder);
    acts.forEach((a) => {
      const o = document.createElement("option");
      o.value = a.id;
      o.textContent = (a.emoji ? a.emoji + " " : "") + a.name;
      sel.appendChild(o);
    });
    if (state.tracking.activeActionId)
      sel.value = state.tracking.activeActionId;
    else if (prev) sel.value = prev;
  }

  function updateTrackingFab() {
    const wrap = $("trackingFab");
    if (!wrap) return;
    const a = activeAction();
    const isTracking = !!a;
    const paused = !!state.tracking.paused;

    wrap.classList.toggle("tracking", isTracking && !paused);
    wrap.classList.toggle("paused", isTracking && paused);

    const timer = $("trackingFabTimer");
    if (timer) {
      if (isTracking) {
        timer.classList.remove("hidden");
        timer.textContent =
          (paused ? "⏸ " : "") + fmt(currentTrackingSeconds());
      } else {
        timer.classList.add("hidden");
      }
    }

    const status = $("trackingFabStatus");
    if (status) {
      if (isTracking) {
        status.classList.add("active");
        status.innerHTML =
          `<strong>${escapeHTML(actionEmojiName(a))}</strong>` +
          `<span class="tracking-fab-live">${fmt(currentTrackingSeconds())}</span>` +
          (paused ? `<span class="tiny">Paused</span>` : "");
      } else {
        status.classList.remove("active");
        status.textContent = "কোনো Action track হচ্ছে না।";
      }
    }

    const stopBtn = $("trackingFabStop");
    if (stopBtn) stopBtn.disabled = !isTracking;

    const pauseBtn = $("trackingFabPause");
    if (pauseBtn) {
      pauseBtn.disabled = !isTracking;
      pauseBtn.textContent = paused ? "Resume" : "Pause";
    }
  }

  function openTrackingFabPanel() {
    const p = $("trackingFabPanel");
    if (!p) return;
    p.classList.remove("hidden");
    renderTrackingFabActions();
    updateTrackingFab();
  }

  function closeTrackingFabPanel() {
    $("trackingFabPanel")?.classList.add("hidden");
  }

  function toggleTrackingFabPanel() {
    const p = $("trackingFabPanel");
    if (!p) return;
    if (p.classList.contains("hidden")) openTrackingFabPanel();
    else closeTrackingFabPanel();
  }

  function bindTrackingFab() {
    const btn = $("trackingFabBtn");
    if (!btn) return;

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleTrackingFabPanel();
    });

    $("trackingFabClose")?.addEventListener("click", (e) => {
      e.stopPropagation();
      closeTrackingFabPanel();
    });

    $("trackingFabStart")?.addEventListener("click", () => {
      const id = $("trackingFabAction")?.value;
      if (!id) {
        notify("একটি Action বেছে নাও।");
        return;
      }
      startTracking(id);
      updateTrackingFab();
    });

    $("trackingFabStop")?.addEventListener("click", () => {
      stopTracking();
      updateTrackingFab();
    });

    $("trackingFabPause")?.addEventListener("click", () => {
      toggleTrackingPause();
      updateTrackingFab();
    });

    document.addEventListener("pointerdown", (e) => {
      const wrap = $("trackingFab");
      if (!wrap) return;
      if (!wrap.contains(e.target)) closeTrackingFabPanel();
    });

    document.addEventListener("fullscreenchange", () => {
      const wrap = $("trackingFab");
      if (!wrap) return;
      wrap.classList.toggle("hidden", !!document.fullscreenElement);
    });
  }

  function renderFocusMini() {
    const f = state.focus,
      p = activePreset(),
      phase = activePhase();
    if (p && (f.running || f.paused))
      $("focusMini").innerHTML =
        `<div class="row"><span class="pill ${f.paused ? "" : "green"}">${f.paused ? "Paused" : "Running"}</span><strong>${escapeHTML(p.name)}</strong></div><div class="metric">${fmt(Math.max(0, (phase?.minutes || 0) * 60 - phaseElapsed()))}</div><div class="tiny">${phase ? escapeHTML(phase.name) : "Session"} &middot; ${f.mode === "both" ? "Timer + Tracking" : f.mode === "timer" ? "Timer Only" : "Tracking Only"}</div>`;
    else
      $("focusMini").innerHTML =
        '<div class="muted">কোনো Focus Session চলছে না।</div>';
  }
  async function openFocusPiP() {
    if (!("documentPictureInPicture" in window)) {
      notify("এই ব্রাউজারে PiP সাপোর্ট নেই। Chrome/Edge 116+ ব্যবহার করুন।");
      return;
    }
    if (pipWindow) {
      pipWindow.close();
      return;
    }
    try {
      pipWindow = await documentPictureInPicture.requestWindow({
        width: 200,
        height: 96,
      });
    } catch (e) {
      notify("PiP খোলা যায়নি।");
      return;
    }

    // Copy current page's stylesheets into the PiP window
    [...document.styleSheets].forEach((sheet) => {
      try {
        const css = [...sheet.cssRules].map((r) => r.cssText).join("");
        const style = pipWindow.document.createElement("style");
        style.textContent = css;
        pipWindow.document.head.appendChild(style);
      } catch (e) {
        if (sheet.href) {
          const link = pipWindow.document.createElement("link");
          link.rel = "stylesheet";
          link.href = sheet.href;
          pipWindow.document.head.appendChild(link);
        }
      }
    });

    // Minimal PiP styles — phase name on top, big timer below
    const pipStyle = pipWindow.document.createElement("style");
    pipStyle.textContent = `
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 0;
      height: 100vh;
      display: grid;
      grid-template-rows: auto 1fr;
      place-items: center;
      gap: 2px;
      overflow: hidden;
      -webkit-user-select: none;
      user-select: none;
      background: var(--panel, #0f1728);
      color: var(--text, #e8eefb);
      font-family: var(--font, system-ui, sans-serif);
      cursor: grab;
    }
    body:active { cursor: grabbing; }
    .pip-phase {
      font-size: 11.5px;
      font-weight: 700;
      color: var(--muted, #8fa0bd);
      letter-spacing: 0.02em;
      text-align: center;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 100%;
      padding: 8px 8px 0;
      line-height: 1;
    }
    .pip-timer {
      font-size: 42px;
      font-weight: 800;
      letter-spacing: -0.045em;
      line-height: 1;
      font-variant-numeric: tabular-nums;
      background: linear-gradient(135deg, #4f46e5, #a855f7);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
      white-space: nowrap;
      padding: 0 4px 6px;
    }
    .pip-timer.overtime {
      background: linear-gradient(135deg, #f43f5e, #fb923c);
      -webkit-background-clip: text;
      background-clip: text;
    }
    .pip-timer.paused { opacity: 0.5; }
    .pip-phase.paused { opacity: 0.5; }
    .pip-controls {
      display: flex;
      gap: 6px;
      padding-bottom: 8px;
    }
    .pip-controls button {
      padding: 4px 14px;
      border-radius: 8px;
      border: 1px solid var(--line, #1e2942);
      background: var(--panel-2, #131c30);
      color: var(--text, #e8eefb);
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      line-height: 1;
      font-family: inherit;
      min-width: 32px;
    }
    .pip-controls button:disabled {
      opacity: 0.35;
      cursor: not-allowed;
    }
    #pipPause {
      padding: 4px 12px;
      font-size: 12.5px;
      min-width: 64px;
    }
    .pip-controls button:disabled {
      opacity: 0.3;
      cursor: not-allowed;
    }
    .pip-controls button:hover:not(:disabled) {
      background: var(--hover, #182238);
    }
  `;
    pipWindow.document.head.appendChild(pipStyle);

    // PiP DOM — phase name on top, timer, then controls row
    pipWindow.document.body.innerHTML = `
    <div class="pip-phase" id="pipPhase">—</div>
    <div class="pip-timer" id="pipTime">00:00</div>
    <div class="pip-controls">
      <button id="pipPrev" type="button" title="Previous phase">‹</button>
      <button id="pipPause" type="button" title="Pause / Resume">Pause</button>
      <button id="pipNext" type="button" title="Next phase">›</button>
    </div>
  `;
    pipWindow.document
      .getElementById("pipPrev")
      .addEventListener("click", prevPhase);
    pipWindow.document
      .getElementById("pipNext")
      .addEventListener("click", nextPhase);
    pipWindow.document
      .getElementById("pipPause")
      .addEventListener("click", () => {
        if (state.focus.running || state.focus.paused) pauseFocus();
      });
    pipWindow.document.title = "Focus";

    // Cleanup when user closes PiP
    pipWindow.addEventListener("pagehide", () => {
      pipWindow = null;
      updatePiPButtonLabel();
      notify("PiP বন্ধ হয়েছে।");
    });

    updatePiPButtonLabel();
    updatePiPContent();
    notify("Mini timer চালু — সব অ্যাপের উপরে থাকবে।");
  }

  function updatePiPButtonLabel() {
    const btn = $("focusPiPBtn");
    if (!btn) return;
    btn.textContent = pipWindow ? "✕ Exit PiP" : "⧉ PiP Mode";
  }

  function updatePiPContent() {
    if (!pipWindow || pipWindow.closed) return;
    const timeEl = pipWindow.document.getElementById("pipTime");
    const phaseEl = pipWindow.document.getElementById("pipPhase");
    if (!timeEl) return;

    const f = state.focus;
    const p = activePreset();
    const phase = activePhase();
    const elapsed = phaseElapsed();
    const duration = (phase?.minutes || 0) * 60;
    const over = duration > 0 && elapsed >= duration;
    const allowOT = phase ? phase.countUp !== false : true;

    // === Phase name ===
    if (phaseEl) {
      let label;
      if (!p) label = "—";
      else if (phase) {
        const total = p.phases.length;
        const idx = f.phaseIndex + 1;
        label = total > 1 ? `${idx}/${total} · ${phase.name}` : phase.name;
      } else {
        label = p.name;
      }
      phaseEl.textContent = label;
      phaseEl.title = label;
      phaseEl.classList.toggle("paused", f.paused);
    }

    // === Timer ===
    let text;
    if (!p) text = "00:00";
    else if (over) text = allowOT ? "+" + fmt(elapsed - duration) : "00:00";
    else text = fmt(Math.max(0, duration - elapsed));

    timeEl.textContent = text;
    timeEl.classList.toggle("overtime", over && allowOT);
    timeEl.classList.toggle("paused", f.paused);
    // === Prev / Next / Pause buttons ===
    const prevBtn = pipWindow.document.getElementById("pipPrev");
    const nextBtn = pipWindow.document.getElementById("pipNext");
    const pauseBtn = pipWindow.document.getElementById("pipPause");
    const running = f.running || f.paused;
    if (prevBtn) prevBtn.disabled = !p || !running || f.phaseIndex <= 0;
    if (nextBtn)
      nextBtn.disabled =
        !p || !running || f.phaseIndex >= (p.phases?.length || 0) - 1;
    if (pauseBtn) {
      pauseBtn.textContent = f.paused ? "Resume" : "Pause";
      pauseBtn.disabled = !p || !running;
    }
  }
  function renderFocus() {
    const f = state.focus,
      p = activePreset(),
      phase = activePhase(),
      elapsed = phaseElapsed(),
      duration = (phase?.minutes || 0) * 60,
      over = duration > 0 && elapsed >= duration;
    $("focusTimerName").textContent = p
      ? `${p.name}${phase ? " — " + phase.name : ""}`
      : "কোনো সেশন চালু নেই";
    const allowOT = phase ? phase.countUp !== false : true;
    let remaining = duration - elapsed;
    $("focusTime").textContent = over
      ? !allowOT
        ? "সময় শেষ"
        : "+" + fmt(elapsed - duration)
      : fmt(Math.max(0, remaining));
    $("focusTime").classList.toggle("overtime", over && allowOT);
    $("focusStatus").textContent = !p
      ? "একটি সেশন বেছে নাও অথবা নতুন সেশন তৈরি করো."
      : f.paused
        ? "Paused"
        : f.running
          ? over
            ? allowOT
              ? "Overtime চলছে — Next phase নিজে চাপো।"
              : "সময় শেষ — পরের phase-এ চলে যাচ্ছে..."
            : `চলছে · ${phase?.minutes || 0} মিনিট নির্ধারিত`
          : "সেশন প্রস্তুত";
    $("focusPause").textContent = f.paused ? "Resume" : "Pause";
    $("focusNext").disabled =
      !p || (!f.running && !f.paused) || !p.phases?.[f.phaseIndex + 1];
    $("focusPrev").disabled =
      !p || (!f.running && !f.paused) || f.phaseIndex <= 0;
    $("focusStart").disabled = !!(f.running || f.paused);
    $("focusPause").disabled = !(f.running || f.paused);
    $("focusStop").disabled = !(f.running || f.paused);
    $("focusAlert").classList.toggle("hidden", !f.alerted);
    if (f.alerted)
      $("focusAlert").textContent =
        `${phase?.name || "এই পর্যায়"}-এর নির্ধারিত সময় শেষ হয়েছে। তুমি চাইলে চালিয়ে যেতে পারো; পরের পর্যায় নিজে থেকে শুরু হবে না।`;
    renderFocusMini();
    updatePiPContent();
  }
  function renderLogs() {
    const date = $("logFilterDate").value,
      act = $("logFilterAction").value;
    let logs = state.logs
      .filter((l) => (!date || l.date === date) && (!act || l.actionId === act))
      .slice()
      .sort((a, b) =>
        (b.startAt || b.createdAt || "").localeCompare(
          a.startAt || a.createdAt || "",
        ),
      );
    const seconds = logs.reduce((s, l) => s + l.durationSeconds, 0);
    $("logSummary").textContent =
      `${logs.length} entries · মোট ${humanMinutes(seconds / 60)}। Tracked interval ও duration-only manual entry আলাদা করে দেখানো হয়েছে।`;
    $("logTable").innerHTML = logs.length
      ? `<table><thead><tr><th>Date</th><th>Action</th><th>Duration</th><th>Type</th><th>Note</th><th></th></tr></thead><tbody>${logs.map((l) => `<tr><td>${escapeHTML(l.date)}</td><td>${escapeHTML(actionName(l.actionId))}</td><td>${humanMinutes(l.durationSeconds / 60)}</td><td>${l.kind === "manual" ? "Manual estimate" : "Tracked interval"}</td><td>${escapeHTML(l.note || "—")}</td><td><button class="small" data-log-edit="${l.id}">Edit</button><button class="small danger" data-log-delete="${l.id}">Delete</button></td></tr>`).join("")}</tbody></table>`
      : '<div class="empty">এই ফিল্টারে কোনো Time Log নেই।';
  }
  function updateReviewTargetDisplay() {
    const total = activeActions().reduce(
      (s, x) => s + (Number(x.weeklyTarget) || 0),
      0,
    );
    const el = $("reviewTarget");
    const overEl = $("reviewTargetOver");
    el.textContent = humanMinutes(total);

    const over = total > 10080;
    el.classList.toggle("danger", over);

    if (over && overEl) {
      const excessMin = total - 10080;
      overEl.textContent = `⚠ ${humanMinutes(excessMin)} বেশি হয়েছে`;
    } else if (overEl) {
      overEl.textContent = "";
    }

    el.title = over ? "⚠️ সাপ্তাহিক মোট টার্গেট ১৬৮ ঘণ্টা ছাড়িয়ে গেছে!" : "";
  }

  function computeWeekTimeStats(startDateStr) {
    const startD = dateFromISO(startDateStr);
    startD.setHours(0, 0, 0, 0);
    const endD = new Date(startD);
    endD.setDate(endD.getDate() + 7);
    const now = new Date();
    const totalSec = 7 * 24 * 3600;
    let elapsedSec, remainingSec;
    if (now <= startD) {
      elapsedSec = 0;
      remainingSec = totalSec;
    } else if (now >= endD) {
      elapsedSec = totalSec;
      remainingSec = 0;
    } else {
      elapsedSec = (now - startD) / 1000;
      remainingSec = (endD - now) / 1000;
    }
    return { elapsedSec, remainingSec, totalSec };
  }

  function updateReviewLiveStats() {
    const page = $("page-review");
    if (!page || !page.classList.contains("active")) return;
    if (reviewOffset !== 0) return;
    const start = lastReviewStart;
    if (!start) return;
    const end = addDays(start, 6);
    const stats = computeWeekTimeStats(start);
    const logs = state.logs.filter((l) => l.date >= start && l.date <= end);
    let actual = logs.reduce((s, l) => s + l.durationSeconds, 0);
    if (state.tracking.segmentStart) {
      const tDate = localDate(new Date(state.tracking.segmentStart));
      if (tDate >= start && tDate <= end) actual += currentTrackingSeconds();
    }
    const untrackedSec = Math.max(0, stats.elapsedSec - actual);
    const e = $("reviewElapsed");
    if (e) e.textContent = humanDHM(stats.elapsedSec);
    const u = $("reviewUntracked");
    if (u) u.textContent = humanMinutes(untrackedSec / 60);
    const r = $("reviewRemaining");
    if (r) r.textContent = humanDHM(stats.remainingSec);
    const rec = $("reviewRecorded");
    if (rec) rec.textContent = humanMinutes(actual / 60);
  }
  function renderReview() {
    const start = addDays(
        weekStartDate(localDate(), state.settings.weekStart),
        reviewOffset * 7,
      ),
      end = addDays(start, 6);
    lastReviewStart = start;
    $("weekRange").innerHTML =
      reviewOffset === 0
        ? `<span class="pill green">Current week</span> ${start} থেকে ${end}`
        : `${start} থেকে ${end}`;

    const acts = activeActions(),
      target = acts.reduce((s, a) => s + (Number(a.weeklyTarget) || 0), 0);
    const logs = state.logs.filter((l) => l.date >= start && l.date <= end);
    let actual = logs.reduce((s, l) => s + l.durationSeconds, 0);
    if (state.tracking.segmentStart) {
      const tDate = localDate(new Date(state.tracking.segmentStart));
      if (tDate >= start && tDate <= end) actual += currentTrackingSeconds();
    }
    const tasks = state.tasks.filter((t) => t.date >= start && t.date <= end);

    // Top row
    $("reviewTarget").textContent = humanMinutes(target);
    $("reviewRecorded").textContent = humanMinutes(actual / 60);
    $("reviewTasks").textContent =
      `${tasks.filter((t) => t.status === "done").length} / ${tasks.length}`;

    // New bottom row — week time stats
    const stats = computeWeekTimeStats(start);
    const untrackedSec = Math.max(0, stats.elapsedSec - actual);
    $("reviewElapsed").textContent = humanDHM(stats.elapsedSec);
    $("reviewUntracked").textContent = humanMinutes(untrackedSec / 60);
    $("reviewRemaining").textContent = humanDHM(stats.remainingSec);

    // Action table
    $("reviewActionTable").innerHTML =
      `<table><thead><tr><th>Action</th><th>Weekly target</th><th>Recorded</th><th>Progress</th></tr></thead><tbody>${acts
        .map((a) => {
          const sec = logs
              .filter((l) => l.actionId === a.id)
              .reduce((s, l) => s + l.durationSeconds, 0),
            pct = a.weeklyTarget
              ? Math.round((sec / 60 / a.weeklyTarget) * 100)
              : 0;
          return `<tr><td>${escapeHTML(actionEmojiName(a))}</td><td><div class="row" style="flex-wrap:nowrap;gap:5px"><input class="review-target-hours" type="number" min="0" value="${Math.floor((Number(a.weeklyTarget) || 0) / 60)}" data-action-id="${a.id}" style="width:64px;padding:5px 8px"><span class="muted tiny">ঘ</span><input class="review-target-mins" type="number" min="0" max="59" value="${(Number(a.weeklyTarget) || 0) % 60}" data-action-id="${a.id}" style="width:58px;padding:5px 8px"><span class="muted tiny">মি</span></div></td><td>${humanMinutes(sec / 60)}</td><td><div class="progress"><span style="width:${Math.min(100, pct)}%"></span></div><span class="tiny review-pct">${pct}%</span></td></tr>`;
        })
        .join("")}</tbody></table>`;

    // Category table
    $("reviewCategoryTable").innerHTML =
      `<table><thead><tr><th>Category</th><th>Recorded</th><th>Actions</th></tr></thead><tbody>${activeCats()
        .map((c) => {
          const secs = logs
            .filter(
              (l) =>
                l.categoryId === c.id ||
                actionById(l.actionId)?.categoryId === c.id,
            )
            .reduce((s, l) => s + l.durationSeconds, 0);
          return `<tr><td>${escapeHTML(c.name)}</td><td>${humanMinutes(secs / 60)}</td><td>${state.actions.filter((a) => a.categoryId === c.id && !a.archived).length}</td></tr>`;
        })
        .join("")}</tbody></table>`;

    const r = state.reviews[start] || {};
    $("reviewGood").value = r.good || "";
    $("reviewChange").value = r.change || "";
  }
  function renderAll() {
    renderSelects();
    renderToday();
    renderActions();
    renderTrackingMini();
    renderFocus();
    renderLogs();
    renderReview();
    renderRemindersList();
    renderTodayReminders();
    renderTrackingFabActions();
    updateTrackingFab();
    updateLiveNumbers();
  }
  function resetActionForm() {
    $("actionEditId").value = "";
    $("actionFormTitle").textContent = "নতুন Action তৈরি";
    $("actionForm").reset();
    $("dailyHours").value = 0;
    $("dailyMins").value = 0;
    $("weeklyHours").value = 0;
    $("weeklyMins").value = 0;
    $("scheduleType").value = "none";
    document
      .querySelectorAll(".schedule-days input")
      .forEach((x) => (x.checked = false));
    $("scheduleDaysWrap").classList.add("hidden");
  }
  function resetPresetForm() {
    $("presetEditId").value = "";
    $("presetFormTitle").textContent = "নতুন Focus Session";
    $("presetForm").reset();
    $("presetCountup").checked = true;
    $("presetAlert").checked = true;
    $("phaseEditor").innerHTML = "";
    addPhaseRow("Work", 25);
  }
  function addPhaseRow(name = "", minutes = 25) {
    const h = Math.floor(minutes / 60),
      m = minutes % 60;
    const wrap = document.createElement("div");
    wrap.className = "item phase-row";
    wrap.innerHTML = `<div class="content"><div class="formgrid"><div class="field"><label>Phase name</label><input class="phase-name" required value="${escapeHTML(name)}" placeholder="যেমন Work / Break"></div><div class="field"><label>Duration</label><div class="row" style="flex-wrap:nowrap"><input class="phase-hours" required type="number" min="0" value="${h}" aria-label="Phase hours"><span class="muted tiny">ঘণ্টা</span><input class="phase-mins" required type="number" min="0" max="59" value="${m}" aria-label="Phase minutes"><span class="muted tiny">মিনিট</span></div></div></div><label class="checkboxrow tiny" style="margin-top:7px"><input type="checkbox" class="phase-countup" checked> এই পর্যায়ে Count Up অনুমোদিত</label></div><button type="button" class="small danger remove-phase">Remove</button>`;
    wrap.querySelector(".remove-phase").addEventListener("click", () => {
      wrap.remove();
      if (!$("phaseEditor").children.length) addPhaseRow("Work", 25);
    });
    $("phaseEditor").appendChild(wrap);
  }
  function phaseHM(row) {
    // 0 is valid — it marks a skip-marker phase. Only clamp negatives.
    const h = Math.max(
      0,
      Number(row.querySelector(".phase-hours")?.value) || 0,
    );
    const m = Math.min(
      59,
      Math.max(0, Number(row.querySelector(".phase-mins")?.value) || 0),
    );
    return h * 60 + m;
  }
  function collectPhases() {
    return [...document.querySelectorAll("#phaseEditor .phase-row")].map(
      (r) => ({
        name: r.querySelector(".phase-name").value.trim() || "Phase",
        minutes: phaseHM(r),
        countUp: r.querySelector(".phase-countup").checked,
      }),
    );
  }
  function startFocus(presetId) {
    const p = presetById(presetId);
    if (!p) {
      notify("আগে একটি Saved Session বেছে নাও।");
      return;
    }
    if (state.focus.running || state.focus.paused) {
      notify("আগের Focus Session আগে Stop করো।");
      return;
    }
    const firstIdx = focusFindActivePhase(0, 1);
    if (firstIdx === null) {
      notify("এই session-এ কোনো সক্রিয় phase নেই (সব ০ মিনিট)।");
      return;
    }
    state.focus = {
      ...seed().focus,
      presetId: p.id,
      running: true,
      paused: false,
      startedAt: nowISO(),
      phaseStartedAt: nowISO(),
      elapsedBeforePause: 0,
      phaseElapsedBeforePause: 0,
      phaseIndex: firstIdx,
      alerted: false,
      mode: "timer",
      trackingActionId: null,
    };
    persist();
    focusApplyTracking("start");
    renderAll();
    switchPage("focus");
    if (firstIdx > 0) {
      notify(
        `০-মিনিটের phase স্কিপ করে "${p.phases[firstIdx].name}" শুরু হলো।`,
      );
    } else {
      notify("Focus Session শুরু হয়েছে।");
    }
  }
  function pauseFocus() {
    const f = state.focus;
    if (!f.running && !f.paused) return;
    if (f.running) {
      f.elapsedBeforePause = focusElapsed();
      f.phaseElapsedBeforePause = phaseElapsed();
      f.pausedAt = nowISO();
      f.running = false;
      f.paused = true;
      focusPauseTracking();
    } else {
      f.startedAt = nowISO();
      f.phaseStartedAt = nowISO();
      f.running = true;
      f.paused = false;
      f.pausedAt = null;
      focusResumeTracking();
    }
    persist();
    renderAll();
  }
  function stopFocus() {
    const f = state.focus;
    if (!f.running && !f.paused) return;
    focusStopTracking();
    const keepPresetId = f.presetId;
    state.focus = { ...seed().focus, presetId: keepPresetId };
    persist();
    renderAll();
    notify("Focus Session বন্ধ হয়েছে — Start চাপলে আবার শুরু হবে।");
  }
  function nextPhase() {
    const f = state.focus,
      p = activePreset();
    if (!p) return;
    if (f.phaseIndex >= p.phases.length - 1) return;

    const ni = focusFindActivePhase(f.phaseIndex + 1, 1);
    if (ni === null) {
      // Every remaining phase is 0-minute → session complete.
      notify("⏹ সব phase সম্পন্ন — Focus Session বন্ধ হচ্ছে।");
      stopFocus();
      return;
    }
    const skipped = ni - f.phaseIndex - 1;
    f.phaseIndex = ni;
    f.phaseStartedAt = nowISO();
    f.phaseElapsedBeforePause = 0;
    f.alerted = false;
    persist();
    focusApplyTracking("next");
    renderAll();
    if (skipped > 0) {
      notify(
        `${skipped}টি ০-মিনিট phase স্কিপ করে "${p.phases[ni].name}" শুরু হলো।`,
      );
    } else {
      notify("পরের পর্যায় শুরু হয়েছে।");
    }
  }
  function prevPhase() {
    const f = state.focus,
      p = activePreset();
    if (!p) return;
    if (!f.running && !f.paused) return;

    const pi = focusFindActivePhase(f.phaseIndex - 1, -1);
    if (pi === null) {
      notify("এর আগে আর কোনো সক্রিয় phase নেই।");
      return;
    }
    const skipped = f.phaseIndex - pi - 1;
    f.phaseIndex = pi;
    f.phaseStartedAt = nowISO();
    f.phaseElapsedBeforePause = 0;
    f.alerted = false;
    persist();
    focusApplyTracking("prev");
    renderAll();
    if (skipped > 0) {
      notify(
        `${skipped}টি ০-মিনিট phase স্কিপ করে "${p.phases[pi].name}" শুরু হলো।`,
      );
    } else {
      notify("আগের phase-এ ফিরে গেছে।");
    }
  }
  function checkFocusAlarm() {
    const f = state.focus;
    if (!f.running) return;
    const phase = activePhase();
    if (!phase) return;
    if (phaseElapsed() >= (Number(phase.minutes) || 0) * 60 && !f.alerted) {
      f.alerted = true;
      persist();
      renderFocus();
      if (activePreset()?.alert) {
        try {
          if ("Notification" in window && Notification.permission === "granted")
            new Notification("Focus Timer", {
              body: `${activePreset().name}: ${phase.name} সময় শেষ।`,
            });
          else {
            beep();
          }
        } catch (e) {
          beep();
        }
      }
    }
  }
  function beep() {
    try {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return;
      const c = new C(),
        o = c.createOscillator(),
        g = c.createGain();
      o.connect(g);
      g.connect(c.destination);
      o.frequency.value = 880;
      g.gain.value = 0.08;
      o.start();
      setTimeout(() => {
        o.stop();
        c.close();
      }, 220);
    } catch (e) {}
  }
  function playNotificationSound() {
    try {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return;
      const c = new C();
      const t0 = c.currentTime;
      // 3-tone premium chime: A5 → C#6 → E6
      const notes = [
        { f: 880.0, t: 0.0, d: 0.2 },
        { f: 1108.7, t: 0.22, d: 0.2 },
        { f: 1318.5, t: 0.44, d: 0.45 },
      ];
      notes.forEach((n) => {
        const o = c.createOscillator();
        const g = c.createGain();
        o.type = "sine";
        o.frequency.value = n.f;
        o.connect(g);
        g.connect(c.destination);
        g.gain.setValueAtTime(0.0001, t0 + n.t);
        g.gain.exponentialRampToValueAtTime(0.18, t0 + n.t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + n.t + n.d);
        o.start(t0 + n.t);
        o.stop(t0 + n.t + n.d + 0.05);
      });
      setTimeout(() => {
        try {
          c.close();
        } catch (e) {}
      }, 1400);
    } catch (e) {}
  }
  function downloadBackup() {
    const blob = new Blob(
      [JSON.stringify({ ...state, exportedAt: nowISO() }, null, 2)],
      { type: "application/json" },
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `life-os-backup-${localDate()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    notify("JSON backup তৈরি হয়েছে।");
  }
  function importBackup(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const d = JSON.parse(reader.result);
        if (
          !d ||
          !Array.isArray(d.actions) ||
          !Array.isArray(d.categories) ||
          !Array.isArray(d.logs) ||
          !Array.isArray(d.presets)
        )
          throw new Error("invalid");
        if (
          !confirm(
            "Import করলে বর্তমান Life OS ডেটা প্রতিস্থাপিত হবে। আগে Export করা আছে? চালিয়ে যাবে?",
          )
        )
          return;
        state = {
          ...seed(),
          ...d,
          schemaVersion: SCHEMA_VERSION,
          settings: { ...seed().settings, ...(d.settings || {}) },
          tracking: { ...seed().tracking, ...(d.tracking || {}) },
          focus: { ...seed().focus, ...(d.focus || {}) },
        };
        state.actions = state.actions.map((a, i) => ({
          ...a,
          emoji: a.emoji || "",
          order: Number.isFinite(Number(a.order)) ? Number(a.order) : i,
        }));
        state.tasks = state.tasks.map((t) => ({
          ...t,
          tag: t.tag || "",
          dismissed: !!t.dismissed,
        }));
        persist();
        renderAll();
        notify("Backup import হয়েছে।");
      } catch (e) {
        alert(
          "এই JSON backup সঠিক Life OS backup নয় বা ফাইলটি ক্ষতিগ্রস্ত। বর্তমান ডেটা অপরিবর্তিত রাখা হয়েছে।",
        );
      }
    };
    reader.readAsText(file);
  }
  function syncThemeButton() {
    const dark = document.documentElement.getAttribute("data-theme") === "dark";
    const b = $("themeToggle");
    if (b) {
      b.textContent = dark ? "☀️" : "🌙";
      b.title = dark ? "Light mode" : "Dark mode";
    }
    const st = $("settingsThemeToggle");
    if (st) st.checked = dark;
  }

  function applyTheme(theme) {
    const next = theme === "dark" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("lifeOS.theme", next);
    } catch (e) {}
    syncThemeButton();
  }
  function bindEvents() {
    $("taskFilterCategory").addEventListener("change", renderToday);
    $("taskGroup").addEventListener("change", renderToday);
    $("scheduleType").addEventListener("change", () => {
      $("scheduleDaysWrap").classList.toggle(
        "hidden",
        !["weekdays", "weekly"].includes($("scheduleType").value),
      );
      if (
        $("scheduleType").value === "weekly" &&
        !document.querySelector(".schedule-days input:checked")
      ) {
        const d = new Date().getDay();
        const cb = document.querySelector(
          '.schedule-days input[value="' + d + '"]',
        );
        if (cb) cb.checked = true;
      }
    });
    document
      .querySelectorAll(".nav button")
      .forEach((b) =>
        b.addEventListener("click", () => switchPage(b.dataset.page)),
      );
    document
      .querySelectorAll("[data-goto]")
      .forEach((b) =>
        b.addEventListener("click", () => switchPage(b.dataset.goto)),
      );
    $("dashboardDate").value = localDate();
    $("manualDate").value = localDate();
    $("logFilterDate").value = localDate();
    $("dashboardDate").addEventListener("change", renderToday);
    $("otherActions").addEventListener("click", (e) => {
      const b = e.target.closest("[data-other-add]");
      if (!b) return;
      const a = actionById(b.dataset.otherAdd);
      if (!a) return;
      const date = getSelectedDate();
      const existing = sessionForAction(a.id, date);
      if (existing) {
        if (existing.dismissed) {
          existing.dismissed = false;
          persist();
          renderAll();
          notify("Session আবার আজকের তালিকায় যোগ হয়েছে।");
        } else
          notify(
            "এই Action-এর session আজকের তালিকায় আছেই — duplicate তৈরি হবে না।",
          );
        return;
      }
      state.tasks.push({
        id: uid("task"),
        actionId: a.id,
        categoryId: a.categoryId,
        name: a.name,
        date,
        plannedMinutes: Number(a.dailyTarget) || 0,
        tag: "",
        note: "",
        status: "todo",
        source: "manual",
        dismissed: false,
        createdAt: nowISO(),
      });
      persist();
      renderAll();
      notify("আজকের Sessions-এ যোগ হয়েছে (শুধু এই তারিখের জন্য)।");
    });
    $("todayTasks").addEventListener("change", (e) => {
      const id = e.target.dataset.taskDone;
      if (!id) return;
      const t = taskById(id);
      if (t) {
        t.status = e.target.checked ? "done" : "todo";
        t.completedAt = e.target.checked ? nowISO() : null;
        persist();
        renderAll();
      }
    });
    $("todayTasks").addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.taskTrack) {
        const t = taskById(b.dataset.taskTrack);
        if (t) startTracking(t.actionId);
      }
      if (b.dataset.taskEdit) {
        openSessionModal(b.dataset.taskEdit);
      }
      if (b.dataset.taskRemove) {
        const t = taskById(b.dataset.taskRemove);
        if (!t) return;
        if (
          confirm(
            `"${t.name}"-কে আজকের Sessions থেকে সরাবে? এতে Original Action, তার schedule বা অন্য তারিখের session কোনোটিই বদলাবে না। Time Logs থাকবে।`,
          )
        ) {
          if (t.source === "schedule") {
            t.dismissed = true;
          } else {
            state.tasks = state.tasks.filter((x) => x.id !== t.id);
          }
          persist();
          renderAll();
        }
      }
    });
    $("modalCancel").addEventListener("click", closeModal);
    $("modalOverlay").addEventListener("click", (e) => {
      if (e.target === $("modalOverlay")) closeModal();
    });
    $("modalSave").addEventListener("click", () => {
      const t = taskById(editingTaskId);
      if (!t) {
        closeModal();
        return;
      }
      const name = $("sessName").value.trim();
      if (!name) {
        notify("Session name দরকার।");
        return;
      }
      t.name = name;
      t.plannedMinutes = hmToMinutes($("sessHours").value, $("sessMins").value);
      t.tag = $("sessTag").value.trim();
      t.note = $("sessNote").value.trim();
      persist();
      closeModal();
      renderAll();
      notify("Session সেভ হয়েছে — শুধু এই তারিখের session পরিবর্তিত হয়েছে।");
    });
    $("logEditCancel").addEventListener("click", closeLogEditModal);
    $("logEditOverlay").addEventListener("click", (e) => {
      if (e.target === $("logEditOverlay")) closeLogEditModal();
    });

    $("logEditSave").addEventListener("click", () => {
      const l = state.logs.find((x) => x.id === editingLogId);
      if (!l) {
        closeLogEditModal();
        return;
      }

      const date = $("logEditDate").value;
      const actionId = $("logEditAction").value || null;
      const hours = Math.max(0, Number($("logEditHours").value) || 0);
      const mins = Math.min(
        59,
        Math.max(0, Number($("logEditMins").value) || 0),
      );
      const totalMinutes = hours * 60 + mins;
      const note = $("logEditNote").value.trim();

      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        notify("তারিখ সঠিক নয়।");
        return;
      }
      if (totalMinutes < 1) {
        notify("কমপক্ষে ১ মিনিট সময় দাও।");
        return;
      }

      // Update the log entry
      l.date = date;
      l.actionId = actionId;
      l.categoryId = actionId ? actionById(actionId)?.categoryId || null : null;
      l.durationSeconds = totalMinutes * 60;
      l.note = note;

      // Once edited, always treat as manual duration
      if (l.kind === "tracked") {
        l.kind = "manual";
        l.startAt = null;
        l.endAt = null;
      }
      l.updatedAt = nowISO();

      persist();
      closeLogEditModal();
      renderAll();
      notify("Time Log আপডেট হয়েছে।");
    });
    $("startTrackingBtn").addEventListener("click", () =>
      startTracking($("startTrackingAction").value),
    );
    $("stopTrackingBtn").addEventListener("click", stopTracking);
    $("pauseTrackingBtn").addEventListener("click", toggleTrackingPause);
    $("trackingStart").addEventListener("click", () =>
      startTracking($("trackingAction").value),
    );
    $("trackingStop").addEventListener("click", stopTracking);
    $("trackingPause").addEventListener("click", toggleTrackingPause);
    $("actionForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const id = $("actionEditId").value;
      const name = $("actionName").value.trim(),
        categoryId = $("actionCategory").value;
      if (!name || !categoryId) {
        notify("Action name ও Category দরকার।");
        return;
      }
      const item = {
        id: id || uid("action"),
        name,
        categoryId,
        dailyTarget: hmToMinutes($("dailyHours").value, $("dailyMins").value),
        weeklyTarget: hmToMinutes(
          $("weeklyHours").value,
          $("weeklyMins").value,
        ),
        schedule: {
          type: $("scheduleType").value,
          days: [
            ...document.querySelectorAll(".schedule-days input:checked"),
          ].map((x) => Number(x.value)),
        },
        importance: $("actionImportance").value,
        emoji: $("actionEmoji").value.trim(),
        description: $("actionDescription").value.trim(),
        archived: false,
        updatedAt: nowISO(),
      };
      if (id) {
        const i = state.actions.findIndex((a) => a.id === id);
        if (i >= 0) state.actions[i] = { ...state.actions[i], ...item };
      } else
        state.actions.push({
          ...item,
          order: state.actions.length,
          createdAt: nowISO(),
        });
      persist();
      resetActionForm();
      renderAll();
      notify("Action সেভ হয়েছে।");
    });
    $("cancelActionEdit").addEventListener("click", resetActionForm);
    $("categoryForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const name = $("categoryName").value.trim();
      if (!name) return;
      state.categories.push({
        id: uid("cat"),
        name,
        importance: Number($("categoryImportance").value) || 3,
        archived: false,
      });
      $("categoryForm").reset();
      persist();
      renderAll();
      notify("Category যোগ হয়েছে।");
    });
    $("actionList").addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      const parentMenu = b.closest("details.more-menu");
      if (parentMenu) parentMenu.removeAttribute("open");
      if (b.dataset.actionTrack) startTracking(b.dataset.actionTrack);
      if (b.dataset.actionUp || b.dataset.actionDown) {
        const id = b.dataset.actionUp || b.dataset.actionDown;
        const arr = activeActions();
        const i = arr.findIndex((a) => a.id === id),
          j = i + (b.dataset.actionUp ? -1 : 1);
        if (i >= 0 && j >= 0 && j < arr.length) {
          const x = arr[i],
            y = arr[j],
            tmp = x.order;
          x.order = y.order;
          y.order = tmp;
          persist();
          renderAll();
        }
      }
      if (b.dataset.actionEdit) {
        const a = actionById(b.dataset.actionEdit);
        if (!a) return;
        $("actionEditId").value = a.id;
        $("actionFormTitle").textContent = "Action Edit";
        $("actionName").value = a.name;
        $("actionEmoji").value = a.emoji || "";
        $("actionCategory").value = a.categoryId;
        $("dailyHours").value = Math.floor((Number(a.dailyTarget) || 0) / 60);
        $("dailyMins").value = (Number(a.dailyTarget) || 0) % 60;
        $("weeklyHours").value = Math.floor((Number(a.weeklyTarget) || 0) / 60);
        $("weeklyMins").value = (Number(a.weeklyTarget) || 0) % 60;
        $("scheduleType").value = a.schedule?.type || "none";
        document
          .querySelectorAll(".schedule-days input")
          .forEach(
            (x) =>
              (x.checked = (a.schedule?.days || []).includes(Number(x.value))),
          );
        $("scheduleDaysWrap").classList.toggle(
          "hidden",
          !["weekdays", "weekly"].includes($("scheduleType").value),
        );
        $("actionImportance").value = a.importance;
        $("actionDescription").value = a.description || "";
        switchPage("actions");
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      if (b.dataset.actionArchive) {
        const a = actionById(b.dataset.actionArchive);
        if (!a) return;
        if (confirm(`"${a.name}" archive করবে? পুরোনো log থাকবে।`)) {
          a.archived = true;
          if (state.tracking.activeActionId === a.id) stopTracking();
          persist();
          renderAll();
        }
      }
    });
    $("categoryList").addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      const c = catById(b.dataset.categoryEdit || b.dataset.categoryArchive);
      if (!c) return;
      if (b.dataset.categoryEdit) {
        const n = prompt("Category name:", c.name);
        if (n && n.trim()) c.name = n.trim();
        const rank = prompt("Importance rank (1 = highest):", c.importance);
        if (rank && Number(rank) >= 1 && Number(rank) <= 6)
          c.importance = Number(rank);
        persist();
        renderAll();
      }
      if (b.dataset.categoryArchive) {
        if (state.actions.some((a) => a.categoryId === c.id && !a.archived)) {
          alert(
            "এই Category-তে Active Action আছে। আগে সেগুলো অন্য Category-তে সরাও বা Archive করো।",
          );
          return;
        }
        if (confirm("Category archive করবে?")) {
          c.archived = true;
          persist();
          renderAll();
        }
      }
    });
    $("addPhase").addEventListener("click", () => addPhaseRow("Phase", 10));
    $("resetPresetForm").addEventListener("click", resetPresetForm);
    $("presetForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const id = $("presetEditId").value;
      const phases = collectPhases();
      if (!phases.length) {
        notify("কমপক্ষে একটি পর্যায় দরকার।");
        return;
      }
      const p = {
        id: id || uid("preset"),
        name: $("presetName").value.trim(),
        actionId: $("presetAction").value || null,
        countUp: $("presetCountup").checked,
        alert: $("presetAlert").checked,
        phases,
        updatedAt: nowISO(),
      };
      if (!p.name) {
        notify("Session name লিখো।");
        return;
      }
      if (id) {
        const i = state.presets.findIndex((x) => x.id === id);
        if (i >= 0) state.presets[i] = { ...state.presets[i], ...p };
      } else state.presets.push({ ...p, createdAt: nowISO() });
      persist();
      renderSelects();
      $("focusPreset").value = p.id;
      notify("Focus Session সেভ হয়েছে।");
      resetPresetForm();
      renderAll();
    });
    $("loadPreset").addEventListener("click", () => {
      const p = presetById($("focusPreset").value);
      if (!p) {
        notify("একটি Saved Session বেছে নাও।");
        return;
      }
      $("presetEditId").value = p.id;
      $("presetFormTitle").textContent = "Focus Session Edit";
      $("presetName").value = p.name;
      $("presetAction").value = p.actionId || "";
      $("presetCountup").checked = p.countUp !== false;
      $("presetAlert").checked = p.alert !== false;
      $("phaseEditor").innerHTML = "";
      p.phases.forEach((ph) => addPhaseRow(ph.name, ph.minutes));
      [...document.querySelectorAll("#phaseEditor .phase-row")].forEach(
        (r, i) =>
          (r.querySelector(".phase-countup").checked =
            p.phases[i].countUp !== false),
      );
    });
    $("startPreset").addEventListener("click", () =>
      startFocus($("focusPreset").value, $("focusMode").value),
    );
    /* ---------- Focus Mode: prev phase ---------- */
    $("focusPrev").addEventListener("click", prevPhase);

    /* ---------- Focus Mode: Start handler ---------- */
    $("focusStart").addEventListener("click", () => {
      const pid = state.focus.presetId || $("focusPreset").value;
      if (!pid) {
        notify("আগে একটি session তৈরি বা নির্বাচন করো।");
        return;
      }
      if (state.focus.running || state.focus.paused) {
        notify("আগের Focus Session আগে Stop করো।");
        return;
      }
      startFocus(pid, "timer");
    });
    $("deletePreset").addEventListener("click", () => {
      const id = $("focusPreset").value;
      if (!id) return;
      if (
        state.focus.presetId === id &&
        (state.focus.running || state.focus.paused)
      ) {
        alert("চলমান Session আগে Stop করো।");
        return;
      }
      if (confirm("এই Saved Session মুছে ফেলবে?")) {
        state.presets = state.presets.filter((p) => p.id !== id);
        if (state.focus.presetId === id) state.focus = { ...seed().focus };
        persist();
        renderAll();
      }
    });
    $("focusPause").addEventListener("click", pauseFocus);
    $("pauseFocusBtn").addEventListener("click", pauseFocus);
    $("focusStop").addEventListener("click", stopFocus);
    $("focusNext").addEventListener("click", nextPhase);
    $("focusPiPBtn").addEventListener("click", openFocusPiP);
    $("manualForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const actionId = $("manualAction").value || null,
        minutes = hmToMinutes($("manualHours").value, $("manualMins").value),
        date = $("manualDate").value;
      if (!date || minutes < 1) {
        notify("তারিখ ও সঠিক duration দাও (কমপক্ষে ১ মিনিট)।");
        return;
      }
      addLog({
        actionId,
        date,
        durationSeconds: minutes * 60,
        note: $("manualNote").value.trim(),
        kind: "manual",
      });
      persist();
      $("manualHours").value = 0;
      $("manualMins").value = 30;
      $("manualNote").value = "";
      renderAll();
      notify("Manual Time Entry সেভ হয়েছে।");
    });
    $("logFilterDate").addEventListener("change", renderLogs);
    $("logFilterAction").addEventListener("change", renderLogs);
    $("clearLogFilters").addEventListener("click", () => {
      $("logFilterDate").value = "";
      $("logFilterAction").value = "";
      renderLogs();
    });
    $("logTable").addEventListener("click", (e) => {
      const edit = e.target.closest("[data-log-edit]");
      if (edit) {
        openLogEditModal(edit.dataset.logEdit);
        return;
      }
      const b = e.target.closest("[data-log-delete]");
      if (!b) return;
      if (confirm("এই Time Log মুছে ফেলবে?")) {
        state.logs = state.logs.filter((l) => l.id !== b.dataset.logDelete);
        persist();
        renderAll();
      }
    });
    $("clearLogs").addEventListener("click", () => {
      if (confirm("সব Time Log মুছে ফেলবে? এটি undo করা যাবে না।")) {
        state.logs = [];
        persist();
        renderAll();
      }
    });
    $("reviewActionTable").addEventListener("change", (e) => {
      const el = e.target;
      const actionId = el.dataset.actionId;
      if (!actionId) return;
      const a = actionById(actionId);
      if (!a) return;
      const row = el.closest("tr");
      if (!row) return;

      let h = Math.max(
        0,
        Number(row.querySelector(".review-target-hours").value) || 0,
      );
      let m = Math.min(
        59,
        Math.max(
          0,
          Number(row.querySelector(".review-target-mins").value) || 0,
        ),
      );
      row.querySelector(".review-target-hours").value = h;
      row.querySelector(".review-target-mins").value = m;

      a.weeklyTarget = h * 60 + m;
      a.updatedAt = nowISO();
      persist();

      // in-place update of this row's progress
      const start = lastReviewStart;
      const end = addDays(start, 6);
      const sec = state.logs
        .filter((l) => l.actionId === a.id && l.date >= start && l.date <= end)
        .reduce((s, l) => s + l.durationSeconds, 0);
      const pct = a.weeklyTarget
        ? Math.round((sec / 60 / a.weeklyTarget) * 100)
        : 0;
      const bar = row.querySelector(".progress > span");
      if (bar) bar.style.width = Math.min(100, pct) + "%";
      const pctEl = row.querySelector(".review-pct");
      if (pctEl) pctEl.textContent = pct + "%";

      // update the "Weekly Action Target" metric card
      updateReviewTargetDisplay();

      notify("Weekly target আপডেট হয়েছে।");
    });
    $("reviewPrev").addEventListener("click", () => {
      reviewOffset--;
      renderReview();
    });
    $("reviewNext").addEventListener("click", () => {
      reviewOffset++;
      renderReview();
    });
    $("reviewCurrent").addEventListener("click", () => {
      reviewOffset = 0;
      renderReview();
    });
    $("saveReview").addEventListener("click", () => {
      const start =
        lastReviewStart || weekStartDate(localDate(), state.settings.weekStart);
      state.reviews[start] = {
        good: $("reviewGood").value,
        change: $("reviewChange").value,
        updatedAt: nowISO(),
      };
      persist();
      notify("Weekly Review notes সেভ হয়েছে।");
    });
    /* ---------- Focus Mode: session selector bar ---------- */
    $("newFocusSession").addEventListener("click", createNewFocusSession);
    $("deleteFocusSession").addEventListener("click", deleteFocusSession);

    /* ---------- Focus Mode: session name auto-save ---------- */
    $("dashboardFocusName").addEventListener("input", syncFocusNameToPreset);
    $("dashboardFocusName").addEventListener("blur", () => {
      const raw = $("dashboardFocusName").value.trim();
      if (!raw) {
        $("dashboardFocusName").value = "Untitled session";
        syncFocusNameToPreset();
      }
    });

    /* ---------- Focus Mode: phase editor auto-save ---------- */
    $("dashboardPhaseEditor").addEventListener(
      "input",
      syncPhaseEditorToPreset,
    );
    $("dashboardPhaseEditor").addEventListener(
      "change",
      syncPhaseEditorToPreset,
    );

    /* ---------- Focus Mode: add Focus / Break phase ---------- */
    $("addFocusPhase").addEventListener("click", () => addFocusPhase("focus"));
    $("addBreakPhase").addEventListener("click", () => addFocusPhase("break"));

    /* ---------- Focus Mode: auto-track toggle ---------- */
    $("focusLinkTracking")?.addEventListener("change", (e) => {
      const p = presetById(state.focus.presetId || editingPresetId);
      if (!p) return;
      p.linkTracking = e.target.checked;
      p.updatedAt = nowISO();
      persist();
      if (state.focus.running || state.focus.paused) {
        if (p.linkTracking) focusApplyTracking("toggle-on");
        else focusStopTracking();
        renderAll();
      }
      notify(
        e.target.checked
          ? "✓ Auto-track চালু — phase-এর Action অনুযায়ী tracking হবে।"
          : "Auto-track বন্ধ।",
      );
    });

    /* ---------- Focus Mode: dropdown change ---------- */
    $("focusPreset").addEventListener("change", () => {
      const id = $("focusPreset").value;
      if (!id) {
        loadFocusSession(null);
        persist();
        return;
      }
      loadFocusSession(id);
      persist();
    });

    /* ---------- Focus Mode: prev phase ---------- */
    $("focusPrev").addEventListener("click", prevPhase);

    /* ---------- Focus Mode: updated Start handler ---------- */
    $("focusStart").addEventListener("click", () => {
      const pid = state.focus.presetId || $("focusPreset").value;
      if (!pid) {
        notify("আগে একটি session তৈরি বা নির্বাচন করো।");
        return;
      }
      if (state.focus.running || state.focus.paused) {
        notify("আগের Focus Session আগে Stop করো।");
        return;
      }
      startFocus(pid, "timer");
    });
    $("weekStart").value = String(state.settings.weekStart);
    $("saveSettings").addEventListener("click", () => {
      state.settings.weekStart = Number($("weekStart").value);
      persist();
      renderAll();
      notify("Settings সেভ হয়েছে।");
    });
    $("exportBtn").addEventListener("click", downloadBackup);
    $("settingsExport").addEventListener("click", downloadBackup);
    $("importBtn").addEventListener("click", () => $("importFile").click());
    $("settingsImport").addEventListener("click", () =>
      $("importFile").click(),
    );
    $("importFile").addEventListener("change", (e) => {
      if (e.target.files[0]) importBackup(e.target.files[0]);
      e.target.value = "";
    });
    $("resetApp").addEventListener("click", () => {
      if (
        confirm(
          "সতর্কতা: সব Life OS ডেটা স্থায়ীভাবে মুছে যাবে। তুমি কি আগে JSON Export করেছ?",
        )
      ) {
        if (confirm("শেষবার নিশ্চিত করো: সব ডেটা মুছে ফেলবে?")) {
          localStorage.removeItem(STORAGE_KEY);
          state = seed();
          persist();
          renderAll();
          notify("Life OS reset হয়েছে।");
        }
      }
    });
    // ============ REMINDERS ============
    $("reminderScheduleType").addEventListener("change", () => {
      const v = $("reminderScheduleType").value;
      $("reminderWeeklyWrap").classList.toggle("hidden", v !== "weekly");
      $("reminderIntervalWrap").classList.toggle("hidden", v !== "interval");
      $("reminderOnceWrap").classList.toggle("hidden", v !== "once");
    });

    $("reminderForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const editId = $("reminderEditId").value;
      const name = $("reminderName").value.trim();
      if (!name) {
        notify("নাম দাও।");
        return;
      }
      const type = $("reminderScheduleType").value;
      let schedule;

      if (type === "weekly") {
        const days = [
          ...document.querySelectorAll(
            "#reminderWeeklyWrap .schedule-days input:checked",
          ),
        ].map((x) => Number(x.value));
        if (!days.length) {
          notify("কমপক্ষে একটি দিন বেছে নাও।");
          return;
        }
        schedule = { type: "weekly", days };
      } else if (type === "interval") {
        const weeks = Math.max(1, Number($("reminderWeeks").value) || 1);
        const day = Number($("reminderIntervalDay").value);
        const anchorDate = $("reminderAnchor").value || localDate();
        schedule = { type: "interval", weeks, day, anchorDate };
      } else if (type === "once") {
        const d = $("reminderOnceDate").value;
        if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) {
          notify("সঠিক তারিখ দাও।");
          return;
        }
        schedule = { type: "once", date: d };
      } else {
        notify("Schedule ধরন সঠিক নয়।");
        return;
      }

      const emoji = $("reminderEmoji").value.trim();

      if (editId) {
        updateReminder(editId, { name, emoji, schedule });
        notify("Reminder আপডেট হয়েছে।");
      } else {
        const first = createReminder({ name, emoji, schedule });
        notify(`Reminder সেভ হয়েছে — প্রথম due: ${first}`);
      }
      resetReminderForm();
      renderAll();
    });

    $("cancelReminderEdit").addEventListener("click", resetReminderForm);

    // Today view-এ reminder checkbox
    $("todayReminders").addEventListener("change", (e) => {
      const id = e.target.dataset.reminderDone;
      if (!id) return;
      completeReminder(id);
      renderAll();
    });
    $("todayReminders").addEventListener("click", (e) => {
      const b = e.target.closest("[data-reminder-reschedule]");
      if (!b) return;
      const r = reminderById(b.dataset.reminderReschedule);
      if (!r) return;
      openReminderRescheduleModal(r.id);
    });

    // Reminders page-এর list
    $("reminderList").addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      const id =
        b.dataset.reminderEdit ||
        b.dataset.reminderArchive ||
        b.dataset.reminderReschedule;
      if (!id) return;
      const r = reminderById(id);
      if (!r) return;

      if (b.dataset.reminderReschedule) {
        openReminderRescheduleModal(r.id);
        return;
      }

      if (b.dataset.reminderEdit) {
        $("reminderEditId").value = r.id;
        $("reminderFormTitle").textContent = "Reminder Edit";
        $("reminderName").value = r.name;
        $("reminderEmoji").value = r.emoji || "";

        if (r.schedule.type === "weekly") {
          $("reminderScheduleType").value = "weekly";
          $("reminderWeeklyWrap").classList.remove("hidden");
          $("reminderIntervalWrap").classList.add("hidden");
          $("reminderOnceWrap").classList.add("hidden");
          document
            .querySelectorAll("#reminderWeeklyWrap .schedule-days input")
            .forEach(
              (x) =>
                (x.checked = (r.schedule.days || []).includes(Number(x.value))),
            );
        } else if (r.schedule.type === "interval") {
          $("reminderScheduleType").value = "interval";
          $("reminderWeeklyWrap").classList.add("hidden");
          $("reminderIntervalWrap").classList.remove("hidden");
          $("reminderOnceWrap").classList.add("hidden");
          $("reminderWeeks").value = r.schedule.weeks || 2;
          $("reminderIntervalDay").value = String(r.schedule.day ?? 2);
          $("reminderAnchor").value = r.schedule.anchorDate || localDate();
        } else if (r.schedule.type === "once") {
          $("reminderScheduleType").value = "once";
          $("reminderWeeklyWrap").classList.add("hidden");
          $("reminderIntervalWrap").classList.add("hidden");
          $("reminderOnceWrap").classList.remove("hidden");
          $("reminderOnceDate").value = r.schedule.date || localDate();
        }

        window.scrollTo({ top: 0, behavior: "smooth" });
      }

      if (b.dataset.reminderArchive) {
        if (confirm(`"${r.name}" archive করবে?`)) {
          archiveReminder(r.id);
          renderAll();
        }
      }
    });
    $("themeToggle").addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme");
      applyTheme(current === "dark" ? "light" : "dark");
    });

    $("settingsThemeToggle").addEventListener("change", (e) => {
      applyTheme(e.target.checked ? "dark" : "light");
      notify(
        e.target.checked
          ? "🌙 Dark mode চালু হয়েছে।"
          : "☀️ Light mode চালু হয়েছে।",
      );
    });
    /* ---------- Global keyboard shortcuts ---------- */
    document.addEventListener("keydown", (e) => {
      const tag = (e.target.tagName || "").toLowerCase();
      const typing =
        ["input", "textarea", "select"].includes(tag) ||
        e.target.isContentEditable;
      const key = e.key.toLowerCase();
      const focusedId = e.target.id || "";

      // --- Ctrl / Cmd combos (work even while typing) ---
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "Enter") {
          const nodeModal = $("lifeMapNodeModal");
          if (nodeModal && !nodeModal.classList.contains("hidden")) {
            e.preventDefault();
            $("lifeMapSaveNode")?.click();
          }
        }
        return;
      }

      // --- Enter handling (BEFORE typing-guard so it works on selects) ---
      //   1. Any field inside the Life Map node modal → save
      //      (except textarea, where Enter adds a newline; use Ctrl+Enter)
      //   2. FAB dropdown → start selected action and close panel
      if (e.key === "Enter") {
        const modal = $("lifeMapNodeModal");
        const modalOpen = modal && !modal.classList.contains("hidden");
        if (modalOpen && tag !== "textarea") {
          e.preventDefault();
          $("lifeMapSaveNode")?.click();
          return;
        }
        if (focusedId === "trackingFabAction") {
          e.preventDefault();
          $("trackingFabStart")?.click();
          closeTrackingFabPanel();
          return;
        }
      }

      // --- T: toggle tracking FAB panel. Works even when the FAB
      //     dropdown itself is focused, so the native <select> never
      //     hijacks T to jump to T-named options. ---
      if (key === "t") {
        e.preventDefault();
        const panel = $("trackingFabPanel");
        const isOpen = panel && !panel.classList.contains("hidden");
        if (isOpen) {
          closeTrackingFabPanel();
        } else {
          openTrackingFabPanel();
          setTimeout(() => $("trackingFabAction")?.focus(), 80);
        }
        return;
      }

      // --- Skip remaining shortcuts if user is typing ---
      if (typing) return;

      const activePage = document.querySelector(".page.active")?.id || "";
      const onFocusPage = activePage === "page-focus";

      // --- P: pause/resume (Focus page takes priority) ---
      if (key === "p") {
        e.preventDefault();
        if (onFocusPage && (state.focus.running || state.focus.paused)) {
          pauseFocus();
        } else if (state.tracking.activeActionId) {
          toggleTrackingPause();
        }
        return;
      }

      // --- S: stop/start (Focus page takes priority) ---
      if (key === "s") {
        e.preventDefault();
        if (onFocusPage) {
          if (state.focus.running || state.focus.paused) stopFocus();
          else if (state.focus.presetId) startFocus(state.focus.presetId);
        } else if (state.tracking.activeActionId) {
          stopTracking();
        }
        return;
      }

      // --- Focus page: arrow keys for phase navigation ---
      if (onFocusPage && (state.focus.running || state.focus.paused)) {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          prevPhase();
          return;
        }
        if (e.key === "ArrowRight") {
          e.preventDefault();
          nextPhase();
          return;
        }
      }

      // --- Space: focus start/pause (existing) ---
      if (e.key === " ") {
        e.preventDefault();
        if (state.focus.running || state.focus.paused) pauseFocus();
        else if (state.focus.presetId)
          startFocus(state.focus.presetId, "timer");
        return;
      }

      // --- R: focus resume (existing) ---
      if (key === "r" && state.focus.paused) {
        e.preventDefault();
        pauseFocus();
        return;
      }

      // --- Esc / help (existing) ---
      if (e.key === "Escape") {
        closeModal();
        closeLogEditModal();
        $("focusAlert")?.classList.add("hidden");
        $("toast")?.classList.add("hidden");
        closeTrackingFabPanel();
      } else if (e.key === "?") {
        notify(
          "Shortcuts: T Tracking · P Pause · S Start/Stop · Space Start/Pause · ←→ Phase · Esc dismiss",
        );
      }
    });

    /* ---------- Three-dot dropdown menu behavior ---------- */
    // Ensures only one action menu is open at a time, closes on
    // outside click, and closes on Escape — matching standard
    // dropdown UX across the app.
    document.addEventListener("click", (e) => {
      const insideMenu = e.target.closest("details.more-menu");
      if (!insideMenu) {
        document
          .querySelectorAll("details.more-menu[open]")
          .forEach((d) => d.removeAttribute("open"));
        return;
      }
      const summary = e.target.closest("summary");
      if (summary && summary.parentElement === insideMenu) {
        document.querySelectorAll("details.more-menu[open]").forEach((d) => {
          if (d !== insideMenu) d.removeAttribute("open");
        });
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      document
        .querySelectorAll("details.more-menu[open]")
        .forEach((d) => d.removeAttribute("open"));
    });
  }

  // ============================================================
  // LIFE MAP — PART 2: UI EVENTS AND INTERACTIONS
  // ============================================================

  /* ============================================================
     MULTI-SELECT: parent-এর সব descendant সংগ্রহ
     ============================================================ */
  function lifeMapCollectDescendants(rootId) {
    const data = lifeMapData();
    // Build the parent→children map from the connections array, which
    // is now the single source of truth for hierarchy. Using parentId
    // here would miss duplicate-created nodes whose parentId is null.
    const byParent = new Map();
    data.connections.forEach((c) => {
      if (c.relation !== "parent") return;
      if (!byParent.has(c.sourceId)) byParent.set(c.sourceId, []);
      byParent.get(c.sourceId).push(c.targetId);
    });
    const result = new Set();
    const stack = [rootId];
    while (stack.length) {
      const id = stack.pop();
      if (result.has(id)) continue;
      result.add(id);
      (byParent.get(id) || []).forEach((c) => stack.push(c));
    }
    return result;
  }

  /* ============================================================
     RUBBER BAND: rectangle drawing + node intersection
     ============================================================ */
  function lifeMapDrawRubberBand() {
    if (!lifeMapRubberBand) return;
    const canvas = $("lifeMapCanvas");
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x1 = Math.min(
      lifeMapRubberBand.startScreenX,
      lifeMapRubberBand.currentScreenX,
    );
    const y1 = Math.min(
      lifeMapRubberBand.startScreenY,
      lifeMapRubberBand.currentScreenY,
    );
    const x2 = Math.max(
      lifeMapRubberBand.startScreenX,
      lifeMapRubberBand.currentScreenX,
    );
    const y2 = Math.max(
      lifeMapRubberBand.startScreenY,
      lifeMapRubberBand.currentScreenY,
    );
    const left = x1 - rect.left;
    const top = y1 - rect.top;
    const width = x2 - x1;
    const height = y2 - y1;

    if (!lifeMapRubberBandEl) {
      lifeMapRubberBandEl = document.createElement("div");
      lifeMapRubberBandEl.className = "lifemap-rubber-band";
      canvas.appendChild(lifeMapRubberBandEl);
    }
    lifeMapRubberBandEl.style.left = left + "px";
    lifeMapRubberBandEl.style.top = top + "px";
    lifeMapRubberBandEl.style.width = width + "px";
    lifeMapRubberBandEl.style.height = height + "px";
  }

  function lifeMapRemoveRubberBandEl() {
    if (lifeMapRubberBandEl && lifeMapRubberBandEl.parentNode) {
      lifeMapRubberBandEl.parentNode.removeChild(lifeMapRubberBandEl);
    }
    lifeMapRubberBandEl = null;
  }

  function lifeMapUpdateRubberBandSelection() {
    if (!lifeMapRubberBand) return;
    const canvas = $("lifeMapCanvas");
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();

    const x1 = Math.min(
      lifeMapRubberBand.startScreenX,
      lifeMapRubberBand.currentScreenX,
    );
    const y1 = Math.min(
      lifeMapRubberBand.startScreenY,
      lifeMapRubberBand.currentScreenY,
    );
    const x2 = Math.max(
      lifeMapRubberBand.startScreenX,
      lifeMapRubberBand.currentScreenX,
    );
    const y2 = Math.max(
      lifeMapRubberBand.startScreenY,
      lifeMapRubberBand.currentScreenY,
    );

    const worldLeft = (x1 - rect.left - lifeMapPanX) / lifeMapZoom;
    const worldTop = (y1 - rect.top - lifeMapPanY) / lifeMapZoom;
    const worldRight = (x2 - rect.left - lifeMapPanX) / lifeMapZoom;
    const worldBottom = (y2 - rect.top - lifeMapPanY) / lifeMapZoom;

    const rects = lifeMapNodeRects();
    const newSelection = new Set();
    lifeMapData().nodes.forEach((n) => {
      const r = rects.get(n.id);
      if (!r) return;
      const nRight = r.x + r.w;
      const nBottom = r.y + r.h;
      if (
        nRight >= worldLeft &&
        r.x <= worldRight &&
        nBottom >= worldTop &&
        r.y <= worldBottom
      ) {
        newSelection.add(n.id);
      }
    });
    lifeMapSelectedIds = newSelection;
    lifeMapSelectedId = newSelection.size === 1 ? [...newSelection][0] : null;
    lifeMapRenderNodeSelection();
  }

  /* ============================================================
     RUBBER BAND: rectangle drawing + node intersection
     ============================================================ */
  function lifeMapDrawRubberBand() {
    if (!lifeMapRubberBand) return;
    const canvas = $("lifeMapCanvas");
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x1 = Math.min(
      lifeMapRubberBand.startScreenX,
      lifeMapRubberBand.currentScreenX,
    );
    const y1 = Math.min(
      lifeMapRubberBand.startScreenY,
      lifeMapRubberBand.currentScreenY,
    );
    const x2 = Math.max(
      lifeMapRubberBand.startScreenX,
      lifeMapRubberBand.currentScreenX,
    );
    const y2 = Math.max(
      lifeMapRubberBand.startScreenY,
      lifeMapRubberBand.currentScreenY,
    );
    const left = x1 - rect.left;
    const top = y1 - rect.top;
    const width = x2 - x1;
    const height = y2 - y1;

    if (!lifeMapRubberBandEl) {
      lifeMapRubberBandEl = document.createElement("div");
      lifeMapRubberBandEl.className = "lifemap-rubber-band";
      canvas.appendChild(lifeMapRubberBandEl);
    }
    lifeMapRubberBandEl.style.left = left + "px";
    lifeMapRubberBandEl.style.top = top + "px";
    lifeMapRubberBandEl.style.width = width + "px";
    lifeMapRubberBandEl.style.height = height + "px";
  }

  function lifeMapRemoveRubberBandEl() {
    if (lifeMapRubberBandEl && lifeMapRubberBandEl.parentNode) {
      lifeMapRubberBandEl.parentNode.removeChild(lifeMapRubberBandEl);
    }
    lifeMapRubberBandEl = null;
  }

  function lifeMapUpdateRubberBandSelection() {
    if (!lifeMapRubberBand) return;
    const canvas = $("lifeMapCanvas");
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();

    const x1 = Math.min(
      lifeMapRubberBand.startScreenX,
      lifeMapRubberBand.currentScreenX,
    );
    const y1 = Math.min(
      lifeMapRubberBand.startScreenY,
      lifeMapRubberBand.currentScreenY,
    );
    const x2 = Math.max(
      lifeMapRubberBand.startScreenX,
      lifeMapRubberBand.currentScreenX,
    );
    const y2 = Math.max(
      lifeMapRubberBand.startScreenY,
      lifeMapRubberBand.currentScreenY,
    );

    const worldLeft = (x1 - rect.left - lifeMapPanX) / lifeMapZoom;
    const worldTop = (y1 - rect.top - lifeMapPanY) / lifeMapZoom;
    const worldRight = (x2 - rect.left - lifeMapPanX) / lifeMapZoom;
    const worldBottom = (y2 - rect.top - lifeMapPanY) / lifeMapZoom;

    const rects = lifeMapNodeRects();
    const newSelection = new Set();
    lifeMapData().nodes.forEach((n) => {
      const r = rects.get(n.id);
      if (!r) return;
      const nRight = r.x + r.w;
      const nBottom = r.y + r.h;
      if (
        nRight >= worldLeft &&
        r.x <= worldRight &&
        nBottom >= worldTop &&
        r.y <= worldBottom
      ) {
        newSelection.add(n.id);
      }
    });
    lifeMapSelectedIds = newSelection;
    lifeMapSelectedId = newSelection.size === 1 ? [...newSelection][0] : null;
    lifeMapRenderNodeSelection();
  }

  function lifeMapSelectNode(id, additive = false) {
    if (additive) {
      if (lifeMapSelectedIds.has(id)) lifeMapSelectedIds.delete(id);
      else lifeMapSelectedIds.add(id);
      lifeMapSelectedId = lifeMapSelectedIds.has(id)
        ? id
        : lifeMapSelectedIds.values().next().value || null;
    } else {
      lifeMapSelectedIds.clear();
      lifeMapSelectedIds.add(id);
      lifeMapSelectedId = id;
    }
    lifeMapRenderNodeSelection();
  }

  function lifeMapStartNewNode(type = "goal") {
    const data = lifeMapData();
    let x = 120,
      y = 120;
    if (data.nodes.length) {
      const maxX = Math.max(...data.nodes.map((n) => n.x));
      const minY = Math.min(...data.nodes.map((n) => n.y));
      x = maxX + 260;
      y = Math.max(40, minY);
    }
    const node = lifeMapCreateNode({
      name: "New " + lifeMapTypeLabel(type),
      type,
      x,
      y,
    });
    lifeMapSelectedIds.clear();
    lifeMapSelectedIds.add(node.id);
    lifeMapSelectedId = node.id;
    lifeMapAdditiveMode = false;

    renderLifeMap();
    notify("New Node তৈরি হয়েছে — Inspector থেকে Edit করো।");
  }

  /* ---------- Life Map filter state ---------- */
  let lifeMapFilterTypes = new Set();
  let lifeMapFilterStatuses = new Set();
  let lifeMapFilterMode = "and";
  const LIFEMAP_ALL_STATUSES = [
    "not-started",
    "in-progress",
    "done",
    "active",
    "resolved",
    "observed",
    "tested",
    "achieved",
  ];

  function lifeMapRenderFilterPopover() {
    const typesHost = $("lifeMapFilterTypes");
    const statusesHost = $("lifeMapFilterStatuses");
    if (!typesHost || !statusesHost) return;

    typesHost.innerHTML = Object.entries(LIFE_MAP_TYPES)
      .map(([key, def]) => {
        const on = lifeMapFilterTypes.has(key);
        return `<label class="lifemap-filter-item${on ? " selected" : ""}">
          <input type="checkbox" value="${escapeHTML(key)}" data-filter-type${on ? " checked" : ""}>
          <span class="lifemap-filter-item-icon">${escapeHTML(def.icon)}</span>
          <span class="lifemap-filter-item-label">${escapeHTML(def.label)}</span>
        </label>`;
      })
      .join("");

    statusesHost.innerHTML = LIFEMAP_ALL_STATUSES.map((key) => {
      const on = lifeMapFilterStatuses.has(key);
      return `<label class="lifemap-filter-item${on ? " selected" : ""}">
        <input type="checkbox" value="${escapeHTML(key)}" data-filter-status${on ? " checked" : ""}>
        <span class="lifemap-filter-item-label">${escapeHTML(lifeMapStatusLabel(key))}</span>
      </label>`;
    }).join("");

    const badge = $("lifeMapFilterBadge");
    if (badge) {
      const total = lifeMapFilterTypes.size + lifeMapFilterStatuses.size;
      if (total > 0) {
        badge.textContent = String(total);
        badge.classList.remove("hidden");
      } else {
        badge.textContent = "0";
        badge.classList.add("hidden");
      }
    }

    const btn = $("lifeMapFilterBtn");
    if (btn) {
      const any = lifeMapFilterTypes.size > 0 || lifeMapFilterStatuses.size > 0;
      btn.classList.toggle("active", any);
    }

    document
      .querySelectorAll("#lifeMapFilterPopover [data-filter-mode]")
      .forEach((b) => {
        b.setAttribute(
          "aria-pressed",
          String(b.dataset.filterMode === lifeMapFilterMode),
        );
      });
  }

  function lifeMapMatchesFilter(node) {
    if (!node) return false;

    const query = ($("lifeMapSearch")?.value || "").trim().toLowerCase();
    const hasType = lifeMapFilterTypes.size > 0;
    const hasStatus = lifeMapFilterStatuses.size > 0;
    const hasFilter = hasType || hasStatus;

    // 1) Name search — always AND-ed (independent of type/status mode)
    if (query) {
      const hay =
        `${node.name} ${node.description} ${lifeMapTypeLabel(node.type)}`.toLowerCase();
      if (!hay.includes(query)) return false;
    }

    // 2) No type/status filter — search alone decides
    if (!hasFilter) return true;

    const typeOk = !hasType || lifeMapFilterTypes.has(node.type);
    const statusOk = !hasStatus || lifeMapFilterStatuses.has(node.status);

    if (lifeMapFilterMode === "and") {
      return typeOk && statusOk;
    }
    // OR mode
    if (hasType && hasStatus) return typeOk || statusOk;
    if (hasType) return typeOk;
    if (hasStatus) return statusOk;
    return true;
  }

  function lifeMapApplyFilter() {
    const query = ($("lifeMapSearch")?.value || "").trim();
    const hasFilter =
      lifeMapFilterTypes.size > 0 || lifeMapFilterStatuses.size > 0 || !!query;

    let matchCount = 0;
    const totalCount = lifeMapData().nodes.length;

    document.querySelectorAll("[data-lm-node]").forEach((el) => {
      const node = lifeMapNodeById(el.dataset.lmNode);
      const matches = lifeMapMatchesFilter(node);
      if (matches) matchCount++;
      el.classList.toggle("search-dim", hasFilter && !matches);
      el.classList.toggle("search-match", hasFilter && matches);
    });

    const count = $("lifeMapNodeCount");
    if (count) {
      if (hasFilter) {
        count.textContent = `${matchCount} / ${totalCount} Nodes`;
      } else {
        count.textContent = `${totalCount} Node${totalCount === 1 ? "" : "s"}`;
      }
    }
  }

  function bindLifeMapFilterEvents() {
    const btn = $("lifeMapFilterBtn");
    const pop = $("lifeMapFilterPopover");
    if (!btn || !pop) return;

    const open = () => {
      pop.classList.remove("hidden");
      btn.setAttribute("aria-expanded", "true");
      // Position below the button, right-aligned
      const rect = btn.getBoundingClientRect();
      const pw = pop.offsetWidth;
      const ph = pop.offsetHeight;
      let left = rect.right - pw;
      let top = rect.bottom + 8;
      if (left < 8) left = 8;
      if (top + ph > window.innerHeight - 8) {
        top = Math.max(8, rect.top - ph - 8);
      }
      pop.style.left = left + "px";
      pop.style.top = top + "px";
      lifeMapRenderFilterPopover();
    };

    const close = () => {
      pop.classList.add("hidden");
      btn.setAttribute("aria-expanded", "false");
    };

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (pop.classList.contains("hidden")) open();
      else close();
    });

    $("lifeMapFilterClose")?.addEventListener("click", (e) => {
      e.stopPropagation();
      close();
    });

    pop.addEventListener("change", (e) => {
      const t = e.target;
      if (t.matches("[data-filter-type]")) {
        if (t.checked) lifeMapFilterTypes.add(t.value);
        else lifeMapFilterTypes.delete(t.value);
        lifeMapRenderFilterPopover();
        lifeMapApplyFilter();
      } else if (t.matches("[data-filter-status]")) {
        if (t.checked) lifeMapFilterStatuses.add(t.value);
        else lifeMapFilterStatuses.delete(t.value);
        lifeMapRenderFilterPopover();
        lifeMapApplyFilter();
      }
    });

    pop.addEventListener("click", (e) => {
      const modeBtn = e.target.closest("[data-filter-mode]");
      if (modeBtn) {
        lifeMapFilterMode = modeBtn.dataset.filterMode;
        lifeMapRenderFilterPopover();
        lifeMapApplyFilter();
        return;
      }
      const actionBtn = e.target.closest("[data-filter-action]");
      if (actionBtn) {
        const action = actionBtn.dataset.filterAction;
        if (action === "types-all") {
          Object.keys(LIFE_MAP_TYPES).forEach((k) => lifeMapFilterTypes.add(k));
        } else if (action === "types-clear") {
          lifeMapFilterTypes.clear();
        } else if (action === "status-all") {
          LIFEMAP_ALL_STATUSES.forEach((k) => lifeMapFilterStatuses.add(k));
        } else if (action === "status-clear") {
          lifeMapFilterStatuses.clear();
        }
        lifeMapRenderFilterPopover();
        lifeMapApplyFilter();
      }
    });

    $("lifeMapFilterClearAll")?.addEventListener("click", () => {
      lifeMapFilterTypes.clear();
      lifeMapFilterStatuses.clear();
      lifeMapFilterMode = "and";
      const s = $("lifeMapSearch");
      if (s) s.value = "";
      lifeMapRenderFilterPopover();
      lifeMapApplyFilter();
    });

    document.addEventListener("pointerdown", (e) => {
      if (pop.classList.contains("hidden")) return;
      if (!pop.contains(e.target) && !btn.contains(e.target)) close();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !pop.classList.contains("hidden")) {
        close();
      }
    });
  }

  function lifeMapFitView() {
    const nodes = lifeMapData().nodes;
    const canvas = $("lifeMapCanvas");

    if (!canvas || !nodes.length) {
      lifeMapZoom = 1;
      lifeMapPanX = 0;
      lifeMapPanY = 0;
      lifeMapApplyViewport();
      return;
    }

    const padding = 48;
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;

    nodes.forEach((n) => {
      const el = canvas.querySelector(`[data-lm-node="${CSS.escape(n.id)}"]`);
      const w = (el && el.offsetWidth) || 200;
      const h = (el && el.offsetHeight) || 100;
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + w);
      maxY = Math.max(maxY, n.y + h);
    });

    const contentWidth = Math.max(1, maxX - minX);
    const contentHeight = Math.max(1, maxY - minY);

    lifeMapZoom = Math.max(
      0.1,
      Math.min(
        1.2,
        (canvas.clientWidth - padding * 2) / contentWidth,
        (canvas.clientHeight - padding * 2) / contentHeight,
      ),
    );

    lifeMapPanX =
      (canvas.clientWidth - contentWidth * lifeMapZoom) / 2 -
      minX * lifeMapZoom;
    lifeMapPanY =
      (canvas.clientHeight - contentHeight * lifeMapZoom) / 2 -
      minY * lifeMapZoom;

    lifeMapApplyViewport();
  }

  /* ============================================================
     LIFE MAP CONFIRM
     ------------------------------------------------------------
     window.confirm() browser-native dialog — এটা fullscreen mode
     থেকে বের করে দেয়। তাই custom modal ব্যবহার করছি।
     Returns Promise<boolean>।
     ============================================================ */
  let lifeMapConfirmResolver = null;

  function lifeMapConfirm(message, opts = {}) {
    return new Promise((resolve) => {
      const modal = $("lifeMapConfirmModal");
      if (!modal) {
        // Fallback (কখনো normal-এ এখানে আসবে না)
        resolve(window.confirm(message));
        return;
      }
      $("lifeMapConfirmTitle").textContent = opts.title || "Confirm";
      $("lifeMapConfirmMessage").textContent = message;
      const okBtn = $("lifeMapConfirmOk");
      okBtn.textContent = opts.okLabel || "Delete";
      okBtn.classList.toggle("danger", opts.danger !== false);

      // Resolve any pending confirm first
      if (lifeMapConfirmResolver) {
        const prev = lifeMapConfirmResolver;
        lifeMapConfirmResolver = null;
        prev(false);
      }
      lifeMapConfirmResolver = resolve;
      modal.classList.remove("hidden");
      setTimeout(() => okBtn.focus(), 40);
    });
  }

  function lifeMapResolveConfirm(result) {
    if (!lifeMapConfirmResolver) return;
    const r = lifeMapConfirmResolver;
    lifeMapConfirmResolver = null;
    $("lifeMapConfirmModal")?.classList.add("hidden");
    r(result);
  }

  function lifeMapRelocatePopups() {
    const page = document.querySelector(".lifemap-page");
    if (!page) return;

    const popups = [
      $("lifeMapNodeModal"),
      $("lifeMapContextMenu"),
      $("lifeMapTypePicker"),
      $("lifeMapConfirmModal"),
      $("lifeMapHoverCard"),
    ].filter(Boolean);

    const inFullscreen = document.fullscreenElement === page;
    const targetParent = inFullscreen ? page : document.body;

    popups.forEach((p) => {
      if (p.parentNode !== targetParent) {
        targetParent.appendChild(p);
      }
    });
  }

  function bindLifeMapEvents() {
    const canvas = $("lifeMapCanvas");
    const nodesHost = $("lifeMapNodes");
    const form = $("lifeMapNodeForm");
    const modal = $("lifeMapNodeModal");
    const contextMenu = $("lifeMapContextMenu");
    const typePicker = $("lifeMapTypePicker");
    const confirmModal = $("lifeMapConfirmModal");

    if (!canvas || !nodesHost || !form) return;

    const confirmFn =
      typeof lifeMapConfirm === "function"
        ? lifeMapConfirm
        : async (msg) => window.confirm(msg);

    if (typeof lifeMapResolveConfirm === "function") {
      $("lifeMapConfirmOk")?.addEventListener("click", () =>
        lifeMapResolveConfirm(true),
      );
      $("lifeMapConfirmCancel")?.addEventListener("click", () =>
        lifeMapResolveConfirm(false),
      );
      confirmModal?.addEventListener("click", (e) => {
        if (e.target === confirmModal) lifeMapResolveConfirm(false);
      });
    }

    /* ---- New node buttons ---- */
    $("lifeMapNewNode")?.addEventListener("click", () => {
      lifeMapStartNewNode($("lifeMapNodeType")?.value || "goal");
    });
    $("lifeMapEmptyCreate")?.addEventListener("click", () =>
      lifeMapStartNewNode("goal"),
    );

    /* ---- Modal submit ---- */
    form.addEventListener("submit", (event) => {
      event.preventDefault();

      // Bulk edit path
      if (lifeMapBulkEditMode) {
        const type = $("lifeMapNodeType").value;
        const status = $("lifeMapNodeStatus").value;
        const description = $("lifeMapNodeDescription").value.trim();
        const ids = [...lifeMapBulkEditIds];
        ids.forEach((id) => {
          const n = lifeMapNodeById(id);
          if (!n) return;
          n.type = type;
          n.status = status;
          n.description = description;
          n.updatedAt = nowISO();
        });
        persist();
        lifeMapCloseNodeModal();
        renderLifeMap();
        notify(`${ids.length}টি node আপডেট হয়েছে।`);
        return;
      }

      const id = $("lifeMapNodeId").value;
      const node = lifeMapNodeById(id);
      if (!node) {
        lifeMapCloseNodeModal();
        return;
      }
      const name = $("lifeMapNodeName").value.trim();
      if (!name) {
        notify("Node-এর নাম লিখো।");
        $("lifeMapNodeName").focus();
        return;
      }
      // parentId is NOT part of this payload — it's preserved on the
      // node and only modified via the connect (⇄) workflow.
      const updates = {
        name,
        type: $("lifeMapNodeType").value,
        status: $("lifeMapNodeStatus").value,
        description: $("lifeMapNodeDescription").value.trim(),
      };
      if (!lifeMapSaveNode(id, updates)) return;
      lifeMapCloseNodeModal();
      renderLifeMap();
      notify("Node সেভ হয়েছে।");
    });

    $("lifeMapCancelEdit")?.addEventListener("click", lifeMapCloseNodeModal);
    modal?.addEventListener("click", (e) => {
      if (e.target === modal) lifeMapCloseNodeModal();
    });

    $("lifeMapDeleteNode")?.addEventListener("click", async () => {
      const node = lifeMapNodeById(lifeMapSelectedId);
      if (!node) return;
      const ok = await confirmFn(
        `"${node.name}" মুছে ফেলবে? এর সঙ্গে থাকা Connections-ও মুছে যাবে।`,
        { title: "Delete Node", okLabel: "Delete" },
      );
      if (!ok) return;
      lifeMapDeleteNodeById(node.id);
      lifeMapCloseNodeModal();
      renderLifeMap();
      notify("Node মুছে ফেলা হয়েছে।");
    });

    /* ---- Multi-select mode toggle ---- */
    $("lifeMapMultiSelectMode")?.addEventListener("click", () => {
      lifeMapHideHoverCard();
      lifeMapMultiSelectMode = !lifeMapMultiSelectMode;
      const btn = $("lifeMapMultiSelectMode");
      if (btn) btn.setAttribute("aria-pressed", String(lifeMapMultiSelectMode));
      if (canvas)
        canvas.classList.toggle("multi-select-active", lifeMapMultiSelectMode);
      if (!lifeMapMultiSelectMode) {
        lifeMapRubberBandArmed = false;
        canvas?.classList.remove("rubber-band-armed");
      }
      notify(
        lifeMapMultiSelectMode
          ? "Multi ON — প্যারেন্টে ক্লিক করলে সব child select হবে; খালি জায়গায় ডাবল-ক্লিক করলে rectangle দিয়ে select করা যাবে।"
          : "Multi OFF।",
      );
    });

    /* ---- Connection mode toggle ---- */
    $("lifeMapConnectMode")?.addEventListener("click", () => {
      lifeMapHideHoverCard();
      lifeMapConnectionMode = !lifeMapConnectionMode;
      if (!lifeMapConnectionMode) lifeMapSelectedConnectionId = null;
      renderLifeMap();
      notify(
        lifeMapConnectionMode ? "Connect mode চালু।" : "Connect mode বন্ধ।",
      );
    });

    $("lifeMapRelationType")?.addEventListener("change", (e) => {
      lifeMapConnectionFilter = e.target.value || "all";
      lifeMapSelectedConnectionId = null;
      renderLifeMap();
    });

    /* ---- Node buttons (+ / ✎ / ⇄) ---- */
    nodesHost.addEventListener("click", (event) => {
      const addBtn = event.target.closest("[data-lm-addchild]");
      if (addBtn) {
        event.stopPropagation();
        event.preventDefault();
        lifeMapAddChild(addBtn.dataset.lmAddchild);
        return;
      }
      const editBtn = event.target.closest("[data-lm-edit]");
      if (editBtn) {
        event.stopPropagation();
        event.preventDefault();
        lifeMapOpenNodeModal(editBtn.dataset.lmEdit);
        return;
      }
      const connectBtn = event.target.closest("[data-lm-connect]");
      if (connectBtn) {
        event.stopPropagation();
        event.preventDefault();
        lifeMapOpenTypePicker(connectBtn.dataset.lmConnect, connectBtn);
        return;
      }
    });

    /* ---- Type picker ---- */
    typePicker?.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-conn-type]");
      if (!btn) return;
      const type = btn.dataset.connType;
      const sourceId = typePicker.dataset.sourceId;
      const node = lifeMapNodeById(sourceId);
      if (!node) {
        lifeMapCloseTypePicker();
        return;
      }
      lifeMapDrawing = {
        sourceId,
        type,
        pointer: { x: event.clientX, y: event.clientY },
      };
      lifeMapStartAutoPan();
      lifeMapCloseTypePicker();
      notify(
        "মাউস যেদিকে নেবে লাইন যাবে — দূরের নোডে নিতে চাইলে ধারে নাও; Esc = cancel",
      );
      renderLifeMap();
    });

    /* ---- Context menu ---- */
    contextMenu?.addEventListener("click", async (event) => {
      const btn = event.target.closest("[data-ctx-action]");
      if (!btn) return;
      const action = btn.dataset.ctxAction;
      const nodeId = lifeMapContextMenuNodeId;
      const node = lifeMapNodeById(nodeId);
      if (!node) {
        lifeMapCloseContextMenu();
        return;
      }

      const targets = lifeMapSelectedIds.has(nodeId)
        ? [...lifeMapSelectedIds]
            .map((id) => lifeMapNodeById(id))
            .filter(Boolean)
        : [node];
      const isMulti = targets.length > 1;

      if (action === "edit") {
        lifeMapCloseContextMenu();
        if (isMulti) lifeMapOpenBulkEditModal(targets);
        else lifeMapOpenNodeModal(node.id);
      } else if (action === "duplicate") {
        lifeMapCloseContextMenu();
        const ids = targets.map((n) => n.id);
        const newIds = lifeMapDuplicateNodes(ids, 40);
        if (newIds.length) {
          lifeMapSelectedIds.clear();
          newIds.forEach((id) => lifeMapSelectedIds.add(id));
          lifeMapSelectedId = newIds[newIds.length - 1];
          lifeMapAdditiveMode = false;
          renderLifeMap();
          notify(`${newIds.length}টি node duplicate হয়েছে।`);
        }
      } else if (action === "status") {
        const newStatus = btn.dataset.status;
        targets.forEach((n) => {
          n.status = newStatus;
          n.updatedAt = nowISO();
        });
        persist();
        lifeMapCloseContextMenu();
        renderLifeMap();
        notify(
          isMulti
            ? `${targets.length}টি node-এর status আপডেট হয়েছে।`
            : "Status আপডেট হয়েছে।",
        );
      } else if (action === "delete") {
        lifeMapCloseContextMenu();
        const ids = targets.map((n) => n.id);
        const msg = isMulti
          ? `${targets.length}টি node মুছে ফেলবে? এর সঙ্গে থাকা Connections-ও মুছে যাবে।`
          : `"${node.name}" মুছে ফেলবে? এর সঙ্গে থাকা Connections-ও মুছে যাবে।`;
        const ok = await confirmFn(msg, {
          title: isMulti ? "Delete Nodes" : "Delete Node",
          okLabel: "Delete",
        });
        if (ok) {
          ids.forEach((id) => lifeMapDeleteNodeById(id));
          lifeMapSelectedIds.clear();
          lifeMapSelectedId = null;
          renderLifeMap();
          notify(
            isMulti
              ? `${targets.length}টি node মুছে ফেলা হয়েছে।`
              : "Node মুছে ফেলা হয়েছে।",
          );
        }
      }
    });

    /* ---- Outside-click closes popovers ---- */
    document.addEventListener("pointerdown", (event) => {
      if (
        !event.target.closest("#lifeMapContextMenu") &&
        !event.target.closest("#lifeMapTypePicker")
      ) {
        lifeMapCloseContextMenu();
        if (!event.target.closest("[data-lm-connect]"))
          lifeMapCloseTypePicker();
      }
    });

    /* ---- Escape / Delete ---- */
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        if (
          typeof lifeMapConfirmResolver !== "undefined" &&
          lifeMapConfirmResolver
        ) {
          event.stopImmediatePropagation();
          if (typeof lifeMapResolveConfirm === "function")
            lifeMapResolveConfirm(false);
          return;
        }
        if (lifeMapRubberBandArmed) {
          lifeMapRubberBandArmed = false;
          canvas.classList.remove("rubber-band-armed");
          notify("Selection mode off।");
          return;
        }
        if (lifeMapRubberBand) {
          lifeMapRubberBand = null;
          lifeMapRemoveRubberBandEl();
          lifeMapRenderNodeSelection();
          return;
        }
        if (document.fullscreenElement) {
          try {
            document.exitFullscreen();
          } catch (_) {}
        }
        lifeMapCloseContextMenu();
        lifeMapCloseTypePicker();
        if (lifeMapDrawing) {
          lifeMapDrawing = null;
          lifeMapStopAutoPan();
          lifeMapRenderTempPath(null, null);
          renderLifeMap();
          notify("Connection বাতিল হয়েছে।");
        }
        if (lifeMapEndpointDrag) {
          lifeMapEndpointDrag = null;
          lifeMapRenderTempPath(null, null);
        }
        if (lifeMapSelectedConnectionId) {
          lifeMapSelectedConnectionId = null;
          renderLifeMap();
        }
      }
      if (
        (event.key === "Delete" || event.key === "Backspace") &&
        lifeMapSelectedConnectionId &&
        !event.target.matches("input, textarea, select") &&
        !event.target.isContentEditable
      ) {
        event.preventDefault();
        lifeMapDisconnect(lifeMapSelectedConnectionId);
        lifeMapSelectedConnectionId = null;
        renderLifeMap();
        notify("Connection মুছে ফেলা হয়েছে।");
      }
    });

    /* ---- Double-click: rubber-band arm ---- */
    canvas.addEventListener("dblclick", (event) => {
      if (
        event.target.closest(
          "[data-lm-node], [data-lm-addchild], [data-lm-edit], [data-lm-connect], .lifemap-conn-dot",
        )
      )
        return;
      lifeMapRubberBandArmed = !lifeMapRubberBandArmed;
      canvas.classList.toggle("rubber-band-armed", lifeMapRubberBandArmed);
      notify(
        lifeMapRubberBandArmed
          ? "Selection mode armed — খালি জায়গা থেকে ড্র্যাগ করে rectangle আঁকো।"
          : "Selection mode off।",
      );
    });
    /* ---- Hover card ---- */
    nodesHost.addEventListener("pointerover", (event) => {
      const el = event.target.closest("[data-lm-node]");
      if (!el) return;
      if (el.contains(event.relatedTarget)) return;
      if (
        event.target.closest(
          "[data-lm-addchild], [data-lm-edit], [data-lm-connect]",
        )
      )
        return;
      const id = el.dataset.lmNode;
      lifeMapHoverCardNodeId = id;
      clearTimeout(lifeMapHoverCardTimer);
      clearTimeout(lifeMapHoverCardHideTimer);
      lifeMapHoverCardTimer = setTimeout(() => {
        if (lifeMapHoverCardNodeId === id) lifeMapShowHoverCard(id);
      }, 1000);
    });

    nodesHost.addEventListener("pointerout", (event) => {
      const el = event.target.closest("[data-lm-node]");
      if (!el) return;
      if (el.contains(event.relatedTarget)) return;
      clearTimeout(lifeMapHoverCardTimer);
      lifeMapHoverCardTimer = null;
      clearTimeout(lifeMapHoverCardHideTimer);
      lifeMapHoverCardHideTimer = setTimeout(() => {
        $("lifeMapHoverCard")?.classList.add("hidden");
        lifeMapHoverCardNodeId = null;
      }, 180);
    });

    /* ---- Canvas pointerdown ---- */
    canvas.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      lifeMapHideHoverCard();
      if (
        event.target.closest(
          "[data-lm-addchild], [data-lm-edit], [data-lm-connect]",
        )
      )
        return;

      const dot = event.target.closest(".lifemap-conn-dot");
      if (dot) {
        event.preventDefault();
        event.stopPropagation();
        const connId = dot.dataset.connId;
        const end = dot.dataset.end;
        const conn = lifeMapData().connections.find((c) => c.id === connId);
        if (conn) {
          // Dot is a drag handle — pointerdown ALWAYS starts an endpoint
          // drag. Selection is a side-effect: if not selected yet, select
          // it. Never toggle off; clicking an already-selected dot must
          // still allow dragging.
          lifeMapSelectedConnectionId = connId;
          lifeMapEndpointDrag = {
            connectionId: connId,
            end,
            anchorId: end === "source" ? conn.targetId : conn.sourceId,
            pointer: { x: event.clientX, y: event.clientY },
            moved: false,
          };
          lifeMapStartAutoPan();
          try {
            dot.setPointerCapture(event.pointerId);
          } catch (_) {}
          renderLifeMap();
        }
        return;
      }

      // Hierarchy line hit-zone — click anywhere on the line to select
      const hit = event.target.closest(".lifemap-edge-hit");
      if (hit) {
        event.preventDefault();
        const connId = hit.dataset.connId;
        if (lifeMapSelectedConnectionId === connId) {
          lifeMapSelectedConnectionId = null;
        } else {
          lifeMapSelectedConnectionId = connId;
          lifeMapSelectedIds.clear();
          lifeMapSelectedId = null;
        }
        renderLifeMap();
        // Continue as a canvas pan so dragging from the line still pans
        lifeMapDrag = {
          kind: "pan",
          startX: event.clientX,
          startY: event.clientY,
          originX: lifeMapPanX,
          originY: lifeMapPanY,
          moved: false,
        };
        try {
          canvas.setPointerCapture(event.pointerId);
        } catch (_) {}
        return;
      }

      const rect = canvas.getBoundingClientRect();

      const nodeEl = event.target.closest("[data-lm-node]");
      const node = nodeEl ? lifeMapNodeById(nodeEl.dataset.lmNode) : null;

      // Rubber-band armed → begin tracking. If the user clicked directly
      // on a node, disarm and fall through so normal node drag / select
      // works.
      if (lifeMapRubberBandArmed) {
        if (node) {
          lifeMapRubberBandArmed = false;
          canvas.classList.remove("rubber-band-armed");
        } else {
          lifeMapRubberBand = {
            startScreenX: event.clientX,
            startScreenY: event.clientY,
            currentScreenX: event.clientX,
            currentScreenY: event.clientY,
            hasMoved: false,
          };
          try {
            canvas.setPointerCapture(event.pointerId);
          } catch (_) {}
          return;
        }
      }

      const additive = event.shiftKey || event.ctrlKey || event.metaKey;
      const ctrlHeld = event.ctrlKey || event.metaKey;
      lifeMapAdditiveMode = additive;

      if (node) {
        if (lifeMapSelectedConnectionId) lifeMapSelectedConnectionId = null;

        if (lifeMapDrawing) {
          let src = lifeMapDrawing.sourceId;
          let tgt = node.id;
          let rel = lifeMapDrawing.type;
          // "Child" mode means: the drawn-from node becomes a child of
          // the target, so we swap source/target and store as "parent".
          if (rel === "child") {
            src = node.id;
            tgt = lifeMapDrawing.sourceId;
            rel = "parent";
          }
          const ok = lifeMapConnectNodes(src, tgt, rel);
          lifeMapDrawing = null;
          lifeMapStopAutoPan();
          lifeMapRenderTempPath(null, null);
          renderLifeMap();
          if (ok) notify("Connection তৈরি হয়েছে।");
          return;
        }

        // === Selection logic (IDEA 1) ===
        // User নতুন করে node click করলে inspector আবার খুলে যায়
        if (!lifeMapSelectedIds.has(node.id)) {
        }
        const isAlreadySelected = lifeMapSelectedIds.has(node.id);

        if (additive) {
          if (isAlreadySelected) lifeMapSelectedIds.delete(node.id);
          else lifeMapSelectedIds.add(node.id);
          lifeMapSelectedId = lifeMapSelectedIds.has(node.id)
            ? node.id
            : lifeMapSelectedIds.values().next().value || null;
        } else if (isAlreadySelected) {
          // 👈 ইতিমধ্যে-selected → selection অটুট
          lifeMapSelectedId = node.id;
          lifeMapAdditiveMode = false;
        } else if (lifeMapMultiSelectMode) {
          // Multi মোড + নতুন নোড → parent + সব descendant
          lifeMapSelectedIds = lifeMapCollectDescendants(node.id);
          lifeMapSelectedId = node.id;
          lifeMapAdditiveMode = false;
        } else {
          lifeMapSelectedIds.clear();
          lifeMapSelectedIds.add(node.id);
          lifeMapSelectedId = node.id;
          lifeMapAdditiveMode = false;
        }
        lifeMapRenderNodeSelection();

        const data = lifeMapData();
        const ids = [...lifeMapSelectedIds];
        lifeMapHideHoverCard();
        lifeMapDrag = {
          kind: "node",
          ids,
          clickedId: node.id,
          origins: ids.map((id) => {
            const n = data.nodes.find((x) => x.id === id);
            return { id, x: n ? n.x : 0, y: n ? n.y : 0 };
          }),
          startMouseWorldX:
            (event.clientX - rect.left - lifeMapPanX) / lifeMapZoom,
          startMouseWorldY:
            (event.clientY - rect.top - lifeMapPanY) / lifeMapZoom,
          pointer: { x: event.clientX, y: event.clientY },
          moved: false,
          pendingDuplicate: ctrlHeld,
          duplicated: false,
        };
        lifeMapStartAutoPan();
      } else {
        if (!additive) {
          lifeMapSelectedIds.clear();
          lifeMapSelectedId = null;
          lifeMapSelectedConnectionId = null;

          lifeMapRenderNodeSelection();
          renderLifeMap();
        }
        lifeMapDrag = {
          kind: "pan",
          startX: event.clientX,
          startY: event.clientY,
          originX: lifeMapPanX,
          originY: lifeMapPanY,
          moved: false,
        };
      }

      try {
        canvas.setPointerCapture(event.pointerId);
      } catch (_) {}
    });

    /* ---- Canvas pointermove ---- */
    canvas.addEventListener("pointermove", (event) => {
      const rect = canvas.getBoundingClientRect();

      if (lifeMapRubberBand) {
        const dx = Math.abs(event.clientX - lifeMapRubberBand.startScreenX);
        const dy = Math.abs(event.clientY - lifeMapRubberBand.startScreenY);
        if (!lifeMapRubberBand.hasMoved && dx + dy < 6) return;
        if (!lifeMapRubberBand.hasMoved) {
          lifeMapRubberBand.hasMoved = true;
          lifeMapSelectedIds = new Set();
          lifeMapSelectedId = null;
          lifeMapRenderNodeSelection();
        }
        lifeMapRubberBand.currentScreenX = event.clientX;
        lifeMapRubberBand.currentScreenY = event.clientY;
        lifeMapDrawRubberBand();
        lifeMapUpdateRubberBandSelection();
        return;
      }

      if (lifeMapEndpointDrag) {
        lifeMapEndpointDrag.pointer = {
          x: event.clientX,
          y: event.clientY,
        };
        const anchor = lifeMapNodeById(lifeMapEndpointDrag.anchorId);
        if (anchor) {
          const rects = lifeMapNodeRects();
          const rs = rects.get(anchor.id);
          if (rs) {
            const worldMouse = {
              x: (event.clientX - rect.left - lifeMapPanX) / lifeMapZoom,
              y: (event.clientY - rect.top - lifeMapPanY) / lifeMapZoom,
            };
            const sc = { x: rs.x + rs.w / 2, y: rs.y + rs.h / 2 };
            const start = lifeMapIntersectRect(rs, worldMouse);
            lifeMapRenderTempPath(start, worldMouse);
          }
        }
        return;
      }

      if (lifeMapDrawing) {
        lifeMapDrawing.pointer = {
          x: event.clientX,
          y: event.clientY,
        };
        const source = lifeMapNodeById(lifeMapDrawing.sourceId);
        if (source) {
          const rects = lifeMapNodeRects();
          const rs = rects.get(source.id);
          if (rs) {
            const worldMouse = {
              x: (event.clientX - rect.left - lifeMapPanX) / lifeMapZoom,
              y: (event.clientY - rect.top - lifeMapPanY) / lifeMapZoom,
            };
            const sc = { x: rs.x + rs.w / 2, y: rs.y + rs.h / 2 };
            const start = lifeMapIntersectRect(rs, worldMouse);
            lifeMapRenderTempPath(start, worldMouse, lifeMapDrawing.type);
          }
        }
        return;
      }

      if (!lifeMapDrag) return;
      lifeMapDrag.pointer = { x: event.clientX, y: event.clientY };

      if (lifeMapDrag.kind === "node") {
        const mouseWorldX =
          (event.clientX - rect.left - lifeMapPanX) / lifeMapZoom;
        const mouseWorldY =
          (event.clientY - rect.top - lifeMapPanY) / lifeMapZoom;
        const dxWorld = mouseWorldX - lifeMapDrag.startMouseWorldX;
        const dyWorld = mouseWorldY - lifeMapDrag.startMouseWorldY;

        if (Math.abs(dxWorld) + Math.abs(dyWorld) > 0.5)
          lifeMapDrag.moved = true;

        // Ctrl+drag → duplicate on the first real movement frame.
        // The originals stay in place; the freshly-created copies
        // follow the cursor.
        if (
          lifeMapDrag.moved &&
          lifeMapDrag.pendingDuplicate &&
          !lifeMapDrag.duplicated
        ) {
          lifeMapDrag.duplicated = true;
          const clickedId = lifeMapDrag.clickedId;
          if (!lifeMapSelectedIds.has(clickedId)) {
            lifeMapSelectedIds.add(clickedId);
            lifeMapSelectedId = clickedId;
          }
          const sourceIds = [...lifeMapSelectedIds];
          const newIds = lifeMapDuplicateNodes(sourceIds, 0);
          if (newIds.length) {
            lifeMapDrag.ids = newIds;
            lifeMapDrag.origins = newIds.map((id) => {
              const n = lifeMapNodeById(id);
              return { id, x: n ? n.x : 0, y: n ? n.y : 0 };
            });
            lifeMapSelectedIds.clear();
            newIds.forEach((id) => lifeMapSelectedIds.add(id));
            lifeMapSelectedId = newIds[newIds.length - 1];
            lifeMapAdditiveMode = false;
            renderLifeMap();
            notify(`${newIds.length}টি node duplicate হয়েছে।`);
          }
        }

        lifeMapDrag.origins.forEach((origin) => {
          const n = lifeMapNodeById(origin.id);
          const el = canvas.querySelector(
            `[data-lm-node="${CSS.escape(origin.id)}"]`,
          );
          if (!n || !el) return;
          n.x = origin.x + dxWorld;
          n.y = origin.y + dyWorld;
          el.style.left = `${n.x}px`;
          el.style.top = `${n.y}px`;
        });
        lifeMapRenderEdges();
      } else {
        const dx = event.clientX - lifeMapDrag.startX;
        const dy = event.clientY - lifeMapDrag.startY;
        if (Math.abs(dx) + Math.abs(dy) > 3) lifeMapDrag.moved = true;
        lifeMapPanX = lifeMapDrag.originX + dx;
        lifeMapPanY = lifeMapDrag.originY + dy;
        lifeMapApplyViewport();
        lifeMapRenderEdges();
      }
    });

    /* ---- Canvas pointerup / cancel ---- */
    function finishLifeMapPointer(event) {
      if (lifeMapRubberBand) {
        const wasDrag = lifeMapRubberBand.hasMoved;
        lifeMapRubberBand = null;
        lifeMapRemoveRubberBandEl();
        try {
          if (canvas.hasPointerCapture(event.pointerId)) {
            canvas.releasePointerCapture(event.pointerId);
          }
        } catch (_) {}
        // Stay armed — user toggles off with a second double-click or
        // Esc. Consecutive selections keep working without re-arming.
        if (wasDrag) {
          if (lifeMapSelectedIds.size > 0) lifeMapInspectorClosed = false;
          lifeMapRenderNodeSelection();
          renderLifeMap();
          notify(`${lifeMapSelectedIds.size} node selected.`);
        }
        return;
      }

      if (lifeMapEndpointDrag) {
        const drag = lifeMapEndpointDrag;
        lifeMapEndpointDrag = null;
        lifeMapStopAutoPan();
        lifeMapRenderTempPath(null, null);
        const el = document.elementFromPoint(event.clientX, event.clientY);
        const targetEl = el?.closest?.("[data-lm-node]");
        if (targetEl) {
          const targetNodeId = targetEl.dataset.lmNode;
          const conn = lifeMapData().connections.find(
            (c) => c.id === drag.connectionId,
          );
          if (conn) {
            const otherId =
              drag.end === "source" ? conn.targetId : conn.sourceId;
            if (targetNodeId === otherId) {
              notify("একই নোডে সংযোগ করা যাবে না।");
            } else {
              if (drag.end === "source") conn.sourceId = targetNodeId;
              else conn.targetId = targetNodeId;
              persist();
              notify("Connection নতুন নোডে যুক্ত হয়েছে।");
            }
          }
        }
        renderLifeMap();
        return;
      }

      if (!lifeMapDrag) return;
      const drag = lifeMapDrag;
      lifeMapDrag = null;
      lifeMapStopAutoPan();

      try {
        if (canvas.hasPointerCapture(event.pointerId)) {
          canvas.releasePointerCapture(event.pointerId);
        }
      } catch (_) {}

      if (drag.kind === "node" && drag.moved) {
        persist();
        lifeMapRenderEdges();
      }
    }

    canvas.addEventListener("pointerup", finishLifeMapPointer);
    canvas.addEventListener("pointercancel", finishLifeMapPointer);

    /* ---- Right-click context menu ---- */
    canvas.addEventListener("contextmenu", (event) => {
      const nodeEl = event.target.closest("[data-lm-node]");
      if (!nodeEl) return;
      event.preventDefault();
      const nodeId = nodeEl.dataset.lmNode;

      // Windows Explorer-style: right-click on unselected → reset
      // selection to just this node; right-click on already-selected
      // → keep the whole selection intact.
      if (!lifeMapSelectedIds.has(nodeId)) {
        lifeMapSelectedIds.clear();
        lifeMapSelectedIds.add(nodeId);
        lifeMapSelectedId = nodeId;
        lifeMapAdditiveMode = false;
      } else {
        lifeMapSelectedId = nodeId;
      }

      lifeMapRenderNodeSelection();

      lifeMapOpenContextMenu(nodeId, event.clientX, event.clientY);
    });

    /* ---- Wheel: pinch-zoom only ---- */
    canvas.addEventListener(
      "wheel",
      (event) => {
        const isPinch = event.ctrlKey || event.metaKey;
        if (!isPinch) return;
        event.preventDefault();
        lifeMapHideHoverCard();
        const rect = canvas.getBoundingClientRect();
        const mx = event.clientX - rect.left;
        const my = event.clientY - rect.top;
        const oldZoom = lifeMapZoom;
        const factor = Math.exp(-event.deltaY * 0.01);
        const newZoom = Math.max(0.1, Math.min(2.4, oldZoom * factor));
        if (newZoom === oldZoom) return;
        const worldX = (mx - lifeMapPanX) / oldZoom;
        const worldY = (my - lifeMapPanY) / oldZoom;
        lifeMapZoom = newZoom;
        lifeMapPanX = mx - worldX * newZoom;
        lifeMapPanY = my - worldY * newZoom;
        lifeMapApplyViewport();
        lifeMapRenderEdges();
      },
      { passive: false },
    );

    /* ---- Zoom / Fit / View / Fullscreen ---- */
    $("lifeMapZoomIn")?.addEventListener("click", () => {
      lifeMapZoom = Math.min(2.4, lifeMapZoom + 0.1);
      lifeMapApplyViewport();
      lifeMapRenderEdges();
    });
    $("lifeMapZoomOut")?.addEventListener("click", () => {
      lifeMapZoom = Math.max(0.1, lifeMapZoom - 0.1);
      lifeMapApplyViewport();
      lifeMapRenderEdges();
    });
    $("lifeMapFitView")?.addEventListener("click", lifeMapFitView);

    $("lifeMapFullscreen")?.addEventListener("click", async () => {
      const page = document.querySelector(".lifemap-page");
      if (!page) return;
      try {
        if (!document.fullscreenElement) await page.requestFullscreen();
        else await document.exitFullscreen();
      } catch (e) {
        notify("Fullscreen কাজ করছে না: " + (e?.message || "Unknown"));
      }
    });

    document.addEventListener("fullscreenchange", () => {
      const btn = $("lifeMapFullscreen");
      if (btn)
        btn.textContent = document.fullscreenElement
          ? "✕ Exit Fullscreen"
          : "⛶";
      if (typeof lifeMapRelocatePopups === "function") lifeMapRelocatePopups();

      // Poll until the canvas has real dimensions, then re-apply the
      // current viewport. We deliberately do NOT call fitView here so
      // the user's pan/zoom state carries over into fullscreen.
      const refit = (attempt = 0) => {
        const canvas = $("lifeMapCanvas");
        if (!canvas) return;
        if (canvas.clientWidth > 0 && canvas.clientHeight > 0) {
          lifeMapRenderEdges();
          lifeMapApplyViewport();
          lifeMapApplyFilter();
        } else if (attempt < 25) {
          setTimeout(() => refit(attempt + 1), 40);
        }
      };
      requestAnimationFrame(() => refit(0));
    });

    /* ---- Disconnect from inspector list ---- */
    $("lifeMapConnectionList")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-lm-disconnect]");
      if (!button) return;
      lifeMapDisconnect(button.dataset.lmDisconnect);
      lifeMapRenderConnections(lifeMapSelectedId);
      renderLifeMap();
      notify("Connection সরানো হয়েছে।");
    });

    /* ---- Search / Filter ---- */
    $("lifeMapSearch")?.addEventListener("input", lifeMapApplyFilter);
    bindLifeMapFilterEvents();

    /* ---- Keyboard zoom ---- */
    canvas.addEventListener("keydown", (event) => {
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        lifeMapZoom = Math.min(2.4, lifeMapZoom + 0.1);
        lifeMapApplyViewport();
        lifeMapRenderEdges();
      } else if (event.key === "-") {
        event.preventDefault();
        lifeMapZoom = Math.max(0.1, lifeMapZoom - 0.1);
        lifeMapApplyViewport();
        lifeMapRenderEdges();
      }
    });

    /* ---- ResizeObserver ---- */
    if ("ResizeObserver" in window && !lifeMapResizeObserver) {
      lifeMapResizeObserver = new ResizeObserver(() => {
        if (lifeMapRenderScheduled) return;
        lifeMapRenderScheduled = true;
        requestAnimationFrame(() => {
          lifeMapRenderScheduled = false;
          lifeMapRenderEdges();
          lifeMapApplyViewport();
        });
      });
      lifeMapResizeObserver.observe(canvas);
    }
    window.addEventListener("resize", () => {
      lifeMapRenderEdges();
      lifeMapApplyViewport();
    });
  }

  /* ---------- Auto-pan during node / endpoint / drawing ---------- */
  function lifeMapStartAutoPan() {
    if (lifeMapAutoPanFrame) return;
    const step = () => {
      const canvas = $("lifeMapCanvas");
      if (!canvas) {
        lifeMapAutoPanFrame = null;
        return;
      }

      let pointer = null;
      let kind = null;
      if (lifeMapDrag && lifeMapDrag.kind === "node" && lifeMapDrag.pointer) {
        pointer = lifeMapDrag.pointer;
        kind = "node";
      } else if (lifeMapEndpointDrag && lifeMapEndpointDrag.pointer) {
        pointer = lifeMapEndpointDrag.pointer;
        kind = "endpoint";
      } else if (lifeMapDrawing && lifeMapDrawing.pointer) {
        pointer = lifeMapDrawing.pointer;
        kind = "drawing";
      }

      if (!pointer) {
        lifeMapAutoPanFrame = null;
        return;
      }

      const rect = canvas.getBoundingClientRect();
      const { x: px, y: py } = pointer;
      const edge = 70;
      const maxSpeed = 14;

      let panDx = 0,
        panDy = 0;
      const dl = px - rect.left;
      const dr = rect.right - px;
      const dt = py - rect.top;
      const db = rect.bottom - py;

      if (dr < edge) panDx = -((edge - dr) / edge) * maxSpeed;
      else if (dl < edge) panDx = ((edge - dl) / edge) * maxSpeed;
      if (db < edge) panDy = -((edge - db) / edge) * maxSpeed;
      else if (dt < edge) panDy = ((edge - dt) / edge) * maxSpeed;

      if (panDx || panDy) {
        lifeMapPanX += panDx;
        lifeMapPanY += panDy;
        lifeMapApplyViewport();

        if (kind === "node") {
          const mouseWorldX = (px - rect.left - lifeMapPanX) / lifeMapZoom;
          const mouseWorldY = (py - rect.top - lifeMapPanY) / lifeMapZoom;
          const dxWorld = mouseWorldX - lifeMapDrag.startMouseWorldX;
          const dyWorld = mouseWorldY - lifeMapDrag.startMouseWorldY;

          lifeMapDrag.origins.forEach((origin) => {
            const n = lifeMapNodeById(origin.id);
            const el = canvas.querySelector(
              `[data-lm-node="${CSS.escape(origin.id)}"]`,
            );
            if (!n || !el) return;
            n.x = origin.x + dxWorld;
            n.y = origin.y + dyWorld;
            el.style.left = `${n.x}px`;
            el.style.top = `${n.y}px`;
          });
        } else if (kind === "endpoint") {
          const anchor = lifeMapNodeById(lifeMapEndpointDrag.anchorId);
          if (anchor) {
            const rects = lifeMapNodeRects();
            const rs = rects.get(anchor.id);
            if (rs) {
              const worldMouse = {
                x: (px - rect.left - lifeMapPanX) / lifeMapZoom,
                y: (py - rect.top - lifeMapPanY) / lifeMapZoom,
              };
              const sc = { x: rs.x + rs.w / 2, y: rs.y + rs.h / 2 };
              const start = lifeMapIntersectRect(rs, worldMouse);
              lifeMapRenderTempPath(start, worldMouse);
            }
          }
        } else if (kind === "drawing") {
          const source = lifeMapNodeById(lifeMapDrawing.sourceId);
          if (source) {
            const rects = lifeMapNodeRects();
            const rs = rects.get(source.id);
            if (rs) {
              const worldMouse = {
                x: (px - rect.left - lifeMapPanX) / lifeMapZoom,
                y: (py - rect.top - lifeMapPanY) / lifeMapZoom,
              };
              const sc = { x: rs.x + rs.w / 2, y: rs.y + rs.h / 2 };
              const start = lifeMapIntersectRect(rs, worldMouse);
              lifeMapRenderTempPath(start, worldMouse, lifeMapDrawing.type);
            }
          }
        }
        lifeMapRenderEdges();
      }
      lifeMapAutoPanFrame = requestAnimationFrame(step);
    };
    lifeMapAutoPanFrame = requestAnimationFrame(step);
  }

  function lifeMapStopAutoPan() {
    if (lifeMapAutoPanFrame) {
      cancelAnimationFrame(lifeMapAutoPanFrame);
      lifeMapAutoPanFrame = null;
    }
  }
  function tick() {
    const f = state.focus;
    if (f.running) {
      const phase = activePhase();
      if (phase) {
        const dur = (Number(phase.minutes) || 0) * 60;
        // 0-minute phases are skip markers — never trigger the alarm.
        const over = dur > 0 && phaseElapsed() >= dur;
        const allowOT = phase.countUp !== false;
        if (over && !f.alerted) {
          f.alerted = true;
          persist();
          playNotificationSound(); // সাউন্ড আগে বাজবে

          const p = activePreset();
          if (!allowOT) {
            // Overtime বন্ধ → পরের phase-এ অটো যাবে, না হলে থেমে যাবে
            if (p && f.phaseIndex < p.phases.length - 1) {
              notify("⏰ সময় শেষ — পরের phase-এ যাচ্ছে।");
              nextPhase();
            } else {
              notify("⏰ শেষ phase শেষ — Focus session বন্ধ হচ্ছে।");
              stopFocus();
            }
            return;
          }
          // Overtime চালু → কাউন্ট আপ চলবে
          notify(
            "⏰ এই phase-এর সময় শেষ। Overtime চলছে — Next phase নিজে চাপো।",
          );
        }
        // Safety net: if user toggled overtime off after phase ended while paused,
        // and then resumed, this ensures the phase progresses correctly.
        if (over && !allowOT && f.alerted) {
          f.alerted = true;
          if (
            activePreset() &&
            f.phaseIndex < activePreset().phases.length - 1
          ) {
            notify("⏰ Overtime বন্ধ — পরের phase-এ যাচ্ছে।");
            nextPhase();
          } else {
            notify("⏰ Overtime বন্ধ — session শেষ।");
            stopFocus();
          }
          return;
        }
        renderFocus();
      }
    }
    renderTrackingMini();
    renderFocusMini();
    updateTrackingFab();
    updateLiveNumbers();
    updateReviewLiveStats();
    updatePiPContent();
  }

  function updateLiveNumbers() {
    if (state.tracking.activeActionId) {
      const a = activeAction();
      if (a) {
        const emoji = a.emoji ? a.emoji + " " : "";
        document.title = `⏱ ${fmt(currentTrackingSeconds())} · ${emoji}${a.name}`;
      }
    } else if (document.title !== "Life OS — Personal Life Manager") {
      document.title = "Life OS — Personal Life Manager";
    }
    if (!state.tracking.activeActionId) return;
    const timeStr = fmt(currentTrackingSeconds());

    // Sessions list-এর ভেতরে live tracking pill-এর সময় আপডেট
    document.querySelectorAll("#todayTasks .pill.green").forEach((el) => {
      if (el.textContent.startsWith("Tracking")) {
        el.textContent = "Tracking · " + timeStr;
      }
    });

    // আজকের recorded total (live tracking সহ) আপডেট
    const date = getSelectedDate();
    const logs = logsForDate(date);
    const recorded =
      logs.reduce((s, l) => s + l.durationSeconds, 0) +
      (state.tracking.segmentStart &&
      localDate(new Date(state.tracking.segmentStart)) === date
        ? currentTrackingSeconds()
        : 0);
    const recEl = $("todayRecorded");
    if (recEl) recEl.textContent = humanMinutes(recorded / 60);
  }
  function syncPhaseEditorToPreset() {
    const pid = editingPresetId || state.focus.presetId;
    if (!pid) return;
    const p = presetById(pid);
    if (!p) return;
    const host = $("dashboardPhaseEditor");
    if (!host) return;
    const rows = host.querySelectorAll(".phase-row");
    if (!rows.length) return;

    const phases = [...rows].map((r) => {
      const sel = r.querySelector(".phase-action");
      return {
        name: r.querySelector(".phase-name").value.trim() || "Phase",
        minutes: phaseHM(r),
        countUp: r.querySelector(".phase-countup").checked,
        actionId: sel ? sel.value || null : null,
      };
    });

    p.phases = phases;
    p.updatedAt = nowISO();
    const nameEl = $("dashboardFocusName");
    if (nameEl) {
      const nm = nameEl.value.trim();
      if (nm) p.name = nm;
    }
    persist();

    // === Live update the running/paused focus session ===
    const f = state.focus;
    if ((f.running || f.paused) && f.presetId === pid) {
      const phase = activePhase();
      if (phase) {
        const dur = (Number(phase.minutes) || 0) * 60;
        const over = dur > 0 && phaseElapsed() >= dur;
        const allowOT = phase.countUp !== false;

        if (over && !allowOT) {
          if (f.running) {
            // Running — immediately move on
            if (p.phases.length > f.phaseIndex + 1) {
              notify("⏰ Overtime বন্ধ — পরের phase-এ যাচ্ছে।");
              nextPhase();
              return;
            } else {
              notify("⏰ Overtime বন্ধ — session শেষ।");
              stopFocus();
              return;
            }
          } else {
            // Paused — reset alerted so on resume tick handles it
            f.alerted = false;
            persist();
          }
        }
      }
    }

    renderFocus();
    renderFocusMini();
  }
  function renderDashboardPhaseEditor(
    phases = [{ name: "Focus", minutes: 25, countUp: true, actionId: null }],
  ) {
    const host = $("dashboardPhaseEditor");
    if (!host) return;

    if (!phases || !phases.length) {
      host.innerHTML =
        '<div class="empty" style="padding:14px">কোনো phase নেই — + Focus বা + Break চাপো।</div>';
      return;
    }

    const acts = activeActions();
    const actionOptions = (sel) =>
      '<option value="">— কোনো Action না —</option>' +
      acts
        .map(
          (a) =>
            `<option value="${escapeHTML(a.id)}"${sel === a.id ? " selected" : ""}>${escapeHTML((a.emoji ? a.emoji + " " : "") + a.name)}</option>`,
        )
        .join("");

    host.innerHTML = phases
      .map((p, i) => {
        const total = Number(p.minutes) || 0,
          h = Math.floor(total / 60),
          m = total % 60;
        const ot = p.countUp !== false;
        return `<div class="phase-row item">
          <div class="phase-main-row">
            <div class="phase-idx">${i + 1}</div>
            <div class="field content">
              <label>Phase name</label>
              <input class="phase-name" value="${escapeHTML(p.name)}">
            </div>
            <div class="field phase-num">
              <label>ঘণ্টা</label>
              <input class="phase-hours" type="number" min="0" value="${h}">
            </div>
            <div class="field phase-num">
              <label>মিনিট</label>
              <input class="phase-mins" type="number" min="0" max="59" value="${m}">
            </div>
            <label class="checkboxrow switch" title="Overtime">
              <input type="checkbox" class="phase-countup" ${ot ? "checked" : ""}>
              <span>Overtime</span>
            </label>
            <button class="small danger" type="button" data-phase-remove="${i}" aria-label="Remove phase">✕</button>
          </div>
          <div class="phase-action-row">
            <label>Action</label>
            <select class="phase-action">${actionOptions(p.actionId)}</select>
          </div>
        </div>`;
      })
      .join("");

    const collect = () =>
      [...host.querySelectorAll(".phase-row")].map((r) => {
        const sel = r.querySelector(".phase-action");
        return {
          name: r.querySelector(".phase-name").value,
          minutes: phaseHM(r),
          countUp: r.querySelector(".phase-countup").checked,
          actionId: sel ? sel.value || null : null,
        };
      });

    host.querySelectorAll("[data-phase-remove]").forEach((b) =>
      b.addEventListener("click", () => {
        const next = collect();
        next.splice(Number(b.dataset.phaseRemove), 1);
        renderDashboardPhaseEditor(next);
        syncPhaseEditorToPreset();
      }),
    );
  }
  /* ---- Focus Mode session management ---- */

  function loadFocusSession(id, opts = {}) {
    const p = presetById(id);
    state.focus.presetId = p ? p.id : null;
    editingPresetId = p ? p.id : null;

    const sel = $("focusPreset");
    if (sel) sel.value = p ? p.id : "";

    const nameInput = $("dashboardFocusName");
    if (nameInput) nameInput.value = p ? p.name : "";

    const linkToggle = $("focusLinkTracking");
    if (linkToggle) linkToggle.checked = p ? !!p.linkTracking : false;

    renderDashboardPhaseEditor(
      p && p.phases && p.phases.length ? p.phases : [],
    );

    if (p && opts.focusName && nameInput) {
      nameInput.focus();
      nameInput.select();
    }
    renderFocus();
  }

  /* ---------- Focus ↔ Tracking integration helpers ---------- */

  function focusCurrentPhase() {
    const p = activePreset();
    if (!p || !p.phases) return null;
    return p.phases[state.focus.phaseIndex] || null;
  }

  function focusApplyTracking(reason = "") {
    const f = state.focus;
    const p = activePreset();
    if (!p) return;

    const phase = focusCurrentPhase();
    const wantTracking = !!p.linkTracking && !!(phase && phase.actionId);
    const targetAction = wantTracking ? phase.actionId : null;
    const currentAction = state.tracking.activeActionId;

    // Not supposed to track → stop what we started (nothing else)
    if (!wantTracking) {
      if (f.trackingActionId && currentAction === f.trackingActionId) {
        closeTrackingSegment(nowISO());
      }
      f.trackingActionId = null;
      persist();
      return;
    }

    // Same action already tracking → continuation, no log split
    if (currentAction === targetAction) {
      f.trackingActionId = targetAction;
      persist();
      return;
    }

    // Different action (or nothing) → stop current, start new
    if (currentAction) closeTrackingSegment(nowISO());
    startTracking(targetAction);
    f.trackingActionId = targetAction;
    persist();
  }

  function focusPauseTracking() {
    const f = state.focus;
    if (!f.trackingActionId) return;
    if (state.tracking.activeActionId !== f.trackingActionId) return;
    if (state.tracking.paused) return;
    pauseTracking();
  }

  function focusResumeTracking() {
    const f = state.focus;
    if (!f.trackingActionId) return;
    if (state.tracking.activeActionId !== f.trackingActionId) return;
    if (!state.tracking.paused) return;
    resumeTracking();
  }

  function focusStopTracking() {
    const f = state.focus;
    if (!f.trackingActionId) return;
    if (state.tracking.activeActionId !== f.trackingActionId) {
      f.trackingActionId = null;
      persist();
      return;
    }
    closeTrackingSegment(nowISO());
    f.trackingActionId = null;
    persist();
  }

  /* Returns the index of the closest phase with minutes > 0, starting
     at `startIndex` and moving by `direction` (+1 for forward, -1 for
     backward). Returns null if no active phase exists in that range.
     0-minute phases are treated as skip markers. */
  function focusFindActivePhase(startIndex, direction) {
    const p = activePreset();
    if (!p || !p.phases) return null;
    let i = startIndex;
    while (i >= 0 && i < p.phases.length) {
      const m = Number(p.phases[i].minutes) || 0;
      if (m > 0) return i;
      i += direction;
    }
    return null;
  }

  function createNewFocusSession() {
    const p = {
      id: uid("preset"),
      name: "New session",
      actionId: null,
      countUp: true,
      alert: true,
      linkTracking: true,
      phases: [
        { name: "Focus", minutes: 25, countUp: true, actionId: null },
        { name: "Break", minutes: 5, countUp: true, actionId: null },
      ],
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    state.presets.push(p);
    persist();
    renderSelects();
    loadFocusSession(p.id, { focusName: true });
    notify("নতুন session তৈরি হয়েছে — নাম লিখো।");
  }

  async function deleteFocusSession() {
    const id = state.focus.presetId || $("focusPreset").value;
    if (!id) {
      notify("কোনো session নেই।");
      return;
    }
    const p = presetById(id);
    if (!p) return;
    if (
      state.focus.presetId === id &&
      (state.focus.running || state.focus.paused)
    ) {
      alert("চলমান Session আগে Stop করো।");
      return;
    }
    if (!confirm(`"${p.name}" মুছে ফেলবে?`)) return;

    state.presets = state.presets.filter((x) => x.id !== id);
    const next = state.presets[0] || null;
    state.focus = { ...seed().focus, presetId: next ? next.id : null };
    persist();
    renderSelects();
    if (next) loadFocusSession(next.id);
    else {
      loadFocusSession(null);
    }
    renderAll();
    notify("Session মুছে ফেলা হয়েছে।");
  }

  function addFocusPhase(type) {
    if (!state.focus.presetId) {
      notify("আগে একটি session তৈরি করো।");
      return;
    }
    const host = $("dashboardPhaseEditor");
    if (!host) return;
    const current = [...host.querySelectorAll(".phase-row")].map((r) => {
      const sel = r.querySelector(".phase-action");
      return {
        name: r.querySelector(".phase-name").value.trim() || "Phase",
        minutes: phaseHM(r),
        countUp: r.querySelector(".phase-countup").checked,
        actionId: sel ? sel.value || null : null,
      };
    });
    current.push({
      name: type === "break" ? "Break" : "Focus",
      minutes: 0,
      countUp: false,
      actionId: null,
    });
    renderDashboardPhaseEditor(current);
    syncPhaseEditorToPreset();
  }

  function syncFocusNameToPreset() {
    const p = presetById(state.focus.presetId);
    if (!p) return;
    const raw = $("dashboardFocusName").value;
    const name = raw.trim() || "Untitled session";
    p.name = name;
    p.updatedAt = nowISO();

    // Update dropdown option text
    const opt = $("focusPreset").querySelector(
      `option[value="${CSS.escape(p.id)}"]`,
    );
    if (opt) opt.textContent = name;

    // Update timer title instantly
    const tn = $("focusTimerName");
    if (tn) {
      const phase = activePhase();
      tn.textContent = `${p.name}${phase ? " — " + phase.name : ""}`;
    }
    persist();
  }

  /* ============================================================
     VISUAL REMINDERS — Image + OS Notification + Custom Sound
     ============================================================ */
  const VREM_KEY = "lifeOS.visualReminders.v1";
  let visualReminders = [];

  function loadVisualRemindersFromStorage() {
    try {
      const raw = localStorage.getItem(VREM_KEY);
      if (!raw) return [];
      const data = JSON.parse(raw);
      return Array.isArray(data) ? data : [];
    } catch (e) {
      return [];
    }
  }

  function saveVisualReminders() {
    try {
      localStorage.setItem(VREM_KEY, JSON.stringify(visualReminders));
    } catch (e) {
      notify("Visual Reminders সেভ হয়নি — browser storage পূর্ণ।");
    }
  }

  function visualReminderById(id) {
    return visualReminders.find((v) => v.id === id) || null;
  }

  function renderVisualReminders() {
    const host = $("visualReminderList");
    if (!host) return;

    updatePermissionBadge();

    if (!visualReminders.length) {
      host.innerHTML =
        '<div class="empty">এখনো কোনো Visual Reminder নেই। উপরে + New চাপো।</div>';
      return;
    }

    host.innerHTML = visualReminders
      .map((vr) => {
        const icon = vr.iconData
          ? `<img src="${escapeHTML(vr.iconData)}" alt="">`
          : "💧";
        const badge = vr.enabled
          ? `<span class="vr-status-badge on">● Active</span>`
          : `<span class="vr-status-badge">○ Disabled</span>`;
        const interval =
          vr.intervalMin === vr.intervalMax
            ? `${vr.intervalMin}m`
            : `${vr.intervalMin}–${vr.intervalMax}m`;
        const soundLabel =
          vr.soundType === "none"
            ? "🔇"
            : vr.soundType === "bell"
              ? "🔔 Bell"
              : "🔔 Chime";
        let nextLine = "";
        if (vr.enabled && vr.nextFireAt) {
          const t = new Date(vr.nextFireAt).toLocaleTimeString("bn-BD", {
            hour: "2-digit",
            minute: "2-digit",
          });
          nextLine = ` · পরবর্তী: ${t}`;
        }
        const todayLine = vr.todayCount ? ` · আজ: ${vr.todayCount}` : "";

        const bigImg =
          vr.showImage && vr.imageData
            ? `<img src="${escapeHTML(vr.imageData)}" alt="" class="vr-list-img">`
            : "";
        return `<div class="item">
          <div class="vr-item-icon">${icon}</div>
          <div class="content">
            <strong>${escapeHTML(vr.name)}${badge}</strong>
            <div class="tiny">Every ${interval} · ${soundLabel} · ${escapeHTML(vr.activeStart)}–${escapeHTML(vr.activeEnd)}${todayLine}${vr.silentDuringFocus ? " · 🔇 Silent in Focus" : ""}</div>
            <div class="tiny">${nextLine}</div>
            ${bigImg}
          </div>
          <div class="actions">
            <button class="small" data-vr-toggle="${vr.id}">${vr.enabled ? "Disable" : "Enable"}</button>
            <button class="small" data-vr-test="${vr.id}">Test</button>
            <button class="small" data-vr-edit="${vr.id}">Edit</button>
            <button class="small danger" data-vr-delete="${vr.id}">Delete</button>
          </div>
        </div>`;
      })
      .join("");
  }

  function updatePermissionBadge() {
    const badge = $("vrPermissionStatus");
    const warn = $("vrPermissionWarning");
    if (!badge) return;
    const supported = "Notification" in window;
    if (!supported) {
      badge.textContent = "❌ Not supported";
      badge.className = "pill denied";
      return;
    }
    const p = Notification.permission;
    if (p === "granted") {
      badge.textContent = "✓ Notifications on";
      badge.className = "pill granted";
      warn?.classList.add("hidden");
    } else if (p === "denied") {
      badge.textContent = "❌ Blocked";
      badge.className = "pill denied";
      warn?.classList.add("hidden");
    } else {
      badge.textContent = "⚠ Click to enable";
      badge.className = "pill default";
      warn?.classList.remove("hidden");
    }
  }

  async function requestNotificationPermission() {
    if (!("Notification" in window)) {
      notify("এই browser-এ Notification সমর্থিত নয়।");
      return;
    }
    try {
      const res = await Notification.requestPermission();
      updatePermissionBadge();
      if (res === "granted") {
        notify("✓ Notifications চালু হয়েছে।");
      } else if (res === "denied") {
        notify("Notifications ব্লক করা আছে — browser settings থেকে চালু করো।");
      }
    } catch (e) {
      notify("Permission নেওয়া যায়নি।");
    }
  }

  /* ---------- Form ---------- */
  function resetVisualReminderForm() {
    $("vrEditId").value = "";
    $("vrIconData").value = "";
    $("vrImageData").value = "";
    $("vrName").value = "";
    $("vrMessage").value = "";
    $("vrIntervalMin").value = 20;
    $("vrIntervalMax").value = 30;
    $("vrSound").value = "chime";
    $("vrActiveStart").value = "09:00";
    $("vrActiveEnd").value = "22:00";
    $("vrShowImage").checked = false;
    $("vrSilentFocus").checked = false;
    $("vrEnabled").checked = true;
    $("vrIconPreview").innerHTML = "💧";
    $("vrImagePreview").innerHTML = "খালি";
    $("visualReminderFormTitle").textContent = "নতুন Visual Reminder";
    $("visualReminderFormWrap").classList.add("hidden");
  }

  function openVisualReminderForm(id) {
    resetVisualReminderForm();
    if (id) {
      const vr = visualReminderById(id);
      if (!vr) return;
      $("vrEditId").value = vr.id;
      $("vrIconData").value = vr.iconData || "";
      $("vrImageData").value = vr.imageData || "";
      $("vrName").value = vr.name;
      $("vrMessage").value = vr.message || "";
      $("vrIntervalMin").value = vr.intervalMin || 20;
      $("vrIntervalMax").value = vr.intervalMax || 30;
      $("vrSound").value = vr.soundType || "chime";
      $("vrActiveStart").value = vr.activeStart || "09:00";
      $("vrActiveEnd").value = vr.activeEnd || "22:00";
      $("vrShowImage").checked = !!vr.showImage;
      $("vrSilentFocus").checked = !!vr.silentDuringFocus;
      $("vrEnabled").checked = !!vr.enabled;
      if (vr.iconData) {
        $("vrIconPreview").innerHTML =
          `<img src="${escapeHTML(vr.iconData)}" alt="">`;
      }
      if (vr.imageData) {
        $("vrImagePreview").innerHTML =
          `<img src="${escapeHTML(vr.imageData)}" alt="">`;
      }
      $("visualReminderFormTitle").textContent = "Visual Reminder Edit";
    }
    $("visualReminderFormWrap").classList.remove("hidden");
    setTimeout(() => $("vrName").focus(), 60);
  }

  /* ---------- Image upload helpers ---------- */
  function readFileAsDataURL(file, cb) {
    const reader = new FileReader();
    reader.onload = (e) => cb(e.target.result);
    reader.onerror = () => notify("ছবি পড়া যায়নি।");
    reader.readAsDataURL(file);
  }

  function resizeImageToSquare(dataURL, size, cb) {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      const ratio = Math.max(size / img.width, size / img.height);
      const w = img.width * ratio;
      const h = img.height * ratio;
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      cb(canvas.toDataURL("image/png"));
    };
    img.onerror = () => notify("ছবি খোলা যায়নি।");
    img.src = dataURL;
  }

  function handleIconUpload(file) {
    if (file.size > 2 * 1024 * 1024) {
      notify("Icon ২MB-এর কম হতে হবে।");
      return;
    }
    readFileAsDataURL(file, (dataURL) => {
      resizeImageToSquare(dataURL, 64, (small) => {
        $("vrIconData").value = small;
        $("vrIconPreview").innerHTML =
          `<img src="${escapeHTML(small)}" alt="">`;
      });
    });
  }

  function resizeImageToFit(dataURL, targetW, targetH, bgColor, cb) {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = bgColor || "#ffffff";
      ctx.fillRect(0, 0, targetW, targetH);
      // Contain mode — full image visible, letterbox if needed
      const scale = Math.min(targetW / img.width, targetH / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, (targetW - w) / 2, (targetH - h) / 2, w, h);
      cb(canvas.toDataURL("image/png"));
    };
    img.onerror = () => notify("ছবি খোলা যায়নি।");
    img.src = dataURL;
  }

  function handleImageUpload(file) {
    if (file.size > 2 * 1024 * 1024) {
      notify("Image ২MB-এর কম হতে হবে।");
      return;
    }
    readFileAsDataURL(file, (dataURL) => {
      // Fit into Windows' hero ratio — full image, no crop.
      resizeImageToFit(dataURL, 364, 180, "#ffffff", (fitted) => {
        $("vrImageData").value = fitted;
        $("vrImagePreview").innerHTML =
          `<img src="${escapeHTML(fitted)}" alt="">`;
      });
    });
  }

  /* ---------- Save / Delete / Toggle ---------- */
  function saveVisualReminderFromForm(e) {
    e.preventDefault();
    const id = $("vrEditId").value;
    const name = $("vrName").value.trim();
    if (!name) {
      notify("নাম দাও।");
      $("vrName").focus();
      return;
    }
    const intervalMin = Math.max(1, Number($("vrIntervalMin").value) || 20);
    const intervalMax = Math.max(
      intervalMin,
      Number($("vrIntervalMax").value) || intervalMin,
    );
    const activeStart = $("vrActiveStart").value || "09:00";
    const activeEnd = $("vrActiveEnd").value || "22:00";

    const payload = {
      name,
      message: $("vrMessage").value.trim(),
      iconData: $("vrIconData").value || "",
      imageData: $("vrImageData").value || "",
      intervalMin,
      intervalMax,
      soundType: $("vrSound").value || "none",
      activeStart,
      activeEnd,
      showImage: $("vrShowImage").checked,
      silentDuringFocus: $("vrSilentFocus").checked,
      enabled: $("vrEnabled").checked,
    };

    if (id) {
      const vr = visualReminderById(id);
      if (vr) {
        Object.assign(vr, payload);
        vr.nextFireAt = null;
      }
      notify("✓ Visual Reminder আপডেট হয়েছে।");
    } else {
      visualReminders.push({
        id: uid("vrem"),
        ...payload,
        nextFireAt: null,
        lastFiredAt: null,
        todayCount: 0,
        todayDate: localDate(),
        createdAt: nowISO(),
      });
      notify("✓ Visual Reminder যোগ হয়েছে।");
    }

    saveVisualReminders();
    scheduleVisualReminderTick();
    resetVisualReminderForm();
    renderVisualReminders();

    // Ask for permission on first save if not yet granted
    if ("Notification" in window && Notification.permission === "default") {
      requestNotificationPermission();
    }
  }

  function deleteVisualReminder(id) {
    const vr = visualReminderById(id);
    if (!vr) return;
    if (!confirm(`"${vr.name}" মুছে ফেলবে?`)) return;
    visualReminders = visualReminders.filter((v) => v.id !== id);
    saveVisualReminders();
    renderVisualReminders();
    notify("Reminder মুছে ফেলা হয়েছে।");
  }

  function toggleVisualReminder(id) {
    const vr = visualReminderById(id);
    if (!vr) return;
    vr.enabled = !vr.enabled;
    if (vr.enabled) {
      vr.nextFireAt = null;
      scheduleVisualReminderTick();
    }
    saveVisualReminders();
    renderVisualReminders();
  }

  /* ---------- Scheduler ---------- */
  function isInActiveHours(vr) {
    const now = new Date();
    const cur = now.getHours() * 60 + now.getMinutes();
    const [sh, sm] = (vr.activeStart || "00:00").split(":").map(Number);
    const [eh, em] = (vr.activeEnd || "23:59").split(":").map(Number);
    const start = sh * 60 + sm;
    const end = eh * 60 + em;
    if (start === end) return true;
    if (start < end) return cur >= start && cur <= end;
    // Crosses midnight
    return cur >= start || cur <= end;
  }

  function computeNextFireAt(vr, fromMs) {
    const min = vr.intervalMin || 20;
    const max = Math.max(min, vr.intervalMax || min);
    const minutes = min + Math.random() * (max - min);
    return new Date(fromMs + minutes * 60000).toISOString();
  }

  let vremTickHandle = null;
  function scheduleVisualReminderTick() {
    if (vremTickHandle) return;
    vremTickHandle = setInterval(vremTick, 5000);
  }

  function vremTick() {
    if (!visualReminders.length) return;
    const now = Date.now();
    let dirty = false;

    visualReminders.forEach((vr) => {
      if (!vr.enabled) return;
      if (!vr.nextFireAt) {
        vr.nextFireAt = computeNextFireAt(vr, now);
        dirty = true;
        return;
      }
      if (!isInActiveHours(vr)) return;
      if (state.focus.running && vr.silentDuringFocus) return;
      if (now >= new Date(vr.nextFireAt).getTime()) {
        fireVisualReminder(vr);
        vr.lastFiredAt = nowISO();
        vr.nextFireAt = computeNextFireAt(vr, now);
        const today = localDate();
        if (vr.todayDate !== today) {
          vr.todayCount = 0;
          vr.todayDate = today;
        }
        vr.todayCount = (vr.todayCount || 0) + 1;
        dirty = true;
      }
    });

    if (dirty) {
      saveVisualReminders();
      renderVisualReminders();
    }
  }

  /* ---------- Notification + Sound ---------- */
  let vremAudioCtx = null;
  function ensureAudioContext() {
    if (vremAudioCtx) return vremAudioCtx;
    try {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      vremAudioCtx = new C();
      return vremAudioCtx;
    } catch (e) {
      return null;
    }
  }

  function playTone(ctx, freq, delaySec, durSec, vol) {
    const t0 = ctx.currentTime + delaySec;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = freq;
    o.connect(g);
    g.connect(ctx.destination);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.14, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + durSec);
    o.start(t0);
    o.stop(t0 + durSec + 0.05);
  }

  function playReminderSound(type) {
    if (!type || type === "none") return;
    const ctx = ensureAudioContext();
    if (!ctx) return;
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    if (type === "chime") {
      playTone(ctx, 660, 0, 0.4, 0.13);
      playTone(ctx, 880, 0.32, 0.55, 0.13);
    } else if (type === "bell") {
      playTone(ctx, 1046, 0, 0.9, 0.15);
    }
  }

  function fireVisualReminder(vr) {
    // OS notification
    if ("Notification" in window && Notification.permission === "granted") {
      const opts = {
        body: vr.message || "রিমাইন্ডারের সময় হয়েছে।",
        silent: true,
        tag: "vrem-" + vr.id,
        renotify: false,
        requireInteraction: false,
      };
      if (vr.iconData) opts.icon = vr.iconData;
      // Only attach the hero image when the user explicitly opted in —
      // otherwise Windows inflates the notification card to ~3x height.
      if (vr.showImage && vr.imageData) opts.image = vr.imageData;
      try {
        const n = new Notification(vr.name, opts);
        n.onclick = () => {
          try {
            window.focus();
          } catch (_) {}
          n.close();
        };
        // Auto-dismiss quickly — 3 seconds is enough to register the
        // reminder visually without stealing focus.
        setTimeout(() => {
          try {
            n.close();
          } catch (_) {}
        }, 3000);
      } catch (e) {
        console.warn("Notification failed", e);
      }
    }

    // Custom sound
    playReminderSound(vr.soundType);

    // In-app toast (fallback when tab is visible)
    if (!document.hidden) {
      notify(`🔔 ${vr.name}${vr.message ? " — " + vr.message : ""}`);
    }
  }

  /* ---------- Event binding ---------- */
  function bindVisualReminderEvents() {
    $("newVisualReminderBtn")?.addEventListener("click", () =>
      openVisualReminderForm(null),
    );
    $("vrCancel")?.addEventListener("click", resetVisualReminderForm);
    $("visualReminderForm")?.addEventListener(
      "submit",
      saveVisualReminderFromForm,
    );

    // Permission badge
    $("vrPermissionStatus")?.addEventListener("click", () => {
      if ("Notification" in window && Notification.permission === "default") {
        requestNotificationPermission();
      } else if (
        "Notification" in window &&
        Notification.permission === "granted"
      ) {
        notify("✓ Notifications আগেই চালু আছে।");
      }
    });

    // Icon upload
    $("vrIconBtn")?.addEventListener("click", () => $("vrIconFile").click());
    $("vrIconFile")?.addEventListener("change", (e) => {
      const f = e.target.files?.[0];
      if (f) handleIconUpload(f);
      e.target.value = "";
    });
    $("vrIconClear")?.addEventListener("click", () => {
      $("vrIconData").value = "";
      $("vrIconPreview").innerHTML = "💧";
    });

    // Image upload
    $("vrImageBtn")?.addEventListener("click", () => $("vrImageFile").click());
    $("vrImageFile")?.addEventListener("change", (e) => {
      const f = e.target.files?.[0];
      if (f) handleImageUpload(f);
      e.target.value = "";
    });
    $("vrImageClear")?.addEventListener("click", () => {
      $("vrImageData").value = "";
      $("vrImagePreview").innerHTML = "খালি";
    });

    // List actions
    $("visualReminderList")?.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.vrToggle) toggleVisualReminder(b.dataset.vrToggle);
      else if (b.dataset.vrEdit) openVisualReminderForm(b.dataset.vrEdit);
      else if (b.dataset.vrDelete) deleteVisualReminder(b.dataset.vrDelete);
      else if (b.dataset.vrTest) {
        const vr = visualReminderById(b.dataset.vrTest);
        if (vr) fireVisualReminder(vr);
      }
    });

    // Sound preview
    $("vrSoundTest")?.addEventListener("click", () => {
      playReminderSound($("vrSound").value);
    });

    // Unlock audio on first user interaction
    document.addEventListener(
      "click",
      () => {
        const ctx = ensureAudioContext();
        if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
      },
      { once: true },
    );
  }

  function boot() {
    if (!$("dashboardDate").value) $("dashboardDate").value = localDate();
    if (!$("manualDate").value) $("manualDate").value = localDate();
    visualReminders = loadVisualRemindersFromStorage();
    bindVisualReminderEvents();
    renderVisualReminders();
    scheduleVisualReminderTick();
    renderSelects();
    bindEvents();
    bindLifeMapEvents();
    bindTrackingFab();
    bindReminderRescheduleCalendar();
    lifeMapRelocatePopups();
    syncThemeButton();
    resetPresetForm();
    resetReminderForm();
    renderTodayReminders();
    renderDashboardPhaseEditor([
      { name: "Focus", minutes: 25 },
      { name: "Break", minutes: 5 },
    ]);

    // === Focus Mode: restore last session state ===
    if (state.focus.presetId && !presetById(state.focus.presetId)) {
      state.focus.presetId = null;
    }
    if (!state.focus.presetId && state.presets.length) {
      state.focus.presetId = state.presets[0].id;
    }
    if (state.focus.presetId) {
      loadFocusSession(state.focus.presetId);
    }
    renderAll();
    renderLifeMap();
    setInterval(tick, 500);
  }
  window.lifeOSApp = {
    getState: () => JSON.parse(JSON.stringify(state)),
    emptyState: () => seed(),
    notify: (message) => notify(message),
    setState: (data) => {
      if (
        !data ||
        !Array.isArray(data.actions) ||
        !Array.isArray(data.categories)
      )
        throw new Error("Invalid Life OS data");
      state = {
        ...seed(),
        ...data,
        schemaVersion: SCHEMA_VERSION,
        settings: { ...seed().settings, ...(data.settings || {}) },
        tracking: { ...seed().tracking, ...(data.tracking || {}) },
        focus: { ...seed().focus, ...(data.focus || {}) },
        reviews: data.reviews || {},
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      renderAll();
    },
  };
  boot();
})();
