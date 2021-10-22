const asyncErrorBoundary = require("../errors/asyncErrorBoundary");
const service = require("./tables.service");
const reservationService = require("../reservations/reservations.service");

const REQUIRED_PROPERTIES = ["table_name", "capacity"];
const VALID_PROPERTIES = [...REQUIRED_PROPERTIES, "reservation_id"];

/**
 * Middleware validation for request bodies
 * Ensures the request body has all the necessary properties before proceeding
 * Then also ensures all of the required data is of the correct data type
 */
function bodyHasAllRequiredFields(req, res, next) {
  const { data = {} } = req.body;

  for (let property of REQUIRED_PROPERTIES) {
    if (!data[property])
      return next({
        status: 400,
        message: `The data in the request body requires a ${property} field.`,
      });
  }

  if (data.table_name.length < 2)
    return next({
      status: 400,
      message: `The 'table_name' property must have a length of two or greater`,
    });

  if (typeof data.capacity !== "number" || data.capacity < 1)
    return next({
      status: 400,
      message: `The 'capacity' property must be a number that is 1 or greater`,
    });

  res.locals.table = data;
  return next();
}

/**
 * Middleware validation for request bodies
 * Ensures the request body only has properties that are allowed before proceeding
 */
function bodyHasNoInvalidFields(req, res, next) {
  const { table } = res.locals;
  const invalidFields = Object.keys(table).filter(
    (field) => !VALID_PROPERTIES.includes(field)
  );

  if (invalidFields.length) {
    return next({
      status: 400,
      message: `Invalid field(s): ${invalidFields.join(", ")}`,
    });
  }

  // Occupied property must be a non-null boolean, and will only be true if there is a reservation_id
  table.occupied = !!table.reservation_id;
  return next();
}

/**
 * Middleware validation for request parameters
 * Ensures that the table_id param corresponds to a valid table
 */
async function tableExists(req, res, next) {
  const { table_id = null } = req.params;
  const table = await service.read(req.params.table_id);

  if (!table)
    return next({ status: 404, message: `Table ${table_id} cannot be found.` });

  res.locals.table = table;
  return next();
}

/**
 * Middleware Validation that requires the request body to have a reservation_id property
 * Currently only used for request bodies when assigning a reservation ID to the table with assignReservation()
 * Works best when followed by isValidReservation() middleware
 */
function hasReservationId(req, res, next) {
  const { data: { reservation_id } = {} } = req.body;

  if (!reservation_id)
    return next({
      status: 400,
      message: `The data in the request body requires a reservation_id property.`,
    });
  return next();
}

/**
 * Middleware validation for ensuring reservationIds are valid before assigning them to a foreign key
 * When updating with a reservation, or adding a table that has a reservation we must ensure it is a valid reservation
 * NOTE: This middleware will skip itself if there is no reservation_id in the req.body, for validating that see hasReservationId() above
 */
async function isValidReservation(req, res, next) {
  const { data: { reservation_id } = {} } = req.body;

  // Skip this validation if there is no reservation_id
  if (!reservation_id) return next();

  const reservation = await reservationService.read(reservation_id);
  if (!reservation)
    return next({
      status: 404,
      message: `Reservation ${reservation_id} cannot be found.`,
    });

  res.locals.reservation = reservation;
  return next();
}

/**
 * Validation middleware to ensure that the table can accomodate the reservation
 * The table must not be occupied, and must have enough seats to sit everyone in the reservation
 */
function hasAppropriateSeating(req, res, next) {
  const { reservation, table } = res.locals;
  if (table.occupied)
    return next({
      status: 400,
      message: `"${table.table_name}" (#${table.table_id}) is currently occupied, and cannot be seated.`,
    });

  if (reservation.people > table.capacity)
    return next({
      status: 400,
      message: `"${table.table_name}" (#${table.table_id}) has a maximum capacity of ${table.capacity}. This table cannot accomodate the ${reservation.people} people in reservation #${reservation.reservation_id}.`,
    });
  return next();
}
/**
 * Validation middleware to make sure the table is currently occupied
 * We cannot unseat a table that is vacant, it MUST be occupied
 */
function tableIsOccupied(req, res, next) {
  const { table } = res.locals;
  if (!table.occupied)
    return next({
      status: 400,
      message: `"${table.table_name}" (#${table.table_id}) is currently not occupied. A table must be occupied before it can be unseated.`,
    });
  return next();
}

/**
 * Middleware validation to ensure the current reservation has not already been seated,and is not finished
 * Already seated reservations cannot be seated elsewhere
 * Finished reservations are archived and cannot be seated
 */
async function isReservationSeatedAlready(req, res, next) {
  const { reservation } = res.locals;
  if (reservation.status === "seated")
    return next({
      status: 400,
      message:
        "This reservation has already been seated, and therefore cannot be seated elsewhere simultaneously.",
    });
  if (reservation.status === "finished")
    return next({
      status: 400,
      message:
        "This reservation is currently finished. Finished reservations are archived, and cannot be seated.",
    });
  return next();
}

/**
 * List handler for tables resource
 */
async function list(req, res) {
  const { date } = req.query;
  const data = await service.list(date);
  res.json({ data });
}

/**
 * Create handler for new Tables
 */
async function create(req, res) {
  const { table } = res.locals;
  const data = await service.create(table);
  res.status(201).json({ data });
}

/**
 * Read handler for reading a specified table
 */
function read(req, res) {
  res.json({ data: res.locals.table });
}

/**
 * Update handler for assigning a reservation to a Table
 */
async function assignReservation(req, res) {
  const { reservation_id } = res.locals.reservation;
  const { table_id } = res.locals.table;
  // When seating a table, we must set the reservation status to 'seated'
  await reservationService.updateStatus(reservation_id, "seated");
  const data = await service.assignReservation(reservation_id, table_id);
  res.json({ data });
}

/**
 * Delete handler for removing a reservation from a Table (unseating the table)
 * Despite being called a delete, this is really an update request
 */
async function deleteReservation(req, res) {
  const { reservation_id, table_id } = res.locals.table;
  // When unseating/finishing a table, we must set the reservation status to 'finished'
  await reservationService.updateStatus(reservation_id, "finished");
  const data = await service.deleteReservation(table_id);
  res.json({ data });
}

module.exports = {
  list: asyncErrorBoundary(list),
  create: [
    bodyHasAllRequiredFields,
    bodyHasNoInvalidFields,
    asyncErrorBoundary(isValidReservation),
    asyncErrorBoundary(create),
  ],
  read: [asyncErrorBoundary(tableExists), read],
  assignReservation: [
    asyncErrorBoundary(tableExists),
    hasReservationId,
    asyncErrorBoundary(isValidReservation),
    hasAppropriateSeating,
    isReservationSeatedAlready,
    asyncErrorBoundary(assignReservation),
  ],
  delete: [
    asyncErrorBoundary(tableExists),
    tableIsOccupied,
    asyncErrorBoundary(deleteReservation),
  ],
};
