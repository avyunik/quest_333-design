import unittest, threading, json, urllib.request, urllib.error, http.cookiejar
import server


class PreviewTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.http = server.ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        cls.url = "http://127.0.0.1:" + str(cls.http.server_port)
        threading.Thread(target=cls.http.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown()
        cls.http.server_close()

    def setUp(self):
        server.STATE = server.fresh()
        server.SESSIONS.clear()
        self.host = self.client("host", 0)
        self.player = self.client("player", 0)
        self.other = self.client("player", 1)

    def client(self, role, p):
        op = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar())
        )
        self.call(
            op,
            "/api/login",
            {"name": "Тест", "role": role, "player": p, "code": "PREVIEW-HOST"},
        )
        return op

    def call(self, op, path, data=None):
        req = urllib.request.Request(
            self.url + path,
            data=json.dumps(data).encode() if data is not None else None,
            headers={"Content-Type": "application/json"},
        )
        try:
            with op.open(req) as r:
                return r.status, json.loads(r.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read()) if path.startswith("/api/") else {}

    def act(self, op, a, v=None, **kw):
        return self.call(op, "/api/action", dict(action=a, value=v, **kw))

    def test_role_coordinate_and_confirmation(self):
        self.act(self.player, "role", "giver")
        self.assertNotIn("coordinate", self.call(self.player, "/api/state")[1])
        self.act(self.host, "confirm")
        self.assertEqual(self.call(self.player, "/api/state")[1]["coordinate"], "В3")
        self.assertNotIn("coordinate", self.call(self.other, "/api/state")[1])
        self.assertEqual(self.act(self.other, "confirm")[0], 403)
        self.assertEqual(self.act(self.player, "clue", "В3")[0], 400)

    def test_shelf_privacy_and_check(self):
        self.act(self.host, "phase", "reconstruct")
        s = self.call(self.player, "/api/state")[1]
        self.assertNotIn("shelfSource", s)
        self.assertNotIn("shelfKey", s)
        self.assertEqual(self.act(self.player, "phase", "memorize")[0], 403)
        self.act(self.player, "shelf", server.ITEMS)
        self.act(self.player, "checkShelf")
        self.assertIn(
            "14 из 14",
            self.call(self.player, "/api/state")[1]["own"]["answers"]["shelf"],
        )

    def test_drum_ownership_and_count_only(self):
        self.assertEqual(self.act(self.player, "drum", "ключ", index=1)[0], 400)
        self.act(self.host, "drum", "ключ", index=1)
        self.act(self.player, "pull")
        s = self.call(self.player, "/api/state")[1]
        self.assertNotIn("drumKey", s)
        self.assertEqual(set(s["own"]["attempts"][0]), {"matches"})

    def test_secret_votes_and_tie(self):
        self.act(self.player, "vote", "Лес")
        self.act(self.other, "vote", "Шоссе")
        s = self.call(self.player, "/api/state")[1]
        self.assertNotIn("votes", s["own"])
        self.assertNotIn("votes", s["teams"]["alpha"])
        self.act(self.host, "resolve")
        self.assertIn(
            "Ничья", self.call(self.player, "/api/state")[1]["own"]["voteResult"]
        )
        self.act(self.host, "round")
        self.assertIsNone(self.call(self.player, "/api/state")[1]["own"]["myVote"])

    def test_drawing_and_private_picture_permissions(self):
        self.assertNotIn("riddle", self.call(self.other, "/api/state")[1])
        self.assertEqual(self.call(self.other, "/api/picture")[0], 403)
        self.assertEqual(self.act(self.other, "draw", [[0.1, 0.1]])[0], 400)
        self.act(self.player, "draw", [[0.1, 0.1], [0.4, 0.4]])
        self.assertEqual(
            len(self.call(self.other, "/api/state")[1]["own"]["drawing"]), 2
        )
        self.act(self.host, "nextPlayer")
        self.assertIn("riddle", self.call(self.other, "/api/state")[1])

    def test_turn_and_actions(self):
        self.assertEqual(self.act(self.other, "gauge", 1)[0], 400)
        self.act(self.player, "gauge", 1)
        self.assertEqual(self.act(self.other, "gauge", -1)[0], 400)
        self.assertEqual(self.act(self.other, "gauge", 1)[0], 200)
        self.act(self.host, "emergency")
        self.assertEqual(
            self.call(self.player, "/api/state")[1]["own"]["gauges"], [35, 65, 25, 75]
        )

    def test_no_server_source_and_logout(self):
        self.assertEqual(self.call(self.player, "/server.py")[0], 404)
        self.call(self.player, "/api/logout", {})
        self.assertEqual(self.call(self.player, "/api/state")[0], 401)


if __name__ == "__main__":
    unittest.main()
