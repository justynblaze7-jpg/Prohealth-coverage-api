"""Rebuild plans.json from the ProHealth plan schedule (.xlsx).
Usage: python3 scripts/build_plans.py path/to/schedule.xlsx
Expects: header row with S/N, Medical Benefits, then one column per plan.
P = covered, N or Ñ = not covered, numbers = naira limits, other text = limits.
"""
import json,re,sys,openpyxl
wb=openpyxl.load_workbook(sys.argv[1],data_only=True); ws=wb.active
rows=[]
for r in ws.iter_rows(values_only=True):
  r=[(str(c).strip() if c is not None else '') for c in r[:7]]
  if any(r): rows.append(r)
hdr=next(i for i,r in enumerate(rows) if r[0].upper().startswith("S/N"))
plans_from_file=[c.replace(" PLAN","").title() for c in rows[hdr][2:7] if c]
plans=plans_from_file
SECKW={
 "OUT-PATIENT":"clinic doctor visit consultation gp hospital",
 "MEDICATION":"drugs medicine prescription pharmacy",
 "INPATIENT":"admission admit ward hospital stay bed",
 "PHYSIO":"physio physiotherapy back pain rehab",
 "CHRONIC":"chronic hypertension blood pressure diabetes sugar refill",
 "MATERNITY":"pregnancy pregnant birth baby delivery labour antenatal",
 "FAMILY PLANNING":"contraception family planning",
 "CHILD":"baby child infant newborn children",
 "EMERGENCY":"emergency accident",
 "SURGICAL":"surgery operation",
 "RADIOLOG":"scan x-ray xray imaging",
 "ULTRASOUND":"scan ultrasound",
 "LABORATORY":"lab test blood test investigation",
 "OPTICAL":"eye glasses spectacles vision optician",
 "DENTAL":"teeth tooth dentist dental",
 "EAR":"ear nose throat ent hearing",
 "HIV":"hiv aids",
 "MENTAL":"mental psychiatric psychiatry depression",
 "CANCER":"cancer",
 "FERTILITY":"fertility infertility gynaecology",
 "ADDITIONAL":"screening check medical",
 "GYM":"gym fitness exercise",
 "SPA":"spa massage facial",
 "PREVENTIVE":"wellness health talk prevention",
}
ALIAS={
 "Caesarian":"caesarean cesarean c-section cs",
 "Normal Delivery":"birth labour delivery",
 "Provision of lenses":"glasses spectacles lenses frames",
 "Kidney dialysis":"dialysis kidney renal",
 "Mortuary":"mortuary burial death embalming",
 "Scaling":"scaling polishing cleaning",
 "MRI":"mri",
 "CT Scan":"ct scan",
 "Mammo":"mammogram breast",
 "Diabetes":"sugar diabetic",
 "Root Canal":"root canal",
 "Gunshot":"gunshot",
 "Pap smear":"cervical cancer screening",
 "Access to gyms":"gym",
 "General Consultation":"gp doctor",
 "Antenatal":"anc antenatal booking pregnancy pregnant",
 "General ward":"admission admit",
 "Full blood count":"blood test",
 "Fertility Treatment":"fertility infertility",
 "Echocardiography":"echo heart",
 "Endoscop":"endoscopy",
 "Widal":"typhoid",
 "Simple Extraction":"toothache tooth pain remove tooth",
 "Consultation (Optometrist":"eye test eye check vision test",
 "Consultation with the ENT":"ent ear nose throat",
 "Psychiatric":"mental health depression anxiety",
 "Hypertension":"high blood pressure bp hypertension drugs",
}
def money(n):
  return "₦{:,}".format(int(float(n)))
def val(v):
  v=v.strip()
  if v=="": return ["gap","Not stated in the schedule"]
  if v in("P",): return ["ok","Covered"]
  if v in("Ñ","N","ñ"): return ["no","Not covered"]
  if re.fullmatch(r"\d+(\.\d+)?",v): return ["lim","Up to "+money(v)]
  m=re.fullmatch(r"N([\d,]+)",v)
  if m: return ["lim","Up to ₦"+m.group(1)]
  return ["lim",v.strip("()")]
def tidy(t):
  t=re.sub(r"\s+"," ",t).strip().strip(",").strip()
  t=re.sub(r"\s*,\s*,",",",t).rstrip(".")
  return t
services=[];notes=[];sec=None;sub=None;secnote="";seclimit=None
for r in rows[hdr+1:]:
  sn,label=r[0],tidy(r[1]); vals=r[2:7]
  if not label: continue
  if label.startswith("*"): notes.append(label.lstrip("*").strip()); continue
  has=any(x.strip() for x in vals)
  if sn.strip().isdigit():
    if "Premium" in label: sec=None; continue
    m=re.match(r"(.*?)\s*\((.*)\)\s*$",label)
    name=m.group(1) if m else label; secnote=m.group(2) if m else ""
    sec=name.title().replace("Physiotheraphy","Physiotherapy").replace("Hiv/Aids","HIV/AIDS").replace("Npi","NPI"); sub=None; seclimit=None
    kw=" ".join(v for k,v in SECKW.items() if k in label.upper())
    seckw=kw; continue
  if sec is None: continue
  if label=="Limit" or label.startswith("All surgical procedures"):
    seclimit=[val(x)[1] for x in vals]; continue
  if not has:
    if label.startswith("Specialist Consultation"):
      services.append({"name":"Specialist consultation (on referral)","detail":label,"sec":sec,"secnote":secnote,"kw":seckw+" specialist consultant referral","v":[["ok","Covered on referral"]]*5}); continue
    if sn.strip() or label.isupper() or label.endswith(":") or len(label)<45: sub=label.rstrip(":").strip(); continue
    notes.append(label); continue
  if label.isupper() and len(label)>6: sub=label; continue
  v=[val(x) for x in vals]
  if label=="Body massage": v=[val(vals[i]) if i<4 else ["lim","Either a facial or a body massage, 1 session a year"] for i in range(5)]
  if label=="Facials": v=[val(vals[i]) if i<4 else ["lim","Either a facial or a body massage, 1 session a year"] for i in range(5)]
  if seclimit:
    v=[(["lim",f"Covered, within the section limit of {seclimit[i]}".replace("Up to ","")] if x[0]=="ok" else x) for i,x in enumerate(v)]
  short=label
  if len(short)>70:
    short=re.split(r":",short)[0]
    short=re.sub(r"\s*\([^)]*\)","",short).strip()
    if len(short)>70:
      cut=short.rfind(",",0,70)
      if cut<20: cut=short.rfind(" ",0,70)
      short=short[:cut].strip(" ,")+"…"
  al=" ".join(a for k,a in ALIAS.items() if k.lower() in label.lower())
  kw=seckw
  if sub and not sub.isupper(): kw+=" "+sub
  elif sub: kw+=" "+sub.lower()
  services.append({"name":short,"detail":label if label!=short else "","sec":sec,"secnote":secnote,"kw":kw.strip(),"al":al,"v":v})
for i,s in enumerate(services): s["id"]="s%d"%i
json.dump({"plans":plans,"services":services,"notes":notes},open("plans.json","w"),ensure_ascii=False)
print(f"Wrote plans.json: {len(plans)} plans, {len(services)} benefit lines")
