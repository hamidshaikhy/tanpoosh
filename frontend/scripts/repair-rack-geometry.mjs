/**
 * Rebuild the photographed garment surfaces with conforming, closed topology.
 * Source photographs and texture pixels are unchanged. Only vector silhouettes,
 * triangle connectivity and seam vertices are rebuilt.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ShapeUtils, Vector2 } from 'three';

const directory=fileURLToPath(new URL('../public/rack/',import.meta.url));
const maxEdge=.078;
const edgeKey=(a,b)=>a<b?`${a},${b}`:`${b},${a}`;

function simplifyClosed(points,tolerance){
  const loop=[...points,points[0]];
  const retained=new Set([0,loop.length-1]);
  function visit(start,end){
    const a=loop[start],b=loop[end],delta=b.clone().sub(a),length=delta.lengthSq();
    let maximum=tolerance*tolerance,selected=-1;
    for(let i=start+1;i<end;i++){
      const t=length?Math.max(0,Math.min(1,loop[i].clone().sub(a).dot(delta)/length)):0;
      const distance=loop[i].distanceToSquared(a.clone().addScaledVector(delta,t));
      if(distance>maximum){maximum=distance;selected=i;}
    }
    if(selected>=0){retained.add(selected);visit(start,selected);visit(selected,end);}
  }
  visit(0,loop.length-1);
  return [...retained].sort((a,b)=>a-b).slice(0,-1).map(i=>loop[i]);
}

function untangleOutline(points){
  // Insetting a narrow photographic crease can cross two neighbouring edges.
  // Remove only the small loop, retaining the garment's main silhouette.
  for(let pass=0;pass<64;pass++){
    let repaired=false;
    for(let i=0;i<points.length&&!repaired;i++)for(let j=i+2;j<points.length;j++){
      if(i===0&&j===points.length-1)continue;
      const a=points[i],b=points[(i+1)%points.length],c=points[j],d=points[(j+1)%points.length];
      const r=b.clone().sub(a),s=d.clone().sub(c),denominator=r.cross(s);
      if(Math.abs(denominator)<1e-12)continue;
      const offset=c.clone().sub(a),t=offset.cross(s)/denominator,u=offset.cross(r)/denominator;
      if(t<=1e-7||t>=1-1e-7||u<=1e-7||u>=1-1e-7)continue;
      const intersection=a.clone().addScaledVector(r,t);
      const first=[intersection,...points.slice(i+1,j+1)];
      const second=[intersection,...points.slice(j+1),...points.slice(0,i+1)];
      points=Math.abs(ShapeUtils.area(first))>Math.abs(ShapeUtils.area(second))?first:second;
      repaired=true;break;
    }
    if(!repaired)return points;
  }
  throw Error('Garment silhouette did not converge');
}

function smoothOutline(points,height){
  // Resample by distance so small corners get a consistent, subpixel smoothing.
  const lengths=points.map((p,i)=>p.distanceTo(points[(i+1)%points.length]));
  const total=lengths.reduce((a,b)=>a+b,0);
  const count=Math.ceil(total/(height/700));
  const sampled=[];let segment=0,travelled=0;
  for(let i=0;i<count;i++){
    const at=i/count*total;
    while(segment<points.length-1&&travelled+lengths[segment]<at){travelled+=lengths[segment];segment++;}
    sampled.push(points[segment].clone().lerp(points[(segment+1)%points.length],(at-travelled)/lengths[segment]));
  }
  const ccw=ShapeUtils.area(sampled)>0;
  const smoothed=sampled.map((p,i)=>sampled[(i+count-1)%count].clone().multiplyScalar(.18).addScaledVector(p,.64).addScaledVector(sampled[(i+1)%count],.18));
  // A small inward inset prevents the original photographic background from
  // being sampled at the boundary. It changes no texture pixels.
  const inset=smoothed.map((p,i)=>{
    const tangent=smoothed[(i+1)%count].clone().sub(smoothed[(i+count-1)%count]).normalize();
    const inward=new Vector2(-tangent.y,tangent.x).multiplyScalar(ccw?1:-1);
    return p.clone().addScaledVector(inward,height/1000);
  });
  return untangleOutline(simplifyClosed(inset,height/2000));
}

function subdivide(points,faces,outline){
  for(let pass=0;pass<12;pass++){
    const mids=new Map();
    const seamVertices=new Set(outline);
    const seamEdges=new Set(outline.map((a,i)=>edgeKey(a,outline[(i+1)%outline.length])));
    for(const [a,b,c] of faces)for(const [x,y] of [[a,b],[b,c],[c,a]]){
      const key=edgeKey(x,y);
      const flatChord=seamVertices.has(x)&&seamVertices.has(y)&&!seamEdges.has(key);
      if(points[x].distanceToSquared(points[y])<=maxEdge**2&&!flatChord)continue;
      if(mids.has(key))continue;
      mids.set(key,points.length);points.push(points[x].clone().add(points[y]).multiplyScalar(.5));
    }
    if(!mids.size)return {points,faces,outline};
    const next=[];
    for(const [a,b,c] of faces){
      const ab=mids.get(edgeKey(a,b)),bc=mids.get(edgeKey(b,c)),ca=mids.get(edgeKey(c,a));
      if(ab!==undefined&&bc!==undefined&&ca!==undefined)next.push([a,ab,ca],[ab,b,bc],[ca,bc,c],[ab,bc,ca]);
      else if(ab!==undefined&&bc!==undefined)next.push([ab,b,bc],[a,ab,c],[ab,bc,c]);
      else if(ab!==undefined&&ca!==undefined)next.push([a,ab,ca],[ab,b,c],[ab,c,ca]);
      else if(bc!==undefined&&ca!==undefined)next.push([bc,c,ca],[a,b,ca],[b,bc,ca]);
      else if(ab!==undefined)next.push([a,ab,c],[ab,b,c]);
      else if(bc!==undefined)next.push([b,bc,a],[bc,c,a]);
      else if(ca!==undefined)next.push([c,ca,b],[ca,a,b]);
      else next.push([a,b,c]);
    }
    const nextOutline=[];
    for(let i=0;i<outline.length;i++){
      const a=outline[i],b=outline[(i+1)%outline.length];nextOutline.push(a);
      const mid=mids.get(edgeKey(a,b));if(mid!==undefined)nextOutline.push(mid);
    }
    faces=next;outline=nextOutline;
  }
  throw Error('Garment tessellation did not converge');
}

function capBoundary(faces,name){
  const edges=new Map();
  for(const [a,b,c] of faces)for(const [x,y] of [[a,b],[b,c],[c,a]]){
    const key=edgeKey(x,y),edge=edges.get(key);
    if(edge)edge.count++;else edges.set(key,{a:x,b:y,count:1});
  }
  const exposed=[...edges.values()].filter(edge=>edge.count===1);
  const successor=new Map(exposed.map(edge=>[edge.a,edge.b]));
  const outline=[];let cursor=exposed[0].a;
  do{outline.push(cursor);cursor=successor.get(cursor);}while(cursor!==outline[0]&&cursor!==undefined&&outline.length<=exposed.length);
  if(cursor!==outline[0]||outline.length!==exposed.length)throw Error(`Invalid garment cap boundary: ${name}`);
  return outline;
}

function distanceToOutline(point,points,outline){
  let minimum=Infinity;
  for(let i=0;i<outline.length;i++){
    const a=points[outline[i]],b=points[outline[(i+1)%outline.length]];
    const dx=b.x-a.x,dy=b.y-a.y;
    const t=Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/(dx*dx+dy*dy)));
    minimum=Math.min(minimum,(point.x-a.x-t*dx)**2+(point.y-a.y-t*dy)**2);
  }
  return Math.sqrt(minimum);
}

for(const name of readdirSync(directory).filter(file=>file.endsWith('.json'))){
  const file=new URL(name,new URL('../public/rack/',import.meta.url));
  const data=JSON.parse(readFileSync(file,'utf8'));
  if(data.topologyVersion===2){console.log(`${name}: already repaired`);continue;}
  const boundary=Array.from({length:data.edge.length/6},(_,i)=>i);
  const original=boundary.map(i=>new Vector2(data.positions[i*3],data.positions[i*3+1]));
  const minX=Math.min(...original.map(p=>p.x)),maxX=Math.max(...original.map(p=>p.x));
  const minY=Math.min(...original.map(p=>p.y)),maxY=Math.max(...original.map(p=>p.y));
  const minU=Math.min(...boundary.map(i=>data.uvs[i*2])),maxU=Math.max(...boundary.map(i=>data.uvs[i*2]));
  const minV=Math.min(...boundary.map(i=>data.uvs[i*2+1])),maxV=Math.max(...boundary.map(i=>data.uvs[i*2+1]));
  const silhouette=data.photoOutline?data.photoOutline.map(([x,y])=>new Vector2(x,y)):original;
  let points=smoothOutline(silhouette,data.height);
  let faces=ShapeUtils.triangulateShape(points,[]).map(face=>{
    const [a,b,c]=face;
    return points[b].clone().sub(points[a]).cross(points[c].clone().sub(points[a]))>0?face:[a,c,b];
  });
  let outline=capBoundary(faces,name);
  ({points,faces,outline}=subdivide(points,faces,outline));
  // Earcut may omit collinear contour points. Derive the seam from actual cap
  // edges, rather than assuming every supplied outline segment survived.
  outline=capBoundary(faces,name);
  const boundarySet=new Set(outline);
  const positions=[],uvs=[];
  const add=(point,z)=>{
    const index=positions.length/3;
    positions.push(Number(point.x.toFixed(6)),Number(point.y.toFixed(6)),Number(z.toFixed(6)));
    uvs.push(Number((minU+(point.x-minX)/(maxX-minX)*(maxU-minU)).toFixed(7)),Number((minV+(point.y-minY)/(maxY-minY)*(maxV-minV)).toFixed(7)));
    return index;
  };
  const depth=points.map((point,i)=>{
    if(boundarySet.has(i))return 0;
    const d=distanceToOutline(point,points,outline)/data.height;
    const inflation=Math.min(.115,d*.75);
    return inflation+Math.min(.009,d*.13)*Math.sin(point.x*20+point.y*3);
  });
  for(let i=0;i<points.length;i++)add(points[i],depth[i]);
  // Front and rear share the very same seam indices. There is no detached
  // outline or dark extruded wall to separate when the fabric is deformed.
  const rear=points.map((point,i)=>boundarySet.has(i)?i:add(point,-depth[i]));
  const front=faces.flat();
  const back=faces.flatMap(([a,b,c])=>[rear[c],rear[b],rear[a]]);
  const mesh={...data,positions,uvs,front,back,edge:[],outline,topologyVersion:2};
  writeFileSync(file,JSON.stringify(mesh));
  console.log(`${name}: ${positions.length/3} vertices, ${faces.length*2} triangles, ${outline.length} welded seam vertices`);
}

// The lightweight homepage/fallback previews use the same repaired boundary.
const artwork={};
for(const name of readdirSync(directory).filter(file=>file.endsWith('.json'))){
  const data=JSON.parse(readFileSync(new URL(name,new URL('../public/rack/',import.meta.url)),'utf8'));
  const points=data.outline.map(i=>[Number((data.uvs[i*2]*1122).toFixed(2)),Number(((1-data.uvs[i*2+1])*1402).toFixed(2))]);
  const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
  const x=Math.min(...xs),y=Math.min(...ys);
  artwork[name.replace('.json','')]={path:'M'+points.map(p=>p.join(',')).join('L')+'Z',width:data.width,height:data.height,viewBox:`${x} ${y} ${Math.max(...xs)-x} ${Math.max(...ys)-y}`};
}
writeFileSync(new URL('../src/rack/artwork.ts',import.meta.url),'// Repaired silhouettes shared by the 3D meshes and lightweight previews.\nexport const ARTWORK: Record<string, {path:string;width:number;height:number;viewBox:string}> = '+JSON.stringify(artwork)+';\n');
