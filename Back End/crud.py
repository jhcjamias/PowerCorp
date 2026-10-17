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