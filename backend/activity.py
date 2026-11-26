import threading
from datetime import datetime

import clinic

_lock = threading.Lock()
LOG = []


def _short(d):
    try:
        x = datetime.strptime(d, "%Y-%m-%d")
        return f"{x.strftime('%a')} {x.day}"
    except Exception:
        return d or ""


def _push(title, detail, ok=True):
    with _lock:
        LOG.append({"n": len(LOG) + 1, "title": title, "detail": detail, "ok": ok})


def since(n):
    with _lock:
        return [e for e in LOG if e["n"] > n]


_check, _book, _cancel = clinic.check_availability, clinic.book, clinic.cancel


def check_availability(doctor=None, date_str=None):
    r = _check(doctor, date_str)
    what = doctor or "all doctors"
    if date_str:
        what += f", {_short(date_str)}"
    if not r.get("ok"):
        _push("Couldn't check", r.get("error", what), False)
    else:
        n = sum(len(d["slots"]) for d in r["availability"])
        _push("Checked availability", f"{what}: {n} open" if n else f"{what}: none open")
    return r


def book(phone, doctor, date_str, time_str):
    r = _book(phone, doctor, date_str, time_str)
    if r.get("ok"):
        a = r["appointment"]
        _push("Booked", f"{a['doctor']}, {_short(a['date'])} {a['time']}")
    else:
        _push("Couldn't book", r.get("error", ""), False)
    return r


def cancel(phone):
    r = _cancel(phone)
    if r.get("ok"):
        a = r["cancelled"]
        _push("Cancelled", f"{a['doctor']}, {_short(a['date'])} {a['time']}")
    else:
        _push("Couldn't cancel", r.get("error", ""), False)
    return r


clinic.check_availability = check_availability
clinic.book = book
clinic.cancel = cancel

