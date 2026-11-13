import mysql.connector
import flask
from mysql.connector import Error
from flask_cors import CORS
from flask import jsonify, request 
from datetime import date, datetime, timedelta
from decimal import Decimal
import creds #local file
from sqlhelper import create_connection, execute_query, execute_read_query 


#create a conneciton to MySQL db
myCreds = creds.Creds() #this is a constructor. tells python how to create an object 
conn = create_connection(myCreds.conString, myCreds.userName, myCreds.password, myCreds.dbName)

#set up application
app = flask.Flask(__name__)
CORS(app)
app.config["DEBUG"] = True

@app.route('/', methods=['GET'])
def home():
    return "<h>Home Page</h>"


# ---------- helpers ----------

def clean(rows):
    """Make DB rows JSON-safe (Decimal, date, datetime, timedelta)."""
    out = []
    for row in rows:
        item = {}
        for key, val in row.items():
            if isinstance(val, Decimal):
                val = float(val)
            elif isinstance(val, datetime):
                val = val.strftime("%Y-%m-%d %H:%M:%S")
            elif isinstance(val, date):
                val = val.isoformat()
            elif isinstance(val, timedelta):
                val = str(val)  # TIME columns come back as timedelta
            item[key] = val
        out.append(item)
    return out


def has_conflict(staff_id, start, end, exclude_appt_id=0):
    """True if this barber already has an overlapping booked/completed appointment."""
    rows = execute_read_query(conn, """
        SELECT 1 FROM Appointment
        WHERE staff_id = %s
          AND status IN ('booked', 'completed')
          AND appointment_id <> %s
          AND start_time < %s
          AND end_time > %s
        LIMIT 1
    """, (staff_id, exclude_appt_id, end, start))
    return len(rows) > 0


def get_cart_items(customer_id):
    rows = execute_read_query(conn, """
        SELECT p.name AS item_name,
               ci.quantity,
               p.price AS unit_price,
               ci.quantity * p.price AS line_total,
               SUM(ci.quantity * p.price) OVER () AS cart_total
        FROM Cart c
        JOIN Cart_Item ci ON c.cart_id = ci.cart_id
        JOIN Product p ON ci.product_id = p.product_id
        WHERE c.customer_id = %s
        ORDER BY p.name
    """, (customer_id,))
    return clean(rows)


def get_cart_id(customer_id):
    rows = execute_read_query(
        conn, "SELECT cart_id FROM Cart WHERE customer_id = %s ORDER BY cart_id LIMIT 1",
        (customer_id,))
    return rows[0]['cart_id'] if rows else None


@app.errorhandler(Error)
def handle_db_error(e):
    # fine for development; don't expose raw DB errors in production
    return jsonify({'error': str(e)}), 500

# 1. View services
@app.route('/api/services', methods=['GET'])
def view_services():
    rows = execute_read_query(conn, "SELECT name, price, duration_minutes FROM Service")
    return jsonify(clean(rows))


# 2. View calendar for the month, e.g. /api/calendar?year=2026&month=11
@app.route('/api/calendar', methods=['GET'])
def view_calendar():
    try:
        year = int(request.args.get('year', 2026))
        month = int(request.args.get('month', 11))
        first = date(year, month, 1)
    except ValueError:
        return jsonify({'error': 'invalid year or month'}), 400
    next_first = date(year + (month == 12), (month % 12) + 1, 1)

    rows = execute_read_query(conn, """
        WITH slots AS (
          SELECT st.name AS barber,
                 DATE(ts.slot_start) AS slot_date,
                 ts.slot_start,
                 ts.slot_end,
                 CASE
                   WHEN ts.is_blocked THEN 0
                   WHEN EXISTS (
                     SELECT 1 FROM Appointment a
                     WHERE a.staff_id = ts.staff_id
                       AND a.status IN ('booked', 'completed')
                       AND a.start_time < ts.slot_end
                       AND a.end_time > ts.slot_start
                   ) THEN 0
                   ELSE 1
                 END AS is_open
          FROM Time_Slot ts
          JOIN Staff st ON ts.staff_id = st.staff_id
          WHERE ts.slot_start >= %s AND ts.slot_start < %s
        )
        SELECT slot_date,
               CASE WHEN SUM(is_open) OVER (PARTITION BY slot_date) > 0
                    THEN 'Available' ELSE 'Fully Booked' END AS date_availability_status,
               slot_start AS time_slot_start,
               slot_end   AS time_slot_end,
               CASE WHEN is_open = 1 THEN 'Available' ELSE 'Booked' END AS time_slot_availability,
               barber
        FROM slots
        ORDER BY slot_date, slot_start, barber
    """, (first, next_first))
    return jsonify(clean(rows))


