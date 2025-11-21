import {axialKey, getTilesInRadius, tileIndex} from './world';
import {animateCamera, axialToPixel, camera, HEX_SIZE, HEX_SPACE, hexDistance, pixelToAxial, updateCameraRadius} from './camera';
import type {Tile} from './world';
import {type Hero, heroes, selectedHeroId} from '../store/heroStore';
import {TERRAIN_DEFS} from './terrainDefs';
import {heroAnimationSet, heroAnimName, resolveActivity, shouldFlip} from './heroSprite';

// Tile assets (importing here to keep service encapsulated)
import forest from '../assets/tiles/forest.png';
import plains from '../assets/tiles/plains.png';
import mountain from '../assets/tiles/mountains.png';
import water from '../assets/tiles/water.png';
import mine from '../assets/tiles/mine.png';
import ruin from '../assets/tiles/ruin.png';
import towncenter from '../assets/tiles/towncenter.png';

interface PathCoord { q:number; r:number }
interface DrawOptions { hoveredTile: Tile | null; hoveredHero: Hero | null; pathCoords: PathCoord[] }

export class HexMapService {

  // Config constants (exposed for potential external tuning later)
  readonly TILE_DRAW_SIZE = (HEX_SIZE * 2) - HEX_SPACE;
  readonly heroFrameSize = heroAnimationSet.size;
  // Removed fixed heroFrames/speed/row in favor of animation definitions
  readonly heroZoom = 2;
  readonly HERO_OFFSET_SPACING = 14;

  private _canvas: HTMLCanvasElement | null = null;
  private _container: HTMLDivElement | null = null;
  private _ctx: CanvasRenderingContext2D | null = null;
  private _layerCanvas: HTMLCanvasElement | null = null;
  private _layerCtx: CanvasRenderingContext2D | null = null;
  private _dpr = window.devicePixelRatio || 1;

  private _images: Record<string, HTMLImageElement> = {};
  private _maskedImages: Record<string, HTMLCanvasElement> = {};
  private _imagesLoaded = false;
  private _heroImages: Record<string, HTMLImageElement> = {};
  private _heroImagesLoaded = false;

  private _heroLayouts: Map<string, Record<string,{x:number;y:number}>> = new Map();

  private _heroMasksByRow: Record<string, Record<number, Uint8Array[]>> = {};
  private _heroEdgePixelsByRow: Record<string, Record<number, {x:number;y:number}[][]>> = {};

  private _heroAnimStart = performance.now();
  private _lastHeroFrame = 0;

  // Pathfinding statics
  private readonly AXIAL_DELTAS: Array<[number, number]> = [[0,-1],[1,-1],[1,0],[0,1],[-1,1],[-1,0]];

  // Asset sources
  private readonly tileImgSources: Record<string,string> = {forest, plains, mountain, water, mine, ruin, towncenter};

  async init(canvasEl: HTMLCanvasElement, containerEl: HTMLDivElement) {
    this._canvas = canvasEl;
    this._container = containerEl;
    this._dpr = window.devicePixelRatio || 1;
    this.setupCanvas();
    await this.loadTileImages();
    await this.ensureHeroAssets();
    this.resize();
    animateCamera();
  }

  destroy() {
    this._canvas = null;
    this._container = null;
    this._ctx = null;
    this._layerCanvas = null;
    this._layerCtx = null;
    this._heroLayouts.clear();
  }

  resize() {
    if (!this._canvas || !this._container) return;
    const w = this._container.clientWidth;
    const h = this._container.clientHeight;
    this._dpr = window.devicePixelRatio || 1;
    this._canvas.width = w * this._dpr;
    this._canvas.height = h * this._dpr;
    this._canvas.style.width = w + 'px';
    this._canvas.style.height = h + 'px';
    this._ctx = this._canvas.getContext('2d');
    if (this._ctx) this._ctx.imageSmoothingEnabled = false;
    if (!this._layerCanvas) this._layerCanvas = document.createElement('canvas');
    this._layerCanvas.width = this._canvas.width;
    this._layerCanvas.height = this._canvas.height;
    this._layerCtx = this._layerCanvas.getContext('2d');
    if (this._layerCtx) this._layerCtx.imageSmoothingEnabled = false;
    this.adaptiveCameraRadius();
  }

