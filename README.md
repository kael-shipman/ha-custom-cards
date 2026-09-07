# ha-custom-cards

Personal collection of custom [Home Assistant](https://www.home-assistant.io/)
Lovelace cards. Each card is a single self-contained ES module under
[`cards/`](cards/) with no build step.

## Cards

| Card | File | Purpose |
|------|------|---------|
| `custom:dehumidifier-card` | [`cards/dehumidifier-card.js`](cards/dehumidifier-card.js) | Power / mode / fan-speed / target-humidity / sleep-timer panel for a `humidifier.*` dehumidifier entity |

## Installing a card

These cards are loaded straight from [jsDelivr](https://www.jsdelivr.com/),
which serves the repo's files from GitHub with the correct
`application/javascript` MIME type (unlike `raw.githubusercontent.com`).

1. **Settings → Dashboards → ⋮ → Resources → Add resource**
   (or *Edit dashboard → ⋮ → Manage resources*).
2. URL — pin to a tag so upgrades are deliberate:

   ```
   https://cdn.jsdelivr.net/gh/kael-shipman/ha-custom-cards@v0.1.0/cards/dehumidifier-card.js
   ```

3. Resource type: **JavaScript Module**.
4. Hard-refresh the browser (and clear the Companion App's frontend cache /
   restart the app on mobile) so the new module is fetched.

Bump the `@vX.Y.Z` in the URL when you want to move to a newer release.
`@latest` also works but jsDelivr caches it for up to 12 h.

## `dehumidifier-card`

```yaml
type: custom:dehumidifier-card
# everything below is optional — defaults shown
name: Dehumidifier
entity: humidifier.dehumidifier
fan_entity: select.dehumidifier_fan_speed
timer_entity: timer.dehumidifier_timer
target_mode: manual          # humidifier mode the "Target" button selects
continuous_mode: continuous  # humidifier mode the "Continuous" button selects
fan_low: low                 # option written to fan_entity for "Low"
fan_high: high               # option written to fan_entity for "High"
humidity_step: 5             # +/- step for the target-humidity control
```

### Sleep timer

The timer button needs a companion `timer` helper and an automation that turns
the dehumidifier off when it fires:

```yaml
# Helper: Settings → Devices & services → Helpers → Timer
#   name: Dehumidifier Timer   (entity_id: timer.dehumidifier_timer)
#   restore: true

# Automation
alias: Dehumidifier sleep timer
mode: queued
triggers:
  - trigger: timer.finished
    target: { entity_id: timer.dehumidifier_timer }
    id: timer_expired
  - trigger: state
    entity_id: humidifier.dehumidifier
    to: "off"
    id: dehumidifier_off
actions:
  - choose:
      - conditions: [{ condition: trigger, id: timer_expired }]
        sequence:
          - action: humidifier.turn_off
            target: { entity_id: humidifier.dehumidifier }
      - conditions:
          - condition: trigger
            id: dehumidifier_off
          - condition: state
            entity_id: timer.dehumidifier_timer
            state: active
        sequence:
          - action: timer.cancel
            target: { entity_id: timer.dehumidifier_timer }
```

Button behaviour:

- **Idle** → reads `Set timer`.
- **Tap while idle** → shows a grid of 5–60 min (5-min steps) then 75–180 min
  (15-min steps). Picking one starts `timer_entity`.
- **Running** → reads `<N> min left` (whole minutes) with a progress bar.
- **Tap while running** → re-opens the grid; picking a value restarts the
  timer, and a red **Cancel timer** button is shown.
- Turning the dehumidifier off from the card also cancels a pending timer.

## License

[MIT](LICENSE)
