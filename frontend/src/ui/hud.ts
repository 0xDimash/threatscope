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
  selectAsset(id: string | null, risk?: RiskState | null, bound?: boolean | null): void;
  updateRisk(assetId: string, risk: RiskState): void;
  /** Asset whose detail card is open, or null. */
  selectedId(): string | null;
  dispose(): void;
}

const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

function timeLabel(ts: string): string {
  try {
    const d = new Date(ts);
    const diff = Math.max(0, (Date.now() - d.getTime()) / 1000);
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
    timeEl.textContent = timeLabel(ev.ts);
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
    selectAsset(id: string | null, risk: RiskState | null = null, bound: boolean | null = null): void {
      currentId = id;
      detail.textContent = '';
      if (!id) {
        detail.hidden = true;
        return;
      }
      detail.hidden = false;

      const head = document.createElement('div');
      head.className = 'hud-detail-head';
      const title = document.createElement('strong');
      title.textContent = id;
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'hud-detail-close';
      close.textContent = '×';
      close.setAttribute('aria-label', 'Close detail');
      close.addEventListener('click', () => {
        detail.hidden = true;
        detail.textContent = '';
        currentId = null;
      });
      head.append(title, close);

      const body = document.createElement('div');
      body.className = 'hud-detail-body';
      const row = (label: string, value: string): void => {
        const line = document.createElement('div');
        line.className = 'hud-detail-row';
        const key = document.createElement('span');
        key.textContent = label;
        const val = document.createElement('span');
        val.textContent = value;
        line.append(key, val);
        body.append(line);
      };

      if (bound === false) {
        row('asset', 'Not bound to an asset');
      } else if (risk) {
        row('risk', risk.risk > 0 ? `${risk.risk.toFixed(1)} / 100` : 'score pending');
        row('state', risk.state);
        row('events 24h', String(risk.events_24h));
        row('top types', risk.top_types.join(', ') || '—');
      } else {
        row('risk', 'no risk data');
      }

      detail.append(head, body);
    },
    updateRisk(assetId: string, risk: RiskState): void {
      if (currentId !== assetId || detail.hidden) {
        return;
      }
      api.selectAsset(assetId, risk, true);
    },
    selectedId(): string | null {
      return detail.hidden ? null : currentId;
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