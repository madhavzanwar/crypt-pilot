-- Cloudflare D1 (remote) doesn’t allow explicit BEGIN/COMMIT; operations are atomic per statement batch.
-- We avoid PRAGMA statements and rely on default foreign key behavior.

-- Create new table with REAL quantity
CREATE TABLE line_items_new (
  id TEXT PRIMARY KEY,
  expense_id TEXT NOT NULL,
  description TEXT NOT NULL,
  quantity REAL NOT NULL,
  price REAL NOT NULL,
  FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE
);

-- Copy data from old table
INSERT INTO line_items_new (id, expense_id, description, quantity, price)
SELECT id, expense_id, description, CAST(quantity AS REAL), price FROM line_items;

-- Drop old table
DROP TABLE line_items;

-- Rename new to original
ALTER TABLE line_items_new RENAME TO line_items;

-- Recreate indexes (if not exists) for consistency
CREATE INDEX IF NOT EXISTS idx_line_items_expense_id ON line_items(expense_id);

-- Recreate index dropped with table replacement
CREATE INDEX IF NOT EXISTS idx_line_items_expense_id ON line_items(expense_id);