# 3. View cart
@app.route('/api/cart/<int:customer_id>', methods=['GET'])
def view_cart(customer_id):
    return jsonify(get_cart_items(customer_id))


# 4. Update cart (set an exact quantity; quantity 0 removes the item)
# body: {"customer_id": 4, "product_id": 5, "quantity": 2}
@app.route('/api/cart/items', methods=['PUT'])
def update_cart():
    data = request.get_json(silent=True) or {}
    try:
        customer_id = int(data['customer_id'])
        product_id = int(data['product_id'])
        quantity = int(data['quantity'])
    except (KeyError, ValueError, TypeError):
        return jsonify({'error': 'customer_id, product_id and quantity are required'}), 400

    cart_id = get_cart_id(customer_id)
    if cart_id is None:
        return jsonify({'error': 'customer has no cart; create one first'}), 404

    if quantity <= 0:
        execute_query(conn, "DELETE FROM Cart_Item WHERE cart_id = %s AND product_id = %s",
                      (cart_id, product_id))
    else:
        execute_query(conn, """
            INSERT INTO Cart_Item (cart_id, product_id, quantity)
            VALUES (%s, %s, %s)
            ON DUPLICATE KEY UPDATE quantity = VALUES(quantity)
        """, (cart_id, product_id, quantity))
    return jsonify(get_cart_items(customer_id))


# 5. Create cart. body: {"customer_id": 3}
@app.route('/api/cart', methods=['POST'])
def create_cart():
    data = request.get_json(silent=True) or {}
    try:
        customer_id = int(data['customer_id'])
    except (KeyError, ValueError, TypeError):
        return jsonify({'error': 'customer_id is required'}), 400

    if get_cart_id(customer_id) is None:
        execute_query(conn, "INSERT INTO Cart (customer_id, created_at) VALUES (%s, NOW())",
                      (customer_id,))
    rows = execute_read_query(conn, """
        SELECT customer_id, created_at AS date_created
        FROM Cart WHERE customer_id = %s ORDER BY cart_id LIMIT 1
    """, (customer_id,))
    return jsonify(clean(rows)[0]), 201


# 6a. Create appointment
# body: {"customer_id": 2, "staff_id": 2, "service_id": 3, "start_time": "2026-11-06 13:00:00"}
@app.route('/api/appointments', methods=['POST'])
def create_appointment():
    data = request.get_json(silent=True) or {}
    try:
        customer_id = int(data['customer_id'])
        staff_id = int(data['staff_id'])
        service_id = int(data['service_id'])
        start = datetime.strptime(data['start_time'], "%Y-%m-%d %H:%M:%S")
    except (KeyError, ValueError, TypeError):
        return jsonify({'error': 'customer_id, staff_id, service_id and '
                                 'start_time (YYYY-MM-DD HH:MM:SS) are required'}), 400

    svc = execute_read_query(
        conn, "SELECT price, duration_minutes FROM Service WHERE service_id = %s", (service_id,))
    if not svc:
        return jsonify({'error': 'service not found'}), 404

    end = start + timedelta(minutes=svc[0]['duration_minutes'])
    if has_conflict(staff_id, start, end):
        return jsonify({'error': 'SLOT UNAVAILABLE'}), 409

    _, appt_id = execute_query(conn, """
        INSERT INTO Appointment (customer_id, staff_id, start_time, end_time, status)
        VALUES (%s, %s, %s, %s, 'booked')
    """, (customer_id, staff_id, start, end))
    execute_query(conn, """
        INSERT INTO Appointment_Service (appointment_id, service_id, price_at_booking)
        VALUES (%s, %s, %s)
    """, (appt_id, service_id, svc[0]['price']))

    return jsonify({
        'customer_id': customer_id,
        'appointment_date': start.strftime("%Y-%m-%d"),
        'appointment_time': start.strftime("%H:%M:%S"),
        'confirmation_number': f"BB-{appt_id:06d}"
    }), 201


