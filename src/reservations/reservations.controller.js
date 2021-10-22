const asyncErrorBoundary = require("../errors/asyncErrorBoundary");
const service = require("./reservations.service");

const REQUIRED_PROPERTIES = [
  "first_name",
  "last_name",
  "mobile_number",
  "reservation_date",
  "reservation_time",
  "people",
];

const VALID_PROPERTIES = [
  ...REQUIRED_PROPERTIES,
  "reservation_id",
  "created_at",
  "updated_at",
  "status",
];

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

  // Validate that the date is in the correct format
  if (!data.reservation_date.match(/\d\d\d\d-\d\d-\d\d/))
    return next({
      status: 400,
      message: `The reservation_date property (${data.reservation_date}) must be a valid date in the format of YYYY-MM-DD`,
    });

  // Validate that the time is in the correct format
  if (!data.reservation_time.match(/^\d\d:\d\d/))
    return next({
      status: 400,
      message: `The reservation_time property (${data.reservation_time}) must be a valid time in the format of HH:MM.`,
    });

  const datetime = `${data.reservation_date}T${data.reservation_time}`;
  if (Number.isNaN(Date.parse(datetime))) {
    return next({
      status: 400,
      message: `The reservation_date and reservation_time property do not make a valid Date-Time string (${datetime}).`,
    });
  }

  // Validate that people is a number
  if (typeof data.people !== "number")
    return next({
      status: 400,
      message: `The people property (${
        data.people
      } of type ${typeof data.people}) must be a number.`,
    });

  res.locals.newReservation = data;
  return next();
}

/**
 * Validation Middleware only for POST requests with new Reservations
 * If an optional status is added, only allow it to post if the value is 'booked'
 * on PUT requests, instead use validateUpdateStatus middleware
 */
function validateNewStatus(req, res, next) {
  const { status = "booked" } = res.locals.newReservation;
  if (status !== "booked")
    return next({
      status: 400,
      message: `Status cannot be set to '${status}'. When creating a reservation, it must have the default status of 'booked', or no status at all.`,
    });
  return next();
}

/**
 * Middleware validation for request bodies
 * Ensures the request body only has properties that are allowed before proceeding
 */
function bodyHasNoInvalidFields(req, res, next) {
  const { newReservation } = res.locals;
  const invalidFields = Object.keys(newReservation).filter(
    (field) => !VALID_PROPERTIES.includes(field)
  );

  if (invalidFields.length) {
    return next({
      status: 400,
      message: `Invalid field(s): ${invalidFields.join(", ")}`,
    });
  }
  return next();
}
/**
 * Middleware validation for reservation_date and reservation_time properties
 * This middleware will always come after the two generic validations
 * Therefore both properties will exist inside of req.body.data with proper formatting
 *
 * This validation ensures the date and time are not in the past
 * And that both are during a time that the restaurant is open
 *
 * Restaurant's operational dates and times are set at the start of this function
 */
function validateDateTime(req, res, next) {
  // 0 is Sunday -- 6 is Saturday
  const closedDays = { 2: "Tuesday" }; // Days the restaurant is closed -- Restaurant is currently closed on only closed on Tuesdays (2)
  const startTime = "10:30"; // Start time is the target date at opening time
  const closeTime = "21:30"; // End time is the target date an hour before closing time

  const { reservation_date, reservation_time } = res.locals.newReservation;
  const date = new Date(`${reservation_date}T${reservation_time}`);
  const today = new Date();

  // If the reservation is in the past, throw an error
  if (Date.parse(date) <= Date.parse(today))
    return next({
      status: 400,
      message: `Your reservation cannot be made for a date or time of the past. Please select a future date.`,
    });

  // If the restaurant is closed on that day, generate the appropriate error message
  if (closedDays[date.getDay()]) {
    return next({
      status: 400,
      message: _generateClosedMessage(closedDays, date.getDay()),
    });
  }

  const startDateTime = new Date(`${reservation_date}T${startTime}`); // Date-time with target date and startTime
  const closeDateTime = new Date(`${reservation_date}T${closeTime}`); //

  // If the restaurant isn't taking reservations for that time, throw an error
  if (
    Date.parse(date) < Date.parse(startDateTime) ||
    Date.parse(date) > Date.parse(closeDateTime)
  ) {
    return next({
      status: 400,
      message: `Your reservation cannot be made for that time (${reservation_time}). The restaurant is only taking reservations between ${startTime} and ${closeTime}`,
    });
  }

  return next();
}

/**
 *
 * @param closedDays
 *  an object who's keys are the dayNumber where 0 is sunday
 *  and who's values are the string for the day, such as "Sunday"
 * @param selectedDay
 *  the dayNumber for the date the user has entered
 * @returns
 *  the generated message informing the user what day they have selected and which days the restaurant is closed on.
 */
function _generateClosedMessage(closedDays, selectedDay) {
  // An array of all names of the days the resetaurant is closed
  const closedDayNames = Object.values(closedDays);

  // First sentence
  let closedMessage = `The date you have selected is a ${closedDays[selectedDay]}. `;
  // Start of second sentence
  closedMessage += "The restaurant is closed on ";

  // If the array contains more than 1 dayName, join all of the names with a plural "s" comma except for the last one
  if (closedDayNames.length > 1)
    closedMessage += closedDayNames.slice(0, -1).join("s, ");

  // if the array is more than 2 elements, english grammar dictates there be another comma
  if (closedDayNames.length > 2) closedMessage += "s,";

  // if the array has exactly 2 elements, then add the plural "s" before the " and "
  if (closedDayNames.length === 2) closedMessage += "s";

  // if the array has more than one element, we add a final " and " before listing the last element
  if (closedDayNames.length > 1) closedMessage += " and ";

  // Add the last element
  closedMessage += closedDayNames.slice(-1);

  return closedMessage + "s."; // Return the final message with a plural "s" and a period at the end
}

