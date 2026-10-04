export class BookingError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}