# 6b. Update (reschedule) appointment. body: {"start_time": "2026-11-07 11:00:00"}
@app.route('/api/appointments/<int:appt_id>', methods=['PUT'])
def reschedule_appointment(appt_id):
    data = request.get_json(silent=True) or {}
    try:
        new_start = datetime.strptime(data['start_time'], "%Y-%m-%d %H:%M:%S")
    except (KeyError, ValueError, TypeError):
        return jsonify({'error': 'start_time (YYYY-MM-DD HH:MM:SS) is required'}), 400

    rows = execute_read_query(conn, """
        SELECT staff_id, TIMESTAMPDIFF(MINUTE, start_time, end_time) AS minutes
        FROM Appointment WHERE appointment_id = %s AND status = 'booked'
    """, (appt_id,))
    if not rows:
        return jsonify({'error': 'no booked appointment with that id'}), 404

    new_end = new_start + timedelta(minutes=rows[0]['minutes'])
    if has_conflict(rows[0]['staff_id'], new_start, new_end, exclude_appt_id=appt_id):
        return jsonify({'error': 'SLOT UNAVAILABLE'}), 409

    execute_query(conn, "UPDATE Appointment SET start_time = %s, end_time = %s "
                        "WHERE appointment_id = %s", (new_start, new_end, appt_id))
    return jsonify({'confirmation_number': f"BB-{appt_id:06d}",
                    'appointment_date': new_start.strftime("%Y-%m-%d"),
                    'appointment_time': new_start.strftime("%H:%M:%S")})


# 6c. Cancel appointment
@app.route('/api/appointments/<int:appt_id>/cancel', methods=['POST'])
def cancel_appointment(appt_id):
    affected, _ = execute_query(conn, "UPDATE Appointment SET status = 'canceled' "
                                      "WHERE appointment_id = %s AND status = 'booked'", (appt_id,))
    if affected == 0:
        return jsonify({'error': 'no booked appointment with that id'}), 404
    return jsonify({'canceled': f"BB-{appt_id:06d}"})


# 7. View appointment history
@app.route('/api/customers/<int:customer_id>/appointments', methods=['GET'])
def appointment_history(customer_id):
    rows = execute_read_query(conn, """
        SELECT a.customer_id,
               DATE(a.start_time) AS appointment_date,
               TIME(a.start_time) AS appointment_time,
               sv.name AS service_name,
               aps.price_at_booking AS cost,
               COALESCE(p.status, 'unpaid') AS payment_status
        FROM Appointment a
        JOIN Appointment_Service aps ON a.appointment_id = aps.appointment_id
        JOIN Service sv ON aps.service_id = sv.service_id
        LEFT JOIN Payment p ON p.appointment_id = a.appointment_id
        WHERE a.customer_id = %s
        ORDER BY a.start_time DESC
    """, (customer_id,))
    return jsonify(clean(rows))


# 8. Delete customer and everything tied to them (all-or-nothing)
@app.route('/api/customers/<int:customer_id>', methods=['DELETE'])
def delete_customer(customer_id):
    statements = [
        "DELETE FROM Review WHERE customer_id = %s",
        "DELETE FROM User_Upload WHERE customer_id = %s",
        """DELETE FROM Payment
           WHERE order_id IN (SELECT order_id FROM Orders WHERE customer_id = %s)
              OR appointment_id IN (SELECT appointment_id FROM Appointment WHERE customer_id = %s)""",
        "DELETE FROM Order_Item WHERE order_id IN (SELECT order_id FROM Orders WHERE customer_id = %s)",
        "DELETE FROM Orders WHERE customer_id = %s",
        "DELETE FROM Cart_Item WHERE cart_id IN (SELECT cart_id FROM Cart WHERE customer_id = %s)",
        "DELETE FROM Cart WHERE customer_id = %s",
        """DELETE FROM Appointment_Service
           WHERE appointment_id IN (SELECT appointment_id FROM Appointment WHERE customer_id = %s)""",
        "DELETE FROM Appointment WHERE customer_id = %s",
        "DELETE FROM Customer WHERE customer_id = %s",
    ]
    cursor = conn.cursor()
    try:
        for sql in statements:
            cursor.execute(sql, (customer_id,) * sql.count('%s'))
        customer_deleted = cursor.rowcount  # rowcount of the final statement
        if customer_deleted == 0:
            conn.rollback()
            return jsonify({'error': 'customer not found'}), 404
        conn.commit()
        return jsonify({'deleted_customer_id': customer_id})
    except Error:
        conn.rollback()
        raise
    finally:
        cursor.close()

