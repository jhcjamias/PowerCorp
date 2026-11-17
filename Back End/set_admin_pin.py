"""Give admins a random 6-digit password-reset PIN (shown once, saved hashed).

Run from the "Back End" folder, with the same DB_* settings the app uses:
    python set_admin_pin.py              new random PIN for EVERY admin
    python set_admin_pin.py trivera      new random PIN for just that username

Write the PINs down and hand each one to its owner: only the hash is stored in
Staff.pin_hash, so a PIN cannot be looked up later (run the script again to replace it).
An admin uses username + PIN on the "Forgot password" screen to choose a new password.
Barbers cannot sign in to the admin site, so they do not get a PIN.
"""
import secrets
import sys

from crud import app, generate_password_hash, read, write


def random_pin():
    return f"{secrets.randbelow(1_000_000):06d}"  # 000000 to 999999


def main():
    if len(sys.argv) > 1:
        staff = read("SELECT staff_id, name, username, role FROM Staff "
                     "WHERE LOWER(username) = LOWER(%s) AND role = 'admin'",
                     (sys.argv[1].strip(),))
        if not staff:
            sys.exit("No admin with that username.")
    else:
        staff = read("SELECT staff_id, name, username, role FROM Staff WHERE role = 'admin' ORDER BY staff_id")
        if not staff:
            sys.exit("There are no admins yet. Create the Staff rows first.")

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
    with app.app_context():  # crud's database helpers need an application context
        main()
