import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:sqflite_sqlcipher/sqflite.dart';

/// Encrypted local store.
///
/// The phone holds customer balances, prices and unsynced money. It is
/// encrypted at rest with a key kept in the platform keystore, never in a
/// file beside the database.
class LocalDb {
  LocalDb._();

  static final LocalDb instance = LocalDb._();

  Database? _db;

  Future<Database> open(String passphrase) async {
    if (_db != null) return _db!;

    final directory = await getApplicationDocumentsDirectory();
    final path = p.join(directory.path, 'rep.db');

    _db = await openDatabase(
      path,
      password: passphrase,
      version: 1,
      onConfigure: (db) async {
        await db.execute('PRAGMA foreign_keys = ON');
      },
      onCreate: _createSchema,
    );

    return _db!;
  }

  Future<void> _createSchema(Database db, int version) async {
    // ---- reference data, refreshed by pull ------------------------------
    await db.execute('''
      CREATE TABLE customers (
        id INTEGER PRIMARY KEY,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        phone TEXT,
        address TEXT,
        latitude REAL,
        longitude REAL,
        price_list_id INTEGER,
        discount_pct TEXT NOT NULL DEFAULT '0',
        payment_terms_days INTEGER NOT NULL DEFAULT 0,
        credit_limit TEXT NOT NULL DEFAULT '0',
        credit_hold INTEGER NOT NULL DEFAULT 0,
        is_cash_only INTEGER NOT NULL DEFAULT 0,
        kind TEXT,
        visit_days TEXT,
        updated_at TEXT
      )
    ''');

    await db.execute('''
      CREATE TABLE items (
        id INTEGER PRIMARY KEY,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        base_unit_id INTEGER,
        is_taxable INTEGER NOT NULL DEFAULT 1,
        tax_rate TEXT NOT NULL DEFAULT '0',
        track_batches INTEGER NOT NULL DEFAULT 0,
        track_expiry INTEGER NOT NULL DEFAULT 0,
        is_weighted INTEGER NOT NULL DEFAULT 0,
        default_sale_price TEXT NOT NULL DEFAULT '0',
        updated_at TEXT
      )
    ''');

    await db.execute('''
      CREATE TABLE item_units (
        id INTEGER PRIMARY KEY,
        item_id INTEGER NOT NULL,
        unit_id INTEGER,
        unit_name TEXT,
        factor TEXT NOT NULL,
        is_base INTEGER NOT NULL DEFAULT 0,
        is_sales_default INTEGER NOT NULL DEFAULT 0,
        barcode TEXT,
        sale_price TEXT,
        FOREIGN KEY (item_id) REFERENCES items (id) ON DELETE CASCADE
      )
    ''');
    await db.execute('CREATE INDEX idx_item_units_barcode ON item_units (barcode)');

    await db.execute('''
      CREATE TABLE price_lines (
        id INTEGER PRIMARY KEY,
        source TEXT NOT NULL,              -- price_list | contract
        price_list_id INTEGER,
        customer_id INTEGER,
        item_id INTEGER NOT NULL,
        item_unit_id INTEGER,
        min_qty TEXT NOT NULL DEFAULT '0',
        price TEXT,
        discount_pct TEXT NOT NULL DEFAULT '0',
        valid_from TEXT,
        valid_to TEXT
      )
    ''');

    /// Stock allocated exclusively to this rep's van. No other device can
    /// spend it, which is precisely why selling it offline is safe.
    await db.execute('''
      CREATE TABLE van_stock (
        item_id INTEGER NOT NULL,
        batch_id INTEGER,
        batch_code TEXT,
        expiry_date TEXT,
        qty_on_hand TEXT NOT NULL DEFAULT '0',
        qty_reserved TEXT NOT NULL DEFAULT '0',
        qty_available TEXT NOT NULL DEFAULT '0',
        PRIMARY KEY (item_id, batch_id)
      )
    ''');

    /// A slice of a customer's credit limit carved out for THIS device. It is
    /// already counted in central exposure, so spending it cannot overdraw.
    await db.execute('''
      CREATE TABLE credit_reservations (
        customer_id INTEGER PRIMARY KEY,
        amount TEXT NOT NULL,
        consumed_amount TEXT NOT NULL DEFAULT '0',
        available TEXT NOT NULL,
        expires_at TEXT NOT NULL
      )
    ''');

    await db.execute('''
      CREATE TABLE open_invoices (
        id INTEGER PRIMARY KEY,
        code TEXT NOT NULL,
        customer_id INTEGER NOT NULL,
        invoice_date TEXT,
        due_date TEXT,
        total TEXT NOT NULL,
        paid_amount TEXT NOT NULL DEFAULT '0',
        returned_amount TEXT NOT NULL DEFAULT '0',
        outstanding TEXT NOT NULL
      )
    ''');

    await db.execute('''
      CREATE TABLE visit_plan (
        id INTEGER PRIMARY KEY,
        plan_date TEXT NOT NULL,
        customer_id INTEGER NOT NULL,
        customer_name TEXT,
        sequence INTEGER NOT NULL DEFAULT 1,
        planned_at TEXT,
        objective TEXT,
        status TEXT NOT NULL DEFAULT 'pending'
      )
    ''');

    // ---- the outbound queue ---------------------------------------------

    /// Every field action lands here first and is only ever removed after the
    /// server acknowledges it. Nothing is created directly against the API.
    await db.execute('''
      CREATE TABLE operations (
        id TEXT PRIMARY KEY,               -- client UUID, also the server's client_uuid
        idempotency_key TEXT NOT NULL UNIQUE,
        client_seq INTEGER NOT NULL,
        op_type TEXT NOT NULL,
        payload TEXT NOT NULL,             -- JSON
        depends_on TEXT,                   -- ordering that does not trust the network
        status TEXT NOT NULL DEFAULT 'queued',  -- queued|sent|applied|rejected|conflict
        server_doc_type TEXT,
        server_doc_id INTEGER,
        server_doc_code TEXT,
        error_code TEXT,
        error_message TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        client_created_at TEXT NOT NULL,
        last_attempt_at TEXT,
        acknowledged_at TEXT
      )
    ''');
    await db.execute('CREATE INDEX idx_operations_status ON operations (status, client_seq)');

    await db.execute('''
      CREATE TABLE meta (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    ''');
  }

  Future<String?> meta(String key) async {
    final db = _db;
    if (db == null) return null;

    final rows = await db.query('meta', where: 'key = ?', whereArgs: [key], limit: 1);
    return rows.isEmpty ? null : rows.first['value'] as String?;
  }

  Future<void> setMeta(String key, String value) async {
    final db = _db;
    if (db == null) return;

    await db.insert('meta', {'key': key, 'value': value},
        conflictAlgorithm: ConflictAlgorithm.replace);
  }

  Future<void> close() async {
    await _db?.close();
    _db = null;
  }
}
