'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { CLAIM_COST, MAX_CLAIMS, RESPAWN_MS, RIG_RATE } from '@/game/claims';
import { HAULER } from '@/game/haulers';
import { BELT_COST, ITEM_INFO, MACHINES, RECIPES, REFUND, STARTING_CREDITS, WAREHOUSE_CAPACITY, type Item } from '@/game/resources';
import { UI } from './assets';

/**
 * The in-game "How to play" guide. Numbers come from src/game, so the guide stays right
 * when the game is rebalanced.
 */
const cr = (n: number) => `${n.toLocaleString('en-US')} credits`;
const SEEN_KEY = 'spaceminer.guide.seen';

/** True the first time this browser opens the game, so the guide can show itself once. */
export function firstVisit() {
  try {
    if (localStorage.getItem(SEEN_KEY)) return false;
    localStorage.setItem(SEEN_KEY, '1');
    return true;
  } catch {
    return false;
  }
}

const recipeLine = (id: string) => {
  const r = RECIPES.find((x) => x.id === id)!;
  const ins = Object.entries(r.inputs)
    .map(([item, n]) => `${n} ${ITEM_INFO[item as Item].name.toLowerCase()}`)
    .join(' + ');
  return `${ins} → ${ITEM_INFO[r.output].name.toLowerCase()} (up to ${r.perMin}/min)`;
};

interface Page {
  id: string;
  label: string;
  icon: string;
  title: string;
  body: ReactNode;
}

