/**
 * Runs once when the Next.js server starts, before routes open a database connection.
 */
export async function register() {
  const { applyLocalTestDatabaseGuard } = await import('./lib/local-test-database.js')
  const result = applyLocalTestDatabaseGuard()
  if (result.applied) {
    console.log(`[db] Local app is using the test database host ${result.hostname}`)
  }
}