  draw(opts: DrawOptions) {
    if (!this._ctx || !this._canvas) return;
    if (!this._imagesLoaded) return;
    const ctx = this._ctx;
    ctx.clearRect(0,0,this._canvas.width,this._canvas.height);

    const pixelSpeed = camera.speed * (HEX_SIZE * 0.9);
    let blurStrength = Math.min(12, Math.max(0, (pixelSpeed - 100) * 0.005));
    const brightness = blurStrength > 0 ? 1 - Math.min(0.15, blurStrength * 0.02) : 1;

    if (blurStrength < 0.4 || !this._layerCtx) {
      this.drawTilesAndActors(ctx, opts);
      return;
    }
    this._layerCtx.clearRect(0,0,this._layerCanvas!.width,this._layerCanvas!.height);
    this.drawTilesAndActors(this._layerCtx, opts);
    ctx.drawImage(this._layerCanvas!,0,0);
    this._canvas.style.filter = `blur(${blurStrength.toFixed(2)}px) brightness(${brightness.toFixed(2)})`;
  }

  updatePath(selectedId: string | null, hoveredTile: Tile | null): PathCoord[] {
    if (!selectedId || !hoveredTile) return [];
    const hero = heroes.find(h => h.id === selectedId);
    if (!hero) return [];
    if (hoveredTile.discovered && !this.isWalkable(hoveredTile.q, hoveredTile.r)) return [];
    return this.findWalkablePath(hero.q, hero.r, hoveredTile.q, hoveredTile.r);
  }

  // New: expose pathfinding for external movement start
  public findWalkablePath(startQ:number,startR:number,goalQ:number,goalR:number,maxNodes=9999): PathCoord[] {
    if (startQ===goalQ && startR===goalR) return [];
    
    if (!this.isWalkable(startQ, startR)) return [];
    interface PathNode { q:number;r:number; g:number; f:number; parent?: PathNode }
    const open: PathNode[] = []; const openMap = new Map<string,PathNode>(); const closed = new Set<string>();
    const startNode: PathNode = {q:startQ,r:startR,g:0,f:this.axialDistance(startQ,startR,goalQ,goalR)};
    open.push(startNode); openMap.set(axialKey(startQ,startR), startNode);
    let iterations=0;
    while (open.length && iterations < maxNodes) {
      iterations++;
      let bestIndex=0; let best = open[0]!;
      for (let i=1;i<open.length;i++){ if (open[i]!.f < best.f){ best=open[i]!; bestIndex=i; } }
      const current = best; open.splice(bestIndex,1); openMap.delete(axialKey(current.q,current.r));
      closed.add(axialKey(current.q,current.r));
      if (current.q===goalQ && current.r===goalR) {
        const rev: PathCoord[] = []; let n: PathNode | undefined = current;
        while (n && !(n.q===startQ && n.r===startR)) { rev.push({q:n.q,r:n.r}); n = n.parent; }
        rev.reverse(); return rev;
      }
      for (const [dq,dr] of this.AXIAL_DELTAS) {
        const nq = current.q + dq; const nr = current.r + dr; const key = axialKey(nq,nr);
        if (closed.has(key)) continue;
        if (!this.isWalkable(nq,nr) && !(nq===goalQ && nr===goalR)) continue;
        const tentativeG = current.g + 1;
        let node = openMap.get(key);
        if (!node) { node = {q:nq,r:nr,g:tentativeG,f: tentativeG + this.axialDistance(nq,nr,goalQ,goalR), parent: current}; open.push(node); openMap.set(key,node); }
        else if (tentativeG < node.g) { node.g = tentativeG; node.f = tentativeG + this.axialDistance(nq,nr,goalQ,goalR); node.parent = current; }
      }
    }
    return [];
  }

