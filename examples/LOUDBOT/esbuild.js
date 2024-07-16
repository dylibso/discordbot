const esbuild = require('esbuild');

esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  outfile: 'dist/index.js',
  target: 'es2020',
  format: 'cjs',
}).catch(() => process.exit(1));
