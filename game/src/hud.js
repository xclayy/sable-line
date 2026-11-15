// The DOM HUD: crosshair, hit marker, health, ammo, money, timer, score,
// killfeed, bomb status and the buy menu. It never touches the simulation;
// main.js pushes numbers in and reads the play/buy callbacks out.
import { BUY_ITEMS } from './economy.js';

const COPY = {
  start: {
    title: 'SABLE LINE',
    copy: 'A dusk rail depot. Plant the charge at Site A or Site B — or wipe the other team. First to 3 rounds takes the match.',
    action: 'Click to play',
  },
  paused: {
    title: 'SABLE LINE',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  round: {
    title: 'Round over',
    copy: '',
    action: 'Next round',
  },
  match: {
    title: 'Match over',
    copy: '',
    action: 'Play again',
  },
};

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const weaponName = $('weapon-name');
  const healthValue = $('health-value');
  const healthFill = $('health-fill');
  const armorFill = $('armor-fill');
  const moneyValue = $('money-value');
  const timerValue = $('timer-value');
  const scoreValue = $('score-value');
  const aliveValue = $('alive-value');
  const siteValue = $('site-value');
  const hitmarker = $('hitmarker');
  const crosshair = $('crosshair');
  const damage = $('damage');
  const bannerEl = $('banner');
  const bannerTitle = $('banner-title');
  const bannerSub = $('banner-sub');
  const killfeed = $('killfeed');
  const bombEl = $('bomb');
  const bombText = $('bomb-text');
  const bombBar = $('bomb-bar');
  const buyEl = $('buy');
  const buyList = $('buy-list');
  const buyMoney = $('buy-money');
  let hitTimer = 0;
  let bannerTimer = 0;
  let damageTimer = 0;
  let last = { mag: -1, reserve: -1, weapon: '', hp: -1, armor: -1, money: -1, timer: '', score: '', alive: '', site: '' };
  let buyHandler = null;

  function setText(el, value, key) {
    if (last[key] === value) return;
    last[key] = value;
    el.textContent = value;
  }

  return {
    setAmmo(mag, reserve, name) {
      setText(ammoMag, String(mag), 'mag');
      setText(ammoReserve, `/ ${reserve}`, 'reserve');
      setText(weaponName, name, 'weapon');
      $('ammo').classList.toggle('empty', mag === 0);
    },
    setHealth(hp, armor) {
      if (last.hp !== hp) {
        last.hp = hp;
        healthValue.textContent = String(Math.max(0, Math.ceil(hp)));
        healthFill.style.width = `${Math.max(0, Math.min(100, hp))}%`;
      }
      if (last.armor !== armor) {
        last.armor = armor;
        armorFill.style.width = `${Math.max(0, Math.min(100, armor))}%`;
      }
    },
    setMoney(value) {
      setText(moneyValue, `$${value}`, 'money');
    },
    setTimer(seconds, phase) {
      const s = Math.max(0, Math.ceil(seconds));
      const text = phase === 'freeze' ? `BUY ${s}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      setText(timerValue, text, 'timer');
      timerValue.classList.toggle('freeze', phase === 'freeze');
    },
    setScore(a, b, round) {
      setText(scoreValue, `YOU ${a} — ${b} THEM · R${round}`, 'score');
    },
    setAlive(a, b) {
      setText(aliveValue, `ALIVE ${a} v ${b}`, 'alive');
    },
    setSite(site) {
      setText(siteValue, site ? `SITE ${site}` : '', 'site');
    },
    setCrosshairGap(px) {
      crosshair.style.setProperty('--gap', `${px.toFixed(1)}px`);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.style.transform = killed ? 'translate(-50%, -50%) rotate(45deg) scale(1.3)' : '';
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => {
        hitmarker.classList.remove('on');
        hitmarker.style.transform = '';
      }, holdMs);
    },
    damageFlash() {
      damage.classList.add('on');
      clearTimeout(damageTimer);
      damageTimer = setTimeout(() => damage.classList.remove('on'), 220);
    },
    killfeed(killer, victim, headshot) {
      const entry = document.createElement('div');
      entry.className = 'feed-entry';
      entry.innerHTML = `<b>${killer}</b> ${headshot ? '◉' : '✕'} <b>${victim}</b>`;
      killfeed.prepend(entry);
      while (killfeed.children.length > 5) killfeed.removeChild(killfeed.lastChild);
      setTimeout(() => entry.classList.add('fade'), 3200);
      setTimeout(() => entry.remove(), 4200);
    },
    banner(titleText, subText, ms = 2600) {
      bannerTitle.textContent = titleText;
      bannerSub.textContent = subText;
      bannerEl.classList.add('on');
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => bannerEl.classList.remove('on'), ms);
    },
    bombStatus(text, progress) {
      if (!text) {
        bombEl.hidden = true;
        return;
      }
      bombEl.hidden = false;
      bombText.textContent = text;
      bombBar.style.width = `${Math.max(0, Math.min(100, progress * 100))}%`;
    },
    showOverlay(mode, data = {}) {
      const text = COPY[mode];
      title.textContent = mode === 'round' ? data.title ?? text.title : text.title;
      copy.textContent = data.copy ?? text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
    openBuy(money, onBuy) {
      buyHandler = onBuy;
      buyMoney.textContent = `$${money}`;
      buyList.innerHTML = '';
      BUY_ITEMS.forEach((item, index) => {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'buy-row';
        row.dataset.item = item.id;
        row.innerHTML = `<span class="buy-key">${index + 1}</span><span class="buy-name">${item.name}</span><span class="buy-desc">${item.desc}</span><span class="buy-price">$${item.price}</span>`;
        row.addEventListener('click', () => onBuy(item.id));
        buyList.appendChild(row);
      });
      buyEl.hidden = false;
    },
    updateBuy(money) {
      buyMoney.textContent = `$${money}`;
    },
    closeBuy() {
      buyEl.hidden = true;
      buyHandler = null;
    },
    buyOpen() {
      return !buyEl.hidden;
    },
  };
}
