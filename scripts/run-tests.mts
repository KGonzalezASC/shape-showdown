type TestMode = 'unit' | 'integration' | 'control-plane' | 'harness';

const mode = process.argv[2];
if (
  mode !== 'unit'
  && mode !== 'integration'
  && mode !== 'control-plane'
  && mode !== 'harness'
) {
  throw new Error(
    'Usage: bun scripts/run-tests.mts <unit|integration|control-plane|harness>',
  );
}

const patterns = {
  unit: ['server/**/*.test.ts', 'src/**/*.test.ts'],
  integration: ['server/**/*.integration.test.ts'],
  'control-plane': ['server/controlPlane/**/*.test.ts'],
  harness: ['server/testHarness/**/*.test.ts'],
}[mode];

const testFiles = new Set<string>();
for (const pattern of patterns) {
  const glob = new Bun.Glob(pattern);
  for await (const file of glob.scan({ cwd: process.cwd(), onlyFiles: true })) {
    if (
      mode !== 'integration'
      && file.endsWith('.integration.test.ts')
    ) {
      continue;
    }
    testFiles.add(file);
  }
}

const sortedTestFiles = [...testFiles].sort();
if (sortedTestFiles.length === 0) {
  throw new Error(`No ${mode} test files were found`);
}

if (mode === 'integration') {
  let failed = 0;
  for (const file of sortedTestFiles) {
    const result = Bun.spawn(['bun', 'test', file], {
      env: process.env,
      stderr: 'inherit',
      stdout: 'inherit',
    });
    if (await result.exited !== 0) failed += 1;
  }

  console.log(
    `[test:${mode}] ${sortedTestFiles.length - failed}/${sortedTestFiles.length} files passed`,
  );
  process.exitCode = failed === 0 ? 0 : 1;
} else {
  const result = Bun.spawn(['bun', 'test', ...sortedTestFiles], {
    env: process.env,
    stderr: 'inherit',
    stdout: 'inherit',
  });
  const exitCode = await result.exited;
  console.log(
    `[test:${mode}] ${exitCode === 0 ? sortedTestFiles.length : 0}/${sortedTestFiles.length} files passed`,
  );
  process.exitCode = exitCode;
}
