// Names for the images found in the ROM. Numbers index the 16-byte header scan
// (scanHeaders order); 'p<n>' indexes the 12-byte system-palette scan (player parts).
// A trailing 'f' (e.g. '829f') means horizontally flipped; 'a~b' is image a drawn with
// header b's palette (the game recolours some art at runtime, e.g. the blue cobra).
// Groupings follow the game's own animation and direction tables where they were found
// (e.g. grunt directions from the table at FFE4DD00, legs from FFE24A00..FFE25870).

type Ref = number | string;

/** Cobra parts, optionally recoloured with another header's palette. */
function cobra(prefix: string, pal: string): Record<string, Ref[]> {
  const r = (ids: number[]) => ids.map((i) => `${i}${pal}`);
  return {
    [`${prefix}.head`]: r([1126, 1127, 1128]),
    [`${prefix}.jaw`]: r([1129, 1130, 1131, 1132]),
    [`${prefix}.rear`]: r([1134, 1135]),
    [`${prefix}.body`]: r([1133]),
    [`${prefix}.root`]: r([1147]),
    [`${prefix}.flash`]: [1126 + '~1143'],
  };
}
const seq = (a: number, b: number, suffix = ''): Ref[] =>
  Array.from({ length: b - a + 1 }, (_, i) => (suffix ? `${a + i}${suffix}` : a + i));
const pseq = (a: number, b: number, flip = false): Ref[] =>
  Array.from({ length: b - a + 1 }, (_, i) => `p${a + i}${flip ? 'f' : ''}`);

