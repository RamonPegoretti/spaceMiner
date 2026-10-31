/**
 * The asset layer: every picture the game draws is listed here by slot name.
 * To swap in new art, replace the files in public/assets (same name and size)
 * or point a slot at a new file. Game code only ever uses the slot names.
 */
const S = '/assets/sprites/';
const U = '/assets/ui/';

export const SPRITES = {
  spaceBg: S + 'space_bg.png',
  sun: S + 'sun.png',
  foundry: S + 'station_foundry.png',
  junction: S + 'station_junction.png',
  gate: S + 'station_gate.png',
  hauler: S + 'hauler.png',
  ...Object.fromEntries(
    (['iron', 'nickel', 'ice', 'sil'] as const).flatMap((k) =>
      [0, 1, 2, 3, 4].map((i) => [`asteroid_${k}_${i}`, `${S}asteroid_${k}_${i}.png`]),
    ),
  ),
} as Record<string, string>;

export const UI = {
  panel: U + 'panel.png',
  panelWarn: U + 'panel_warn.png',
  button: U + 'button.png',
  buttonAlt: U + 'button_alt.png',
  coin: U + 'coin.png',
  iconMap: U + 'icon_map.png',
  iconFactory: U + 'icon_factory.png',
  iconMarket: U + 'icon_market.png',
  iconFleet: U + 'icon_fleet.png',
  iconWarn: U + 'icon_warn.png',
  oreIron: U + 'ore_iron.png',
  oreNickel: U + 'ore_nickel.png',
  oreIce: U + 'ore_ice.png',
  oreSil: U + 'ore_sil.png',
} as const;

/** Each map pixel is drawn this many screen pixels wide at zoom 1. */
export const PIXEL_SCALE = 3;