const PAGES: Page[] = [
  {
    id: 'start',
    label: 'START',
    icon: UI.coin,
    title: 'Welcome, pilot',
    body: (
      <>
        <p>
          spaceMiner is about turning rocks into riches. You claim drifting asteroid fields, mine their ore, haul it home to
          your foundry, and build factory lines that refine it into parts.
        </p>
        <h3>The loop</h3>
        <ol>
          <li><b>Claim</b> an asteroid field on the Map. Your rig starts mining.</li>
          <li><b>Haul</b> ore from far systems back to Vasko&apos;s Reach with haulers (Fleet).</li>
          <li><b>Build</b> machines and belts on your factory floor to refine ore into goods (Factory).</li>
          <li><b>Trade</b> goods with other pilots on the Market (coming soon).</li>
        </ol>
        <h3>The screens</h3>
        <ul className="guide-icons">
          <li><img src={UI.iconMap} alt="" width={30} height={30} /> <span><b>Map</b>: the galaxy, its star systems and their asteroid fields.</span></li>
          <li><img src={UI.iconFactory} alt="" width={30} height={30} /> <span><b>Factory</b>: your Home Foundry floor.</span></li>
          <li><img src={UI.iconMarket} alt="" width={30} height={30} /> <span><b>Market</b>: buying and selling. Not open yet.</span></li>
          <li><img src={UI.iconFleet} alt="" width={30} height={30} /> <span><b>Fleet</b>: your haulers and their routes.</span></li>
        </ul>
        <h3>You keep going while you&apos;re away</h3>
        <p>
          Mining, hauling and factories all run while you are logged out. When you come back, everything that happened
          in the meantime is already counted.
        </p>
        <p>You start with {cr(STARTING_CREDITS)}. The number at the top right is your balance.</p>
      </>
    ),
  },
  {
    id: 'map',
    label: 'MAP',
    icon: UI.iconMap,
    title: 'Map and claims',
    body: (
      <>
        <p>
          The galaxy is shared by every pilot. Tap a star system to fly in, and tap a gate inside it to jump to a linked
          system. Drag to move around, scroll or pinch to zoom.
        </p>
        <h3>Asteroid fields</h3>
        <p>
          Each system has a few asteroid fields slowly orbiting its sun. Every field holds one ore: iron, nickel, water ice
          or silicate. Tap a field to see its ore, how much is left, and who is mining it.
        </p>
        <h3>Claiming</h3>
        <ul>
          <li>A free field costs {cr(CLAIM_COST)} to claim. Your rig then mines {RIG_RATE} tonnes a minute.</li>
          <li>Only one pilot can mine a field at a time, so the best spots go fast.</li>
          <li>You can run up to {MAX_CLAIMS} claims at once. Abandon one to free a slot (no refund).</li>
        </ul>
        <h3>Fields run dry</h3>
        <p>
          Fields do not last forever. When one is empty your claim ends, and about {Math.round(RESPAWN_MS / 60_000)} minutes
          later a brand new field, with a new name, ore and size, drifts into the same spot. Keep an eye on the ore meter and
          be ready to claim the next one.
        </p>
        <h3>Where your ore goes</h3>
        <p>
          The bar under your balance shows your ore and how fast it grows. Ore mined in <b>Vasko&apos;s Reach</b>, your home
          system, goes straight into the silo at your foundry. Ore mined anywhere else piles up in that system until a hauler
          brings it home.
        </p>
      </>
    ),
  },
  {
    id: 'factory',
    label: 'FACTORY',
    icon: UI.iconFactory,
    title: 'Factory floor',
    body: (
      <>
        <p>
          Your Home Foundry is a grid where you lay out production lines by hand. You start with a ready-made iron line:
          an ore intake, a smelter and a storage crate, joined by belts. Watch it work, then build your own.
        </p>
        <h3>Machines</h3>
        <ul>
          {(Object.keys(MACHINES) as (keyof typeof MACHINES)[]).map((k) => (
            <li key={k}>
              <b>{MACHINES[k].name}</b> ({cr(MACHINES[k].cost)}): {MACHINES[k].help}
            </li>
          ))}
        </ul>
        <p>Tap a machine with the Select tool to see what it is doing and to pick what it makes.</p>
        <h3>Belts</h3>
        <p>
          Pick the Belt tool ({cr(BELT_COST)} a tile) and drag across the floor: belts point the way you drag. Tap a single
          belt to turn it, or use TURN to set the direction before you tap. A belt touching a machine picks up its output and carries it to the machine at the end of
          the line.
        </p>
        <h3>Recipes</h3>
        <ul>
          {RECIPES.filter((r) => r.machine !== 'intake').map((r) => (
            <li key={r.id}>{MACHINES[r.machine].name}: {recipeLine(r.id)}</li>
          ))}
        </ul>
        <h3>Warehouse</h3>
        <p>
          Anything that reaches a storage crate goes into your warehouse, which holds {WAREHOUSE_CAPACITY.toLocaleString('en-US')} units
          of refined goods and parts. Ore that reaches a crate goes back to your silo, which has no limit.
        </p>
        <h3>When a machine stops</h3>
        <ul>
          <li><b>Waiting for inputs</b>: it needs more ore or goods. Mine more, or add a belt from the machine that makes them.</li>
          <li><b>Output blocked</b>: nothing takes its output. Add a belt to a crate, or free up warehouse space.</li>
        </ul>
        <p>The Remove tool takes a machine or belt away and gives you back {Math.round(REFUND * 100)}% of its price.</p>
      </>
    ),
  },
  {
    id: 'fleet',
    label: 'FLEET',
    icon: UI.iconFleet,
    title: 'Fleet and haulers',
    body: (
      <>
        <p>
          Ore you mine outside Vasko&apos;s Reach waits in the system where it was mined. Haulers fly it home to your
          foundry&apos;s silo, where your factory can use it.
        </p>
        <h3>Plot a route</h3>
        <ol>
          <li>Open Fleet and tap <b>PLOT NEW ROUTE</b>.</li>
          <li>Tap the system you want to haul ore from.</li>
          <li>Tap linked systems one by one (they blink green) until you reach Vasko&apos;s Reach. Or tap <b>SHORTEST WAY HOME</b>.</li>
          <li>Tap <b>BUY HAULER</b> ({cr(HAULER.cost)}).</li>
        </ol>
        <h3>How haulers work</h3>
        <ul>
          <li>A hauler shuttles forever: load, fly home, unload, fly back.</li>
          <li>It carries up to {HAULER.capacity} tonnes per trip. If your rigs mine faster than that, add a second hauler on the same route.</li>
          <li>Longer routes take longer. The route preview shows the one-way and round-trip times.</li>
          <li>You can own up to {HAULER.max} haulers. Scrap one to get half its price back.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'credits',
    label: 'CREDITS',
    icon: UI.iconMarket,
    title: 'Credits and the market',
    body: (
      <>
        <p>Credits pay for everything: claims, haulers, machines and belts. Spend your starting {cr(STARTING_CREDITS)} wisely.</p>
        <h3>What things cost</h3>
        <ul>
          <li>Claim a field: {cr(CLAIM_COST)}</li>
          <li>Hauler: {cr(HAULER.cost)}</li>
          {(Object.keys(MACHINES) as (keyof typeof MACHINES)[]).map((k) => (
            <li key={k}>{MACHINES[k].name}: {cr(MACHINES[k].cost)}</li>
          ))}
          <li>Belt: {cr(BELT_COST)} a tile</li>
        </ul>
        <h3>Getting credits back</h3>
        <p>
          Removing a machine or belt refunds {Math.round(REFUND * 100)}% of its price, and scrapping a hauler refunds half of
          its price. Abandoning a claim gives nothing back.
        </p>
        <h3>The market is coming</h3>
        <p>
          The Market is not open yet. Soon you will sell your refined goods and parts to other pilots, and buy what you
          cannot make yourself. Until then, stock up your warehouse: those goods will be worth credits.
        </p>
      </>
    ),
  },
];

export default function HowToPlay({ onClose }: { onClose: () => void }) {
  const [page, setPage] = useState(0);
  const p = PAGES[page];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="guide-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section className="panel guide" role="dialog" aria-modal="true" aria-labelledby="guide-title">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src={p.icon} alt="" width={33} height={33} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="tiny muted">HOW TO PLAY · {page + 1}/{PAGES.length}</div>
            <h2 id="guide-title" style={{ margin: 0, fontSize: 22, color: 'var(--yellow)' }}>{p.title}</h2>
          </div>
          <button className="btn-alt" aria-label="Close guide" style={{ fontSize: 14, minHeight: 36, padding: '0 4px' }} onClick={onClose}>✕</button>
        </div>

        <nav className="guide-tabs" aria-label="Guide sections">
          {PAGES.map((x, i) => (
            <button key={x.id} className={i === page ? 'btn' : 'btn-alt'} aria-current={i === page ? 'page' : undefined} onClick={() => setPage(i)}>
              {x.label}
            </button>
          ))}
        </nav>

        <div className="guide-body" key={p.id}>{p.body}</div>

        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <button className="btn-alt" style={{ flex: 1, fontSize: 15 }} disabled={page === 0} onClick={() => setPage(page - 1)}>◀ BACK</button>
          {page < PAGES.length - 1 ? (
            <button className="btn" style={{ flex: 1, fontSize: 15 }} onClick={() => setPage(page + 1)}>NEXT ▶</button>
          ) : (
            <button className="btn" style={{ flex: 1, fontSize: 15 }} onClick={onClose}>START PLAYING</button>
          )}
        </div>
      </section>
    </div>
  );
}
