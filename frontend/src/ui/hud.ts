import type { RiskState, SecurityEvent, Severity } from '../types/contract';

export interface AggregateState {
  threat_level: 'low' | 'guarded' | 'elevated' | 'high' | 'severe';
  counts: { info: number; low: number; medium: number; high: number; critical: number };
  compromised_assets: number;
  kill_chain: Record<string, number>;
  top_types: Array<{ type: string; count: number }>;
}

export interface HudApi {
  addEvent(event: SecurityEvent): void;
  setState(state: AggregateState): void;
  selectAsset(id: string | null, risk?: RiskState | null): void;
  updateRisk(assetId: string, risk: RiskState): void;
  /** Asset whose detail card is open, or null. */
  selectedId(): string | null;
  /** Drop every event row (replay seek, live <-> replay switch). Counters are left to `setState`. */
  reset(): void;
  /** Clock used for the relative time on rows; null means wall time (live). Replay passes the playhead. */
  setClock(clock: (() => number) | null): void;
  dispose(): void;
}

const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

function timeLabel(ts: string, now: number): string {
  try {
    const d = new Date(ts);
    const diff = Math.max(0, (now - d.getTime()) / 1000);
    if (diff < 60) return `${Math.floor(diff)}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return ts;
  }
}

export function createHud(host: HTMLElement): HudApi {
  // Top banner (compact on mobile)
  const banner = document.createElement('div');
  banner.className = 'hud-banner';
  banner.innerHTML = `
    <span class="hud-banner-level">—</span>
    <span class="hud-banner-counts"></span>
    <span class="hud-banner-kill"></span>
  `;
  host.appendChild(banner);

  // Right panel
  const panel = document.createElement('aside');
  panel.className = 'hud-panel';
  panel.innerHTML = `
    <div class="hud-panel-head">
      <span class="hud-panel-title">Events</span>
      <div class="hud-filters"></div>
    </div>
    <div class="hud-events"></div>
  `;
  host.appendChild(panel);

  const filtersEl = panel.querySelector<HTMLElement>('.hud-filters')!;
  const eventsEl = panel.querySelector<HTMLElement>('.hud-events')!;

  // Detail card
  let currentId: string | null = null;
  const detail = document.createElement('div');
  detail.className = 'hud-detail';
  detail.hidden = true;
  host.appendChild(detail);

  // Mobile toggle for the event panel
  const toggle = document.createElement('button');
  toggle.className = 'hud-toggle';
  toggle.type = 'button';
  toggle.textContent = 'Events';
  toggle.addEventListener('click', () => {
    panel.classList.toggle('open');
    toggle.classList.toggle('open', panel.classList.contains('open'));
  });
  host.appendChild(toggle);

  // Filter state
  const activeFilters = new Set<Severity>(SEVERITIES);
  const filterButtons: HTMLButtonElement[] = [];
  for (const sev of SEVERITIES) {
    const btn = document.createElement('button');
    btn.className = 'hud-filter';
    btn.type = 'button';
    btn.textContent = sev;
    btn.dataset.sev = sev;
    btn.classList.add('active');
    btn.addEventListener('click', () => {
      if (activeFilters.has(sev)) {
        activeFilters.delete(sev);
        btn.classList.remove('active');
      } else {
        activeFilters.add(sev);
        btn.classList.add('active');
      }
      applyFilter();
    });
    filterButtons.push(btn);
    filtersEl.appendChild(btn);
  }

  const events: SecurityEvent[] = [];
  let clock: (() => number) | null = null;
  function renderEvent(ev: SecurityEvent): HTMLElement {
    const row = document.createElement('button');
    row.className = `hud-event hud-sev-${ev.severity}`;
    row.type = 'button';
    row.innerHTML = `
      <span class="hud-event-dot"></span>
      <span class="hud-event-body">
        <span class="hud-event-type"></span>
        <span class="hud-event-asset"></span>
      </span>
      <span class="hud-event-time"></span>
    `;
    const typeEl = row.querySelector<HTMLElement>('.hud-event-type')!;
    const assetEl = row.querySelector<HTMLElement>('.hud-event-asset')!;
    const timeEl = row.querySelector<HTMLElement>('.hud-event-time')!;
    typeEl.textContent = ev.type;
    assetEl.textContent = ev.dst.host ?? ev.dst.ip ?? '—';
    timeEl.textContent = timeLabel(ev.ts, clock ? clock() : Date.now());
    row.addEventListener('click', () => {
      if (ev.dst.asset_id) {
        host.dispatchEvent(new CustomEvent('hud:select', { detail: ev.dst.asset_id }));
      }
    });
    row.addEventListener('mouseenter', () => {
      if (ev.dst.asset_id) host.dispatchEvent(new CustomEvent('hud:hover', { detail: ev.dst.asset_id }));
    });
    row.addEventListener('mouseleave', () => {
      host.dispatchEvent(new CustomEvent('hud:hover', { detail: null }));
    });
    return row;
  }

  function applyFilter(): void {
    const rows = eventsEl.querySelectorAll<HTMLElement>('.hud-event');
    rows.forEach((row, i) => {
      const ev = events[i];
      row.hidden = !activeFilters.has(ev.severity);
    });
  }

  const api: HudApi = {
    addEvent(event: SecurityEvent): void {
      events.unshift(event);
      if (events.length > 60) events.pop();
      const row = renderEvent(event);
      if (!activeFilters.has(event.severity)) row.hidden = true;
      eventsEl.insertBefore(row, eventsEl.firstChild);
    },
    setState(state: AggregateState): void {
      const levelEl = banner.querySelector<HTMLElement>('.hud-banner-level')!;
      const countsEl = banner.querySelector<HTMLElement>('.hud-banner-counts')!;
      const killEl = banner.querySelector<HTMLElement>('.hud-banner-kill')!;
      levelEl.textContent = `Threat: ${state.threat_level}`;
      levelEl.className = `hud-banner-level hud-level-${state.threat_level}`;
      const c = state.counts;
      countsEl.textContent = `info ${c.info} · low ${c.low} · med ${c.medium} · high ${c.high} · crit ${c.critical}`;
      const kc = state.kill_chain;
      const stages = ['reconnaissance', 'initial_access', 'c2', 'exploitation', 'lateral_movement', 'impact'];
      killEl.innerHTML = stages
        .map((s) => `<span class="hud-kill" style="opacity:${(kc[s] ?? 0).toFixed(2)}">${s.replace('_', ' ')}</span>`)
        .join('');
    },
    selectAsset(id: string | null, risk: RiskState | null = null): void {
      currentId = id;
      if (!id) {
        detail.hidden = true;
        detail.innerHTML = '';
        return;
      }
      detail.hidden = false;
      detail.innerHTML = `
        <div class="hud-detail-head">
          <strong>${id}</strong>
          <button type="button" class="hud-detail-close">×</button>
        </div>
        <div class="hud-detail-body">
          ${risk ? `
            ${risk.risk > 0
              ? `<div class="hud-detail-row"><span>risk</span><span>${risk.risk.toFixed(1)} / 100</span></div>
                 <div class="hud-detail-row"><span>state</span><span>${risk.state}</span></div>`
              : '<div class="hud-detail-row"><span>risk</span><span>score pending</span></div>'}
            <div class="hud-detail-row"><span>events 24h</span><span>${risk.events_24h}</span></div>
            <div class="hud-detail-row"><span>top types</span><span>${risk.top_types.join(', ') || '—'}</span></div>
          ` : '<div class="hud-detail-row"><span>no risk data</span><span>—</span></div>'}
        </div>
      `;
      detail.querySelector<HTMLButtonElement>('.hud-detail-close')?.addEventListener('click', () => {
        detail.hidden = true;
        currentId = null;
      });
    },
    updateRisk(assetId: string, risk: RiskState): void {
      if (currentId !== assetId || detail.hidden) {
        return;
      }
      api.selectAsset(assetId, risk);
    },
    selectedId(): string | null {
      return detail.hidden ? null : currentId;
    },
    reset(): void {
      events.length = 0;
      eventsEl.replaceChildren();
    },
    setClock(next): void {
      clock = next;
    },
    dispose(): void {
      banner.remove();
      panel.remove();
      detail.remove();
      toggle.remove();
    },
  };

  return api;
}