import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

// Render the actual component/helper; never maintain a second approximation of the studio.
const scratch=resolve("../.local-tools/photo-qa"), output=resolve("../.local-tools/screenshots/studio-without-outerwear");
await mkdir(scratch,{recursive:true});await mkdir(output,{recursive:true});
const composition=ts.transpileModule(await readFile("src/studio/composition.ts","utf8"),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText
  .replace('import neckOutline from "./head-neck-outline.json";',`const neckOutline=${await readFile("src/studio/head-neck-outline.json","utf8")};`);
await writeFile(resolve(scratch,"composition.mjs"),composition);
const component=ts.transpileModule(await readFile("src/studio/PhotoComposition.tsx","utf8"),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText
  .replaceAll('"react/jsx-runtime"',JSON.stringify(pathToFileURL(resolve("node_modules/react/jsx-runtime.js")).href))
  .replaceAll('"react"',JSON.stringify(pathToFileURL(resolve("node_modules/react/index.js")).href))
  .replaceAll('"./composition"','"./composition.mjs"');
await writeFile(resolve(scratch,"PhotoComposition.mjs"),component);
const {PhotoComposition}=await import(pathToFileURL(resolve(scratch,"PhotoComposition.mjs")).href);
const {compositionLayers}=await import(pathToFileURL(resolve(scratch,"composition.mjs")).href);
const manifest=JSON.parse(await readFile("public/studio-images/manifest.json","utf8"));
const choices=slot=>manifest.garments.filter(g=>g.slot===slot).flatMap(g=>Object.keys(g.colors).map(color=>({slug:g.id,color,size:null})));
const tops=choices("top"),bottoms=choices("bottom"),shoes=choices("shoes"),heads=[null,...choices("accessory")];
const filesFor=outfit=>["shoes","bottom","top","accessory"].filter(slot=>outfit[slot]).map(slot=>{const s=outfit[slot];return manifest.garments.find(g=>g.id===s.slug).colors[s.color].file;});
const base={top:tops.find(s=>s.slug==="knit-polo"),bottom:bottoms.find(s=>s.slug==="tailored-trousers"&&s.color==="black"),shoes:shoes.find(s=>s.slug==="derby-shoes"),accessory:heads.find(s=>s?.slug==="aviator-sunglasses")};
const browser=await chromium.launch({channel:"chrome",headless:true});
const context=await browser.newContext({bypassCSP:true,viewport:{width:1100,height:1800}});
const page=await context.newPage();await page.goto("http://localhost:8088/studio");
await page.addScriptTag({content:composition.replace(/^export /gm,"")+"\nwindow.photoQa={compositionLayers,paintComposition,FRAME,FACE_CLEAR};"});
await page.evaluate(async m=>{
  window.photoQa.photos=new Map();
  const files=[m.model.file,...m.garments.flatMap(g=>Object.values(g.colors).map(i=>i.file))];
  await Promise.all(files.map(async file=>{const im=new Image();im.src=file;await im.decode();window.photoQa.photos.set(file,im);}));
},manifest);
let sequence=0;
const card=(outfit,label)=>{
  const svg=renderToStaticMarkup(React.createElement(PhotoComposition,{manifest,files:filesFor(outfit),label}),{identifierPrefix:`case-${sequence++}-`});
  return `<article><p>${label}</p><div class="photo">${svg}</div></article>`;
};
const sheet=async(name,cards)=>{
  await page.setContent(`<style>body{margin:0;background:#fff;font:13px Arial}main{display:grid;grid-template-columns:repeat(3,342px);gap:10px}p{margin:8px 4px;height:18px}.photo{width:342px;height:513px;background:#ece8df}.photo svg{width:100%;height:100%;display:block}</style><main>${cards.join("")}</main>`);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.screenshot({path:resolve(output,name+".png"),fullPage:true});
};
for(let i=0;i<tops.length;i+=3){
  await sheet(`tops-${i+1}`,tops.slice(i,i+3).map(top=>card({...base,top},`${top.slug}/${top.color}`)));
}
for(const bottom of bottoms){
  await sheet(`bottom-${bottom.slug}-${bottom.color}`,shoes.map(shoe=>card({...base,bottom,shoes:shoe},`${bottom.slug}/${bottom.color} + ${shoe.slug}/${shoe.color}`)));
}
await sheet("faces",heads.map(accessory=>card({...base,accessory},accessory?.slug??"without eyewear")));
await page.locator(".photo svg").evaluateAll(nodes=>nodes.forEach(node=>node.setAttribute("viewBox","390 25 240 300")));
await page.screenshot({path:resolve(output,"faces-detail.png"),fullPage:true});

// All body/eyewear selections: the face must be exactly the chosen original head pixels.
const faceCheck=await page.evaluate(({manifest,tops,heads,base})=>{
  const {compositionLayers,paintComposition,photos,FRAME,FACE_CLEAR}=window.photoQa;
  const filesFor=outfit=>["shoes","bottom","top","accessory"].filter(slot=>outfit[slot]).map(slot=>{const s=outfit[slot];return manifest.garments.find(g=>g.id===s.slug).colors[s.color].file;});
  const canvas=document.createElement("canvas");canvas.width=FRAME.width;canvas.height=FRAME.height;
  const ctx=canvas.getContext("2d",{willReadFrequently:true});let checked=0,backgroundChecks=0;
  for(const accessory of heads){
    const expected=compositionLayers(manifest,filesFor({...base,accessory}))[0];
    paintComposition(ctx,[expected],photos);
    const reference=ctx.getImageData(410,35,180,FACE_CLEAR-35).data;
    for(const [x,y] of [[10,10],[100,100],[900,100],[750,200]]){
      const pixel=ctx.getImageData(x,y,1,1).data;
      if(pixel.some((value,i)=>value!==[236,232,223,255][i]))throw Error(`Contaminated head background: ${accessory?.slug??"bare"} at ${x}/${y}`);
      backgroundChecks++;
    }
    for(const top of tops){
      paintComposition(ctx,compositionLayers(manifest,filesFor({...base,top,accessory})),photos);
      const actual=ctx.getImageData(410,35,180,FACE_CLEAR-35).data;
      for(let i=0;i<actual.length;i++)if(actual[i]!==reference[i])throw Error(`Face changed with ${top.slug}/${top.color}, ${accessory?.slug??"no eyewear"}, pixel byte ${i}`);
      checked++;
    }
  }
  return {checked,changedFacePixels:0,backgroundChecks};
},{manifest,tops,heads,base});
let combinations=0;
for(const top of tops)for(const bottom of bottoms)for(const shoe of shoes)for(const accessory of heads){
  const layers=compositionLayers(manifest,filesFor({top,bottom,shoes:shoe,accessory}));
  if(layers.some(l=>l.matrix.some(n=>!Number.isFinite(n))))throw Error("Non-finite registration");
  if(layers.filter(l=>l.head).length!==1)throw Error("Duplicate or missing face");
  if(layers.some(l=>l.slot==="top"&&!l.protectFace))throw Error("Unprotected face");
  combinations++;
}
const report={faceCheck,combinations,topImages:tops.length,bottomShoeImages:bottoms.length*shoes.length};
await writeFile(resolve(output,"report.json"),JSON.stringify(report,null,2));
const example=base;
await page.setContent(`<style>body{margin:0}.photo{width:1024px;height:1536px}.photo svg{width:100%;height:100%;display:block}p{display:none}</style>${card(example,"Knit polo with trousers, derby shoes and aviators")}`);
await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
await page.locator(".photo").screenshot({path:resolve(output,"sample-look.png")});
console.log(JSON.stringify(report));await browser.close();
