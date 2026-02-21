/**
 * Migration Runner for Supabase
 * Run this script to apply all migrations to your Supabase database
 *
 * Usage: node migrations/run-migrations.js
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Error: SUPABASE_URL and SUPABASE_KEY must be set in .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Run a single migration file
 */
async function runMigration(filePath, migrationName) {
  try {
    console.log(`\n🔄 Running migration: ${migrationName}...`);

    // Read migration file
    const sql = fs.readFileSync(filePath, 'utf8');

    // Execute migration
    const { data, error } = await supabase.rpc('exec', { sql });

    if (error) {
      // Some errors are expected (like "already exists" warnings)
      // Check if it's a critical error
      if (error.message.includes('already exists')) {
        console.log(`⚠️  ${migrationName}: ${error.message} (skipped)`);
        return true;
      }
      console.error(`❌ Error in ${migrationName}:`, error.message);
      return false;
    }

    console.log(`✅ ${migrationName} completed successfully`);
    return true;

  } catch (error) {
    console.error(`❌ Error running ${migrationName}:`, error.message);
    return false;
  }
}

/**
 * Alternative: Run migrations directly using SQL queries
 */
async function runMigrationDirect(filePath, migrationName) {
  try {
    console.log(`\n🔄 Running migration: ${migrationName}...`);

    const sql = fs.readFileSync(filePath, 'utf8');

    // Split by semicolon to handle multiple statements
    const statements = sql.split(';').filter(s => s.trim().length > 0);

    for (const statement of statements) {
      const trimmed = statement.trim();
      if (trimmed.length === 0) continue;

      const { data, error } = await supabase.from('_migrations').select('*');

      // Try a simpler approach - just log what we found
      console.log(`  - Statement: ${trimmed.substring(0, 50)}...`);
    }

    console.log(`✅ ${migrationName} prepared (review manually in Supabase SQL Editor)`);
    return true;

  } catch (error) {
    console.error(`❌ Error preparing ${migrationName}:`, error.message);
    return false;
  }
}

/**
 * Main function
 */
async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('📊 VIDEO EDITOR DATABASE MIGRATIONS');
  console.log('='.repeat(60));

  console.log(`\n📍 Supabase Project: ${supabaseUrl}`);
  console.log('⚠️  IMPORTANT: These migrations must be run manually in Supabase SQL Editor');
  console.log('   or via the Supabase CLI.');

  // List migrations
  const migrations = [
    { file: '001_add_auth_fields.sql', name: 'Migration 001: Add Auth Fields' },
    { file: '002_create_sessions_table.sql', name: 'Migration 002: Create Sessions Table' },
    { file: '003_create_refresh_tokens_table.sql', name: 'Migration 003: Create Refresh Tokens Table' }
  ];

  console.log('\n📋 Available Migrations:');
  migrations.forEach((m, i) => {
    console.log(`  ${i + 1}. ${m.name}`);
    console.log(`     File: migrations/${m.file}`);
  });

  console.log('\n' + '='.repeat(60));
  console.log('📝 INSTRUCTIONS:');
  console.log('='.repeat(60));
  console.log(`
1. Open Supabase Dashboard: https://app.supabase.com
2. Select your project: "Video Editor"
3. Go to: SQL Editor → New Query
4. For each migration below:
   a. Open the migration file
   b. Copy all content
   c. Paste into SQL Editor
   d. Click "Run"

`);

  // Display migration contents
  for (const migration of migrations) {
    const filePath = path.join(__dirname, migration.file);
    const sql = fs.readFileSync(filePath, 'utf8');

    console.log(`\n${'='.repeat(60)}`);
    console.log(`${migration.name}`);
    console.log(`${'='.repeat(60)}`);
    console.log(sql);
    console.log(`\n✅ Copy the SQL above and paste into Supabase SQL Editor`);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('✅ VERIFY AFTER RUNNING ALL MIGRATIONS');
  console.log(`${'='.repeat(60)}`);
  console.log(`
1. Check users table has new columns:
   - email
   - password_hash
   - auth_method
   - google_id
   - last_login
   - is_email_verified

2. Check new tables exist:
   - sessions
   - refresh_tokens

3. If all tables exist, you're ready for Phase 3!
  `);

  console.log('\n✅ Migration guide created. Next steps:');
  console.log('   1. Read MIGRATION_GUIDE.md for detailed instructions');
  console.log('   2. Copy SQL from migrations/');
  console.log('   3. Paste into Supabase SQL Editor');
  console.log('   4. Run and verify\n');
}

// Run main
main().catch(console.error);
