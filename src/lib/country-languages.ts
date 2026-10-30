/**
 * لغات كل دولة — الرسمية والوطنية الأوسع انتشاراً، بالترتيب المعتاد فيها.
 *
 * يُستعمل عند ربط منصّة تشغيلٍ لدولة: تُقترح لغاتها على الإدارة، فتفعّل ما
 * يلزم. اقتراحٌ لا قرار — لغات الأقليات والأقاليم تُضاف يدوياً عند الحاجة.
 * العربية والإنجليزية مدمجتان في المنصّة أصلاً، فتظهران «مدمجة».
 * الرموز ISO 639-1 حيث وُجد، وإلا 639-3.
 */
const RAW = `
AD:ca AE:ar AF:ps,fa AG:en AI:en AL:sq AM:hy AO:pt AR:es AS:en,sm AT:de AU:en AW:nl,pap AX:sv AZ:az
BA:bs,hr,sr BB:en BD:bn BE:nl,fr,de BF:fr BG:bg BH:ar BI:rn,fr BJ:fr BL:fr BM:en BN:ms BO:es,qu,ay BQ:nl
BR:pt BS:en BT:dz BW:en,tn BY:be,ru BZ:en CA:en,fr CC:en CD:fr,ln,sw CF:fr,sg CG:fr,ln CH:de,fr,it,rm CI:fr
CK:en CL:es CM:fr,en CN:zh CO:es CR:es CU:es CV:pt CW:nl,pap CX:en CY:el,tr CZ:cs DE:de DJ:fr,ar DK:da DM:en
DO:es DZ:ar,fr,kab EC:es EE:et EG:ar EH:ar ER:ti,ar ES:es,ca,eu,gl ET:am,om FI:fi,sv FJ:en,fj FK:en FM:en
FO:fo,da FR:fr GA:fr GB:en GD:en GE:ka GF:fr GG:en GH:en GI:en GL:kl,da GM:en GN:fr GP:fr GQ:es,fr GR:el
GT:es GU:en GW:pt GY:en HK:zh,en HN:es HR:hr HT:ht,fr HU:hu ID:id IE:en,ga IL:he,ar IM:en IN:hi,en,bn,te,mr,ta,ur
IO:en IQ:ar,ku IR:fa IS:is IT:it JE:en JM:en JO:ar JP:ja KE:sw,en KG:ky,ru KH:km KI:en KM:ar,fr KN:en KP:ko
KR:ko KW:ar KY:en KZ:kk,ru LA:lo LB:ar,fr LC:en LI:de LK:si,ta LR:en LS:st,en LT:lt LU:lb,fr,de LV:lv LY:ar
MA:ar,zgh,fr MC:fr MD:ro ME:sr,bs,sq MF:fr MG:mg,fr MH:mh,en MK:mk,sq ML:fr,bm MM:my MN:mn MO:zh,pt MP:en MQ:fr
MR:ar,fr MS:en MT:mt,en MU:en,fr MV:dv MW:en,ny MX:es MY:ms MZ:pt NA:en NC:fr NE:fr,ha NF:en NG:en,ha,yo,ig
NI:es NL:nl NO:nb NP:ne NR:en NU:en NZ:en,mi OM:ar PA:es PE:es,qu PF:fr PG:en,tpi PH:fil,en PK:ur,en PL:pl
PM:fr PN:en PR:es,en PS:ar PT:pt PW:en PY:es,gn QA:ar RE:fr RO:ro RS:sr RU:ru RW:rw,fr,en SA:ar SB:en SC:fr,en
SD:ar,en SE:sv SG:en,ms,zh,ta SH:en SI:sl SJ:nb SK:sk SL:en SM:it SN:fr,wo SO:so,ar SR:nl SS:en ST:pt SV:es
SX:nl,en SY:ar SZ:en,ss TC:en TD:fr,ar TF:fr TG:fr TH:th TJ:tg TK:en TL:pt,tet TM:tk TN:ar,fr TO:to,en TR:tr
TT:en TV:en TW:zh TZ:sw,en UA:uk UG:en,sw UM:en US:en UY:es UZ:uz VA:it VC:en VE:es VG:en VI:en VN:vi VU:bi,en,fr
WF:fr WS:sm,en XK:sq,sr YE:ar YT:fr ZA:zu,xh,af,en ZM:en ZW:en,sn,nd
`;

const MAP = new Map<string, string[]>();
for (const pair of RAW.trim().split(/\s+/)) {
  const [cc, langs] = pair.split(":");
  if (cc && langs) MAP.set(cc, langs.split(","));
}

/** لغات الدولة المقترحة (قد تكون فارغة لرمزٍ غير معروف). */
export function languagesOf(country: string): string[] {
  return MAP.get(country.toUpperCase()) ?? [];
}

/** كل الدول التي تُتكلّم فيها لغةٌ ما — لعرض «ستخدم: ألبانيا، كوسوفو…». */
export function countriesSpeaking(lang: string): string[] {
  return [...MAP.entries()].filter(([, l]) => l.includes(lang)).map(([c]) => c);
}