export const CATALOG: Record<string, Ref[]> = {
  // ---- player: legs (10-frame walk cycles) and torso (per firing direction) ----
  'legs.u': pseq(108, 117),
  'legs.d': pseq(68, 77),
  'legs.r': pseq(88, 97),
  'legs.l': pseq(88, 97, true),
  'legs.ur': pseq(98, 107),
  'legs.ul': pseq(98, 107, true),
  'legs.dl': pseq(78, 87),
  'legs.dr': pseq(78, 87, true),
  'torso.u': ['p36'],
  'torso.d': ['p34'],
  'torso.l': ['p37', 'p38'],
  'torso.r': ['p37f', 'p38f'],
  'torso.ul': ['p35'],
  'torso.ur': ['p35f'],
  'torso.dl': ['p41', 'p42'],
  'torso.dr': ['p41f', 'p42f'],
  'player.die': seq(60, 83),
  'player.zap': [23, 24, 25],
  'ring.p1': [84],
  'ring.p2': [85],
  'arrow.l': [86],
  'arrow.u': [87],
  'exit': [793],
  // ---- grunts (club) ----
  // direction table at FFE4DD00 runs up, up-left, left, down-left, down (others mirrored)
  'grunt.u': seq(843, 849),
  'grunt.ul': seq(836, 842),
  'grunt.l': seq(829, 835),
  'grunt.dl': seq(850, 856),
  'grunt.d': [857, 859, 860, 861, 862, 863, 864],
  'grunt.ur': seq(836, 842, 'f'),
  'grunt.r': seq(829, 835, 'f'),
  'grunt.dr': seq(850, 856, 'f'),
  'grunt.hit': [858],
  'grunt.die': [865, 866, 867, 868, 869, 875, 876, 877, 878],
  'grunt.blast': seq(870, 878),
  // ---- purple spear guys ----
  'spear.u': seq(741, 747),
  'spear.ul': seq(727, 733),
  'spear.l': seq(734, 740),
  'spear.dl': seq(720, 726),
  'spear.d': seq(712, 718),
  'spear.ur': seq(727, 733, 'f'),
  'spear.r': seq(734, 740, 'f'),
  'spear.dr': seq(720, 726, 'f'),
  'spear.die': seq(748, 757),
  // ---- other enemies ----
  'orb': seq(307, 310),
  'orb.color': seq(322, 325),
  'mine': seq(574, 581),
  'snake.h': seq(678, 686),
  'snake.v': seq(687, 695),
  'snake.die': seq(696, 700),
  'scorpion.d': seq(649, 652),
  'scorpion.l': seq(653, 656),
  'scorpion.h': seq(657, 660),
  'scorpion.dl': seq(661, 664),
  'scorpion.u': seq(665, 668),
  'scorpion.ul': seq(669, 676),
  'tank.v': [422],
  'tank.d1': [423],
  'tank.h': [424],
  'tank.d2': [425],
  'tank.all': [422, 429, 430, 423, 424, 428, 425, 427, 426, 427, 425, 428, 424, 423, 430, 429],
  'gunner': [407, 410, 412, 414, 408, 416, 418, 420, 409, 420, 418, 416, 408, 414, 412, 410],
  'bossorb.purple': seq(1107, 1111),
  'bossorb.green': seq(1112, 1116),
  'bossorb.red': seq(1117, 1122),
  // ---- Mutoid Man ----
  'mutoid.head': seq(924, 928),
  'mutoid.head.hurt': [930, 932],
  'mutoid.body': [929],
  'mutoid.torso': [933],
  'mutoid.torso.hurt': [931],
  'mutoid.chain': seq(939, 941),
  'mutoid.plate': [953],
  'mutoid.shadow': [946],
  'mutoid.gun': [945],
  'mutoid.arm': seq(934, 938),
  'mutoid.tread': seq(942, 944),
  // lightning segments by slope (vertical, steep, diagonal, shallow) and the spark at its tip
  'mutoid.bolt': [947, 948, 949, 950],
  'mutoid.spark': [951, 952],
  'boss.pellet': [648],
  'mine.spike': [598],
  // ---- Cobra Death (world 3): two cobras rising from pits; mirrored head halves ----
  ...cobra('cobra', ''),
  ...cobra('cobra.blue', '~1140'),
  // ---- Scarface (world 2): face in a ring of armour plates; every part shares one anchor.
  // Eight plates per side (top to bottom), five damage stages each.
  ...Object.fromEntries(Array.from({ length: 8 }, (_, k) => [`scar.plate${k}`, seq(1035 + k * 5, 1039 + k * 5)])),
  'scar.brain': seq(993, 997),
  'scar.chin': seq(1079, 1082),
  'scar.tube.a': seq(1083, 1086),
  'scar.tube.b': seq(1087, 1090),
  'scar.tube.c': seq(1091, 1094),
  'scar.eyes': seq(999, 1008),
  'scar.jaw': seq(1009, 1012),
  'scar.teeth.upper': [1022],
  'scar.teeth.lower': [1025],
  'scar.skull.upper': [1103],
  'scar.skull.jaw': [1095],
  'scar.pellet': [647],
  'cobra.flame': seq(518, 526),
  'cobra.fire': seq(527, 529),
  // ---- shots and effects ----
  'shot.v': [601],
  'shot.d': [599],
  'shot.h': [600],
  'shot.d2': [602],
  'missile': seq(588, 596),
  'spark': [605, 607, 605],
  'spark2': [606, 608, 606],
  'eshot': [624, 625, 626, 625],
  'eshot.green': seq(610, 613),
  'eshot.blue': [609],
  'blade': seq(614, 617),
  'ball': seq(618, 623),
  'flame': seq(569, 573),
  'boom': seq(624, 632),
  'puff': seq(563, 568),
  'blood': seq(18, 22),
  'coin': seq(633, 645),
  // ---- pickups ----
  'pu.spread': [507],
  'pu.orbs': [508],
  'pu.shield': [509],
  'pu.blades': [510],
  'pu.bomb': [511],
  'pu.life': [512],
  'pu.ring': [513],
  'pu.rocket': [514],
  'pu.key': [515],
  'pu.speed': [516],
  'pu.grenade': [517],
  // prize boxes in the order of the ROM's prize table (FFE2FBC0), which matches the
  // order of their caption sprites ('A BRAND NEW TOASTER' ... 'YEAR SUPPLY OF MEAT PRODUCTS')
  'prize.box': [396, 394, 395, 400, 401, 402, 397, 399, 398],
  'prize.caption': seq(548, 556),
  'prize.small': seq(388, 393),
  'prize.gift': [585, 586, 587],
  'prize.cash': [582, 583, 584],
  'money': seq(984, 987),
  // ---- HUD / presentation ----
  'logo.smash': [386],
  'logo.tv': [387],
  'digits.blue': seq(467, 476),
  'lifebar': seq(477, 483),
  'map.1': [955],
  'map.2': [956],
  'map.3': [957],
  'text.map1': [963],
  'text.map2': [964],
  'text.map3': [965],
  'text.mutoid': [959],
  'text.scarface': [960],
  'text.cobra': [966],
  'text.applause': [968],
  'host.head': seq(794, 801),
  'host.body': [800],
  'host.arm': seq(802, 807),
  'host.girls': [983],
  'contestant': [701, 702, 703],
  'girl': [705],
};

/** Big white font (ASCII from '!'), from the ROM font table at FFE64630. */
export const FONT_BIG =
  '141,181,179,138,176,126,127,174,175,129,178,136,137,177,142,89,90,91,92,93,94,95,96,97,98,135,183,148,140,171,180,137,' +
  '99,100,101,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125,131,130,132,134,153,128,' +
  '143,144,145,146,147,149,150,151,152,154,155,156,157,158,159,160,161,162,163,164,165,166,167,168,169,170,172,133,173';
/** Small red font (ASCII from '!'). */
export const FONT_SMALL =
  '242,263,243,244,245,246,261,248,249,247,253,264,250,265,266,241,232,233,234,235,236,237,238,239,240,262,260,267,252,268,269,250,' +
  '184,185,186,187,188,189,190,191,192,193,194,195,196,197,198,199,200,201,202,203,204,205,206,207,208,209,254,256,255,242,251,261,' +
  '210,211,212,213,214,215,216,217,218,219,220,221,222,223,224,225,226,227,228,229,230,231,206,207,208,209,257,259,258';
