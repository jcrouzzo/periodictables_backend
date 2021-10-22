const db = require("../db/connection");
const tableName = "tables";
/**
 * List query fetches all of the table data sorted by table_name
 */
function list() {
  return db(tableName).select("*").orderBy("table_name");
}

/**
 * Create inserts a new Table into the table data
 * and returns the inserted object
 */
function create(table) {
  return db(tableName)
    .insert(table)
    .returning("*")
    .then((rows) => rows[0]);
}

/**
 * Returns a selected table from the database
 * Can be used to validate table_id in the controller
 */
function read(table_id) {
  return db(tableName).where({ table_id }).first();
}

/**
 * Assign a foreign key reservation_id to the corresponding table
 * sets the table to be occupied
 * and returns the entire updated object
 */
function assignReservation(reservation_id, table_id) {
  return db(tableName)
    .where({ table_id })
    .update({ occupied: true, reservation_id }, "*")
    .then((rows) => rows[0]);
}

/**
 * Assign the former foreign key reservation_id to NULL
 * sets the table to be unoccupied
 * and returns the entire updated object
 */
function deleteReservation(table_id) {
  return db(tableName)
    .where({ table_id })
    .update({ occupied: false, reservation_id: null })
    .then((rows) => rows[0]);
}

module.exports = { list, create, read, assignReservation, deleteReservation };
