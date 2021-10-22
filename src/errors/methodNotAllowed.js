/**
 * Method Not Allowed function for all requests that we do not currently support in the API
 */
function methodNotAllowed(req, res, next) {
    next({
      status: 405,
      message: `${req.method} not allowed for ${req.originalUrl}`,
    });
  }
  
  module.exports = methodNotAllowed;
  