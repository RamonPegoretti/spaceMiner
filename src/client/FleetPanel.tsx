'use client';

import { useEffect, useState } from 'react';
import { galaxy } from '@/game/galaxy';
import { HAULER, haulerPosition, HOME, tripTimes } from '@/game/haulers';
import { ITEM_INFO, ORES, type Ore } from '@/game/resources';
import { UI } from './assets';
import { fmtDuration, fmtTonnes, serverNow, type ClientWorld } from './world';

const PHASE: Record<string, string> = { loading: 'LOADING', outbound: 'FLYING HOME', unloading: 'UNLOADING AT FOUNDRY', returning: 'FLYING BACK' };

/** Shortest lane path between two systems. */
function pathHome(from: string) {
  const g = galaxy();
  const prev = new Map<string, string | null>([[from, null]]);
  const queue = [from];
  while (queue.length) {
    const id = queue.shift()!;
    if (id === HOME) break;
    for (const n of g.byId.get(id)!.links) if (!prev.has(n)) prev.set(n, id), queue.push(n);
  }
  const path: string[] = [];
  for (let id: string | null | undefined = HOME; id; id = prev.get(id)) path.unshift(id);
  return path[0] === from ? path : null;
}

const cargoText = (c: Partial<Record<Ore, number>>) =>
  ORES.filter((o) => (c[o] ?? 0) >= 1)
    .map((o) => `${fmtTonnes(c[o]!)} ${ITEM_INFO[o].short}`)
    .join(' · ');

export default function FleetPanel(p: {
  world: ClientWorld | null;
  credits: number;
  draft: string[] | null;
  setDraft: (d: string[] | null) => void;
  busy: boolean;
  error: string;
  onBuy: (route: string[]) => void;
  onScrap: (id: string) => void;
}) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const g = galaxy();
  const name = (id: string) => g.byId.get(id)!.name;
  const { world: w, draft } = p;
  const now = serverNow(w);
  const haulers = w?.haulers ?? [];
  const full = haulers.length >= HAULER.max;
  const done = draft && draft.length >= 2 && draft[draft.length - 1] === HOME;

  return (
    <aside className="panel fleet-panel" aria-label="Fleet">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <img src={UI.iconFleet} alt="" width={30} height={30} />
        <div style={{ flex: 1 }}>
          <div className="tiny muted">FLEET · {haulers.length}/{HAULER.max} HAULERS</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--yellow)' }}>{draft ? 'Plot a route' : 'Your haulers'}</div>
        </div>
      </div>

      {draft ? (
        <div style={{ marginTop: 8 }}>
          <p style={{ margin: '0 0 8px', fontSize: 14, color: 'var(--muted)' }}>
            {draft.length === 0
              ? 'Tap the system you want to haul ore from.'
              : done
                ? 'Route ready. Your hauler will shuttle along it forever.'
                : "Tap a linked system (blinking green) to add the next stop, until you reach Vasko's Reach."}
          </p>
          {draft.length > 0 && (
            <ol className="route-list">
              {draft.map((id) => (
                <li key={id}>{name(id)}</li>
              ))}
            </ol>
          )}
          {done && (
            <p className="tiny" style={{ margin: '6px 0' }}>
              ONE WAY {fmtDuration(tripTimes(draft).oneWay * 60_000).toUpperCase()} · ROUND TRIP {fmtDuration(tripTimes(draft).round * 60_000).toUpperCase()} · {HAULER.capacity} T PER TRIP
            </p>
          )}
          {p.error && (
            <p role="alert" style={{ margin: '6px 0', color: 'var(--orange)', fontSize: 14 }}>
              {p.error}
            </p>
          )}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
            {done ? (
              <button className="btn" style={{ flex: '1 1 100%' }} disabled={p.busy || p.credits < HAULER.cost || full} onClick={() => p.onBuy(draft)}>
                <img src={UI.coin} alt="" width={22} height={22} /> BUY HAULER · {HAULER.cost.toLocaleString('en-US')}
              </button>
            ) : (
              draft.length === 1 && draft[0] !== HOME && pathHome(draft[0]) && (
                <button className="btn-alt" style={{ flex: '1 1 100%', fontSize: 14 }} onClick={() => p.setDraft(pathHome(draft[0]))}>
                  SHORTEST WAY HOME
                </button>
              )
            )}
            {draft.length > 0 && (
              <button className="btn-alt" style={{ flex: 1, fontSize: 14 }} onClick={() => p.setDraft(draft.slice(0, -1))}>
                UNDO STOP
              </button>
            )}
            <button className="btn-alt" style={{ flex: 1, fontSize: 14 }} onClick={() => p.setDraft(null)}>
              CANCEL
            </button>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 8 }}>
          {haulers.length === 0 ? (
            <p style={{ margin: '0 0 8px', fontSize: 14, color: 'var(--muted)' }}>
              Ore mined outside Vasko&apos;s Reach piles up where it was mined. Haulers fly it home to your foundry&apos;s silo.
            </p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
              {haulers.map((h, i) => {
                const pos = haulerPosition({ ...h, pilotId: '', removedAt: null }, now);
                const cargo = cargoText(h.cargo);
                return (
                  <li key={h.id} className="hauler-row">
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                      <span style={{ fontWeight: 700 }}>Hauler {i + 1}</span>
                      <span className="tiny" style={{ color: pos.phase === 'outbound' || pos.phase === 'unloading' ? 'var(--green)' : 'var(--muted)' }}>
                        {PHASE[pos.phase]}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--muted)' }}>{h.route.map(name).join(' → ')}</div>
                    <div className="tiny" style={{ marginTop: 2 }}>
                      {cargo ? `CARRYING ${cargo}` : pos.phase === 'outbound' ? 'EMPTY: NOTHING WAS WAITING' : 'EMPTY'} · HOME IN {fmtDuration(pos.toHome * 60_000).toUpperCase()}
                    </div>
                    <button className="btn-alt" style={{ fontSize: 12, minHeight: 30, marginTop: 4 }} disabled={p.busy} onClick={() => p.onScrap(h.id)}>
                      SCRAP · +{Math.floor(HAULER.cost / 2)}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {p.error && (
            <p role="alert" style={{ margin: '6px 0', color: 'var(--orange)', fontSize: 14 }}>
              {p.error}
            </p>
          )}
          <button className="btn" style={{ width: '100%', marginTop: 10 }} disabled={full} onClick={() => p.setDraft([])}>
            PLOT NEW ROUTE
          </button>
          {full && <p className="tiny muted">FLEET IS FULL</p>}
        </div>
      )}
    </aside>
  );
}