  pickTile(screenX: number, screenY: number): Tile | null {
    if (!this._canvas) return null;
    const rect = this._canvas.getBoundingClientRect();
    const sx = screenX - rect.left;
    const sy = screenY - rect.top;
    const {worldX, worldY} = this.screenToWorld(sx, sy);
    const {q,r} = pixelToAxial(worldX, worldY);
    const results = getTilesInRadius(q,r,0);
    return results.length ? results[0]! : null;
  }

  pickHero(screenX: number, screenY: number): Hero | null {
    if (!this._canvas) return null;
    const rect = this._canvas.getBoundingClientRect();
    const sx = screenX - rect.left;
    const sy = screenY - rect.top;
    // Iterate in reverse to match draw stacking
    for (let i = heroes.length - 1; i >= 0; i--) {
      const h = heroes[i]!;
      const {x, y} = this.worldToScreen(h.q, h.r);
      const layout = this._heroLayouts.get(axialKey(h.q,h.r)) || {};
      const pos = layout[h.id] || {x:0,y:0};
      const left = x - (this.heroFrameSize * this.heroZoom)/2 + pos.x - (this.heroFrameSize / 2);
      const top = y - (this.heroFrameSize * 2) + (this.heroFrameSize/2) + pos.y;
      const w = this.heroFrameSize * this.heroZoom;
      const hH = this.heroFrameSize * this.heroZoom;
      if (sx < left || sx > left + w || sy < top || sy > top + hH) continue;
      const localX = Math.floor((sx - left) / this.heroZoom);
      const localY = Math.floor((sy - top) / this.heroZoom);
      if (localX < 0 || localX >= this.heroFrameSize || localY < 0 || localY >= this.heroFrameSize) continue;
      const frameIndex = this._lastHeroFrame;
      // Determine idle row for facing for pixel mask (better match than always down)
      const facingRowMap: Record<string, number> = { right: 2, left: 2, up: 5, down: 8 };
      const row = facingRowMap[h.facing] ?? 8;
      const rowMasks = this._heroMasksByRow[h.avatar]?.[row];
      const mask = rowMasks ? rowMasks[Math.min(frameIndex, rowMasks.length - 1)] : null;
      if (!mask) continue;
      if (mask[localY * this.heroFrameSize + localX]) return h;
    }
    return null;
  }

  // ---------------- Private helpers ----------------
  private setupCanvas() {
    if (!this._canvas) return;
    this._ctx = this._canvas.getContext('2d');
    if (this._ctx) this._ctx.imageSmoothingEnabled = false;
  }

  private computeFade(dist:number, inner:number, radius:number) {
    const span = Math.max(3, (radius - inner));
    let fade = 1 - Math.max(0, (dist - inner) / span);
    fade = Math.min(1, Math.max(0, fade));
    return fade;
  }

  private getCanvasCenter() {
    if (!this._canvas) return {cx:0, cy:0};
    return {cx: this._canvas.width / this._dpr / 2, cy: this._canvas.height / this._dpr / 2};
  }
  private worldToScreen(q:number,r:number) {
    const camPx = axialToPixel(camera.q, camera.r);
    const {cx, cy} = this.getCanvasCenter();
    const tilePx = axialToPixel(q,r);
    return {x: tilePx.x - camPx.x + cx, y: tilePx.y - camPx.y + cy};
  }
  private screenToWorld(x:number,y:number) {
    const camPx = axialToPixel(camera.q, camera.r);
    const {cx, cy} = this.getCanvasCenter();
    const worldX = x - (cx - camPx.x);
    const worldY = y - (cy - camPx.y);
    return {worldX, worldY};
  }

