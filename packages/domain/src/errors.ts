export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainError";
  }
}

export class OwnershipError extends DomainError {
  constructor(message = "Resource does not belong to the current owner") {
    super(message);
    this.name = "OwnershipError";
  }
}

export class PublicLinkDisabledError extends DomainError {
  constructor(message = "Public link is disabled") {
    super(message);
    this.name = "PublicLinkDisabledError";
  }
}

export class AppendOnlyViolationError extends DomainError {
  constructor(message = "Messages are append-only") {
    super(message);
    this.name = "AppendOnlyViolationError";
  }
}

export class NotFoundError extends DomainError {
  constructor(message = "Resource not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

export class SelfAccessGrantError extends DomainError {
  constructor(message = "Owners cannot grant access to themselves") {
    super(message);
    this.name = "SelfAccessGrantError";
  }
}
