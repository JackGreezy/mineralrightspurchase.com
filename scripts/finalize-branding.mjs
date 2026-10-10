import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root=process.cwd(),pub=path.join(root,'public');
const config=JSON.parse(fs.readFileSync(path.join(root,'home.config.json'),'utf8'));
const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const phone=String(config.phone||'').replace(/\D/g,'');
if(!/^(?:1)?\d{10}$/.test(phone))throw Error('A valid real business phone is required');
for(const file of ['brand/logo.png','brand/visibility.js','brand/phone.svg'])if(!fs.existsSync(path.join(pub,file)))throw Error('Missing owned brand asset: '+file);
const hash=crypto.createHash('sha256').update(fs.readFileSync(path.join(pub,'brand/visibility.js'))).digest('hex').slice(0,12);
const runtime='/brand/visibility.js?v='+hash;
const css=config.brand_repair_css_append||'';
if(!css.includes('.rr-mobile-call'))throw Error('Missing approved mobile call styling');
const script=`<script id="rr-brand-visibility" src="${runtime}" defer data-logo-variant="${escape(config.brand_logo_variant||'')}" data-phone="${escape(config.phone)}" data-business="${escape(config.biz)}"></script>`;
const block='<!-- rr-logo-call-start --><style id="rr-logo-call">'+css+'</style>'+script+'<!-- rr-logo-call-end -->';
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(path.join(dir,entry.name)):[path.join(dir,entry.name)]);}
let checked=0,changed=0;
for(const file of walk(pub).filter(file=>file.endsWith('.html'))){
 let html=fs.readFileSync(file,'utf8');
 if(!/<html\b/i.test(html)||!/<\/body>/i.test(html)||!/<\/html>/i.test(html))throw Error('Incomplete generated page: '+path.relative(root,file));
 if(/tel:\+?1?\d{3}555\d{4}\b|\b\d{3}[-. ]555[-. ]\d{4}\b/.test(html))throw Error('Fictional business phone found: '+path.relative(root,file));
 for(const [before,after] of Object.entries(config.brand_media_replacements||{})){
  const served=after.replace(/^\/images\//,'/ours/');
  if(!fs.existsSync(path.join(pub,served)))throw Error('Missing approved replacement image: '+served);
  html=html.replaceAll(before,served);
 }
 // Only replace our exact owned marker blocks; leave the donor page DOM intact.
 html=html.replace(/<!-- rr-logo-call-start -->[\s\S]*?<!-- rr-logo-call-end -->/g,'').replace(/<script\b[^>]*\bid=["']rr-brand-visibility["'][^>]*>[\s\S]*?<\/script>/gi,'');
 html=html.replace(/<img\b[^>]*>/gi,tag=>{
  if(!/\bclass=["'][^"']*\b(?:rr-approved-logo|rr-brand-logo)\b/.test(tag))return tag;
  let logo=tag.replace(/\s(?:srcset|data-srcset|data-src|data-lazy-src)=["'][^"']*["']/gi,'').replace(/\bsrc=["'][^"']*["']/i,'src="/brand/logo.png"');
  if(/\balt=["']/.test(logo))logo=logo.replace(/\balt=["'][^"']*["']/i,'alt="'+escape(config.biz)+' logo"');
  if(config.brand_logo_max_height){
   const height=Number(config.brand_logo_max_height);
   if(!Number.isFinite(height)||height<24||height>80)throw Error('Invalid approved logo height');
   const sizing=`height:${height}px!important;max-height:${height}px!important;width:auto!important;`;
   if(/\bstyle=["']/.test(logo))logo=logo.replace(/\bstyle=(["'])(.*?)\1/i,(_,quote,style)=>'style='+quote+style.split(';').filter(rule=>rule.trim()&&!/^(?:height|max-height|width)\s*:/i.test(rule.trim())).join(';')+';'+sizing+quote);
   else logo=logo.replace(/>$/,' style="'+sizing+'">');
  }
  return logo;
 });
 const position=html.toLowerCase().lastIndexOf('</body>');
 html=html.slice(0,position)+block+html.slice(position);
 for(const asset of html.matchAll(/\/(?:ours|brand)\/[^\s"'<>\)]+?\.(?:jpe?g|png|webp|avif|svg|ico)/gi)){
  if(!fs.existsSync(path.join(pub,decodeURIComponent(asset[0]))))throw Error('Missing published image: '+asset[0]);
 }
 if(html!==fs.readFileSync(file,'utf8')){fs.writeFileSync(file,html);changed++;}
 checked++;
}
console.log('Brand and mobile-call build passed:',config.domain||path.basename(root),checked,'pages;',changed,'updated');
