"""Database credentials. No real passwords belong in this file.

Production (AWS): set DB_HOST, DB_USER, DB_PASSWORD, DB_NAME (and optionally DB_PORT)
as environment variables. crud.py reads those first.

Local development: copy creds_local.example.py to creds_local.py and fill it in.
creds_local.py is listed in .gitignore, so it is never committed.
"""

try:
    from creds_local import Creds  # noqa: F401
except ImportError:
    class Creds:
        conString = ""
        userName = ""
        password = ""
        dbName = ""