app.run()
#####################################################
#                                                   #
#                                                   #
#                  CREATE FUNCTIONS                 #
#                                                   #
#                                                   #
#####################################################

#pending update
@app.route('/create', methods=['POST'])
def create():
    data = request.get_json()
    name = data['name']
    email = data['email']
    phone = data['phone']
    address = data['address']
    
    query = f"INSERT INTO users (name, email, phone, address) VALUES ('{name}', '{email}', '{phone}', '{address}')"
    
    try:
        execute_query(conn, query)
        return jsonify({"message": "User created successfully"}), 201
    except Error as e:
        return jsonify({"error": str(e)}), 400

@app.route('/create_day_off', methods=['POST'])
def create_day_off():
    data = request.get_json()
    staff_id = data['staff_id']
    slot_start = data['slot_start']
    slot_end = data['slot_end']
    is_blocked = data['is_blocked'] 
    
    query = f"""INSERT INTO Time_Slot ( 

    staff_id, 

    slot_start, 

    slot_end, 

    is_blocked 

) 

VALUES ( 

    {staff_id}, 

    '{slot_start}', 

    '{slot_end}', 

    {is_blocked} 

); """
    
    try:
        execute_query(conn, query)
        return jsonify({"message": "User created successfully"}), 201
    except Error as e:
        return jsonify({"error": str(e)}), 400



#####################################################
#                                                   #
#                                                   #
#                  READ FUNCTIONS                   #
#                                                   #
#                                                   #
#####################################################

#pending update
@app.route('/read', methods=['GET'])
def read():
    query = "SELECT * FROM users"
    
    try:
        result = execute_read_query(conn, query)
        return jsonify(result), 200
    except Error as e:
        return jsonify({"error": str(e)}), 400

@app.route('/read_upcoming_appointments', methods=['GET'])
def read_upcoming_appointments():
    query = """USE barbershop; 

  

SELECT 

    a.appointment_id, 

    CONCAT(c.first_name, ' ', c.last_name) 

        AS customer_name, 

    c.phone, 

    DATE(a.start_time) AS appointment_date, 

    TIME(a.start_time) AS appointment_time, 

    GROUP_CONCAT(s.name SEPARATOR ', ') 

        AS services, 

    SUM(aps.price_at_booking) AS total_price, 

    a.status 

FROM Appointment a 

JOIN Customer c 

    ON a.customer_id = c.customer_id 

JOIN Appointment_Service aps 

    ON a.appointment_id = aps.appointment_id 

JOIN Service s 

    ON aps.service_id = s.service_id 

WHERE a.start_time >= NOW() 

    AND a.status = 'booked' 

GROUP BY 

    a.appointment_id, 

    c.first_name, 

    c.last_name, 

    c.phone, 

    a.start_time, 

    a.status 

ORDER BY a.start_time ASC; """
    
    try:
        result = execute_read_query(conn, query)
        return jsonify(result), 200
    except Error as e:
        return jsonify({"error": str(e)}), 400

@app.route('/read_appointments_per_week', methods=['GET'])
def read_appointments_per_week():
    query = """SELECT 

    a.appointment_id, 

    DATE(a.start_time) AS appointment_date, 

    TIME(a.start_time) AS appointment_time, 

    CONCAT(c.first_name, ' ', c.last_name) 

        AS customer_name, 

    GROUP_CONCAT(s.name SEPARATOR ', ') 

        AS services, 

    a.status AS appointment_status, 

    SUM(aps.price_at_booking) AS total_price 

FROM Appointment a 

JOIN Customer c 

    ON a.customer_id = c.customer_id 

JOIN Appointment_Service aps 

    ON a.appointment_id = aps.appointment_id 

JOIN Service s 

    ON aps.service_id = s.service_id 

WHERE a.start_time >= '2026-11-09' 

  AND a.start_time < '2026-11-16' 

GROUP BY 

    a.appointment_id, 

    a.start_time, 

    c.first_name, 

    c.last_name, 

    a.status 

ORDER BY a.start_time; """
    
    try:
        result = execute_read_query(conn, query)
        return jsonify(result), 200
    except Error as e:
        return jsonify({"error": str(e)}), 400

