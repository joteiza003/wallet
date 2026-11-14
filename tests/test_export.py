import importlib.util
from contextlib import closing
import sqlite3
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts' / 'sync_manager.py'
spec = importlib.util.spec_from_file_location('sync_manager', SCRIPT)
export = importlib.util.module_from_spec(spec)
spec.loader.exec_module(export)


class ExportTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Path(self.tmp.name) / 'manager.sqlite3'
        with closing(sqlite3.connect(self.db)) as con, con:
            con.executescript('''
                CREATE TABLE editions (edition_id INTEGER, year TEXT);
                CREATE TABLE app_params (edition_id INTEGER, param_key TEXT, param_value TEXT);
                CREATE TABLE reservations (reservation_id INTEGER, edition_id INTEGER,
                    id_base TEXT, package_name TEXT, status TEXT);
                CREATE TABLE reservation_people (reservation_id INTEGER, id_individual TEXT,
                    full_name TEXT, first_name TEXT, last_name_1 TEXT, last_name_2 TEXT,
                    cancelled_flag INTEGER, total_paid REAL, email TEXT);
                INSERT INTO editions VALUES (1, '2026'), (2, '2025');
                INSERT INTO reservations VALUES (1,1,'R1','Canaro','accepted'),
                    (2,1,'R2','Canaro','pending'), (3,1,'R3','Canaro','removed'),
                    (4,2,'OLD','Canaro','accepted');
                INSERT INTO reservation_people VALUES
                    (1,'R1_1','Persona sin pagar','','','',0,0,'private@example.com'),
                    (1,'R1_2','Persona con pago','','','',0,100,'private@example.com'),
                    (1,'R1_3','Baja','','','',1,100,'private@example.com'),
                    (2,'R2_1','Pendiente','','','',0,100,'private@example.com'),
                    (3,'R3_1','Retirada','','','',0,100,'private@example.com'),
                    (4,'OLD_1','Otra edición','','','',0,100,'private@example.com');
            ''')

    def tearDown(self):
        self.tmp.cleanup()

    def test_all_accepted_without_payment_or_ticket_filter_and_read_only(self):
        before = self.db.read_bytes()
        records = export.read_accepted(self.db, '2026')
        self.assertEqual([r['qrValue'] for r in records], ['R1_1', 'R1_2'])
        self.assertEqual(records[0]['status'], 'valid')
        self.assertEqual(records[0]['sourceEdition'], '2026')
        self.assertEqual(self.db.read_bytes(), before)
        self.assertFalse(any(k in records[0] for k in ('email', 'total_paid', 'phone', 'intolerances')))

    def test_duplicate_qr_is_rejected_before_export(self):
        with closing(sqlite3.connect(self.db)) as con, con:
            con.execute("INSERT INTO reservation_people VALUES (1,'R1_1','Duplicado','','','',0,0,'')")
        with self.assertRaises(ValueError):
            export.read_accepted(self.db, '2026')

    def test_missing_edition_and_empty_holder_fail_closed(self):
        with self.assertRaises(ValueError):
            export.read_accepted(self.db, '2099')
        with closing(sqlite3.connect(self.db)) as con, con:
            con.execute("UPDATE reservation_people SET full_name='' WHERE id_individual='R1_1'")
        with self.assertRaises(ValueError):
            export.read_accepted(self.db, '2026')


if __name__ == '__main__':
    unittest.main()
