import mysql.connector
from mysql.connector import Error

def create_connection(hostname, username, userpw, database, port=3306):
    connection = None
    try:  # can fail if the credentials are wrong or the database is not running
        connection = mysql.connector.connect(
            host=hostname,
            user=username,
            password=userpw,
            database=database,
            port=port,
        )
        print("Connection successful")
    except Error as e:
        print(f"Error {e} occured")
    return connection  # used to interact with the database


def execute_query(connection, query, var=None, commit=True):
    """Runs INSERT / UPDATE / DELETE. Returns (rows_affected, last_insert_id).

    Pass commit=False when the statement is part of a larger transaction;
    the caller then commits or rolls back the whole transaction.
    """
    cursor = connection.cursor()
    try:
        cursor.execute(query, var)
        if commit:
            connection.commit()  # save changes to the database
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