@app.route('/read_customer_details', methods=['GET'])
def read_customer_details():
    query = """SELECT 

    CONCAT(c.first_name, ' ', c.last_name) 

        AS customer_name, 

    c.phone, 

    c.email, 

    a.appointment_id, 

    DATE(a.start_time) AS appointment_date, 

    TIME(a.start_time) AS appointment_time, 

    GROUP_CONCAT(s.name SEPARATOR ', ') 

        AS services, 

    TIMESTAMPDIFF( 

        MINUTE, a.start_time, a.end_time 

    ) AS duration_minutes, 

    a.notes AS customer_notes 

FROM Customer c 

LEFT JOIN Appointment a 

    ON c.customer_id = a.customer_id 

LEFT JOIN Appointment_Service aps 

    ON a.appointment_id = aps.appointment_id 

LEFT JOIN Service s 

    ON aps.service_id = s.service_id 

WHERE c.customer_id = 1 

GROUP BY 

    c.customer_id, 

    c.first_name, 

    c.last_name, 

    c.phone, 

    c.email, 

    a.appointment_id, 

    a.start_time, 

    a.end_time, 

    a.notes 

ORDER BY a.start_time DESC; """
    
    try:
        result = execute_read_query(conn, query)
        return jsonify(result), 200
    except Error as e:
        return jsonify({"error": str(e)}), 400

@app.route('/read_customers', methods=['GET'])
def read_customers():
    query = """SELECT 

    c.customer_id, 

    CONCAT(c.first_name, ' ', c.last_name) 

        AS customer_name, 

    c.phone, 

    c.email 

FROM Customer c;"""
    
    try:
        result = execute_read_query(conn, query)
        return jsonify(result), 200
    except Error as e:
        return jsonify({"error": str(e)}), 400


@app.route('/read_services', methods=['GET'])
def read_services():
    query = """SELECT 

    name AS service_name, 

    description, 

    price AS cost, 

    duration_minutes AS estimated_duration 

FROM Service;"""
    
    try:
        result = execute_read_query(conn, query)
        return jsonify(result), 200
    except Error as e:
        return jsonify({"error": str(e)}), 400

@app.route('/read_time_off', methods=['GET'])
def read_time_off():
    #requires inputs
    query = """SELECT 

    slot_id, 

    DATE(slot_start) AS day_off_date, 

    TIME(slot_start) AS start_time, 

    TIME(slot_end) AS end_time 

FROM Time_Slot 

WHERE staff_id = 1 

  AND is_blocked = 1 

ORDER BY slot_start;"""
    
    try:
        result = execute_read_query(conn, query)
        return jsonify(result), 200
    except Error as e:
        return jsonify({"error": str(e)}), 400


@app.route('/read_appointment_details', methods=['GET'])
def read_appointment_details():
    query = """SELECT 

    a.appointment_id, 

    CONCAT(c.first_name, ' ', c.last_name) 

        AS customer_name, 

    c.phone, 

    a.status AS appointment_status, 

    DATE(a.start_time) AS appointment_date, 

    TIME(a.start_time) AS appointment_time, 

    TIMESTAMPDIFF( 

        MINUTE, a.start_time, a.end_time 

    ) AS duration_minutes, 

    a.notes, 

    ( 

        SELECT GROUP_CONCAT( 

            s.name SEPARATOR ', ' 

        ) 

        FROM Appointment_Service aps 

        JOIN Service s 

            ON aps.service_id = s.service_id 

        WHERE aps.appointment_id = a.appointment_id 

    ) AS services, 

    ( 

        SELECT SUM(aps.price_at_booking) 

        FROM Appointment_Service aps 

        WHERE aps.appointment_id = a.appointment_id 

    ) AS appointment_price, 

    ( 

        SELECT GROUP_CONCAT( 

            u.file_url SEPARATOR ', ' 

        ) 

        FROM User_Upload u 

        WHERE u.appointment_id = a.appointment_id 

    ) AS reference_photos 

FROM Appointment a 

JOIN Customer c 

    ON a.customer_id = c.customer_id 

WHERE a.appointment_id = 1; """
    
    try:
        result = execute_read_query(conn, query)
        return jsonify(result), 200
    except Error as e:
        return jsonify({"error": str(e)}), 400

