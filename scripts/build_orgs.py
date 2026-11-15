"""Rebuild orgs.json and lib/orgs.js from ProHealth's CBA Group Lookup report (.xlsx).
Usage: python3 scripts/build_orgs.py path/to/CBA_Group_Lookup.xlsx

Only what the page needs is kept: CBA ID, group name, state, region, sector
and policy end date. Contact names, emails, phone numbers and addresses are
NOT copied: the page and its data file are public.

State comes from the address (and name). Sector comes from the name, because
the report's Sector column is empty. Check the printed "Not stated" list after
a rebuild and add rules or overrides below when new groups are added.
"""
import json, re, sys, datetime, openpyxl

STATE_RULES = [  # checked in order; first match wins
  ("FCT", r"abuja|\bfct\b|wuse|garki|maitama|asokoro|jabi|utako|utake|gwar[ie][mn]?pa|central business|\bcbd\b|jahi|lugbe|\bapo\b|durumi|\bkado\b|idu industrial|three arms|cadastral|gudu|aminu kano crescent|yaounde|addis ababa|parakou|lake chad|kashim ibrahimm? way|nsitf"),
  ("Lagos", r"lagos|ikeja|ikoyi|victoria island|surulere|lekki|yaba|ilupeju|oniru|alausa|adeniran ogunsanya"),
  ("Kano", r"kano|badawa"),
  ("Borno", r"maiduguri|borno"),
  ("Rivers", r"port[ -]harcourt|rivers|eleme|trans amadi|d[-/]line"),
  ("Oyo", r"ibadan|\boyo\b|oluyole"),
  ("Kaduna", r"kaduna|kadna"),
  ("Imo", r"owerri"),
  ("Adamawa", r"yola|adamawa"),
  ("Nasarawa", r"nasarawa|keffi"),
  ("Ekiti", r"ekiti"),
  ("Ogun", r"ilaro|ogun|mowe"),
  ("Akwa Ibom", r"\buyo\b|akwa ibom"),
  ("Anambra", r"awka|anambra"),
]
REGION = {
  "FCT": "North Central", "Nasarawa": "North Central",
  "Kano": "North West", "Kaduna": "North West",
  "Borno": "North East", "Adamawa": "North East",
  "Lagos": "South West", "Oyo": "South West", "Ogun": "South West", "Ekiti": "South West",
  "Rivers": "South South", "Akwa Ibom": "South South",
  "Imo": "South East", "Anambra": "South East",
}
SECTOR_RULES = [  # checked in order on the group name
  ("Government & public bodies", r"commission|supreme court|nsitf|social insurance|naca|insurance scheme|nhis|labour congress|employers consultative"),
  ("Financial services", r"bank|\bmfb\b|microfinance|insurance|pension|asset|securities|finance|capital|brokers"),
  ("Education", r"school|university|academy|polytechnic|open university"),
  ("Health", r"\bhospital\b|clinic|\bhmo\b|nerve|sysmex|care services"),
  ("Hospitality & food", r"hotel|\binn\b|restaurant|lounge|suites|resort|villa|foods?\b|chicken|pot\b"),
  ("Retail & trade", r"supermarket|mall|enterprise|trend|machobs|retail|foodco"),
  ("Non-profit & faith", r"foundation|initiative|church|fellowship|society|concern|justice|scripture"),
  ("Construction & property", r"construction|propert|estates|housing|shelter|architects|engineering|bamcom|westfield"),
  ("Energy, mining & manufacturing", r"oil|\bgas\b|lng|mining|packaging|emulsions|farms|rice mill|rigforms|wire-teks|triseeds|ammasco|mainland resources|ruhe|watero|ajyad|mosand"),
  ("Professional services", r"legal|law|consult|baker tilly|talal"),
  ("Technology & telecoms", r"technolog|networks|communications|softnet|call box|infostrategy|content|itm services"),
  ("Transport & travel", r"air peace|travel"),
]
NAME_FIX = {"RETAIL": "Retail (individual plans)", "PRIVATE-Headquarters": "Private (headquarters)", "PROHEALTH HMO LIMITED": "ProHealth HMO Limited"}

ACRONYMS = {"PLC","LNG","FCT","NHIS","NACA","NECA","NSITF","CAC","NOUN","HMO","MFB","II","III","RSSH","HALI","LPF","SWODEN","FOURCI","ITM","CSS","MK","ASRHLTD","E.N.T","M.N","A-"}
SMALL = {"and", "of", "for", "the", "&", "on"}

def tidy(name):
    name = re.sub(r"\s+", " ", str(name)).strip()
    if name in NAME_FIX: return NAME_FIX[name]
    words = []
    for i, w in enumerate(name.split(" ")):
        core = w.strip("(),")
        if core.upper() in ACRONYMS or core.isdigit():
            words.append(w.upper())
        elif i and w.lower() in SMALL:
            words.append(w.lower())
        else:
            words.append("-".join(p[:1].upper() + p[1:].lower() for p in w.split("-")))
    out = " ".join(words)
    return out.replace("(ASRHLTD)", "(ASRHLtd)").replace("Nig ", "Nig. ").replace("(nig.)", "(Nig.)").replace("( ", "(").replace("Int’l", "Int’l")

wb = openpyxl.load_workbook(sys.argv[1], read_only=True, data_only=True)
rows = list(wb.active.iter_rows(values_only=True))
hdr = next(i for i, r in enumerate(rows) if r and "CBA ID" in [str(c).strip() for c in r if c])
cols = {str(c).strip(): j for j, c in enumerate(rows[hdr]) if c}
orgs, unplaced = [], []
for r in rows[hdr + 1:]:
    if not r or len(r) <= cols["Group Name"] or not r[cols["Group Name"]]: continue
    raw = str(r[cols["Group Name"]]).strip()
    addr = str(r[cols["Address"]] or "")
    hay = (addr + " " + raw).lower()
    state = next((s for s, rx in STATE_RULES if re.search(rx, hay)), None)
    sector = next((s for s, rx in SECTOR_RULES if re.search(rx, raw.lower())), "Other")
    end = r[cols["Termination Date"]]
    orgs.append({
        "id": int(r[cols["CBA ID"]]),
        "name": tidy(raw),
        "state": state or "Not stated",
        "region": REGION.get(state, "Not stated"),
        "sector": sector,
        "ends": end.date().isoformat() if isinstance(end, datetime.datetime) else None,
    })
    if not state: unplaced.append(raw)
orgs.sort(key=lambda o: o["name"].lower())
json.dump(orgs, open("orgs.json", "w"), ensure_ascii=False, separators=(",", ":"))
open("lib/orgs.js", "w").write(
    "// Generated by scripts/build_orgs.py from the CBA Group Lookup report. Do not edit by hand.\n"
    "export const ORGS = " + json.dumps(orgs, ensure_ascii=False) + ";\n"
    "export const ORG_BY_ID = new Map(ORGS.map((o) => [o.id, o]));\n")
print(f"Wrote orgs.json and lib/orgs.js: {len(orgs)} organisations")
print("State not found for:", unplaced)
from collections import Counter
print(Counter(o["sector"] for o in orgs)); print(Counter(o["region"] for o in orgs))
print([o["name"] for o in orgs if o["sector"] == "Other"])
