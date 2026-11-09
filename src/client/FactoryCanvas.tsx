'use client';

import { useEffect, useRef } from 'react';
import { connections, DX, DY, GRID_H, GRID_W, recipeOf, type Belt, type Dir, type Layout, type Sim } from '@/game/factory';
import { ITEM_INFO, MACHINES, type MachineKind } from '@/game/resources';
import { SPRITES } from './assets';

export type Tool = { kind: 'select' } | { kind: 'belt' } | { kind: 'remove' } | { kind: 'machine'; machine: MachineKind };

const T = 16; // map pixels per tile
const STATUS_COLOR = { working: 0x6fe08a, starved: 0xff7a2e, blocked: 0xff4a3a, idle: 0x6b5d4f };

interface Props {
  layout: Layout;
  sim: Sim;
  tool: Tool;
  beltDir: Dir;
  selected: string | null;
  /** Space the HUD takes on each side, in CSS pixels. */
  inset: { top: number; right: number; bottom: number; left: number };
  onTile: (x: number, y: number) => void;
  onBelts: (belts: Belt[]) => void;
}

/** The factory floor grid, drawn with PixiJS. Tap to build or select, drag to lay belts. */
export default function FactoryCanvas(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const redraw = useRef<(() => void) | null>(null);

  useEffect(() => {
    let destroyed = false;
    let cleanup = () => {};
    (async () => {
      const PIXI = await import('pixi.js');
      const { Application, Assets, Container, Graphics, Sprite, Text, TextureStyle, TilingSprite } = PIXI;
      TextureStyle.defaultOptions.scaleMode = 'nearest';
      const el = host.current!;
      const app = new Application();
      await app.init({ resizeTo: el, background: '#07060f', antialias: false, autoDensity: true, resolution: window.devicePixelRatio || 1 });
      if (destroyed) {
        app.destroy(true);
        return;
      }
      el.appendChild(app.canvas);
      app.canvas.style.touchAction = 'none';
      await Promise.all([Assets.load(Object.values(SPRITES)), document.fonts?.ready]);
      const tinyFont = getComputedStyle(document.documentElement).getPropertyValue('--font-tiny').trim() || 'monospace';

      const world = new Container();
      const labels = new Container();
      app.stage.addChild(Sprite.from(SPRITES.spaceBg), world, labels);
      const bg = app.stage.children[0] as InstanceType<typeof Sprite>;

      const floor = new TilingSprite({ texture: Assets.get(SPRITES.floor), width: GRID_W * T, height: GRID_H * T });
      const frame = new Graphics();
      frame.rect(-3, -3, GRID_W * T + 6, GRID_H * T + 6).fill(0x120d0a).rect(-2, -2, GRID_W * T + 4, GRID_H * T + 4).fill(0x5a4632).rect(-1, -1, GRID_W * T + 2, GRID_H * T + 2).fill(0x241b14);
      const beltLayer = new Container();
      const items = new Graphics();
      const machineLayer = new Container();
      const overlay = new Graphics();
      world.addChild(frame, floor, beltLayer, items, machineLayer, overlay);

      let scale = 3;
      const layoutView = () => {
        const { inset } = latest.current;
        const aw = app.screen.width - inset.left - inset.right, ah = app.screen.height - inset.top - inset.bottom;
        let s = Math.min(aw / (GRID_W * T + 8), ah / (GRID_H * T + 8));
        if (s >= 2) s = Math.floor(s);
        scale = Math.max(1, s);
        world.scale.set(scale);
        world.position.set(Math.round(inset.left + (aw - GRID_W * T * scale) / 2), Math.round(inset.top + (ah - GRID_H * T * scale) / 2));
        bg.width = Math.max(app.screen.width, (app.screen.height * 480) / 300);
        bg.height = (bg.width * 300) / 480;
      };

      let carried = new Map<string, string>();
      let machineLabels: { t: InstanceType<typeof Text>; x: number; y: number }[] = [];
      const draw = () => {
        const { layout, sim, selected } = latest.current;
        beltLayer.removeChildren().forEach((c) => c.destroy());
        machineLayer.removeChildren().forEach((c) => c.destroy());
        labels.removeChildren().forEach((c) => c.destroy());
        machineLabels = [];
        carried = connections(layout).carried;
        for (const b of layout.belts) {
          const s = Sprite.from(SPRITES.belt);
          s.anchor.set(0.5);
          s.position.set(b.x * T + T / 2, b.y * T + T / 2);
          s.rotation = ((b.dir - 1) * Math.PI) / 2; // the sprite points south
          beltLayer.addChild(s);
        }
        for (const m of layout.machines) {
          const spec = MACHINES[m.kind];
          const s = Sprite.from(SPRITES[m.kind]);
          s.position.set(m.x * T, m.y * T);
          machineLayer.addChild(s);
          const st = sim.machines[m.id];
          const light = new Graphics();
          light.rect(m.x * T + spec.w * T - 5, m.y * T + 2, 3, 3).fill(STATUS_COLOR[st?.status ?? 'idle']);
          machineLayer.addChild(light);
          const r = recipeOf(m);
          if (r || m.kind === 'crate') {
            const t = new Text({
              text: r ? ITEM_INFO[r.output].short : 'STORE',
              style: { fontFamily: tinyFont, fontSize: 10, fill: r ? ITEM_INFO[r.output].color : '#f3eadf', stroke: { color: 0x07050d, width: 3 } },
            });
            t.anchor.set(0.5, 1);
            labels.addChild(t);
            machineLabels.push({ t, x: m.x * T + (spec.w * T) / 2, y: m.y * T + spec.h * T - 1 });
          }
          if (m.id === selected) {
            const sel = new Graphics();
            sel.rect(m.x * T - 1, m.y * T - 1, spec.w * T + 2, 1).fill(0xffffff).rect(m.x * T - 1, m.y * T + spec.h * T, spec.w * T + 2, 1).fill(0xffffff);
            sel.rect(m.x * T - 1, m.y * T - 1, 1, spec.h * T + 2).fill(0xffffff).rect(m.x * T + spec.w * T, m.y * T - 1, 1, spec.h * T + 2).fill(0xffffff);
            machineLayer.addChild(sel);
          }
        }
      };
      redraw.current = draw;
      layoutView();
      draw();

      // Input: taps build or select; with the belt tool, a drag lays a line of belts.
      const tileAt = (e: PointerEvent) => {
        const r = app.canvas.getBoundingClientRect();
        const x = Math.floor((e.clientX - r.left - world.x) / scale / T), y = Math.floor((e.clientY - r.top - world.y) / scale / T);
        return x >= 0 && y >= 0 && x < GRID_W && y < GRID_H ? { x, y } : null;
      };
      let stroke: Belt[] | null = null;
      let hover: { x: number; y: number } | null = null;
      const dirTo = (a: { x: number; y: number }, b: { x: number; y: number }): Dir => (b.x > a.x ? 0 : b.y > a.y ? 1 : b.x < a.x ? 2 : 3);
      const onDown = (e: PointerEvent) => {
        const p = tileAt(e);
        if (!p) return;
        app.canvas.setPointerCapture(e.pointerId);
        if (latest.current.tool.kind === 'belt') stroke = [{ ...p, dir: latest.current.beltDir }];
        else latest.current.onTile(p.x, p.y);
      };
      const onMove = (e: PointerEvent) => {
        hover = tileAt(e);
        if (!stroke || !hover) return;
        const last = stroke[stroke.length - 1];
        if (hover.x === last.x && hover.y === last.y) return;
        // Walk tile by tile toward the pointer so a fast drag leaves no gaps.
        let cur = { x: last.x, y: last.y };
        while (cur.x !== hover.x || cur.y !== hover.y) {
          const step = Math.abs(hover.x - cur.x) >= Math.abs(hover.y - cur.y) ? { x: cur.x + Math.sign(hover.x - cur.x), y: cur.y } : { x: cur.x, y: cur.y + Math.sign(hover.y - cur.y) };
          const d = dirTo(cur, step);
          stroke[stroke.length - 1].dir = d;
          stroke.push({ ...step, dir: d });
          cur = step;
          if (stroke.length >= 64) break;
        }
      };
      const onUp = () => {
        if (!stroke) return;
        const s = stroke;
        stroke = null;
        if (s.length === 1) {
          const existing = latest.current.layout.belts.find((b) => b.x === s[0].x && b.y === s[0].y);
          if (existing) s[0].dir = ((existing.dir + 1) % 4) as Dir; // tapping a belt turns it
        }
        latest.current.onBelts(s);
      };
      const onLeave = () => (hover = null);
      app.canvas.addEventListener('pointerdown', onDown);
      app.canvas.addEventListener('pointermove', onMove);
      app.canvas.addEventListener('pointerup', onUp);
      app.canvas.addEventListener('pointercancel', onUp);
      app.canvas.addEventListener('pointerleave', onLeave);

      let t = 0;
      app.ticker.add((tick) => {
        t += tick.deltaMS / 1000;
        layoutView();
        for (const l of machineLabels) l.t.position.set(Math.round(world.x + l.x * scale), Math.round(world.y + l.y * scale));

        // Goods moving along belts that carry a working machine's output.
        const { layout, sim, tool, beltDir } = latest.current;
        items.clear();
        for (const b of layout.belts) {
          const src = carried.get(`${b.x},${b.y}`);
          const m = src ? layout.machines.find((x) => x.id === src) : undefined;
          const st = m ? sim.machines[m.id] : undefined;
          if (!m || !st || st.rate <= 0) continue;
          const r = recipeOf(m);
          const color = parseInt((r ? ITEM_INFO[r.output].color : '#ffffff').slice(1), 16);
          for (const k of [0, 0.5]) {
            const f = (t * 0.9 + k + (b.x + b.y) * 0.25) % 1;
            items.rect(Math.round(b.x * T + T / 2 - 1 + DX[b.dir] * (f - 0.5) * T), Math.round(b.y * T + T / 2 - 1 + DY[b.dir] * (f - 0.5) * T), 3, 3).fill(color);
          }
        }

        // Where the next thing will go.
        overlay.clear();
        if (hover && !stroke) {
          if (tool.kind === 'machine') {
            const spec = MACHINES[tool.machine];
            const fits = hover.x + spec.w <= GRID_W && hover.y + spec.h <= GRID_H;
            overlay.rect(hover.x * T, hover.y * T, spec.w * T, spec.h * T).fill({ color: fits ? 0xffcc33 : 0xff4a3a, alpha: 0.35 });
          } else if (tool.kind === 'belt') {
            overlay.rect(hover.x * T, hover.y * T, T, T).fill({ color: 0xffcc33, alpha: 0.35 });
            overlay.rect(hover.x * T + T / 2 - 1 + DX[beltDir] * 5, hover.y * T + T / 2 - 1 + DY[beltDir] * 5, 3, 3).fill(0xffcc33);
          } else if (tool.kind === 'remove') overlay.rect(hover.x * T, hover.y * T, T, T).fill({ color: 0xff4a3a, alpha: 0.4 });
        }
        if (stroke) for (const b of stroke) overlay.rect(b.x * T + 2, b.y * T + 2, T - 4, T - 4).fill({ color: 0xffcc33, alpha: 0.5 });
      });

      cleanup = () => {
        redraw.current = null;
        app.destroy(true, { children: true });
      };
    })();
    return () => {
      destroyed = true;
      cleanup();
    };
  }, []);

  useEffect(() => {
    redraw.current?.();
  }, [props.layout, props.sim, props.selected]);

  return <div ref={host} style={{ position: 'absolute', inset: 0 }} role="img" aria-label="Factory floor. Tap to build or select, drag with the belt tool to lay conveyors." />;
}