@app.route('/read_appointments', methods=['GET'])
def read_appointments():
    query = """SELECT 

    a.appointment_id, 

    DATE(a.start_time) AS appointment_date, 

    TIME(a.start_time) AS appointment_time, 

    CONCAT(c.first_name, ' ', c.last_name) 

        AS customer_name, 

    c.phone, 

    GROUP_CONCAT(s.name SEPARATOR ', ') 

        AS services, 

    SUM(aps.price_at_booking) AS appointment_price, 

    a.status AS appointment_status, 

    COALESCE( 

        (SELECT 

            CASE 

                WHEN SUM(p.status = 'succeeded') > 0 

                    THEN 'succeeded' 

                WHEN SUM(p.status = 'pending') > 0 

                    THEN 'pending' 

                WHEN SUM(p.status = 'refunded') > 0 

                    THEN 'refunded' 

                WHEN SUM(p.status = 'failed') > 0 

                    THEN 'failed' 

            END 

         FROM Payment p 

         WHERE p.appointment_id = a.appointment_id), 

        'Unpaid' 

    ) AS payment_status 

FROM Appointment a 

JOIN Customer c 

    ON a.customer_id = c.customer_id 

JOIN Appointment_Service aps 

    ON a.appointment_id = aps.appointment_id 

JOIN Service s 

    ON aps.service_id = s.service_id 

GROUP BY 

    a.appointment_id, 

    a.start_time, 

    c.first_name, 

    c.last_name, 

    c.phone, 

    a.status 

ORDER BY a.start_time; """
    
    try:
        result = execute_read_query(conn, query)
        return jsonify(result), 200
    except Error as e:
        return jsonify({"error": str(e)}), 400


#####################################################
#                                                   #
#                                                   #
#                  UPDATE FUNCTIONS                 #
#                                                   #
#                                                   #
#####################################################

#pending update
@app.route('/update', methods=['PUT'])
def update():
    data = request.get_json()
    user_id = data['id']
    name = data['name']
    email = data['email']
    phone = data['phone']
    address = data['address']
    
    query = f"UPDATE users SET name='{name}', email='{email}', phone='{phone}', address='{address}' WHERE id={user_id}"
    
    try:
        execute_query(conn, query)
        return jsonify({"message": "User updated successfully"}), 200
    except Error as e:
        return jsonify({"error": str(e)}), 400

@app.route('/update_weekly_hours', methods=['PUT'])
def update_weekly_hours():
    data = request.get_json()
    staff_id = data['staff_id']
    day_of_week = data['day_of_week']
    start_time = data['start_time']
    end_time = data['end_time']
    is_open = data['is_open']

    query = f"""INSERT INTO Weekly_Hours ( 

    staff_id, 

    day_of_week, 

    start_time, 

    end_time, 

    is_open 

) 

VALUES ( 

    {staff_id}, {day_of_week}, {start_time}, {end_time}, {is_open} 

) 

#ON DUPLICATE KEY UPDATE 

    #start_time = '09:00:00', 

   # end_time = '18:00:00', 

    #is_open = TRUE;"
    """

    try:
        execute_query(conn, query)
        return jsonify({"message": "User updated successfully"}), 200
    except Error as e:
        return jsonify({"error": str(e)}), 400

@app.route('/update_service', methods=['PUT'])
def update_service():
    data = request.get_json()
    name = data['name']
    description = data['description']
    price = data['price']
    duration_minutes = data['duration_minutes']
    service_id = data['service_id'] 

    query = f"""UPDATE Service 

SET 

    name = {name}, 

    description = {description}, 

    price = {price}, 

    duration_minutes = {duration_minutes} 

WHERE service_id = {service_id};"""
    
    try:
        execute_query(conn, query)
        return jsonify({"message": "Service updated successfully"}), 200
    except Error as e:
        return jsonify({"error": str(e)}), 400



#####################################################
#                                                   #
#                                                   #
#               DEACTIVATE FUNCTIONS                #
#                                                   #
#                                                   #
#####################################################

#this is a destructive operation. can be changed to a soft delete by adding an active column to the table and setting it to 0 instead of deleting the record

@app.route('/deactivate', methods=['PUT'])
def deactivate():
    data = request.get_json()
    user_id = data['id']
    
    query = f"UPDATE users SET active=0 WHERE id={user_id}"
    
    try:
        execute_query(conn, query)
        return jsonify({"message": "User deactivated successfully"}), 200
    except Error as e:
        return jsonify({"error": str(e)}), 400
