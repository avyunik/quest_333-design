const app = document.querySelector("#app");
const catalog = (await (await fetch("/preview/warm-v3/catalog.json")).json())
  .screens;
let state = null,
  screenId = new URL(location.href).searchParams.get("screen") || "host-01",
  selected = null,
  notice = "",
  lastError = false,
  showIndex = false;
const esc = (x) =>
  String(x ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const btn = (text, action, value = "", extra = "") =>
  `<button data-action="${action}" data-value="${esc(value)}" ${extra}>${text}</button>`;
const panel = (title, body, cls = "") =>
  `<section class="panel ${cls}"><h2>${title}</h2>${body}</section>`;
const status = (t) => `<p class="status">${esc(t)}</p>`;
const names = ["Алексей", "Мария", "Игорь", "Елена", "Антон"];
const teamName = (t) => (t === "alpha" ? "Янтарь" : "Полярная");
const item = (name, small = false) =>
  `<span class="product ${small ? "small" : ""}" data-item="${esc(name)}"><span class="product-shape"><img width="28" height="28" src="/assets/warm-redesign-v3/${["Лампа", "Свеча"].includes(name) ? "lamp" : ["Атлас", "Календарь"].includes(name) ? "book" : name === "Радио" ? "radio" : ["Соус", "Вода", "Термос"].includes(name) ? "bottle" : "tin"}.svg" alt=""></span><span>${esc(name)}</span></span>`;
async function request(path, body) {
  const r = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await r.json();
  if (!r.ok) throw Error(d.error);
  return d;
}
async function action(action, value, extra = {}) {
  try {
    state = await request("/api/action", { action, value, ...extra });
    notice = "Готово";
    lastError = false;
    render();
  } catch (e) {
    notice = e.message;
    lastError = true;
    render();
  }
}
function go(id) {
  screenId = id;
  history.pushState({}, "", `/preview/warm-v3/?screen=${id}`);
  selected = null;
  notice = "";
  render();
}
window.onpopstate = () => {
  screenId = new URL(location.href).searchParams.get("screen") || "host-01";
  render();
};
function login(role) {
  return `<form id="login" class="login panel"><span class="eyebrow">${role === "host" ? "СЛУЖЕБНЫЙ ВХОД" : "ПРИСОЕДИНИТЬСЯ К ИГРЕ"}</span><h2>${role === "host" ? "Панель ведущего" : "Ваша смена начинается"}</h2><p>Самостоятельный прототип · демонстрационная сессия</p><label>Ваше имя<input name="name" required maxlength="40" value="${role === "host" ? "Ведущий" : "Алексей"}"></label>${role === "host" ? '<label>Код ведущего<input name="code" required placeholder="PREVIEW-HOST"></label><small>Демонстрационный код: PREVIEW-HOST</small>' : `<label>Участник<select name="player">${names.map((n, i) => `<option value="${i}">${i + 1}. ${n}</option>`).join("")}</select></label>`}<label>Команда<select name="team"><option value="alpha">Янтарь</option><option value="beta">Полярная</option></select></label><button class="primary" type="submit">${role === "host" ? "Открыть панель" : "Войти в лобби"} →</button></form>`;
}
function teamProgress() {
  return panel(
    "Две команды · эфир",
    Object.entries(state.teams)
      .map(
        ([t, v]) =>
          `<article class="team"><div><span class="dot"></span><strong>${teamName(t)}</strong><span class="muted">5 участников</span></div><p>${v.ready ? "✓ Команда готова" : "В работе"} · ${Array.isArray(v.attempts) ? v.attempts.length : v.attempts} попыток</p><div class="progress"><i style="width:${v.ready ? 100 : 0}%"></i></div></article>`,
      )
      .join(""),
  );
}
function hostTools() {
  return panel(
    "Пульт ведущего",
    `<p class="muted">Управление обеими командами. Состояние хранится на preview-сервере.</p><div class="stack"><label>Команда в фокусе<select id="focus-team"><option value="alpha" ${state.team === "alpha" ? "selected" : ""}>Янтарь</option><option value="beta" ${state.team === "beta" ? "selected" : ""}>Полярная</option></select></label><label>Текущий этап<select id="episode">${["prologue", "postomat", "telephone-book", "phone-booth", "shelf", "station-gauges", "road-map", "picture-puzzle", "drum-cash-register", "fork", "finale"].map((e, i) => `<option value="${e}" ${state.episode === e ? "selected" : ""}>${i + 1}. ${catalog.find((c) => c.role === "host" && c.slug === e)?.title || e}</option>`).join("")}</select></label>${btn(state.paused ? "Продолжить таймер" : "Пауза таймера", "pause")}${btn("+ 2 минуты", "extend")}${btn("Подсказка · Янтарь", "hint", "", 'data-team="alpha"')}${btn("Подсказка · Полярная", "hint", "", 'data-team="beta"')}</div><details><summary>Служебные материалы</summary><p>Попросите команды проговорить наблюдения. Не называйте ответ до завершения обсуждения.</p></details>`,
  );
}
function shelf(source) {
  const own = state.own;
  const reconstruct = state.phase === "reconstruct";
  return `<p class="instruction">${reconstruct ? "Выберите предмет, затем место. Можно перетащить мышью; на телефоне используйте нажатия." : "Запомните 14 предметов и их места. После скрытия эталон останется только у ведущего."}</p><div class="shelf">${(source || own.shelf).map((x, i) => `<button class="slot" data-slot="${i}" aria-label="Место ${i + 1}${x ? ", " + esc(x) : ", пусто"}"><span class="slot-number">${i + 1}</span>${x ? item(x) : '<span class="empty-slot">＋</span>'}</button>`).join("")}</div>${
    reconstruct && !source
      ? `<h3>Предметы на прилавке</h3><div class="inventory">${state.shelfCards
          .filter((x) => !own.shelf.includes(x) && !own.discard.includes(x))
          .map(
            (x) =>
              `<button draggable="true" data-card="${esc(x)}" aria-pressed="${selected === x}" class="${selected === x ? "selected" : ""}">${item(x, true)}</button>`,
          )
          .join(
            "",
          )}</div><p class="muted">${selected ? "Выбрано: " + esc(selected) : "Выберите карточку для размещения или удаления"}</p><div class="actions">${btn("Убрать выбранный предмет", "discard", selected || "", !selected ? "disabled" : "")}${btn("Проверить порядок", "checkShelf", "", 'class="primary"')}</div>${status(own.answers.shelf || "Проверка пока не выполнена")}`
      : ""
  }`;
}
function book() {
  return `<div class="book"><span class="eyebrow">АРХИВ СТАНЦИИ · 1998</span><h3>Телефонная книга</h3><p>Если связь оборвалась,<br>найди дорогу в старых записях.</p><hr><p>Трижды повтори номер станции: <b>3</b>.<br>Затем набери год на календаре: <b>1998</b>.</p><p class="handwritten">Сначала станция. Потом время.</p></div>`;
}
function answer(kind, label, placeholder) {
  return `<form data-answer="${kind}" class="answer"><label>${label}<input name="answer" required placeholder="${placeholder}" autocomplete="off" ${kind === "phone" ? 'inputmode="numeric"' : ""}></label><button type="submit" class="primary">${kind === "phone" ? "Набрать номер" : "Отправить ответ"} →</button></form>${status(state.own.answers[kind] || "Ответ ещё не отправлен")}`;
}
function drums(t) {
  let data = state.role === "host" ? state.teams[t] : state.own;
  return `<div class="register"><div class="register-top">СТАНЦИЯ 3:33 · СЛУЖЕБНАЯ КАССА</div><div class="drums">${data.drums.map((word, i) => `<label><span>${i + 1} · ${names[i]}</span><select aria-label="Барабан ${i + 1} ${t}" data-drum="${i}" data-team="${t}" ${state.role !== "host" && !state.ownedDrums.includes(i) ? "disabled" : ""}>${["ночь", "ключ", "дорога", "атлас", "333"].map((w) => `<option ${word === w ? "selected" : ""}>${w}</option>`).join("")}</select></label>`).join("")}</div><div class="actions">${btn("Дёрнуть рычаг ↘", "pull", "", 'class="primary" data-team="' + t + '"')}<span>Пять слов. Только число совпадений.</span></div></div><ol class="attempts">${data.attempts.map((a, i) => `<li>Попытка ${i + 1}<strong>${a.matches} из 5 совпало</strong></li>`).join("") || "<li>Рычаг ещё не использован</li>"}</ol>`;
}
function pilot(s) {
  const host = state.role === "host";
  if (s.slug === "telephone-book")
    return (
      panel(
        "Материалы станции",
        book() + answer("phone", "Восстановленный номер", "7 цифр"),
        "material",
      ) +
      (host
        ? panel(
            "Проверка и помощь",
            `<details><summary>Ответ и порядок восстановления</summary><p>${state.phoneKey}</p></details><p>Команды изучают одну памятку. Отдельные ответы сохраняются на сервере.</p>${Object.entries(
              state.teams,
            )
              .map(
                ([t, v]) =>
                  `<article class="team"><h3>${teamName(t)}</h3>${status(v.answers.phone || "Номер ещё не найден")}${btn("Дать подсказку", "hint", "", 'data-team="' + t + '"')}</article>`,
              )
              .join("")}`,
          )
        : "")
    );
  if (["shelf", "shelf-memorize", "shelf-reconstruct"].includes(s.slug))
    return (
      panel(
        "Лавка у трассы · 14 мест",
        host
          ? shelf(state.shelfKey)
          : shelf(state.phase === "memorize" ? state.shelfSource : null),
        "wide",
      ) +
      (host
        ? panel(
            "Фазы полки",
            `${btn("Показать · 60 секунд", "phase", "memorize")}${btn("Скрыть эталон", "phase", "reconstruct")}<p>Эталон ведущего остаётся доступным.</p>${btn("Вернуть удалённые карточки", "restoreShelf")}${Object.entries(
              state.teams,
            )
              .map(
                ([t, v]) =>
                  `<h3>${teamName(t)}</h3>${status(v.answers.shelf || "Ожидаем проверку")}`,
              )
              .join("")}`,
          )
        : panel(
            "Следующий шаг",
            `${status(state.phase === "memorize" ? "Полка видна. Запомните расположение." : "Полка скрыта. Восстановите порядок.")}${btn(state.phase === "memorize" ? "Я запомнил · готов" : "Сборка завершена · готов", "ready", "", 'class="primary"')}<p>Готовность не скрывает полку у других игроков. Фазу завершает таймер или ведущий.</p>`,
          ))
    );
  if (s.slug === "drum-cash-register")
    return (
      (host ? ["alpha", "beta"] : [state.team])
        .map((t) => panel(teamName(t) + " · пять барабанов", drums(t)))
        .join("") +
      (host
        ? panel(
            "Скрытый ключ",
            `<details><summary>Показать эталон ведущего</summary><p>${state.drumKey.join(" · ")}</p></details>${btn("Сбросить попытки команды в фокусе", "resetDrums")}`,
          )
        : "")
    );
  return null;
}
function landing() {
  return `<section class="landing"><span class="eyebrow">КОМАНДНЫЙ КВЕСТ · НОЧНАЯ СМЕНА</span><h1>Некоторые дороги<br>ведут к <em>3:33</em></h1><p>Одна заправка. Две команды. История, в которой<br>всё решают ваши слова и общая память.</p><div class="actions">${btn("Войти в игру →", "nav", "player-01", 'class="primary"')}${btn("Я ведущий", "nav", "host-02")}</div><div class="facts"><span><b>75</b> минут по исходному лендингу</span><span><b>2</b> команды</span><span><b>28</b> экранов прототипа</span></div></section>`;
}
function render() {
  const s = catalog.find((x) => x.id === screenId) || catalog[0];
  const target = s.role;
  const host = state?.role === "host";
  app.innerHTML = `<div class="ambient"></div><header><a href="/preview/warm-v3/?screen=host-01" class="brand">ЗАПРАВКА <b>3:33</b><small>НОЧНАЯ СМЕНА</small></a><nav>${btn("Все экраны · 28", "index")}${state ? btn("Текущий этап", "live") : ""}${btn("Ведущий", "nav", "host-05")}${btn("Игрок", "nav", "player-01")}</nav><span class="session">${state ? esc(state.name) + " · " + teamName(state.team) : "Вне сессии"}</span></header><div class="preview-banner">WARM V3 · ИНТЕРАКТИВНЫЙ ПРОТОТИП <span>Демонстрационные данные · общая локальная сессия</span>${state ? btn("Сменить роль", "logout") : ""}</div>${showIndex ? `<aside class="catalog"><h2>Все экраны</h2>${catalog.map((c) => btn(c.id + " · " + c.title, "nav", c.id, `class="${screenId === c.id ? "active" : ""}"`)).join("")}</aside>` : ""}<main>${screenId === "host-01" ? landing() : !state || target !== state.role ? `<div class="entry"><div><span class="eyebrow">ЗА ЛИНИЕЙ ПРИВЫЧНОГО</span><h1>Добро пожаловать<br>на ночную смену.</h1><p>Выберите свою команду и войдите в отдельную preview-сессию.</p></div>${login(target)}</div>` : `<div class="episode-heading"><div><div class="eyebrow">${host ? "ПУЛЬТ ВЕДУЩЕГО" : "КОМАНДА " + teamName(state.team)} · ${s.id}</div><h1>${s.title}</h1><p>${descriptions[s.slug] || "Вместе вы найдёте путь. Следите за действиями ведущего."}</p></div><div class="clock"><span>${state.paused ? "ПАУЗА" : "ТАЙМЕР ПОЛКИ"}</span><strong id="timer"></strong><small>${state.phase === "memorize" ? "Запоминание" : "Восстановление"}</small></div></div><div class="workspace"><div class="content-grid">${state.own.answers.hint ? panel("Подсказка ведущего", status(state.own.answers.hint), "wide") : ""}${pilot(s) ?? other(s)}</div>${host ? `<aside class="sidebar">${teamProgress()}${hostTools()}</aside>` : ""}</div><footer>${btn("← Предыдущий экран", "nav", catalog[Math.max(0, catalog.indexOf(s) - 1)].id)}<span>${catalog.indexOf(s) + 1} / 28</span>${btn("Следующий экран →", "nav", catalog[Math.min(27, catalog.indexOf(s) + 1)].id)}</footer>`}</main><div class="toast ${lastError ? "error" : ""}" role="status" aria-live="polite">${esc(notice)}</div>`;
  bind();
  tick();
}
const descriptions = {
  "telephone-book":
    "Старая памятка хранит номер. Сопоставьте записи и восстановите связь.",
  shelf: "Покажите полку, дайте время запомнить и начните восстановление.",
  "shelf-memorize": "Четырнадцать предметов. Запомните каждый на своём месте.",
  "shelf-reconstruct":
    "Верните предметы на места. Лишнее оставьте за пределами полки.",
  "drum-cash-register":
    "Пять барабанов. Общая комбинация. Один рывок до новой догадки.",
};
function other(s) {
  const host = state.role === "host",
    own = state.own;
  switch (s.slug) {
    case "lobby":
      return (
        panel(
          "Ваша команда",
          `<p>Вы в команде <b>${teamName(state.team)}</b>. Ваше место: ${state.player + 1}.</p><div class="choices">${names.map((n, i) => `<div class="team">${n} ${i === state.player ? "· это вы" : ""}<span class="muted"> · место в демонстрационной команде</span></div>`).join("")}</div>${btn("Я готов", "ready", "", 'class="primary"')}${status(own.ready ? "Готовность отправлена ведущему" : "Проверьте имя и команду, затем подтвердите готовность.")}`,
        ) +
        panel(
          "Что будет дальше",
          "<h3>Ночная смена</h3><p>Ведущий запустит историю, затем вы распределите роли. Обсуждайте задания вместе, но не показывайте другим личные материалы.</p>",
        )
      );
    case "host-signin":
      return panel(
        "Панель открыта",
        `<p>Вы вошли как ${esc(state.name)}. Все демонстрационные команды доступны в пульте.</p>${btn("Перейти к прологу", "nav", "host-03", 'class="primary"')}`,
      );
    case "prologue":
      return (
        panel(
          "Пролог · «На минуту»",
          media("Вступление") +
            (host
              ? `<div class="actions">${btn("Начать почтомат", "episode", "postomat", 'class="primary"')}${btn("Открыть почтомат", "nav", "host-04")}</div>`
              : status("Ожидайте запуска первого задания ведущим.")),
          "wide",
        ) +
        (host
          ? panel(
              "Сценарий ведущего",
              "<p>Вы остановились всего на минуту. Часы на станции показывают 3:33. Спросите команды, какие детали они заметили.</p>",
            )
          : "")
      );
    case "postomat-role":
      return panel(
        "Кто загадывает?",
        `<p>Загадывающий получает координату и даёт одно слово без координат. Отгадывающий выбирает ячейку. Ведущий подтверждает роли.</p><div class="choices">${btn("Я загадываю", "role", "giver", `aria-pressed="${state.roles[state.team] === state.player}" ${state.confirmed ? "disabled" : ""}`)}${btn("Я отгадываю", "role", "guesser", state.confirmed ? "disabled" : "")}</div>${status(state.confirmed ? "Роли подтверждены. Можно начать раунд." : "Ждём выбора команды и подтверждения ведущего.")}${state.confirmed ? btn("Открыть почтомат", "nav", "player-04", 'class="primary"') : ""}`,
      );
    case "postomat":
    case "postomat-game":
      return panel(
        "Почтомат · поле 5 × 5",
        `${
          host
            ? `${btn("Подтвердить роли обеих команд", "confirm", "", 'class="primary"')}<p>Загадывающие: ${
                Object.entries(state.roles)
                  .map(([t, p]) => teamName(t) + " — " + names[p])
                  .join("; ") || "ещё не выбраны"
              }</p>`
            : ""
        }${state.coordinate ? `<details><summary>Личная координата ${host ? "ведущего" : "загадывающего"}</summary><p>${state.coordinate}</p></details>` : ""}${!host && state.roles[state.team] === state.player ? `<form id="clue"><label>Одно слово-подсказка<input name="clue" required></label><button class="primary" ${!state.confirmed ? "disabled" : ""}>Отправить подсказку</button></form>` : ""}<p>Подсказка: <b>${esc(state.clue || "Ожидаем слово")}</b></p><div class="cells">${["А", "Б", "В", "Г", "Д"].flatMap((row) => [1, 2, 3, 4, 5].map((n) => btn(row + n, "cell", row + n, !state.confirmed || host || state.roles[state.team] === state.player ? "disabled" : ""))).join("")}</div>${status(own.answers.cell || "Координату выбирает отгадывающий")}`,
        "wide",
      );
    case "phone-booth":
      return panel(
        "Запись из будки",
        `<div class="media-placeholder"><strong>Связь на линии</strong><p>Исходная аудиозапись не приложена.<br>Добавьте файл для проверки восстановления фразы.</p><audio id="recording" controls aria-label="Запись из будки"></audio></div><label>Скорость записи<select id="speed"><option value="0.5">0,5×</option><option value="1" selected>1×</option><option value="1.5">1,5×</option><option value="2">2×</option></select></label>${answer("phrase", "Что вы услышали?", "Введите фразу")}${host ? "<details><summary>Демонстрационный ответ</summary><p>" + state.phraseKey + "</p></details>" : ""}`,
        "wide",
      );
    case "station-gauges":
      return (host ? Object.entries(state.teams) : [[state.team, own]])
        .map(([t, v]) =>
          panel(
            teamName(t) + " · общий пульт",
            `${v.gauges.map((n, i) => `<div class="gauge"><label>${["Вентиляция", "Давление", "Питание", "Температура"][i]} · ${n}%<meter min="0" max="100" low="40" high="60" optimum="50" value="${n}"></meter></label><small>Зелёная зона 40–60%. Рычаг: ${names[i]}.</small></div>`).join("")}<p>Сейчас ходит: <b>${names[v.turn % 4]}</b></p><div class="actions">${state.leverActions[v.turn % 4].map((n) => btn(n === 0 ? "Не трогать" : n > 0 ? "+ Добавить" : "− Убавить", "gauge", n, `${!host && state.player !== v.turn % 4 ? "disabled" : ""} data-team="${t}"`)).join("")}</div>${host ? `<div class="actions">${btn("Нормализовать · случайный перекос", "normalize", "", 'data-team="' + t + '"')}${btn("Аварийный сброс", "emergency", "", 'class="danger" data-team="' + t + '"')}</div>` : status("Доступны только действия назначенного рычага в свой ход.")}`,
          ),
        )
        .join("");
    case "road-map":
      return (
        panel(
          "Ваш фрагмент карты",
          `${state.privatePicture ? `<div class="private-art"><img src="/api/picture" alt="Ассоциация: ${state.privatePicture}" width="480" height="240"><p>Опишите увиденное словами. Не показывайте изображение команде.</p></div>` : status("Сейчас описывает активный игрок. Ваша картинка недоступна до вашей очереди.")}${host ? `${btn("Следующий активный игрок", "nextPlayer")}<details><summary>Все картинки и эталон</summary><p>${state.allPictures.join(" · ")}</p><p>${state.routeKey.join(" → ")}</p></details>` : ""}`,
        ) +
        panel(
          "Соберите маршрут",
          `<div class="route">${own.route.map((x, i) => `<span>${i + 1}. ${x}</span>`).join("") || "<p>Маршрут пока пуст</p>"}</div><div class="choices">${["Лес", "Мост", "Станция", "Луна", "Река"].map((x) => btn(x, "route", x)).join("")}</div><div class="actions">${btn("Убрать последнюю точку", "undoRoute")}${btn("Проверить маршрут", "checkRoute", "", 'class="primary"')}</div>${status(own.answers.route || "Выберите три точки. Среди вариантов есть лишние.")}`,
        )
      );
    case "picture-puzzle":
      return (
        panel(
          "Доска рисующего",
          `${state.riddle ? `<p class="paper-note">${state.riddle}</p>` : status("Рисует " + names[own.active] + ". Отгадайте ответ одним словом.")}<canvas id="drawing" class="drawboard" aria-label="Общий рисунок одним цветом" width="800" height="400"></canvas>${host || state.player === state.own.active ? btn("Очистить доску", "draw", "") : ""}<p class="muted">Рисование мышью или пальцем. Только янтарный цвет.</p>`,
        ) +
        panel(
          "Ответ команды",
          `${host || state.player !== state.own.active ? answer("puzzle", "Одно слово", "Что изображено?") : status("Вы рисуете. Ответ вводит другой участник.")}${status(own.puzzleStatus)}${host ? `${btn("Следующий рисующий", "nextPlayer")}<div class="actions">${btn("Принять ответ", "accept", "", 'class="primary"')}${btn("Отклонить", "reject", "", 'class="danger"')}${btn("Дать подсказку", "hint")}</div><details><summary>Предыдущие и будущие загадки</summary><ol>${state.riddles.map((x) => "<li>" + x + "</li>").join("")}</ol></details>` : ""}`,
        )
      );
    case "fork":
      return (
        panel(
          "Развилка · тур " + state.round,
          `<p>Обсудите дороги, затем проголосуйте тайно. Свой голос можно изменить до подведения итогов.</p><div class="choices">${[
            ["Лес", "Тихая тропа среди сосен. Неизвестный короткий путь."],
            ["Тоннель", "Старая дорога под холмом. Здесь пропадает связь."],
            ["Шоссе", "Освещённый объезд. Дальше, зато знакомо."],
          ]
            .map(
              ([name, text]) =>
                `<div class="route-card"><h3>${name}</h3><p>${text}</p>${btn("Выбрать " + name, "vote", name, `aria-pressed="${own.myVote === name}" ${own.voteResult ? "disabled" : ""}`)}</div>`,
            )
            .join(
              "",
            )}</div>${status(own.myVote ? "Ваш голос: " + own.myVote : "Голос ещё не отправлен")}${status(own.voteResult || "Итог объявит ведущий")}`,
        ) +
        (host
          ? panel(
              "Распределение и готовность",
              Object.entries(state.teams)
                .map(
                  ([t, v]) =>
                    `<h3>${teamName(t)}</h3><p>${Object.keys(v.votes).length} из 5 проголосовали</p><p>${["Лес", "Тоннель", "Шоссе"].map((x) => x + ": " + Object.values(v.votes).filter((z) => z === x).length).join(" · ")}</p>${btn("Подвести итог", "resolve", "", 'data-team="' + t + '"')}${btn("Новый тур при ничьей", "round", "", 'data-team="' + t + '"')}${status(v.voteResult || "Тур открыт")}`,
                )
                .join(""),
            )
          : "")
      );
    case "finale":
      return (
        panel(
          "Конец ночной смены",
          media("Финал") +
            `<p>Финальный ролик отсутствует среди исходников. Для исследования следующего состояния используйте отдельный переход.</p>${btn("Preview: перейти к результатам", "nav", host ? "host-13" : "player-15", 'class="primary"')}${host ? `${btn("Завершить сессию", "finish")}<details><summary>Финальные реплики ведущего</summary><p>Спросите команды: что помогло найти общий путь? Поблагодарите каждого за ночную смену.</p></details>${state.finished ? status("Демонстрационная сессия завершена") : ""}` : ""}`,
          "wide",
        ) + (host ? results() : "")
      );
    case "results":
      return results();
    default:
      return panel("Ночная смена", status("Выберите экран в каталоге."));
  }
}
function pictureFile(name) {
  return {
    Лес: "forest",
    Мост: "bridge",
    Станция: "station",
    Луна: "moon",
    Река: "river",
  }[name];
}
function media(title) {
  return `<div class="media-placeholder"><strong>${title} · 3:33</strong><video controls playsinline aria-label="${title}" poster="/assets/warm-redesign-v3/station.webp"></video><p>Видео не приложено к дизайн-материалам.</p></div>`;
}
function results() {
  return panel(
    "Итоги ночной смены",
    `<p>Демонстрационная статистика текущей сессии. Баллы и время платформы не моделируются.</p><div class="stats"><div><b>${state.own.attempts.length}</b>попыток кассы</div><div><b>${state.own.hints}</b>подсказок</div><div><b>${state.own.route.length}</b>точек маршрута</div></div><p>Последний маршрут: ${esc(state.own.voteResult || "ещё не определён")}</p><div class="photo">Ваша ночная смена · 3:33</div><p>Иллюстрация станции — памятная открытка прототипа, не фото команды.</p><a class="download" href="/assets/warm-redesign-v3/station.webp" download="night-shift.webp">Сохранить открытку ↓</a>`,
    "wide",
  );
}

function tick() {
  const el = document.querySelector("#timer");
  if (el && state) {
    let sec = Math.ceil(
      state.paused
        ? state.remaining
        : Math.max(0, state.deadline - Date.now() / 1000),
    );
    el.textContent =
      Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0");
  }
}
function bind() {
  bindExtra();
  document.querySelectorAll("[data-action]").forEach(
    (el) =>
      (el.onclick = async () => {
        const a = el.dataset.action,
          v = el.dataset.value;
        if (a === "draw") {
          await action("draw", []);
          return;
        }
        if (a === "live") {
          const slug = state.episode;
          go(
            (
              catalog.find((x) => x.role === state.role && x.slug === slug) ||
              catalog.find(
                (x) => x.role === state.role && x.slug === "postomat-game",
              ) ||
              catalog[0]
            ).id,
          );
          return;
        }
        if (a === "nav") {
          go(v);
          return;
        }
        if (a === "index") {
          showIndex = !showIndex;
          render();
          return;
        }
        if (a === "logout") {
          await request("/api/logout", {});
          state = null;
          render();
          return;
        }
        await action(a, a === "gauge" ? Number(v) : v, {
          team: el.dataset.team,
        });
      }),
  );
  const form = document.querySelector("#login");
  if (form)
    form.onsubmit = async (e) => {
      e.preventDefault();
      try {
        const d = Object.fromEntries(new FormData(form));
        await request("/api/login", {
          ...d,
          role: catalog.find((s) => s.id === screenId).role,
        });
        state = await request("/api/state");
        notice = "Вы вошли в демонстрационную сессию";
        render();
      } catch (e) {
        notice = e.message;
        lastError = true;
        render();
      }
    };
  document.querySelectorAll("[data-answer]").forEach(
    (f) =>
      (f.onsubmit = (e) => {
        e.preventDefault();
        action("answer", new FormData(f).get("answer"), {
          kind: f.dataset.answer,
        });
      }),
  );
  document
    .querySelectorAll("[data-drum]")
    .forEach(
      (el) =>
        (el.onchange = () =>
          action("drum", el.value, {
            index: Number(el.dataset.drum),
            team: el.dataset.team,
          })),
    );
  document.querySelectorAll("[data-card]").forEach((el) => {
    el.onclick = () => {
      selected = el.dataset.card;
      render();
    };
    el.ondragstart = (e) => {
      selected = el.dataset.card;
      e.dataTransfer.setData("text/plain", selected);
    };
  });
  document.querySelectorAll("[data-slot]").forEach((el) => {
    const place = async () => {
      if (state.role === "host" || state.phase !== "reconstruct") return;
      if (!selected) {
        selected = state.own.shelf[Number(el.dataset.slot)];
        render();
        return;
      }
      const arr = state.own.shelf.map((x) => (x === selected ? null : x));
      arr[Number(el.dataset.slot)] = selected;
      selected = null;
      await action("shelf", arr);
    };
    el.onclick = place;
    el.ondragover = (e) => e.preventDefault();
    el.ondrop = (e) => {
      e.preventDefault();
      place();
    };
  });
}
try {
  state = await request("/api/state");
} catch {}
render();
setInterval(tick, 1000);
setInterval(async () => {
  if (!state) return;
  try {
    const next = await request("/api/state");
    const changed =
      JSON.stringify({ ...state, deadline: 0 }) !==
      JSON.stringify({ ...next, deadline: 0 });
    state = next;
    if (
      changed &&
      !document.querySelector("input:focus,select:focus,canvas:active")
    )
      render();
  } catch {
    notice = "Связь с сервером потеряна. Повторяем подключение.";
    document.querySelector(".toast").textContent = notice;
  }
}, 1500);

function bindExtra() {
  const focus = document.querySelector("#focus-team");
  if (focus) focus.onchange = () => action("focusTeam", focus.value);
  const ep = document.querySelector("#episode");
  if (ep) ep.onchange = () => action("episode", ep.value);
  const clue = document.querySelector("#clue");
  if (clue)
    clue.onsubmit = (e) => {
      e.preventDefault();
      action("clue", new FormData(clue).get("clue"));
    };
  const speed = document.querySelector("#speed");
  if (speed)
    speed.onchange = () => {
      document.querySelector("#recording").playbackRate = Number(speed.value);
    };
  const canvas = document.querySelector("#drawing");
  if (canvas) {
    const ctx = canvas.getContext("2d");
    let drawing = false,
      points = state.own.drawing.slice();
    function paint() {
      ctx.clearRect(0, 0, 800, 400);
      ctx.strokeStyle = "#e6b36d";
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.beginPath();
      points.forEach((p, i) => {
        if (
          !i ||
          (p[0] === 0 && p[1] === 0) ||
          (points[i - 1][0] === 0 && points[i - 1][1] === 0)
        )
          ctx.moveTo(p[0] * 800, p[1] * 400);
        else ctx.lineTo(p[0] * 800, p[1] * 400);
      });
      ctx.stroke();
    }
    paint();
    if (state.role === "host" || state.player === state.own.active) {
      canvas.onpointerdown = (e) => {
        drawing = true;
        canvas.setPointerCapture(e.pointerId);
        const r = canvas.getBoundingClientRect();
        points.push(
          [0, 0],
          [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height],
        );
      };
      canvas.onpointermove = (e) => {
        if (!drawing) return;
        const r = canvas.getBoundingClientRect();
        points.push([
          Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
          Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
        ]);
        paint();
      };
      canvas.onpointerup = canvas.onpointercancel = () => {
        drawing = false;
        action("draw", points.slice(-2000));
      };
    }
  }
}
