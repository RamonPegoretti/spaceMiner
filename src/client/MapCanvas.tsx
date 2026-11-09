'use client';

import { useEffect, useRef } from 'react';
import { fieldPosition, fieldSpawn, galaxy, MAP_H, MAP_W, ORBIT_TILT, rng, type GalaxySystem } from '@/game/galaxy';
import type { Ore } from '@/game/resources';
import { PIXEL_SCALE, SPRITES } from './assets';
import { remainingNow, serverNow, type ClientWorld } from './world';

export type MapView = { mode: 'galaxy' } | { mode: 'system'; id: string };

const ORE_SPRITE: Record<Ore, string> = { iron: 'iron', nickel: 'nickel', ice: 'ice', silicate: 'sil' };
const YELLOW = 0xffcc33;
const RED = 0xff4a3a;
const DIM = 0x3a3058;

interface Props {
  view: MapView;
  world: React.RefObject<ClientWorld | null>;
  selected: string | null;
  onPickSystem: (id: string) => void;
  onPickField: (slot: string | null) => void;
}

/**
 * The game map, drawn with PixiJS. Shows either the whole galaxy or one star system.
 * Drag to pan, wheel or pinch to zoom, tap to pick a system, gate or field.
 */
export default function MapCanvas(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const setView = useRef<((v: MapView) => void) | null>(null);

  useEffect(() => {
    let destroyed = false;
    let cleanup = () => {};

    (async () => {
      const PIXI = await import('pixi.js');
      const { Application, Assets, Container, Graphics, Sprite, Text, TextureStyle } = PIXI;
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
      app.stage.addChild(world, labels);

      const sprite = (slot: string, x: number, y: number) => {
        const s = Sprite.from(SPRITES[slot]);
        s.anchor.set(0.5);
        s.position.set(Math.round(x), Math.round(y));
        return s;
      };
      const label = (text: string, color: number, size = 13) => {
        const t = new Text({ text, style: { fontFamily: tinyFont, fontSize: size, fill: color, stroke: { color: 0x07050d, width: 4 }, align: 'center' } });
        t.anchor.set(0.5, 0);
        labels.addChild(t);
        return t;
      };
      /** Pixel-dot line, for lanes and orbits. */
      const dotLine = (g: InstanceType<typeof Graphics>, x1: number, y1: number, x2: number, y2: number, color: number, on = 2, period = 4) => {
        const n = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
        for (let i = 0; i <= n; i++) if (i % period < on) g.rect(Math.round(x1 + ((x2 - x1) * i) / n), Math.round(y1 + ((y2 - y1) * i) / n), 1, 1).fill(color);
      };
      /** Corner brackets around a point, in map pixels. */
      const brackets = (g: InstanceType<typeof Graphics>, x: number, y: number, r: number, color: number) => {
        const L = 4;
        for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          const cx = Math.round(x + sx * r), cy = Math.round(y + sy * r);
          g.rect(sx < 0 ? cx : cx - L + 1, cy, L, 1).fill(color);
          g.rect(cx, sy < 0 ? cy : cy - L + 1, 1, L).fill(color);
        }
      };

      /** Ships flying a loop of points forever, for some life on the map. */
      type Flyer = { ship: InstanceType<typeof Sprite>; trail: InstanceType<typeof Graphics>; legs: (readonly [{ x: number; y: number }, { x: number; y: number }])[]; lengths: number[]; total: number; speed: number; offset: number };
      const flyer = (pts: { x: number; y: number }[], speed: number, offset: number): Flyer => {
        const legs = pts.map((p, i) => [p, pts[(i + 1) % pts.length]] as const);
        const lengths = legs.map(([p, q]) => Math.max(1, Math.hypot(q.x - p.x, q.y - p.y)));
        const ship = sprite('hauler', 0, 0);
        const trail = new Graphics();
        world.addChild(trail, ship);
        return { ship, trail, legs, lengths, total: lengths.reduce((a, b) => a + b, 0), speed, offset };
      };
      const moveFlyer = (h: Flyer, t: number, scale = 1) => {
        let d = (t * h.speed + h.offset) % h.total;
        let i = 0;
        while (d > h.lengths[i]) d -= h.lengths[i++];
        const [p, q] = h.legs[i];
        const k = d / h.lengths[i];
        const x = p.x + (q.x - p.x) * k, y = p.y + (q.y - p.y) * k;
        const ang = Math.atan2(q.y - p.y, q.x - p.x);
        h.ship.scale.set(scale);
        h.ship.position.set(Math.round(x), Math.round(y));
        h.ship.rotation = Math.round((ang + Math.PI / 2) / (Math.PI / 4)) * (Math.PI / 4);
        h.trail.clear();
        [0xfff2c0, 0xffcc33, 0xff7a2e, 0xff7a2e, 0x8f2a10, 0x5a1a08].forEach((c, j) => {
          if (j > 2 && (j + Math.floor(t * 8)) % 2) return;
          h.trail.rect(Math.round(x - Math.cos(ang) * (8 * scale + j * 2)), Math.round(y - Math.sin(ang) * (8 * scale + j * 2)), 1, 1).fill(c);
        });
      };

      // Each view builds its scene and returns how to animate it and what a tap at a map point picks.
      type Scene = { tick: (t: number) => void; tap: (x: number, y: number) => void; focus: { x: number; y: number } };
      const G = galaxy();

      const galaxyScene = (): Scene => {
        world.addChild(Sprite.from(SPRITES.spaceBg));
        const g = new Graphics();
        for (const [a, b] of G.lanes) {
          const p = G.byId.get(a)!, q = G.byId.get(b)!;
          dotLine(g, p.x, p.y, q.x, q.y, 0x6a5a9a);
        }
        world.addChild(g);
        const flyers = G.lanes.filter((_, i) => i % 2 === 0).map(([a, b], i) => flyer([G.byId.get(a)!, G.byId.get(b)!], 6 + (i % 3) * 2, i * 37));

        const stars = new Graphics();
        const marks = new Graphics();
        world.addChild(stars, marks);
        for (const s of G.systems) {
          const x = Math.round(s.x), y = Math.round(s.y);
          stars.circle(x + 0.5, y + 0.5, 6).fill({ color: s.star, alpha: 0.12 });
          stars.circle(x + 0.5, y + 0.5, 3.5).fill({ color: s.star, alpha: 0.3 });
          stars.rect(x - 1, y - 1, 3, 3).fill(s.star);
          stars.rect(x, y - 3, 1, 7).fill(s.star);
          stars.rect(x - 3, y, 7, 1).fill(s.star);
          stars.rect(x, y, 1, 1).fill(0xffffff);
        }
        const sysLabels = G.systems.map((s) => ({ s, name: label(s.name.toUpperCase(), s.id === 's0' ? YELLOW : 0xf3eadf), info: label('', 0xb9a8e0, 10) }));

        return {
          focus: G.byId.get('s0')!,
          tick: (t) => {
            const w = latest.current.world.current;
            marks.clear();
            for (const f of flyers) moveFlyer(f, t, 0.6);
            for (const { s, name, info } of sysLabels) {
              let free = 0, mine = 0, taken = 0;
              for (const slot of s.slots) {
                const f = w?.fields.get(slot.id);
                if (!f) continue;
                if (f.claim?.mine) mine++;
                else if (f.claim) taken++;
                else if (f.remaining > 0) free++;
              }
              if (mine) brackets(marks, s.x, s.y, 9, YELLOW);
              else if (taken && !free) brackets(marks, s.x, s.y, 9, RED);
              info.text = w ? (mine ? `${mine} YOURS · ${free} FREE` : `${free} FREE`) : '';
              info.style.fill = mine ? YELLOW : free ? 0xb9a8e0 : 0xff7a2e;
              name.position.set(Math.round(world.x + s.x * scale()), Math.round(world.y + (s.y + 9) * scale()));
              info.position.set(name.x, name.y + 15);
            }
          },
          tap: (x, y) => {
            const near = G.systems.map((s) => ({ s, d: Math.hypot(s.x - x, s.y - y) })).sort((a, b) => a.d - b.d)[0];
            if (near && near.d < 20) latest.current.onPickSystem(near.s.id);
          },
        };
      };

      const systemScene = (sys: GalaxySystem): Scene => {
        world.addChild(Sprite.from(SPRITES.spaceBg));
        const g = new Graphics();
        for (const slot of sys.slots) {
          const n = Math.floor((2 * Math.PI * slot.orbit) / 6);
          for (let i = 0; i < n; i++) {
            const a = (i / n) * 2 * Math.PI;
            g.rect(Math.round(sys.sun.x + slot.orbit * Math.cos(a)), Math.round(sys.sun.y + slot.orbit * ORBIT_TILT * Math.sin(a)), 1, 1).fill(DIM);
          }
        }
        const station = sys.stations.find((s) => s.kind !== 'gate')!;
        const gates = sys.stations.filter((s) => s.kind === 'gate');
        for (const gt of gates) dotLine(g, station.x, station.y, gt.x, gt.y, YELLOW);
        world.addChild(g);

        const sun = sprite('sun', sys.sun.x, sys.sun.y);
        world.addChild(sun);
        for (const st of sys.stations) world.addChild(sprite(st.kind, st.x, st.y));
        const stLabels = sys.stations.map((st) => ({ st, t: label(st.name.toUpperCase(), st.kind === 'gate' ? 0xb9a8e0 : 0xf3eadf, st.kind === 'gate' ? 11 : 13) }));
        const flyers = gates.map((gt, i) => flyer([station, gt], 10 + (i % 3) * 3, i * 53));

        const marks = new Graphics();
        const fields = sys.slots.map((slot) => {
          const box = new Container();
          world.addChild(box);
          return { slot, box, key: '', name: label('', YELLOW), owner: label('', YELLOW, 10), x: 0, y: 0 };
        });
        world.addChild(marks);

        return {
          focus: sys.sun,
          tick: (t) => {
            const w = latest.current.world.current;
            const now = serverNow(w);
            const sel = latest.current.selected;
            sun.alpha = 0.92 + Math.sin(t * 2) * 0.08;
            for (const f of flyers) moveFlyer(f, t);
            marks.clear();
            for (const f of fields) {
              const view = w?.fields.get(f.slot.id);
              const gen = view?.generation ?? 0;
              const spawn = fieldSpawn(f.slot, gen);
              const p = fieldPosition(sys, f.slot, spawn, now);
              f.x = p.x;
              f.y = p.y;
              f.box.position.set(Math.round(p.x), Math.round(p.y));
              const left = view && w ? remainingNow(w, view) : spawn.initial;
              const share = left / spawn.initial;
              // Fewer rocks as the field empties.
              const count = left <= 0 ? 0 : Math.max(2, Math.round(11 * share));
              const key = `${gen}:${count}`;
              if (key !== f.key) {
                f.key = key;
                f.box.removeChildren().forEach((c) => c.destroy());
                const r = rng(`${f.slot.id}#${gen}`);
                for (let i = 0; i < count; i++) {
                  const size = i === 0 ? (share > 0.5 ? 0 : 1) : Math.min(4, 1 + Math.floor(r() * 4));
                  const ang = r() * Math.PI * 2;
                  const dist = i === 0 ? 0 : 7 + r() * 16;
                  f.box.addChild(sprite(`asteroid_${ORE_SPRITE[spawn.ore]}_${size}`, Math.cos(ang) * dist * 1.3, Math.sin(ang) * dist * 0.9));
                }
                if (count === 0) {
                  const dust = new Graphics();
                  for (let i = 0; i < 9; i++) dust.rect(Math.round((r() - 0.5) * 30), Math.round((r() - 0.5) * 18), 1, 1).fill(0x6b5d4f);
                  f.box.addChild(dust);
                }
              }
              const pct = Math.round(share * 100);
              f.name.text = left <= 0 ? `${spawn.name.toUpperCase()} · DRY` : `${spawn.name.toUpperCase()} ${pct}%`;
              f.name.style.fill = left <= 0 ? 0x8a7a6a : share < 0.3 ? 0xff7a2e : YELLOW;
              const c = view?.claim;
              f.owner.text = c ? (c.mine ? 'YOUR CLAIM' : c.pilotName.toUpperCase()) : left > 0 && w ? 'FREE' : '';
              f.owner.style.fill = c ? (c.mine ? YELLOW : RED) : 0x6fe08a;
              if (c) brackets(marks, p.x, p.y, 22, c.mine ? YELLOW : RED);
              if (sel === f.slot.id && Math.floor(t * 3) % 2 === 0) brackets(marks, p.x, p.y, 26, 0xffffff);
              f.name.position.set(Math.round(world.x + p.x * scale()), Math.round(world.y + (p.y + 24) * scale()));
              f.owner.position.set(f.name.x, f.name.y + 15);
            }
            for (const { st, t: lt } of stLabels) lt.position.set(Math.round(world.x + st.x * scale()), Math.round(world.y + (st.y + 16) * scale()));
          },
          tap: (x, y) => {
            const hit = fields.map((f) => ({ id: f.slot.id, d: Math.hypot(f.x - x, (f.y - y) * 1.2) })).sort((a, b) => a.d - b.d)[0];
            if (hit && hit.d < 30) return latest.current.onPickField(hit.id);
            const gate = gates.find((gt) => Math.hypot(gt.x - x, gt.y - y) < 18);
            if (gate?.to) return latest.current.onPickSystem(gate.to);
            latest.current.onPickField(null);
          },
        };
      };

      // Camera: pan and zoom, kept inside the map.
      let zoom = 1;
      const cam = { x: MAP_W / 2, y: MAP_H / 2 };
      const scale = () => PIXEL_SCALE * zoom;
      const cover = () => Math.max(app.screen.width / (MAP_W * PIXEL_SCALE), app.screen.height / (MAP_H * PIXEL_SCALE));
      const contain = () => Math.min(app.screen.width / (MAP_W * PIXEL_SCALE), app.screen.height / (MAP_H * PIXEL_SCALE));
      const minZoom = () => Math.min(cover(), Math.max(contain(), 0.55));
      const clampCam = () => {
        const halfW = app.screen.width / scale() / 2, halfH = app.screen.height / scale() / 2;
        cam.x = halfW * 2 >= MAP_W ? MAP_W / 2 : Math.min(MAP_W - halfW, Math.max(halfW, cam.x));
        cam.y = halfH * 2 >= MAP_H ? MAP_H / 2 : Math.min(MAP_H - halfH, Math.max(halfH, cam.y));
      };
      const setZoom = (z: number) => (zoom = Math.min(4, Math.max(minZoom(), z)));

      let scene: Scene | null = null;
      const show = (v: MapView) => {
        world.removeChildren().forEach((c) => c.destroy({ children: true }));
        labels.removeChildren().forEach((c) => c.destroy());
        const sys = v.mode === 'system' ? G.byId.get(v.id) : undefined;
        scene = sys ? systemScene(sys) : galaxyScene();
        // Phones start zoomed out to see more of the map.
        setZoom(app.screen.width < 700 ? minZoom() : cover());
        cam.x = scene.focus.x;
        cam.y = scene.focus.y;
      };
      setView.current = show;
      show(latest.current.view);

      const pointers = new Map<number, { x: number; y: number }>();
      let pinch = 0;
      let travel = 0;
      const canvas = app.canvas;
      const onDown = (e: PointerEvent) => {
        canvas.setPointerCapture(e.pointerId);
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.size === 1) travel = 0;
        if (pointers.size === 2) {
          const [a, b] = [...pointers.values()];
          pinch = Math.hypot(a.x - b.x, a.y - b.y);
          travel = Infinity; // a pinch is never a tap
        }
      };
      const onMove = (e: PointerEvent) => {
        const prev = pointers.get(e.pointerId);
        if (!prev) return;
        const now = { x: e.clientX, y: e.clientY };
        pointers.set(e.pointerId, now);
        if (pointers.size === 1) {
          travel += Math.hypot(now.x - prev.x, now.y - prev.y);
          cam.x -= (now.x - prev.x) / scale();
          cam.y -= (now.y - prev.y) / scale();
        } else if (pointers.size === 2) {
          const [a, b] = [...pointers.values()];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (pinch) setZoom(zoom * (d / pinch));
          pinch = d;
        }
      };
      const onUp = (e: PointerEvent) => {
        const wasTap = pointers.size === 1 && pointers.has(e.pointerId) && travel < 8 && e.type === 'pointerup';
        pointers.delete(e.pointerId);
        pinch = 0;
        if (wasTap && scene) {
          const r = canvas.getBoundingClientRect();
          scene.tap((e.clientX - r.left - world.x) / scale(), (e.clientY - r.top - world.y) / scale());
        }
      };
      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        setZoom(zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
      };
      canvas.addEventListener('pointerdown', onDown);
      canvas.addEventListener('pointermove', onMove);
      canvas.addEventListener('pointerup', onUp);
      canvas.addEventListener('pointercancel', onUp);
      canvas.addEventListener('wheel', onWheel, { passive: false });

      let t = 0;
      app.ticker.add((tick) => {
        t += tick.deltaMS / 1000;
        setZoom(zoom);
        clampCam();
        const s = scale();
        world.scale.set(s);
        world.position.set(Math.round(app.screen.width / 2 - cam.x * s), Math.round(app.screen.height / 2 - cam.y * s));
        scene?.tick(t);
      });

      cleanup = () => {
        setView.current = null;
        canvas.removeEventListener('wheel', onWheel);
        app.destroy(true, { children: true });
      };
    })();

    return () => {
      destroyed = true;
      cleanup();
    };
  }, []);

  const key = props.view.mode === 'system' ? props.view.id : 'galaxy';
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setView.current?.(latest.current.view);
  }, [key]);

  const where = props.view.mode === 'system' ? galaxy().byId.get(props.view.id)?.name : 'the galaxy';
  return <div ref={host} style={{ position: 'absolute', inset: 0 }} aria-label={`Map of ${where}. Drag to move, scroll or pinch to zoom, tap to select.`} role="img" />;
}
