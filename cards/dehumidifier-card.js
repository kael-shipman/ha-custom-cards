/*
 * dehumidifier-card  (ha-custom-cards)
 * -----------------------------------------------------------------------------
 * A compact control panel for a `humidifier.*` dehumidifier entity:
 *
 *   - power toggle with live On/Off state
 *   - Continuous / Target mode switch  (Target -> config.target_mode)
 *   - Low / High fan-speed selector    (-> config.fan_entity)
 *   - target-humidity stepper          (shown only while in Target mode)
 *   - sleep-timer button:
 *       idle     -> "Set timer"
 *       pressed  -> grid of 5..60 (by 5) then 75..180 (by 15) minute options
 *       running  -> "<N> min left" (whole minutes); tap re-opens the option grid
 *
 * Turning the machine off when the timer expires is handled by a companion
 * Home Assistant automation that triggers on `timer.finished` for
 * `config.timer_entity` -- this card only starts / restarts / cancels the timer.
 *
 * Config (all optional -- defaults shown):
 *   type: custom:dehumidifier-card
 *   name: Dehumidifier
 *   entity: humidifier.dehumidifier
 *   fan_entity: select.dehumidifier_fan_speed
 *   timer_entity: timer.dehumidifier_timer
 *   target_mode: manual
 *   continuous_mode: continuous
 *   fan_low: low
 *   fan_high: high
 *   humidity_step: 5
 * -----------------------------------------------------------------------------
 */

const VERSION = "0.1.0";

const OPTIONS = (() => {
  const o = [];
  for (let m = 5; m <= 60; m += 5) o.push(m);
  for (let m = 75; m <= 180; m += 15) o.push(m);
  return o;
})();

const pad = (n) => String(n).padStart(2, "0");
const hhmmss = (mins) => `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}:00`;
const parseHMS = (s) => {
  const p = String(s || "0:0:0").split(":").map(Number);
  return (p[0] || 0) * 3600 + (p[1] || 0) * 60 + (p[2] || 0);
};

class DehumidifierCard extends HTMLElement {
  constructor() {
    super();
    this._menuOpen = false;
    this._tick = null;
    this._lastKey = "";
    this.addEventListener("click", (e) => this._onClick(e));
  }

