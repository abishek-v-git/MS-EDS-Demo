"""Bulk Excel upload: preview, all-or-nothing import, file order, conflicts, change-aware dates."""
from io import BytesIO
from pathlib import Path

import openpyxl
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase

from core.models import UploadLog
from demand_destination.models import DemandDestination
from record_identity.models import EDSRecord

URL = "/upload/"
SAMPLES = Path(settings.BASE_DIR) / "samples"


def xlsx(name, headers, *rows):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(headers)
    for r in rows:
        ws.append(r)
    buf = BytesIO()
    wb.save(buf)
    return SimpleUploadedFile(name, buf.getvalue())


H = ["Demand-line ID", "Program ID/name", "Priority"]


class SignedInTestCase(TestCase):
    """Every page needs a signed-in user."""

    @classmethod
    def setUpTestData(cls):
        cls.user = get_user_model().objects.create_user("tester", password="pw-for-tests-only")

    def setUp(self):
        self.client.force_login(self.user)


class BulkUploadTests(SignedInTestCase):
    def post(self, mode, *files):
        resp = self.client.post(URL, {"mode": mode, "next": "/", "files": list(files)})
        return resp, resp.json()

    def test_preview_saves_nothing_and_counts(self):
        _, body = self.post("preview", xlsx("01.xlsx", H, ["DL-1", "Atlas", "High"]),
                            xlsx("02.xlsx", H, ["DL-2", "Atlas", "Low"]))
        self.assertTrue(body["can_import"])
        self.assertIn("<strong>2</strong> new", body["html"])
        self.assertEqual(EDSRecord.objects.count(), 0)
        self.assertEqual(UploadLog.objects.count(), 0)

    def test_import_saves_all_files_with_one_batch_id(self):
        _, body = self.post("import", xlsx("02.xlsx", H, ["DL-2", "Atlas", "Low"]),
                            xlsx("01.xlsx", H, ["DL-1", "Atlas", "High"]))
        self.assertEqual(body["redirect"], "/")
        self.assertEqual(EDSRecord.objects.count(), 2)
        logs = list(UploadLog.objects.order_by("batch_position"))
        self.assertEqual([l.file_name for l in logs], ["01.xlsx", "02.xlsx"])  # filename order
        self.assertEqual(len({l.batch for l in logs}), 1)

    def test_later_file_wins_and_conflict_is_listed(self):
        _, body = self.post("preview", xlsx("b_update.xlsx", H, ["DL-1", "Atlas", "Low"]),
                            xlsx("a_load.xlsx", H, ["DL-1", "Atlas", "High"]))
        self.assertIn("Values that differ between files (1)", body["html"])
        self.post("import", xlsx("b_update.xlsx", H, ["DL-1", "Atlas", "Low"]),
                  xlsx("a_load.xlsx", H, ["DL-1", "Atlas", "High"]))
        self.assertEqual(DemandDestination.objects.get().priority, "Low")
        self.assertEqual(EDSRecord.objects.count(), 1)

    def test_files_filling_different_columns_combine_without_conflict(self):
        self.post("import", xlsx("01.xlsx", ["Demand-line ID", "Program ID/name", "Region", "Nov 2026"],
                                 ["DL-1", "Atlas", "EMEA", 10]),
                  xlsx("02.xlsx", ["Demand-line ID", "Program ID/name", "Priority", "Dec 2026"],
                       ["DL-1", "Atlas", "High", 20]))
        dd = DemandDestination.objects.get()
        self.assertEqual((dd.region, dd.priority), ("EMEA", "High"))
        self.assertEqual(dd.monthly_profile, "2026-11: 10; 2026-12: 20")

    def test_one_unreadable_file_blocks_the_whole_batch(self):
        good = xlsx("01.xlsx", H, ["DL-1", "Atlas", "High"])
        no_key = xlsx("02.xlsx", ["Program ID/name", "Priority", "Region"], ["Atlas", "High", "EMEA"])
        _, body = self.post("import", good, no_key)
        self.assertFalse(body["can_import"])
        self.assertIn("Nothing will be imported", body["html"])
        self.assertIn("02.xlsx", body["html"])
        self.assertEqual(EDSRecord.objects.count(), 0)

    def test_corrupt_file_is_rejected(self):
        _, body = self.post("preview", xlsx("01.xlsx", H, ["DL-1", "Atlas", "High"]),
                            SimpleUploadedFile("02.xlsx", b"not a workbook"))
        self.assertFalse(body["can_import"])

    def test_lock_files_and_duplicates_are_ignored(self):
        f = xlsx("01.xlsx", H, ["DL-1", "Atlas", "High"])
        same = SimpleUploadedFile("01 copy.xlsx", f.read()); f.seek(0)
        lock = SimpleUploadedFile("~$01.xlsx", b"lock")
        _, body = self.post("import", f, same, lock)
        self.assertEqual(body["redirect"], "/")
        self.assertEqual(UploadLog.objects.count(), 1)

    def test_reimporting_identical_data_keeps_review_date(self):
        f = lambda: xlsx("01.xlsx", H, ["DL-1", "Atlas", "High"])
        self.post("import", f())
        EDSRecord.objects.update(refreshed_date="2026-01-01", review_date="2026-01-31")
        _, body = self.post("preview", f())
        self.assertIn("<strong>1</strong> unchanged", body["html"])
        self.post("import", f())
        rec = EDSRecord.objects.get()
        self.assertEqual((rec.refreshed_date, rec.review_date), ("2026-01-01", "2026-01-31"))
        self.post("import", xlsx("01.xlsx", H, ["DL-1", "Atlas", "Low"]))  # a real change
        self.assertNotEqual(EDSRecord.objects.get().review_date, "2026-01-31")

    def test_no_files(self):
        resp, body = self.post("preview")
        self.assertEqual(resp.status_code, 400)
        self.assertFalse(body["ok"])

    def test_sample_files_import_as_one_batch(self):
        # skip Excel's ~$ lock files: Windows won't let us read one while the workbook is open
        files = [SimpleUploadedFile(p.name, p.read_bytes()) for p in sorted(SAMPLES.glob("*.xls*"))
                 if not p.name.startswith("~$")]
        files.append(SimpleUploadedFile("~$06_multi_program_full_load.xlsx", b"lock"))
        if not files:
            self.skipTest("no sample files")
        _, body = self.post("preview", *files)
        self.assertTrue(body["can_import"], body["html"])
        for f in files:
            f.seek(0)
        _, body = self.post("import", *files)
        self.assertEqual(body["redirect"], "/")
        self.assertGreater(EDSRecord.objects.count(), 0)
        self.assertFalse(UploadLog.objects.filter(file_name__startswith="~$").exists())


