/** Encode the generated still-life photos and split the transparent category strip. */
import sharp from 'sharp';
import { mkdir,writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const inputs=process.argv.slice(2);
if(inputs.length!==4)throw Error('Provide navy, ivory, weekend and transparent category-strip source images.');
const directory=fileURLToPath(new URL('../public/editorial/home/',import.meta.url));
await mkdir(`${directory}/categories`,{recursive:true});
const metadata={};
for(const [i,name] of ['navy','ivory','weekend'].entries()){
  const source=sharp(inputs[i]);
  const {width,height}=await source.metadata();
  const patchBytes=await source.clone().extract({left:Math.floor(width*.90),top:Math.floor(height*.15),width:32,height:32}).toBuffer();
  const patch=await sharp(patchBytes).stats();
  const background='#'+patch.channels.slice(0,3).map(channel=>Math.round(channel.mean).toString(16).padStart(2,'0')).join('');
  await source.webp({quality:91,effort:6}).toFile(`${directory}/hero-${name}.webp`);
  metadata[name]={src:`/editorial/home/hero-${name}.webp`,width,height,background};
}
const {data,info}=await sharp(inputs[3]).ensureAlpha().raw().toBuffer({resolveWithObject:true});
const weights=Array(info.width).fill(0);
for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)weights[x]+=data[(y*info.width+x)*4+3]/255;
const cuts=[0];
for(let i=1;i<5;i++){
  const target=info.width*i/5;let best=Math.round(target),score=Infinity;
  for(let x=Math.floor(target-info.width*.04);x<Math.ceil(target+info.width*.04);x++){
    const candidate=weights[x]+Math.abs(x-target)*.0001;
    if(candidate<score){score=candidate;best=x;}
  }
  cuts.push(best);
}
cuts.push(info.width);
for(const [i,name] of ['sunglasses','shoes','trousers','t-shirts','jackets'].entries()){
  const cell=await sharp(inputs[3]).extract({left:cuts[i],top:0,width:cuts[i+1]-cuts[i],height:info.height}).toBuffer();
  await sharp(cell).trim({background:'#00000000',threshold:8}).webp({quality:91,alphaQuality:100,effort:6}).toFile(`${directory}/categories/${name}.webp`);
}
await writeFile(new URL('../src/components/home/hero-assets.json',import.meta.url),JSON.stringify(metadata,null,2)+'\n');
console.log(JSON.stringify({hero:metadata,categoryColumns:cuts}));
