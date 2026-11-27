/** Archive content that cannot be interpreted without guessing. */
export class NqArchiveDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NqArchiveDataError";
  }
}