class ResetDataTests(SignedInTestCase):
    def load(self):
        self.client.post(URL, {"mode": "import", "next": "/", "files": [
            xlsx("01.xlsx", H, ["DL-1", "Atlas", "High"], ["DL-2", "Atlas", "Low"])]})
        self.assertEqual(EDSRecord.objects.count(), 2)

    def test_wrong_or_missing_confirmation_deletes_nothing(self):
        self.load()
        for word in ("", "delete", "yes"):
            self.client.post("/reset/", {"confirm": word, "next": "/"})
        self.assertEqual(EDSRecord.objects.count(), 2)
        self.assertEqual(UploadLog.objects.count(), 1)

    def test_get_is_not_allowed(self):
        self.load()
        self.assertEqual(self.client.get("/reset/").status_code, 405)
        self.assertEqual(EDSRecord.objects.count(), 2)

    def test_clears_everything_and_ids_restart(self):
        self.load()
        resp = self.client.post("/reset/", {"confirm": "DELETE", "next": "/demand-destination/"})
        self.assertRedirects(resp, "/demand-destination/", fetch_redirect_response=False)
        self.assertEqual(EDSRecord.objects.count(), 0)
        self.assertEqual(DemandDestination.objects.count(), 0)  # sections cascade
        self.assertEqual(UploadLog.objects.count(), 0)
        self.load()
        self.assertEqual(EDSRecord.objects.order_by("seq").first().eds_record_id, "EDS-000001")

    def test_external_next_is_ignored(self):
        resp = self.client.post("/reset/", {"confirm": "DELETE", "next": "//evil.example"})
        self.assertRedirects(resp, "/", fetch_redirect_response=False)


