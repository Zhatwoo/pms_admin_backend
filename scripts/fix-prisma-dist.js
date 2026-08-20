const fs = require('fs');
const path = require('path');

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    if (!full.endsWith('.js')) continue;
    const original = fs.readFileSync(full, 'utf8');
    const updated = original.replace(
      /require\((['"])(\.[^'"]+)\.ts\1\)/g,
      'require($1$2$1)',
    );
    if (updated !== original) {
      fs.writeFileSync(full, updated);
      console.log('[fix-prisma-dist] stripped .ts requires in', full);
    }
  }
}

const target = path.join(__dirname, '..', 'dist', 'generated');
if (fs.existsSync(target)) {
  walk(target);
}
