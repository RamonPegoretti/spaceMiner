'use client';

import { useEffect, useRef } from 'react';
import type { Field, StarSystem } from '@/game/starterSystem';
import { PIXEL_SCALE, SPRITES } from './assets';

const ORE_SPRITE: Record<Field['ore'], string> = { iron: 'iron', nickel: 'nickel', ice: 'ice', silicate: 'sil' };
const MAP_W = 480;
const MAP_H = 300;

/** Seeded random so a field always looks the same. */
function rng(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296;
}

/**
 * Draws a star system with PixiJS: pixel-art background, stations, asteroid fields,
 * lanes and haulers flying them. Drag to pan, wheel or pinch to zoom.
 */
export default function GalaxyCanvas({ system }: { system: StarSystem }) {
  const host = useRef<HTMLDivElement>(null);

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

      const world = new Container();
      const labels = new Container();
      app.stage.addChild(world, labels);

      const sprite = (slot: string, x: number, y: number) => {
        const s = Sprite.from(SPRITES[slot]);
        s.anchor.set(0.5);
        s.position.set(Math.round(x), Math.round(y));
        return s;
      };

      world.addChild(Sprite.from(SPRITES.spaceBg));

      // Orbit rings and lanes, drawn as pixel dots.
      const dots = new Graphics();
      const dot = (x: number, y: number, color: number) => dots.rect(Math.round(x), Math.round(y), 1, 1).fill(color);
      for (const r of [50, 92, 134, 176]) {
        const n = Math.floor((2 * Math.PI * r) / 7);
        for (let i = 0; i < n; i++) dot(system.sun.x + r * Math.cos((i / n) * 2 * Math.PI), system.sun.y + r * Math.sin((i / n) * 2 * Math.PI), 0x3a3058);
      }
      const place = new Map<string, { x: number; y: number }>();
      for (const s of system.stations) place.set(s.id, s);
      for (const f of system.fields) place.set(f.id, f);
      for (const [a, b] of system.lanes) {
        const p = place.get(a)!, q = place.get(b)!;
        const n = Math.max(Math.abs(q.x - p.x), Math.abs(q.y - p.y));
        for (let i = 0; i <= n; i++) if (i % 4 < 2) dot(p.x + ((q.x - p.x) * i) / n, p.y + ((q.y - p.y) * i) / n, 0xffcc33);
      }
      world.addChild(dots);

      const sun = sprite('sun', system.sun.x, system.sun.y);
      world.addChild(sun);

      // Asteroid fields: more rocks while the field is fuller.
      for (const f of system.fields) {
        const r = rng(f.id);
        const count = Math.max(3, Math.round(10 * f.remaining));
        for (let i = 0; i < count; i++) {
          const size = i === 0 ? 0 : Math.min(4, 1 + Math.floor(r() * 4));
          const ang = r() * Math.PI * 2;
          const dist = i === 0 ? 0 : 8 + r() * 22;
          world.addChild(sprite(`asteroid_${ORE_SPRITE[f.ore]}_${size}`, f.x + Math.cos(ang) * dist * 1.3, f.y + Math.sin(ang) * dist * 0.9));
        }
      }

      for (const s of system.stations) world.addChild(sprite(s.kind, s.x, s.y));

      // Haulers loop along their lanes, with a little engine trail.
      const routes: { path: string[]; speed: number; offset: number }[] = [
        { path: ['halden', 'tessel', 'foundry', 'tessel'], speed: 14, offset: 0 },
        { path: ['corva', 'foundry'], speed: 10, offset: 40 },
        { path: ['osk', 'tessel', 'foundry', 'tessel'], speed: 12, offset: 90 },
      ];
      const haulers = routes.map((route) => {
        const pts = route.path.map((id) => place.get(id)!);
        const legs = pts.map((p, i) => [p, pts[(i + 1) % pts.length]] as const);
        const lengths = legs.map(([p, q]) => Math.hypot(q.x - p.x, q.y - p.y));
        const total = lengths.reduce((a, b) => a + b, 0);
        const ship = sprite('hauler', 0, 0);
        const trail = new Graphics();
        world.addChild(trail, ship);
        return { ship, trail, legs, lengths, total, ...route };
      });

      const fieldLabels = [
        ...system.stations.map((s) => ({ text: s.name.toUpperCase(), x: s.x, y: s.y + 16, color: s.kind === 'gate' ? 0xb9a8e0 : 0xf3eadf })),
        ...system.fields.map((f) => ({ text: `${f.name.toUpperCase()} ${Math.round(f.remaining * 100)}%`, x: f.x, y: f.y + 30, color: f.remaining < 0.3 ? 0xff7a2e : 0xffcc33 })),
      ].map((l) => {
        const t = new Text({
          text: l.text,
          style: { fontFamily: 'Silkscreen, monospace', fontSize: 13, fill: l.color, stroke: { color: 0x07050d, width: 4 } },
        });
        t.anchor.set(0.5, 0);
        labels.addChild(t);
        return { t, ...l };
      });

      // Camera: pan and zoom, kept inside the map.
      let zoom = 1;
      const home = system.stations[0];
      const cam = { x: home.x + 40, y: home.y + 40 };
      const scale = () => PIXEL_SCALE * zoom;
      const clampCam = () => {
        const halfW = app.screen.width / scale() / 2, halfH = app.screen.height / scale() / 2;
        cam.x = halfW * 2 >= MAP_W ? MAP_W / 2 : Math.min(MAP_W - halfW, Math.max(halfW, cam.x));
        cam.y = halfH * 2 >= MAP_H ? MAP_H / 2 : Math.min(MAP_H - halfH, Math.max(halfH, cam.y));
      };
      const fitZoom = () => Math.max(app.screen.width / (MAP_W * PIXEL_SCALE), app.screen.height / (MAP_H * PIXEL_SCALE));
      zoom = Math.max(1, fitZoom());

      const pointers = new Map<number, { x: number; y: number }>();
      let pinch = 0;
      const canvas = app.canvas;
      const onDown = (e: PointerEvent) => {
        canvas.setPointerCapture(e.pointerId);
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.size === 2) {
          const [a, b] = [...pointers.values()];
          pinch = Math.hypot(a.x - b.x, a.y - b.y);
        }
      };
      const onMove = (e: PointerEvent) => {
        const prev = pointers.get(e.pointerId);
        if (!prev) return;
        const now = { x: e.clientX, y: e.clientY };
        pointers.set(e.pointerId, now);
        if (pointers.size === 1) {
          cam.x -= (now.x - prev.x) / scale();
          cam.y -= (now.y - prev.y) / scale();
        } else if (pointers.size === 2) {
          const [a, b] = [...pointers.values()];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (pinch) zoom = Math.min(4, Math.max(fitZoom(), zoom * (d / pinch)));
          pinch = d;
        }
      };
      const onUp = (e: PointerEvent) => {
        pointers.delete(e.pointerId);
        pinch = 0;
      };
      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        zoom = Math.min(4, Math.max(fitZoom(), zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
      };
      canvas.addEventListener('pointerdown', onDown);
      canvas.addEventListener('pointermove', onMove);
      canvas.addEventListener('pointerup', onUp);
      canvas.addEventListener('pointercancel', onUp);
      canvas.addEventListener('wheel', onWheel, { passive: false });

      let t = 0;
      app.ticker.add((tick) => {
        t += tick.deltaMS / 1000;
        clampCam();
        const s = scale();
        world.scale.set(s);
        world.position.set(Math.round(app.screen.width / 2 - cam.x * s), Math.round(app.screen.height / 2 - cam.y * s));

        sun.alpha = 0.92 + Math.sin(t * 2) * 0.08;

        for (const h of haulers) {
          let d = (t * h.speed + h.offset) % h.total;
          let i = 0;
          while (d > h.lengths[i]) d -= h.lengths[i++];
          const [p, q] = h.legs[i];
          const k = d / h.lengths[i];
          const x = p.x + (q.x - p.x) * k, y = p.y + (q.y - p.y) * k;
          const ang = Math.atan2(q.y - p.y, q.x - p.x);
          h.ship.position.set(Math.round(x), Math.round(y));
          h.ship.rotation = Math.round((ang + Math.PI / 2) / (Math.PI / 4)) * (Math.PI / 4);
          h.trail.clear();
          const colors = [0xfff2c0, 0xffcc33, 0xff7a2e, 0xff7a2e, 0x8f2a10, 0x5a1a08];
          colors.forEach((c, j) => {
            if (j > 2 && (j + Math.floor(t * 8)) % 2) return;
            h.trail.rect(Math.round(x - Math.cos(ang) * (8 + j * 2)), Math.round(y - Math.sin(ang) * (8 + j * 2)), 1, 1).fill(c);
          });
        }

        for (const l of fieldLabels) l.t.position.set(Math.round(world.x + l.x * s), Math.round(world.y + l.y * s));
      });

      cleanup = () => {
        canvas.removeEventListener('wheel', onWheel);
        app.destroy(true, { children: true });
      };
    })();

    return () => {
      destroyed = true;
      cleanup();
    };
  }, [system]);

  return <div ref={host} style={{ position: 'absolute', inset: 0 }} aria-label={`Map of ${system.name}. Drag to move, scroll or pinch to zoom.`} role="img" />;
}
