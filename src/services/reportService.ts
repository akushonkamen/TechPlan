import type { Database } from 'sqlite';

export async function migrateReportTables(db: Database): Promise<void> {
  const addColumn = async (table: string, column: string, definition: string) => {
    try {
      await db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    } catch (err: any) {
      if (!err.message.includes('duplicate column')) {
        console.warn(`[Migration] Warning adding ${table}.${column}:`, err.message);
      }
    }
  };

  const reportColumns = [
    { col: 'status', def: "TEXT DEFAULT 'draft'" },
    { col: 'review_status', def: "TEXT DEFAULT 'pending'" },
    { col: 'period_start', def: 'TEXT' },
    { col: 'period_end', def: 'TEXT' },
  ];
  for (const { col, def } of reportColumns) {
    await addColumn('reports', col, def);
  }

  const topicColumns = [
    { col: 'daily_report_enabled', def: 'INTEGER DEFAULT 0' },
    { col: 'monthly_report_enabled', def: 'INTEGER DEFAULT 0' },
    { col: 'quarterly_report_enabled', def: 'INTEGER DEFAULT 0' },
  ];
  for (const { col, def } of topicColumns) {
    await addColumn('topics', col, def);
  }

  console.log('[Migration] Report tables migration completed');
}
