import type {
  BashPermissionRequest,
  BashPermissionResponse,
  FilePermissionRequest,
  FilePermissionResponse,
} from '../../tools/types.js';

export type QueuedPermissionItem =
  | {
      id: string;
      kind: 'bash';
      request: BashPermissionRequest;
      resolve: (res: BashPermissionResponse) => void;
      abortSignal?: AbortSignal;
      settled: boolean;
    }
  | {
      id: string;
      kind: 'file';
      request: FilePermissionRequest;
      resolve: (res: FilePermissionResponse) => void;
      abortSignal?: AbortSignal;
      settled: boolean;
    };

export interface PermissionQueueOptions {
  onShow: (item: QueuedPermissionItem) => void;
  onHide: () => void;
}

export class PermissionQueue {
  private queue: QueuedPermissionItem[] = [];
  private activeItem: QueuedPermissionItem | null = null;
  private onShow: (item: QueuedPermissionItem) => void;
  private onHide: () => void;
  private nextId = 1;

  constructor(options: PermissionQueueOptions) {
    this.onShow = options.onShow;
    this.onHide = options.onHide;
  }

  public get active(): QueuedPermissionItem | null {
    return this.activeItem;
  }

  public get pendingCount(): number {
    return this.queue.length;
  }

  public enqueueBash(
    request: BashPermissionRequest,
    abortSignal?: AbortSignal,
  ): Promise<BashPermissionResponse> {
    return new Promise((resolve) => {
      if (abortSignal?.aborted) {
        return resolve({ allowed: false });
      }

      const item: QueuedPermissionItem = {
        id: `bash-${this.nextId++}`,
        kind: 'bash',
        request,
        resolve,
        abortSignal,
        settled: false,
      };

      this.enqueueItem(item);
    });
  }

  public enqueueFile(
    request: FilePermissionRequest,
    abortSignal?: AbortSignal,
  ): Promise<FilePermissionResponse> {
    return new Promise((resolve) => {
      if (abortSignal?.aborted) {
        return resolve({ allowed: false });
      }

      const item: QueuedPermissionItem = {
        id: `file-${this.nextId++}`,
        kind: 'file',
        request,
        resolve,
        abortSignal,
        settled: false,
      };

      this.enqueueItem(item);
    });
  }

  private enqueueItem(item: QueuedPermissionItem): void {
    if (item.abortSignal) {
      const abortHandler = () => {
        if (!item.settled) {
          this.cancelItem(item);
        }
      };
      item.abortSignal.addEventListener('abort', abortHandler, { once: true });
    }

    this.queue.push(item);
    if (!this.activeItem) {
      this.processNext();
    }
  }

  public resolveActive(allowed: boolean): void {
    const current = this.activeItem;
    if (!current || current.settled) {
      return;
    }

    current.settled = true;
    this.activeItem = null;
    this.onHide();

    current.resolve({ allowed } as any);
    this.processNext();
  }

  private cancelItem(item: QueuedPermissionItem): void {
    if (item.settled) return;

    if (this.activeItem === item) {
      item.settled = true;
      this.activeItem = null;
      this.onHide();
      item.resolve({ allowed: false } as any);
      this.processNext();
    } else {
      const idx = this.queue.indexOf(item);
      if (idx !== -1) {
        this.queue.splice(idx, 1);
      }
      item.settled = true;
      item.resolve({ allowed: false } as any);
    }
  }

  private processNext(): void {
    while (this.queue.length > 0) {
      const next = this.queue.shift()!;
      if (next.settled || next.abortSignal?.aborted) {
        if (!next.settled) {
          next.settled = true;
          next.resolve({ allowed: false } as any);
        }
        continue;
      }

      this.activeItem = next;
      this.onShow(next);
      return;
    }

    this.activeItem = null;
  }

  public clear(): void {
    if (this.activeItem && !this.activeItem.settled) {
      this.activeItem.settled = true;
      this.activeItem.resolve({ allowed: false } as any);
      this.activeItem = null;
      this.onHide();
    }

    while (this.queue.length > 0) {
      const item = this.queue.shift()!;
      if (!item.settled) {
        item.settled = true;
        item.resolve({ allowed: false } as any);
      }
    }
  }
}