  setConfig(config) {
    this._config = {
      name: "Dehumidifier",
      entity: "humidifier.dehumidifier",
      fan_entity: "select.dehumidifier_fan_speed",
      timer_entity: "timer.dehumidifier_timer",
      target_mode: "manual",
      continuous_mode: "continuous",
      fan_low: "low",
      fan_high: "high",
      humidity_step: 5,
      ...(config || {}),
    };
    this._lastKey = "";
    if (this._hass) this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  connectedCallback() {
    if (!this._tick) this._tick = setInterval(() => this._render(), 1000);
  }

  disconnectedCallback() {
    if (this._tick) clearInterval(this._tick);
    this._tick = null;
  }

  getCardSize() {
    return 4;
  }

  static getStubConfig() {
    return { type: "custom:dehumidifier-card", entity: "humidifier.dehumidifier" };
  }

  _svc(domain, service, data) {
    this._hass.callService(domain, service, data);
  }

  _onClick(e) {
    const el = e.target.closest("[data-action]");
    if (!el || !this._hass || !this._config) return;
    const c = this._config;
    const hass = this._hass;
    const a = el.dataset.action;
    const dev = hass.states[c.entity];
    const timer = hass.states[c.timer_entity];

    if (a === "power") {
      const on = dev && dev.state === "on";
      this._svc("humidifier", on ? "turn_off" : "turn_on", { entity_id: c.entity });
      if (on && timer && timer.state !== "idle") {
        this._svc("timer", "cancel", { entity_id: c.timer_entity });
      }
    } else if (a === "mode") {
      this._svc("humidifier", "set_mode", { entity_id: c.entity, mode: el.dataset.value });
    } else if (a === "fan") {
      this._svc("select", "select_option", { entity_id: c.fan_entity, option: el.dataset.value });
    } else if (a === "humidity") {
      const min = dev.attributes.min_humidity ?? 35;
      const max = dev.attributes.max_humidity ?? 85;
      const cur = Number(dev.attributes.humidity ?? min);
      const next = Math.min(max, Math.max(min, cur + Number(el.dataset.value)));
      if (next !== cur) this._svc("humidifier", "set_humidity", { entity_id: c.entity, humidity: next });
    } else if (a === "timer-toggle") {
      this._menuOpen = !this._menuOpen;
      this._render(true);
    } else if (a === "timer-close") {
      this._menuOpen = false;
      this._render(true);
    } else if (a === "timer-cancel") {
      this._svc("timer", "cancel", { entity_id: c.timer_entity });
      this._menuOpen = false;
      this._render(true);
    } else if (a === "timer-set") {
      this._svc("timer", "start", {
        entity_id: c.timer_entity,
        duration: hhmmss(Number(el.dataset.value)),
      });
      this._menuOpen = false;
      this._render(true);
    }
  }

  _timerMsLeft(t) {
    if (!t) return 0;
    if (t.state === "active" && t.attributes.finishes_at)
      return new Date(t.attributes.finishes_at).getTime() - Date.now();
    if (t.state === "paused" && t.attributes.remaining) return parseHMS(t.attributes.remaining) * 1000;
    return 0;
  }

  _render(force) {
    if (!this._hass || !this._config) return;
    const c = this._config;
    const hass = this._hass;
    const dev = hass.states[c.entity];

    if (!dev) {
      this.innerHTML = `<ha-card><div style="padding:16px;color:var(--error-color,red)">dehumidifier-card: entity <code>${c.entity}</code> not found</div></ha-card>`;
      return;
    }

    const fan = hass.states[c.fan_entity];
    const timer = hass.states[c.timer_entity];
    const on = dev.state === "on";
    const mode = dev.attributes.mode;
    const isTarget = mode === c.target_mode;
    const isCont = mode === c.continuous_mode;
    const curHum = dev.attributes.current_humidity;
    const tgtHum = dev.attributes.humidity;
    const fanState = fan ? fan.state : null;
    const fanLow = fanState === c.fan_low || fanState === "lowest";
    const fanHigh = fanState === c.fan_high;

    const tState = timer ? timer.state : "idle";
    const running = tState === "active" || tState === "paused";
    const msLeft = this._timerMsLeft(timer);
    const minLeft = Math.floor(msLeft / 60000);
    let timerLabel;
    if (running) {
      timerLabel = minLeft >= 1 ? `${minLeft} min left` : "&lt;1 min left";
      if (tState === "paused") timerLabel += " (paused)";
    } else {
      timerLabel = "Set timer";
    }
    let progress = 0;
    if (running && timer.attributes.duration) {
      const total = parseHMS(timer.attributes.duration);
      if (total > 0) progress = Math.max(0, Math.min(1, msLeft / 1000 / total));
    }

    // Skip DOM churn on the 1s tick unless something visible changed.
    const key = [
      on, mode, fanState, tgtHum, tState, minLeft, this._menuOpen, Math.round(progress * 100),
    ].join("|");
    if (!force && key === this._lastKey) return;
    this._lastKey = key;

    const seg = (active, action, value, label) =>
      `<button class="seg ${active ? "on" : ""}" data-action="${action}" data-value="${value}">${label}</button>`;

    const menuGrid = OPTIONS.map(
      (m) => `<button class="opt" data-action="timer-set" data-value="${m}">${m}</button>`
    ).join("");

    this.innerHTML = `
      <ha-card>
        <style>
          .wrap { padding: 12px 16px 16px; }
          .top { display:flex; align-items:center; gap:12px; }
          .power {
            border:none; cursor:pointer; width:48px; height:48px; border-radius:50%;
            display:flex; align-items:center; justify-content:center; flex:0 0 auto;
            background: ${on ? "var(--primary-color)" : "var(--disabled-color, #9e9e9e)"};
            color:#fff;
          }
          .power ha-icon { --mdc-icon-size:26px; }
          .title { font-size:1.05rem; font-weight:500; color:var(--primary-text-color); }
          .sub { font-size:.8rem; color:var(--secondary-text-color); margin-top:2px; }
          .row { margin-top:14px; }
          .lbl { font-size:.72rem; text-transform:uppercase; letter-spacing:.05em;
                 color:var(--secondary-text-color); margin-bottom:6px; }
          .segs { display:flex; gap:8px; }
          .seg, .step {
            flex:1; padding:9px 8px; border-radius:10px; cursor:pointer; font-size:.9rem;
            border:1px solid var(--divider-color); background:var(--card-background-color);
            color:var(--primary-text-color);
          }
          .seg.on { background:var(--primary-color); border-color:var(--primary-color); color:#fff; }
          .hum { display:flex; align-items:center; gap:12px; }
          .step { flex:0 0 auto; width:44px; font-size:1.1rem; line-height:1; }
          .humval { flex:1; text-align:center; font-size:1.4rem; font-weight:500;
                    color:var(--primary-text-color); }
          .humval small { font-size:.8rem; color:var(--secondary-text-color); }
          .timerbtn {
            width:100%; padding:12px; border-radius:12px; cursor:pointer; font-size:1rem;
            border:1px solid var(--divider-color); color:var(--primary-text-color);
            background:var(--card-background-color); position:relative; overflow:hidden;
          }
          .timerbtn.running { border-color:var(--primary-color); font-weight:500; }
          .bar { position:absolute; left:0; bottom:0; height:3px; background:var(--primary-color);
                 transition:width 1s linear; }
          .menu { margin-top:10px; }
          .menuhdr { display:flex; justify-content:space-between; align-items:center;
                     font-size:.72rem; text-transform:uppercase; letter-spacing:.05em;
                     color:var(--secondary-text-color); margin-bottom:8px; }
          .close { background:none; border:none; color:var(--primary-color); cursor:pointer;
                   font-size:.8rem; text-transform:uppercase; letter-spacing:.05em; }
          .grid { display:grid; grid-template-columns:repeat(6, 1fr); gap:6px; }
          .opt { padding:10px 0; border-radius:8px; cursor:pointer; font-size:.9rem;
                 border:1px solid var(--divider-color); background:var(--card-background-color);
                 color:var(--primary-text-color); }
          .opt:hover, .seg:hover, .step:hover, .timerbtn:hover { border-color:var(--primary-color); }
          .cancel { grid-column:1 / -1; color:var(--error-color, #db4437);
                    border-color:var(--error-color, #db4437); }
          @media (max-width:360px){ .grid{ grid-template-columns:repeat(4,1fr);} }
        </style>
        <div class="wrap">
          <div class="top">
            <button class="power" data-action="power" title="${on ? "Turn off" : "Turn on"}">
              <ha-icon icon="mdi:power"></ha-icon>
            </button>
            <div>
              <div class="title">${c.name}</div>
              <div class="sub">
                ${on ? "On" : "Off"}${mode ? " &middot; " + mode : ""}${
      curHum != null ? " &middot; " + Math.round(curHum) + "% now" : ""
    }</div>
            </div>
          </div>

          <div class="row">
            <div class="lbl">Mode</div>
            <div class="segs">
              ${seg(isCont, "mode", c.continuous_mode, "Continuous")}
              ${seg(isTarget, "mode", c.target_mode, "Target")}
            </div>
          </div>

          <div class="row">
            <div class="lbl">Fan speed</div>
            <div class="segs">
              ${seg(fanLow, "fan", c.fan_low, "Low")}
              ${seg(fanHigh, "fan", c.fan_high, "High")}
            </div>
          </div>

          ${
            isTarget
              ? `<div class="row">
                   <div class="lbl">Target humidity</div>
                   <div class="hum">
                     <button class="step" data-action="humidity" data-value="-${c.humidity_step}">&minus;</button>
                     <div class="humval">${tgtHum != null ? Math.round(tgtHum) : "--"}<small>%</small></div>
                     <button class="step" data-action="humidity" data-value="${c.humidity_step}">+</button>
                   </div>
                 </div>`
              : ""
          }

          <div class="row">
            <button class="timerbtn ${running ? "running" : ""}" data-action="timer-toggle">
              ${timerLabel}
              ${progress > 0 ? `<span class="bar" style="width:${progress * 100}%"></span>` : ""}
            </button>
            ${
              this._menuOpen
                ? `<div class="menu">
                     <div class="menuhdr"><span>Minutes</span>
                       <button class="close" data-action="timer-close">Close</button></div>
                     <div class="grid">
                       ${menuGrid}
                       ${
                         running
                           ? `<button class="opt cancel" data-action="timer-cancel">Cancel timer</button>`
                           : ""
                       }
                     </div>
                   </div>`
                : ""
            }
          </div>
        </div>
      </ha-card>`;
  }
}

if (!customElements.get("dehumidifier-card")) {
  customElements.define("dehumidifier-card", DehumidifierCard);
}

window.customCards = window.customCards || [];
if (!window.customCards.some((x) => x.type === "dehumidifier-card")) {
  window.customCards.push({
    type: "dehumidifier-card",
    name: "Dehumidifier Card",
    preview: false,
    description: "Power, mode, fan speed, target humidity and a sleep timer for a dehumidifier.",
  });
}

console.info(
  `%c dehumidifier-card %c v${VERSION} `,
  "color:#fff;background:#3949ab;font-weight:700",
  "color:#3949ab;background:#e8eaf6"
);
