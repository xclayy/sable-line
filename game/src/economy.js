// The economy: money earned between rounds and spent in the buy menu.
// Kills pay $200, a round win $300, a loss $150, a plant or defuse $300.
export const BUY_ITEMS = [
  { id: 'smg', name: 'KESTREL-9 SMG', price: 1500, desc: 'Fast fire, close range. 32 rounds.' },
  { id: 'rifle', name: 'VK-47 RIFLE', price: 2700, desc: 'The workhorse. 30 rounds, headshots kill.' },
  { id: 'grenade', name: 'SPARROW FRAG', price: 300, desc: 'One fragmentation grenade.' },
  { id: 'armor', name: 'KEVLAR VEST', price: 650, desc: 'Absorbs half of incoming damage.' },
  { id: 'ammo', name: 'AMMO RESERVE', price: 200, desc: 'Refills reserve ammo for every weapon you own.' },
];

export const REWARDS = { kill: 200, win: 300, loss: 150, plant: 300, defuse: 300 };

export function createEconomy() {
  let money = 800;
  return {
    get money() {
      return money;
    },
    add(amount) {
      money += amount;
    },
    canAfford(price) {
      return money >= price;
    },
    spend(price) {
      if (money < price) return false;
      money -= price;
      return true;
    },
    reset() {
      money = 800;
    },
  };
}
