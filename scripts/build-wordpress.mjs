import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modules = process.env.BDS_BUILD_MODULES || path.join(repo, 'wordpress/build-tools/node_modules');
const require = createRequire(path.join(modules, '../package.json'));
const esbuild = require('esbuild');
const postcss = require('postcss');
const tailwind = require('tailwindcss');
const autoprefixer = require('autoprefixer');
const source = path.join(repo, 'frontend/src');
const build = path.join(repo, 'wordpress/bds-marvel-app/build');
await fs.rm(build, { recursive: true, force: true });
await fs.mkdir(path.join(build, 'static'), { recursive: true });
const result = await esbuild.build({
  entryPoints: [path.join(source, 'index.js')], bundle: true, minify: true, jsx: 'automatic', jsxImportSource: 'bds-editable',
  outdir: path.join(build, 'static'), entryNames: '[ext]/main.[hash]', assetNames: 'media/[name].[hash]',
  loader: { '.js': 'jsx', '.png': 'file', '.svg': 'file', '.gif': 'file' },
  alias: { '@': source, 'bds-editable/jsx-runtime': path.join(source, 'wordpress-jsx-runtime.js') }, nodePaths: [modules], metafile: true,
  define: { 'process.env.NODE_ENV': '"production"', 'process.env.PUBLIC_URL': '""',
    'process.env.REACT_APP_WORDPRESS_MODE': '"true"', 'process.env.REACT_APP_BACKEND_URL': '""' },
  legalComments: 'linked'
});
const outputs = Object.keys(result.metafile.outputs).map(p => path.resolve(p));
const cssFile = outputs.find(p => p.endsWith('.css'));
// Keep the application's own CSS in its original order; expand its Tailwind directives.
const css = await fs.readFile(cssFile, 'utf8');
const sandbox = { module: { exports: {} }, require };
vm.runInNewContext(await fs.readFile(path.join(repo, 'frontend/tailwind.config.js'), 'utf8'), sandbox);
const config = sandbox.module.exports;
config.content = [path.join(source, '**/*.{js,jsx}')];
const processed = await postcss([tailwind(config), autoprefixer]).process(css, { from: cssFile, to: cssFile, map: false });
await fs.writeFile(cssFile, processed.css);
await fs.cp(path.join(repo, 'frontend/public/clients'), path.join(build, 'clients'), { recursive: true });
const entrypoints = outputs.filter(p => /\.(css|js)$/.test(p)).map(p => path.relative(build, p));
await fs.writeFile(path.join(build, 'asset-manifest.json'), JSON.stringify({ entrypoints }, null, 2));
// One authoritative listing catalogue for server-side pricing and guest capacity.
const app = await fs.readFile(path.join(source, 'App.js'), 'utf8');
const dataText = app.match(/const stays = (?:wordpressContent\("stays", )?(\[[\s\S]*?\n\])\)?;/)[1];
const stays = (new Function(`return ${dataText}`))();
await fs.writeFile(path.join(repo, 'wordpress/bds-marvel-app/includes/stays.json'), JSON.stringify(stays.map(s => ({
  slug: s.slug, name: s.name, guests: s.guests, nightly: Number(s.price.replace(/[^\d]/g, ''))
})), null, 2));
console.log(`Built ${entrypoints.length} entrypoints and ${stays.length} stay records.`);
