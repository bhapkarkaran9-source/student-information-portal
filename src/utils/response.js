/**
 * Standardized API Response Utilities
 */

const successResponse = (res, statusCode = 200, message = 'Success', data = null) => {
  const response = {
    success: true,
    status: 'SUCCESS',
    message
  };
  if (data !== null) {
    response.data = data;
  }
  return res.status(statusCode).json(response);
};

const errorResponse = (res, statusCode = 500, message = 'An error occurred', error = null) => {
  const response = {
    success: false,
    status: 'ERROR',
    message
  };
  if (error && process.env.NODE_ENV === 'development') {
    response.error = error;
  }
  return res.status(statusCode).json(response);
};

module.exports = {
  successResponse,
  errorResponse
};
