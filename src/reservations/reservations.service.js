const db = require("../db/connection");
const tableName = "reservations";
/**
 * List query fetches all of the table reservations in the table
 * Sorted by their IDs in ascending order
 */
function list() {
  return db(tableName).select("*").orderBy("reservation_id", "ASC");
}

/**
 * Search query fetches all of the table data where reservation_date equals the passed in param
 * Sorted by the time of the reservation in ascending order
 */
function searchByDate(reservation_date) {
  return db(tableName)
    .select("*")
    .where({ reservation_date })
    .whereNot({ status: "finished" })
    .orderBy("reservation_time", "ASC");
}

/**
 * Dynamic search query fetches all of the table data filtered by the queriesObject and sorted by date
 * queriesObject is an object who's keys are the request query variable names, and values are the actual value of the variable
 * Can handle multiple simultaneous queries
 * searchByDate is distinct: it uses 'date' query sorts by time, and requires the date to be an exact match
 */
function searchByProperty(queriesObject) {
  const entries = Object.entries(queriesObject);
  if (!entries.find(([, value]) => !!value)) return list();

  let whereQuery = "";
  for (let i = 0; i < entries.length; i++) {
    const [name, value] = entries[i];
    whereQuery += `${name}::text ilike '%${value}%'`;
    if (i !== entries.length - 1) whereQuery += " AND ";
  }

  return db(tableName)
    .select("*")
    .where(db.raw(whereQuery))
    .orderBy("reservation_date", "DESC");
}
/**
 * Create inserts a new Reservation into the table data
 * and returns the inserted object
 */
function create(reservation) {
  return db(tableName)
    .insert(reservation)
    .returning("*")
    .then((rows) => rows[0]);
}

/**
 * Returns a selected reservation from the database
 * This is primarily used for debugging and for reservation validation in the tables.controller
 */
function read(reservation_id) {
  return db(tableName).where({ reservation_id }).first();
}

/**
 * Updates entire reservation for the selected reservation
 * and returns the entire updated object
 */
function update(reservation_id, reservation) {
  return db(tableName)
    .where({ reservation_id })
    .update(reservation, "*")
    .then((rows) => rows[0]);
}

/**
 * Updates status property of selected reservation
 * and returns the entire updated object
 */
function updateStatus(reservation_id, status) {
  return db(tableName)
    .where({ reservation_id })
    .update({ status }, "*")
    .then((rows) => rows[0]);
}

module.exports = {
  list,
  searchByDate,
  searchByProperty,
  create,
  read,
  update,
  updateStatus,
};
