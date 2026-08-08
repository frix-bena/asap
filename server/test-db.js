const { Pool } = require('pg');
const passwords = ['password', 'postgres', 'root', 'frix', '123456', ''];
async function test() {
  for (const p of passwords) {
    const pool = new Pool({ connectionString: `postgresql://postgres:${p}@localhost:5432/postgres` });
    try {
      await pool.query('SELECT 1');
      console.log(`Success with password: "${p}"`);
      return;
    } catch (e) {
      // console.error(`Failed with "${p}":`, e.message);
    }
  }
  console.log('None worked');
}
test();
