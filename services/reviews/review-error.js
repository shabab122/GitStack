export class ReviewError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "ReviewError";
    this.statusCode = statusCode;
  }
}
