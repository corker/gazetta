/**
 * History / revisions for a target.
 *
 * Every write to a target (save or publish) records a revision. Undo and
 * rollback restore a prior revision — both are soft (forward-only; create
 * a new revision reverting to the past state, never destroy history).
 *
 * Storage layout per target (all inside the target's storage, in the
 * reserved `.gazetta/` namespace that the runtime never reads):
 *
 *   .gazetta/
 *     history/
 *       index.json              ordered revision list
 *       objects/<hh>/<rest>     content-addressed blobs, sharded by first 2 hex chars
 *       revisions/rev-NNNN.json revision manifest: metadata + item→hash map
 *
 * One uniform approach across all storage providers — the provider
 * interface remains read/write bytes at paths; no provider-native
 * versioning (S3 object versions, git commits) is used.
 *
 * This module declares the types and provider interface. Implementation
 * lands in a later phase.
 */

/** Operation that produced a revision. */
export type RevisionOperation = 'save' | 'publish' | 'rollback'

/** Metadata + item→hash snapshot for one write to a target. */
export interface Revision {
  /** Unique id, typically `rev-{NNNN}` with a zero-padded counter. */
  id: string
  /** ISO 8601 timestamp when the revision was recorded. */
  timestamp: string
  /** What kind of write this was. */
  operation: RevisionOperation
  /** Author identifier. Free-form for v1; upgrades to auth identity later. */
  author?: string
  /** Source target name, if this revision was produced by a publish from another target. */
  source?: string
  /** Paths of items affected by this write (e.g. `pages/home`, `fragments/header`). */
  items: string[]
  /** Optional human-readable note. */
  message?: string
  /** For rollback/restore: the revision id this one restored from. */
  restoredFrom?: string
}

/** Full revision manifest as stored in `revisions/rev-NNNN.json`. */
export interface RevisionManifest extends Revision {
  /**
   * Snapshot of the full content tree at this revision, as `path → content hash`.
   * The hash references a blob under `.gazetta/history/objects/`.
   * Unchanged items across revisions share blobs (content-addressed dedupe).
   */
  snapshot: Record<string, string>
}

/** Retention policy for a target's history. */
export interface HistoryRetention {
  /** Keep at most N most-recent revisions. Default: 50. Oldest evicted. */
  maxRevisions?: number
}

/**
 * Uniform history API. Implemented on top of any StorageProvider — reads
 * and writes bytes under `.gazetta/history/`.
 */
export interface HistoryProvider {
  /**
   * Record a new revision on the target.
   *
   * Implementation: writes any new item blobs to `objects/<hash>`, writes the
   * revision manifest to `revisions/rev-NNNN.json`, appends to `index.json`,
   * and applies retention (evicts oldest if over limit).
   */
  recordRevision(revision: Omit<Revision, 'id'>): Promise<Revision>

  /** List revisions, newest first. */
  listRevisions(limit?: number): Promise<Revision[]>

  /** Read a revision's full manifest (metadata + snapshot). */
  readRevision(id: string): Promise<RevisionManifest>

  /** Read a content blob by hash (e.g. to restore an item's state). */
  readBlob(hash: string): Promise<Uint8Array>

  /**
   * Delete a revision and its manifest. Orphaned blobs are garbage-collected
   * by the implementation (lazy or immediate, adapter's choice).
   */
  deleteRevision(id: string): Promise<void>
}

// Implementation (createHistoryProvider) lands in Phase 6. Earlier phases
// depend only on the HistoryProvider interface above (dependency inversion),
// so no factory stub is needed here.
