'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState } from 'react';
import { applyOp, FloorError, recipesFor, tileMap, warehouseUsed, type Belt, type Dir, type FactoryOp, type Layout, type Sim } from '@/game/factory';
import { BELT_COST, ITEM_INFO, ITEMS, MACHINES, ORES, RECIPE_BY_ID, WAREHOUSE_CAPACITY, type Item, type MachineKind } from '@/game/resources';
import type { PublicPilot } from '@/server/http';
import type { Tool } from './FactoryCanvas';

const FactoryCanvas = dynamic(() => import('./FactoryCanvas'), { ssr: false });

interface FactoryData {
  layout: Layout;
  sim: Sim;
}

const TOOLS: { tool: Tool; label: string; cost?: number }[] = [
  { tool: { kind: 'select' }, label: 'SELECT' },
  { tool: { kind: 'belt' }, label: 'BELT', cost: BELT_COST },
  ...(['intake', 'smelter', 'assembler', 'crate'] as MachineKind[]).map((m) => ({ tool: { kind: 'machine', machine: m } as Tool, label: MACHINES[m].name.toUpperCase().replace('STORAGE ', ''), cost: MACHINES[m].cost })),
  { tool: { kind: 'remove' }, label: 'REMOVE' },
];
const same = (a: Tool, b: Tool) => a.kind === b.kind && (a.kind !== 'machine' || (b.kind === 'machine' && a.machine === b.machine));
const ARROWS = ['→', '↓', '←', '↑'];