  private drawHexPath(ctx: CanvasRenderingContext2D, x:number,y:number) {
    const w = this.TILE_DRAW_SIZE;
    const h = this.TILE_DRAW_SIZE;
    ctx.moveTo(x + 0.5 * w - HEX_SIZE, y - HEX_SIZE);
    ctx.lineTo(x + w - HEX_SIZE, y + 0.25 * h - HEX_SIZE);
    ctx.lineTo(x + w - HEX_SIZE, y + 0.75 * h - HEX_SIZE);
    ctx.lineTo(x + 0.5 * w - HEX_SIZE, y + h - HEX_SIZE);
    ctx.lineTo(x - HEX_SIZE, y + 0.75 * h - HEX_SIZE);
    ctx.lineTo(x - HEX_SIZE, y + 0.25 * h - HEX_SIZE);
    ctx.closePath();
  }
  private drawHexHighlight(ctx:CanvasRenderingContext2D,q:number,r:number,fill:string|null,stroke:string|null,opacity:number){
    const {x,y} = axialToPixel(q,r);
    ctx.globalAlpha = opacity;
    ctx.beginPath();
    this.drawHexPath(ctx,x,y);
    if (fill){ ctx.fillStyle = fill; ctx.fill(); }
    if (stroke){ ctx.lineWidth = 2; ctx.strokeStyle = stroke; ctx.stroke(); }
    ctx.globalAlpha = 1;
  }

  private drawTilesAndActors(ctx: CanvasRenderingContext2D, opts: DrawOptions) {
    if (!this._canvas) return;
    const camPx = axialToPixel(camera.q, camera.r);
    const {cx, cy} = this.getCanvasCenter();
    const translateX = cx - camPx.x;
    const translateY = cy - camPx.y;
    ctx.save();
    ctx.scale(this._dpr, this._dpr);
    ctx.translate(translateX, translateY);

    const cq = Math.round(camera.q);
    const cr = Math.round(camera.r);
    const tiles = getTilesInRadius(cq, cr, camera.radius);
    for (const t of tiles) {
      const dist = hexDistance(camera, t);
      const opacity = (() => { const f = this.computeFade(dist, camera.innerRadius, camera.radius); return f * f; })();
      const {x, y} = axialToPixel(t.q, t.r);
      if (t.discovered) {
        const key = this.getTileImageKey(t);
        const masked = this._maskedImages[key ?? 'plains'];
        if (!masked) continue;
        ctx.globalAlpha = opacity;
        ctx.drawImage(masked, x - HEX_SIZE, y - HEX_SIZE);
      } else {
        ctx.globalAlpha = opacity * 0.5;
        ctx.fillStyle = '#242c3f';
        ctx.beginPath();
        const w = this.TILE_DRAW_SIZE; const h = this.TILE_DRAW_SIZE;
        ctx.moveTo(x + 0.5 * w - HEX_SIZE, y - HEX_SIZE);
        ctx.lineTo(x + w - HEX_SIZE, y + 0.25 * h - HEX_SIZE);
        ctx.lineTo(x + w - HEX_SIZE, y + 0.75 * h - HEX_SIZE);
        ctx.lineTo(x + 0.5 * w - HEX_SIZE, y + h - HEX_SIZE);
        ctx.lineTo(x - HEX_SIZE, y + 0.75 * h - HEX_SIZE);
        ctx.lineTo(x - HEX_SIZE, y + 0.25 * h - HEX_SIZE);
        ctx.closePath();
        ctx.fill();
      }
    }

    // Path highlight (iterate directly to avoid undefined index warnings)
    if (opts.pathCoords.length) {
      for (const pc of opts.pathCoords) {
        const dist = hexDistance(camera, pc);
        const opacity = (() => { const f = this.computeFade(dist, camera.innerRadius, camera.radius); return f * f; })();
        if (hexDistance(camera, pc) > camera.radius + 1) continue;
        const last = pc === opts.pathCoords[opts.pathCoords.length - 1];
        this.drawHexHighlight(ctx, pc.q, pc.r,
          last ? 'rgba(216,244,255,0.18)' : 'rgba(250,253,255,0.5)',
          last ? '#dbedff' : '#daf0ff',
          opacity);
      }
    }

    // Hover highlight
    if (opts.hoveredTile) {
      const ht = opts.hoveredTile;
      if (hexDistance(camera, ht) <= camera.radius + 1) {
        const dist = hexDistance(camera, ht);
        const opacity = (() => { const f = this.computeFade(dist, camera.innerRadius, camera.radius); return f * f; })();
        this.drawHexHighlight(ctx, ht.q, ht.r, 'rgba(255, 227, 122, 0.15)', '#d0b23d', opacity);
      }
    }

    // Heroes
    this.drawHeroes(ctx, opts.hoveredHero);

    ctx.restore();
  }

