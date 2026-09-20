#!/usr/bin/env node
/**
 * Read-only checks to run before applying migrations 0002–0010.
 *
 * This script NEVER writes. It opens a connection, runs SELECTs, prints what
 * it found, and exits non-zero if something needs a human decision. Applying
 * the migrations is a separate, deliberate act.
 *
 *   DATABASE_URL=mysql://... node scripts/migration-preflight.mjs
 *
 * The check that matters is the one before 0007: that migration adds a UNIQUE
 * index on users.username, and a unique index cannot be created over duplicate
 * values. MySQL will refuse it, and the fix is a product decision about whose
 * handle survives — not something a migration, or this script, gets to make.
 */
import { createConnection } from "mysql2/promise";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Nothing to check against.");
  process.exit(2);
}

const problems = [];
const notes = [];

const connection = await createConnection(url);

try {
  // ---------------------------------------------------------------------
  // Before 0007 — users.username becomes UNIQUE
  // ---------------------------------------------------------------------
  const [duplicates] = await connection.query(`
    SELECT LOWER(username) AS handle, COUNT(*) AS total, GROUP_CONCAT(id ORDER BY id) AS ids
    FROM users
    WHERE username IS NOT NULL AND username <> ''
    GROUP BY LOWER(username)
    HAVING COUNT(*) > 1
    ORDER BY total DESC, handle ASC
  `);

  if (duplicates.length) {
    problems.push(
      `${duplicates.length} username(s) are held by more than one account. ` +
        `Migration 0007 adds a UNIQUE index and MySQL will refuse to create it.`,
    );
    console.log("\nDuplicate usernames (case-insensitive):\n");
    for (const row of duplicates) {
      console.log(`  @${row.handle} — ${row.total} accounts — user ids ${row.ids}`);
    }
    console.log(
      "\nThis needs a person, not a script. Deciding which account keeps the handle\n" +
        "changes who answers to a name that other people's links and screenshots\n" +
        "already point at. Nothing here renames or deletes anything.\n",
    );
  } else {
    notes.push("No duplicate usernames. Migration 0007 can create its unique index.");
  }

  // ---------------------------------------------------------------------
  // Before 0008 — notifications gains a UNIQUE (userId, type, receiptId)
  // ---------------------------------------------------------------------
  const [notificationColumns] = await connection.query(`
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notifications'
  `);
  const hasReceiptId = notificationColumns.some((row) => row.COLUMN_NAME === "receiptId");

  if (hasReceiptId) {
    const [collisions] = await connection.query(`
      SELECT userId, type, receiptId, COUNT(*) AS total
      FROM notifications
      WHERE receiptId IS NOT NULL
      GROUP BY userId, type, receiptId
      HAVING COUNT(*) > 1
    `);
    if (collisions.length) {
      problems.push(`${collisions.length} notification group(s) would collide with 0008's unique index.`);
    } else {
      notes.push("No notification collisions. 0008's unique index is safe.");
    }
  } else {
    // Rows predating the column take a null receiptId, and MySQL treats nulls
    // as distinct in a unique index, so existing rows cannot collide.
    notes.push("notifications.receiptId does not exist yet; existing rows take null and cannot collide.");
  }

  // ---------------------------------------------------------------------
  // Before 0009 — receipts.resolutionDate becomes nullable, enum widens
  // ---------------------------------------------------------------------
  const [receiptCount] = await connection.query(`SELECT COUNT(*) AS total FROM receipts`);
  notes.push(
    `${receiptCount[0].total} receipt(s) present. 0009 only widens the semanticType enum, ` +
      `relaxes resolutionDate to nullable and adds a title column — all additive, no row is rewritten.`,
  );

  // ---------------------------------------------------------------------
  // Before 0010 — dailyChallenges gains DRAFT/REJECTED and an approval gate
  // ---------------------------------------------------------------------
  const [openPrompts] = await connection.query(`
    SELECT COUNT(*) AS total FROM dailyChallenges WHERE status = 'OPEN'
  `);
  notes.push(
    `${openPrompts[0].total} daily prompt(s) are currently OPEN. 0010 changes only the ` +
      `column default to DRAFT; rows already OPEN stay OPEN, so no live prompt is retracted.`,
  );

  // ---------------------------------------------------------------------
  // Which migrations the database already has
  // ---------------------------------------------------------------------
  const [applied] = await connection
    .query(`SELECT hash, created_at FROM __drizzle_migrations ORDER BY created_at`)
    .catch(() => [[]]);
  notes.push(`${applied.length} migration(s) recorded in __drizzle_migrations.`);
} finally {
  await connection.end();
}

console.log("\n--- Notes ---");
for (const note of notes) console.log(`  · ${note}`);

if (problems.length) {
  console.log("\n--- Needs a decision before migrating ---");
  for (const problem of problems) console.log(`  ! ${problem}`);
  console.log("\nNothing was changed. Resolve the above, then re-run this check.\n");
  process.exit(1);
}

console.log("\nNo blockers found. Migrations 0002–0010 can be applied.\n");
