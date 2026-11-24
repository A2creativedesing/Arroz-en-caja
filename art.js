/* Arroz en Caja — ilustraciones de platos.
   Un solo lenguaje: formas planas, una luz arriba a la izquierda, colores reales de comida sobre campos de color de la marca.
   Se ven siempre; las fotos reales (si cargan) se colocan encima. */
'use strict';
(function () {
  const hash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  const rng = (seed) => { let a = seed; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const n1 = (v) => Math.round(v * 10) / 10;
  const pick = (r, a) => a[Math.floor(r() * a.length)];
  const TAU = Math.PI * 2;

  const DEFS = '<svg id="aecDefs" width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>' +
    '<radialGradient id="aRice" cx="38%" cy="32%" r="80%"><stop offset="0" stop-color="#FFDA62"/><stop offset=".6" stop-color="#F3B82B"/><stop offset="1" stop-color="#DE9019"/></radialGradient>' +
    '<radialGradient id="aNood" cx="38%" cy="32%" r="80%"><stop offset="0" stop-color="#F6BE5A"/><stop offset=".6" stop-color="#E9A234"/><stop offset="1" stop-color="#CF7F1E"/></radialGradient>' +
    '<linearGradient id="aRim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6a584a"/><stop offset=".45" stop-color="#2f221a"/><stop offset="1" stop-color="#120a05"/></linearGradient>' +
    '<linearGradient id="aKraft" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#DDB077"/><stop offset="1" stop-color="#B98648"/></linearGradient>' +
    '<linearGradient id="aBun" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F3B25A"/><stop offset="1" stop-color="#D4822D"/></linearGradient>' +
    '<linearGradient id="aGold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F5C760"/><stop offset="1" stop-color="#D68A29"/></linearGradient>' +
    '<linearGradient id="aMeat" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#C4672A"/><stop offset="1" stop-color="#7A3512"/></linearGradient>' +
    '</defs></svg>';
  function ensureDefs() { if (!document.getElementById('aecDefs') && document.body) document.body.insertAdjacentHTML('afterbegin', DEFS); }

  const shadow = (cx, cy, rx, ry, o) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#2A1608" opacity="${o || 0.16}"/>`;
  const ing = (x, y, rot, k, inner) => `<g transform="translate(${n1(x)} ${n1(y)}) rotate(${Math.round(rot)})"><g class="ing" style="--k:${k}">${inner}</g></g>`;

  /* ---- ingredientes (centro en 0,0) ---- */
  const PRAWN = '<ellipse cx="1" cy="6" rx="16" ry="5" fill="#2A1608" opacity=".18"/>' +
    '<path d="M-15 2C-13-10 5-13 14-4C18 1 15 8 9 9C5 9.5 2 5-4 4C-9 3.3-13 6-15 2Z" fill="#EE6A45"/>' +
    '<path d="M-8-6l3 12M-2-9l3 14M4-9l2 13M9-6l1 10" stroke="#C8381F" stroke-width="1.7" stroke-linecap="round"/>' +
    '<path d="M-9-4C-3-10 5-9 11-4" fill="none" stroke="#FFB594" stroke-width="1.7" stroke-linecap="round" opacity=".85"/>' +
    '<path d="M-15 2L-25-3L-22 3L-26 7L-15 5Z" fill="#D5482C"/>' +
    '<path d="M14-4C20-9 24-9 28-14M14-2C21-3 25 0 29-2" stroke="#E56B47" stroke-width="1" fill="none" stroke-linecap="round"/>' +
    '<circle cx="12" cy="-2" r="1.3" fill="#2a1408"/>';
  const MUSSEL = '<ellipse cx="1" cy="4" rx="14" ry="8" fill="#2A1608" opacity=".18"/>' +
    '<path d="M-13 0C-13-8 4-10 13-3C15 0 13 5 9 7C0 10-13 8-13 0Z" fill="#1f2c40"/>' +
    '<path d="M-9 0C-8-5 3-6 9-2C10 1 8 4 5 5C-2 7-9 5-9 0Z" fill="#F2A24C"/>' +
    '<path d="M-6 0C-4-3 3-4 6-1" stroke="#FFD28C" stroke-width="1.4" fill="none" stroke-linecap="round"/>' +
    '<path d="M-12-3C-8-8 2-9 10-4" stroke="#4d6785" stroke-width="1.2" fill="none" opacity=".75"/>';
  const PEPPER = '<path d="M-11 0Q0-7 11 0" stroke="#B8231A" stroke-width="5.4" stroke-linecap="round" fill="none"/><path d="M-9-1Q0-5.5 9-1" stroke="#F0624E" stroke-width="1.5" fill="none" stroke-linecap="round" opacity=".75"/>';
  const LEMON = '<path d="M-15 1A15 15 0 0 1 15 1Z" fill="#F2BE0E"/><path d="M-12.4 0A12.4 12.4 0 0 1 12.4 0Z" fill="#FBEC8E"/><path d="M0 0V-11M-7.5-1L-5-9.5M7.5-1L5-9.5M-11-1l2.4-5M11-1l-2.4-5" stroke="#FFF8C8" stroke-width="1.1" stroke-linecap="round"/>';
  const PEA = '<circle r="2.6" fill="#7DB53F"/><circle cx="-.8" cy="-.8" r=".9" fill="#C6E58B"/>';
  const THREAD = '<path d="M0 0q3.2-3.2 8-1" stroke="#C4251A" stroke-width="1.1" fill="none" stroke-linecap="round"/>';
  const ROSEMARY = '<path d="M-24 4Q0-6 26-2" stroke="#3E6B2E" stroke-width="1.7" fill="none" stroke-linecap="round"/>' +
    [-18, -11, -4, 3, 10, 17].map((x, i) => `<ellipse cx="${x}" cy="${i % 2 ? -3.4 + (x * -0.02) : 2.2 + (x * -0.02)}" rx="4.4" ry="1.15" fill="#4E7D34" transform="rotate(${i % 2 ? -32 : 30} ${x} ${i % 2 ? -3 : 2})"/>`).join('');

  function ring(r, n, R, jit) {
    const a0 = r() * TAU;
    return Array.from({ length: n }, (_, i) => { const a = a0 + i * TAU / n + (r() - 0.5) * jit; const d = R + (r() - 0.5) * 6; return { x: Math.cos(a) * d, y: Math.sin(a) * d, rot: a * 57.3 + 90 + (r() - 0.5) * 50 }; });
  }

  /* Paellera vista desde arriba, centrada en 0,0, radio exterior 92 (asas hasta ±112). */
  function paella(r, o) {
    o = o || {};
    const noodles = !!o.noodles;
    let g = '';
    g += '<circle cx="4" cy="9" r="93" fill="#2A1608" opacity=".2"/>';
    g += '<g fill="url(#aRim)"><rect x="-114" y="-7.5" width="30" height="15" rx="7.5"/><rect x="84" y="-7.5" width="30" height="15" rx="7.5"/></g>';
    g += '<g fill="#8a7767"><circle cx="-104" cy="0" r="2.2"/><circle cx="104" cy="0" r="2.2"/></g>';
    g += '<circle r="92" fill="url(#aRim)"/><circle r="86.5" fill="#1c120a"/>';
    g += '<path d="M-77-44.5A89 89 0 0 1-15.5-87.6" fill="none" stroke="#fff" stroke-opacity=".38" stroke-width="2.6" stroke-linecap="round"/>';
    g += '<circle r="82" fill="#8a4a15"/><circle r="79.5" fill="none" stroke="#5b2f0c" stroke-width="3.2" stroke-dasharray="2.5 5" opacity=".55"/>';
    g += `<circle r="77" fill="url(${noodles ? '#aNood' : '#aRice'})"/>`;
    const n = o.grains || 140;
    if (noodles) {
      const cols = ['#F6C766', '#E9A53A', '#D58A22', '#F9D98A'];
      for (let i = 0; i < n; i++) { const a = r() * TAU, d = Math.sqrt(r()) * 73, x = n1(Math.cos(a) * d), y = n1(Math.sin(a) * d); g += `<rect x="${n1(x - 4.2)}" y="${n1(y - 1)}" width="8.4" height="2" rx="1" fill="${pick(r, cols)}" transform="rotate(${Math.floor(r() * 180)} ${x} ${y})"/>`; }
    } else {
      const cols = ['#FFEDAE', '#FBD861', '#F3BC3A', '#FFF5CE'];
      for (let i = 0; i < n; i++) { const a = r() * TAU, d = Math.sqrt(r()) * 74, x = n1(Math.cos(a) * d), y = n1(Math.sin(a) * d); g += `<ellipse cx="${x}" cy="${y}" rx="3.3" ry="1.35" fill="${pick(r, cols)}" transform="rotate(${Math.floor(r() * 180)} ${x} ${y})"/>`; }
    }
    let k = 0;
    for (let i = 0; i < (o.threads == null ? 9 : o.threads); i++) { const a = r() * TAU, d = Math.sqrt(r()) * 68; g += ing(Math.cos(a) * d, Math.sin(a) * d, r() * 360, k++, THREAD); }
    ring(r, o.peppers == null ? 7 : o.peppers, 66, 12).forEach((p) => { g += ing(p.x, p.y, p.rot - 90, k++, PEPPER); });
    ring(r, o.shrimp == null ? 5 : o.shrimp, 49, 10).forEach((p) => { g += ing(p.x, p.y, p.rot - 90, k++, PRAWN); });
    if (o.mussels !== 0) ring(r, o.mussels == null ? 4 : o.mussels, 24, 40).forEach((p) => { g += ing(p.x, p.y, p.rot, k++, MUSSEL); });
    for (let i = 0; i < (o.peas == null ? 14 : o.peas); i++) { const a = r() * TAU, d = 12 + Math.sqrt(r()) * 58; g += ing(Math.cos(a) * d, Math.sin(a) * d, 0, k++, PEA); }
    if (o.lemon !== 0) ring(r, o.lemon == null ? 2 : o.lemon, 66, 60).forEach((p) => { g += ing(p.x * 1.02, p.y * 1.02, p.rot, k++, LEMON); });
    if (o.rosemary !== 0) g += ing(-4, 2, -18, k++, ROSEMARY);
    return g;
  }

  /* ---- escenas de tarjeta (viewBox 160×120) ---- */
  const KINDS = {
    pan: (r) => `<g transform="translate(80 62) scale(.5)">${paella(r, { grains: 80, shrimp: 3, mussels: 2, peppers: 4, peas: 8, lemon: 1, threads: 5, rosemary: 0 })}</g>`,
    noodle: (r) => `<g transform="translate(80 62) scale(.5)">${paella(r, { noodles: true, grains: 120, shrimp: 3, mussels: 0, peppers: 3, peas: 5, lemon: 1, threads: 3, rosemary: 0 })}</g>`,
    burger: (r) => {
      let g = shadow(80, 106, 54, 6, 0.2);
      g += '<path d="M36 88h88v4a8 8 0 0 1-8 8H44a8 8 0 0 1-8-8z" fill="url(#aBun)"/>';
      g += '<rect x="32" y="74" width="96" height="15" rx="7.5" fill="#5B2B16"/><path d="M42 79h18M70 82h26M104 79h14" stroke="#7E4224" stroke-width="2" stroke-linecap="round"/>';
      g += '<polygon points="34,70 126,70 126,74 117,83 109,76 99,86 90,78 80,86 70,78 62,85 53,77 44,82 34,76" fill="#FFC72E"/>';
      g += '<rect x="36" y="63" width="88" height="8" rx="4" fill="#E24B3B"/>';
      g += '<path d="M32 65c5-7 9 2 14-3s9 3 14-2 9 3 14-2 9 3 14-2 9 3 14-2 9 3 14-3 5 4 6 7v4H32z" fill="#7EB843"/>';
      g += '<path d="M34 61C34 30 126 30 126 61z" fill="url(#aBun)"/><path d="M45 53C49 41 65 36 80 36" fill="none" stroke="#fff" stroke-opacity=".42" stroke-width="3.2" stroke-linecap="round"/>';
      for (let i = 0; i < 12; i++) { const x = n1(50 + r() * 60), y = n1(43 + r() * 12); g += `<ellipse cx="${x}" cy="${y}" rx="2.4" ry="1.15" fill="#FFF1CF" transform="rotate(${Math.floor(r() * 180)} ${x} ${y})"/>`; }
      return g;
    },
    sub: (r) => {
      let g = shadow(80, 102, 62, 5, 0.18);
      g += '<path d="M20 86h120a6 6 0 0 1 0 12H20a6 6 0 0 1 0-12z" fill="url(#aBun)"/>';
      g += '<path d="M20 83c8 6 14-4 22 2s14-4 22 2 14-4 22 2 14-4 22 2 14-4 30 0v-6H20z" fill="#E98E86"/>';
      g += '<rect x="22" y="74" width="116" height="6" rx="2" fill="#FFC72E"/>';
      g += '<path d="M18 76c6-8 10 2 16-4s10 4 16-3 10 4 16-3 10 4 16-3 10 4 16-3 10 4 16-3 10 4 8 3v6H18z" fill="#7EB843"/>';
      g += '<path d="M18 72C18 46 142 46 142 72z" fill="url(#aBun)"/><path d="M40 58l8 11M62 53l8 16M84 51l8 18M106 53l8 16M126 58l6 11" stroke="#B3702A" stroke-width="3.2" stroke-linecap="round"/>';
      g += '<path d="M32 62C40 54 54 52 70 51" fill="none" stroke="#fff" stroke-opacity=".4" stroke-width="3" stroke-linecap="round"/>';
      return g;
    },
    empanada: (r) => {
      const emp = (c, dx, dy, rot) => {
        let e = `<g transform="translate(${dx} ${dy}) rotate(${rot} 80 86)"><path d="M30 86A50 46 0 0 1 130 86z" fill="${c}"/>`;
        e += '<path d="M38 80A44 40 0 0 1 80 50" fill="none" stroke="#fff" stroke-opacity=".38" stroke-width="3.2" stroke-linecap="round"/>';
        for (let i = 0; i < 6; i++) { const x = n1(48 + r() * 64), y = n1(62 + r() * 18); e += `<ellipse cx="${x}" cy="${y}" rx="${n1(3 + r() * 3)}" ry="${n1(1.4 + r() * 1.4)}" fill="#B9731F" opacity=".38"/>`; }
        for (let i = 0; i < 11; i++) e += `<circle cx="${n1(34 + i * 9.2)}" cy="87" r="4.6" fill="${c}" stroke="#C07A28" stroke-width=".9"/>`;
        return e + '</g>';
      };
      return shadow(80, 98, 62, 6, 0.18) + emp('#F0BF6C', 14, -9, 9) + emp('#E8A64D', -2, 6, -3);
    },
    fries: (r) => {
      let g = shadow(80, 108, 36, 5, 0.2);
      for (let i = 0; i < 15; i++) { const x = n1(55 + i * 3.6 + r() * 2), top = n1(20 + r() * 22), rot = n1((r() - 0.5) * 26); g += `<rect x="${x}" y="${top}" width="5.2" height="${n1(70 - top)}" rx="1.6" fill="${pick(r, ['#F5CB4E', '#EDB93A', '#F8DB6E'])}" transform="rotate(${rot} ${n1(x + 2.6)} 70)"/>`; }
      g += '<path d="M50 62H110L104 106Q103.6 109 100.5 109H59.5Q56.4 109 56 106Z" fill="#D9362B"/><path d="M50 62H110L108.6 73H51.4Z" fill="#B72A21"/><path d="M67 84H93M69 92H91" stroke="#FFF1CC" stroke-width="3.2" stroke-linecap="round"/>';
      return g;
    },
    cake: (r) => {
      const v = Math.floor(r() * 3);
      const top = ['#F6E7C8', '#4A2412', '#FFF1D6'][v], mid = ['#C99458', '#7A3F22', '#F3D9A0'][v], low = ['#F1DDB2', '#3A1C0E', '#E6C98A'][v], base = ['#4A2814', '#2A140A', '#D9A956'][v];
      let g = shadow(80, 104, 58, 7, 0.16) + '<ellipse cx="80" cy="100" rx="58" ry="9" fill="#FFF8E7"/><ellipse cx="80" cy="98" rx="50" ry="6" fill="#EFE0BB"/>';
      g += `<rect x="46" y="46" width="68" height="14" rx="5" fill="${top}"/><rect x="46" y="60" width="68" height="11" fill="${mid}"/><rect x="46" y="71" width="68" height="11" fill="${low}"/><rect x="46" y="82" width="68" height="13" rx="4" fill="${base}"/>`;
      if (v === 0) for (let i = 0; i < 16; i++) g += `<circle cx="${n1(50 + r() * 60)}" cy="${n1(48 + r() * 8)}" r="${n1(0.8 + r() * 1.1)}" fill="#6B3B1E"/>`;
      g += `<circle cx="${n1(70 + r() * 20)}" cy="42" r="7" fill="${pick(r, ['#D5263B', '#B81D4A', '#E2506B'])}"/><circle cx="68" cy="40" r="1.8" fill="#fff" opacity=".6"/><path d="M82 40c5-9 13-9 15-5-4 5-10 6-15 5z" fill="#4E8A3A"/>`;
      return g;
    },
    can: (r) => {
      if (r() < 0.5) {
        const c = pick(r, ['#D9362B', '#2E7D4F', '#F4A21B', '#2F6FB5', '#2A1608']);
        return shadow(80, 106, 28, 5, 0.2) + `<rect x="58" y="22" width="44" height="82" rx="9" fill="${c}"/><rect x="58" y="22" width="44" height="9" rx="4" fill="#cfd3d6"/><rect x="58" y="95" width="44" height="9" rx="4" fill="#cfd3d6"/><rect x="58" y="48" width="44" height="26" fill="#FFF7E3"/><path d="M66 61h28" stroke="${c}" stroke-width="4" stroke-linecap="round"/><path d="M65 34v54" stroke="#fff" stroke-opacity=".4" stroke-width="4" stroke-linecap="round"/>`;
      }
      let g = shadow(80, 106, 28, 5, 0.2) + '<path d="M54 24H106L100 102Q80 108 60 102Z" fill="#F7DDA0" fill-opacity=".5"/><path d="M55 40H105L100 102Q80 108 60 102Z" fill="#F2A91C"/>';
      g += '<path d="M52 24c2-8 12-6 16-2 4-6 14-6 18-1 6-5 16-2 18 4l-1 8H54z" fill="#FFF7E3"/><path d="M64 48v44" stroke="#fff" stroke-opacity=".5" stroke-width="4" stroke-linecap="round"/>';
      for (let i = 0; i < 9; i++) g += `<circle cx="${n1(68 + r() * 26)}" cy="${n1(56 + r() * 38)}" r="${n1(1 + r() * 1.5)}" fill="#FFE7A0" opacity=".8"/>`;
      return g;
    },
    wine: (r) => {
      const c = pick(r, ['#A6283A', '#EFA39A', '#EAD27A']);
      return shadow(80, 108, 24, 4, 0.2) + `<path d="M62 22H98C99 54 91 70 80 70C69 70 61 54 62 22Z" fill="#fff" fill-opacity=".45"/><path d="M62.6 42H97.4C96 60 90 70 80 70C70 70 64 60 62.6 42Z" fill="${c}"/><path d="M80 70V98" stroke="#fff" stroke-opacity=".75" stroke-width="3.4" stroke-linecap="round"/><ellipse cx="80" cy="102" rx="19" ry="4.5" fill="#fff" fill-opacity=".8"/><path d="M67 28c0 12 2 22 6 28" fill="none" stroke="#fff" stroke-opacity=".75" stroke-width="2.4" stroke-linecap="round"/>`;
    },
    roast: (r) => {
      let g = shadow(80, 104, 62, 6, 0.2);
      for (let i = 0; i < 4; i++) g += `<ellipse cx="${n1(36 + i * 28 + r() * 6)}" cy="${n1(92 + r() * 4)}" rx="15" ry="10" fill="${pick(r, ['#EAB54B', '#DDA23A'])}"/><ellipse cx="${n1(33 + i * 28)}" cy="${n1(88 + r() * 2)}" rx="7" ry="3" fill="#FFE49A" opacity=".6"/>`;
      g += '<g transform="rotate(-18 130 56)"><rect x="104" y="51" width="38" height="10" rx="5" fill="#FBEBC8"/><circle cx="142" cy="50" r="6.5" fill="#FBEBC8"/><circle cx="142" cy="62" r="6.5" fill="#FBEBC8"/></g>';
      g += '<path d="M40 76C34 44 76 28 104 40C128 50 122 86 94 90C72 94 44 94 40 76Z" fill="url(#aMeat)"/>';
      g += '<path d="M54 52C64 42 84 38 98 44" fill="none" stroke="#FFC48A" stroke-opacity=".6" stroke-width="3.2" stroke-linecap="round"/><path d="M58 72l14-6M74 80l16-8M92 70l12-4" stroke="#4F200B" stroke-width="2.6" stroke-linecap="round" opacity=".55"/>';
      g += '<path d="M74 38c-2-6 4-9 9-6" stroke="#4E7D34" stroke-width="2" fill="none" stroke-linecap="round"/>';
      return g;
    },
    cutlet: (r) => {
      let g = shadow(80, 108, 62, 6, 0.18) + '<ellipse cx="80" cy="68" rx="66" ry="46" fill="#FFF8E7"/><ellipse cx="80" cy="68" rx="53" ry="35" fill="#F1E4C4"/>';
      g += '<path d="M32 66C30 42 62 32 90 34C118 36 134 52 126 74C118 94 80 100 56 92C40 86 33 78 32 66Z" fill="url(#aGold)"/>';
      for (let i = 0; i < 26; i++) g += `<circle cx="${n1(42 + r() * 80)}" cy="${n1(44 + r() * 44)}" r="${n1(0.9 + r() * 1.7)}" fill="${pick(r, ['#F8D57E', '#C0801F', '#F8D57E'])}" opacity=".75"/>`;
      g += '<path d="M44 56C54 46 74 42 92 44" fill="none" stroke="#fff" stroke-opacity=".4" stroke-width="3" stroke-linecap="round"/><path d="M112 84c8 0 11 7 6 11s-13 2-17-5z" fill="#FFC72E"/>';
      g += '<g transform="translate(128 98) rotate(-24)"><path d="M-12 1A12 12 0 0 1 12 1Z" fill="#F2BE0E"/><path d="M-9.8 0A9.8 9.8 0 0 1 9.8 0Z" fill="#FBEC8E"/></g>';
      return g;
    },
    bowl: (r) => {
      const soup = pick(r, [['#B4742F', ['#8C5420', '#D69A4C']], ['#C9552E', ['#8C2A12', '#F08A5C']], ['#9DBB57', ['#6C8E32', '#C8DE8B']], ['#A5612E', ['#6B2E12', '#C98A52']]]);
      let g = '<circle cx="82" cy="66" r="50" fill="#2A1608" opacity=".16"/><circle cx="80" cy="62" r="50" fill="#FFF8E7"/><circle cx="80" cy="62" r="42" fill="#EBDDBB"/>' + `<circle cx="80" cy="62" r="37" fill="${soup[0]}"/>`;
      for (let i = 0; i < 18; i++) { const a = r() * TAU, d = Math.sqrt(r()) * 31; g += `<circle cx="${n1(80 + Math.cos(a) * d)}" cy="${n1(62 + Math.sin(a) * d)}" r="${n1(2.2 + r() * 3.4)}" fill="${pick(r, soup[1])}"/>`; }
      for (let i = 0; i < 8; i++) { const a = r() * TAU, d = Math.sqrt(r()) * 30; g += `<ellipse cx="${n1(80 + Math.cos(a) * d)}" cy="${n1(62 + Math.sin(a) * d)}" rx="2.4" ry="1.1" fill="#4E8A3A" transform="rotate(${Math.floor(r() * 180)} ${n1(80 + Math.cos(a) * d)} ${n1(62 + Math.sin(a) * d)})"/>`; }
      return g + '<path d="M46 40A42 42 0 0 1 80 24" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="3" stroke-linecap="round"/>';
    },
    box: (r) => {
      let g = shadow(80, 104, 54, 6, 0.2);
      g += '<rect x="34" y="20" width="92" height="80" rx="10" fill="url(#aKraft)"/><rect x="42" y="28" width="76" height="64" rx="6" fill="#A97B45"/>';
      g += `<g transform="translate(80 60) scale(.29)">${paella(r, { grains: 50, shrimp: 3, mussels: 0, peppers: 3, peas: 5, lemon: 0, threads: 0, rosemary: 0 })}</g>`;
      g += '<g transform="rotate(-6 52 90)"><rect x="28" y="78" width="42" height="24" rx="4" fill="#FFF7E3"/><rect x="33" y="84" width="22" height="3.4" rx="1.7" fill="#D9362B"/><rect x="33" y="91" width="31" height="2.4" rx="1.2" fill="#2A1608" opacity=".5"/><rect x="33" y="95.5" width="24" height="2.4" rx="1.2" fill="#2A1608" opacity=".35"/></g>';
      return g;
    }
  };
  KINDS.glass = KINDS.can;

  function dish(kind, seed, tone) {
    ensureDefs();
    const r = rng(hash(seed + ':' + kind));
    const f = KINDS[kind] || KINDS.pan;
    const cx = n1(52 + r() * 56), cy = n1(44 + r() * 24);
    return `<svg class="art tone-${tone}" viewBox="0 0 160 120" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false"><rect width="160" height="120" fill="var(--bg)"/><circle cx="${cx}" cy="${cy}" r="${n1(58 + r() * 12)}" fill="var(--bg2)"/>${f(r)}</svg>`;
  }

  /* Paellera de la portada: todos los ingredientes, que caen y se asientan al cargar. */
  function hero() {
    ensureDefs();
    const r = rng(hash('portada-arroz'));
    return `<svg class="pan-art" viewBox="-118 -118 236 236" aria-hidden="true" focusable="false">${paella(r, { grains: 170, shrimp: 6, mussels: 5, peppers: 8, peas: 16, lemon: 3, threads: 12 })}</svg>`;
  }
  const floats = {
    lemon: '<svg viewBox="-20 -20 40 40" aria-hidden="true" focusable="false"><circle r="17" fill="#2A1608" opacity=".14" cx="2" cy="4"/><circle r="17" fill="#F2BE0E"/><circle r="14" fill="#FBEC8E"/><g stroke="#FFF8C8" stroke-width="1.3" stroke-linecap="round"><path d="M0 0V-12M0 0L10.4-6M0 0L10.4 6M0 0V12M0 0L-10.4 6M0 0L-10.4-6"/></g><circle r="2" fill="#FFF8C8"/></svg>',
    rosemary: '<svg viewBox="-34 -14 68 28" aria-hidden="true" focusable="false">' + ROSEMARY + '</svg>',
    pepper: '<svg viewBox="-16 -14 32 28" aria-hidden="true" focusable="false">' + PEPPER + '</svg>'
  };

  window.AECArt = { dish, hero, floats, ensureDefs, kinds: Object.keys(KINDS) };
})();