class InsightCardTests(SignedInTestCase):
    def test_lenient_parsing(self):
        from core import insights
        self.assertEqual(insights.num("$380,800"), 380800)
        self.assertEqual(insights.num("12 wks"), 12)
        self.assertIsNone(insights.num("TBD"))
        self.assertIsNone(insights.day("next week"))
        self.assertEqual(insights.money(2284800), "$2.3M")

    def test_every_section_builds_with_no_rows(self):
        import datetime as dt
        from core import insights
        for label, build in insights.BUILDERS.items():
            with self.subTest(label):
                cards = build([], dt.date(2026, 11, 12))
                self.assertTrue(cards)
                self.assertTrue(all(c["label"] and c["value"] is not None for c in cards))

    def test_capex_card_sums_messy_amounts(self):
        import datetime as dt
        from core import insights
        blank = {k: "" for k in ("requested_amount", "approved_amount", "requested_quantity", "approved_quantity",
                                 "status", "remaining_unfunded_demand")}
        rows = [{**blank, "requested_amount": "$1,000,000", "approved_amount": "250000", "status": "Approved"},
                {**blank, "requested_amount": "1000000", "approved_amount": "n/a", "status": "Draft"}]
        cards = insights.capex_approval(rows, dt.date(2026, 11, 12))
        self.assertEqual(cards[0]["value"], "$250K")
        self.assertEqual(cards[0]["of"], "$2.0M")
        self.assertEqual(cards[0]["pct"], 12)

    def test_data_endpoint_returns_cards_for_live_refresh(self):
        self.client.post(URL, {"mode": "import", "next": "/", "files": [xlsx("01.xlsx", H, ["DL-1", "Atlas", "P0"])]})
        body = self.client.get("/demand-destination/data/").json()
        self.assertIn("Total expected demand", body["insights_html"])
        page = self.client.get("/capex-approval/").content.decode()
        self.assertIn("Approved amount", page)


class AuthTests(TestCase):
    """Sign in / out, and that nothing is reachable without signing in."""

    @classmethod
    def setUpTestData(cls):
        cls.user = get_user_model().objects.create_user("alice", password="correct-horse-1")

    def test_pages_redirect_to_login(self):
        for url in ("/", "/demand-destination/", "/export/", "/template/"):
            resp = self.client.get(url)
            self.assertEqual(resp.status_code, 302, url)
            self.assertTrue(resp["Location"].startswith("/login/?next="), url)

    def test_background_requests_get_401_not_a_redirect(self):
        resp = self.client.get("/demand-destination/data/", headers={"X-Requested-With": "XMLHttpRequest"})
        self.assertEqual(resp.status_code, 401)
        self.assertEqual(resp.json()["error"], "login_required")

    def test_login_page_shows_no_data(self):
        page = self.client.get("/login/").content.decode()
        self.assertIn("Sign in", page)
        self.assertNotIn("Clear all data", page)

    def test_wrong_password_shows_error(self):
        resp = self.client.post("/login/", {"username": "alice", "password": "nope"})
        self.assertEqual(resp.status_code, 200)
        self.assertIn("auth-error", resp.content.decode())
        self.assertNotIn("_auth_user_id", self.client.session)

    def test_sign_in_goes_to_next_and_remember_controls_expiry(self):
        resp = self.client.post("/login/", {"username": "alice", "password": "correct-horse-1",
                                            "next": "/capex-approval/", "remember": "on"})
        self.assertRedirects(resp, "/capex-approval/")
        self.assertFalse(self.client.session.get_expire_at_browser_close())
        self.client.logout()
        self.client.post("/login/", {"username": "alice", "password": "correct-horse-1"})
        self.assertTrue(self.client.session.get_expire_at_browser_close())

    def test_external_next_is_ignored(self):
        resp = self.client.post("/login/", {"username": "alice", "password": "correct-horse-1",
                                            "next": "https://evil.example/"})
        self.assertRedirects(resp, "/", fetch_redirect_response=False)

    def test_sign_out_needs_post_and_shows_message(self):
        self.client.force_login(self.user)
        self.assertEqual(self.client.get("/logout/").status_code, 405)
        resp = self.client.post("/logout/", follow=True)
        self.assertEqual(resp.redirect_chain[0][0], "/login/")
        self.assertIn("signed out", resp.content.decode())
        self.assertEqual(self.client.get("/").status_code, 302)


