// Three illustrated story panels (pure SVG, drawn in code: no image assets).
const defs = `
  <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  <filter id="blur8"><feGaussianBlur stdDeviation="8"/></filter>
  <filter id="blur20"><feGaussianBlur stdDeviation="20"/></filter>`;

function spider(x, y, s, o = 1) {
  return `<g transform="translate(${x},${y}) scale(${s})" opacity="${o}">
    <path d="M-30 6 L-52 -10 L-60 14 M-26 12 L-48 22 L-52 40 M30 6 L52 -10 L60 14 M26 12 L48 22 L52 40 M-14 14 L-22 40 M14 14 L22 40" stroke="#120a18" stroke-width="5" fill="none" stroke-linecap="round"/>
    <ellipse cx="0" cy="6" rx="32" ry="18" fill="#140c1c"/><ellipse cx="0" cy="-8" rx="16" ry="12" fill="#140c1c"/>
    <circle cx="-6" cy="-9" r="3.2" fill="#ff8a2a" filter="url(#glow)"/><circle cx="6" cy="-9" r="3.2" fill="#ff8a2a" filter="url(#glow)"/></g>`;
}
function crystal(x, y, s, c = '#ff2f55') {
  return `<g transform="translate(${x},${y}) scale(${s})" filter="url(#glow)"><path d="M0 0 L8 -60 L16 0 Z M14 0 L26 -38 L34 0 Z M-12 0 L-4 -34 L4 0 Z" fill="${c}" opacity="0.9"/></g>`;
}

