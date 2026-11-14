import mysql.connector
from mysql.connector import Error

def create_connection(hostname, username, userpw, database):
    connection = None
    try:  # can fail if the credentials are wrong or the database is not running
        connection = mysql.connector.connect(
            host=hostname,
            user=username,
            password=userpw,
            database=database
        )
        print("Connection successful")
    except Error as e:
        print(f"Error {e} occured")
    return connection  # used to interact with the database


def execute_query(connection, query, var=None):
    """Runs INSERT / UPDATE / DELETE. Returns (rows_affected, last_insert_id)."""
    cursor = connection.cursor()
    try:
        cursor.execute(query, var)
        connection.commit()  # save changes to the database
        print("Query executed successfully")
        return cursor.rowcount, cursor.lastrowid
    except Error as e:
        connection.rollback()
        print(f"Error {e} occured")
        raise  # lets the Flask route report the error
    finally:
        cursor.close()


def execute_read_query(connection, query, var=None):
    """Runs a SELECT. Returns a list of dictionaries."""
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute(query, var)
        return cursor.fetchall()
    except Error as e:
        print(f"Error {e} occured")
        raise
    finally:
        cursor.close()