class LoggingTests(SignedInTestCase):
    """Key events are logged with who did them; the daily log files rotate by name."""

    def test_import_edit_and_reset_are_logged_with_the_user(self):
        import logging

        from core.logs import RequestContextFilter

        class Capture(logging.Handler):  # like the real handlers: the filter stamps user and IP
            def __init__(self):
                super().__init__()
                self.addFilter(RequestContextFilter())
                self.seen = []

            def emit(self, record):
                self.seen.append((record.levelname, record.getMessage(), record.user, record.ip))

        capture = Capture()
        logger = logging.getLogger("core.views")
        logger.addHandler(capture)
        self.addCleanup(logger.removeHandler, capture)
        self.client.post(URL, {"mode": "import", "next": "/", "files": [
            xlsx("01.xlsx", H, ["DL-1", "Atlas", "High"])]})
        rec = EDSRecord.objects.get()
        self.client.post(f"/demand-destination/edit/{rec.pk}/", {"priority": "Low"})
        self.client.post("/reset/", {"confirm": "DELETE", "next": "/"})
        text = "\n".join(f"{level}: {msg}" for level, msg, _, _ in capture.seen)
        self.assertIn("Imported 1 file(s) [01.xlsx]: 1 new", text)
        self.assertIn(f"Edited {rec.eds_record_id} · Demand and destination: Priority", text)
        self.assertIn("WARNING: Cleared all data: 1 EDS records", text)
        self.assertEqual({(u, ip) for _, _, u, ip in capture.seen}, {("tester", "127.0.0.1")})

    def test_failed_sign_in_is_a_warning_without_the_password(self):
        self.client.logout()
        with self.assertLogs("core.auth", "INFO") as cm:
            self.client.post("/login/", {"username": "tester", "password": "wrong-secret"})
        self.assertIn("Failed sign-in for username 'tester'", cm.output[0])
        self.assertNotIn("wrong-secret", "\n".join(cm.output))

    def test_daily_file_handler_writes_dated_files_and_prunes_old_ones(self):
        import datetime as dt
        import logging
        import tempfile

        from core.logs import DailyFileHandler

        with tempfile.TemporaryDirectory() as d:
            old = Path(d) / "app-2000-01-01.log"
            old.write_text("old\n", encoding="utf-8")
            (Path(d) / "notes.txt").write_text("keep", encoding="utf-8")
            h = DailyFileHandler(d, prefix="app", keep_days=14)
            h.setFormatter(logging.Formatter("%(message)s"))
            h.emit(logging.makeLogRecord({"msg": "hello", "levelno": logging.INFO}))
            h.close()
            today = Path(d) / f"app-{dt.date.today().isoformat()}.log"
            self.assertEqual(today.read_text(encoding="utf-8"), "hello\n")
            self.assertFalse(old.exists())
            self.assertTrue((Path(d) / "notes.txt").exists())


