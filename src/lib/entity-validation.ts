/**
 * Shared validation helpers for entity-referencing API routes (spec §5.1).
 *
 * Deliberately dependency-free (no zod): this runs inside the Node route
 * handlers where a regex is all we need, and keeping it import-free means the
 * module is safe to pull into any environment without dragging a validation
 * library into the bundle.
 */

/**
 * Matches the canonical 8-4-4-4-12 hex UUID shape — i.e. exactly what
 * PostgreSQL's `uuid` type accepts. Version and variant nibbles are left
 * unchecked on purpose: we must never reject an id we previously stored (nil
 * UUIDs, future v7 ids, …), while still rejecting arbitrary strings *before*
 * they reach a query and surface as an opaque FK/type 500.
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when `value` is a syntactically valid UUID string. */
export function isValidUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}
