(() => {
  "use strict";

  const COLORS = [
    { name: "Лайм", value: "#c6ff3d" },
    { name: "Электрик", value: "#5b8cff" },
    { name: "Розовый", value: "#ff5c9d" },
    { name: "Оранжевый", value: "#ff8a3d" },
    { name: "Фиолетовый", value: "#a06bff" },
    { name: "Бирюзовый", value: "#3dffd6" },
    { name: "Красный", value: "#ff4d4d" },
    { name: "Белый", value: "#f5f5f7" }
  ];
  const STORAGE_KEY = "moments.counters.v1";
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  // Store: единственная точка доступа к localStorage.
  const Store = {
    getAll() {
      try {
        const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
        return Array.isArray(data) ? data.filter(item =>
          item && typeof item.id === "string" &&
          typeof item.name === "string" &&
          Number.isFinite(Number(item.date))
        ) : [];
      } catch { return []; }
    },
    save(items) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
        return true;
      } catch {
        UI.toast("Не удалось сохранить данные. Проверьте память браузера.");
        return false;
      }
    }
  };

  // Time: расчёт всегда производится от текущего timestamp.
  const Time = {
    parts(target, now = Date.now()) {
      const diff = target - now;
      const total = Math.floor(Math.abs(diff) / 1000);
      return {
        future: diff > 0,
        days: Math.floor(total / 86400),
        hours: Math.floor((total % 86400) / 3600),
        minutes: Math.floor((total % 3600) / 60),
        seconds: total % 60
      };
    },
    pad(value) { return String(value).padStart(2, "0"); },
    formatDate(timestamp) {
      return new Intl.DateTimeFormat("ru-RU", {
        day: "numeric", month: "long", year: "numeric",
        hour: "2-digit", minute: "2-digit"
      }).format(new Date(timestamp));
    },
    formatShort(timestamp) {
      return new Intl.DateTimeFormat("ru-RU", {
        day: "numeric", month: "short", year: "numeric"
      }).format(new Date(timestamp));
    }
  };

  const state = {
    items: Store.getAll(),
    selectedId: null,
    selectedColor: COLORS[0].value,
    detailMode: "remaining",
    tick: null,
    toastTimer: null,
    previousFocus: null
  };

  const UI = {
    toast(message) {
      const node = $("#toast");
      node.textContent = message;
      node.classList.add("show");
      clearTimeout(state.toastTimer);
      state.toastTimer = setTimeout(() => node.classList.remove("show"), 2600);
    },
    openModal(id) {
      const backdrop = $(id);
      state.previousFocus = document.activeElement;
      backdrop.classList.add("open");
      backdrop.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";
      requestAnimationFrame(() => {
        const target = id === "#formBackdrop" ? $("#eventName") : $(".close-button", backdrop);
        target?.focus();
      });
    },
    closeModal(id) {
      const backdrop = $(id);
      if (!backdrop.classList.contains("open")) return;
      backdrop.classList.remove("open");
      backdrop.setAttribute("aria-hidden", "true");
      if (!$(".modal-backdrop.open")) document.body.style.overflow = "";
      state.previousFocus?.focus?.();
    },
    closeAll() {
      ["#formBackdrop", "#detailBackdrop", "#confirmBackdrop"].forEach(id => UI.closeModal(id));
    },
    renderPalette() {
      const palette = $("#colorPalette");
      palette.replaceChildren();
      COLORS.forEach(color => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "color-swatch";
        button.style.setProperty("--swatch", color.value);
        button.setAttribute("role", "radio");
        button.setAttribute("aria-label", color.name);
        button.setAttribute("aria-checked", String(state.selectedColor === color.value));
        button.classList.toggle("selected", state.selectedColor === color.value);
        button.addEventListener("click", () => {
          state.selectedColor = color.value;
          UI.renderPalette();
        });
        palette.append(button);
      });
    },
    renderCards() {
      const grid = $("#counterGrid");
      grid.replaceChildren();
      const empty = $("#emptyState");
      empty.hidden = state.items.length > 0;
      $("#countPill").textContent = String(state.items.length).padStart(2, "0");
      $("#counterSummary").textContent = state.items.length
        ? `${state.items.length} ${plural(state.items.length, ["СОБЫТИЕ", "СОБЫТИЯ", "СОБЫТИЙ"])} В ВАШЕЙ КОЛЛЕКЦИИ`
        : "ВАША ЛИЧНАЯ ШКАЛА ВРЕМЕНИ";

      state.items.forEach((item, index) => {
        const card = document.createElement("article");
        card.className = "counter-card";
        card.tabIndex = 0;
        card.setAttribute("role", "button");
        card.setAttribute("aria-label", `Открыть счётчик: ${item.name}`);
        card.style.setProperty("--accent", item.color || COLORS[0].value);
        card.style.animationDelay = `${Math.min(index * 55, 300)}ms`;

        const top = document.createElement("div");
        top.className = "card-top";
        const nameWrap = document.createElement("div");
        nameWrap.className = "card-name-wrap";
        const dot = document.createElement("i");
        dot.className = "card-dot pulse";
        const name = document.createElement("span");
        name.className = "card-name";
        name.textContent = item.name;
        nameWrap.append(dot, name);

        const menu = document.createElement("button");
        menu.type = "button";
        menu.className = "card-menu";
        menu.setAttribute("aria-label", `Открыть ${item.name}`);
        menu.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/></svg>';
        menu.addEventListener("click", event => {
          event.stopPropagation();
          Router.openDetail(item.id);
        });
        top.append(nameWrap, menu);

        const timer = document.createElement("div");
        timer.className = "card-timer";
        timer.dataset.timerId = item.id;
        const footer = document.createElement("div");
        footer.className = "card-footer";
        const status = document.createElement("span");
        status.className = "card-status";
        status.dataset.statusId = item.id;
        const date = document.createElement("span");
        date.className = "card-date";
        date.textContent = Time.formatShort(Number(item.date));
        footer.append(status, date);

        card.append(top, timer, footer);
        if (item.description) {
          const description = document.createElement("p");
          description.className = "card-description";
          description.textContent = item.description;
          card.append(description);
        }
        card.addEventListener("click", () => Router.openDetail(item.id));
        card.addEventListener("keydown", event => {
          if (event.target === card && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            Router.openDetail(item.id);
          }
        });
        grid.append(card);
      });
      Render.updateAllTimers();
    },
    renderDetail() {
      const item = state.items.find(entry => entry.id === state.selectedId);
      if (!item) return;
      const accent = item.color || COLORS[0].value;
      $("#detailAccent").style.background = accent;
      $("#detailAccent").style.color = accent;
      $("#detailDot").style.background = accent;
      $("#detailDot").style.color = accent;
      $("#detailDot").style.boxShadow = `0 0 12px ${accent}`;
      $("#detailTimer").style.color = accent;
      $("#detailName").textContent = item.name;
      $("#detailDescription").textContent = item.description || "";
      $("#detailDescription").hidden = !item.description;
      $("#detailDate").textContent = Time.formatDate(Number(item.date));
      const isPast = Number(item.date) <= Date.now();
      $("#modeSwitch").hidden = !isPast;
      if (!isPast) state.detailMode = "remaining";
      $$(".mode-option").forEach(button => {
        button.classList.toggle("active", button.dataset.mode === state.detailMode);
        button.setAttribute("aria-pressed", String(button.dataset.mode === state.detailMode));
      });
      Render.updateDetailTimer();
    },
    openForm(item = null) {
      $("#counterForm").reset();
      clearErrors();
      $("#editingId").value = item?.id || "";
      $("#formTitle").innerHTML = item ? "Изменить<br><em>момент.</em>" : "Создать<br><em>момент.</em>";
      $("#formEyebrow").textContent = item ? "РЕДАКТИРОВАНИЕ" : "НОВОЕ СОБЫТИЕ";
      $("#submitLabel").textContent = item ? "Сохранить изменения" : "Создать счётчик";
      $("#eventName").value = item?.name || "";
      $("#eventDate").value = item ? toLocalInputValue(Number(item.date)) : "";
      $("#eventDescription").value = item?.description || "";
      state.selectedColor = item?.color || COLORS[0].value;
      UI.renderPalette();
      UI.openModal("#formBackdrop");
    }
  };

  const Render = {
    updateAllTimers() {
      const now = Date.now();
      state.items.forEach(item => {
        const node = $(`[data-timer-id="${CSS.escape(item.id)}"]`);
        const status = $(`[data-status-id="${CSS.escape(item.id)}"]`);
        if (!node) return;
        const parts = Time.parts(Number(item.date), now);
        node.replaceChildren();
        node.append(
          timePart(parts.days, "д"),
          separator(),
          timePart(parts.hours, "ч"),
          separator(),
          timePart(parts.minutes, "м"),
          separator(),
          timePart(parts.seconds, "с")
        );
        if (status) status.textContent = parts.future ? "ОСТАЛОСЬ ДО СОБЫТИЯ" : "ПРОШЛО С СОБЫТИЯ";
      });
      Render.updateDetailTimer(now);
    },
    updateDetailTimer(now = Date.now()) {
      const item = state.items.find(entry => entry.id === state.selectedId);
      if (!item || !$("#detailBackdrop").classList.contains("open")) return;
      const parts = Time.parts(Number(item.date), now);
      const mode = parts.future ? "remaining" : state.detailMode;
      const values = mode === "remaining" && parts.future
        ? [parts.days, parts.hours, parts.minutes, parts.seconds]
        : [parts.days, parts.hours, parts.minutes, parts.seconds];
      $("#detailTimer").replaceChildren(...values.map(value => {
        const span = document.createElement("span");
        span.textContent = Time.pad(value);
        return span;
      }));
      $("#detailStatus").textContent = parts.future
        ? "ДО СОБЫТИЯ ОСТАЛОСЬ"
        : mode === "elapsed" ? "ВРЕМЯ С МОМЕНТА СОБЫТИЯ" : "СОБЫТИЕ УЖЕ НАСТУПИЛО";
      if (!parts.future) {
        $("#modeSwitch").hidden = false;
        $$(".mode-option").forEach(button => {
          button.classList.toggle("active", button.dataset.mode === state.detailMode);
          button.setAttribute("aria-pressed", String(button.dataset.mode === state.detailMode));
        });
      }
    }
  };

  // Router: управление выбранным событием и экраном деталей.
  const Router = {
    openDetail(id) {
      state.selectedId = id;
      state.detailMode = "remaining";
      UI.renderDetail();
      UI.openModal("#detailBackdrop");
    },
    closeDetail() {
      UI.closeModal("#detailBackdrop");
      state.selectedId = null;
    }
  };

  function timePart(value, unit) {
    const wrapper = document.createElement("span");
    wrapper.className = "time-part";
    const number = document.createElement("span");
    number.textContent = String(value);
    const label = document.createElement("small");
    label.textContent = unit;
    wrapper.append(number, label);
    return wrapper;
  }
  function separator() {
    const node = document.createElement("span");
    node.className = "colon";
    node.textContent = ":";
    return node;
  }
  function plural(number, forms) {
    const n = Math.abs(number) % 100;
    const last = n % 10;
    if (n > 10 && n < 20) return forms[2];
    if (last > 1 && last < 5) return forms[1];
    if (last === 1) return forms[0];
    return forms[2];
  }
  function toLocalInputValue(timestamp) {
    const date = new Date(timestamp);
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(timestamp - offset).toISOString().slice(0, 16);
  }
  function clearErrors() {
    $("#nameError").textContent = "";
    $("#dateError").textContent = "";
    $$(".field").forEach(field => field.classList.remove("invalid"));
  }
  function validateForm(name, dateValue) {
    clearErrors();
    let valid = true;
    if (!name.trim()) {
      $("#nameError").textContent = "Введите название события.";
      $("#eventName").closest(".field").classList.add("invalid");
      valid = false;
    }
    const timestamp = dateValue ? new Date(dateValue).getTime() : NaN;
    if (!dateValue || !Number.isFinite(timestamp)) {
      $("#dateError").textContent = "Укажите корректную дату и время.";
      $("#eventDate").closest(".field").classList.add("invalid");
      valid = false;
    }
    return valid ? timestamp : null;
  }

  function saveCounter(event) {
    event.preventDefault();
    const name = $("#eventName").value;
    const date = validateForm(name, $("#eventDate").value);
    if (date === null) return;
    const id = $("#editingId").value;
    const existing = state.items.find(item => item.id === id);
    const item = {
      id: existing?.id || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`),
      name: name.trim(),
      date,
      description: $("#eventDescription").value.trim(),
      color: state.selectedColor,
      createdAt: existing?.createdAt || Date.now()
    };
    state.items = existing
      ? state.items.map(entry => entry.id === id ? item : entry)
      : [item, ...state.items];
    if (!Store.save(state.items)) return;
    UI.closeModal("#formBackdrop");
    if (existing && state.selectedId === id) UI.renderDetail();
    UI.renderCards();
    UI.toast(existing ? "Изменения сохранены" : "Новый момент добавлен");
  }

  function deleteSelected() {
    state.items = state.items.filter(item => item.id !== state.selectedId);
    Store.save(state.items);
    UI.closeModal("#confirmBackdrop");
    UI.closeModal("#detailBackdrop");
    state.selectedId = null;
    UI.renderCards();
    UI.toast("Счётчик удалён");
  }

  function bindEvents() {
    $("#createButton").addEventListener("click", () => UI.openForm());
    $("#addTopButton").addEventListener("click", () => UI.openForm());
    $("#emptyCreateButton").addEventListener("click", () => UI.openForm());
    $("#counterForm").addEventListener("submit", saveCounter);
    $$("[data-close]").forEach(button => button.addEventListener("click", () => {
      const type = button.dataset.close;
      if (type === "detail") Router.closeDetail();
      else UI.closeModal("#formBackdrop");
    }));
    ["#formBackdrop", "#detailBackdrop", "#confirmBackdrop"].forEach(id => {
      $(id).addEventListener("click", event => {
        if (event.target !== $(id)) return;
        if (id === "#detailBackdrop") Router.closeDetail();
        else UI.closeModal(id);
      });
    });
    $("#editButton").addEventListener("click", () => {
      const item = state.items.find(entry => entry.id === state.selectedId);
      if (!item) return;
      UI.closeModal("#detailBackdrop");
      UI.openForm(item);
    });
    $("#deleteButton").addEventListener("click", () => UI.openModal("#confirmBackdrop"));
    $("#cancelDelete").addEventListener("click", () => UI.closeModal("#confirmBackdrop"));
    $("#confirmDelete").addEventListener("click", deleteSelected);
    $$(".mode-option").forEach(button => button.addEventListener("click", () => {
      state.detailMode = button.dataset.mode;
      UI.renderDetail();
    }));
    $("#eventName").addEventListener("input", () => {
      if ($("#eventName").value.trim()) {
        $("#nameError").textContent = "";
        $("#eventName").closest(".field").classList.remove("invalid");
      }
    });
    $("#eventDate").addEventListener("input", () => {
      if ($("#eventDate").value) {
        $("#dateError").textContent = "";
        $("#eventDate").closest(".field").classList.remove("invalid");
      }
    });
    document.addEventListener("keydown", event => {
      if (event.key !== "Escape") return;
      if ($("#confirmBackdrop").classList.contains("open")) UI.closeModal("#confirmBackdrop");
      else if ($("#formBackdrop").classList.contains("open")) UI.closeModal("#formBackdrop");
      else if ($("#detailBackdrop").classList.contains("open")) Router.closeDetail();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        clearInterval(state.tick);
        state.tick = null;
      } else {
        Render.updateAllTimers();
        startClock();
      }
    });
  }

  function startClock() {
    if (state.tick) clearInterval(state.tick);
    state.tick = setInterval(Render.updateAllTimers, 1000);
  }

  function init() {
    $("#year").textContent = new Date().getFullYear();
    UI.renderPalette();
    UI.renderCards();
    bindEvents();
    startClock();
  }

  // PWA: service worker enables offline use after the first visit.
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(error => {
        console.warn("Service worker registration failed:", error);
      });
    });
  }

  init();
})();