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