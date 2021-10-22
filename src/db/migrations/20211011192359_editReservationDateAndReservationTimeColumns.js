exports.up = function (knex) {
  return knex.schema.alterTable("reservations", (table) => {
    table.date("reservation_date").notNullable().alter();
    table.time("reservation_time").notNullable().alter();
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("reservations", (table) => {
    table.string("reservation_date").notNullable().alter();
    table.string("reservation_time").notNullable().alter();
  });
};
