/* Netopology UI prototype (phase A4, v2: floating layout, card nodes). Plain JS, sample data, no API. */
'use strict';

(() => {
  // ───────────────────────── helpers ─────────────────────────
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  const ICONS = {
    list: '<path d="M9 6h12M9 12h12M9 18h12"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>',
    zap: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/>',
    puzzle: '<path d="M9 3h6v3a2 2 0 1 0 4 0h2v6h-2a2 2 0 1 0 0 4h2v5h-6v-2a2 2 0 1 0-4 0v2H3v-6h2a2 2 0 1 0 0-4H3V3h6z"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8"/><path d="M18 14.6a6.5 6.5 0 0 1 3.5 5.4"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.6M8.2 13.2l7.6 4.6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    maximize: '<path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/>',
    pointer: '<path d="m5 3 6.5 17 2.4-7.1L21 10.5 5 3z"/>',
    hand: '<path d="M8 13V6a1.5 1.5 0 0 1 3 0v5M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11V6.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-.5a6 6 0 0 1-5-2.7L3.3 15.2a1.5 1.5 0 0 1 2.5-1.7L8 16"/>',
    node: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 9v6M9 12h6"/>',
    area: '<rect x="3" y="3" width="18" height="18" rx="3" stroke-dasharray="3 3"/>',
    link: '<circle cx="5" cy="19" r="2"/><circle cx="19" cy="5" r="2"/><path d="M6.5 17.5 17.5 6.5"/>',
    note: '<path d="M5 3h14v12l-6 6H5z"/><path d="M13 21v-6h6"/>',
    type: '<path d="M5 7V4h14v3M12 4v16M9 20h6"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
    redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="m3 3 18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7a9.6 9.6 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3z"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    chevDown: '<path d="m6 9 6 6 6-6"/>',
    chevRight: '<path d="m9 6 6 6-6 6"/>',
    chevLeft: '<path d="m15 6-6 6 6 6"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
    enter: '<path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5M10 17l5-5-5-5M15 12H3"/>',
    collapse: '<path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/>',
    expand: '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>',
    checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
    alert: '<path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4M12 17h.01"/>',
    xCircle: '<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>',
    circleDashed: '<circle cx="12" cy="12" r="8.5" stroke-dasharray="3.2 3.2"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3M15 8l2 2"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
    sliders: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
    activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
    layers: '<path d="M12 3 3 8l9 5 9-5-9-5z"/><path d="m3 13 9 5 9-5"/>',
    // node icons
    router: '<rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 16.5h.01M11 16.5h.01"/><path d="M14.5 9.5a3.5 3.5 0 0 1 5 0M12.5 7a6.5 6.5 0 0 1 9 0"/>',
    server: '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>',
    shuffle: '<path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
    vm: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
    gamepad: '<rect x="2" y="7" width="20" height="11" rx="4"/><path d="M7 11v3M5.5 12.5h3M15 12h.01M18 13.5h.01"/>',
    cloud: '<path d="M7 18h10a4 4 0 0 0 .5-8 6 6 0 0 0-11.6 1.5A3.3 3.3 0 0 0 7 18z"/>',
    group: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    dns: '<path d="M4 7h16M4 12h16M4 17h10"/><circle cx="18" cy="17" r="2"/>',
  };
  const icon = (n, cls = 'icon') =>
    `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ''}</svg>`;

  // ───────────────────────── vocabulary ─────────────────────────
  const CATS = { network: 'Network', compute: 'Compute', service: 'Service', storage: 'Storage', external: 'External', generic: 'Generic' };
  // category = SHAPE + BORDER (nodes are all the same gray)
  const SHAPE_OF = {
    network: { shape: 'square', border: 'solid', label: 'Square box' },
    compute: { shape: 'square', border: 'double', label: 'Square box, double border' },
    service: { shape: 'rounded', border: 'solid', label: 'Rounded box' },
    storage: { shape: 'rounded', border: 'double', label: 'Rounded box, double border' },
    external: { shape: 'cloud', border: null, label: 'Cloud' },
    generic: { shape: 'rounded', border: 'dashed', label: 'Rounded box, dashed border' },
  };
  const LINK_KINDS = { physical: 'Physical cable', vpn_tunnel: 'VPN tunnel', proxy_route: 'Proxy route', dns_dependency: 'DNS dependency', storage_mount: 'Storage mount', logical: 'Logical' };
  const DIRECTED = new Set(['proxy_route', 'dns_dependency']);
  const STATUS_LABEL = { healthy: 'Healthy', degraded: 'Degraded', down: 'Down', unknown: 'Unknown' };
  const STATUS_ICON = { healthy: 'checkCircle', degraded: 'alert', down: 'xCircle', unknown: 'circleDashed' };
  const SEVERITY = ['healthy', 'unknown', 'degraded', 'down'];
  const CLOUD_SHAPES = '<rect x="0" y="36" width="100" height="64" rx="12" ry="24"/><ellipse cx="28" cy="44" rx="20" ry="30"/><ellipse cx="56" cy="31" rx="25" ry="30"/><ellipse cx="80" cy="46" rx="17" ry="26"/>';
  const CLOUD_SVG = `<svg class="cloud-bg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><g class="outline">${CLOUD_SHAPES}</g><g class="fill">${CLOUD_SHAPES}</g></svg>`;

  // ───────────────────────── sample data (the author's own homelab) ─────────────────────────
  const ip = (v) => ({ key: 'ip', label: 'IP address', value: v, sensitive: true });
  const NODES = {
    internet: { name: 'Internet', slug: 'internet', cat: 'external', icon: 'globe', typeLabel: 'Internet', desc: 'Public network', area: null, status: 'healthy', fields: [] },
    cloudflare: { name: 'Cloudflare', slug: 'cloudflare', cat: 'external', icon: 'cloud', typeLabel: 'DNS & tunnel', desc: 'Zone example.com', area: null, status: 'healthy',
      fields: [{ key: 'zone', label: 'Zone', value: 'example.com', sensitive: false }, { key: 'account', label: 'Account ID', value: '9f2c41ab0e77', sensitive: true }] },
    router: { name: 'Router', slug: 'router', cat: 'network', icon: 'router', typeLabel: 'Router · OPNsense', desc: 'Gateway for Main LAN', area: 'main', status: 'healthy',
      fields: [ip('192.168.1.1'), { key: 'model', label: 'Model', value: 'OPNsense 24.7', sensitive: false }, { key: 'wan', label: 'WAN IP', value: '203.0.113.24', sensitive: true }],
      notes: [{ title: 'Reboot window', body: 'Ask before rebooting: family streams on Fridays.', sensitive: false }, { title: 'Admin access', body: 'Credentials live in the vault entry "router-admin".', sensitive: true }] },
    npm: { name: 'Nginx Proxy Manager', slug: 'npm-main', cat: 'service', icon: 'shuffle', typeLabel: 'Reverse proxy', desc: 'Routes *.example.com', area: 'main', status: 'healthy',
      fields: [ip('192.168.1.20'), { key: 'admin_port', label: 'Admin port', value: '81', sensitive: false }],
      notes: [{ title: 'Certificates', body: 'Wildcard cert for *.example.com renews via DNS challenge.', sensitive: false }] },
    dokploy: { name: 'Dokploy host', slug: 'dokploy', cat: 'compute', icon: 'server', typeLabel: 'Docker host', desc: 'Apps via Dokploy + Traefik', area: 'main', status: 'degraded',
      msg: 'Traefik container restarting (3x in 10 min)', fields: [ip('192.168.1.30'), { key: 'size', label: 'Size', value: '8 vCPU / 32 GB', sensitive: false }] },
    truenas: { name: 'TrueNAS', slug: 'truenas', cat: 'storage', icon: 'database', typeLabel: 'NAS', desc: 'tank · 12 TB · 61% used', area: 'main', status: 'healthy',
      fields: [ip('192.168.1.40'), { key: 'pool', label: 'Pool', value: 'tank · 12 TB', sensitive: false }] },
    dns: { name: 'Local DNS', slug: 'local-dns', cat: 'service', icon: 'dns', typeLabel: 'DNS server', desc: 'AdGuard Home', area: 'main', status: 'healthy',
      fields: [ip('192.168.1.53')] },
    l2tp: { name: 'L2TP gateway', slug: 'l2tp-gw', cat: 'network', icon: 'router', typeLabel: 'VPN gateway', desc: 'L2TP endpoint', area: 'remote', status: 'healthy', fields: [ip('10.20.0.1')] },
    ptero: { name: 'Pterodactyl', slug: 'pterodactyl', cat: 'service', icon: 'gamepad', typeLabel: 'Game panel', desc: 'Manages game servers', area: 'remote', status: 'healthy', fields: [ip('10.20.0.10')] },
    vm1: { name: 'Game VM 1', slug: 'game-vm-1', cat: 'compute', icon: 'vm', typeLabel: 'Virtual machine', desc: 'Minecraft', area: 'remote', status: 'healthy', fields: [ip('10.20.0.21')] },
    vm2: { name: 'Game VM 2', slug: 'game-vm-2', cat: 'compute', icon: 'vm', typeLabel: 'Virtual machine', desc: 'Valheim', area: 'remote', status: 'down', msg: 'No response for 4 min', fields: [ip('10.20.0.22')] },
    backup: { name: 'Backup NAS', slug: 'backup-nas', cat: 'storage', icon: 'database', typeLabel: 'NAS', desc: 'Offsite backups', area: 'remote', status: 'unknown', msg: 'Never checked', fields: [] },
  };
  const AREAS = {
    main: { name: 'Main LAN', color: 'yellow', kind: 'network', cidr: '192.168.1.0/24' },
    remote: { name: 'Remote site (L2TP)', color: 'teal', kind: 'site', cidr: '10.20.0.0/24' },
  };
  let LINKS = [
    { id: 'l1', s: 'internet', t: 'router', kind: 'physical', label: 'WAN' },
    { id: 'l18', s: 'internet', t: 'cloudflare', kind: 'proxy_route', label: 'HTTPS' },
    { id: 'l2', s: 'cloudflare', t: 'npm', kind: 'proxy_route' },
    { id: 'l3', s: 'router', t: 'npm', kind: 'physical' },
    { id: 'l4', s: 'router', t: 'dokploy', kind: 'physical' },
    { id: 'l5', s: 'router', t: 'truenas', kind: 'physical' },
    { id: 'l6', s: 'router', t: 'dns', kind: 'physical' },
    { id: 'l7', s: 'npm', t: 'dokploy', kind: 'proxy_route' },
    { id: 'l8', s: 'dokploy', t: 'truenas', kind: 'storage_mount', label: 'NFS' },
    { id: 'l9', s: 'npm', t: 'dns', kind: 'dns_dependency' },
    { id: 'l10', s: 'router', t: 'l2tp', kind: 'vpn_tunnel', label: 'L2TP' },
    { id: 'l11', s: 'l2tp', t: 'ptero', kind: 'physical' },
    { id: 'l12', s: 'l2tp', t: 'vm1', kind: 'physical' },
    { id: 'l13', s: 'l2tp', t: 'vm2', kind: 'physical', down: true },
    { id: 'l16', s: 'l2tp', t: 'backup', kind: 'physical' },
    { id: 'l14', s: 'ptero', t: 'vm1', kind: 'logical' },
  ];
  // canvases are VIEWS: the same nodes, different placements and hidden link kinds. Node x/y = card centre.
  const CANVASES = {
    physical: {
      name: 'Physical', kind: 'tab', protected: true, hidden: [],
      nodes: { cloudflare: { x: 130, y: 120 }, internet: { x: 130, y: 300 }, npm: { x: 450, y: 150 }, router: { x: 450, y: 300 }, dns: { x: 810, y: 150 }, dokploy: { x: 810, y: 300 }, truenas: { x: 810, y: 450 } },
      areas: { main: { x: 290, y: 40, w: 680, h: 520, collapsed: false }, remote: { x: 330, y: 640, collapsed: true } },
      stickies: [{ x: 1010, y: 60, w: 230, color: 'yellow', text: 'Ask before rebooting the router: family streams on Fridays.' }],
    },
    services: {
      name: 'Services', kind: 'tab', hidden: ['physical'],
      nodes: { cloudflare: { x: 150, y: 200 }, npm: { x: 480, y: 200 }, dokploy: { x: 820, y: 120 }, dns: { x: 480, y: 400 }, truenas: { x: 820, y: 330 } },
      areas: {}, stickies: [],
    },
    traffic: {
      name: 'Public traffic path', kind: 'tab', hidden: ['physical', 'storage_mount', 'dns_dependency'],
      nodes: { internet: { x: 130, y: 200 }, cloudflare: { x: 440, y: 200 }, npm: { x: 750, y: 200 }, dokploy: { x: 1060, y: 200 } },
      areas: {}, stickies: [],
    },
    'area:remote': {
      name: 'Remote site (L2TP)', kind: 'area', areaId: 'remote', hidden: [],
      nodes: { l2tp: { x: 420, y: 300 }, ptero: { x: 780, y: 140 }, vm1: { x: 780, y: 300 }, vm2: { x: 780, y: 460 }, backup: { x: 420, y: 470 } },
      ghosts: { router: { x: 110, y: 300 } }, areas: {}, stickies: [],
    },
  };
  // where an area's nodes go when its box is expanded (relative to the box)
  const EXPANDED_PRESET = { remote: { w: 720, h: 470, nodes: { l2tp: [160, 210], ptero: [520, 110], vm1: [520, 235], vm2: [520, 360], backup: [160, 360] } } };

  const MEMBERS = [
    { init: 'AL', name: 'Alice', user: 'alice', role: 'owner', sens: true, canvases: [], signin: ['Password', 'Google'], you: true },
    { init: 'BO', name: 'Bob', user: 'bob', role: 'admin', sens: true, canvases: [], signin: ['Discord'] },
    { init: 'CH', name: 'Chen', user: 'chen', role: 'editor', sens: false, canvases: ['Physical', 'Services'], signin: ['Password'] },
    { init: 'DA', name: 'Dana', user: 'dana', role: 'viewer', sens: true, canvases: [], signin: ['Google'] },
    { init: 'EV', name: 'Eve', user: 'eve', role: 'viewer', sens: false, canvases: [], signin: ['Password', 'Discord'] },
  ];

  // ───────────────────────── state ─────────────────────────
  const state = {
    route: 'canvas',
    role: 'owner',
    theme: 'light',
    canvas: 'physical',
    selected: null,
    panelTab: 'details',
    view: {},
    linkHidden: {},
    lpCollapsed: false,
    fold: { canvases: true, monitor: true },
    legendOpen: false,
    palette: null, // { q, index }
    setupStep: 1,
    loginError: false,
    invQuery: '',
    invCat: null,
    pendingSelect: null,
    shareLinks: [
      { label: 'Family', hasPassword: true, expires: 'in 6 days', uses: 12 },
      { label: 'Discord friends', hasPassword: false, expires: 'never', uses: 3 },
    ],
    shareCreated: null,
  };

  const effRole = () => (state.route.startsWith('guest') ? 'guest' : state.role);
  const canEdit = () => ['owner', 'editor'].includes(effRole());
  const canSens = () => effRole() === 'owner';
  const visibleTabs = () => (state.role === 'editor' ? ['physical', 'services'] : ['physical', 'services', 'traffic']);
  const isSel = (type, id) => state.selected?.type === type && state.selected.id === id;
  const viewOf = (cid) => (state.view[cid] ||= { x: 0, y: 0, z: 1, fitted: false });
  const rollup = (aid) => SEVERITY[Math.max(0, ...Object.values(NODES).filter((n) => n.area === aid).map((n) => SEVERITY.indexOf(n.status)))];
  const placedOn = (id) => Object.entries(CANVASES).filter(([, c]) => c.nodes[id]).map(([cid]) => cid);

  const statusChip = (s, label = STATUS_LABEL[s]) => `<span class="status ${s}">${icon(STATUS_ICON[s], 'icon sm')}${esc(label)}</span>`;
  function toast(msg) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    $('#toast-root').append(el);
    setTimeout(() => el.remove(), 3800);
  }
  function linkSample(kind, w = 34) {
    const y = 6;
    const line = kind === 'storage_mount'
      ? `<path class="edge-casing" d="M2 ${y}H${w - 2}"/><path class="edge-core" style="stroke:var(--surface)" d="M2 ${y}H${w - 2}"/>`
      : `<path class="edge ${kind}" d="M2 ${y}H${w - 6}"/>${DIRECTED.has(kind) ? `<path d="M${w - 8} ${y - 4} ${w - 2} ${y} ${w - 8} ${y + 4}z" style="fill:var(--link-line)"/>` : ''}`;
    return `<svg width="${w}" height="12" aria-hidden="true">${line}</svg>`;
  }
  function shapeSample(cat) {
    const s = SHAPE_OF[cat];
    if (s.shape === 'cloud') return `<svg viewBox="0 0 100 100" preserveAspectRatio="none" class="cloud-bg" style="position:static;width:30px;height:20px;filter:none"><g class="outline">${CLOUD_SHAPES}</g><g class="fill">${CLOUD_SHAPES}</g></svg>`;
    return `<i class="shape-${s.shape} border-${s.border}"></i>`;
  }

  // ───────────────────────── prototype bar (not product UI) ─────────────────────────
  function renderProtoBar() {
    const screens = [['setup', 'First run'], ['login', 'Sign in'], ['canvas', 'Canvas'], ['area', 'Inside an area'], ['inventory', 'Inventory'], ['members', 'Members'], ['guest-locked', 'Guest link']];
    const r = state.route;
    $('#proto-bar').innerHTML = `<b>PROTOTYPE</b>
      <span class="group">${screens.map(([k, l]) => `<button data-go="${k}" aria-pressed="${r === k || (k === 'guest-locked' && r === 'guest')}">${l}</button>`).join('')}</span>
      <span class="group">${['owner', 'editor', 'viewer'].map((x) => `<button data-role="${x}" aria-pressed="${state.role === x}">${cap(x)}</button>`).join('')}</span>
      <span class="group">${['light', 'dark'].map((x) => `<button data-theme-set="${x}" aria-pressed="${state.theme === x}">${cap(x)}</button>`).join('')}</span>`;
  }

  // ───────────────────────── canvas content (HTML cards + SVG edges) ─────────────────────────
  function nodeCard(id, p) {
    const n = NODES[id];
    const s = SHAPE_OF[n.cat];
    const cls = ['node', `shape-${s.shape}`, s.border ? `border-${s.border}` : '', n.status === 'down' ? 'is-down' : '', isSel('node', id) ? 'selected' : ''].join(' ');
    return `<div class="${cls}" data-node="${id}" style="left:${p.x}px;top:${p.y}px" title="${esc(n.name)}: ${STATUS_LABEL[n.status]}">
      ${s.shape === 'cloud' ? CLOUD_SVG : ''}
      <div class="node-head"><span class="node-icon">${icon(n.icon, 'icon lg')}</span>
        <div class="node-titles"><div class="node-title">${esc(n.name)}</div><div class="node-type">${esc(n.typeLabel)}</div></div>
        <span class="node-status ${n.status}" aria-label="${STATUS_LABEL[n.status]}">${icon(STATUS_ICON[n.status], 'icon sm')}</span></div>
      ${n.desc ? `<div class="node-desc">${esc(n.desc)}</div>` : ''}
    </div>`;
  }

  function areaHTML(aid, a) {
    const A = AREAS[aid];
    const role = effRole();
    const h = rollup(aid);
    const members = Object.values(NODES).filter((n) => n.area === aid);
    const bad = members.filter((n) => n.status === 'down').length;
    const warn = members.filter((n) => n.status === 'degraded').length;
    const summary = bad ? `${bad} down` : warn ? `${warn} degraded` : 'All healthy';
    const sel = isSel('area', aid) ? ' selected' : '';
    if (a.collapsed) {
      return `<div class="area-card area-${A.color}${sel}" data-area="${aid}" data-area-card="${aid}" style="left:${a.x}px;top:${a.y}px" title="${esc(A.name)}${role === 'guest' ? '' : ': double-click to enter'}">
        <div class="node-head"><span class="node-icon">${icon('group', 'icon lg')}</span>
          <div class="node-titles"><div class="node-title">${esc(A.name)}</div><div class="node-type">Area · ${members.length} nodes</div></div>
          <span class="node-status ${h}">${icon(STATUS_ICON[h], 'icon sm')}</span></div>
        <div class="node-desc">${summary}${role === 'guest' ? '' : ' · <span class="enter-hint">double-click to enter</span>'}</div>
      </div>`;
    }
    const cidr = role === 'guest' ? '' : canSens() ? A.cidr : '•••.•••.•.•/••';
    return `<div class="area-box area-${A.color}${sel}" data-area="${aid}" style="left:${a.x}px;top:${a.y}px;width:${a.w}px;height:${a.h}px">
      <div class="area-head"><span class="swatch"></span><b>${esc(A.name)}</b><span class="mono faint">${esc(cidr)}</span>
        <span class="end">${statusChip(h)}${canEdit() ? `<button class="icon-btn sm" data-action="toggle-collapse" data-area-id="${aid}" title="Collapse into a block" aria-label="Collapse area">${icon('collapse', 'icon sm')}</button>` : ''}</span></div>
    </div>`;
  }

  function canvasContent(cid) {
    const c = CANVASES[cid];
    const areas = Object.entries(c.areas || {});
    return `${areas.filter(([, a]) => !a.collapsed).map(([aid, a]) => areaHTML(aid, a)).join('')}
      <svg class="edges" id="edges"></svg>
      ${areas.filter(([, a]) => a.collapsed).map(([aid, a]) => areaHTML(aid, a)).join('')}
      ${Object.entries(c.ghosts || {}).map(([gid, g]) => `<div class="ghost-card" data-ghost="${gid}" data-go="canvas" style="left:${g.x}px;top:${g.y}px" title="Outside this area. Click to go back.">${icon('chevLeft', 'icon sm')}${esc(NODES[gid].name)} <span class="faint">· in ${esc(AREAS[NODES[gid].area]?.name || 'no area')}</span></div>`).join('')}
      ${(c.stickies || []).map((s) => `<div class="sticky ${s.color}" style="left:${s.x}px;top:${s.y}px;width:${s.w}px">${esc(s.text)}</div>`).join('')}
      ${Object.entries(c.nodes).filter(([id]) => NODES[id]).map(([id, p]) => nodeCard(id, p)).join('')}`;
  }

  // world-space rectangles of everything a link can attach to (measured from the DOM)
  let RECTS = {};
  function measure(vp) {
    const c = CANVASES[state.canvas];
    RECTS = {};
    for (const el of $$('[data-node]', vp)) {
      const p = c.nodes[el.dataset.node];
      RECTS[`n:${el.dataset.node}`] = { x: p.x - el.offsetWidth / 2, y: p.y - el.offsetHeight / 2, w: el.offsetWidth, h: el.offsetHeight };
    }
    for (const el of $$('[data-area-card]', vp)) {
      const a = c.areas[el.dataset.areaCard];
      RECTS[`a:${el.dataset.areaCard}`] = { x: a.x, y: a.y, w: el.offsetWidth, h: el.offsetHeight };
    }
    for (const el of $$('[data-ghost]', vp)) {
      const g = c.ghosts[el.dataset.ghost];
      RECTS[`n:${el.dataset.ghost}`] = { x: g.x - el.offsetWidth / 2, y: g.y - el.offsetHeight / 2, w: el.offsetWidth, h: el.offsetHeight };
    }
  }

  // which rectangle a node's links attach to on this canvas: its card, its collapsed area, or a ghost
  function anchorOf(nodeId) {
    const c = CANVASES[state.canvas];
    if (RECTS[`n:${nodeId}`]) return { key: `n:${nodeId}`, r: RECTS[`n:${nodeId}`] };
    const aid = NODES[nodeId]?.area;
    if (aid && c.areas?.[aid]?.collapsed && RECTS[`a:${aid}`]) return { key: `a:${aid}`, r: RECTS[`a:${aid}`] };
    return null;
  }

  function visibleLinks() {
    const c = CANVASES[state.canvas];
    const hiddenKinds = new Set(c.hidden || []);
    const hiddenOne = state.linkHidden[state.canvas] || new Set();
    const seen = new Set();
    const out = [];
    for (const l of LINKS) {
      const a = anchorOf(l.s);
      const b = anchorOf(l.t);
      if (!a || !b || a.key === b.key) continue;
      if (c.ghosts?.[l.s] && c.ghosts?.[l.t]) continue;
      if (hiddenKinds.has(l.kind) || hiddenOne.has(l.id)) continue;
      const key = `${a.key}|${b.key}|${l.kind}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ...l, ra: a.r, rb: b.r });
    }
    return out;
  }

  // smooth curve from the side of one card to the facing side of the other
  function edgeGeometry(ra, rb) {
    const ca = { x: ra.x + ra.w / 2, y: ra.y + ra.h / 2 };
    const cb = { x: rb.x + rb.w / 2, y: rb.y + rb.h / 2 };
    const dx = cb.x - ca.x;
    const dy = cb.y - ca.y;
    let s, e, c1, c2;
    if (Math.abs(dx) > Math.abs(dy)) {
      const sg = Math.sign(dx) || 1;
      s = { x: sg > 0 ? ra.x + ra.w : ra.x, y: ca.y };
      e = { x: sg > 0 ? rb.x : rb.x + rb.w, y: cb.y };
      const k = Math.max(30, Math.abs(e.x - s.x) / 2);
      c1 = { x: s.x + sg * k, y: s.y };
      c2 = { x: e.x - sg * k, y: e.y };
    } else {
      const sg = Math.sign(dy) || 1;
      s = { x: ca.x, y: sg > 0 ? ra.y + ra.h : ra.y };
      e = { x: cb.x, y: sg > 0 ? rb.y : rb.y + rb.h };
      const k = Math.max(30, Math.abs(e.y - s.y) / 2);
      c1 = { x: s.x, y: s.y + sg * k };
      c2 = { x: e.x, y: e.y - sg * k };
    }
    const f = (v) => v.toFixed(1);
    return {
      d: `M${f(s.x)} ${f(s.y)}C${f(c1.x)} ${f(c1.y)} ${f(c2.x)} ${f(c2.y)} ${f(e.x)} ${f(e.y)}`,
      s, e,
      mid: { x: (s.x + 3 * c1.x + 3 * c2.x + e.x) / 8, y: (s.y + 3 * c1.y + 3 * c2.y + e.y) / 8 },
    };
  }

  function drawEdges() {
    const svg = $('#edges');
    if (!svg) return;
    const parts = visibleLinks().map((l) => {
      const g = edgeGeometry(l.ra, l.rb);
      const sel = isSel('link', l.id) ? ' selected' : '';
      const directed = DIRECTED.has(l.kind);
      let s = l.kind === 'storage_mount'
        ? `<path class="edge-casing${sel}" d="${g.d}"/><path class="edge-core" d="${g.d}"/>`
        : `<path class="edge ${l.kind}${l.down ? ' down' : ''}${sel}" d="${g.d}" ${directed ? 'marker-end="url(#arrow)"' : ''}/>`;
      s += `<circle class="edge-port" cx="${g.s.x}" cy="${g.s.y}" r="3"/>`;
      if (!directed) s += `<circle class="edge-port" cx="${g.e.x}" cy="${g.e.y}" r="3"/>`;
      if (l.label) {
        const w = l.label.length * 6.4 + 12;
        s += `<g class="edge-label"><rect x="${g.mid.x - w / 2}" y="${g.mid.y - 9}" width="${w}" height="18" rx="9"/><text x="${g.mid.x}" y="${g.mid.y + 3.5}">${esc(l.label)}</text></g>`;
      }
      s += `<path class="edge-hit" d="${g.d}" data-link="${l.id}"><title>${esc(LINK_KINDS[l.kind])}: ${esc(NODES[l.s]?.name)} → ${esc(NODES[l.t]?.name)}</title></path>`;
      return `<g>${s}</g>`;
    });
    svg.innerHTML = `<defs><marker id="arrow" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z" style="fill:var(--link-line)"/></marker></defs>${parts.join('')}`;
  }

  function applyView() {
    const wrap = $('#canvas-wrap');
    const vp = $('#viewport');
    if (!wrap || !vp) return;
    const v = viewOf(state.canvas);
    vp.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.z})`;
    wrap.style.backgroundSize = `${20 * v.z}px ${20 * v.z}px`;
    wrap.style.backgroundPosition = `${v.x}px ${v.y}px`;
    const z = $('#zoom-label');
    if (z) z.textContent = `${Math.round(v.z * 100)}%`;
  }

  function fitView() {
    const wrap = $('#canvas-wrap');
    const c = CANVASES[state.canvas];
    const v = viewOf(state.canvas);
    const boxes = Object.values(RECTS);
    for (const a of Object.values(c.areas || {})) if (!a.collapsed) boxes.push({ x: a.x, y: a.y, w: a.w, h: a.h });
    for (const s of c.stickies || []) boxes.push({ x: s.x, y: s.y, w: s.w, h: 60 });
    if (!boxes.length) return;
    const minX = Math.min(...boxes.map((b) => b.x)), minY = Math.min(...boxes.map((b) => b.y));
    const maxX = Math.max(...boxes.map((b) => b.x + b.w)), maxY = Math.max(...boxes.map((b) => b.y + b.h));
    // leave room for the floating panels
    const left = state.route === 'guest' || state.lpCollapsed ? 24 : 270;
    const right = state.selected ? 370 : 24;
    const W = wrap.clientWidth - left - right;
    const H = wrap.clientHeight - 140;
    const z = Math.min(1, Math.max(0.35, Math.min(W / (maxX - minX), H / (maxY - minY))));
    v.z = z;
    v.x = left + (W - (maxX - minX) * z) / 2 - minX * z;
    v.y = 70 + (H - (maxY - minY) * z) / 2 - minY * z;
    v.fitted = true;
  }

  function redrawCanvas() {
    const vp = $('#viewport');
    if (!vp) return;
    vp.innerHTML = canvasContent(state.canvas);
    measure(vp);
    drawEdges();
    applyView();
  }

  // ───────────────────────── canvas interaction ─────────────────────────
  function mountCanvas() {
    const wrap = $('#canvas-wrap');
    if (!wrap) return;
    const cid = state.canvas;
    const v = viewOf(cid);
    redrawCanvas();
    if (!v.fitted) { fitView(); applyView(); }

    let drag = null;
    let lastArea = { id: null, t: 0 };
    const world = (e) => {
      const r = wrap.getBoundingClientRect();
      return { x: (e.clientX - r.left - v.x) / v.z, y: (e.clientY - r.top - v.y) / v.z };
    };

    wrap.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('button')) return;
      const c = CANVASES[cid];
      const nodeEl = e.target.closest('[data-node]');
      const areaEl = e.target.closest('[data-area]');
      const linkEl = e.target.closest('[data-link]');
      if (e.target.closest('[data-ghost]')) return;
      if (nodeEl) {
        const id = nodeEl.dataset.node;
        select('node', id);
        if (canEdit()) { const p = world(e); drag = { type: 'node', id, ox: p.x - c.nodes[id].x, oy: p.y - c.nodes[id].y }; }
      } else if (areaEl) {
        const aid = areaEl.dataset.area;
        const now = performance.now();
        if (lastArea.id === aid && now - lastArea.t < 400 && c.areas[aid].collapsed) { enterArea(aid); return; }
        lastArea = { id: aid, t: now };
        select('area', aid);
        if (canEdit()) drag = { type: 'area', id: aid, last: world(e) };
      } else if (linkEl) {
        select('link', linkEl.dataset.link);
      } else {
        if (state.selected) { state.selected = null; renderChrome(); redrawCanvas(); }
        drag = { type: 'pan', sx: e.clientX, sy: e.clientY, vx: v.x, vy: v.y };
        wrap.classList.add('panning');
      }
      if (drag) { try { wrap.setPointerCapture(e.pointerId); } catch { /* synthetic event */ } }
    });

    wrap.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const c = CANVASES[cid];
      if (drag.type === 'pan') {
        v.x = drag.vx + (e.clientX - drag.sx);
        v.y = drag.vy + (e.clientY - drag.sy);
        applyView();
        return;
      }
      const p = world(e);
      if (drag.type === 'node') {
        const np = c.nodes[drag.id];
        np.x = Math.round(p.x - drag.ox);
        np.y = Math.round(p.y - drag.oy);
        const el = $(`[data-node="${drag.id}"]`);
        if (el) { el.style.left = `${np.x}px`; el.style.top = `${np.y}px`; el.classList.add('dragging'); }
        const r = RECTS[`n:${drag.id}`];
        if (r) { r.x = np.x - r.w / 2; r.y = np.y - r.h / 2; }
      } else if (drag.type === 'area') {
        const dx = p.x - drag.last.x;
        const dy = p.y - drag.last.y;
        drag.last = p;
        const a = c.areas[drag.id];
        a.x += dx; a.y += dy;
        const ael = $(`[data-area="${drag.id}"]`);
        if (ael) { ael.style.left = `${a.x}px`; ael.style.top = `${a.y}px`; }
        if (RECTS[`a:${drag.id}`]) { RECTS[`a:${drag.id}`].x = a.x; RECTS[`a:${drag.id}`].y = a.y; }
        if (!a.collapsed) {
          for (const [nid, np] of Object.entries(c.nodes)) {
            if (NODES[nid]?.area !== drag.id) continue;
            np.x += dx; np.y += dy;
            const el = $(`[data-node="${nid}"]`);
            if (el) { el.style.left = `${np.x}px`; el.style.top = `${np.y}px`; }
            const r = RECTS[`n:${nid}`];
            if (r) { r.x += dx; r.y += dy; }
          }
        }
      }
      drag.moved = true;
      drawEdges();
    });

    const end = () => {
      if (drag?.type === 'node') { $(`[data-node="${drag.id}"]`)?.classList.remove('dragging'); if (drag.moved) checkAreaDrop(drag.id); }
      drag = null;
      wrap.classList.remove('panning');
    };
    wrap.addEventListener('pointerup', end);
    wrap.addEventListener('pointercancel', end);
    wrap.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = wrap.getBoundingClientRect();
      zoomAt(v, e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.1 : 1 / 1.1);
      applyView();
    }, { passive: false });
  }

  function zoomAt(v, mx, my, f) {
    const z1 = Math.min(2, Math.max(0.3, v.z * f));
    v.x = mx - ((mx - v.x) * z1) / v.z;
    v.y = my - ((my - v.y) * z1) / v.z;
    v.z = z1;
  }

  // dropping a node into another area's box changes its area in the INVENTORY (every canvas)
  function checkAreaDrop(id) {
    const c = CANVASES[state.canvas];
    const p = c.nodes[id];
    const n = NODES[id];
    let target = null;
    for (const [aid, a] of Object.entries(c.areas || {})) {
      if (!a.collapsed && p.x > a.x && p.x < a.x + a.w && p.y > a.y && p.y < a.y + a.h) target = aid;
    }
    const inOwnBox = n.area && c.areas?.[n.area] && !c.areas[n.area].collapsed;
    if (target && target !== n.area) {
      n.area = target;
      toast(`${n.name} moved into ${AREAS[target].name}. Its area changed in the inventory, so it moves on every canvas.`);
    } else if (!target && inOwnBox) {
      const old = AREAS[n.area].name;
      n.area = null;
      toast(`${n.name} moved out of ${old}. It is now in no area, on every canvas.`);
    } else return;
    renderChrome();
    redrawCanvas();
  }

  function toggleCollapse(aid) {
    const c = CANVASES[state.canvas];
    const a = c.areas[aid];
    if (!a) return;
    if (a.collapsed) {
      const preset = a.stash || (EXPANDED_PRESET[aid] && {
        w: EXPANDED_PRESET[aid].w, h: EXPANDED_PRESET[aid].h,
        nodes: Object.fromEntries(Object.entries(EXPANDED_PRESET[aid].nodes).map(([k, [x, y]]) => [k, { x: a.x + x, y: a.y + y }])),
      });
      a.collapsed = false;
      if (preset) {
        a.w = preset.w; a.h = preset.h;
        for (const [nid, np] of Object.entries(preset.nodes)) if (NODES[nid]) c.nodes[nid] = { x: np.x, y: np.y };
      }
      a.stash = null;
    } else {
      const nodes = {};
      for (const [nid, np] of Object.entries(c.nodes)) if (NODES[nid]?.area === aid) { nodes[nid] = { ...np }; delete c.nodes[nid]; }
      a.stash = { w: a.w, h: a.h, nodes };
      a.collapsed = true;
    }
    renderChrome();
    redrawCanvas();
  }

  function enterArea(aid) {
    if (effRole() === 'guest') { toast('Areas cannot be entered from a shared link: guests see this canvas only.'); return; }
    if (aid !== 'remote') { toast('Prototype: only "Remote site (L2TP)" has an inner canvas drawn.'); return; }
    location.hash = 'area';
  }

  function select(type, id) {
    if (!isSel(type, id)) state.panelTab = 'details';
    state.selected = { type, id };
    renderChrome();
    redrawCanvas();
  }

  // ───────────────────────── floating chrome ─────────────────────────
  function leftPanel() {
    if (state.lpCollapsed) {
      return `<div class="float lp-mini"><span class="logo">H</span><button class="icon-btn" data-action="lp-toggle" aria-label="Open side panel" title="Open side panel">${icon('panel')}</button></div>`;
    }
    const cnt = { healthy: 0, degraded: 0, down: 0, unknown: 0 };
    Object.values(NODES).forEach((n) => cnt[n.status]++);
    const attention = Object.entries(NODES).filter(([, n]) => n.status !== 'healthy').sort((a, b) => SEVERITY.indexOf(b[1].status) - SEVERITY.indexOf(a[1].status));
    const tabs = visibleTabs();
    const canvasItem = (id) => {
      const c = CANVASES[id];
      const children = Object.entries(c.areas || {}).filter(([aid]) => CANVASES[`area:${aid}`]).map(([aid]) => {
        const A = AREAS[aid];
        return `<button class="lp-item child area-${A.color}" data-go="area" aria-current="${state.canvas === `area:${aid}`}"><span class="swatch"></span>${esc(A.name)}</button>`;
      }).join('');
      return `<button class="lp-item" data-canvas="${id}" aria-current="${state.canvas === id}">${icon('layers', 'icon sm')}${esc(c.name)}${c.protected ? `<span class="end" title="Protected">${icon('shield', 'icon sm')}</span>` : ''}</button>${children}`;
    };
    return `<aside class="float left-panel" aria-label="Workspace">
      <div class="lp-head">
        <button class="ws-switch" data-toast="Workspace switcher: Home lab, Lab B${state.role === 'owner' ? ', + New workspace' : ''}"><span class="logo">H</span>
          <span style="min-width:0"><div class="name">Home lab</div><div class="sub">${{ owner: 'Owner', editor: 'Editor', viewer: 'Viewer' }[state.role]}</div></span>${icon('chevDown', 'icon sm')}</button>
        <button class="icon-btn" data-action="lp-toggle" aria-label="Hide side panel" title="Hide side panel">${icon('panel')}</button>
      </div>
      <div class="lp-scroll">
        <section class="lp-section">
          <button class="lp-section-head" data-fold="canvases" aria-expanded="${state.fold.canvases}"><span class="chev">${icon('chevDown', 'icon sm')}</span>Canvases<span class="count">${tabs.length}</span></button>
          ${state.fold.canvases ? `<div>${tabs.map(canvasItem).join('')}${state.role === 'owner' ? `<button class="lp-item add" data-toast="New canvas (owner/admin)">${icon('plus', 'icon sm')}New canvas</button>` : ''}</div>` : ''}
        </section>
        <section class="lp-section">
          <button class="lp-section-head" data-fold="monitor" aria-expanded="${state.fold.monitor}"><span class="chev">${icon('chevDown', 'icon sm')}</span>Monitor<span class="count">${cnt.down + cnt.degraded ? `<span class="dot" style="background:var(--status-down)"></span>` : ''}</span></button>
          ${state.fold.monitor ? `<div class="tiles">
              ${['down', 'degraded', 'unknown', 'healthy'].map((s) => `<div class="tile ${s}"><span class="num">${cnt[s]}</span><span class="lbl"><span class="dot" style="background:var(--status-${s})"></span>${STATUS_LABEL[s]}</span></div>`).join('')}
            </div>
            <div class="attn">${attention.map(([id, n]) => `<button class="lp-item" data-jump="${id}"><span class="dot" style="background:var(--status-${n.status});margin-top:5px"></span><span><div class="t">${esc(n.name)}</div><div class="m">${effRole() === 'guest' ? STATUS_LABEL[n.status] : esc(n.msg || STATUS_LABEL[n.status])}</div></span></button>`).join('')}</div>` : ''}
        </section>
      </div>
      <div class="lp-foot"><span class="dot" style="background:var(--status-healthy)"></span>Live<span class="end">Saved just now</span></div>
    </aside>`;
  }

  function topRight() {
    const c = CANVASES[state.canvas];
    const btn = (ic, label, attrs) => `<button class="icon-btn" title="${label}" aria-label="${label}" ${attrs}>${icon(ic)}</button>`;
    return `<div class="top-right">
      <div class="float group">
        ${btn('list', 'Inventory', 'data-go="inventory"')}
        ${btn('users', 'Members', 'data-go="members"')}
        ${btn('zap', 'Workflows (phase C4)', 'disabled')}
        ${btn('puzzle', 'Plugins (phase C3)', 'disabled')}
        ${btn('settings', 'Workspace settings', 'data-toast="Workspace settings (phase B3)"')}
      </div>
      ${state.role === 'owner' && c.kind === 'tab' ? `<button class="btn primary" data-modal="share" style="box-shadow:var(--shadow-lg)">${icon('share', 'icon sm')}Share</button>` : ''}
      <button class="avatar" data-toast="Account: profile, linked sign-ins, sign out">${{ owner: 'AL', editor: 'CH', viewer: 'EV' }[state.role]}</button>
    </div>`;
  }

  const TOOLS = [['select', 'pointer', 'Select (V)'], ['pan', 'hand', 'Pan (H)'], '|', ['node', 'node', 'Add node (N)'], ['area', 'area', 'Add area (A)'], ['link', 'link', 'Draw link (L)'], ['note', 'note', 'Sticky note (T)'], ['text', 'type', 'Text and shapes (S)'], '|', ['undo', 'undo', 'Undo (Ctrl Z)'], ['redo', 'redo', 'Redo (Ctrl Shift Z)']];

  function bottomBar() {
    const role = effRole();
    const tools = canEdit()
      ? TOOLS.map((t) => (t === '|' ? '<span class="sep"></span>' : `<button class="icon-btn" data-tool="${t[0]}" aria-pressed="${t[0] === 'select'}" title="${t[2]}" aria-label="${t[2]}">${icon(t[1])}</button>`)).join('') + '<span class="sep"></span>'
      : `<span class="readonly-pill">${icon('eye', 'icon sm')}${role === 'guest' ? 'Shared view · read-only' : 'View only'}</span><span class="sep"></span>`;
    return `<div class="float bottom-bar" role="toolbar" aria-label="Canvas tools">${tools}
      <button class="icon-btn" data-action="legend" aria-pressed="${state.legendOpen}" title="Legend and link visibility" aria-label="Legend">${icon('sliders')}</button>
      <span class="sep"></span>
      <button class="icon-btn" data-zoom="-1" aria-label="Zoom out">${icon('minus')}</button><span class="zoom" id="zoom-label">100%</span>
      <button class="icon-btn" data-zoom="1" aria-label="Zoom in">${icon('plus')}</button><button class="icon-btn" data-zoom="0" aria-label="Fit to screen" title="Fit">${icon('maximize')}</button>
      ${state.legendOpen ? legendPopover() : ''}
    </div>`;
  }

  function legendPopover() {
    const c = CANVASES[state.canvas];
    const edit = canEdit();
    return `<div class="float popover">
      <div><h3>Links on this canvas</h3>${Object.keys(LINK_KINDS).map((k) => {
        const hidden = (c.hidden || []).includes(k);
        const ctl = edit ? `<button class="icon-btn sm" data-toggle-kind="${k}" aria-pressed="${!hidden}" aria-label="${hidden ? 'Show' : 'Hide'} ${LINK_KINDS[k]}">${icon(hidden ? 'eyeOff' : 'eye', 'icon sm')}</button>` : hidden ? '<span class="faint" style="font-size:12px">hidden</span>' : '';
        return `<div class="legend-row" style="${hidden ? 'opacity:.45' : ''}">${linkSample(k)}<span>${LINK_KINDS[k]}</span><span class="end">${ctl}</span></div>`;
      }).join('')}</div>
      <div><h3>Node shapes</h3><div class="shape-legend">${Object.keys(CATS).map((k) => `<div class="shape-sample">${shapeSample(k)}${CATS[k]}</div>`).join('')}</div></div>
    </div>`;
  }

  // ───────────────────────── detail panel ─────────────────────────
  function detailPanel() {
    const s = state.selected;
    if (!s) return '';
    const role = effRole();
    let html = '';
    if (s.type === 'node' && NODES[s.id]) html = nodePanel(s.id, role);
    else if (s.type === 'area') html = areaPanel(s.id, role);
    else if (s.type === 'link') html = linkPanel(s.id);
    return html ? `<aside class="float detail-panel" aria-label="Details">${html}</aside>` : '';
  }
  const closeBtn = `<button class="icon-btn" data-action="deselect" aria-label="Close details">${icon('x')}</button>`;

  function nodePanel(id, role) {
    const n = NODES[id];
    const sens = canSens();
    const edit = canEdit();
    const notes = n.notes || [];
    const links = LINKS.filter((l) => l.s === id || l.t === id);
    const tabs = role === 'guest' ? ['details'] : ['details', 'notes', 'links'];
    const tabLabel = { details: 'Details', notes: `Notes ${notes.length}`, links: `Links ${links.length}` };
    let body;
    if (state.panelTab === 'notes' && role !== 'guest') {
      body = `<div style="display:grid;gap:8px">${notes.length ? notes.map((nt) => (nt.sensitive && !sens
        ? `<div class="note-card redacted">${icon('lock', 'icon sm')} Sensitive note · hidden for your role</div>`
        : `<div class="note-card"><div class="note-title">${nt.sensitive ? `<span class="faint">${icon('lock', 'icon sm')}</span>` : ''}${esc(nt.title)}</div><div class="muted">${esc(nt.body)}</div></div>`)).join('') : '<p class="faint" style="margin:0">No notes yet.</p>'}
        ${edit ? `<button class="btn" data-toast="New note (markdown, can be marked sensitive)">${icon('plus', 'icon sm')}Add note</button>` : ''}</div>`;
    } else if (state.panelTab === 'links' && role !== 'guest') {
      body = `<div class="list">${links.map((l) => {
        const other = l.s === id ? l.t : l.s;
        const dir = DIRECTED.has(l.kind) ? (l.s === id ? '→' : '←') : '↔';
        return `<button class="list-row" data-select-node="${other}">${linkSample(l.kind, 28)}<span>${dir} ${esc(NODES[other]?.name)}</span><span class="end faint" style="font-size:11.5px">${LINK_KINDS[l.kind]}</span></button>`;
      }).join('')}</div>`;
    } else {
      const fields = (n.fields || []).filter((f) => !(f.sensitive && role === 'guest'));
      const anyHidden = (n.fields || []).some((f) => f.sensitive) && !sens && role !== 'guest';
      const used = placedOn(id);
      const seeable = used.filter((cid) => CANVASES[cid].kind === 'area' || visibleTabs().includes(cid));
      const hiddenCount = used.length - seeable.length;
      body = `<div class="section"><h3>General</h3><dl class="kv">
          <dt>Area</dt><dd>${n.area ? `<button class="chip area-${AREAS[n.area].color}" data-select-area="${n.area}"><span class="dot" style="background:var(--area)"></span>${esc(AREAS[n.area].name)}</button>` : '<span class="faint">No area</span>'}</dd>
          <dt>Category</dt><dd>${CATS[n.cat]}</dd>
          <dt>Health</dt><dd>${statusChip(n.status)}</dd>
          ${role === 'guest' ? '' : `<dt>Message</dt><dd>${n.msg ? esc(n.msg) : '<span class="faint">None</span>'}</dd>`}
          ${edit ? `<dt>Set health</dt><dd><select class="select inline" data-set-health="${id}" aria-label="Set health manually">${SEVERITY.map((s) => `<option value="${s}" ${s === n.status ? 'selected' : ''}>${STATUS_LABEL[s]}</option>`).join('')}</select></dd>` : ''}
        </dl></div>
        <div class="section"><h3>Fields</h3>${fields.length ? `<dl class="kv">${fields.map((f) => `<dt>${f.sensitive ? `<span title="Sensitive">${icon('lock', 'icon sm')}</span>` : ''}${esc(f.label)}</dt><dd>${f.sensitive && !sens ? `<span class="chip hidden-value">${icon('eyeOff', 'icon sm')}Hidden</span>` : `<span class="mono">${esc(f.value)}</span>`}</dd>`).join('')}</dl>` : '<p class="faint" style="margin:0">No fields.</p>'}
          ${anyHidden ? '<p class="faint" style="font-size:12px;margin:8px 0 0">Sensitive values are hidden for your role. A workspace owner or admin can give you access.</p>' : ''}</div>
        ${role === 'guest' ? '' : `<div class="section"><h3>Drawn on</h3><div style="display:flex;gap:6px;flex-wrap:wrap">${seeable.map((cid) => `<span class="chip">${esc(CANVASES[cid].name)}</span>`).join('')}${hiddenCount ? `<span class="chip hidden-value">+${hiddenCount} you can't see</span>` : ''}</div></div>`}`;
    }
    return `<div class="dp-head"><span class="dp-icon">${icon(n.icon, 'icon lg')}</span><div style="min-width:0"><h2>${esc(n.name)}</h2>
        <div class="sub">${role === 'guest' ? esc(n.typeLabel) : `<span class="mono">${esc(n.slug)}</span> · ${esc(n.typeLabel)}`}</div></div>${closeBtn}</div>
      <div class="dp-tabs" role="tablist">${tabs.map((t) => `<button role="tab" aria-selected="${state.panelTab === t}" data-ptab="${t}">${tabLabel[t]}</button>`).join('')}</div>
      <div class="dp-body">${body}</div>
      ${edit ? `<div class="dp-foot"><button class="btn" data-action="remove-placement">Remove from canvas</button><button class="btn danger" data-modal="delete">${icon('trash', 'icon sm')}Delete</button></div>` : ''}`;
  }

  function areaPanel(aid, role) {
    const A = AREAS[aid];
    const a = CANVASES[state.canvas].areas?.[aid];
    const edit = canEdit();
    const members = Object.entries(NODES).filter(([, n]) => n.area === aid);
    const h = rollup(aid);
    return `<div class="dp-head"><span class="dp-icon area-${A.color}" style="color:var(--area)">${icon('group', 'icon lg')}</span><div><h2>${esc(A.name)}</h2><div class="sub">Area · ${cap(A.kind)}</div></div>${closeBtn}</div>
      <div class="dp-body">
        <div class="section"><h3>General</h3><dl class="kv">
          <dt>Health</dt><dd>${statusChip(h, `${STATUS_LABEL[h]} (worst inside)`)}</dd>
          ${role === 'guest' ? '' : `<dt>${icon('lock', 'icon sm')}CIDR</dt><dd>${canSens() ? `<span class="mono">${esc(A.cidr)}</span>` : `<span class="chip hidden-value">${icon('eyeOff', 'icon sm')}Hidden</span>`}</dd>`}
          <dt>Color</dt><dd>${edit ? `<div style="display:flex;gap:6px">${['yellow', 'teal', 'violet', 'rose', 'blue', 'green', 'gray'].map((col) => `<button class="swatch-btn area-${col}" data-area-color="${aid}:${col}" aria-pressed="${A.color === col}" aria-label="${col}"></button>`).join('')}</div>` : cap(A.color)}</dd>
          ${a ? `<dt>Here</dt><dd>${a.collapsed ? 'Collapsed block' : 'Expanded box'}</dd>` : ''}
        </dl></div>
        <div class="section"><h3>Inside (${members.length})</h3><div class="list">${members.map(([id, n]) => `<button class="list-row" data-select-node="${id}"><span class="dot" style="background:var(--status-${n.status})"></span>${esc(n.name)}<span class="end faint" style="font-size:11.5px">${esc(n.typeLabel)}</span></button>`).join('')}</div></div>
        ${edit ? '<p class="faint" style="font-size:12px;margin:0">Drag a node into or out of this box to change its area. The change applies on every canvas.</p>' : ''}
      </div>
      ${role === 'guest' ? '' : `<div class="dp-foot"><button class="btn primary" data-enter-area="${aid}">${icon('enter', 'icon sm')}Enter area</button>
        ${edit && a ? `<button class="btn" data-action="toggle-collapse" data-area-id="${aid}">${icon(a.collapsed ? 'expand' : 'collapse', 'icon sm')}${a.collapsed ? 'Expand here' : 'Collapse here'}</button>` : ''}</div>`}`;
  }

  function linkPanel(id) {
    const l = LINKS.find((x) => x.id === id);
    if (!l) return '';
    const arrow = DIRECTED.has(l.kind) ? '→' : '↔';
    return `<div class="dp-head"><span class="dp-icon">${icon('link', 'icon lg')}</span><div><h2>${esc(NODES[l.s].name)} ${arrow} ${esc(NODES[l.t].name)}</h2><div class="sub">${LINK_KINDS[l.kind]}</div></div>${closeBtn}</div>
      <div class="dp-body">
        <div class="section"><h3>General</h3><dl class="kv">
          <dt>Kind</dt><dd style="display:flex;gap:8px;align-items:center">${linkSample(l.kind)}${LINK_KINDS[l.kind]}</dd>
          <dt>From</dt><dd><button class="chip" data-select-node="${l.s}">${esc(NODES[l.s].name)}</button></dd>
          <dt>To</dt><dd><button class="chip" data-select-node="${l.t}">${esc(NODES[l.t].name)}</button></dd>
          <dt>Label</dt><dd>${l.label ? `<span class="mono">${esc(l.label)}</span>` : '<span class="faint">None</span>'}</dd>
          <dt>Health</dt><dd>${statusChip(l.down ? 'down' : 'unknown', l.down ? 'Down' : 'Not measured')}</dd>
        </dl></div>
        <p class="faint" style="font-size:12px;margin:0">This link exists once in the inventory and appears on every canvas where both nodes are placed.</p>
      </div>
      ${canEdit() ? `<div class="dp-foot"><button class="btn" data-action="hide-link" data-link-id="${id}">${icon('eyeOff', 'icon sm')}Hide here</button><button class="btn danger" data-toast="Delete link from the inventory (removed from every canvas)">${icon('trash', 'icon sm')}Delete</button></div>` : ''}`;
  }

  // ───────────────────────── sheets: inventory & members ─────────────────────────
  function inventoryRows() {
    const q = state.invQuery.toLowerCase();
    const sens = canSens();
    return Object.entries(NODES)
      .filter(([, n]) => (!state.invCat || n.cat === state.invCat) && (!q || n.name.toLowerCase().includes(q) || n.slug.includes(q)))
      .map(([id, n]) => {
        const ipf = n.fields?.find((f) => f.key === 'ip');
        const ipCell = !ipf ? '<span class="faint">-</span>' : sens ? `<span class="mono">${esc(ipf.value)}</span>` : `<span class="chip hidden-value">${icon('eyeOff', 'icon sm')}Hidden</span>`;
        const used = placedOn(id).length;
        return `<tr data-open-node="${id}" style="cursor:pointer">
          <td><div class="cell-name"><span class="node-icon">${icon(n.icon, 'icon sm')}</span><div><div style="font-weight:500">${esc(n.name)}</div><div class="faint" style="font-size:11.5px">${esc(n.typeLabel)}</div></div></div></td>
          <td class="mono muted">${esc(n.slug)}</td><td>${CATS[n.cat]}</td>
          <td>${n.area ? `<span class="area-${AREAS[n.area].color}" style="display:inline-flex;gap:6px;align-items:center"><span class="dot" style="background:var(--area)"></span>${esc(AREAS[n.area].name)}</span>` : '<span class="faint">-</span>'}</td>
          <td>${ipCell}</td><td>${statusChip(n.status)}</td>
          <td>${used ? `${used} canvas${used > 1 ? 'es' : ''}` : '<span class="chip">Not placed</span>'}</td></tr>`;
      }).join('') || '<tr><td colspan="7" class="faint">No nodes match.</td></tr>';
  }

  function inventorySheet() {
    return `<div class="sheet-backdrop" data-backdrop><section class="float sheet" aria-label="Inventory">
      <div class="sheet-head"><h1>Inventory</h1><span class="chip">${Object.keys(NODES).length} nodes · ${LINKS.length} links · ${Object.keys(AREAS).length} areas</span>
        <div class="end">${canEdit() ? `<button class="btn primary" data-toast="${state.role === 'editor' ? 'Editors add nodes through a canvas they can edit' : 'New node (optionally placed on a canvas right away)'}">${icon('plus', 'icon sm')}New node</button>` : ''}
        <button class="icon-btn" data-go="canvas" aria-label="Close">${icon('x')}</button></div></div>
      <div class="sheet-body">
        <p class="muted" style="margin:0 0 14px;font-size:13px">Everything in this workspace, drawn or not. A node is one record, shown on any number of canvases.</p>
        <div class="filters"><input class="input" id="inv-q" placeholder="Search name or slug…" value="${esc(state.invQuery)}" aria-label="Search inventory">
          <button class="chip ${!state.invCat ? 'accent' : ''}" data-inv-cat="">All</button>
          ${Object.keys(CATS).map((k) => `<button class="chip ${state.invCat === k ? 'accent' : ''}" data-inv-cat="${k}">${CATS[k]}</button>`).join('')}</div>
        <table class="table"><thead><tr><th>Name</th><th>Slug</th><th>Category</th><th>Area</th><th>IP address</th><th>Health</th><th>Drawn on</th></tr></thead><tbody id="inv-body">${inventoryRows()}</tbody></table>
      </div></section></div>`;
  }

  function membersSheet() {
    const owner = state.role === 'owner';
    const roleSel = (m) => `<select class="select inline" ${!owner || m.you ? 'disabled' : ''} aria-label="Role of ${esc(m.name)}" data-toast-change="Role changed">${['owner', 'admin', 'editor', 'viewer'].map((r) => `<option ${r === m.role ? 'selected' : ''}>${cap(r)}</option>`).join('')}</select>`;
    const sensCell = (m) => (['owner', 'admin'].includes(m.role) ? '<span class="chip">Always</span>'
      : `<label class="switch"><input type="checkbox" ${m.sens ? 'checked' : ''} ${owner ? '' : 'disabled'} aria-label="${esc(m.name)} can see sensitive info" data-toast-change="Sensitive access updated (enforced by the server)"><span></span></label>`);
    const canvasCell = (m) => (m.role === 'editor'
      ? `<div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center">${m.canvases.map((c) => `<span class="chip">${esc(c)}</span>`).join('')}${owner ? `<button class="icon-btn sm" aria-label="Edit canvases" data-toast="Choose which canvases this editor may edit">${icon('plus', 'icon sm')}</button>` : ''}</div>`
      : '<span class="faint">All canvases</span>');
    return `<div class="sheet-backdrop" data-backdrop><section class="float sheet" aria-label="Members">
      <div class="sheet-head"><h1>Members</h1><span class="chip">Home lab</span>
        <div class="end">${owner ? `<button class="btn primary" data-modal="add-member">${icon('plus', 'icon sm')}Add member</button>` : ''}<button class="icon-btn" data-go="canvas" aria-label="Close">${icon('x')}</button></div></div>
      <div class="sheet-body">
        ${owner ? `<div class="callout">${icon('info')}<div>People need an account first. Accounts are created by the <b>server owner or a server admin</b>; there is no self-signup.</div></div>`
          : `<div class="callout">${icon('lock')}<div>Only the workspace owner and admins can change members.</div></div>`}
        <table class="table"><thead><tr><th>Member</th><th>Role</th><th>Sensitive info</th><th>Canvases</th><th>Signs in with</th><th></th></tr></thead><tbody>
        ${MEMBERS.map((m) => `<tr><td><div class="cell-name"><span class="avatar" style="width:30px;height:30px;box-shadow:none">${m.init}</span><div><div>${esc(m.name)}${m.you ? ' <span class="faint">(you)</span>' : ''}</div><div class="faint mono" style="font-size:11px">@${m.user}</div></div></div></td>
          <td>${roleSel(m)}</td><td>${sensCell(m)}</td><td>${canvasCell(m)}</td>
          <td><div style="display:flex;gap:4px">${m.signin.map((s) => `<span class="chip">${s}</span>`).join('')}</div></td>
          <td style="text-align:right">${owner && !m.you ? `<button class="icon-btn sm" aria-label="Remove ${esc(m.name)}" data-toast="Removed from workspace (their account still exists)">${icon('x', 'icon sm')}</button>` : ''}</td></tr>`).join('')}
        </tbody></table>
      </div></section></div>`;
  }

  // ───────────────────────── auth & guest pages ─────────────────────────
  const brand = '<div class="brand"><span class="logo">N</span><b>Netopology</b></div>';
  function loginPage() {
    return `<div class="auth"><form class="float auth-card" onsubmit="return false">${brand}
      <div><h1>Welcome back</h1><p>Sign in to Home lab</p></div>
      ${state.loginError ? `<div class="callout danger" style="margin:0">${icon('alert')}<div>This Discord account isn't linked to any Netopology account. Sign in with your password and link it from your profile, or ask your server admin.</div></div>` : ''}
      <button class="btn block" data-go="canvas">${icon('mail', 'icon sm')}Continue with Google</button>
      <button class="btn block" data-action="discord-unlinked">${icon('users', 'icon sm')}Continue with Discord</button>
      <div class="divider">or</div>
      <div class="field"><label for="u">Username</label><input class="input" id="u" autocomplete="username" value="alice"></div>
      <div class="field"><label for="p">Password</label><input class="input" id="p" type="password" autocomplete="current-password" value="correct horse battery"></div>
      <button class="btn primary block" data-go="canvas">Sign in</button>
      <p style="font-size:12px;text-align:center">No account? Ask your server admin. There is no self-signup.</p>
    </form></div>`;
  }
  function setupPage() {
    const s1 = state.setupStep === 1;
    return `<div class="auth"><form class="float auth-card" onsubmit="return false">${brand}
      <div class="steps"><span class="on"></span><span class="${s1 ? '' : 'on'}"></span></div>
      ${s1 ? `<div><h1>Create the server owner</h1><p>This first account owns the server. It creates accounts and workspaces, and sees a workspace's content only as a member.</p></div>
        <div class="field"><label for="su">Username</label><input class="input" id="su" value="alice"></div>
        <div class="field"><label for="sd">Display name</label><input class="input" id="sd" value="Alice"></div>
        <div class="field"><label for="sp">Password <span class="faint">(12+ characters)</span></label><input class="input" id="sp" type="password" value="correct horse battery"></div>
        <button class="btn primary block" data-action="setup-next">Continue</button>`
      : `<div><h1>Name your first workspace</h1><p>A workspace is one isolated environment, usually one network. You'll be its owner.</p></div>
        <div class="field"><label for="sw">Workspace name</label><input class="input" id="sw" value="Home lab"></div>
        <button class="btn primary block" data-go="canvas">Create and open</button>
        <button class="btn ghost block" data-action="setup-back">Back</button>`}
    </form></div>`;
  }
  function guestLockedPage() {
    return `<div class="auth"><form class="float auth-card" onsubmit="return false">${brand}
      <div><h1>Protected canvas</h1><p>Someone shared a read-only view of their network with you. Enter the password they gave you.</p></div>
      <div class="field"><label for="gp">Password</label><input class="input" id="gp" type="password" value="family-2026"></div>
      <button class="btn primary block" data-go="guest">Open</button>
      <p style="font-size:12px;text-align:center">Passwords, IP addresses, notes and other sensitive details are never shared.</p>
    </form></div>`;
  }

  // ───────────────────────── modals & palette ─────────────────────────
  function openModal(name) {
    const html = { share: shareModal, delete: deleteModal, 'add-member': addMemberModal }[name]();
    $('#modal-root').innerHTML = `<div class="modal-backdrop" data-backdrop>${html}</div>`;
    $('#modal-root input, #modal-root .btn')?.focus();
  }
  const closeModal = () => { $('#modal-root').innerHTML = ''; state.shareCreated = null; };
  const modalFrame = (title, body, foot) => `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="modal-head"><h2>${title}</h2><button class="icon-btn" data-close aria-label="Close">${icon('x')}</button></div><div class="modal-body">${body}</div>${foot ? `<div class="modal-foot">${foot}</div>` : ''}</div>`;

  function shareModal() {
    const c = CANVASES[state.canvas];
    const created = state.shareCreated ? `<div class="callout warn" style="margin:0">${icon('key')}<div>Copy this link now. It is <b>shown only once</b>.</div></div>
      <div class="token-box"><span class="grow">${esc(state.shareCreated)}</span><button class="icon-btn sm" aria-label="Copy" data-toast="Copied">${icon('copy', 'icon sm')}</button></div>` : '';
    return modalFrame(`Share "${esc(c.name)}"`, `<p class="muted" style="margin:0">Guests get a read-only view of this canvas only. Sensitive fields, notes, health messages and user names are never shared.</p>${created}
      <div class="section"><h3>Active links</h3>${state.shareLinks.map((l, i) => `<div class="share-row"><div class="grow"><div>${esc(l.label)}</div><div class="faint" style="font-size:12px">${l.uses} opens · expires ${esc(l.expires)}</div></div>${l.hasPassword ? `<span class="chip">${icon('lock', 'icon sm')}Password</span>` : ''}<button class="btn ghost sm" data-action="revoke" data-index="${i}">Revoke</button></div>`).join('') || '<p class="faint">No links yet.</p>'}</div>
      <div class="section"><h3>New link</h3><div style="display:grid;gap:10px">
        <div class="field"><label for="sl">Label</label><input class="input" id="sl" placeholder="e.g. Family"></div>
        <div class="row"><div class="field grow"><label for="spw">Password (optional)</label><input class="input" id="spw" type="password" placeholder="Leave empty for none"></div>
          <div class="field"><label for="sx">Expires</label><select class="select" id="sx"><option>Never</option><option>In 24 hours</option><option selected>In 7 days</option><option>In 30 days</option></select></div></div></div></div>`,
    `<button class="btn" data-close>Close</button><button class="btn primary" data-action="create-share">${icon('share', 'icon sm')}Create link</button>`);
  }

  function deleteModal() {
    const id = state.selected?.id;
    const n = NODES[id];
    const used = placedOn(id);
    const seeable = used.filter((cid) => CANVASES[cid].kind === 'area' || visibleTabs().includes(cid));
    const blocked = state.role === 'editor' && seeable.length < used.length;
    const links = LINKS.filter((l) => l.s === id || l.t === id).length;
    return modalFrame(`Delete "${esc(n.name)}"?`, `<p style="margin:0">This removes it from the inventory and from <b>every canvas</b>, with its ${links} link${links === 1 ? '' : 's'} and ${(n.notes || []).length} note${(n.notes || []).length === 1 ? '' : 's'}. To take it off just this canvas, use <i>Remove from this canvas</i>.</p>
      <div class="section"><h3>Drawn on</h3><div style="display:flex;gap:6px;flex-wrap:wrap">${seeable.map((cid) => `<span class="chip">${esc(CANVASES[cid].name)}</span>`).join('')}${blocked ? `<span class="chip hidden-value">+${used.length - seeable.length} you can't see</span>` : ''}</div></div>
      ${blocked ? `<div class="callout danger" style="margin:0">${icon('lock')}<div>You can't delete this node: it is also drawn on a canvas you don't have access to. Remove it from this canvas instead, or ask an admin.</div></div>` : ''}`,
    `<button class="btn" data-close>Cancel</button><button class="btn" data-action="remove-placement">Remove from this canvas</button><button class="btn danger" data-action="delete-node" ${blocked ? 'disabled' : ''}>${icon('trash', 'icon sm')}Delete everywhere</button>`);
  }

  function addMemberModal() {
    return modalFrame('Add member', `<div class="field"><label for="am">Username</label><input class="input" id="am" placeholder="Exact username, e.g. frank"></div>
      <div class="field"><label for="ar">Role</label><select class="select" id="ar"><option>Viewer</option><option>Editor</option><option>Admin</option><option>Owner</option></select></div>
      <label class="row" style="font-size:13px"><span class="switch"><input type="checkbox"><span></span></span>Can see sensitive info (IPs, sensitive notes)</label>
      <p class="faint" style="margin:0;font-size:12px">The account must already exist. Ask the server admin to create it first.</p>`,
    `<button class="btn" data-close>Cancel</button><button class="btn primary" data-action="add-member">Add member</button>`);
  }

  // Ctrl/Cmd+K command palette (search replaces a visible search box)
  function paletteResults() {
    const q = (state.palette?.q || '').toLowerCase();
    const match = (s) => !q || s.toLowerCase().includes(q);
    const nodes = Object.entries(NODES).filter(([id, n]) => (match(n.name) || match(n.slug)) && placedOn(id).some((c) => c.startsWith('area:') || visibleTabs().includes(c)))
      .map(([id, n]) => ({ group: 'Nodes', label: n.name, sub: n.typeLabel, icon: n.icon, run: () => jumpTo(id) }));
    const canvases = visibleTabs().filter((id) => match(CANVASES[id].name)).map((id) => ({ group: 'Canvases', label: CANVASES[id].name, sub: 'Canvas', icon: 'layers', run: () => { state.canvas = id; location.hash = 'canvas'; onHash(); } }));
    const actions = [
      { label: 'Open inventory', icon: 'list', run: () => { location.hash = 'inventory'; } },
      { label: 'Open members', icon: 'users', run: () => { location.hash = 'members'; } },
      state.role === 'owner' ? { label: 'Share this canvas', icon: 'share', run: () => openModal('share') } : null,
      { label: `Switch to ${state.theme === 'light' ? 'dark' : 'light'} theme`, icon: 'eye', run: () => { state.theme = state.theme === 'light' ? 'dark' : 'light'; render(); } },
    ].filter(Boolean).filter((a) => match(a.label)).map((a) => ({ ...a, group: 'Actions', sub: '' }));
    return [...nodes, ...canvases, ...actions].slice(0, 14);
  }
  function renderPalette() {
    const root = $('#palette-root');
    if (!state.palette) { root.innerHTML = ''; return; }
    const results = paletteResults();
    state.palette.index = Math.min(state.palette.index, Math.max(0, results.length - 1));
    let lastGroup = '';
    const rows = results.map((r, i) => {
      const head = r.group !== lastGroup ? `<div class="group-label">${r.group}</div>` : '';
      lastGroup = r.group;
      return `${head}<button class="result" data-palette-index="${i}" aria-selected="${i === state.palette.index}"><span class="node-icon" style="width:26px;height:26px">${icon(r.icon, 'icon sm')}</span>${esc(r.label)}<span class="end">${esc(r.sub)}</span></button>`;
    }).join('') || '<div class="faint" style="padding:14px">Nothing found.</div>';
    const existing = $('#palette-input');
    if (existing) { $('#palette-results').innerHTML = rows; return; }
    root.innerHTML = `<div class="palette-backdrop" data-backdrop><div class="float palette" role="dialog" aria-label="Search">
      <div class="search">${icon('search')}<input id="palette-input" placeholder="Search nodes, canvases, actions…" value="${esc(state.palette.q)}" autocomplete="off"></div>
      <div class="results" id="palette-results">${rows}</div>
      <div class="foot"><span><kbd>↑</kbd> <kbd>↓</kbd> move</span><span><kbd>Enter</kbd> open</span><span><kbd>Esc</kbd> close</span></div></div></div>`;
    $('#palette-input').focus();
  }
  const openPalette = () => { state.palette = { q: '', index: 0 }; renderPalette(); };
  const closePalette = () => { state.palette = null; renderPalette(); };
  function runPalette(i) {
    const r = paletteResults()[i];
    closePalette();
    r?.run();
  }

  // jump to a node: prefer the current canvas, then an area canvas, then a visible tab
  function jumpTo(id) {
    const on = placedOn(id);
    const cid = on.includes(state.canvas) ? state.canvas : on.find((c) => c.startsWith('area:')) || on.find((c) => visibleTabs().includes(c));
    if (!cid) return;
    state.pendingSelect = id;
    const route = cid.startsWith('area:') ? 'area' : 'canvas';
    if (route === 'canvas') state.canvas = cid;
    if (location.hash === `#${route}`) onHash(); else location.hash = route;
  }

  // ───────────────────────── render & routing ─────────────────────────
  function renderChrome() {
    const chrome = $('#chrome');
    if (!chrome) return;
    const guest = state.route === 'guest';
    chrome.innerHTML = guest
      ? `<div class="float top-left-info"><span class="logo">N</span><b>Physical</b><span class="faint">shared from Home lab</span></div>${detailPanel()}${bottomBar()}`
      : `${leftPanel()}${topRight()}${detailPanel()}${bottomBar()}
         <div class="hint"><kbd>Ctrl</kbd> <kbd>K</kbd> search${CANVASES[state.canvas].kind === 'tab' ? ' · double-click an area to enter' : ''}</div>
         ${state.route === 'inventory' ? inventorySheet() : ''}${state.route === 'members' ? membersSheet() : ''}`;
    applyView();
  }

  function render() {
    document.documentElement.dataset.theme = state.theme;
    renderProtoBar();
    const app = $('#app');
    const r = state.route;
    if (r === 'login') { app.innerHTML = loginPage(); return; }
    if (r === 'setup') { app.innerHTML = setupPage(); return; }
    if (r === 'guest-locked') { app.innerHTML = guestLockedPage(); return; }
    app.innerHTML = `<div class="stage"><div class="canvas-wrap" id="canvas-wrap"><div class="viewport" id="viewport"></div></div><div id="chrome"></div></div>`;
    renderChrome();
    mountCanvas();
  }

  function onHash() {
    const r = location.hash.slice(1) || 'canvas';
    state.route = r;
    if (r === 'area') state.canvas = 'area:remote';
    else if (r === 'guest') state.canvas = 'physical';
    else if (state.canvas.startsWith('area:') && r === 'canvas') state.canvas = 'physical';
    if (state.role === 'editor' && !visibleTabs().includes(state.canvas) && !state.canvas.startsWith('area:')) state.canvas = 'physical';
    if (r === 'canvas' || r === 'area' || r === 'guest') state.selected = null;
    if (state.pendingSelect) {
      const id = state.pendingSelect;
      state.pendingSelect = null;
      if (CANVASES[state.canvas].nodes[id]) state.selected = { type: 'node', id };
      else {
        const cid = placedOn(id).find((x) => visibleTabs().includes(x));
        if (cid) { state.canvas = cid; state.selected = { type: 'node', id }; }
      }
      state.panelTab = 'details';
    }
    state.legendOpen = false;
    closeModal();
    render();
  }

  // ───────────────────────── events ─────────────────────────
  document.addEventListener('click', (e) => {
    const backdrop = e.target.closest('[data-backdrop]');
    if (backdrop && e.target === backdrop) {
      if (backdrop.closest('#modal-root')) closeModal();
      else if (backdrop.closest('#palette-root')) closePalette();
      else location.hash = 'canvas';
      return;
    }
    const t = e.target.closest('[data-go],[data-role],[data-theme-set],[data-canvas],[data-toast],[data-modal],[data-close],[data-ptab],[data-select-node],[data-select-area],[data-enter-area],[data-toggle-kind],[data-zoom],[data-action],[data-tool],[data-area-color],[data-inv-cat],[data-open-node],[data-fold],[data-jump],[data-palette-index]');
    if (!t) return;
    const d = t.dataset;
    if ('close' in d) { closeModal(); return; }
    if (d.paletteIndex !== undefined) { runPalette(Number(d.paletteIndex)); return; }
    if (d.go) { if (location.hash.slice(1) === d.go) onHash(); else location.hash = d.go; return; }
    if (d.role) { state.role = d.role; onHash(); return; }
    if (d.themeSet) { state.theme = d.themeSet; render(); return; }
    if (d.canvas) { state.canvas = d.canvas; state.selected = null; if (location.hash === '#canvas') onHash(); else location.hash = 'canvas'; return; }
    if (d.fold) { state.fold[d.fold] = !state.fold[d.fold]; renderChrome(); return; }
    if (d.jump) { jumpTo(d.jump); return; }
    if (d.modal) { openModal(d.modal); return; }
    if (d.ptab) { state.panelTab = d.ptab; renderChrome(); return; }
    if (d.selectNode) { if (CANVASES[state.canvas].nodes[d.selectNode]) select('node', d.selectNode); else jumpTo(d.selectNode); return; }
    if (d.selectArea) { select('area', d.selectArea); return; }
    if (d.enterArea) { enterArea(d.enterArea); return; }
    if (d.openNode) { jumpTo(d.openNode); return; }
    if (d.invCat !== undefined) { state.invCat = d.invCat || null; renderChrome(); return; }
    if (d.toggleKind) {
      const c = CANVASES[state.canvas];
      const set = new Set(c.hidden || []);
      if (set.has(d.toggleKind)) set.delete(d.toggleKind); else set.add(d.toggleKind);
      c.hidden = [...set];
      renderChrome(); drawEdges();
      return;
    }
    if (d.zoom !== undefined) {
      const wrap = $('#canvas-wrap');
      const v = viewOf(state.canvas);
      if (d.zoom === '0') fitView(); else zoomAt(v, wrap.clientWidth / 2, wrap.clientHeight / 2, d.zoom === '1' ? 1.2 : 1 / 1.2);
      applyView();
      return;
    }
    if (d.areaColor) { const [aid, col] = d.areaColor.split(':'); AREAS[aid].color = col; renderChrome(); redrawCanvas(); return; }
    if (d.tool) { if (d.tool !== 'select') toast(`${TOOLS.find((x) => x[0] === d.tool)?.[2]}: not wired in the prototype`); return; }
    if (d.action) { runAction(d.action, t); return; }
    if (d.toast) toast(d.toast);
  });

  function runAction(action, el) {
    const c = CANVASES[state.canvas];
    const sel = state.selected;
    switch (action) {
      case 'deselect': state.selected = null; renderChrome(); redrawCanvas(); break;
      case 'lp-toggle': state.lpCollapsed = !state.lpCollapsed; renderChrome(); break;
      case 'legend': state.legendOpen = !state.legendOpen; renderChrome(); break;
      case 'remove-placement':
        if (sel?.type === 'node') { delete c.nodes[sel.id]; toast(`Removed ${NODES[sel.id].name} from "${c.name}". It is still in the inventory.`); state.selected = null; closeModal(); renderChrome(); redrawCanvas(); }
        break;
      case 'delete-node':
        if (sel?.type === 'node') {
          const name = NODES[sel.id].name;
          for (const cv of Object.values(CANVASES)) delete cv.nodes[sel.id];
          LINKS = LINKS.filter((l) => l.s !== sel.id && l.t !== sel.id);
          delete NODES[sel.id];
          state.selected = null; closeModal(); renderChrome(); redrawCanvas();
          toast(`Deleted ${name} from the inventory and every canvas`);
        }
        break;
      case 'toggle-collapse': toggleCollapse(el.dataset.areaId); break;
      case 'hide-link': {
        (state.linkHidden[state.canvas] ||= new Set()).add(el.dataset.linkId);
        state.selected = null; renderChrome(); redrawCanvas();
        toast(`Link hidden on "${c.name}" only. It still shows on other canvases.`);
        break;
      }
      case 'create-share':
        state.shareLinks.push({ label: $('#sl')?.value || 'Untitled link', hasPassword: !!$('#spw')?.value, expires: 'in 7 days', uses: 0 });
        state.shareCreated = `https://netopology.local/share/${Array.from(crypto.getRandomValues(new Uint8Array(18)), (b) => b.toString(16).padStart(2, '0')).join('')}`;
        openModal('share');
        break;
      case 'revoke': state.shareLinks.splice(Number(el.dataset.index), 1); openModal('share'); toast('Link revoked: it stopped working immediately'); break;
      case 'add-member': closeModal(); toast('Member added'); break;
      case 'discord-unlinked': state.loginError = true; render(); break;
      case 'setup-next': state.setupStep = 2; render(); break;
      case 'setup-back': state.setupStep = 1; render(); break;
      default: break;
    }
  }

  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.setHealth) { NODES[t.dataset.setHealth].status = t.value; renderChrome(); redrawCanvas(); toast('Health set manually. Plugins set it automatically from phase C3.'); }
    else if (t.dataset.toastChange) toast(t.dataset.toastChange);
  });
  document.addEventListener('input', (e) => {
    if (e.target.id === 'inv-q') { state.invQuery = e.target.value; $('#inv-body').innerHTML = inventoryRows(); }
    if (e.target.id === 'palette-input') { state.palette.q = e.target.value; state.palette.index = 0; renderPalette(); }
  });
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (['login', 'setup', 'guest-locked', 'guest'].includes(state.route)) return;
      if (state.palette) closePalette(); else openPalette();
      return;
    }
    if (state.palette) {
      const n = paletteResults().length;
      if (e.key === 'ArrowDown') { e.preventDefault(); state.palette.index = (state.palette.index + 1) % Math.max(1, n); renderPalette(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); state.palette.index = (state.palette.index - 1 + n) % Math.max(1, n); renderPalette(); }
      else if (e.key === 'Enter') { e.preventDefault(); runPalette(state.palette.index); }
      else if (e.key === 'Escape') closePalette();
      return;
    }
    if (e.key !== 'Escape') return;
    if ($('#modal-root').innerHTML) closeModal();
    else if (state.route === 'inventory' || state.route === 'members') location.hash = 'canvas';
    else if (state.legendOpen) { state.legendOpen = false; renderChrome(); }
    else if (state.selected) { state.selected = null; renderChrome(); redrawCanvas(); }
    else if (state.route === 'area') location.hash = 'canvas';
  });

  window.addEventListener('hashchange', onHash);
  window.addEventListener('resize', () => { if ($('#canvas-wrap')) applyView(); });
  onHash();
})();
