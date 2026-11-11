import mysql.connector
import flask
from mysql.connector import Error
from flask_cors import CORS
from flask import jsonify, request 

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