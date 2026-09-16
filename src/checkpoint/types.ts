import { z } from 'zod';

export const CHECKPOINT_SCHEMA_VERSION = 1;

export type FileState =
  | {
      kind: 'missing';
    }
  | {
      kind: 'file';
      sha256: string;
      mode: number;
      size: number;
    };

export interface FileCheckpoint {
  relativePath: string;
  pre: FileState;
  post?: FileState;
  mutationCommitted: boolean;
}

export interface TurnCheckpoint {
  version: 1;
  workspaceHash: string;
  workspaceRoot: string;
  sessionId: string;
  turnId: string;
  status: 'pending' | 'committed' | 'abandoned';
  startedAt: string;
  completedAt?: string;
  files: FileCheckpoint[];
}

export interface SessionCheckpointManifest {
  version: 1;
  sessionId: string;
  workspaceHash: string;
  workspaceRoot: string;
  turns: TurnCheckpoint[];
}

export interface TurnPendingJournal {
  kind?: 'turn';
  version: 1;
  workspaceHash: string;
  workspaceRoot: string;
  sessionId: string;
  turnId: string;
  status: 'pending' | 'committed' | 'abandoned';
  startedAt: string;
  completedAt?: string;
  turnCount?: number;
  files: FileCheckpoint[];
}

export interface RewindPendingJournal {
  kind: 'rewind';
  version: 1;
  workspaceHash: string;
  workspaceRoot: string;
  sessionId: string;
  targetTurnId: string;
  keptTurnIds: string[];
  discardedTurnIds: string[];
  files: {
    relativePath: string;
    pre: FileState;
    post?: FileState;
  }[];
  phase: 'files-pending' | 'files-restored' | 'session-committed';
}

export type PendingJournal = TurnPendingJournal | RewindPendingJournal;

export const FileStateSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('missing'),
  }),
  z.object({
    kind: z.literal('file'),
    sha256: z.string(),
    mode: z.number(),
    size: z.number(),
  }),
]);

export const FileCheckpointSchema = z.object({
  relativePath: z.string(),
  pre: FileStateSchema,
  post: FileStateSchema.optional(),
  mutationCommitted: z.boolean(),
});

export const TurnCheckpointSchema = z.object({
  version: z.literal(1),
  workspaceHash: z.string(),
  workspaceRoot: z.string(),
  sessionId: z.string(),
  turnId: z.string(),
  status: z.enum(['pending', 'committed', 'abandoned']),
  startedAt: z.string(),
  completedAt: z.string().optional(),
  files: z.array(FileCheckpointSchema),
});

export const SessionCheckpointManifestSchema = z.object({
  version: z.literal(1),
  sessionId: z.string(),
  workspaceHash: z.string(),
  workspaceRoot: z.string(),
  turns: z.array(TurnCheckpointSchema),
});

export const RewindJournalSchema = z.object({
  kind: z.literal('rewind'),
  version: z.literal(1),
  workspaceHash: z.string(),
  workspaceRoot: z.string(),
  sessionId: z.string(),
  targetTurnId: z.string(),
  keptTurnIds: z.array(z.string()),
  discardedTurnIds: z.array(z.string()),
  files: z.array(
    z.object({
      relativePath: z.string(),
      pre: FileStateSchema,
      post: FileStateSchema.optional(),
    }),
  ),
  phase: z.enum(['files-pending', 'files-restored', 'session-committed']),
});

export const PendingJournalSchema = z.union([
  TurnCheckpointSchema.extend({
    kind: z.literal('turn').optional(),
    turnCount: z.number().optional(),
  }),
  RewindJournalSchema,
]);
