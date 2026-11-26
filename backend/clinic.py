import re
import threading
from datetime import date, datetime, timedelta

_lock = threading.Lock()

DOCTORS = [
    {"id": "d1", "name": "Dr. Priya Raman", "speciality": "Cardiology"},
    {"id": "d2", "name": "Dr. Arjun Mehta", "speciality": "Dermatology"},
    {"id": "d3", "name": "Dr. Kavya Nair", "speciality": "Pediatrics"},
    {"id": "d4", "name": "Dr. Rahul Verma", "speciality": "General Medicine"},
]

TIMES = ["09:00", "10:00", "11:00", "14:00", "15:00", "16:00"]

SLOTS = []
APPOINTMENTS = []
EVENTS = []  # booking / cancel events, so the dashboard can highlight rows


def _build_slots():
    today = date.today()
    for offset in range(1, 6):
        day = today + timedelta(days=offset)
        if day.weekday() == 6:  # no Sundays
            continue
        for d in DOCTORS:
            for t in TIMES:
                SLOTS.append({
                    "id": f"{d['id']}-{day.isoformat()}-{t}",
                    "doctor_id": d["id"],
                    "date": day.isoformat(),
                    "time": t,
                    "booked": False,
                })


_build_slots()


def normalize_phone(phone):
    digits = re.sub(r"\D", "", str(phone))
    if len(digits) > 10 and digits.startswith("91"):
        digits = digits[-10:]
    return digits


def _doctor(query):
    if not query:
        return None
    q = str(query).strip().lower()
    for d in DOCTORS:
        if q == d["id"] or q in d["name"].lower() or q in d["speciality"].lower():
            return d
    return None


def _doctor_by_id(doctor_id):
    return next(d for d in DOCTORS if d["id"] == doctor_id)


def _push_event(kind, appt):
    EVENTS.append({"n": len(EVENTS) + 1, "type": kind, "appointment": appt,
                   "ts": datetime.now().isoformat(timespec="seconds")})


def list_doctors():
    out = []
    for d in DOCTORS:
        free = [s for s in SLOTS if s["doctor_id"] == d["id"] and not s["booked"]]
        out.append({**d, "slots": free})
    return out


def check_availability(doctor=None, date_str=None):
    with _lock:
        if doctor:
            d = _doctor(doctor)
            if not d:
                return {"ok": False, "error": "No doctor or speciality matches that name."}
            docs = [d]
        else:
            docs = DOCTORS
        result = []
        for d in docs:
            free = [s for s in SLOTS if s["doctor_id"] == d["id"] and not s["booked"]
                    and (not date_str or s["date"] == date_str)]
            if free:
                result.append({
                    "doctor": d["name"],
                    "speciality": d["speciality"],
                    "slots": [{"date": s["date"], "time": s["time"]} for s in free],
                })
        return {"ok": True, "availability": result}


def book(phone, doctor, date_str, time_str):
    with _lock:
        phone = normalize_phone(phone)
        if len(phone) != 10:
            return {"ok": False, "error": "Phone number must be 10 digits."}
        if any(a["phone"] == phone for a in APPOINTMENTS):
            return {"ok": False, "error": "This number already has an appointment. Cancel it first."}
        d = _doctor(doctor)
        if not d:
            return {"ok": False, "error": "No doctor or speciality matches that name."}
        slot = next((s for s in SLOTS if s["doctor_id"] == d["id"]
                     and s["date"] == date_str and s["time"] == time_str), None)
        if not slot:
            return {"ok": False, "error": "That slot does not exist."}
        if slot["booked"]:
            return {"ok": False, "error": "That slot is already taken."}
        slot["booked"] = True
        appt = {
            "id": f"a{len(APPOINTMENTS) + len(EVENTS) + 1}",
            "phone": phone,
            "doctor": d["name"],
            "speciality": d["speciality"],
            "date": date_str,
            "time": time_str,
            "slot_id": slot["id"],
        }
        APPOINTMENTS.append(appt)
        _push_event("booked", appt)
        return {"ok": True, "appointment": appt}


def cancel(phone):
    with _lock:
        phone = normalize_phone(phone)
        appt = next((a for a in APPOINTMENTS if a["phone"] == phone), None)
        if not appt:
            return {"ok": False, "error": "No appointment found for this number."}
        APPOINTMENTS.remove(appt)
        for s in SLOTS:
            if s["id"] == appt["slot_id"]:
                s["booked"] = False
        _push_event("cancelled", appt)
        return {"ok": True, "cancelled": appt}


def list_appointments():
    with _lock:
        return list(APPOINTMENTS)


def events_since(n):
    with _lock:
        return [e for e in EVENTS if e["n"] > n]