class HistoryTests(SignedInTestCase):
    """Every data change is recorded with old -> new values and shown on the History page."""

    def imp(self, *rows, mode="import", headers=H):
        return self.client.post(URL, {"mode": mode, "next": "/", "files": [xlsx("01.xlsx", headers, *rows)]})

    def test_import_records_new_values_then_only_real_differences(self):
        from core.models import Activity, Change
        self.imp(["DL-1", "Atlas", "High"])
        a = Activity.objects.get()
        self.assertEqual((a.kind, a.username, a.record_count), ("import", "tester", 1))
        self.assertEqual(a.details["files"], ["01.xlsx"])
        self.assertTrue(all(c.new_record for c in a.items.all()))
        self.assertEqual({c.label for c in a.items.all()}, {"Demand-line ID", "Program ID/name", "Priority"})

        self.imp(["DL-1", "Atlas", "Low"])  # one value differs
        a2 = Activity.objects.first()
        c = a2.items.get()
        self.assertEqual((c.eds_record_id, c.label, c.old, c.new, c.new_record),
                         (EDSRecord.objects.get().eds_record_id, "Priority", "High", "Low", False))

        self.imp(["DL-1", "Atlas", "Low"])  # nothing differs: logged, no field changes
        self.assertEqual(Activity.objects.first().change_count, 0)
        self.assertEqual(Change.objects.count(), 4)

    def test_preview_records_nothing(self):
        from core.models import Activity
        self.imp(["DL-1", "Atlas", "High"], mode="preview")
        self.assertFalse(Activity.objects.exists())

    def test_edits_and_new_records_are_recorded(self):
        from core.models import Activity
        self.imp(["DL-1", "Atlas", "High"])
        rec = EDSRecord.objects.get()
        self.client.post(f"/demand-destination/edit/{rec.pk}/", {"priority": "P0", "region": "EMEA"})
        edit = Activity.objects.first()
        self.assertEqual(edit.kind, "edit")
        self.assertEqual(sorted((c.label, c.old, c.new) for c in edit.items.all()),
                         [("Priority", "High", "P0"), ("Region", "", "EMEA")])
        self.client.post(f"/demand-destination/edit/{rec.pk}/", {"priority": "P0", "region": "EMEA"})
        self.assertEqual(Activity.objects.filter(kind="edit").count(), 1)  # saving without changes adds nothing

        resp = self.client.post("/record/new/", {"record_identity-demand_line_id": "DL-9",
                                                 "record_identity-program": "Borealis"}).json()
        new = Activity.objects.first()
        self.assertEqual((new.kind, new.summary), ("create", f"Created {resp['message'].split()[0]}"))
        self.assertTrue(new.items.filter(label="Program ID/name", new="Borealis", new_record=True).exists())

    def test_add_one_groups_data_to_an_existing_record(self):
        from core.models import Activity
        self.imp(["DL-1", "Atlas", "High"], ["DL-2", "Atlas", "Low"])
        r1, r2 = EDSRecord.objects.order_by("seq")
        pick = self.client.get("/record/pick/", {"group": "Capex Approval"}).json()
        self.assertEqual([(r["line"], r["has_data"]) for r in pick["records"]], [("DL-1", False), ("DL-2", False)])

        form = self.client.get(f"/record/{r1.pk}/edit/", {"group": "Capex Approval"}).content.decode()
        self.assertIn('name="capex_approval-status"', form)
        self.assertNotIn('name="record_identity-demand_line_id"', form)  # only that group's sections
        self.assertNotIn('name="risk_buy-risk_type"', form)

        resp = self.client.post(f"/record/{r1.pk}/edit/?group=Capex+Approval",
                                {"capex_approval-status": "Approved"}).json()
        self.assertTrue(resp["ok"])
        r1.refresh_from_db()
        self.assertEqual(r1.capex_approval.status, "Approved")
        self.assertEqual((r1.demand_line_id, r1.program), ("DL-1", "Atlas"))  # identity untouched
        self.assertTrue(Activity.objects.first().summary.endswith("· Capex Approval"))

        pick = self.client.get("/record/pick/", {"group": "Capex Approval"}).json()
        self.assertEqual([(r["line"], r["has_data"]) for r in pick["records"]], [("DL-2", False), ("DL-1", True)])
        self.assertEqual(self.client.get("/record/pick/", {"group": "Nope"}).status_code, 404)
        self.assertEqual(self.client.get(f"/record/{r1.pk}/edit/", {"group": "Nope"}).status_code, 404)

    def test_new_record_form_shows_only_signal_intake(self):
        from core.views import NEW_RECORD_GROUPS
        new = self.client.get("/record/new/").content.decode()
        self.assertIn('name="record_identity-demand_line_id"', new)
        self.assertIn('name="pre_bom-cpu_generation"', new)
        self.assertIn('name="demand_destination-priority"', new)
        if NEW_RECORD_GROUPS == ("Signal Intake",):
            self.assertNotIn('name="capex_approval-status"', new)
            self.assertNotIn('name="risk_buy-risk_type"', new)
        self.imp(["DL-1", "Atlas", "High"])
        rec = EDSRecord.objects.get()
        edit = self.client.get(f"/record/{rec.pk}/edit/").content.decode()
        self.assertIn('name="capex_approval-status"', edit)  # editing a record still shows every section

    def test_clear_all_data_is_recorded_and_history_survives_it(self):
        from core.models import Activity, Change
        self.imp(["DL-1", "Atlas", "High"])
        self.client.post("/reset/", {"confirm": "DELETE", "next": "/"})
        reset = Activity.objects.first()
        self.assertEqual((reset.kind, reset.record_count), ("reset", 1))
        self.assertEqual(Change.objects.filter(record__isnull=True, eds_record_id="EDS-000001").count(), 3)

    def test_history_page_filters_and_change_details(self):
        from core.models import Activity
        self.imp(["DL-1", "Atlas", "High"], ["DL-2", "Borealis", "Low"])
        page = self.client.get("/history/").content.decode()
        self.assertIn("Imported 1 file: 2 new", page)
        self.assertIn("01.xlsx", page)
        self.assertIn("Borealis", self.client.get("/history/?q=Borealis").content.decode())
        self.assertIn("No changes match", self.client.get("/history/?q=nothing-like-this").content.decode())
        self.assertIn("No changes match", self.client.get("/history/?kind=reset").content.decode())

        a = Activity.objects.get()
        detail = self.client.get(f"/history/{a.pk}/changes/?q=Borealis").content.decode()
        self.assertIn("EDS-000002", detail)
        self.assertNotIn("EDS-000001", detail)  # only the matching record
        self.assertIn("New record", detail)

    def test_change_details_load_in_pages_of_records(self):
        from core import views
        from core.models import Activity
        self.imp(*[[f"DL-{i}", "Atlas", "High"] for i in range(views.RECORDS_PER_LOAD + 5)])
        a = Activity.objects.get()
        first = self.client.get(f"/history/{a.pk}/changes/").content.decode()
        self.assertEqual(first.count('class="hc-id"'), views.RECORDS_PER_LOAD)
        self.assertIn("Show 5 more records", first)
        rest = self.client.get(f"/history/{a.pk}/changes/?offset={views.RECORDS_PER_LOAD}").content.decode()
        self.assertEqual(rest.count('class="hc-id"'), 5)
        self.assertNotIn("more record", rest)
