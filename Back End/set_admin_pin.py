"""Give every staff member a random 6-digit PIN (shown once, saved hashed).

Run from the "Back End" folder:
    python set_admin_pin.py              new random PIN for EVERY staff member
    python set_admin_pin.py trivera      new random PIN for just that username

Write the PINs down and hand each one to its owner: only the hash is stored in
Staff.pin_hash, so a PIN cannot be looked up later (run the script again to replace it).
An admin uses username + PIN on the "Forgot password" screen to choose a new password.
Run 003_admin_pin.sql in MySQL Workbench first.
"""
import secrets
import sys

from crud import generate_password_hash, read, write


def random_pin():
    return f"{secrets.randbelow(1_000_000):06d}"  # 000000 to 999999


def main():
    if len(sys.argv) > 1:
        staff = read("SELECT staff_id, name, username, role FROM Staff WHERE LOWER(username) = LOWER(%s)",
                     (sys.argv[1].strip(),))
        if not staff:
            sys.exit("No staff member with that username.")
    else:
        staff = read("SELECT staff_id, name, username, role FROM Staff ORDER BY staff_id")

    print(f"{'Name':<20}{'Username':<14}{'Role':<8}PIN")
    for person in staff:
        pin = random_pin()
        write(
            "UPDATE Staff SET pin_hash = %s, pin_failed_attempts = 0, pin_locked_until = NULL WHERE staff_id = %s",
            (generate_password_hash(pin), person["staff_id"]),
        )
        print(f"{person['name']:<20}{person['username']:<14}{person['role']:<8}{pin}")
    print("\nSave these now. They are not stored anywhere readable.")


if __name__ == "__main__":
    main()
