module.exports = {
  testDir: './test/e2e',
  use: { baseURL: process.env.ABS_TEST_URL || 'http://localhost:13378' },
}
