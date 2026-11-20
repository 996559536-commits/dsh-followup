import {build} from 'esbuild';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {writeNotices} from './notices.mjs';
const require=createRequire(import.meta.url);
await mkdir('lib',{recursive:true});await mkdir('output',{recursive:true});
const sourceCss=await readFile('src/client/styles.css','utf8');
// Tailwind emits responsive/state variants after ordinary rules. Keep component
// overrides after the complete utility sheet so md:text-sm cannot replace the
// editor's measured typography. Plain fields also remove the primitive's ring.
const css=await postcss([tailwind(require('../tailwind.config.cjs'))]).process('@tailwind base;\n@tailwind components;\n@tailwind utilities;',{from:'src/client/styles.css'});
// Tailwind's variable initialization is scoped as well; no global preflight/reset.
const sheet=css.root;
sheet.walkRules(rule=>{if(rule.selector==='*, ::before, ::after')rule.selector='.dsh-followup, .dsh-followup *, .dsh-followup ::before, .dsh-followup ::after';if(rule.selector==='::backdrop')rule.selector='.dsh-followup ::backdrop';});
const compiledCss=sheet.toString()+'\n'+sourceCss.replace(/@tailwind\s+(base|components|utilities);/g,'');
await writeFile('lib/styles.css',compiledCss);
const common={bundle:true,target:'es2022',logLevel:'warning'};
await build({...common,entryPoints:['src/index.ts'],outfile:'lib/index.js',platform:'node',format:'esm'});
const clientBuild=await build({...common,metafile:true,entryPoints:['src/client.tsx'],outfile:'lib/client.js',platform:'browser',format:'cjs',jsx:'automatic',external:['react','react/*','react-dom','react-dom/*'],minify:true,define:{'process.env.NODE_ENV':'"production"','__FOLLOWUP_CSS__':JSON.stringify(compiledCss)},banner:{js:'window.__ModuleLoader__.load({id:"dsh-followup",factory:function(require){var module={exports:{}};var exports=module.exports;'},footer:{js:'return module.exports;}});'}});
await writeNotices(clientBuild.metafile);
await build({...common,entryPoints:['src/preview.tsx'],outfile:'output/preview.js',platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"','__FOLLOWUP_CSS__':JSON.stringify(compiledCss)}});
await build({...common,entryPoints:['src/host/service.ts','src/host/repository.ts','src/host/routes.ts','src/core/selectors.ts','src/core/model.ts'],outdir:'output/test',outbase:'src',platform:'node',format:'esm'});
console.log('Built Host, DSH Client, scoped shadcn CSS and runnable preview.');
