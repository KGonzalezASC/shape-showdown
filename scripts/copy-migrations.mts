import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';

const projectRoot = process.cwd();
const sourceDirectory = path.join(projectRoot, 'db', 'migrations');
const targetDirectory = path.join(projectRoot, 'dist-server', 'migrations');

await rm(targetDirectory, { recursive: true, force: true });
await mkdir(targetDirectory, { recursive: true });

const entries = await readdir(sourceDirectory, { withFileTypes: true });
for (const entry of entries) {
  if (!entry.isFile() || !entry.name.endsWith('.sql')) continue;
  await cp(
    path.join(sourceDirectory, entry.name),
    path.join(targetDirectory, entry.name),
  );
}
