import * as THREE from "three";
import type { RackItem } from "./catalog";

type MeshData = { positions: number[]; uvs: number[]; front: number[]; back: number[]; edge: number[]; color: string; width: number; height: number };
export type RackControls = { active: number; inspecting: boolean; angle: number; paused: boolean };
type Options = { items: RackItem[]; initial: number; productView?: boolean; onSelect: (index: number) => void; onInspect: () => void; onProgress: (progress: number) => void; onReady: () => void; onError: () => void };
type Garment = { pivot: THREE.Group; body: THREE.Group; mesh: THREE.Mesh; rest: Float32Array; index: number; shadow: THREE.Mesh; width: number; textures: THREE.Texture[]; pullX:number; pullY:number; velocityX:number; velocityY:number; grabX:number; grabY:number; deformed:boolean };

const RAIL_Y = 3.52;
const MINIMUM_GAP = .34;
const STEP_DISTANCE = 1.82;

export function createRackScene(container: HTMLDivElement, options: Options) {
  let destroyed = false;
  let frame = 0;
  let movingUntil=performance.now()+2000;
  let controls: RackControls = { active: options.initial, inspecting: false, angle: 0, paused: false };
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#e9e8df");
  scene.fog = new THREE.Fog("#e9e8df", 16, 42);
  const camera = new THREE.PerspectiveCamera(31, 1, .1, 100);
  camera.position.set(0, options.productView?2.0:2.4, options.productView?8.3:10.1);
  camera.lookAt(0, options.productView?1.8:1.86, 0);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(Math.max(window.devicePixelRatio, 1.25), 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.28;
  renderer.domElement.setAttribute("aria-hidden", "true");
  container.appendChild(renderer.domElement);

  const hemi = new THREE.HemisphereLight("#ffffff", "#c7c1ac", 2.6);
  scene.add(hemi);
  const key = new THREE.DirectionalLight("#fff9ed", 3.1);
  key.position.set(-3.5, 8, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -14, right: 14, top: 8, bottom: -8, near: .1, far: 28 });
  key.shadow.bias = -.0004;
  key.shadow.normalBias = .018;
  key.shadow.radius = 5;
  scene.add(key);
  const fill = new THREE.DirectionalLight("#e8edff", 1.1);
  fill.position.set(7, 3, 2);
  scene.add(fill);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(180, 180), new THREE.ShadowMaterial({ color: "#414a35", opacity:.15 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -.2;
  floor.receiveShadow = true;
  scene.add(floor);
  const metal = new THREE.MeshStandardMaterial({ color: "#bfc0ba", metalness: .82, roughness: .26 });
  const wood = new THREE.MeshStandardMaterial({ color: "#9b7447", roughness: .7 });
  const rail = new THREE.Mesh(new THREE.CylinderGeometry(.021, .021, 100, 20), metal);
  rail.rotation.z = Math.PI / 2;
  rail.position.set(0, RAIL_Y, 0);
  rail.castShadow = true;
  scene.add(rail);
  rail.visible = !options.productView;
  // The background and shadow catcher share one uninterrupted studio backdrop.

  function tube(points: THREE.Vector3[], radius: number, material: THREE.Material) {
    return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 32, radius, 8, false), material);
  }
  function hanger(kind: RackItem["kind"]) {
    const g = new THREE.Group();
    const hook: THREE.Vector3[] = [];
    for (let i=0;i<=24;i++) {
      const a = Math.PI * -.12 + i/24 * Math.PI * 1.55;
      hook.push(new THREE.Vector3(Math.cos(a)*.055, 3.465+Math.sin(a)*.055, 0));
    }
    hook.push(new THREE.Vector3(0,3.30,0));
    g.add(tube(hook,.008,metal));
    if (kind === "trousers") {
      g.add(tube([new THREE.Vector3(0,3.30,0),new THREE.Vector3(0,3.17,0)],.009,metal));
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(.018,.018,.94,12),wood);
      bar.rotation.z=Math.PI/2;bar.position.y=3.13;g.add(bar);
      for (const x of [-.39,.39]) {
        const clip = new THREE.Mesh(new THREE.BoxGeometry(.055,.09,.04),metal);
        clip.position.set(x,3.095,.01);g.add(clip);
      }
    } else {
      const shoulders=[new THREE.Vector3(-.65,3.04,-.015),new THREE.Vector3(-.45,3.13,-.015),new THREE.Vector3(0,3.27,-.015),new THREE.Vector3(.45,3.13,-.015),new THREE.Vector3(.65,3.04,-.015)];
      g.add(tube(shoulders,.026,wood));
      g.add(tube([shoulders[0],new THREE.Vector3(0,2.995,-.015),shoulders[4]],.014,wood));
    }
    return g;
  }

  // A code-generated soft contact shadow, independent of a product photograph.
  const shadowCanvas = document.createElement("canvas");
  shadowCanvas.width=128; shadowCanvas.height=128;
  const ctx=shadowCanvas.getContext("2d")!;
  const gradient=ctx.createRadialGradient(64,64,0,64,64,64);
  gradient.addColorStop(0,"rgba(46,44,32,.23)");gradient.addColorStop(.4,"rgba(46,44,32,.12)");gradient.addColorStop(1,"rgba(46,44,32,0)");
  ctx.fillStyle=gradient;ctx.fillRect(0,0,128,128);
  const shadowTexture=new THREE.CanvasTexture(shadowCanvas);
  const garments: Garment[]=[];
  const loader = new THREE.TextureLoader();
  let loaded=0;
  async function loadGarment(item: RackItem,index: number) {
    const [data,map] = await Promise.all([
      fetch(`/rack/${item.asset}.json`).then(r=>{if(!r.ok)throw Error("Garment mesh unavailable");return r.json() as Promise<MeshData>;}),
      loader.loadAsync(`/rack/${item.asset}.webp`),
    ]);
    if(destroyed){map.dispose();return;}
    map.colorSpace=THREE.SRGBColorSpace;
    map.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
    const front=new THREE.MeshStandardMaterial({map,roughness:.94,metalness:0});
    const back=new THREE.MeshStandardMaterial({color:data.color,roughness:1});
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute("position",new THREE.Float32BufferAttribute(data.positions,3));
    geometry.setAttribute("uv",new THREE.Float32BufferAttribute(data.uvs,2));
    geometry.setIndex([...data.front,...data.back,...data.edge]);
    geometry.addGroup(0,data.front.length,0);
    geometry.addGroup(data.front.length,data.back.length+data.edge.length,1);
    geometry.computeVertexNormals();geometry.computeBoundingSphere();
    const garment=new THREE.Mesh(geometry,[front,back]);
    garment.castShadow=true;garment.receiveShadow=false;garment.userData.index=index;
    const body=new THREE.Group();body.add(garment,hanger(item.kind));
    // Position the rotational pivot at the hanger, so sway has a physical anchor.
    body.position.y=-RAIL_Y;
    const pivot=new THREE.Group();pivot.position.set((index-options.initial)*STEP_DISTANCE,RAIL_Y,0);pivot.add(body);
    pivot.rotation.y=index===options.initial?0:Math.PI*.39;
    scene.add(pivot);
    const shadow=new THREE.Mesh(new THREE.PlaneGeometry(data.width*1.7,1.4),new THREE.MeshBasicMaterial({map:shadowTexture,transparent:true,depthWrite:false}));
    shadow.rotation.x=-Math.PI/2;shadow.position.set(pivot.position.x,-.19,.1);scene.add(shadow);
    garments.push({pivot,body,mesh:garment,rest:new Float32Array(data.positions),index,shadow,width:data.width,textures:[map],pullX:0,pullY:0,velocityX:0,velocityY:0,grabX:0,grabY:1.8,deformed:false});
    movingUntil=performance.now()+1800;
    loaded++;options.onProgress(loaded/options.items.length);
  }
  Promise.all(options.items.map(loadGarment)).then(()=>{if(!destroyed)options.onReady();}).catch(()=>{if(!destroyed)options.onError();});

  const raycaster=new THREE.Raycaster();
  const pointer=new THREE.Vector2();
  let drag: {x:number;y:number;start:number;lastX:number;lastTime:number;velocity:number;moved:boolean;id:number;picked:number|null} | null=null;
  let dragOffset=0;
  let dragVertical=0;
  let lastWheel=0;
  function hit(x:number,y:number) {
    const rect=container.getBoundingClientRect();
    pointer.set((x-rect.left)/rect.width*2-1,-(y-rect.top)/rect.height*2+1);
    raycaster.setFromCamera(pointer,camera);
    return raycaster.intersectObjects(garments.map(g=>g.pivot),true).find(h=>typeof h.object.userData.index==="number");
  }
  const down=(event:PointerEvent)=>{
    if(controls.inspecting || controls.paused || options.productView || event.button!==0)return;
    event.preventDefault();
    const picked=hit(event.clientX,event.clientY);
    const pickedIndex=picked?.object.userData.index as number|undefined;
    if(picked&&pickedIndex!==undefined){
      const garment=garments.find(g=>g.index===pickedIndex)!;
      const local=garment.mesh.worldToLocal(picked.point.clone());
      garment.grabX=local.x;garment.grabY=local.y;
    }
    drag={x:event.clientX,y:event.clientY,start:controls.active,lastX:event.clientX,lastTime:performance.now(),velocity:0,moved:false,id:event.pointerId,picked:pickedIndex??null};
    movingUntil=performance.now()+2200;
    container.dataset.dragging="true";
    container.dataset.grabbed=pickedIndex===undefined?"rail":String(pickedIndex);
    renderer.domElement.setPointerCapture(event.pointerId);container.style.cursor="grabbing";
  };
  const move=(event:PointerEvent)=>{
    if(!drag){container.style.cursor="grab";return;}
    const dx=event.clientX-drag.x;
    if(Math.hypot(dx,event.clientY-drag.y)>5)drag.moved=true;
    const now=performance.now();
    drag.velocity=(event.clientX-drag.lastX)/Math.max(8,now-drag.lastTime);
    drag.lastX=event.clientX;drag.lastTime=now;
    dragOffset=dx/container.clientWidth*viewWidth;
    dragVertical=-(event.clientY-drag.y)/container.clientWidth*viewWidth;
    movingUntil=performance.now()+1800;
  };
  const up=(event:PointerEvent)=>{
    if(!drag)return;
    const current=drag;drag=null;container.style.cursor="grab";
    container.dataset.dragging="false";
    if(renderer.domElement.hasPointerCapture(event.pointerId))renderer.domElement.releasePointerCapture(event.pointerId);
    if(!current.moved){const index=hit(event.clientX,event.clientY)?.object.userData.index as number|undefined;if(index!==undefined){if(index===controls.active)options.onInspect();else options.onSelect(index);}}
    else {
      const coast=performance.now()-current.lastTime<90?current.velocity*.1:0;
      const delta=-dragOffset/STEP_DISTANCE-coast;
      options.onSelect(THREE.MathUtils.clamp(Math.round(current.start+delta),0,options.items.length-1));
    }
    dragOffset=0;dragVertical=0;movingUntil=performance.now()+2400;
  };
  const cancel=()=>{drag=null;dragOffset=0;dragVertical=0;movingUntil=performance.now()+2400;container.dataset.dragging="false";container.style.cursor="grab";};
  const wheel=(event:WheelEvent)=>{
    if(controls.inspecting||controls.paused)return;
    event.preventDefault();
    const delta=Math.abs(event.deltaX)>Math.abs(event.deltaY)?event.deltaX:event.deltaY;
    if(Math.abs(delta)>7&&performance.now()-lastWheel>300){lastWheel=performance.now();options.onSelect(THREE.MathUtils.clamp(controls.active+Math.sign(delta),0,options.items.length-1));}
  };
  renderer.domElement.addEventListener("pointerdown",down);
  renderer.domElement.addEventListener("pointermove",move);
  renderer.domElement.addEventListener("pointerup",up);
  renderer.domElement.addEventListener("pointercancel",cancel);
  renderer.domElement.addEventListener("wheel",wheel,{passive:false});
  let viewWidth=10;
  function resize(){
    const w=container.clientWidth,h=container.clientHeight;if(!w||!h)return;
    renderer.setSize(w,h);camera.aspect=w/h;
    // Preserve a full-length garment on both portrait and landscape displays.
    camera.fov=options.productView?26:(camera.aspect<.8?38:31);camera.updateProjectionMatrix();
    movingUntil=performance.now()+1800;
    viewWidth=2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*camera.position.z*camera.aspect;
  }
  const observer=new ResizeObserver(resize);observer.observe(container);resize();
  let lastTime=performance.now();let scroll=options.initial;let reveal=0;let angle=0;
  const render=(now:number)=>{
    frame=requestAnimationFrame(render);
    const dt=Math.min((now-lastTime)/1000,.12);lastTime=now;
    const settling=Math.abs(scroll-controls.active)>.001||garments.some(g=>Math.hypot(g.pullX,g.pullY,g.velocityX,g.velocityY)>.001);
    if(document.hidden||controls.paused||(!drag&&!settling&&now>movingUntil))return;
    const smooth=(current:number,target:number,speed=10)=>THREE.MathUtils.lerp(current,target,reducedMotion.matches?1:1-Math.exp(-speed*dt));
    const old=scroll;scroll=smooth(scroll,controls.active,9);
    const velocity=(scroll-old)/Math.max(dt,.001);
    reveal=smooth(reveal,controls.inspecting?1:0,7);
    angle=smooth(angle,controls.angle,8);
    const ordered=[...garments].sort((a,b)=>a.index-b.index);
    // Project the width of each garment and its hanger into the rail plane.
    // Wider selected pieces get their own space instead of covering neighbours.
    const halfWidths=ordered.map(g=>Math.max(.69,g.width*Math.abs(Math.cos(g.index===controls.active?angle:Math.PI*.39))*.53)+Math.abs(g.pullX)*.3);
    const slots:number[]=[];
    for(let i=0;i<ordered.length;i++)slots[i]=i===0?0:slots[i-1]+halfWidths[i-1]+halfWidths[i]+MINIMUM_GAP;
    const lower=Math.max(0,Math.min(ordered.length-1,Math.floor(scroll)));
    const upper=Math.min(ordered.length-1,lower+1);
    const centre=THREE.MathUtils.lerp(slots[lower]??0,slots[upper]??0,scroll-lower);
    for(const g of garments){
      const distance=g.index-scroll;
      const focused=Math.exp(-Math.pow(distance*1.75,2));
      const slot=ordered.findIndex(entry=>entry===g);
      const grabbed=drag?.picked===g.index&&drag.moved;
      // A grabbed cloth follows the pointer immediately. Its anchored collar
      // and neighbouring hangers remain on the rail while the fabric flexes.
      g.pivot.position.x=smooth(g.pivot.position.x,(slots[slot]??0)-centre+dragOffset,drag?42:12);
      g.pivot.position.z=smooth(g.pivot.position.z,focused*.55+(g.index===controls.active?reveal*.65:-reveal*.8),10);
      const targetRotation=(grabbed ? .28 : (1-focused)*Math.PI*.39)+(g.index===controls.active?angle:0)-Math.atan2(g.pivot.position.x,camera.position.z-g.pivot.position.z);
      g.pivot.rotation.y=smooth(g.pivot.rotation.y,targetRotation,9);
      const targetPullX=grabbed?THREE.MathUtils.clamp(dragOffset*.48,-.62,.62):0;
      const targetPullY=grabbed?THREE.MathUtils.clamp(dragVertical*.9,-.48,.42):0;
      if(reducedMotion.matches){g.pullX=targetPullX;g.pullY=targetPullY;g.velocityX=0;g.velocityY=0;}
      const substeps=Math.max(1,Math.ceil(dt*120));const step=dt/substeps;
      for(let n=0;n<substeps;n++){
        g.velocityX+=(145*(targetPullX-g.pullX)-18*g.velocityX)*step;g.pullX+=g.velocityX*step;
        g.velocityY+=(145*(targetPullY-g.pullY)-18*g.velocityY)*step;g.pullY+=g.velocityY*step;
      }
      const deforming=Math.abs(g.pullX)+Math.abs(g.pullY)>.0004;
      if(deforming||g.deformed){
        const position=g.mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
        for(let i=0;i<position.count;i++){
          const x=g.rest[i*3],y=g.rest[i*3+1],z=g.rest[i*3+2];
          const pinned=THREE.MathUtils.smoothstep(3.14-y,0,.48);
          const localWeight=Math.exp(-((x-g.grabX)**2+(y-g.grabY)**2)/.7)*pinned;
          const weight=localWeight*.78+pinned*.15;
          position.setXYZ(i,x+g.pullX*weight,y+g.pullY*weight,z+Math.hypot(g.pullX,g.pullY)*localWeight*.23);
        }
        position.needsUpdate=true;g.mesh.geometry.computeVertexNormals();g.mesh.geometry.computeBoundingSphere();g.deformed=deforming;
      }
      const sway=reducedMotion.matches?0:THREE.MathUtils.clamp(-velocity*.018-g.pullX*.13,-.14,.14);
      g.pivot.rotation.z=smooth(g.pivot.rotation.z,sway,grabbed?20:7);
      const size=g.index===controls.active?1+reveal*.10:1;
      g.pivot.scale.setScalar(smooth(g.pivot.scale.x,size,8));
      g.shadow.position.x=g.pivot.position.x;
      g.shadow.scale.x=.35+focused*.65;
    }
    // Resolve the actual rendered positions as well, including during a fast
    // change of selection, so transition lag cannot make garments intersect.
    const anchor=Math.max(0,ordered.findIndex(g=>g.index===controls.active));
    const projected=(g:Garment)=>Math.max(.69,g.width*Math.abs(Math.cos(g.pivot.rotation.y+Math.atan2(g.pivot.position.x,camera.position.z-g.pivot.position.z)))*.53)+Math.abs(g.pullX)*.3;
    for(let i=anchor+1;i<ordered.length;i++){const a=ordered[i-1],b=ordered[i];b.pivot.position.x=Math.max(b.pivot.position.x,a.pivot.position.x+projected(a)+projected(b)+MINIMUM_GAP);}
    for(let i=anchor-1;i>=0;i--){const a=ordered[i],b=ordered[i+1];a.pivot.position.x=Math.min(a.pivot.position.x,b.pivot.position.x-projected(a)-projected(b)-MINIMUM_GAP);}
    for(const g of ordered)g.shadow.position.x=g.pivot.position.x;
    // Dampen shadow-map work when the rack settles; hidden tabs are paused above.
    renderer.render(scene,camera);
    container.dataset.viewAngle=angle.toFixed(2);
    container.dataset.pull=String(Math.max(0,...garments.map(g=>Math.hypot(g.pullX,g.pullY))));
  };
  frame=requestAnimationFrame(render);
  const lost=(event:Event)=>{event.preventDefault();options.onError();};
  renderer.domElement.addEventListener("webglcontextlost",lost);
  return {
    update(next:RackControls){
      if(next.active!==controls.active||next.angle!==controls.angle||next.inspecting!==controls.inspecting||next.paused!==controls.paused)movingUntil=performance.now()+2200;
      controls=next;
    },
    destroy(){
      destroyed=true;cancelAnimationFrame(frame);observer.disconnect();
      renderer.domElement.removeEventListener("pointerdown",down);renderer.domElement.removeEventListener("pointermove",move);renderer.domElement.removeEventListener("pointerup",up);renderer.domElement.removeEventListener("pointercancel",cancel);renderer.domElement.removeEventListener("wheel",wheel);renderer.domElement.removeEventListener("webglcontextlost",lost);
      const disposed=new Set<THREE.Material|THREE.BufferGeometry>();
      scene.traverse(obj=>{if(obj instanceof THREE.Mesh){if(!disposed.has(obj.geometry)){obj.geometry.dispose();disposed.add(obj.geometry);}for(const m of Array.isArray(obj.material)?obj.material:[obj.material])if(!disposed.has(m)){m.dispose();disposed.add(m);}}});
      for(const g of garments)for(const t of g.textures)t.dispose();shadowTexture.dispose();renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();
    },
  };
}