  private drawHeroes(ctx: CanvasRenderingContext2D, hoveredHero: Hero | null) {
    if (!this._heroImagesLoaded) return;
    const radius = camera.radius + 1;
    // Rebuild layout map
    const map = new Map<string, Hero[]>();
    for (const h of heroes) {
      const key = axialKey(h.q,h.r);
      let list = map.get(key); if (!list){ list=[]; map.set(key,list);} list.push(h);
    }
    this._heroLayouts = new Map();
    for (const [k,list] of map) this._heroLayouts.set(k, this.computeTileHeroOffsets(list));

    const now = performance.now();

    for (const h of heroes) {
      const dist = hexDistance(camera, h);
      if (dist > radius) continue;
      const img = this._heroImages[h.avatar];
      if (!img) continue;
      const layout = this._heroLayouts.get(axialKey(h.q,h.r)) || {};
      const pos = layout[h.id] || {x:0,y:0};
      const opacity = this.computeFade(dist, camera.innerRadius, camera.radius);
      const {x,y} = axialToPixel(h.q,h.r);
      const destX = x - (this.heroFrameSize * this.heroZoom)/2 + pos.x - (this.heroFrameSize/2);
      const destY = y - (this.heroFrameSize * 2) + (this.heroFrameSize/2) + pos.y;

      // Determine activity based on movement state
      const remaining = h.movement ? (h.movement.path.length) : 0;
      const activity = resolveActivity(remaining);
      const animName = heroAnimName(activity, h.facing);
      const anim = heroAnimationSet.get(animName) || heroAnimationSet.get('idleDown')!;
      const elapsed = now - this._heroAnimStart;
      const frameSize = this.heroFrameSize;
      const frames = anim.frames;
      const frameDuration = anim.frameDuration;
      const cycle = frames * frameDuration + (anim.cooldown || 0);
      const inCycle = elapsed % cycle;
      const frameIndex = (frames <= 1) ? 0 : (inCycle >= frames * frameDuration ? frames -1 : Math.floor(inCycle / frameDuration));
      this._lastHeroFrame = frameIndex; // used for interaction masks

      let sx = frameIndex * frameSize;
      const sy = anim.row * frameSize;

      ctx.globalAlpha = opacity;
      ctx.imageSmoothingEnabled = false;

      if (shouldFlip(h.facing)) {
        ctx.save();
        ctx.translate(destX + frameSize * this.heroZoom, destY);
        ctx.scale(-1,1);
        ctx.drawImage(img, sx, sy, frameSize, frameSize, 0, 0, frameSize * this.heroZoom, frameSize * this.heroZoom);
        ctx.restore();
      } else {
        ctx.drawImage(img, sx, sy, frameSize, frameSize, destX, destY, frameSize * this.heroZoom, frameSize * this.heroZoom);
      }

      const selected = selectedHeroId.value === h.id;
      const hovered = hoveredHero && hoveredHero.id === h.id;
      if ((selected || hovered)) {
        const edgeFrames = this._heroEdgePixelsByRow[h.avatar]?.[anim.row];
        const edgePixels = edgeFrames ? edgeFrames[frameIndex] : undefined;
        if (edgePixels && edgePixels.length) {
          ctx.save();
            ctx.globalAlpha = opacity;
            if (shouldFlip(h.facing)) {
              ctx.translate(destX + frameSize * this.heroZoom, destY);
              ctx.scale(-1,1);
            } else {
              ctx.translate(destX, destY);
            }
            ctx.scale(this.heroZoom, this.heroZoom);
            ctx.fillStyle = selected ? '#ffe080' : '#ffffff';
            ctx.shadowColor = selected ? 'rgba(255,224,128,0.9)' : 'rgba(255,255,255,0.6)';
            ctx.shadowBlur = selected ? 12 : 8;
            for (const p of edgePixels) ctx.fillRect(p.x, p.y, 1, 1);
          ctx.restore();
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  private computeTileHeroOffsets(list: Hero[]): Record<string,{x:number;y:number}> {
    const result: Record<string,{x:number;y:number}> = {};
    const count = list.length;
    if (count===0) return result;
    if (count===1){ result[list[0]!.id] = {x:12,y:0}; return result; }
    if (count===2){ result[list[0]!.id] = {x:-5,y:0}; result[list[1]!.id]={x:32,y:0}; return result; }
    if (count===3){ result[list[0]!.id]={x:-5,y:-2}; result[list[1]!.id]={x:12,y:8}; result[list[2]!.id]={x:32,y:-2}; return result; }
    if (count===4){ result[list[0]!.id]={x:12,y:-10}; result[list[1]!.id]={x:-7,y:4}; result[list[2]!.id]={x:32,y:4}; result[list[3]!.id]={x:12,y:18}; return result; }
    if (count===5){ result[list[0]!.id]={x:16,y:-10}; result[list[1]!.id]={x:-7,y:4}; result[list[2]!.id]={x:32,y:4}; result[list[3]!.id]={x:10,y:8}; result[list[4]!.id]={x:16,y:22}; return result; }
    if (count===6){ result[list[0]!.id]={x:16,y:-12}; result[list[1]!.id]={x:-10,y:0}; result[list[2]!.id]={x:38,y:0}; result[list[3]!.id]={x:0,y:12}; result[list[4]!.id]={x:28,y:16}; result[list[5]!.id]={x:16,y:28}; return result; }
    const span = count - 1;
    for (let i=0;i<count;i++) {
      const offset = (i - span/2) * this.HERO_OFFSET_SPACING;
      result[list[i]!.id] = {x:offset,y:0};
    }
    return result;
  }

  private getTileImageKey(t: Tile) { return t.terrain; }

  private createMaskedImage(img: HTMLImageElement): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = this.TILE_DRAW_SIZE; c.height = this.TILE_DRAW_SIZE;
    const g = c.getContext('2d')!;
    const w = this.TILE_DRAW_SIZE; const h = this.TILE_DRAW_SIZE;
    g.save(); g.beginPath();
    g.moveTo(0.5 * w, 0); g.lineTo(w, 0.25 * h); g.lineTo(w, 0.75 * h); g.lineTo(0.5 * w, h); g.lineTo(0, 0.75 * h); g.lineTo(0, 0.25 * h); g.closePath();
    g.clip(); g.drawImage(img, 0,0,w,h); g.restore();
    return c;
  }
  private buildMaskedImages() {
    for (const [key,img] of Object.entries(this._images)) {
      if (!this._maskedImages[key] && img.width>0 && img.height>0) {
        this._maskedImages[key] = this.createMaskedImage(img);
      }
    }
  }
  private async loadTileImages() {
    const promises = Object.entries(this.tileImgSources).map(([key,src]) => new Promise<void>(resolve => {
      const img = new Image();
      img.onload = () => { this._images[key] = img; resolve(); };
      img.src = src;
    }));
    await Promise.all(promises);
    this._imagesLoaded = true;
    this.buildMaskedImages();
  }

  private buildHeroMasks(img: HTMLImageElement, avatar: string) {
    if (!this._heroMasksByRow[avatar]) this._heroMasksByRow[avatar] = {};
    if (!this._heroEdgePixelsByRow[avatar]) this._heroEdgePixelsByRow[avatar] = {};
    const processedRows = new Set<number>();
    for (const anim of heroAnimationSet.list()) {
      const row = anim.row;
      if (processedRows.has(row)) continue;
      processedRows.add(row);
      const frames = anim.frames;
      const masks: Uint8Array[] = [];
      const edges: {x:number;y:number}[][] = [];
      for (let f=0; f<frames; f++) {
        const sx = f * this.heroFrameSize;
        const sy = row * this.heroFrameSize;
        const c = document.createElement('canvas'); c.width = this.heroFrameSize; c.height = this.heroFrameSize;
        const g = c.getContext('2d')!;
        g.drawImage(img, sx, sy, this.heroFrameSize, this.heroFrameSize, 0,0,this.heroFrameSize,this.heroFrameSize);
        const data = g.getImageData(0,0,this.heroFrameSize,this.heroFrameSize);
        const mask = new Uint8Array(this.heroFrameSize * this.heroFrameSize);
        const edgeList: {x:number;y:number}[] = [];
        for (let y=0;y<this.heroFrameSize;y++) {
          for (let x=0;x<this.heroFrameSize;x++) {
            const idx = (y*this.heroFrameSize + x)*4;
            const alpha = data.data[idx+3]!;
            if (alpha > 20) mask[y*this.heroFrameSize + x] = 1;
          }
        }
        for (let y=0;y<this.heroFrameSize;y++) {
          for (let x=0;x<this.heroFrameSize;x++) {
            if (!mask[y*this.heroFrameSize + x]) continue;
            let edge=false;
            const dirs = [[1,0],[-1,0],[0,1],[0,-1]] as const;
            for (const [dx,dy] of dirs) {
              const nx = x+dx; const ny = y+dy;
              if (nx<0 || nx>=this.heroFrameSize || ny<0 || ny>=this.heroFrameSize || !mask[ny*this.heroFrameSize + nx]) { edge=true; break; }
            }
            if (edge) edgeList.push({x,y});
          }
        }
        masks.push(mask); edges.push(edgeList);
      }
      this._heroMasksByRow[avatar][row] = masks;
      this._heroEdgePixelsByRow[avatar][row] = edges;
    }
  }

  private async ensureHeroAssets() {
    const unique = Array.from(new Set(heroes.map(h => h.avatar)));
    const promises = unique.map(src => new Promise<void>(resolve => {
      if (this._heroImages[src]) { this.buildHeroMasks(this._heroImages[src], src); resolve(); return; }
      const img = new Image(); img.onload = () => { this._heroImages[src] = img; this.buildHeroMasks(img, src); resolve(); }; img.src = src;
    }));
    await Promise.all(promises);
    this._heroImagesLoaded = true;
  }

  private adaptiveCameraRadius() {
    if (!this._container) return;
    const w = this._container.clientWidth;
    const h = this._container.clientHeight;
    const diag = Math.min(w,h);
    const tilePixelSpan = HEX_SIZE * 2;
    const targetRadius = Math.max(8, Math.min(64, Math.round(diag / tilePixelSpan * 1.25)));
    const inner = Math.max(3, Math.round(targetRadius * 0.33));
    updateCameraRadius(targetRadius, inner);
  }

  private axialDistance(aQ:number,aR:number,bQ:number,bR:number) {
    const dq = Math.abs(aQ - bQ);
    const dr = Math.abs(aR - bR);
    const ds = Math.abs((-aQ - aR) - (-bQ - bR));
    return Math.max(dq, dr, ds);
  }
  private isWalkable(q:number,r:number) {
    const t = tileIndex[axialKey(q,r)];
    if (!t) return false;
    if (!t.terrain) return false;
    const def = (TERRAIN_DEFS as any)[t.terrain];
    return !!(def && def.walkable);
  }
}
