// An error whose message is safe to show to the user, with the HTTP status and
// machine-readable code the client should receive.
class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

module.exports = { AppError };