export default function FactoryScreen({ onPilot, phone }: { onPilot: (p: PublicPilot) => void; phone: boolean }) {
  const [data, setData] = useState<FactoryData | null>(null);
  const [tool, setTool] = useState<Tool>({ kind: 'select' });
  const [beltDir, setBeltDir] = useState<Dir>(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(
    async (init?: RequestInit) => {
      const res = await fetch('/api/factory', { cache: 'no-store', ...init });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? 'Something went wrong. Try again.');
      setData(d.factory);
      if (d.pilot) onPilot(d.pilot);
    },
    [onPilot],
  );

  useEffect(() => {
    load().catch((e) => setError(e.message));
    const id = setInterval(() => document.visibilityState === 'visible' && load().catch(() => {}), 5_000);
    return () => clearInterval(id);
  }, [load]);

  const send = async (op: FactoryOp) => {
    if (!data) return;
    setError('');
    try {
      // Show the change at once; the server's answer replaces it.
      setData({ ...data, layout: applyOp(data.layout, op).layout });
    } catch (e) {
      if (e instanceof FloorError) return setError(e.message);
      throw e;
    }
    try {
      await load({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(op) });
    } catch (e) {
      setError((e as Error).message);
      load().catch(() => {});
    }
  };

  const onTile = (x: number, y: number) => {
    if (!data) return;
    if (tool.kind === 'machine') return send({ op: 'place', kind: tool.machine, x, y });
    if (tool.kind === 'remove') {
      setSelected(null);
      return send({ op: 'remove', x, y });
    }
    setSelected(tileMap(data.layout).get(`${x},${y}`)?.id ?? null);
  };
  const onBelts = (belts: Belt[]) => send({ op: 'belts', belts });

  const machine = data && selected ? data.layout.machines.find((m) => m.id === selected) : undefined;
  const state = machine && data ? data.sim.machines[machine.id] : undefined;
  const recipe = machine?.recipe ? RECIPE_BY_ID.get(machine.recipe) : undefined;
  const used = data ? warehouseUsed(data.sim) : 0;

  return (
    <>
      {data && (
        <FactoryCanvas
          layout={data.layout}
          sim={data.sim}
          tool={tool}
          beltDir={beltDir}
          selected={selected}
          inset={phone ? { top: 170, right: 8, bottom: 300, left: 8 } : { top: 140, right: 330, bottom: 150, left: 100 }}
          onTile={onTile}
          onBelts={onBelts}
        />
      )}

      <div className="panel factory-tools" role="toolbar" aria-label="Build tools">
        {TOOLS.map((t) => (
          <button key={t.label} className={same(tool, t.tool) ? 'btn' : 'btn-alt'} onClick={() => setTool(t.tool)} aria-pressed={same(tool, t.tool)}>
            <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
              <span>{t.label}</span>
              {t.cost && <span className="tiny" style={{ fontSize: 9 }}>{t.cost.toLocaleString('en-US')} CR</span>}
            </span>
          </button>
        ))}
        {tool.kind === 'belt' && (
          <button className="btn-alt" onClick={() => setBeltDir(((beltDir + 1) % 4) as Dir)} aria-label="Turn belt direction">
            TURN {ARROWS[beltDir]}
          </button>
        )}
      </div>

      <aside className="panel factory-side">
        {error && (
          <p role="alert" style={{ margin: '0 0 8px', color: 'var(--orange)', fontSize: 14 }}>
            {error}
          </p>
        )}
        {machine && state !== undefined ? (
          <section aria-label="Selected machine">
            <div className="tiny muted">{MACHINES[machine.kind].name.toUpperCase()}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--yellow)' }}>
              {recipe ? ITEM_INFO[recipe.output].name : 'To warehouse'}
            </div>
            <div className="tiny" style={{ color: state.status === 'working' ? 'var(--green)' : 'var(--orange)', margin: '4px 0' }}>
              {state.status === 'working' ? `WORKING · ${state.rate.toFixed(1)}/MIN` : state.status === 'starved' ? (machine.kind === 'intake' ? 'WAITING FOR MINED ORE' : 'WAITING FOR INPUTS') : state.status === 'blocked' ? 'OUTPUT BLOCKED · ADD A BELT OR FREE UP STORAGE' : 'IDLE'}
            </div>
            <p style={{ margin: '4px 0 8px', fontSize: 14, color: 'var(--muted)' }}>{MACHINES[machine.kind].help}</p>
            {machine.kind !== 'crate' && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {recipesFor(machine.kind).map((r) => (
                  <button
                    key={r.id}
                    className={r.id === machine.recipe ? 'btn' : 'btn-alt'}
                    style={{ fontSize: 13, minHeight: 34, flex: '1 1 45%' }}
                    onClick={() => r.id !== machine.recipe && send({ op: 'recipe', id: machine.id, recipe: r.id })}
                  >
                    {ITEM_INFO[r.output].short}
                  </button>
                ))}
              </div>
            )}
            {recipe && machine.kind !== 'intake' && (
              <div className="tiny" style={{ marginTop: 8, lineHeight: 1.6 }}>
                {Object.entries(recipe.inputs).map(([item, n]) => `${n} ${ITEM_INFO[item as Item].short}`).join(' + ')} → 1 {ITEM_INFO[recipe.output].short} · UP TO {recipe.perMin}/MIN
              </div>
            )}
            {recipe && machine.kind === 'intake' && <div className="tiny" style={{ marginTop: 8 }}>UP TO {recipe.perMin} T/MIN FROM YOUR SILO</div>}
          </section>
        ) : (
          <p style={{ margin: 0, fontSize: 14, color: 'var(--muted)' }}>
            {tool.kind === 'belt'
              ? 'Drag across the floor to lay belts. Tap a belt to turn it. Belts carry goods out of any machine they touch, to the machine at the end of the line.'
              : tool.kind === 'machine'
                ? `${MACHINES[tool.machine].help} Tap the floor to place it.`
                : tool.kind === 'remove'
                  ? 'Tap a machine or belt to remove it. You get half its price back.'
                  : 'Tap a machine to see what it is doing and change what it makes.'}
          </p>
        )}

        <section aria-label="Warehouse" style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="tiny muted">WAREHOUSE</span>
            <span className="tiny">
              {Math.floor(used).toLocaleString('en-US')} / {WAREHOUSE_CAPACITY.toLocaleString('en-US')}
            </span>
          </div>
          <div className="meter" aria-hidden>
            <div style={{ width: `${Math.min(1, used / WAREHOUSE_CAPACITY) * 100}%`, background: used > WAREHOUSE_CAPACITY * 0.9 ? 'var(--orange)' : 'var(--yellow)' }} />
          </div>
          <ul style={{ listStyle: 'none', margin: '6px 0 0', padding: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 10px' }}>
            {ITEMS.filter((i) => !(ORES as readonly string[]).includes(i)).map((i) => (
              <li key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                <span style={{ color: ITEM_INFO[i].color }}>{ITEM_INFO[i].name}</span>
                <span>{Math.floor(data?.sim.warehouse[i] ?? 0).toLocaleString('en-US')}</span>
              </li>
            ))}
          </ul>
        </section>
      </aside>
    </>
  );
}
