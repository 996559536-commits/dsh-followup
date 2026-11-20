import {readFile,writeFile,mkdir,symlink,lstat} from 'node:fs/promises';
import {resolve,join} from 'node:path';
const root=resolve('.');
const profile=join(root,'.test-home','profiles','followup-test');
const file=join(profile,'package.json');
const manifest=JSON.parse(await readFile(file,'utf8'));
manifest.dependencies['dsh-followup']=`link:${root}`;
if(!manifest.dsh.profile.bundles.includes('dsh-followup'))manifest.dsh.profile.bundles.push('dsh-followup');
await writeFile(file,JSON.stringify(manifest,null,2)+'\n');
await mkdir(join(profile,'node_modules'),{recursive:true});
const link=join(profile,'node_modules','dsh-followup');
try{await lstat(link);}catch(e){if(e.code!=='ENOENT')throw e;await symlink(root,link,'dir');}
console.log(`Isolated profile ready: ${profile}`);
