"""Isolated preview server. No production sessions or V2 data are accessed."""

from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from http.cookies import SimpleCookie
import json, secrets, time, threading, argparse

ROOT = Path(__file__).resolve().parent
LOCK = threading.RLock()
SESSIONS = {}
ITEMS = [
    "Кофе",
    "Мыло",
    "Атлас",
    "Лампа",
    "Соус",
    "Термос",
    "Свеча",
    "Чай",
    "Крекер",
    "Шнур",
    "Радио",
    "Календарь",
    "Вода",
    "Аптечка",
]
WORDS = ["ночь", "ключ", "дорога", "атлас", "333"]
LEVER_ACTIONS = [[-1, 0, 1], [0, 1], [-1, 0], [-1, 0, 1]]


def fresh():
    return {
        "episode": "prologue",
        "phase": "memorize",
        "deadline": time.time() + 60,
        "paused": False,
        "remaining": 60,
        "roles": {},
        "confirmed": False,
        "clue": "",
        "teams": {
            t: {
                "answers": {},
                "attempts": [],
                "shelf": [None] * 14,
                "discard": [],
                "gauges": [35, 65, 25, 75],
                "turn": 0,
                "route": [],
                "drums": ["ночь"] * 5,
                "votes": {},
                "voteResult": None,
                "drawing": [],
                "puzzleStatus": "Ожидаем рисунок",
                "hints": 0,
                "ready": False,
                "active": 0,
                "clue": "",
            }
            for t in ["alpha", "beta"]
        },
        "round": 1,
        "finished": False,
    }


STATE = fresh()


def session(cookie):
    c = SimpleCookie(cookie or "")
    return SESSIONS.get(c["warm_session"].value) if "warm_session" in c else None