export const STORY = [
  {
    title: 'OUTPOST ZERO WENT DARK',
    text: 'A research spill turned the air toxic. Now the hive crawls out of every crack.',
    svg: `<svg viewBox="0 0 800 450" preserveAspectRatio="xMidYMax slice"><defs>${defs}
      <linearGradient id="sky1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0d0718"/><stop offset="0.6" stop-color="#3a0f2a"/><stop offset="1" stop-color="#7a1a2a"/></linearGradient></defs>
      <rect width="800" height="450" fill="url(#sky1)"/>
      <circle cx="610" cy="120" r="54" fill="#ff5a4a" opacity="0.85" filter="url(#glow)"/>
      <ellipse cx="400" cy="300" rx="520" ry="70" fill="#ff3a4a" opacity="0.25" filter="url(#blur20)"/>
      <g fill="#120b18">
        <rect x="90" y="210" width="120" height="110"/><rect x="200" y="240" width="90" height="80"/>
        <path d="M300 320 V250 A70 70 0 0 1 440 250 V320 Z"/><rect x="450" y="200" width="70" height="120"/><rect x="520" y="250" width="140" height="70"/>
        <rect x="150" y="150" width="6" height="60"/><rect x="480" y="130" width="6" height="70"/><rect x="600" y="190" width="5" height="60"/>
      </g>
      <circle cx="153" cy="148" r="5" fill="#ff3a3a" filter="url(#glow)"/><circle cx="483" cy="128" r="5" fill="#ff3a3a" filter="url(#glow)"/>
      <g fill="#ffcf7a" opacity="0.6"><rect x="110" y="235" width="14" height="8"/><rect x="140" y="260" width="14" height="8"/><rect x="465" y="230" width="10" height="8"/></g>
      <ellipse cx="400" cy="340" rx="600" ry="50" fill="#a0203a" opacity="0.35" filter="url(#blur20)"/>
      <rect y="330" width="800" height="120" fill="#0e0812"/>
      ${crystal(60, 370, 1.4)}${crystal(700, 390, 1.6)}${crystal(380, 430, 1)}
      ${spider(220, 395, 1.2)}${spider(540, 410, 1.5)}${spider(420, 352, 0.7, 0.8)}${spider(660, 360, 0.6, 0.7)}
    </svg>`,
  },
  {
    title: 'YOUR BEACON IS THE ONLY SAFE GROUND',
    text: 'Inside its field you heal. Step outside and the deadzone eats you alive.',
    svg: `<svg viewBox="0 0 800 450" preserveAspectRatio="xMidYMax slice"><defs>${defs}
      <radialGradient id="dome" cx="0.5" cy="1" r="0.9"><stop offset="0" stop-color="#4ee8ff" stop-opacity="0.08"/><stop offset="0.85" stop-color="#4ee8ff" stop-opacity="0.22"/><stop offset="1" stop-color="#bff8ff" stop-opacity="0.75"/></radialGradient>
      <linearGradient id="sky2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#140818"/><stop offset="1" stop-color="#4a1424"/></linearGradient></defs>
      <rect width="800" height="450" fill="url(#sky2)"/>
      <ellipse cx="400" cy="360" rx="560" ry="120" fill="#ff3a3a" opacity="0.18" filter="url(#blur20)"/>
      <rect y="330" width="800" height="120" fill="#1a1020"/>
      <ellipse cx="400" cy="340" rx="250" ry="56" fill="#4ee8ff" opacity="0.18"/>
      <ellipse cx="400" cy="340" rx="250" ry="56" fill="none" stroke="#9ff6ff" stroke-width="4" filter="url(#glow)"/>
      <path d="M150 340 A250 230 0 0 1 650 340 Z" fill="url(#dome)"/>
      <g stroke="#8ff3ff" stroke-opacity="0.35" fill="none" stroke-width="1.5">
        <path d="M400 110 V340"/><path d="M400 110 Q290 160 260 340"/><path d="M400 110 Q510 160 540 340"/><path d="M400 110 Q210 190 180 340"/><path d="M400 110 Q590 190 620 340"/>
        <path d="M185 290 Q400 250 615 290"/><path d="M230 220 Q400 190 570 220"/>
      </g>
      <g transform="translate(400,340)">
        <path d="M-50 0 L-36 -26 H36 L50 0 Z" fill="#2c3038"/><rect x="-22" y="-100" width="44" height="76" fill="#6c7280"/>
        <rect x="-26" y="-80" width="8" height="40" fill="#e0a92a"/><rect x="18" y="-80" width="8" height="40" fill="#e0a92a"/>
        <circle cx="0" cy="-122" r="16" fill="#bff8ff" filter="url(#glow)"/><ellipse cx="0" cy="-122" rx="30" ry="8" fill="none" stroke="#4ee8ff" stroke-width="3" filter="url(#glow)"/>
      </g>
      <g transform="translate(520,340)">
        <rect x="-10" y="-34" width="8" height="34" fill="#23252c"/><rect x="2" y="-34" width="8" height="34" fill="#23252c"/>
        <rect x="-14" y="-74" width="28" height="42" rx="4" fill="#4a505e"/><rect x="-14" y="-62" width="28" height="7" fill="#e8b23a"/>
        <circle cx="0" cy="-84" r="11" fill="#c89a7a"/><rect x="-11" y="-88" width="22" height="5" fill="#ffb93a" filter="url(#glow)"/>
        <rect x="6" y="-62" width="40" height="7" fill="#23252c"/><rect x="44" y="-61" width="6" height="4" fill="#ffd36b" filter="url(#glow)"/>
      </g>
      ${spider(90, 400, 1.1)}${spider(720, 395, 1.2)}${spider(70, 330, 0.6, 0.7)}${spider(740, 320, 0.55, 0.7)}
    </svg>`,
  },
  {
    title: 'BRING THE SAMPLES HOME',
    text: 'Grab Bio Samples, bank them at the beacon, hold the pad until the dropship lands.',
    svg: `<svg viewBox="0 0 800 450" preserveAspectRatio="xMidYMax slice"><defs>${defs}
      <linearGradient id="sky3" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b0a1a"/><stop offset="1" stop-color="#3a1a2a"/></linearGradient>
      <linearGradient id="beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5ef0ff" stop-opacity="0.6"/><stop offset="1" stop-color="#5ef0ff" stop-opacity="0"/></linearGradient></defs>
      <rect width="800" height="450" fill="url(#sky3)"/>
      <g transform="translate(470,120)">
        <path d="M-40 260 L-20 40 H20 L40 260 Z" fill="url(#beam)" opacity="0.5"/>
        <rect x="-120" y="20" width="240" height="22" rx="8" fill="#4a505e"/><path d="M-50 -10 H50 L70 40 H-70 Z" fill="#6a707e"/>
        <rect x="-30" y="-4" width="60" height="14" rx="4" fill="#ffb93a" filter="url(#glow)"/>
        <rect x="-140" y="24" width="40" height="30" rx="6" fill="#2a2d35"/><rect x="100" y="24" width="40" height="30" rx="6" fill="#2a2d35"/>
        <rect x="-136" y="52" width="32" height="8" fill="#5ef0ff" filter="url(#glow)"/><rect x="104" y="52" width="32" height="8" fill="#5ef0ff" filter="url(#glow)"/>
      </g>
      <rect y="350" width="800" height="100" fill="#141018"/>
      <path d="M330 380 L370 350 H570 L610 380 L570 410 H370 Z" fill="#2a2e38" stroke="#ff9a2a" stroke-width="4" filter="url(#glow)"/>
      ${[[120, 330], [190, 350], [255, 325]].map(([x, y]) => `<g transform="translate(${x},${y})"><ellipse cx="0" cy="62" rx="34" ry="10" fill="#6dff5a" opacity="0.35" filter="url(#blur8)"/><rect x="-18" y="-6" width="36" height="66" rx="8" fill="#6dff5a" opacity="0.9" filter="url(#glow)"/><rect x="-22" y="-14" width="44" height="12" rx="3" fill="#585e6a"/><rect x="-22" y="56" width="44" height="10" rx="3" fill="#585e6a"/><rect x="-8" y="6" width="5" height="40" rx="2" fill="#e6ffe0" opacity="0.7"/></g>`).join('')}
      ${spider(720, 410, 1)}${crystal(660, 440, 1)}
    </svg>`,
  },
];
