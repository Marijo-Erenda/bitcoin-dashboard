from datetime import datetime, timezone

# =======================================================
# 🕒 TIME HELPERS (UTC ONLY – SINGLE SOURCE OF TRUTH)
# =======================================================

def utc_now() -> datetime:
    return datetime.now(timezone.utc)

def utc_now_ts() -> int:
    return int(utc_now().timestamp())

def utc_now_ts_ms() -> int:
    return int(utc_now().timestamp() * 1000)

def utc_today_str() -> str:
    return utc_now().date().isoformat()