def public_state(s):
    if (
        STATE["phase"] == "memorize"
        and time.time() >= STATE["deadline"]
        and not STATE["paused"]
    ):
        STATE["phase"] = "reconstruct"
    team = STATE["teams"][s["team"]]
    host = s["role"] == "host"
    d = {
        k: STATE[k]
        for k in [
            "episode",
            "phase",
            "deadline",
            "paused",
            "remaining",
            "confirmed",
            "clue",
            "round",
            "finished",
        ]
    }
    d.update(
        role=s["role"],
        name=s["name"],
        team=s["team"],
        player=s["player"],
        roles=STATE["roles"],
        teams={
            t: {
                "attempts": len(v["attempts"]),
                "ready": v["ready"],
                "hints": v["hints"],
                "route": v["route"],
                "votesReady": len(v["votes"]),
                "voteResult": v["voteResult"],
            }
            for t, v in STATE["teams"].items()
        },
    )
    d["own"] = {
        k: v for k, v in team.items() if k not in ["votes", "answers", "attempts"]
    }
    d["clue"] = team["clue"]
    d["own"]["myVote"] = team["votes"].get(s["player"])
    d["own"]["answers"] = team["answers"]
    d["own"]["attempts"] = [{"matches": a["matches"]} for a in team["attempts"]]
    d["leverActions"] = LEVER_ACTIONS
    d["ownedDrums"] = [s["player"]] if s["player"] < 5 else []
    if host:
        d.update(
            teams=STATE["teams"],
            shelfKey=ITEMS,
            drumKey=WORDS,
            coordinate="В3",
            phoneKey="3331998",
            phraseKey="свет укажет путь",
            routeKey=["Лес", "Мост", "Станция"],
            puzzleKey="маяк",
            riddles=[
                "Что помогает кораблям найти берег?",
                "Что открывает закрытую дверь?",
            ],
            allPictures=["Лес", "Мост", "Станция", "Луна", "Река"],
        )
    if host or (STATE["phase"] == "memorize"):
        d["shelfSource"] = ITEMS
    if STATE["phase"] == "reconstruct":
        d["shelfCards"] = sorted(ITEMS + ["Батарейка", "Компас"])
    if host or (STATE["confirmed"] and STATE["roles"].get(s["team"]) == s["player"]):
        d["coordinate"] = "В3"
    if host or s["player"] == team["active"]:
        d.update(
            riddle="Что помогает кораблям найти берег?",
            privatePicture=["Лес", "Мост", "Станция", "Луна", "Река"][team["active"]],
        )
    return d


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def send_json(self, data, status=200, cookie=None):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        if cookie:
            self.send_header("Set-Cookie", cookie)
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.startswith("/api/"):
            with LOCK:
                s = session(self.headers.get("Cookie"))
                if not s:
                    return self.send_json({"error": "Войдите в preview"}, 401)
                if self.path == "/api/picture":
                    if (
                        s["role"] != "host"
                        and s["player"] != STATE["teams"][s["team"]]["active"]
                    ):
                        return self.send_json({"error": "Картинка недоступна"}, 403)
                    idx = (
                        s["player"]
                        if s["role"] != "host"
                        else STATE["teams"][s["team"]]["active"]
                    )
                    data = (ROOT / "assets/private" / f"{idx}.svg").read_bytes()
                    self.send_response(200)
                    self.send_header("Content-Type", "image/svg+xml")
                    self.send_header("Cache-Control", "no-store")
                    self.end_headers()
                    self.wfile.write(data)
                    return
                if self.path == "/api/state":
                    return self.send_json(public_state(s))
                return self.send_json({"error": "Не найдено"}, 404)
        if self.path.split("?")[0].startswith("/preview/warm-v3"):
            name = self.path.split("?")[0].removeprefix("/preview/warm-v3/")
            name = (
                name
                if name in ["app.js", "style.css", "catalog.json"]
                else "index.html"
            )
            self.path = "/src/features/warm-redesign-v3/" + name
        elif self.path == "/":
            self.path = "/src/features/warm-redesign-v3/index.html"
        elif self.path.startswith("/assets/"):
            self.path = "/public" + self.path
        # Only frontend and public assets are served, never server fixtures or design inputs.
        if (
            not self.path.startswith(
                ("/src/features/warm-redesign-v3/", "/public/assets/")
            )
            or ".." in self.path
        ):
            return self.send_error(404)
        from urllib.parse import unquote

        resolved = (ROOT / unquote(self.path).split("?")[0].lstrip("/")).resolve()
        public = (ROOT / "public/assets").resolve()
        front = (ROOT / "src/features/warm-redesign-v3").resolve()
        if not (
            resolved.is_relative_to(public)
            or (
                resolved.parent == front
                and resolved.name
                in ["index.html", "app.js", "style.css", "catalog.json"]
            )
        ):
            return self.send_error(404)
        return super().do_GET()

    def do_POST(self):
        global STATE
        try:
            n = int(self.headers.get("Content-Length", 0))
            if n > 100000:
                return self.send_json({"error": "Слишком большой запрос"}, 413)
            body = json.loads(self.rfile.read(n) or "{}")
            with LOCK:
                if self.path == "/api/logout":
                    c = SimpleCookie(self.headers.get("Cookie") or "")
                    if "warm_session" in c:
                        SESSIONS.pop(c["warm_session"].value, None)
                    return self.send_json(
                        {"ok": True},
                        cookie="warm_session=; Max-Age=0; HttpOnly; SameSite=Strict; Path=/",
                    )
                if self.path == "/api/login":
                    role = body.get("role")
                    team = body.get("team", "alpha")
                    player = int(body.get("player", 0))
                    name = str(body.get("name", "")).strip()[:40]
                    if (
                        role not in ["host", "player"]
                        or team not in STATE["teams"]
                        or player not in range(5)
                        or not name
                    ):
                        return self.send_json({"error": "Укажите имя и команду"}, 400)
                    if role == "host" and body.get("code") != "PREVIEW-HOST":
                        return self.send_json(
                            {"error": "Неверный демонстрационный код ведущего"}, 403
                        )
                    token = secrets.token_urlsafe(32)
                    SESSIONS[token] = {
                        "role": role,
                        "team": team,
                        "player": player,
                        "name": name,
                    }
                    return self.send_json(
                        {"ok": True},
                        cookie="warm_session="
                        + token
                        + "; HttpOnly; SameSite=Strict; Path=/",
                    )
                s = session(self.headers.get("Cookie"))
                if not s:
                    return self.send_json({"error": "Нужен вход"}, 401)
                if self.path != "/api/action":
                    return self.send_json({"error": "Не найдено"}, 404)
                a = body.get("action")
                host = s["role"] == "host"
                t = body.get("team", s["team"]) if host else s["team"]
                v = body.get("value")
                p = s["player"]
                team = STATE["teams"][t]
                host_only = [
                    "reset",
                    "confirm",
                    "phase",
                    "episode",
                    "normalize",
                    "emergency",
                    "accept",
                    "reject",
                    "resolve",
                    "round",
                    "finish",
                    "pause",
                    "extend",
                    "nextPlayer",
                    "focusTeam",
                    "restoreShelf",
                    "resetDrums",
                ]
                if a in host_only and not host:
                    return self.send_json({"error": "Доступно только ведущему"}, 403)
                if a == "reset":
                    STATE = fresh()
                elif a == "confirm":
                    STATE["confirmed"] = True
                elif a == "role":
                    if STATE["confirmed"]:
                        raise ValueError("Роли уже подтверждены ведущим")
                    if v == "giver":
                        if t in STATE["roles"] and STATE["roles"][t] != p:
                            raise ValueError("Загадывающий уже выбран")
                        STATE["roles"][t] = p
                    elif STATE["roles"].get(t) == p:
                        del STATE["roles"][t]
                elif a == "phase":
                    STATE["phase"] = str(v)
                    STATE["deadline"] = time.time() + 60
                    STATE["remaining"] = 60
                elif a == "episode":
                    STATE["episode"] = str(v)
                elif a == "pause":
                    if not STATE["paused"]:
                        STATE["remaining"] = max(0, STATE["deadline"] - time.time())
                    else:
                        STATE["deadline"] = time.time() + STATE["remaining"]
                    STATE["paused"] = not STATE["paused"]
                elif a == "extend":
                    STATE["deadline"] += 120
                    STATE["remaining"] += 120
                elif a == "focusTeam":
                    if v not in STATE["teams"]:
                        raise ValueError("Неизвестная команда")
                    s["team"] = v
                elif a == "restoreShelf":
                    team["discard"] = []
                elif a == "resetDrums":
                    team["drums"] = ["ночь"] * 5
                    team["attempts"] = []
                elif a == "nextPlayer":
                    team["active"] = (team["active"] + 1) % 5
                elif a == "ready":
                    team["ready"] = True
                elif a == "clue":
                    if not STATE["confirmed"] or STATE["roles"].get(t) != p:
                        raise ValueError("Подождите подтверждения роли")
                    if not isinstance(v, str) or not v.isalpha():
                        raise ValueError("Подсказка — одно слово без координат")
                    team["clue"] = v[:40]
                elif a == "cell":
                    if not STATE["confirmed"] or STATE["roles"].get(t) == p:
                        raise ValueError(
                            "Ячейку выбирает отгадывающий после подтверждения"
                        )
                    team["answers"]["cell"] = (
                        "Верно" if v == "В3" else "Попробуйте другую ячейку"
                    )
                elif a == "answer":
                    kind = body["kind"]
                    value = str(v).strip()[:200]
                    if kind == "phone":
                        team["answers"][kind] = (
                            "Номер найден"
                            if value == "3331998"
                            else "Номер не отвечает. Проверьте цифры."
                        )
                    elif kind == "phrase":
                        team["answers"][kind] = (
                            "Фраза восстановлена"
                            if value.lower() == "свет укажет путь"
                            else "Запись не совпала. Попробуйте другую скорость."
                        )
                    elif kind == "puzzle":
                        if p == team["active"] and not host:
                            raise ValueError(
                                "Рисующий не может отправлять ответ команды"
                            )
                        if not value.isalpha():
                            raise ValueError("Введите одно слово")
                        team["answers"][kind] = value
                        team["puzzleStatus"] = "На проверке у ведущего"
                    else:
                        raise ValueError("Неизвестный ответ")
                elif a == "shelf":
                    if STATE["phase"] != "reconstruct":
                        raise ValueError("Восстановление ещё не началось")
                    if (
                        not isinstance(v, list)
                        or len(v) != 14
                        or any(
                            x is not None and x not in ITEMS + ["Батарейка", "Компас"]
                            for x in v
                        )
                    ):
                        raise ValueError("Некорректная раскладка")
                    if len([x for x in v if x]) != len(set(x for x in v if x)):
                        raise ValueError("Предмет уже размещён")
                    team["shelf"] = v
                elif a == "discard":
                    if v not in ITEMS + ["Батарейка", "Компас"]:
                        raise ValueError("Неизвестный предмет")
                    team["discard"] = list(set(team["discard"] + [v]))
                    team["shelf"] = [None if x == v else x for x in team["shelf"]]
                elif a == "checkShelf":
                    team["answers"]["shelf"] = (
                        str(sum(a == b for a, b in zip(team["shelf"], ITEMS)))
                        + " из 14 на своих местах"
                    )
                elif a == "gauge":
                    idx = team["turn"] % 4
                    if p != idx and not host:
                        raise ValueError("Сейчас ход другого игрока")
                    if v not in LEVER_ACTIONS[idx]:
                        raise ValueError("Действие недоступно этому рычагу")
                    team["gauges"][idx] = max(0, min(100, team["gauges"][idx] + v * 10))
                    team["turn"] += 1
                elif a == "normalize":
                    team["gauges"] = [secrets.randbelow(81) + 10 for _ in range(4)]
                elif a == "emergency":
                    team["gauges"] = [35, 65, 25, 75]
                    team["turn"] = 0
                elif a == "route":
                    if v not in ["Лес", "Мост", "Станция", "Луна", "Река"]:
                        raise ValueError("Неизвестная точка")
                    if len(team["route"]) < 3:
                        team["route"].append(v)
                elif a == "undoRoute":
                    team["route"] = team["route"][:-1]
                elif a == "checkRoute":
                    team["answers"]["route"] = (
                        "Маршрут верен"
                        if team["route"] == ["Лес", "Мост", "Станция"]
                        else "Есть неверные точки"
                    )
                elif a == "draw":
                    if p != team["active"] and not host:
                        raise ValueError("Рисует только активный игрок")
                    if (
                        not isinstance(v, list)
                        or len(v) > 2000
                        or any(
                            not isinstance(q, list)
                            or len(q) != 2
                            or any(
                                not isinstance(z, (int, float)) or not 0 <= z <= 1
                                for z in q
                            )
                            for q in v
                        )
                    ):
                        raise ValueError("Некорректный рисунок")
                    team["drawing"] = v
                elif a in ["accept", "reject"]:
                    team["puzzleStatus"] = (
                        "Принято ведущим" if a == "accept" else "Попробуйте ещё раз"
                    )
                elif a == "drum":
                    idx = int(body["index"])
                    if idx not in range(5) or (not host and idx != p):
                        raise ValueError("Это барабан другого игрока")
                    if v not in WORDS:
                        raise ValueError("Неизвестное слово")
                    team["drums"][idx] = v
                elif a == "pull":
                    team["attempts"].append(
                        {
                            "words": team["drums"][:],
                            "matches": sum(
                                a == b for a, b in zip(team["drums"], WORDS)
                            ),
                        }
                    )
                elif a == "vote":
                    if team["voteResult"]:
                        raise ValueError("Тур уже завершён")
                    if v not in ["Лес", "Тоннель", "Шоссе"]:
                        raise ValueError("Неизвестная дорога")
                    team["votes"][p] = v
                elif a == "resolve":
                    counts = {
                        x: list(team["votes"].values()).count(x)
                        for x in ["Лес", "Тоннель", "Шоссе"]
                    }
                    m = max(counts.values())
                    winners = [x for x, n in counts.items() if n == m]
                    team["voteResult"] = (
                        winners[0] if len(winners) == 1 else "Ничья — нужен новый тур"
                    )
                elif a == "round":
                    STATE["round"] += 1
                    team["votes"] = {}
                    team["voteResult"] = None
                elif a == "hint":
                    team["hints"] += 1
                    team["answers"][
                        "hint"
                    ] = "Обсудите наблюдения по очереди и исключите неподходящие варианты."
                elif a == "finish":
                    STATE["finished"] = True
                else:
                    return self.send_json({"error": "Неизвестное действие"}, 400)
                return self.send_json(public_state(s))
        except (ValueError, KeyError, TypeError) as e:
            return self.send_json({"error": str(e)}, 400)


if __name__ == "__main__":
    import os

    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=3333)
    args = parser.parse_args()
    os.chdir(ROOT)
    print(f"Warm V3 preview :{args.port}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", args.port), Handler).serve_forever()
