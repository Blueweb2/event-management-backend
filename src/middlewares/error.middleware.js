const errorHandler = (err, req, res, next) => {
  const statusCode = Number.isInteger(err?.statusCode) && err.statusCode >= 400
    ? err.statusCode
    : 500;

  const isProduction = process.env.NODE_ENV === "production";

  if (statusCode >= 500) {
    console.error("[Unhandled error]", {
      method: req.method,
      url: req.originalUrl,
      message: err?.message,
      stack: isProduction ? undefined : err?.stack,
    });
  } else {
    console.warn("[Request error]", {
      method: req.method,
      url: req.originalUrl,
      statusCode,
      message: err?.message,
    });
  }

  const message =
    statusCode >= 500 && isProduction
      ? "Internal server error"
      : err?.message || "Something went wrong";

  res.status(statusCode).json({
    success: false,
    message,
  });
};

module.exports = errorHandler;