/**
 * Middleware validation for request parameters
 * Ensures that the reservation_id param corresponds to a valid reservation
 */
async function reservationExists(req, res, next) {
  const { reservation_id } = req.params;
  const reservation = await service.read(reservation_id);

  if (!reservation)
    return next({
      status: 404,
      message: `Reservation ${reservation_id} cannot be found.`,
    });

  res.locals.reservation = reservation;
  return next();
}

/**
 * Middleware validation for the request bodies
 * Ensures that the request body has a status field
 * And Ensures that the status is a valid status
 * Used for updateStatus() requests
 */
function validateUpdateStatus(req, res, next) {
  const { data: { status } = {} } = req.body;
  const { reservation } = res.locals;
  const validStatuses = ["booked", "seated", "finished", "cancelled"];

  // There must be a status in the request body
  if (!status)
    return next({
      status: 400,
      message: `The data in the request body requires a status field.`,
    });

  // Status must be a valid value
  if (!validStatuses.includes(status))
    return next({
      status: 400,
      message: `${status} is an invalid status. The only valid statuses are: '${validStatuses.join(
        "', '"
      )}'.`,
    });

  // Finished and Cancelled reservations are archived, therefore should be uneditable
  if (reservation.status === "finished" || reservation.status === "cancelled")
    return next({
      status: 400,
      message: `A '${reservation.status}' reservation cannot be updated. If you must book this reservation again, please make a new reservation instead.`,
    });

  // Seated reservations can only be updated if they are being set to finished
  if (reservation.status === "seated" && status !== "finished")
    return next({
      status: 400,
      message: `A 'seated' reservation can not be updated to '${status}'. Seated reservations can only have their status changed to 'finished'.`,
    });

  res.locals.status = status;
  return next();
}

/**
 * Validation middleware for update Reservations
 * Ensures that uneditable properties are not being changed
 * And forces update_at to become the new date
 */
function validateReservationUpdate(req, res, next) {
  const {
    reservation: { reservation_id: id, created_at: created },
    newReservation,
  } = res.locals;

  const {
    reservation_id: newId = id,
    created_at: newCreated = created.toISOString(),
  } = newReservation;

  // reservation_id must match or be omitted from the request body
  if (id !== newId)
    return next({
      status: 400,
      message: `You are attempting to change this reservation's id from ${id} to ${newId}. You cannot change a reservation's id.`,
    });

  // created_at must match or be omitted from the request body
  if (created.toISOString() !== newCreated)
    return next({
      status: 400,
      message: `You cannot alter the date this reservation was created on. Either remove 'created_at' from the request body or ensure it matches the original date`,
    });

  // Updated_at will always be set to the current date, regardless of the request body
  newReservation.updated_at = new Date();

  return next();
}

/**
 * Middleware validation for list Reservations
 * Ensures that all queries on the request are valid
 * If there is no query, this middleware is skipped
 */
function validateReqQueries(req, res, next) {
  const { query } = req;

  // Skip this middleware if there are no queries
  if (!query) return next();

  const invalidQueries = Object.keys(query).filter(
    (property) => !VALID_PROPERTIES.includes(property) && property !== "date"
  );

  if (invalidQueries.length) {
    return next({
      status: 400,
      message: `Invalid queries: '${invalidQueries.join("', '")}'`,
    });
  }
  return next();
}

/**
 * List handler for reservation resources with two variants based on the provided queries
 * If any of the queries are a date query: list all reservation with exact matching reservation_date properties sorted by time
 * Otherwise list all the reservations that have matching data to the provided queries sorted by date
 * (If no queries are provided, searchByProperty will return all reservations sorted by id)
 */
async function list(req, res) {
  const { date: reservation_date } = req.query;
  const data = reservation_date
    ? await service.searchByDate(reservation_date)
    : await service.searchByProperty(req.query);
  res.json({ data });
}

/**
 * Create handler for new Reservations
 */
async function create(req, res) {
  const { newReservation } = res.locals;
  const data = await service.create(newReservation);
  res.status(201).json({ data });
}

/**
 * Read handler for reading a specified Reservation
 */
async function read(req, res) {
  res.json({ data: res.locals.reservation });
}

/**
 * Update handler for editing entire reservation
 */
async function update(req, res) {
  const { reservation, newReservation } = res.locals;
  const data = await service.update(reservation.reservation_id, newReservation);
  res.json({ data });
}

/**
 * Update handler for updating reservation status
 */
async function updateStatus(req, res) {
  const { status, reservation } = res.locals;
  const data = await service.updateStatus(reservation.reservation_id, status);
  res.json({ data });
}

module.exports = {
  list: [validateReqQueries, asyncErrorBoundary(list)],
  create: [
    bodyHasAllRequiredFields,
    bodyHasNoInvalidFields,
    validateNewStatus,
    validateDateTime,
    asyncErrorBoundary(create),
  ],
  read: [asyncErrorBoundary(reservationExists), read],
  update: [
    asyncErrorBoundary(reservationExists),
    bodyHasAllRequiredFields,
    bodyHasNoInvalidFields,
    validateDateTime,
    validateReservationUpdate,
    validateUpdateStatus,
    asyncErrorBoundary(update),
  ],
  updateStatus: [
    asyncErrorBoundary(reservationExists),
    validateUpdateStatus,
    asyncErrorBoundary(updateStatus),
  ],
};
